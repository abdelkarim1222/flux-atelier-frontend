import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RolePermissions, RoleType } from '../types/roles';
import type { AuthorizedAccount } from '../config/accounts';
import { apiRequest, hydrateSqlLocalCache } from '../services/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  assignedTeam?: string;
  customPermissions?: Partial<RolePermissions>;
}

interface AccountInput extends Omit<AuthorizedAccount, 'id'> {
  id?: string;
}

interface AuthContextValue {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accounts: AuthorizedAccount[];
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  addAccount: (account: AccountInput) => Promise<{ success: boolean; error?: string }>;
  updateAccount: (id: string, updates: Partial<AuthorizedAccount>) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: (id: string) => Promise<{ success: boolean; error?: string }>;
}

const SESSION_STORAGE_KEY = 'flux_atelier_active_user_session';

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  accounts: [],
  login: async () => ({ success: false, error: 'Initialisation…' }),
  logout: async () => {},
  addAccount: async () => ({ success: false }),
  updateAccount: async () => ({ success: false }),
  deleteAccount: async () => ({ success: false }),
});

function asUser(value: AuthorizedAccount | User): User {
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    role: value.role,
    assignedTeam: value.assignedTeam,
    customPermissions: value.customPermissions,
  };
}

async function loadAccounts(): Promise<AuthorizedAccount[]> {
  return apiRequest<AuthorizedAccount[]>('/api/accounts');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<AuthorizedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAccounts = useCallback(async () => {
    try {
      setAccounts(await loadAccounts());
    } catch {
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<{ user: User | null }>('/api/auth/me')
      .then(async ({ user }) => {
        if (!active) return;
        if (!user) {
          setCurrentUser(null);
          localStorage.removeItem(SESSION_STORAGE_KEY);
          return;
        }
        setCurrentUser(user);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem('flux_atelier_active_role', user.role);
        await hydrateSqlLocalCache(user.role);
        if (user.role === 'administration' || user.role === 'chef_atelier') {
          await refreshAccounts();
        }
      })
      .catch(() => {
        if (!active) return;
        setCurrentUser(null);
        localStorage.removeItem(SESSION_STORAGE_KEY);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [refreshAccounts]);

  const login: AuthContextValue['login'] = async (identifier, password) => {
    if (!identifier.trim() || !password) {
      return { success: false, error: 'Veuillez renseigner votre identifiant / email et votre mot de passe.' };
    }
    try {
      const response = await apiRequest<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const user = asUser(response.user);
      setCurrentUser(user);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem('flux_atelier_active_role', user.role);
      await hydrateSqlLocalCache(user.role);
      if (user.role === 'administration' || user.role === 'chef_atelier') await refreshAccounts();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connexion impossible.' };
    }
  };

  const logout = async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); } catch {}
    setCurrentUser(null);
    setAccounts([]);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('flux_atelier_active_role');
    sessionStorage.removeItem('flux_atelier_dashboard_tab');
    localStorage.removeItem('flux_atelier_dashboard_tab');
  };

  const addAccount: AuthContextValue['addAccount'] = async (account) => {
    const name = account.name.trim();
    const emailInput = account.email.trim();
    const email = emailInput.includes('@') ? emailInput : `${emailInput}@italcar.com`;
    if (!name || !emailInput || !account.password.trim()) {
      return { success: false, error: 'Nom, identifiant et mot de passe sont obligatoires.' };
    }
    try {
      await apiRequest('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({ ...account, name, email }),
      });
      await refreshAccounts();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Création impossible.' };
    }
  };

  const updateAccount: AuthContextValue['updateAccount'] = async (id, updates) => {
    try {
      const response = await apiRequest<{ account: AuthorizedAccount }>(`/api/accounts/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      await refreshAccounts();
      if (currentUser?.id === id) {
        const user = asUser(response.account);
        setCurrentUser(user);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem('flux_atelier_active_role', user.role);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Modification impossible.' };
    }
  };

  const deleteAccount: AuthContextValue['deleteAccount'] = async (id) => {
    try {
      await apiRequest(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refreshAccounts();
      if (currentUser?.id === id) await logout();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Suppression impossible.' };
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAuthenticated: Boolean(currentUser),
      isLoading,
      accounts,
      login,
      logout,
      addAccount,
      updateAccount,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
