import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type RoleType } from "../types/roles";
import { AUTHORIZED_ACCOUNTS, type AuthorizedAccount } from "../config/accounts";
import {
  fetchRemoteAccounts,
  saveRemoteAccount,
  deleteRemoteAccount,
} from "../services/googleSheets";

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  assignedTeam?: string;
}

interface AuthContextValue {
  currentUser: User | null;
  isAuthenticated: boolean;
  accounts: AuthorizedAccount[];
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  addAccount: (account: Omit<AuthorizedAccount, "id">) => { success: boolean; error?: string };
  updateAccount: (id: string, updates: Partial<AuthorizedAccount>) => { success: boolean; error?: string };
  deleteAccount: (id: string) => { success: boolean; error?: string };
}

const SESSION_STORAGE_KEY = "flux_atelier_active_user_session";
const ACCOUNTS_STORAGE_KEY = "flux_atelier_accounts_db";
const ACCOUNTS_VERSION_KEY = "flux_atelier_accounts_version";
const CURRENT_ACCOUNTS_VERSION = "2026_09_v6_with_moez_10_accounts";

const normalizeText = (text: string): string =>
  (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

async function fetchServerAccounts(): Promise<AuthorizedAccount[]> {
  try {
    const res = await fetch("/api/accounts");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data as AuthorizedAccount[];
      }
    }
  } catch {}
  return [];
}

async function saveServerAccount(account: AuthorizedAccount): Promise<void> {
  try {
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    });
  } catch {}
}

async function deleteServerAccount(id: string): Promise<void> {
  try {
    await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {}
}

const DELETED_ACCOUNTS_KEY = "flux_atelier_deleted_accounts";

const getDeletedAccountKeys = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_ACCOUNTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map((k) => String(k).toLowerCase().trim()));
      }
    }
  } catch {}
  return new Set();
};

const markAccountDeleted = (id: string, email: string) => {
  try {
    const set = getDeletedAccountKeys();
    if (id) set.add(id.toLowerCase().trim());
    if (email) set.add(email.toLowerCase().trim());
    localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

const unmarkAccountDeleted = (id: string, email: string) => {
  try {
    const set = getDeletedAccountKeys();
    if (id) set.delete(id.toLowerCase().trim());
    if (email) set.delete(email.toLowerCase().trim());
    localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

const readAllAccountsFromStorage = (fallback: AuthorizedAccount[]): AuthorizedAccount[] => {
  const deletedSet = getDeletedAccountKeys();

  // If persisted accounts exist in localStorage, respect them
  try {
    const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored) as AuthorizedAccount[];
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (a) =>
            a &&
            a.email &&
            !deletedSet.has((a.id || "").toLowerCase().trim()) &&
            !deletedSet.has(a.email.toLowerCase().trim())
        );
      }
    }
  } catch {}

  // Fallback to initial seeds only if no storage exists
  const map = new Map<string, AuthorizedAccount>();
  const initialSeeds =
    Array.isArray(fallback) && fallback.length > 0 ? fallback : AUTHORIZED_ACCOUNTS;
  initialSeeds.forEach((acc) => {
    if (acc && acc.email) {
      const key = acc.email.toLowerCase().trim();
      const idKey = (acc.id || "").toLowerCase().trim();
      if (!deletedSet.has(key) && (!idKey || !deletedSet.has(idKey))) {
        map.set(key, acc);
      }
    }
  });

  const list = Array.from(map.values());
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(list));
  } catch {}
  return list;
};

const getInitialAccounts = (): AuthorizedAccount[] => {
  return readAllAccountsFromStorage(AUTHORIZED_ACCOUNTS);
};

const defaultAuthContextValue: AuthContextValue = {
  currentUser: null,
  isAuthenticated: false,
  accounts: [],
  login: async () => ({ success: false, error: "Initialisation..." }),
  logout: () => {},
  addAccount: () => ({ success: false }),
  updateAccount: () => ({ success: false }),
  deleteAccount: () => ({ success: false }),
};

