export type RoleType = "administration" | "chef_atelier" | "reception" | "chef_equipe";

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
  defaultTab: "chargement" | "suivi_entrees" | "plan_atelier";
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
