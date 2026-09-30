import {
  statusMeta,
  type Flux,
  type WorkshopStatus,
} from "../data/mockData";

import { FULL_PARKING_EMPLACEMENT, calculerEmplacementAutomatique } from "./emplacementService";

export const DELIVERED_EMPLACEMENT = "Livraison au client";

function persistSqlSnapshot(collection: string, value: Record<string, unknown> | unknown[]): void {
  if (typeof window === "undefined") return;
  const records = Array.isArray(value)
    ? value.map((record) => {
        if (collection !== "teams" || !record || typeof record !== "object") return record;
        const member = record as Record<string, unknown>;
        const key = String(member.team || "") + ":" + String(member.matricule || member.name || "");
        return { ...member, recordKey: key };
      })
    : Object.entries(value).map(([recordKey, record]) => ({ ...(record as Record<string, unknown>), recordKey }));
  void fetch("/api/data/" + encodeURIComponent(collection), {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(records),
  }).then((response) => { if (!response.ok) throw new Error("HTTP " + response.status); })
    .catch((error) => console.warn("Écriture PostgreSQL (" + collection + ") impossible:", error));
}

function deleteSqlRecord(collection: string, key: string): void {
  if (typeof window === "undefined" || !key) return;
  void fetch("/api/data/" + encodeURIComponent(collection) + "/" + encodeURIComponent(key), {
    method: "DELETE", credentials: "same-origin",
  }).catch((error) => console.warn("Suppression PostgreSQL (" + collection + ") impossible:", error));
}

async function callDatabaseAction<T extends { ok?: boolean; error?: string }>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/api/actions", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, action }),
  });
  const result = await response.json() as T;
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || "L’action PostgreSQL « " + action + " » a échoué.");
  }
  return result;
}

export interface SuiviEntree {
  id: number;
  sheetRowNumber: number;
  noOr: string;
  cs: string;
  chassis: string;
  immatriculation?: string;
  codeClient: string;
  nomClient: string;
  dateEntreeHeure: string;
  marque: string;
  modele: string;
  categorie: string;
  equipe: string;
  technicien: string;
  nomTechnicien: string;
  dateDebutRep: string;
  avancement: string;
  dateFinRep: string;
  heureFin: string;
  etat: string;
  retourClient: string;
  /** Emplacement provenant du suivi des entrées, affiché sur le plan atelier. */
  emplacement?: string;
}

const emplacementAliases = new Map([
  ["J1", "J11"],
  ["J2", "J21"],
  ["J3", "J31"],
  ["J4", "J41"],
  ["J5", "J51"],
  ["J6", "J61"],
]);

const outsideMapEmplacements = new Set([
  "AUCUNEPLACEDISPONIBLE",
  "LIVRAISONAUCLIENT",
  "PARCCOMPLET",
  "PARCPLEIN",
  "PLACECOMPLET",
  "PLACECOMPLETE",
]);

export function normalizeSheetEmplacement(value: string) {
  const normalizedValue = String(value || "").toUpperCase().trim().replace(/\s/g, "");

  if (!normalizedValue || normalizedValue === "NA" || normalizedValue.startsWith("#")) {
    return "NA";
  }

  if (normalizedValue === "LIVRAISONAUCLIENT" || normalizedValue.includes("LIVR")) {
    return DELIVERED_EMPLACEMENT;
  }

  if (normalizedValue.includes("COMPLET") || normalizedValue.includes("PLEIN")) {
    return FULL_PARKING_EMPLACEMENT;
  }

  return emplacementAliases.get(normalizedValue) ?? normalizedValue;
}

export function isSheetEmplacementOutsideMap(value: string) {
  const normalizedValue = String(value || "").toUpperCase().trim().replace(/\s/g, "");

  return (
    !normalizedValue ||
    normalizedValue === "NA" ||
    normalizedValue.startsWith("#") ||
    outsideMapEmplacements.has(normalizedValue)
  );
}

