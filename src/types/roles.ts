export type RoleType = "administration" | "chef_atelier" | "reception" | "chef_equipe" | "facturation" | "garantie";

export interface RolePermissions {
  canViewAll: boolean;
  canEditChargement: boolean;
  canAddEntree: boolean;
  canEditEmplacement: boolean;
  canEditEtat: boolean;
  canEditAvancement: boolean;
  canViewMap: boolean;
  canViewAttenteAchat: boolean;
  canViewDevis: boolean;
  canViewSuiviTemps: boolean;
  canViewEssai: boolean;
  canViewFacturation: boolean;
  /** Consultation de tous les dossiers Facturation, sans élargir les autres pages atelier. */
  canViewAllFacturation?: boolean;
  canManageEquipes?: boolean;
  canViewGarantie?: boolean;
  defaultTab: "chargement" | "suivi_entrees" | "plan_atelier" | "facturation" | "garantie";
}

export interface RoleInfo {
  id: RoleType;
  title: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  accentColor: string;
  permissions: RolePermissions;
}