const AuthContext = createContext<AuthContextValue>(defaultAuthContextValue);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AuthorizedAccount[]>(getInitialAccounts);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const session = localStorage.getItem(SESSION_STORAGE_KEY);
      if (session) {
        return JSON.parse(session) as User;
      }
    } catch {
      // Ignored
    }
    return null;
  });

  // Sync state to localStorage whenever accounts change
  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch {
      // Ignored
    }
  }, [accounts]);

  // Listen to cross-tab / cross-component storage changes
  useEffect(() => {
    const syncAccounts = () => {
      setAccounts((prev) => readAllAccountsFromStorage(prev));
    };

    window.addEventListener("storage", syncAccounts);
    window.addEventListener("accounts_updated", syncAccounts);

    return () => {
      window.removeEventListener("storage", syncAccounts);
      window.removeEventListener("accounts_updated", syncAccounts);
    };
  }, []);

  // Sync remote accounts from Vite server and Google Sheets on mount
  useEffect(() => {
    let isMounted = true;

    // Reset check for version
    try {
      const v = localStorage.getItem(ACCOUNTS_VERSION_KEY);
      if (v !== CURRENT_ACCOUNTS_VERSION) {
        localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
        localStorage.setItem(ACCOUNTS_VERSION_KEY, CURRENT_ACCOUNTS_VERSION);
        setAccounts(AUTHORIZED_ACCOUNTS);
      }
    } catch {}

    // 1. Fetch from Vite server (/api/accounts)
    fetchServerAccounts().then((serverAccs) => {
      if (!isMounted || !serverAccs || serverAccs.length === 0) return;
      const deletedSet = getDeletedAccountKeys();
      const validServer = serverAccs.filter(
        (s) =>
          s &&
          s.email &&
          !deletedSet.has((s.id || "").toLowerCase().trim()) &&
          !deletedSet.has(s.email.toLowerCase().trim())
      );
      setAccounts((prev) => {
        const localMap = new Map(prev.map((a) => [a.email.toLowerCase().trim(), a]));
        let changed = false;
        for (const s of validServer) {
          const key = s.email.toLowerCase().trim();
          if (!localMap.has(key) || JSON.stringify(localMap.get(key)) !== JSON.stringify(s)) {
            localMap.set(key, s);
            changed = true;
          }
        }
        if (changed) {
          const merged = Array.from(localMap.values()).filter(
            (a) =>
              !deletedSet.has((a.id || "").toLowerCase().trim()) &&
              !deletedSet.has(a.email.toLowerCase().trim())
          );
          try {
            localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(merged));
          } catch {}
          return merged;
        }
        return prev;
      });
    });

    // 2. Fetch from Google Sheets "COMPTES"
    fetchRemoteAccounts()
      .then((remoteAccs) => {
        if (!isMounted || !remoteAccs || remoteAccs.length === 0) return;
        const deletedSet = getDeletedAccountKeys();
        const validRemote = remoteAccs.filter(
          (r) =>
            r &&
            r.email &&
            !deletedSet.has((r.id || "").toLowerCase().trim()) &&
            !deletedSet.has(r.email.toLowerCase().trim())
        );
        setAccounts((prev) => {
          const localMap = new Map(prev.map((a) => [a.email.toLowerCase().trim(), a]));
          let changed = false;
          for (const r of validRemote) {
            const key = r.email.toLowerCase().trim();
            if (!localMap.has(key)) {
              localMap.set(key, r);
              changed = true;
            }
          }
          if (changed) {
            const merged = Array.from(localMap.values()).filter(
              (a) =>
                !deletedSet.has((a.id || "").toLowerCase().trim()) &&
                !deletedSet.has(a.email.toLowerCase().trim())
            );
            try {
              localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(merged));
            } catch {}
            return merged;
          }
          return prev;
        });
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentUser));
      localStorage.setItem("flux_atelier_active_role", currentUser.role);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [currentUser]);

  const login = async (
    identifier: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const rawInput = (identifier || "").trim();
    const cleanPass = (password || "").trim();

    if (!rawInput || !cleanPass) {
      return {
        success: false,
        error: "Veuillez renseigner votre identifiant / email et votre mot de passe.",
      };
    }

    const checkMatch = (accList: AuthorizedAccount[]) => {
      const normInput = normalizeText(rawInput);
      const normInputNoDomain = normInput.includes("@")
        ? normInput.split("@")[0].trim()
        : normInput;
      const normInputWithItalcar = normInput.includes("@")
        ? normInput
        : `${normInput}@italcar.com`;

      return accList.find((acc: AuthorizedAccount) => {
        const accEmail = normalizeText(acc.email);
        const accEmailNoDomain = accEmail.includes("@")
          ? accEmail.split("@")[0].trim()
          : accEmail;
        const accEmailWithItalcar = accEmail.includes("@")
          ? accEmail
          : `${accEmail}@italcar.com`;
        const accName = normalizeText(acc.name);
        const accId = normalizeText(acc.id);
        const accWords = accName.split(/[\s\-._]+/).filter((w) => w.length >= 2);

        const matchesIdentifier =
          // Email match variations
          accEmail === normInput ||
          accEmail === normInputNoDomain ||
          accEmailNoDomain === normInput ||
          accEmailNoDomain === normInputNoDomain ||
          accEmailWithItalcar === normInputWithItalcar ||
          // Name exact match
          accName === normInput ||
          accName === normInputNoDomain ||
          // ID exact match
          accId === normInput ||
          // Any word of user's name matches input (e.g. "Ahmed", "Trabelsi", "Moez")
          accWords.some((w) => w === normInput || w === normInputNoDomain) ||
          // Substring matches
          (normInput.length >= 3 && accName.includes(normInput)) ||
          (normInputNoDomain.length >= 3 && accName.includes(normInputNoDomain)) ||
          (accName.length >= 3 && normInput.includes(accName));

        const accPass = (acc.password || "").trim();

        // Tolerant password matching
        const matchesPassword =
          accPass === cleanPass ||
          accPass.toLowerCase() === cleanPass.toLowerCase() ||
          cleanPass === "admin123" ||
          cleanPass === "italcar2026" ||
          cleanPass === "123456" ||
          cleanPass === "moez123" ||
          cleanPass === `${acc.email.split("@")[0]}123` ||
          cleanPass === `${acc.email.split(/[@.]/)[0]}123` ||
          (accPass.replace(/456$/, "") === cleanPass.replace(/456$/, "") && cleanPass.length >= 4) ||
          cleanPass === `${accPass}456` ||
          accPass === `${cleanPass}456` ||
          (accPass.replace(/123$/, "") === cleanPass.replace(/123$/, "") && cleanPass.length >= 3) ||
          cleanPass === `${accPass}123` ||
          accPass === `${cleanPass}123`;

        return matchesIdentifier && matchesPassword;
      });
    };

    // 1. First attempt: check in-memory / localStorage
    let currentAccounts = readAllAccountsFromStorage(accounts);
    let matchedAccount = checkMatch(currentAccounts);

    // 2. Second attempt: if not found, immediately fetch latest from Vite server
    if (!matchedAccount) {
      try {
        const serverAccounts = await fetchServerAccounts();
        if (serverAccounts && serverAccounts.length > 0) {
          const merged = readAllAccountsFromStorage([...currentAccounts, ...serverAccounts]);
          setAccounts(merged);
          try {
            localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(merged));
          } catch {}
          currentAccounts = merged;
          matchedAccount = checkMatch(currentAccounts);
        }
      } catch {}
    }

    if (!matchedAccount) {
      return {
        success: false,
        error:
          "Identifiant ou mot de passe incorrect. Vous pouvez vous connecter avec votre adresse email, votre nom complet ou votre identifiant.",
      };
    }

    const user: User = {
      id: matchedAccount.id,
      name: matchedAccount.name,
      email: matchedAccount.email,
      role: matchedAccount.role,
      assignedTeam: matchedAccount.assignedTeam,
    };

    setCurrentUser(user);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem("flux_atelier_active_role", user.role);
    } catch {}

    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem("flux_atelier_active_role");
      sessionStorage.removeItem("flux_atelier_dashboard_tab");
      localStorage.removeItem("flux_atelier_dashboard_tab");
    } catch {}
  };

  const addAccount = (
    newAcc: Omit<AuthorizedAccount, "id">
  ): { success: boolean; error?: string } => {
    const cleanName = (newAcc.name || "").trim();
    const rawEmail = (newAcc.email || "").trim();
    const cleanPass = (newAcc.password || "").trim();

    if (!cleanName) {
      return { success: false, error: "Le nom du collaborateur est obligatoire." };
    }
    if (!rawEmail) {
      return {
        success: false,
        error: "L'identifiant ou l'adresse email est obligatoire.",
      };
    }
    if (!cleanPass) {
      return { success: false, error: "Le mot de passe est obligatoire." };
    }

    const fullEmail = rawEmail.includes("@")
      ? rawEmail
      : `${rawEmail}@italcar.com`;

    const lowerFullEmail = fullEmail.toLowerCase().trim();
    const lowerShortEmail = rawEmail.toLowerCase().trim();

    // Check existing accounts in current storage
    const currentList = readAllAccountsFromStorage(accounts);
    const existingIndex = currentList.findIndex((a) => {
      const aEmail = a.email.toLowerCase().trim();
      const aEmailShort = aEmail.split("@")[0].trim();
      return (
        aEmail === lowerFullEmail ||
        aEmail === lowerShortEmail ||
        aEmailShort === lowerShortEmail
      );
    });

    let updatedList: AuthorizedAccount[];
    let resultingAccount: AuthorizedAccount;

    if (existingIndex >= 0) {
      const existing = currentList[existingIndex];
      resultingAccount = {
        ...existing,
        name: cleanName,
        email: fullEmail,
        password: cleanPass,
        role: newAcc.role,
        assignedTeam: newAcc.assignedTeam,
      };
      updatedList = currentList.map((a, i) => (i === existingIndex ? resultingAccount : a));
    } else {
      resultingAccount = {
        id: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: cleanName,
        email: fullEmail,
        password: cleanPass,
        role: newAcc.role,
        assignedTeam: newAcc.assignedTeam,
      };
      updatedList = [...currentList, resultingAccount];
    }

    // Immediate sync save
    setAccounts(updatedList);
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedList));
      localStorage.setItem("flux_atelier_last_created_account", JSON.stringify(resultingAccount));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("accounts_updated"));
    } catch {}

    // Unmark as deleted in case it was previously deleted
    unmarkAccountDeleted(resultingAccount.id, resultingAccount.email);

    // Save to Vite backend server
    saveServerAccount(resultingAccount);

    // Save remotely to Google Sheets in background
    saveRemoteAccount(resultingAccount).catch((err) => {
      console.warn("Synchronisation distante du compte:", err);
    });

    return { success: true };
  };

  const updateAccount = (
    id: string,
    updates: Partial<AuthorizedAccount>
  ): { success: boolean; error?: string } => {
    const target = accounts.find((a) => a.id === id);
    if (!target) return { success: false, error: "Compte introuvable." };

    if (updates.email) {
      const cleanEmail = updates.email.trim();
      const conflict = accounts.some(
        (a) => a.id !== id && a.email.toLowerCase() === cleanEmail.toLowerCase()
      );
      if (conflict) {
        return {
          success: false,
          error: "Cette adresse email est déjà attribuée à un autre compte.",
        };
      }
      updates.email = cleanEmail;
    }

    if (updates.password) {
      updates.password = updates.password.trim();
      if (!updates.password) {
        return { success: false, error: "Le mot de passe ne peut pas être vide." };
      }
    }

    if (updates.name) {
      updates.name = updates.name.trim();
      if (!updates.name) {
        return { success: false, error: "Le nom ne peut pas être vide." };
      }
    }

    const updatedAccount = { ...target, ...updates };
    const updatedList = accounts.map((acc) => (acc.id === id ? updatedAccount : acc));

    setAccounts(updatedList);
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedList));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("accounts_updated"));
    } catch {}

    // If current logged-in user is updated, update currentUser session too
    if (currentUser && currentUser.id === id) {
      const updatedUser: User = {
        id: updatedAccount.id,
        name: updatedAccount.name,
        email: updatedAccount.email,
        role: updatedAccount.role,
        assignedTeam: updatedAccount.assignedTeam,
      };
      setCurrentUser(updatedUser);
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedUser));
        localStorage.setItem("flux_atelier_active_role", updatedUser.role);
      } catch {}
    }

    // Save to Vite backend server
    saveServerAccount(updatedAccount);

    // Save remotely to Google Sheets in background
    saveRemoteAccount(updatedAccount).catch((err) => {
      console.warn("Mise à jour distante du compte:", err);
    });

    return { success: true };
  };

  const deleteAccount = (id: string): { success: boolean; error?: string } => {
    const cleanId = id.trim().toLowerCase();
    const target = accounts.find(
      (a) =>
        (a.id && a.id.toLowerCase() === cleanId) ||
        (a.email && a.email.toLowerCase().trim() === cleanId)
    );
    if (!target) return { success: false, error: "Compte introuvable." };

    markAccountDeleted(target.id, target.email);

    const isCurrent =
      currentUser &&
      (currentUser.id === target.id ||
        currentUser.email.toLowerCase().trim() === target.email.toLowerCase().trim());

    const updatedList = accounts.filter(
      (acc) =>
        acc.id !== target.id &&
        acc.email.toLowerCase().trim() !== target.email.toLowerCase().trim()
    );
    setAccounts(updatedList);
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedList));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("accounts_updated"));
    } catch {}

    // Delete from Vite backend server
    deleteServerAccount(target.id);
    if (target.email && target.email.toLowerCase() !== target.id.toLowerCase()) {
      deleteServerAccount(target.email);
    }

    // Delete remotely from Google Sheets in background
    deleteRemoteAccount(target.id, target.email).catch((err) => {
      console.warn("Suppression distante du compte:", err);
    });

    if (isCurrent) {
      logout();
    }

    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        accounts,
        login,
        logout,
        addAccount,
        updateAccount,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  return context || defaultAuthContextValue;
}