export async function fetchDatabaseFluxData() {
  const response = await fetch('/api/data/flux', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Impossible de récupérer les véhicules depuis PostgreSQL.');
  return await response.json() as Flux[];
}

export async function fetchSuiviEntreesData() {
  const response = await fetch('/api/data/reception', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Impossible de récupérer le suivi des entrées depuis PostgreSQL.');
  return await response.json() as SuiviEntree[];
}

export interface EquipeMember {
  team: string;
  /** Équipe principale de rattachement. */
  name: string;
  poste: string;
  matricule: string;
  /** Équipes ou spécialités complémentaires (ex. Changan, JMC). */
  equipesSupplementaires?: string[];
  /** Autorise le calcul des heures atelier le samedi matin pour ce technicien. */
  travailleSamedi?: boolean;
}

/** Retourne l'équipe principale et les habilitations complémentaires d'un membre. */
export function getMemberTeams(member: Pick<EquipeMember, "team" | "equipesSupplementaires">): string[] {
  return Array.from(new Set([
    member.team,
    ...(Array.isArray(member.equipesSupplementaires) ? member.equipesSupplementaires : []),
  ].map((team) => String(team || "").trim()).filter(Boolean)));
}

export interface EquipeSheetResult {
  members: EquipeMember[];
  chefsEquipe: EquipeMember[];
  teamByMemberName: Map<string, string>;
}

export const DEFAULT_EQUIPE_MAPPINGS: EquipeMember[] = [
  // 1. Daily1 (6 collaborateurs)
  { team: "Daily1", name: "WAJIH TOUIL", poste: "CHEF EQUIPE", matricule: "8701" },
  { team: "Daily1", name: "Montassar Bjaoui", poste: "MECANICIEN", matricule: "1214" },
  { team: "Daily1", name: "MOUHAMED SAMI BEN SALEM", poste: "MECANICIEN", matricule: "1482" },
  { team: "Daily1", name: "BELGACEM RAHAL", poste: "MECANICIEN", matricule: "3191" },
  { team: "Daily1", name: "SOFIENE AOUINI", poste: "MECANICIEN", matricule: "8010" },
  { team: "Daily1", name: "Samir Rached", poste: "MECANICIEN", matricule: "8846" },

  // 2. Service Rapide
  { team: "Service Rapide", name: "Moez Trabelsi", poste: "CHEF EQUIPE", matricule: "1045" },
  { team: "Service Rapide", name: "Helmi Manai", poste: "MECANICIEN", matricule: "1508" },

  // 3. Daily2
  { team: "Daily2", name: "Mourad Menjli", poste: "CHEF EQUIPE", matricule: "3004" },
  { team: "Daily2", name: "Mohamed Hamdaoui", poste: "MECANICIEN", matricule: "8731" },

  // 4. Lourd
  { team: "Lourd", name: "Ala Mezlini", poste: "CHEF EQUIPE", matricule: "8820" },
  { team: "Lourd", name: "Rami mekni", poste: "MECANICIEN", matricule: "8843" },
  { team: "Lourd", name: "Abdelkarim ben Karouia", poste: "MECANICIEN", matricule: "1215" },
  { team: "Lourd", name: "Ibrahim Laribi", poste: "MECANICIEN", matricule: "1421" },
  { team: "Lourd", name: "FERES SELLIMI", poste: "MECANICIEN", matricule: "9527" },
  { team: "Lourd", name: "Hazem Fatnassi", poste: "MECANICIEN", matricule: "8874" },

  // 5. Changan
  { team: "Changan", name: "Amen Allah Amara", poste: "CHEF EQUIPE", matricule: "9484" },
  { team: "Changan", name: "Khalil Jabeur", poste: "MECANICIEN", matricule: "8877" },

  // 6. Carrosserie
  { team: "Carrosserie", name: "Khalil Ben Amara", poste: "CHEF EQUIPE", matricule: "8841" },
  { team: "Carrosserie", name: "Rami JARRAS", poste: "TOLLIER", matricule: "3210" },

  // 7. Elictrique
  { team: "Elictrique", name: "SALIM BOUSHIH", poste: "CHEF EQUIPE", matricule: "1433" },
  { team: "Elictrique", name: "OMAR ZINAOUI", poste: "ELECTRICIEN", matricule: "9999" },
];

export function normalizePersonName(name: string): string {
  return String(name || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function getTeamForChefEquipe(
  userNameOrEmail?: string,
  teamByMemberName?: Map<string, string>
): string {
  if (!userNameOrEmail) return "Daily1";
  const clean = normalizePersonName(userNameOrEmail);

  // 1. Direct match in provided map
  if (teamByMemberName && teamByMemberName.size > 0) {
    if (teamByMemberName.has(clean)) {
      return teamByMemberName.get(clean)!;
    }
    for (const [key, team] of teamByMemberName.entries()) {
      if (clean.includes(key) || key.includes(clean)) {
        return team;
      }
    }
  }

  // 2. Fallback check against default members
  for (const m of DEFAULT_EQUIPE_MAPPINGS) {
    const memberNorm = normalizePersonName(m.name);
    if (clean.includes(memberNorm) || memberNorm.includes(clean)) {
      return m.team;
    }
  }

  // 3. Keyword fallback
  if (clean.includes("DAILY2") || clean.includes("MOURAD")) return "Daily2";
  if (clean.includes("LOURD") || clean.includes("MEZLINI")) return "Lourd";
  if (clean.includes("SERVICE RAPIDE") || clean.includes("RAPIDE") || clean.includes("TRABELSI")) return "Service Rapide";
  if (clean.includes("CARROSSERIE") || clean.includes("BEN AMARA")) return "Carrosserie";
  if (clean.includes("ELECTRIQUE") || clean.includes("ELICTRIQUE") || clean.includes("BOUSHIH")) return "Elictrique";
  if (clean.includes("CHANGAN")) return "Changan";
  return "Daily1";
}

const CUSTOM_EQUIPES_KEY = "flux_atelier_equipes_custom";

export function getCustomEquipeMembers(): EquipeMember[] | null {
  if (typeof window === "undefined") return DEFAULT_EQUIPE_MAPPINGS;
  try {
    const raw = localStorage.getItem(CUSTOM_EQUIPES_KEY);
    if (!raw) return DEFAULT_EQUIPE_MAPPINGS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Ignored
  }
  return DEFAULT_EQUIPE_MAPPINGS;
}

export function saveCustomEquipeMembers(members: EquipeMember[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_EQUIPES_KEY, JSON.stringify(members));
    window.dispatchEvent(new CustomEvent("flux_equipes_updated", { detail: members }));
    window.dispatchEvent(new Event("storage"));
  } catch (err) {
    console.warn("Erreur sauvegarde équipes locales:", err);
  }
  void sauvegarderEquipesRemote(members).then((result) => {
    if (!result.ok) console.warn("Erreur synchronisation PostgreSQL équipes:", result.message);
  });
}

export async function resetCustomEquipeMembers(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CUSTOM_EQUIPES_KEY);
    window.dispatchEvent(new CustomEvent("flux_equipes_updated", { detail: null }));
    window.dispatchEvent(new Event("storage"));
  } catch (err) {
    console.warn("Erreur réinitialisation équipes locales:", err);
  }
  const result = await sauvegarderEquipesRemote([]);
  if (!result.ok) throw new Error(result.message || "Impossible de réinitialiser les équipes dans PostgreSQL.");
}

export async function sauvegarderEquipesRemote(
  members: EquipeMember[],
): Promise<{ ok: boolean; message?: string }> {
  try {
    const result = await callDatabaseAction<{ ok: boolean; message?: string }>("sauvegarderEquipes", { equipes: members });
    return { ok: true, message: result.message || "Équipes enregistrées dans PostgreSQL." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Impossible d’enregistrer les équipes." };
  }
}

export async function fetchEquipeSheetData(): Promise<EquipeSheetResult> {
  const hasCustomMembers = typeof window !== "undefined" && Boolean(localStorage.getItem(CUSTOM_EQUIPES_KEY));
  if (hasCustomMembers) {
    const members = getCustomEquipeMembers() || [];
    const teamByMemberName = new Map<string, string>();
    members.forEach((member) => teamByMemberName.set(normalizePersonName(member.name), member.team));
    return { members, chefsEquipe: members.filter((member) => member.poste.toUpperCase().includes("CHEF")), teamByMemberName };
  }
  try {
    const response = await fetch("/api/data/teams", { cache: "no-store", credentials: "same-origin" });
    if (response.ok) {
      const members = await response.json() as EquipeMember[];
      if (members.length) {
        const teamByMemberName = new Map<string, string>();
        members.forEach((member) => teamByMemberName.set(normalizePersonName(member.name), member.team));
        return { members, chefsEquipe: members.filter((member) => member.poste.toUpperCase().includes("CHEF")), teamByMemberName };
      }
    }
  } catch (error) {
    console.warn("Chargement des équipes depuis PostgreSQL impossible:", error);
  }
  const teamByMemberName = new Map<string, string>();
  DEFAULT_EQUIPE_MAPPINGS.forEach((member) => teamByMemberName.set(normalizePersonName(member.name), member.team));
  return {
    members: DEFAULT_EQUIPE_MAPPINGS,
    chefsEquipe: DEFAULT_EQUIPE_MAPPINGS.filter((member) => member.poste.toUpperCase().includes("CHEF")),
    teamByMemberName,
  };
}

export interface MoyennesRow {
  name: string;
  days: number[]; // 31 days
  total: number;
  moyenne: number;
  isTotal?: boolean;
}

export interface ModeleCorrespondance {
  codeModele: string;
  famille: string;
}

export interface MoyennesSheetData {
  annee: number;
  mois: number;
  equipes: MoyennesRow[];
  equipesTotal?: MoyennesRow;
  modeles: MoyennesRow[];
  modelesTotal?: MoyennesRow;
  correspondances: ModeleCorrespondance[];
  lastUpdated: string;
}

export const DEFAULT_MOYENNES_DATA: MoyennesSheetData = {
  annee: 2026,
  mois: 9,
  equipes: [
    {
      name: "Daily1",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 7, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 11,
      moyenne: 3.67,
    },
    {
      name: "Daily2",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 6,
      moyenne: 2.0,
    },
    {
      name: "Changan",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 6,
      moyenne: 3.0,
    },
    {
      name: "Lourd",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 5,
      moyenne: 1.67,
    },
    {
      name: "Service Rapide",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 4,
      moyenne: 1.33,
    },
    {
      name: "Carrosserie",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 1,
      moyenne: 1.0,
    },
    {
      name: "Elictrique",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 3,
      moyenne: 1.5,
    },
  ],
  equipesTotal: {
    name: "Total",
    days: [0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 21, 0, 9, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    total: 36,
    moyenne: 9.0,
    isTotal: true,
  },
  modeles: [
    {
      name: "Eurocargo",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 10,
      moyenne: 3.33,
    },
    {
      name: "Daily",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 9, 0, 3, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 15,
      moyenne: 3.75,
    },
    {
      name: "S-Way",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 2,
      moyenne: 1.0,
    },
    {
      name: "IRISBUS",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 1,
      moyenne: 1.0,
    },
    {
      name: "Changan",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 1,
      moyenne: 1.0,
    },
    {
      name: "JMC",
      days: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      total: 1,
      moyenne: 1.0,
    },
  ],
  modelesTotal: {
    name: "Total",
    days: [0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 16, 0, 7, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    total: 30,
    moyenne: 7.5,
    isTotal: true,
  },
  correspondances: [
    { codeModele: "ML100", famille: "Eurocargo" },
    { codeModele: "ML110", famille: "Eurocargo" },
    { codeModele: "ML120", famille: "Eurocargo" },
    { codeModele: "ML150", famille: "Eurocargo" },
    { codeModele: "ML180", famille: "Eurocargo" },
    { codeModele: "35C15", famille: "Daily" },
    { codeModele: "50C15", famille: "Daily" },
    { codeModele: "55S15", famille: "Daily" },
    { codeModele: "65C15", famille: "Daily" },
    { codeModele: "70C15", famille: "Daily" },
    { codeModele: "72C15", famille: "Daily" },
    { codeModele: "POWER DAILY", famille: "Daily" },
    { codeModele: "AS440", famille: "S-Way" },
    { codeModele: "AT400", famille: "S-Way" },
    { codeModele: "AT440", famille: "S-Way" },
    { codeModele: "AT720", famille: "S-Way" },
    { codeModele: "IRISBUS", famille: "IRISBUS" },
    { codeModele: "IV-AUTRES", famille: "IRISBUS" },
    { codeModele: "CH-AUTRES", famille: "Changan" },
    { codeModele: "CS35", famille: "Changan" },
    { codeModele: "GRAND AVENUE", famille: "Changan" },
    { codeModele: "NEW STAR", famille: "Changan" },
    { codeModele: "STAR TRUCK", famille: "Changan" },
    { codeModele: "HUNTER", famille: "Changan" },
    { codeModele: "AD190", famille: "S-Way" },
    { codeModele: "AD200", famille: "S-Way" },
    { codeModele: "AD380", famille: "S-Way" },
    { codeModele: "AD410", famille: "S-Way" },
    { codeModele: "VIGUS", famille: "JMC" },
  ],
  lastUpdated: new Date().toISOString(),
};

const MOYENNES_STORAGE_KEY = "flux_atelier_moyennes_cache";

export async function fetchMoyennesSheetData(): Promise<MoyennesSheetData> {
  try {
    const response = await fetch("/api/data/averages", { cache: "no-store", credentials: "same-origin" });
    if (response.ok) {
      const rows = await response.json() as Array<Partial<MoyennesSheetData>>;
      if (rows[0]) {
        const result = { ...DEFAULT_MOYENNES_DATA, ...rows[0], lastUpdated: new Date().toISOString() } as MoyennesSheetData;
        localStorage.setItem(MOYENNES_STORAGE_KEY, JSON.stringify(result));
        return result;
      }
    }
  } catch (error) {
    console.warn("Échec du chargement des moyennes depuis PostgreSQL:", error);
  }
  try {
    const cached = localStorage.getItem(MOYENNES_STORAGE_KEY);
    if (cached) return JSON.parse(cached) as MoyennesSheetData;
  } catch { }
  return DEFAULT_MOYENNES_DATA;
}

export async function updateDatabaseMoyennesPeriode(
  annee: number,
  mois: number,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const result = await callDatabaseAction<{ ok: boolean; message?: string }>("updateMoyennesPeriode", { annee, mois });
    return { ok: true, message: result.message || "Période mise à jour dans PostgreSQL." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Erreur lors de la mise à jour PostgreSQL." };
  }
}

export function isDatabaseWriteConfigured() {
  return true;
}

function assertSheetWriteConfigured() {
  if (!isDatabaseWriteConfigured()) throw new Error("Connexion à PostgreSQL impossible. Vérifiez DATABASE_URL et le serveur API.");
}

function statusToSheetValue(status: WorkshopStatus) {
  return status === "A livré" ? "Livré" : status;
}

async function callSheetWriteAction(row: Flux, action: string, values: Record<string, string>): Promise<void> {
  assertSheetWriteConfigured();
  const rowProps = row as unknown as Record<string, unknown>;
  await callDatabaseAction(action, {
    // Toujours transmettre plusieurs identifiants : certaines lignes importées
    // n'ont pas « no » mais possèdent « ordre » ou uniquement l'identifiant SQL.
    ...values,
    no: row.no || row.ordre || "",
    noOr: row.no || row.ordre || "",
    chassis: row.chassis || "",
    recordKey: String(row.id || rowProps.recordKey || ""),
    cs: String(rowProps.cs || ""),
    rowNumber: row.sheetRowNumber || rowProps.rowNumber || "", rowSuivi: rowProps.rowSuivi || "",
  });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
}

export async function updateDatabaseEmplacement(row: Flux, emplacement: string) {
  const normalizedEmplacement = normalizeSheetEmplacement(emplacement);

  if (!normalizedEmplacement) {
    throw new Error("Choisis un emplacement avant d'enregistrer.");
  }

  return callSheetWriteAction(row, "updateEmplacement", {
    emplacement: normalizedEmplacement,
  });
}

export async function updateDatabaseEtat(
  row: Flux,
  etat: WorkshopStatus,
  equipe?: string,
  technicien?: string,
  nomTechnicien?: string,
  poste?: string,
  bloc?: number,
  emplacement?: string,
  avancement?: string,
  dateDebutRep?: string
) {
  if (!statusMeta.some((status) => status.label === etat)) {
    throw new Error("Choisis un état valide avant d'enregistrer.");
  }

  const values: Record<string, string> = {
    etat: statusToSheetValue(etat),
  };
  if (equipe) {
    values.equipe = equipe;
  }
  if (technicien) {
    values.technicien = technicien;
  }
  if (nomTechnicien) {
    values.nomTechnicien = nomTechnicien;
  }
  if (poste) {
    values.poste = poste;
  }
  const targetBloc = bloc ?? row.bloc;
  if (targetBloc) {
    values.bloc = String(targetBloc);
  }
  if (emplacement) {
    values.emplacement = emplacement;
  }
  if (avancement) {
    values.avancement = avancement;
  }
  if (dateDebutRep) {
    values.dateDebutRep = dateDebutRep;
    values.dateDebutTravail = dateDebutRep;
  }

  return callSheetWriteAction(row, "updateEtat", values);
}

export async function updateDatabaseTechnicien(
  row: Flux,
  technicien: string,
  nomTechnicien: string,
  equipe?: string,
  poste?: string,
  bloc?: number
) {
  const values: Record<string, string> = {
    technicien,
    nomTechnicien,
  };
  if (equipe) {
    values.equipe = equipe;
  }
  if (poste) {
    values.poste = poste;
  }
  const targetBloc = bloc ?? row.bloc;
  if (targetBloc) {
    values.bloc = String(targetBloc);
  }

  return callSheetWriteAction(row, "updateTechnicien", values);
}

export const BASE_AVANCEMENT_OPTIONS = [
  "ATENDE DEVIS",
  "En cours - 10%",
  "En cours - 20%",
  "En cours - 30%",
  "En cours - 40%",
  "En cours - 50%",
  "En cours - 60%",
  "En cours - 70%",
  "En cours - 80%",
  "En cours - 90%",
  "Attente PDR",
  "Technicien réaffecté",
  "attends acheter",
  "Essai",
  "Terminer",
  "vrElictrique",
  "vrService Rapide",
  "vrCarrosserie",
  "vrDaily",
  "vrLourd",
  "vrChangan",
] as const;

export function getAvancementOptionsForTeam(team?: string, row?: Flux): string[] {
  const norm = (team || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  let options: string[] = [];

  // 1. Filtrage selon l'équipe actuelle
  // If Équipe is Daily1 or Daily2: eliminate (vrDaily, vrLourd, vrChangan)
  if (norm.includes("daily1") || norm.includes("daily2")) {
    options = BASE_AVANCEMENT_OPTIONS.filter(
      (opt) => opt !== "vrDaily" && opt !== "vrLourd" && opt !== "vrChangan"
    );
  } else if (norm.includes("lourd")) {
    options = BASE_AVANCEMENT_OPTIONS.filter(
      (opt) => opt !== "vrDaily" && opt !== "vrLourd" && opt !== "vrChangan"
    );
  } else if (norm.includes("changan")) {
    options = BASE_AVANCEMENT_OPTIONS.filter(
      (opt) => opt !== "vrDaily" && opt !== "vrLourd" && opt !== "vrChangan"
    );
  } else if (norm.includes("rapide")) {
    options = BASE_AVANCEMENT_OPTIONS.filter((opt) => opt !== "vrService Rapide");
  } else if (norm.includes("carross")) {
    options = BASE_AVANCEMENT_OPTIONS.filter((opt) => opt !== "vrCarrosserie");
  } else if (norm.includes("elect") || norm.includes("elict")) {
    options = BASE_AVANCEMENT_OPTIONS.filter((opt) => opt !== "vrElictrique");
  } else {
    options = [...BASE_AVANCEMENT_OPTIONS];
  }

  // 2. Élimination du choix de retour à l'ancienne équipe (ou aux équipes antérieures)
  if (row) {
    const previousTeams: string[] = [];
    const activeBloc = row.bloc || 1;

    if (activeBloc === 2) {
      if (row.equipe1 && row.equipe1 !== "-") {
        previousTeams.push(row.equipe1);
      }
    } else if (activeBloc === 3) {
      if (row.equipe1 && row.equipe1 !== "-") {
        previousTeams.push(row.equipe1);
      }
      if (row.equipe2 && row.equipe2 !== "-") {
        previousTeams.push(row.equipe2);
      }
    } else {
      // Bloc 1 ou non défini : si equipe1 existe et est différente de l'équipe actuelle
      const currentTeamNorm = (row.equipe || team || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (row.equipe1 && row.equipe1 !== "-") {
        const eq1Norm = row.equipe1.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        if (eq1Norm !== currentTeamNorm) {
          previousTeams.push(row.equipe1);
        }
      }
    }

    const vrToRemove = new Set<string>();
    for (const prev of previousTeams) {
      const pNorm = prev.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (pNorm.includes("daily")) {
        vrToRemove.add("vrDaily");
      }
      if (pNorm.includes("lourd")) {
        vrToRemove.add("vrLourd");
      }
      if (pNorm.includes("changan")) {
        vrToRemove.add("vrChangan");
      }
      if (pNorm.includes("rapide") || pNorm.includes("serv")) {
        vrToRemove.add("vrService Rapide");
      }
      if (pNorm.includes("carross")) {
        vrToRemove.add("vrCarrosserie");
      }
      if (pNorm.includes("elect") || pNorm.includes("elict")) {
        vrToRemove.add("vrElictrique");
      }
    }

    if (vrToRemove.size > 0) {
      options = options.filter((opt) => !vrToRemove.has(opt));
    }
  }

  return options;
}

export interface DemandeAchat {
  id?: string;
  vehicleId?: number;
  or: string;
  chassis: string;
  client: string;
  date: string;
  ref: string;
  designation: string;
  qt: number;
  commentaire?: string;
  equipe?: string;
  demandeur?: string;
  /** Mode de passation de la commande fournisseur. */
  modeCommande?: "Téléphone" | "Autre";
  fournisseur?: string;
  telephoneFournisseur?: string;
  dateCommandeTelephone?: string;
  statutAchat?: "Attente" | "Livrer" | "Livré" | "Pièce retirée";
  dateLivraison?: string;
  livrePar?: string;
  /** Horodatage de l'acceptation par l'équipe après arrivée des pièces. */
  dateAcceptationEquipe?: string;
  acceptePar?: string;
  createdAtTimestamp?: number;
}

export interface DemandeEssaiControle {
  /** Identifiant unique de l'essai. Il permet de conserver plusieurs essais par véhicule. */
  id: string;
  vehicleId?: number;
  or: string;
  chassis: string;
  modele: string;
  client: string;
  essayeur: string;
  resultat: "CONFORME" | "NON-CONFORME";
  actionNonConforme?: "transfert_vr" | "attente_client";
  targetVr?: string;
  descriptionPanne?: string;
  remarque?: string;
  dateControle: string;
  timestamp: number;
}

export interface DemandeDevis {
  id?: string;
  vehicleId?: number;
  numeroDevis: string; // N° DV
  or: string;          // N° OR
  chassis: string;     // N° Chassis
  client: string;      // Nom Client
  modele: string;      // Modèle
  immatriculation: string; // N° Immatriculation
  date: string;
  pieces?: string;     // Pièces remplacées / demandées dans le devis
  equipe?: string;
  equipeOrigine?: string;  // Équipe qui a initié le devis (pour retour automatique dès accord)
  technicien?: string;     // Matricule du technicien assigné à la création du devis
  nomTechnicien?: string;  // Nom complet du technicien assigné
  demandeur?: string;
  statutDevis?: "En attente accord" | "Client appelé" | "Accepté" | "Refusé" | "Annulé";
  commentaire?: string;
  dateAppel?: string;      // Date et heure du premier appel au client
  appelant?: string;        // Nom de la réceptionniste ayant appelé
  dateDecision?: string;   // Date d'acceptation ou refus
  dateRelance?: string;    // Date du rappel si > 24h
  createdAtTimestamp?: number; // Pour calcul précis du délai de 24h (1 jour)
  calledAtTimestamp?: number;  // Pour calcul du délai de 24h après appel
  decisionAtTimestamp?: number; // Timestamp exact de la décision (accepté / refusé) pour calcul précis chronométrie
}

const STORAGE_KEY_DEMANDES_DEVIS = "flux_atelier_demandes_devis";

export function getDemandesDevisLocal(): Record<string, DemandeDevis> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEMANDES_DEVIS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture demandes devis:", e);
  }
  return {};
}

export function saveDemandeDevisLocal(devis: DemandeDevis): void {
  try {
    const all = getDemandesDevisLocal();
    const key = String(devis.vehicleId || devis.or || devis.chassis);
    all[key] = {
      ...devis,
      equipeOrigine: devis.equipeOrigine || devis.equipe || all[key]?.equipeOrigine || all[key]?.equipe,
      statutDevis: devis.statutDevis || all[key]?.statutDevis || "En attente accord",
      createdAtTimestamp: devis.createdAtTimestamp || all[key]?.createdAtTimestamp || Date.now(),
    };
    localStorage.setItem(STORAGE_KEY_DEMANDES_DEVIS, JSON.stringify(all));
    persistSqlSnapshot('quotes', all);
    window.dispatchEvent(new Event("demandes_devis_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde demande devis:", e);
  }
}

export function marquerDevisAppele(
  keyOrId: string,
  appelant?: string,
  dateAppelCustom?: string,
  fallbackVehicle?: Flux,
  commentaire?: string
): DemandeDevis | null {
  try {
    const all = getDemandesDevisLocal();
    let targetKey = keyOrId;
    if (!all[targetKey]) {
      const foundEntry = Object.entries(all).find(
        ([, d]) =>
          d.id === keyOrId ||
          String(d.vehicleId) === keyOrId ||
          d.or === keyOrId ||
          d.chassis === keyOrId ||
          d.numeroDevis === keyOrId
      );
      if (foundEntry) targetKey = foundEntry[0];
    }

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const dateAppel = dateAppelCustom || `${dd}/${mm}/${yyyy} ${hh}:${min}`;

    if (all[targetKey]) {
      all[targetKey] = {
        ...all[targetKey],
        statutDevis: "Client appelé",
        dateAppel,
        appelant: appelant || all[targetKey].appelant || "Réception",
        commentaire: commentaire !== undefined ? commentaire : all[targetKey].commentaire,
        calledAtTimestamp: Date.now(),
      };
    } else {
      const fallbackKey = keyOrId;
      all[fallbackKey] = {
        id: fallbackKey,
        vehicleId: fallbackVehicle?.id,
        numeroDevis: `DV-${fallbackVehicle?.no || fallbackVehicle?.ordre || fallbackKey}`,
        or: fallbackVehicle?.no || fallbackVehicle?.ordre || fallbackKey,
        chassis: fallbackVehicle?.chassis || "",
        client: fallbackVehicle?.client || "Client",
        modele: fallbackVehicle?.modele || "-",
        immatriculation: fallbackVehicle?.serie || fallbackVehicle?.immatriculation || "-",
        date: dateAppel || `${dd}/${mm}/${yyyy} ${hh}:${min}`,
        equipe: fallbackVehicle?.equipe || "Daily1",
        equipeOrigine: fallbackVehicle?.equipe || "Daily1",
        statutDevis: "Client appelé",
        dateAppel,
        appelant: appelant || "Réception",
        commentaire: commentaire || "",
        createdAtTimestamp: Date.now(),
        calledAtTimestamp: Date.now(),
      };
      targetKey = fallbackKey;
    }

    localStorage.setItem(STORAGE_KEY_DEMANDES_DEVIS, JSON.stringify(all));
    persistSqlSnapshot('quotes', all);
    window.dispatchEvent(new Event("demandes_devis_updated"));
    return all[targetKey];
  } catch (e) {
    console.warn("Erreur marquage appel devis:", e);
  }
  return null;
}

export function marquerDevisRelance(keyOrId: string, relanceur?: string): DemandeDevis | null {
  try {
    const all = getDemandesDevisLocal();
    let targetKey = keyOrId;
    if (!all[targetKey]) {
      const foundEntry = Object.entries(all).find(
        ([, d]) =>
          d.id === keyOrId ||
          String(d.vehicleId) === keyOrId ||
          d.or === keyOrId ||
          d.chassis === keyOrId ||
          d.numeroDevis === keyOrId
      );
      if (foundEntry) targetKey = foundEntry[0];
    }

    if (all[targetKey]) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const dateRelance = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

      all[targetKey] = {
        ...all[targetKey],
        dateRelance,
        calledAtTimestamp: Date.now(),
        appelant: relanceur || all[targetKey].appelant,
      };
      localStorage.setItem(STORAGE_KEY_DEMANDES_DEVIS, JSON.stringify(all));
      persistSqlSnapshot('quotes', all);
      window.dispatchEvent(new Event("demandes_devis_updated"));
      return all[targetKey];
    }
  } catch (e) {
    console.warn("Erreur marquage relance devis:", e);
  }
  return null;
}

export function marquerDevisAccepte(keyOrId: string): DemandeDevis | null {
  try {
    const all = getDemandesDevisLocal();
    let targetKey = keyOrId;
    if (!all[targetKey]) {
      const foundEntry = Object.entries(all).find(
        ([, d]) =>
          d.id === keyOrId ||
          String(d.vehicleId) === keyOrId ||
          d.or === keyOrId ||
          d.chassis === keyOrId ||
          d.numeroDevis === keyOrId
      );
      if (foundEntry) targetKey = foundEntry[0];
    }

    if (all[targetKey]) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const dateDecision = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

      all[targetKey] = {
        ...all[targetKey],
        statutDevis: "Accepté",
        dateDecision,
        decisionAtTimestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY_DEMANDES_DEVIS, JSON.stringify(all));
      persistSqlSnapshot('quotes', all);
      window.dispatchEvent(new Event("demandes_devis_updated"));
      return all[targetKey];
    }
  } catch (e) {
    console.warn("Erreur marquage devis accepté:", e);
  }
  return null;
}

export function marquerDevisRefuse(keyOrId: string): DemandeDevis | null {
  try {
    const all = getDemandesDevisLocal();
    let targetKey = keyOrId;
    if (!all[targetKey]) {
      const foundEntry = Object.entries(all).find(
        ([, d]) =>
          d.id === keyOrId ||
          String(d.vehicleId) === keyOrId ||
          d.or === keyOrId ||
          d.chassis === keyOrId ||
          d.numeroDevis === keyOrId
      );
      if (foundEntry) targetKey = foundEntry[0];
    }

    if (all[targetKey]) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const dateDecision = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

      all[targetKey] = {
        ...all[targetKey],
        statutDevis: "Refusé",
        dateDecision,
        decisionAtTimestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY_DEMANDES_DEVIS, JSON.stringify(all));
      persistSqlSnapshot('quotes', all);
      window.dispatchEvent(new Event("demandes_devis_updated"));
      return all[targetKey];
    }
  } catch (e) {
    console.warn("Erreur marquage devis refusé:", e);
  }
  return null;
}

// ==========================================
// NOTIFICATIONS ACCORD DEVIS CLIENT
// (Retour véhicule à l'équipe d'origine en Attente réparation)
// ==========================================
export interface DevisAccordNotification {
  id: string; // `devis-accord-${vehicleId || or}`
  vehicleId: number;
  or: string;
  chassis: string;
  client: string;
  marque: string;
  modele: string;
  immatriculation?: string;
  equipeCible: string;
  technicien?: string;
  nomTechnicien?: string;
  numeroDevis: string;
  dateAccord: string;
  timestamp: string;
  timestampMs: number;
}

const STORAGE_KEY_DEVIS_ACCORD_NOTIFS = "flux_atelier_devis_accord_notifications";

export function getDevisAccordNotifications(): DevisAccordNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEVIS_ACCORD_NOTIFS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture notifications accord devis:", e);
  }
  return [];
}

