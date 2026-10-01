import type { RolePermissions, RoleType } from '../types/roles';

export interface AuthorizedAccount {
  id: string;
  name: string;
  email: string;
  /** Mot de passe vide dans les réponses API : seuls les empreintes restent en PostgreSQL. */
  password: string;
  role: RoleType;
  assignedTeam?: string;
  customPermissions?: Partial<RolePermissions>;
}

/** Les comptes sont désormais chargés depuis PostgreSQL et ne sont pas embarqués dans le bundle client. */
export const AUTHORIZED_ACCOUNTS: AuthorizedAccount[] = [];
