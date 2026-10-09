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
      canEditAvancement: true,
      canViewMap: true,
      canViewAttenteAchat: true,
      canViewDevis: true,
      canViewSuiviTemps: true,
      canViewEssai: true,
      canViewFacturation: true,
      canViewGarantie: true,
      canManageEquipes: true,
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
      canEditAvancement: true,
      canViewMap: true,
      canViewAttenteAchat: true,
      canViewDevis: true,
      canViewSuiviTemps: true,
      canViewEssai: true,
      canViewFacturation: true,
      canViewGarantie: true,
      canManageEquipes: true,
      defaultTab: "chargement",
    },
  },
  reception: {
    id: "reception",
    title: "Réception",
    description: "Ajout et gestion du Suivi des entrées véhicules, Devis & Avancement Atelier",
    badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-300",
    badgeText: "Réception",
    accentColor: "#059669",
    permissions: {
      canViewAll: false,
      canEditChargement: false,
      canAddEntree: true,
      // Le positionnement est partagé : la réception doit pouvoir signaler la
      // place réelle d'un véhicule depuis un téléphone comme depuis un PC.
      canEditEmplacement: true,
      canEditEtat: false,
      canEditAvancement: false,  // Réception ne peut pas modifier l'avancement atelier
      canViewMap: true,          // Accessible à tous les rôles
      canViewAttenteAchat: false, // Interdit pour Réception
      canViewDevis: true,        // Consultable & géré par Réception (appels clients, relance 24h, refus)
      canViewSuiviTemps: false,   // Interdit pour Réception (Réservé Administration & Chef Atelier)
      canViewEssai: false,        // Réception ne peut pas consulter
      canViewFacturation: false,
      canManageEquipes: false,
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
      canEditAvancement: true,
      canViewMap: true,          // Accessible à tous les rôles
      canViewAttenteAchat: false, // Interdit pour Chef d'Équipe (Masqué du menu + Redirection)
      canViewDevis: false,       // Masqué du menu Chef d'Équipe (géré par Réception/Admin)
      canViewSuiviTemps: false,  // Interdit pour Chef d'Équipe (Réservé Administration & Chef Atelier)
      canViewEssai: true,        // Consultable par Chef d'Équipe
      canViewFacturation: false,
      canManageEquipes: false,
      defaultTab: "chargement",
    },
  },
  facturation: {
    id: "facturation",
    title: "Facturation",
    description: "Validation des modes de paiement, facturation & autorisations de sortie",
    badgeBg: "bg-amber-100 text-amber-800 border-amber-300",
    badgeText: "Facturation",
    accentColor: "#d97706",
    permissions: {
      canViewAll: false,
      canEditChargement: false,
      canAddEntree: false,
      // Même règle que pour les autres utilisateurs connectés : la place
      // réelle peut être mise à jour directement sur le plan.
      canEditEmplacement: true,
      canEditEtat: false,
      canEditAvancement: false,
      canViewMap: true,          // Accessible à tous les rôles
      canViewAttenteAchat: false,
      canViewDevis: false,
      canViewSuiviTemps: false,
      canViewEssai: false,
      canViewFacturation: true,
      canManageEquipes: false,
      defaultTab: "facturation",
    },
  },
  garantie: {
    id: "garantie",
    title: "Service Garantie",
    description: "Création et gestion des ORs de garantie (R10) et suivi du Tableau Garantie",
    badgeBg: "bg-teal-100 text-teal-800 border-teal-300",
    badgeText: "Garantie (R10)",
    accentColor: "#0d9488",
    permissions: {
      canViewAll: false,
      canEditChargement: false,
      canAddEntree: true, // Ouvre des ORs comme réception
      // Le serveur autorise le changement d'emplacement à tout utilisateur
      // connecté ; ne pas bloquer cette action uniquement dans l'interface.
      canEditEmplacement: true,
      canEditEtat: false,
      canEditAvancement: false,
      canViewMap: true,
      canViewAttenteAchat: false,
      canViewDevis: false,
      canViewSuiviTemps: false,
      canViewEssai: false,
      canViewFacturation: false,
      canViewGarantie: true,
      canManageEquipes: false,
      defaultTab: "suivi_entrees",
    },
  },
};

interface RoleContextValue {
  role: RoleType;
  roleInfo: RoleInfo;
  permissions: RolePermissions;
  setRole: (role: RoleType) => void;
}

const defaultRole: RoleType = "chef_atelier";
const defaultRoleValue: RoleContextValue = {
  role: defaultRole,
  roleInfo: ROLES_META[defaultRole],
  permissions: ROLES_META[defaultRole].permissions,
  setRole: () => {},
};

const RoleContext = createContext<RoleContextValue>(defaultRoleValue);

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

  const roleInfo = ROLES_META[role] || ROLES_META[defaultRole];
  const permissions: RolePermissions = {
    ...roleInfo.permissions,
    ...(currentUser?.customPermissions || {}),
  };

  return (
    <RoleContext.Provider
      value={{
        role,
        roleInfo,
        permissions,
        setRole,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  return context || defaultRoleValue;
}