export function saveDevisAccordNotification(notif: DevisAccordNotification): void {
  try {
    const list = getDevisAccordNotifications().filter((n) => n.id !== notif.id);
    list.unshift(notif);
    localStorage.setItem(STORAGE_KEY_DEVIS_ACCORD_NOTIFS, JSON.stringify(list));
    persistSqlSnapshot('devis_notifications', list);
    window.dispatchEvent(new Event("devis_accord_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde notification accord devis:", e);
  }
}

export function removeDevisAccordNotification(notifId: string): void {
  try {
    const list = getDevisAccordNotifications().filter((n) => n.id !== notifId);
    localStorage.setItem(STORAGE_KEY_DEVIS_ACCORD_NOTIFS, JSON.stringify(list));
    persistSqlSnapshot('devis_notifications', list);
    deleteSqlRecord('devis_notifications', notifId);
    window.dispatchEvent(new Event("devis_accord_updated"));
  } catch (e) {
    console.warn("Erreur suppression notification accord devis:", e);
  }
}

// ==========================================
// NOTIFICATIONS NOUVELLES ENTRÉES ATELIER
// ==========================================
export interface NouvelleEntreeNotification {
  id: string; // entree_${noOr}_${chassis}
  noOr: string;
  chassis: string;
  immatriculation?: string;
  marque: string;
  modele: string;
  nomClient: string;
  equipe: string;
  cs: string;
  dateEntreeHeure: string;
  statutAcceptation: "en_attente" | "accepte" | "mis_en_attente";
  dateAcceptation?: string;
  dateMiseEnAttente?: string;
  decisionPar?: string;
  createdAt: number;
}

const STORAGE_KEY_NOUVELLE_ENTREE_NOTIFS = "flux_atelier_nouvelle_entree_notifications";

export function getNouvelleEntreeNotifications(): NouvelleEntreeNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOUVELLE_ENTREE_NOTIFS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture notifications nouvelle entree:", e);
  }
  return [];
}

