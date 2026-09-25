import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { type RoleType, type RolePermissions, type RoleInfo } from "../types/roles";

export type { RoleType, RolePermissions, RoleInfo };

export const ROLES_META: Record<RoleType, RoleInfo> = {
  administration: {
    id: "administration",
    title: "Administration",
    description: "Administration globale & gestion complète du système",
    badgeBg: "bg-rose-100 text-rose-800 border-rose-300",
    badgeText: "Administration",
    accentColor: "#e11d48",
    permissions: {
      canViewAll: true,
      canEditChargement: true,
      canAddEntree: true,
      canEditEmplacement: true,
      canEditEtat: true,
      canViewMap: true,
      defaultTab: "chargement",
    },
  },
  chef_atelier: {
    id: "chef_atelier",
    title: "Chef Atelier",
    description: "Supervision globale & modifications complètes",
    badgeBg: "bg-purple-100 text-purple-800 border-purple-300",
    badgeText: "Chef d'Atelier",
    accentColor: "#7c3aed",
    permissions: {
      canViewAll: true,
      canEditChargement: true,
      canAddEntree: true,
      canEditEmplacement: true,
      canEditEtat: true,
      canViewMap: true,
      defaultTab: "chargement",
    },
  },
  reception: {
    id: "reception",
    title: "Réception",
    description: "Ajout et gestion du Suivi des entrées véhicules",
    badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-300",
    badgeText: "Réception",
    accentColor: "#059669",
    permissions: {
      canViewAll: true,
      canEditChargement: false,
      canAddEntree: true,
      canEditEmplacement: false,
      canEditEtat: false,
      canViewMap: false,
      defaultTab: "suivi_entrees",
    },
  },
  chef_equipe: {
    id: "chef_equipe",
    title: "Chef d'Équipe",
    description: "Gestion des Tableaux de chargement & affectation atelier",
    badgeBg: "bg-blue-100 text-blue-800 border-blue-300",
    badgeText: "Chef d'Équipe",
    accentColor: "#2563eb",
    permissions: {
      canViewAll: false,
      canEditChargement: true,
      canAddEntree: false,
      canEditEmplacement: true,
      canEditEtat: true,
      canViewMap: false,
      defaultTab: "chargement",
    },
  },
};

interface RoleContextValue {
  role: RoleType;
  roleInfo: RoleInfo;
  permissions: RolePermissions;
  setRole: (role: RoleType) => void;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = "flux_atelier_active_role";

export function RoleProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [role, setRoleState] = useState<RoleType>(() => {
    if (currentUser && currentUser.role in ROLES_META) {
      return currentUser.role;
    }
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) as RoleType | null;
    if (saved && saved in ROLES_META) {
      return saved;
    }
    return "chef_atelier";
  });

  // Sync role immediately whenever currentUser changes
  useEffect(() => {
    if (currentUser && currentUser.role in ROLES_META) {
      setRoleState(currentUser.role);
    }
  }, [currentUser]);

  const setRole = (newRole: RoleType) => {
    // Role is strictly locked to the authenticated user's assigned role
    if (currentUser && currentUser.role in ROLES_META) {
      setRoleState(currentUser.role);
      localStorage.setItem(LOCAL_STORAGE_KEY, currentUser.role);
      return;
    }
    setRoleState(newRole);
    localStorage.setItem(LOCAL_STORAGE_KEY, newRole);
  };

  useEffect(() => {
    if (currentUser && currentUser.role in ROLES_META) {
      localStorage.setItem(LOCAL_STORAGE_KEY, currentUser.role);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, role);
    }
  }, [role, currentUser]);

  const roleInfo = ROLES_META[role];

  return (
    <RoleContext.Provider
      value={{
        role,
        roleInfo,
        permissions: roleInfo.permissions,
        setRole,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}
