import { type RoleType } from "../types/roles";

export interface AuthorizedAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: RoleType;
  assignedTeam?: string;
}

/**
 * LISTE DES COMPTES AUTORISÉS À ACCÉDER À L'APPLICATION
 * 10 comptes correspondant à la structure complète d'Atelier Italcar :
 * - 1 Direction / Administration
 * - 1 Chef d'Atelier
 * - 1 Réception
 * - 7 Chefs d'Équipe (Daily1, Service Rapide, Daily2, Lourd, Changan, Carrosserie, Elictrique)
 */
export const AUTHORIZED_ACCOUNTS: AuthorizedAccount[] = [
  {
    id: "acc_admin",
    name: "Direction / Administration",
    email: "admin@italcar.com",
    password: "admin123",
    role: "administration",
  },
  {
    id: "acc_mehdi_mefteh",
    name: "Mehdi Mefteh",
    email: "mehdi@italcar.com",
    password: "mehdi123",
    role: "chef_atelier",
  },
  {
    id: "acc_reception_zar",
    name: "Zar",
    email: "abdelkarimezzar@gmail.com",
    password: "123456",
    role: "reception",
    assignedTeam: "Daily1",
  },
  {
    id: "acc_wajih_daily1",
    name: "Chef Équipe Daily1",
    email: "wajih@italcar.com",
    password: "wajih123",
    role: "chef_equipe",
    assignedTeam: "Daily1",
  },
  {
    id: "acc_moez_trabelsi",
    name: "Moez Trabelsi",
    email: "moez.trabelsi@italcar.com",
    password: "moez123",
    role: "chef_equipe",
    assignedTeam: "Service Rapide",
  },
  {
    id: "acc_chef_daily2",
    name: "Chef Équipe Daily2",
    email: "daily2@italcar.com",
    password: "daily123",
    role: "chef_equipe",
    assignedTeam: "Daily2",
  },
  {
    id: "acc_ala_lourd",
    name: "Chef Équipe Lourd",
    email: "ala@italcar.com",
    password: "ala123",
    role: "chef_equipe",
    assignedTeam: "Lourd",
  },
  {
    id: "acc_amen_allah_changan",
    name: "Chef Équipe Changan",
    email: "amen.allah@italcar.com",
    password: "amenallah123",
    role: "chef_equipe",
    assignedTeam: "Changan",
  },
  {
    id: "acc_khalil_carrosserie",
    name: "Chef Équipe Carrosserie",
    email: "khalil@italcar.com",
    password: "khalil123",
    role: "chef_equipe",
    assignedTeam: "Carrosserie",
  },
  {
    id: "acc_salim_elictrique",
    name: "Chef Équipe Elictrique",
    email: "salim@italcar.com",
    password: "salim123",
    role: "chef_equipe",
    assignedTeam: "Elictrique",
  },
];