export function saveNouvelleEntreeNotification(notif: NouvelleEntreeNotification): void {
  try {
    const list = getNouvelleEntreeNotifications().filter((n) => n.id !== notif.id);
    list.unshift(notif);
    localStorage.setItem(STORAGE_KEY_NOUVELLE_ENTREE_NOTIFS, JSON.stringify(list));
    persistSqlSnapshot("entree_notifications", list);
    window.dispatchEvent(new CustomEvent("nouvelle_entree_notification_updated", { detail: notif }));
  } catch (e) {
    console.warn("Erreur sauvegarde notification nouvelle entree:", e);
  }
}

export function removeNouvelleEntreeNotification(notifId: string): void {
  try {
    const list = getNouvelleEntreeNotifications().filter((n) => n.id !== notifId);
    localStorage.setItem(STORAGE_KEY_NOUVELLE_ENTREE_NOTIFS, JSON.stringify(list));
    persistSqlSnapshot("entree_notifications", list);
    deleteSqlRecord("entree_notifications", notifId);
    window.dispatchEvent(new CustomEvent("nouvelle_entree_notification_updated"));
  } catch (e) {
    console.warn("Erreur suppression notification nouvelle entree:", e);
  }
}

export async function accepterEntreeParChefEquipe(params: {
  noOr: string;
  chassis: string;
  decision: "accepte" | "mis_en_attente";
  equipe?: string;
  decisionPar?: string;
  emplacement?: string;
  avancement?: string;
  etat?: string;
  statut?: string;
  etatIntervention?: string;
  technicien?: string;
  nomTechnicien?: string;
  dateDebutRep?: string;
  dateDebutTravail?: string;
  heureDebutTravail?: string;
}): Promise<{ ok: boolean; dateDecision: string }> {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dateDecision = `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
  const currentTime = `${hh}:${min}:${ss}`;

  try {
    await callDatabaseAction("accepterEntreeChefEquipe", {
      noOr: params.noOr,
      chassis: params.chassis,
      decision: params.decision,
      dateDecision,
      decisionPar: params.decisionPar || "",
      equipe: params.equipe || "",
      dateDebutRep: params.dateDebutRep || dateDecision,
      dateDebutTravail: params.dateDebutTravail || dateDecision,
      heureDebutTravail: params.heureDebutTravail || currentTime,
      ...(params.emplacement ? { emplacement: params.emplacement } : {}),
      ...(params.avancement ? { avancement: params.avancement } : {}),
      ...(params.etat || params.statut || params.etatIntervention
        ? {
            etat: params.etat || params.statut || params.etatIntervention,
            etatIntervention: params.etatIntervention || params.etat || params.statut,
            statut: params.statut || params.etat || params.etatIntervention,
          }
        : {}),
      ...(params.technicien ? { technicien: params.technicien } : {}),
      ...(params.nomTechnicien ? { nomTechnicien: params.nomTechnicien } : {}),
    });
  } catch (e) {
    console.warn("Erreur appel API accepterEntreeChefEquipe:", e);
  }

  // Mettre à jour la notification en local et dans PostgreSQL
  const notifs = getNouvelleEntreeNotifications();
  const updatedNotifs = notifs.map((n) => {
    if ((params.noOr && n.noOr === params.noOr) || (params.chassis && n.chassis === params.chassis)) {
      return {
        ...n,
        statutAcceptation: params.decision,
        ...(params.decision === "accepte" ? { dateAcceptation: dateDecision } : { dateMiseEnAttente: dateDecision }),
        decisionPar: params.decisionPar,
      };
    }
    return n;
  });
  localStorage.setItem(STORAGE_KEY_NOUVELLE_ENTREE_NOTIFS, JSON.stringify(updatedNotifs));
  persistSqlSnapshot("entree_notifications", updatedNotifs);

  // Mettre à jour aussi dans les entrées récentes en attente si présentes
  try {
    const rawPending = localStorage.getItem("flux_pending_new_chargement_entries");
    if (rawPending) {
      const pendingList: PendingAddedFluxVehicle[] = JSON.parse(rawPending);
      pendingList.forEach((p) => {
        if ((params.noOr && p.vehicle.no === params.noOr) || (params.chassis && p.vehicle.chassis === params.chassis)) {
          p.vehicle.statutAcceptation = params.decision;
          if (params.decision === "accepte") {
            p.vehicle.dateAcceptation = dateDecision;
            p.vehicle.acceptePar = params.decisionPar;
          } else {
            p.vehicle.dateMiseEnAttente = dateDecision;
            p.vehicle.misEnAttentePar = params.decisionPar;
          }
        }
      });
      localStorage.setItem("flux_pending_new_chargement_entries", JSON.stringify(pendingList));
    }
  } catch (_) {}

  window.dispatchEvent(new CustomEvent("nouvelle_entree_notification_updated"));
  window.dispatchEvent(new CustomEvent("flux_refresh_requested"));

  return { ok: true, dateDecision };
}

// ==========================================
// SUIVI TECHNICIEN RÉAFFECTÉ & REPRISE TRAVAIL
// ==========================================
export interface ReaffectationRecord {
  id: string; // vehicleId or or or chassis
  vehicleId?: number;
  or?: string;
  chassis?: string;
  immatriculation?: string;
  technicienNom?: string;
  technicienMatricule?: string;
  equipe?: string;
  dateReaffectation: string; // DD/MM/YYYY HH:mm
  timestampReaffectation: number;
  reaffectePar?: string;
  dateReprise?: string; // DD/MM/YYYY HH:mm
  timestampReprise?: number;
  reprisePar?: string;
  isRepris: boolean;
}

const STORAGE_KEY_REAFFECTATIONS = "flux_atelier_reaffectations";

export function getReaffectationsLocal(): Record<string, ReaffectationRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REAFFECTATIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture réaffectations:", e);
  }
  return {};
}

export function saveReaffectationLocal(record: ReaffectationRecord): void {
  try {
    const all = getReaffectationsLocal();
    all[record.id] = record;
    if (record.vehicleId) all[String(record.vehicleId)] = record;
    if (record.or) all[record.or.trim()] = record;
    if (record.chassis) all[record.chassis.trim()] = record;
    localStorage.setItem(STORAGE_KEY_REAFFECTATIONS, JSON.stringify(all));
    persistSqlSnapshot('reassignments', { [record.id]: record });
    window.dispatchEvent(new Event("reaffectations_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde réaffectation:", e);
  }
}

export function marquerVehiculeReaffecte(row: Flux, reaffectePar?: string): ReaffectationRecord {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const dateReaffectation = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

  const key = String(row.id);
  const record: ReaffectationRecord = {
    id: key,
    vehicleId: row.id,
    or: row.no || row.ordre,
    chassis: row.chassis,
    immatriculation: row.serie || row.immatriculation,
    technicienNom: row.nomTechnicien || row.technicien,
    technicienMatricule: row.technicien,
    equipe: row.equipe,
    dateReaffectation,
    timestampReaffectation: Date.now(),
    reaffectePar: reaffectePar || "Chef d'équipe",
    isRepris: false,
  };
  saveReaffectationLocal(record);
  return record;
}

export function marquerVehiculeReprise(row: Flux, reprisePar?: string): ReaffectationRecord {
  const all = getReaffectationsLocal();
  const key = String(row.id);
  const found = all[key] || (row.no && all[row.no.trim()]) || (row.chassis && all[row.chassis.trim()]);

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const dateReprise = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

  const record: ReaffectationRecord = found
    ? {
        ...found,
        technicienNom: found.technicienNom || row.nomTechnicien || row.technicien,
        technicienMatricule: found.technicienMatricule || row.technicien,
        equipe: found.equipe || row.equipe,
        dateReprise,
        timestampReprise: Date.now(),
        reprisePar: reprisePar || "Chef d'équipe",
        isRepris: true,
      }
    : {
        id: key,
        vehicleId: row.id,
        or: row.no || row.ordre,
        chassis: row.chassis,
        immatriculation: row.serie || row.immatriculation,
        technicienNom: row.nomTechnicien || row.technicien,
        technicienMatricule: row.technicien,
        equipe: row.equipe,
        dateReaffectation: dateReprise,
        timestampReaffectation: Date.now(),
        dateReprise,
        timestampReprise: Date.now(),
        reprisePar: reprisePar || "Chef d'équipe",
        isRepris: true,
      };

  saveReaffectationLocal(record);
  return record;
}

// -------------------------------------------------------------
// Suivi des Transferts Inter-Équipes (VR) & Timeline Attente
// -------------------------------------------------------------

export interface VehicleTransferRecord {
  id: string;
  vehicleId: any;
  or?: string;
  chassis?: string;
  immatriculation?: string;
  equipeDepart: string;
  equipeCible: string;
  statutDepart: "Terminé / transféré";
  vrCode: string;
  dateTransfert: string;
  timestampTransfert: number;
  dateAcceptation?: string;
  timestampAcceptation?: number;
  isAccepte: boolean;
  acceptePar?: string;
}

const STORAGE_KEY_TRANSFERS = "flux_atelier_transfers_timeline";

export function getTeamFromVr(vrCode: string): string {
  const clean = (vrCode || "").trim().toLowerCase();
  if (clean.includes("rapide")) return "Service Rapide";
  if (clean.includes("carross")) return "Carrosserie";
  if (clean.includes("elict") || clean.includes("elect")) return "Electrique";
  if (clean.includes("lourd")) return "Lourd";
  if (clean.includes("changan")) return "Changan";
  if (clean.includes("daily")) return "Daily";
  return "";
}

export function getVehicleTransfersLocal(): VehicleTransferRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSFERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture transferts timeline:", e);
  }
  return [];
}

export function saveVehicleTransferLocal(record: VehicleTransferRecord): void {
  try {
    const all = getVehicleTransfersLocal();
    const idx = all.findIndex((t) => t.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.push(record);
    }
    localStorage.setItem(STORAGE_KEY_TRANSFERS, JSON.stringify(all));
    persistSqlSnapshot('transfers', [record]);
    window.dispatchEvent(new Event("transfers_timeline_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde transfert timeline:", e);
  }
}

export function marquerDebutTransfertVR(
  row: Flux,
  vrCode: string,
  targetEquipe?: string,
  transferePar?: string
): VehicleTransferRecord {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const dateTransfert = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

  const resolvedTarget = targetEquipe || getTeamFromVr(vrCode) || "Atelier";
  const record: VehicleTransferRecord = {
    id: `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    vehicleId: row.id,
    or: row.no || row.ordre,
    chassis: row.chassis,
    immatriculation: row.serie || row.immatriculation,
    equipeDepart: row.equipe || "Atelier",
    equipeCible: resolvedTarget,
    statutDepart: "Terminé / transféré",
    vrCode,
    dateTransfert,
    timestampTransfert: Date.now(),
    isAccepte: false,
    acceptePar: transferePar || "Chef d'équipe",
  };
  saveVehicleTransferLocal(record);
  return record;
}

export function marquerTransfertAccepte(
  row: Partial<Flux>,
  acceptePar?: string
): VehicleTransferRecord | null {
  const all = getVehicleTransfersLocal();
  const vId = row.id ? String(row.id) : null;
  const orKey = (row.no || row.ordre || "").trim();
  const chKey = (row.chassis || "").trim().toUpperCase();

  const transfer = all
    .filter((t) => !t.isAccepte)
    .reverse()
    .find(
      (t) =>
        (vId && String(t.vehicleId) === vId) ||
        (orKey && t.or && t.or.trim() === orKey) ||
        (chKey && t.chassis && t.chassis.trim().toUpperCase() === chKey)
    );

  if (!transfer) return null;

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const dateAcceptation = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

  transfer.dateAcceptation = dateAcceptation;
  transfer.timestampAcceptation = Date.now();
  transfer.isAccepte = true;
  transfer.acceptePar = acceptePar || "Chef d'équipe";

  saveVehicleTransferLocal(transfer);
  return transfer;
}

export function getTransfersForVehicle(row: Partial<Flux>): VehicleTransferRecord[] {
  const all = getVehicleTransfersLocal();
  const vId = row.id ? String(row.id) : null;
  const orKey = (row.no || row.ordre || "").trim();
  const chKey = (row.chassis || "").trim().toUpperCase();

  return all.filter(
    (t) =>
      (vId && String(t.vehicleId) === vId) ||
      (orKey && t.or && t.or.trim() === orKey) ||
      (chKey && t.chassis && t.chassis.trim().toUpperCase() === chKey)
  );
}

// -------------------------------------------------------------
// Suivi Timeline de la Phase Essai Routier & Contrôle Qualité
// -------------------------------------------------------------

export interface VehicleEssaiRecord {
  id: string;
  vehicleId: any;
  or?: string;
  chassis?: string;
  immatriculation?: string;
  dateDebut: string;
  timestampDebut: number;
  dateFin?: string;
  timestampFin?: number;
  isTermine: boolean;
  essayeur?: string;
  resultat?: string;
  lancePar?: string;
}

const STORAGE_KEY_ESSAIS_TIMELINE = "flux_atelier_essais_timeline";

export function getVehicleEssaisLocal(): VehicleEssaiRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ESSAIS_TIMELINE);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture essais timeline:", e);
  }
  return [];
}

export function saveVehicleEssaiLocal(record: VehicleEssaiRecord): void {
  try {
    const all = getVehicleEssaisLocal();
    const idx = all.findIndex((e) => e.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.push(record);
    }
    localStorage.setItem(STORAGE_KEY_ESSAIS_TIMELINE, JSON.stringify(all));
    persistSqlSnapshot('essais', [record]);
    window.dispatchEvent(new Event("essais_timeline_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde essai timeline:", e);
  }
}

export function marquerDebutEssai(row: Flux, lancePar?: string): VehicleEssaiRecord {
  const existing = getVehicleEssaisLocal().find((essai) =>
    !essai.isTermine && (
      (row.no && essai.or === row.no) ||
      (row.ordre && essai.or === row.ordre) ||
      (row.chassis && essai.chassis && essai.chassis.trim().toUpperCase() === row.chassis.trim().toUpperCase())
    )
  );
  if (existing) return existing;

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const dateDebut = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

  const record: VehicleEssaiRecord = {
    id: `essai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    vehicleId: row.id,
    or: row.no || row.ordre,
    chassis: row.chassis,
    immatriculation: row.serie || row.immatriculation,
    dateDebut,
    timestampDebut: Date.now(),
    isTermine: false,
    lancePar: lancePar || "Chef d'équipe",
  };
  saveVehicleEssaiLocal(record);
  return record;
}

export function marquerFinEssai(
  row: Partial<Flux>,
  payload?: { essayeur?: string; resultat?: string; dateControle?: string }
): VehicleEssaiRecord | null {
  const all = getVehicleEssaisLocal();
  const vId = row.id ? String(row.id) : null;
  const orKey = (row.no || row.ordre || "").trim();
  const chKey = (row.chassis || "").trim().toUpperCase();

  const essai = all
    .filter((e) => !e.isTermine)
    .reverse()
    .find(
      (e) =>
        (vId && String(e.vehicleId) === vId) ||
        (orKey && e.or && e.or.trim() === orKey) ||
        (chKey && e.chassis && e.chassis.trim().toUpperCase() === chKey)
    );

  if (!essai) return null;

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const dateFin = payload?.dateControle || `${dd}/${mm}/${yyyy} ${hh}:${min}`;

  essai.dateFin = dateFin;
  essai.timestampFin = Date.now();
  essai.isTermine = true;
  essai.essayeur = payload?.essayeur || essai.essayeur;
  essai.resultat = payload?.resultat || "CONFORME";

  saveVehicleEssaiLocal(essai);
  return essai;
}

export function getEssaisForVehicle(row: Partial<Flux>): VehicleEssaiRecord[] {
  const all = getVehicleEssaisLocal();
  const vId = row.id ? String(row.id) : null;
  const orKey = (row.no || row.ordre || "").trim();
  const chKey = (row.chassis || "").trim().toUpperCase();

  return all.filter(
    (e) =>
      (vId && String(e.vehicleId) === vId) ||
      (orKey && e.or && e.or.trim() === orKey) ||
      (chKey && e.chassis && e.chassis.trim().toUpperCase() === chKey)
  );
}

const STORAGE_KEY_DEMANDES_ACHAT = "flux_atelier_demandes_achat";

export function getDemandesAchatLocal(): Record<string, DemandeAchat> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEMANDES_ACHAT);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture demandes achat:", e);
  }
  return {};
}

export function saveDemandeAchatLocal(demande: DemandeAchat): void {
  try {
    const all = getDemandesAchatLocal();
    const key = String(demande.vehicleId || demande.or || demande.chassis);
    all[key] = {
      ...demande,
      statutAchat: demande.statutAchat || "Attente",
    };
    localStorage.setItem(STORAGE_KEY_DEMANDES_ACHAT, JSON.stringify(all));
    persistSqlSnapshot('purchases', all);
    window.dispatchEvent(new Event("demandes_achat_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde demande achat:", e);
  }
}

const STORAGE_KEY_ESSAIS_CONTROLE = "flux_atelier_essais_controle";


export function getEssaisControleLocal(): DemandeEssaiControle[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ESSAIS_CONTROLE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Accepte aussi l'ancien format { vehicleKey: essai } afin de ne pas perdre
    // les contrôles déjà enregistrés avant l'ajout de l'historique.
    const records = Array.isArray(parsed)
      ? parsed
      : Object.values(parsed as Record<string, DemandeEssaiControle | DemandeEssaiControle[]>).flat();
    return records
      .filter((record): record is Omit<DemandeEssaiControle, "id"> & { id?: string } =>
        Boolean(record && typeof record === "object" && record.dateControle)
      )
      .map((record, index) => ({
        ...record,
        // Migration transparente des contrôles enregistrés avant l'historique.
        id: record.id || `essai-historique-${record.timestamp || 0}-${index}`,
      }));
  } catch (e) {
    console.warn("Erreur lecture essais contrôle:", e);
  }
  return [];
}

export function saveEssaiControleLocal(essai: DemandeEssaiControle): void {
  try {
    const all = getEssaisControleLocal();
    const next = [...all.filter((record) => record.id !== essai.id), essai];
    localStorage.setItem(STORAGE_KEY_ESSAIS_CONTROLE, JSON.stringify(next));
    // Un essai est une ligne indépendante : aucun précédent ne peut être écrasé.
    persistSqlSnapshot('essai_controls', [{ ...essai, recordKey: essai.id }]);
    window.dispatchEvent(new Event("essais_controle_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde essai contrôle:", e);
  }
}


export function marquerDemandeAchatLivree(
  keyOrId: string,
  livrePar?: string
): DemandeAchat | null {
  try {
    const all = getDemandesAchatLocal();
    let targetKey = keyOrId;
    if (!all[targetKey]) {
      const foundEntry = Object.entries(all).find(
        ([, d]) =>
          d.id === keyOrId ||
          String(d.vehicleId) === keyOrId ||
          d.or === keyOrId ||
          d.chassis === keyOrId
      );
      if (foundEntry) {
        targetKey = foundEntry[0];
      }
    }

    if (all[targetKey]) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2, "0");
      const min = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const dateLivraison = `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;

      all[targetKey] = {
        ...all[targetKey],
        statutAchat: "Livré",
        dateLivraison,
        livrePar: livrePar || all[targetKey].livrePar,
      };

      localStorage.setItem(STORAGE_KEY_DEMANDES_ACHAT, JSON.stringify(all));
      persistSqlSnapshot('purchases', { [targetKey]: all[targetKey] });
      window.dispatchEvent(new Event("demandes_achat_updated"));
      return all[targetKey];
    }
  } catch (e) {
    console.warn("Erreur marquage livraison achat:", e);
  }
  return null;
}

/** L'équipe confirme qu'elle accepte de reprendre l'intervention après livraison. */
export function marquerDemandeAchatAccepteeParEquipe(
  keyOrId: string,
  acceptePar?: string
): DemandeAchat | null {
  try {
    const all = getDemandesAchatLocal();
    let targetKey = keyOrId;
    if (!all[targetKey]) {
      const foundEntry = Object.entries(all).find(
        ([, d]) =>
          d.id === keyOrId ||
          String(d.vehicleId) === keyOrId ||
          d.or === keyOrId ||
          d.chassis === keyOrId
      );
      if (foundEntry) targetKey = foundEntry[0];
    }

    if (!all[targetKey]) return null;
    const now = new Date();
    const dateAcceptationEquipe = now.toLocaleString("fr-FR");
    all[targetKey] = {
      ...all[targetKey],
      dateAcceptationEquipe,
      acceptePar: acceptePar || all[targetKey].acceptePar,
    };
    localStorage.setItem(STORAGE_KEY_DEMANDES_ACHAT, JSON.stringify(all));
    persistSqlSnapshot('purchases', { [targetKey]: all[targetKey] });
    window.dispatchEvent(new Event("demandes_achat_updated"));
    return all[targetKey];
  } catch (e) {
    console.warn("Erreur acceptation équipe achat:", e);
  }
  return null;
}

export function marquerDemandeAchatAttente(keyOrId: string): DemandeAchat | null {
  try {
    const all = getDemandesAchatLocal();
    let targetKey = keyOrId;
    if (!all[targetKey]) {
      const foundEntry = Object.entries(all).find(
        ([, d]) =>
          d.id === keyOrId ||
          String(d.vehicleId) === keyOrId ||
          d.or === keyOrId ||
          d.chassis === keyOrId
      );
      if (foundEntry) {
        targetKey = foundEntry[0];
      }
    }

    if (all[targetKey]) {
      all[targetKey] = {
        ...all[targetKey],
        statutAchat: "Attente",
      };

      localStorage.setItem(STORAGE_KEY_DEMANDES_ACHAT, JSON.stringify(all));
      persistSqlSnapshot('purchases', { [targetKey]: all[targetKey] });
      window.dispatchEvent(new Event("demandes_achat_updated"));
      return all[targetKey];
    }
  } catch (e) {
    console.warn("Erreur marquage attente achat:", e);
  }
  return null;
}

export function getDemandeAchatForVehicle(vehicle: Flux): DemandeAchat | null {
  const all = getDemandesAchatLocal();
  const byId = all[String(vehicle.id)];
  if (byId) return byId;
  const or = (vehicle.no || vehicle.l2n2500 || "").trim();
  if (or && all[or]) return all[or];
  const chassis = (vehicle.chassis || "").trim();
  if (chassis && all[chassis]) return all[chassis];
  return null;
}

export async function updateDatabaseStatutAchat(
  row: Flux,
  demande: DemandeAchat,
  nouveauStatut: "Attente" | "Livré" | "Pièce retirée"
) {
  return callSheetWriteAction(row, "updateStatutAchat", {
    ref: demande.ref,
    designation: demande.designation,
    statutAchat: nouveauStatut,
    dateLivraison: demande.dateLivraison || "",
    livrePar: demande.livrePar || "",
  });
}

export async function updateDatabaseStatutDevis(
  row: Flux,
  devis: DemandeDevis,
  nouveauStatut: "En attente accord" | "Client appelé" | "Accepté" | "Refusé" | "Annulé"
) {
  return callSheetWriteAction(row, "updateStatutDevis", {
    numeroDevis: devis.numeroDevis || "",
    statutDevis: nouveauStatut,
    dateAppel: devis.dateAppel || "",
    appelant: devis.appelant || "",
    dateDecision: devis.dateDecision || "",
    or: row.no || row.ordre || devis.or || "",
    chassis: row.chassis || devis.chassis || "",
    client: row.client || devis.client || "",
    modele: row.modele || devis.modele || "",
    immatriculation: row.serie || row.immatriculation || devis.immatriculation || "",
    equipe: row.equipe || devis.equipe || "",
    pieces: devis.pieces || "",
    dateDevis: devis.date || "",
  });
}

export function getNowFormatted(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export async function updateDatabaseAvancement(
  row: Flux,
  avancement: string,
  equipe?: string,
  bloc?: number,
  demandeAchat?: DemandeAchat,
  extraParams?: Record<string, string>,
  demandeDevis?: DemandeDevis
) {
  if (!avancement || avancement === "-") {
    throw new Error("Choisis un avancement valide avant d'enregistrer.");
  }

  const cleanAv = avancement.trim();
  const nowFormatted = getNowFormatted();
  const dateModif = (extraParams?.dateModification || nowFormatted).trim();

  const values: Record<string, string> = {
    avancement: cleanAv,
    dateModification: dateModif,
  };
  if (equipe || row.equipe) {
    values.equipe = (equipe || row.equipe || "").trim();
  }
  const targetBloc = bloc ?? row.bloc;
  if (targetBloc) {
    values.bloc = String(targetBloc);
  }

  // Horodatage systématique selon les 12 statuts demandés :
  // 1. ATENDE DEVIS
  if (cleanAv === "ATENDE DEVIS" || cleanAv.toLowerCase().includes("devis")) {
    values.emplacement = "P";
    values.dateDevis = extraParams?.dateDevis || dateModif;
  }
  // 2. Attente PDR & 4. attends acheter
  else if (cleanAv === "Attente PDR" || cleanAv === "attends acheter") {
    values.dateDemande = extraParams?.dateDemande || dateModif;
  }
  // 3. Technicien réaffecté
  else if (cleanAv === "Technicien réaffecté") {
    values.dateReaffectation = extraParams?.dateReaffectation || dateModif;
  }
  // 5. Essai
  else if (cleanAv === "Essai") {
    values.dateControle = extraParams?.dateControle || dateModif;
    values.dateDebutEssai = extraParams?.dateDebutEssai || dateModif;
  }
  // 6. Terminer
  else if (cleanAv === "Terminer") {
    values.dateFin = extraParams?.dateFin || dateModif;
  }
  // 7 à 12. Transferts VR ("vrElictrique", "vrService Rapide", "vrCarrosserie", "vrDaily", "vrLourd", "vrChangan")
  else if (cleanAv.startsWith("vr")) {
    values.dateTransfert = extraParams?.dateTransfert || dateModif;
  }

  if (demandeAchat) {
    values.ref = demandeAchat.ref;
    values.designation = demandeAchat.designation;
    values.qt = String(demandeAchat.qt);
    values.commentaire = demandeAchat.commentaire || "";
    values.dateDemande = demandeAchat.date || dateModif;
    values.client = demandeAchat.client;
    values.chassis = demandeAchat.chassis;
    values.noOr = demandeAchat.or;
  }

  if (demandeDevis) {
    values.numeroDevis = demandeDevis.numeroDevis;
    values.dateDevis = demandeDevis.date || dateModif;
    values.client = demandeDevis.client;
    values.chassis = demandeDevis.chassis;
    values.noOr = demandeDevis.or;
    values.modele = demandeDevis.modele;
    values.immatriculation = demandeDevis.immatriculation;
    if (demandeDevis.pieces) {
      values.pieces = demandeDevis.pieces;
    }
    if (demandeDevis.commentaire) {
      values.commentaire = demandeDevis.commentaire;
    }
  }

  if (extraParams) {
    Object.assign(values, extraParams);
  }

  if (
    (cleanAv === "Attente réparation" || cleanAv === "Attente Réparation") &&
    !values.etat
  ) {
    values.etat = "Attente réparation";
  }

  return callSheetWriteAction(row, "updateAvancement", values);
}


export async function updateReceptionRowEtat(
  row: {
    noOr: string;
    cs?: string;
    chassis: string;
    sheetRowNumber?: number;
    chargementRowNumber?: number;
    suiviRowNumber?: number;
  },
  etat: WorkshopStatus | string
) {
  const normalizedEtat = etat === "A livré" ? "Livré" : etat;
  return callSheetWriteAction(
    {
      no: row.noOr,
      cs: row.cs,
      chassis: row.chassis,
      sheetRowNumber: row.chargementRowNumber || row.sheetRowNumber,
      rowSuivi: row.suiviRowNumber,
    } as unknown as Flux,
    "updateEtat",
    { etat: normalizedEtat }
  );
}

/** Livraison réception : met etat=Livré + emplacement=Livraison au client + modePaiement en une seule action.
 *  Utilise l'action serveur 'livrerVehicule' accessible au rôle réception. */
export async function livrerVehiculeReception(
  row: {
    noOr: string;
    cs?: string;
    chassis: string;
    chargementRowNumber?: number;
    sheetRowNumber?: number;
    suiviRowNumber?: number;
  },
  modePaiement: string
) {
  return callDatabaseAction<{ ok: boolean; message?: string }>("livrerVehicule", {
    no: row.noOr,
    noOr: row.noOr,
    cs: row.cs || "",
    chassis: row.chassis,
    rowNumber: row.chargementRowNumber || row.sheetRowNumber || "",
    rowSuivi: row.suiviRowNumber || "",
    modePaiement,
  });
}

export async function updateReceptionRowEmplacement(
  row: {
    noOr: string;
    cs?: string;
    chassis: string;
    sheetRowNumber?: number;
    chargementRowNumber?: number;
    suiviRowNumber?: number;
  },
  emplacement: string
) {
  const normalizedEmplacement = normalizeSheetEmplacement(emplacement);
  if (!normalizedEmplacement) {
    throw new Error("Choisis un emplacement avant d'enregistrer.");
  }

  return callSheetWriteAction(
    {
      no: row.noOr,
      cs: row.cs,
      chassis: row.chassis,
      sheetRowNumber: row.chargementRowNumber || row.sheetRowNumber,
      rowSuivi: row.suiviRowNumber,
    } as unknown as Flux,
    "updateEmplacement",
    { emplacement: normalizedEmplacement }
  );
}

export interface PendingAddedFluxVehicle {
  timestamp: number;
  vehicle: Flux;
}

export function registerPendingAddedVehicle(entree: {
  noOr: string;
  cs: string;
  chassis: string;
  codeClient?: string;
  nomClient: string;
  dateEntreeHeure?: string;
  marque: string;
  modele: string;
  categorie?: string;
  equipe?: string;
}): Flux {
  const parts = (entree.dateEntreeHeure || "").split(" ");
  const dateOnly = parts[0] || new Date().toLocaleDateString("fr-FR");
  const heureOnly = parts[1] || "";
  const equipeName = (entree.equipe || "Daily").trim();

  const now = Date.now();
  const newFlux: Flux = {
    id: now,
    sheetRowNumber: 2,
    isPendingNewEntry: true,
    creationTimestamp: now,
    l2n2500: "-",
    cs: entree.cs || "R10",
    date: dateOnly,
    dateEntree: dateOnly,
    heureEntree: heureOnly,
    ordre: entree.noOr,
    no: entree.noOr,
    immatriculation: "-",
    serie: "-",
    marque: entree.marque || "IVECO",
    modele: entree.modele || "-",
    modelePowerBI: entree.modele || "-",
    atelier: entree.categorie || "-",
    categorie: entree.categorie || "-",
    statut: "Attente Réparation",
    etatIntervention: "Attente Réparation",
    operation: "Entrée atelier",
    client: entree.nomClient || "Client non renseigné",
    chassis: entree.chassis,
    technicien: "-",
    nomTechnicien: "-",
    equipe: equipeName,
    equipe1: equipeName,
    avancement: "-",
    avancement1: "-",
    emplacement: calculerEmplacementAutomatique(
      { statut: "Attente Réparation", etatIntervention: "Attente Réparation", equipe: equipeName },
      []
    ),
    bloc: 1,
    nbIntervention: 1,
    montant: 0,
    temps: 0,
    statutAcceptation: "en_attente",
    dateAcceptation: "",
    dateMiseEnAttente: "",
  };

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("flux_pending_new_chargement_entries");
      let list: PendingAddedFluxVehicle[] = raw ? JSON.parse(raw) : [];
      // Garder les ajouts récents (5 dernières minutes) et éviter les doublons
      list = list.filter((p) => now - p.timestamp < 300000 && p.vehicle.no !== newFlux.no);
      list.unshift({ timestamp: now, vehicle: newFlux });
      localStorage.setItem("flux_pending_new_chargement_entries", JSON.stringify(list));
    } catch (_) { }

    window.dispatchEvent(new CustomEvent("flux_new_vehicle_added", { detail: newFlux }));
    window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
  }

  return newFlux;
}

export function mergeRecentAddedVehicles(rows: Flux[]): Flux[] {
  if (typeof window === "undefined") return rows;
  try {
    const raw = localStorage.getItem("flux_pending_new_chargement_entries");
    if (!raw) return rows;

    let list: PendingAddedFluxVehicle[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return rows;

    const now = Date.now();
    const remaining: PendingAddedFluxVehicle[] = [];
    const toPrepend: Flux[] = [];

    for (const item of list) {
      if (now - item.timestamp > 300000) continue; // expiré après 5 minutes

      const matchingRow = rows.find((r) => {
        const sameOr = r.no && item.vehicle.no && r.no.trim().toLowerCase() === item.vehicle.no.trim().toLowerCase();
        const sameChassis = r.chassis && item.vehicle.chassis && r.chassis.trim().toUpperCase() === item.vehicle.chassis.trim().toUpperCase() && r.chassis !== "-";
        return sameOr || sameChassis;
      });

      if (matchingRow) {
        // Déjà indexé et visible dans PostgreSQL : enrichir les métadonnées
        if (!matchingRow.dateEntree || matchingRow.dateEntree === "-") {
          matchingRow.dateEntree = item.vehicle.dateEntree;
        }
        if (!matchingRow.heureEntree || matchingRow.heureEntree === "-") {
          matchingRow.heureEntree = item.vehicle.heureEntree;
        }
        if (!matchingRow.client || matchingRow.client === "-" || matchingRow.client === "Client non renseigné") {
          matchingRow.client = item.vehicle.client;
        }
        if (!matchingRow.chassis || matchingRow.chassis === "-") {
          matchingRow.chassis = item.vehicle.chassis;
        }
        remaining.push(item);
      } else {
        // Pas encore dans le cache API PostgreSQL : maintenir affiché en tête absolue
        item.vehicle.isPendingNewEntry = true;
        item.vehicle.creationTimestamp = item.timestamp;
        remaining.push(item);
        toPrepend.push(item.vehicle);
      }
    }

    localStorage.setItem("flux_pending_new_chargement_entries", JSON.stringify(remaining));
    return [...toPrepend, ...rows];
  } catch (_) {
    return rows;
  }
}

export async function ajouterNouvelleEntree(entree: {
  noOr: string; cs: string; chassis: string; immatriculation?: string; codeClient?: string; nomClient: string;
  dateEntreeHeure?: string; marque: string; modele: string; categorie?: string; equipe?: string; emplacement?: string;
}) {
  assertSheetWriteConfigured();
  registerPendingAddedVehicle(entree);
  const dateEntreeHeure = (entree.dateEntreeHeure || "").trim() || (() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return dd + "/" + mm + "/" + yyyy + " " + hh + ":" + min + ":" + ss;
  })();

  const equipeName = (entree.equipe || "Daily").trim();
  const autoEmp = (entree.emplacement && entree.emplacement !== "-" && entree.emplacement !== "NA")
    ? entree.emplacement
    : calculerEmplacementAutomatique(
        { statut: "Attente Réparation", etatIntervention: "Attente Réparation", equipe: equipeName },
        []
      );

  await callDatabaseAction("ajouterEntree", {
      ...entree,
      noOr: entree.noOr.trim(),
      cs: entree.cs.trim(),
      chassis: entree.chassis.trim().toUpperCase(),
      immatriculation: (entree.immatriculation || "").trim().toUpperCase(),
      codeClient: (entree.codeClient || "").trim(),
      nomClient: (entree.nomClient || "Client non renseigné").trim(),
      dateEntreeHeure,
      marque: entree.marque.trim(),
      modele: entree.modele.trim(),
      categorie: (entree.categorie || "").trim(),
      equipe: equipeName,
      etat: "Attente Réparation",
      statut: "Attente Réparation",
      etatIntervention: "Attente Réparation",
      emplacement: autoEmp,
    });

  // Notifier immédiatement le Chef d'équipe correspondant
  const notifId = `entree_${entree.noOr.trim()}_${entree.chassis.trim().toUpperCase()}`;
  const notif: NouvelleEntreeNotification = {
    id: notifId,
    noOr: entree.noOr.trim(),
    chassis: entree.chassis.trim().toUpperCase(),
    immatriculation: (entree.immatriculation || "").trim().toUpperCase(),
    marque: entree.marque.trim() || "IVECO",
    modele: entree.modele.trim() || "-",
    nomClient: (entree.nomClient || "Client non renseigné").trim(),
    equipe: (entree.equipe || "Daily").trim(),
    cs: entree.cs.trim() || "R18",
    dateEntreeHeure,
    statutAcceptation: "en_attente",
    createdAt: Date.now(),
  };
  saveNouvelleEntreeNotification(notif);

  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
}

/**
 * Actualise à l'instant tout le tableau de chargement :
 * 1. Déclenche la synchronisation automatique serveur SQL (Suivi -> Tableaux de chargement)
 * 2. Récupère immédiatement l'intégralité des véhicules avec cache-buster
 */
export async function synchroniserTableauxDeChargement(): Promise<{
  ok: boolean;
  count: number;
  rows: Flux[];
  message: string;
}> {
  // Lecture instantanée sans cache de tout le tableau de chargement
  const rows = await fetchDatabaseFluxData();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
  }

  return {
    ok: true,
    count: rows.length,
    rows,
    message: `${rows.length} véhicules synchronisés en direct depuis PostgreSQL.`,
  };
}

export interface VinVehicleInfo {
  chassis: string;                         // 1. VIN (N° Châssis) - Col C
  marque: string;                          // 2. Code marque - Col D
  codeMarque?: string;
  modele: string;                          // 3. Code modèle - Col E
  codeModele?: string;
  numModeleVersion?: string;               // 4. N° modèle version - Col F
  descriptionSection?: string;             // 5. Description section analytique modèle - Col G
  categorie: string;                       // Description / catégorie - Col G
  couleurCarrosserie?: string;             // Couleur carrosserie - Col H
  codeCouleur?: string;                    // Code couleur carrosserie - Col I
  immatriculation?: string;                // 7. N° Immatriculation - Col K
  dateMiseCirculation?: string;            // 6. Date de mise en circulation - Col L / B
  dateVente?: string;                      // 8. Date vente - Col AG
  dateLivraison?: string;                  // Date de livraison - Col AH
  codeClient: string;                      // 9. N° client - Col AD
  nomClient: string;                       // 10. Nom du client - Col AF
  source?: "inventory" | "vin";
}

/**
 * Recherche instantanée d'un véhicule dans l'onglet VIN de PostgreSQL
 * Récupère l'ensemble des caractéristiques alignées sur la feuille :
 * Col C: VIN, Col D: Marque, Col E: Modèle, Col F: Version, Col G: Description,
 * Col H: Couleur, Col I: Code couleur, Col K: Immatriculation, Col L/B: Date MEC,
 * Col AD: N° Client, Col AF: Nom Client, Col AG: Date vente, Col AH: Date livraison.
 */
export async function searchVehicleByVin(query: string): Promise<VinVehicleInfo | null> {
  const clean = query.trim().toUpperCase();
  if (clean.length < 3) return null;
  try {
    const invRes = await fetch(`/api/inventory/vehicles/lookup?q=${encodeURIComponent(clean)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (invRes.ok) {
      const invData = await invRes.json() as { ok: boolean; vehicle: VinVehicleInfo | null; source?: "inventory" | "vin" };
      if (invData && invData.ok && invData.vehicle) {
        return { ...invData.vehicle, source: invData.source || "inventory" };
      }
    }
  } catch (invErr) {
    console.warn("Recherche inventaire véhicules impossible:", invErr);
  }
  try {
    const response = await fetch("/api/data/vin", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    const vehicles = await response.json() as VinVehicleInfo[];
    return vehicles.find((vehicle) => String(vehicle.chassis || "").toUpperCase().includes(clean)) || null;
  } catch (error) {
    console.warn("Recherche VIN PostgreSQL impossible:", error);
    return null;
  }
}

export interface NouveauVinPayload {
  chassis: string;                         // 1. VIN (N° Châssis)
  codeMarque: string;                      // 2. Code marque
  codeModele: string;                      // 3. Code modèle
  numModeleVersion?: string;               // 4. N° modèle version
  descriptionSection?: string;             // 5. Description section analytique modèle
  couleurCarrosserie?: string;             // Couleur carrosserie - Col H
  codeCouleur?: string;                    // Code couleur carrosserie - Col I
  dateMiseCirculation?: string;            // 6. Date de mise en circulation - Col L / B
  immatriculation?: string;                // 7. N° Immatriculation - Col K
  dateVente?: string;                      // 8. Date vente - Col AG
  dateLivraison?: string;                  // Date de livraison - Col AH
  codeClient?: string;                     // 9. N° client - Col AD
  nomClient?: string;                      // 10. Nom du client - Col AF
  // Compatibilité ascendante
  marque?: string;
  modele?: string;
  categorie?: string;
  couleur?: string;
}

/**
 * Enregistre un nouveau véhicule dans l'onglet "VIN" de PostgreSQL.
 * Prend en charge les colonnes alignées :
 * VIN (C), Code marque (D), Code modèle (E), N° version (F), Description (G),
 * Couleur (H), Code couleur (I), Immat (K), Date MEC (L), N° client (AD),
 * Nom client (AF), Date vente (AG), Date livraison (AH).
 */
function normalizeVinPayload(payload: NouveauVinPayload): NouveauVinPayload {
  const marque = (payload.codeMarque || payload.marque || "IVECO").trim();
  const modele = (payload.codeModele || payload.modele || "").trim();
  const categorie = (payload.descriptionSection || payload.categorie || "").trim();
  return { ...payload, chassis: payload.chassis.trim().toUpperCase(), marque, codeMarque: marque, modele, codeModele: modele, categorie, descriptionSection: categorie };
}

export async function ajouterNouveauVin(payload: NouveauVinPayload): Promise<{ ok: boolean; message?: string; vsn?: string }> {
  assertSheetWriteConfigured();
  const result = await callDatabaseAction<{ ok: boolean; message?: string; vsn?: string }>("ajouterVin", { payload: normalizeVinPayload(payload) as unknown as Record<string, unknown> });
  return { ok: true, message: result.message, vsn: result.vsn };
}

export async function modifierVin(payload: NouveauVinPayload): Promise<{ ok: boolean; message?: string }> {
  assertSheetWriteConfigured();
  const result = await callDatabaseAction<{ ok: boolean; message?: string }>("modifierVin", { payload: normalizeVinPayload(payload) as unknown as Record<string, unknown> });
  return { ok: true, message: result.message };
}

export interface ModifierEntreePayload {
  noOr: string; cs: string; chassis: string; codeClient?: string; nomClient?: string; dateEntreeHeure?: string;
  marque?: string; modele?: string; categorie?: string; etat?: string; equipe?: string; emplacement?: string;
  rowSuivi?: number; rowNumber?: number; origNo?: string; origCs?: string; origChassis?: string;
}

export async function modifierDossierEntree(payload: ModifierEntreePayload): Promise<{ ok: boolean; message?: string }> {
  assertSheetWriteConfigured();
  const cleanNo = (payload.noOr || "").trim() === "-" ? "" : (payload.noOr || "").trim();
  const cleanCs = (payload.cs || "").trim() === "-" ? "" : (payload.cs || "").trim();
  const cleanChassis = (payload.chassis || "").trim().toUpperCase() === "-" ? "" : (payload.chassis || "").trim().toUpperCase();
  const result = await callDatabaseAction<{ ok: boolean; message?: string }>("modifierEntree", {
    ...payload, noOr: cleanNo, no: cleanNo, cs: cleanCs, chassis: cleanChassis,
    marque: (payload.marque || "IVECO").trim(), modele: (payload.modele || "").trim(), categorie: (payload.categorie || "").trim(),
  });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
  return { ok: true, message: result.message };
}

export interface SupprimerEntreePayload {
  id?: string | number;
  recordKey?: string;
  noOr: string;
  cs: string;
  chassis: string;
  immatriculation?: string;
  rowSuivi?: number;
  rowNumber?: number;
}

export async function supprimerDossierEntree(payload: SupprimerEntreePayload): Promise<{ ok: boolean; message?: string }> {
  assertSheetWriteConfigured();
  const noOr = (payload.noOr || "").trim() === "-" ? "" : (payload.noOr || "").trim();
  const cs = (payload.cs || "").trim() === "-" ? "" : (payload.cs || "").trim();
  const chassis = (payload.chassis || "").trim().toUpperCase() === "-" ? "" : (payload.chassis || "").trim().toUpperCase();
  const id = payload.id !== undefined && payload.id !== null ? String(payload.id).trim() : "";
  const immat = (payload.immatriculation || "").trim() === "-" ? "" : (payload.immatriculation || "").trim();
  const result = await callDatabaseAction<{ ok: boolean; message?: string }>("supprimerEntree", {
    ...payload,
    id,
    recordKey: payload.recordKey || id,
    noOr,
    no: noOr,
    cs,
    chassis,
    immatriculation: immat,
  });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
  return { ok: true, message: result.message };
}
