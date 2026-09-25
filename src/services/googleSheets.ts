import {
  statusMeta,
  type Flux,
  type WorkshopStatus,
} from "../data/mockData";
import { type AuthorizedAccount } from "../config/accounts";
import { type RoleType } from "../types/roles";

export const DEFAULT_SHEET_ID = "1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c";
export const DEFAULT_SHEET_GID = "294141427";
export const DEFAULT_SUIVI_GID = "748226721";
export const DEFAULT_VIN_GID = "737549566";
export const DEFAULT_MOYENNES_GID = "965668700";

const SHEET_ID =
  String(import.meta.env.VITE_SHEET_ID ?? DEFAULT_SHEET_ID).trim() ||
  DEFAULT_SHEET_ID;
const SHEET_GID =
  String(import.meta.env.VITE_SHEET_GID ?? DEFAULT_SHEET_GID).trim() ||
  DEFAULT_SHEET_GID;
const SUIVI_GID =
  String(import.meta.env.VITE_SUIVI_GID ?? DEFAULT_SUIVI_GID).trim() ||
  DEFAULT_SUIVI_GID;
const VIN_GID =
  String(import.meta.env.VITE_VIN_GID ?? DEFAULT_VIN_GID).trim() ||
  DEFAULT_VIN_GID;
const MOYENNES_GID =
  String(import.meta.env.VITE_MOYENNES_GID ?? DEFAULT_MOYENNES_GID).trim() ||
  DEFAULT_MOYENNES_GID;

export const VEHICLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`;
export const SUIVI_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SUIVI_GID}#gid=${SUIVI_GID}`;
export const VIN_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${VIN_GID}#gid=${VIN_GID}`;
export const MOYENNES_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${MOYENNES_GID}#gid=${MOYENNES_GID}`;

export const DELIVERED_EMPLACEMENT = "Livraison au client";

const BASE_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;

export function getSheetWriteUrl(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("flux_sheet_write_url");
    if (saved && saved.trim()) return saved.trim();
  }
  return String(import.meta.env.VITE_SHEET_WRITE_URL ?? "").trim();
}

export function setSheetWriteUrl(url: string): void {
  if (typeof window !== "undefined") {
    if (url && url.trim()) {
      localStorage.setItem("flux_sheet_write_url", url.trim());
    } else {
      localStorage.removeItem("flux_sheet_write_url");
    }
  }
}

export function getSheetWriteToken(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("flux_sheet_write_token");
    if (saved !== null && saved.trim()) return saved.trim();
  }
  return String(import.meta.env.VITE_SHEET_WRITE_TOKEN ?? "").trim();
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
]);

type GvizCell = {
  f?: string;
  v?: unknown;
};

type GvizColumn = {
  id?: string;
  label?: string;
};

type GvizRow = {
  c?: Array<GvizCell | null>;
};

type GvizResponse = {
  table?: {
    cols?: GvizColumn[];
    rows?: GvizRow[];
  };
};

type SheetWriteResponse = {
  ok?: boolean;
  error?: string;
  emplacement?: string;
  etat?: string;
  rowNumber?: number;
};

const statusKeys = new Map(
  statusMeta.map((status) => [normalizeKey(status.label), status.label])
);

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellToText(cell: GvizCell | null | undefined) {
  if (!cell) return "";

  if (cell.f !== undefined && cell.f !== null) {
    return String(cell.f).trim();
  }

  if (cell.v !== undefined && cell.v !== null) {
    return String(cell.v).trim();
  }

  return "";
}

function parseNumber(value: string) {
  const normalized = value
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeSheetEmplacement(value: string) {
  const normalizedValue = String(value || "").toUpperCase().trim().replace(/\s/g, "");

  if (!normalizedValue || normalizedValue === "NA" || normalizedValue.startsWith("#")) {
    return "NA";
  }

  if (normalizedValue === "LIVRAISONAUCLIENT") {
    return DELIVERED_EMPLACEMENT;
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

function readField(
  row: Record<string, string>,
  candidates: string[],
  fallback = ""
) {
  const normalizedCandidates = candidates.map(normalizeKey);
  const exactKey = normalizedCandidates.find((candidate) => row[candidate]);

  if (exactKey) return row[exactKey];

  const fuzzyKey = Object.keys(row).filter(Boolean).find((key) =>
    normalizedCandidates.some(
      (candidate) => key.includes(candidate) || candidate.includes(key)
    )
  );

  return fuzzyKey ? row[fuzzyKey] : fallback;
}

function getValidField(
  row: Record<string, string>,
  candidates: string[],
  fallback = "-"
) {
  for (const candidate of candidates) {
    const val = readField(row, [candidate]);
    if (val && val !== "-" && val !== "NA" && val.trim().length > 0) {
      return val.trim();
    }
  }

  return fallback;
}

function normalizeStatus(value: string): WorkshopStatus {
  const key = normalizeKey(value);
  if (!key || key === "-" || key === "na") return "Attente Réparation";
  const exact = statusKeys.get(key);
  if (exact) return exact;

  if (key.includes("livr") || key.includes("pret")) return "Livré";
  if (key.includes("travauxexterieur") || key.includes("exterieur")) {
    return "Travaux Exterieurs";
  }
  if (key.includes("attenteclient") || (key.includes("attente") && key.includes("client"))) {
    return "Attente Client";
  }
  if (key.includes("pdr") || key.includes("piece") || key.includes("repar")) {
    return "Attente Réparation";
  }
  if (key.includes("termin")) return "Livré";
  if (key.includes("attente")) return "Attente Client";
  if (key.includes("cours")) return "En cours";

  return "Attente Réparation";
}

function extractGvizJson(rawText: string): GvizResponse {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Réponse Google Sheets invalide.");
  }

  return JSON.parse(rawText.slice(start, end + 1)) as GvizResponse;
}

function parseGvizRows(response: GvizResponse): Flux[] {
  const table = response.table;
  const columns = table?.cols ?? [];
  const rows = table?.rows ?? [];
  const headers = columns.map((column, index) => {
    const label = column.label || column.id || `col${index + 1}`;
    return normalizeKey(label || `col${index + 1}`);
  });

  const parsedRows = rows
    .map<Flux | null>((row, index) => {
      const cells = row.c ?? [];
      const raw = headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
        acc[header] = cellToText(cells[cellIndex]);
        return acc;
      }, {});
      const hasSheetData = Object.values(raw).some((value) => value.trim());

      if (!hasSheetData) {
        return null;
      }

      const l2n2500 = readField(raw, [
        "OR",
        "L2:N2500",
        "L2 N2500",
        "L2N2500",
      ]);
      const sheetCs = readField(raw, ["CS"]);
      const parsedNo = readField(raw, [
        "N° OR",
        "No OR",
        "N OR",
        "No",
        "N°",
        "N ordre",
        "Numero ordre",
        "Ordre",
      ]);
      const chassisField = readField(raw, [
        "Châssis",
        "Chassis",
        "N° Chassis",
        "N° Châssis",
        "VIN",
      ]);
      const clientRaw = readField(raw, ["Client", "Nom client"]);

      // Un véhicule valide DOIT obligatoirement avoir soit un N° OR, soit un CS, soit un Châssis, soit un Client
      const hasRealVehicle = Boolean(
        (parsedNo && parsedNo !== "-") ||
        (l2n2500 && l2n2500 !== "-") ||
        (sheetCs && sheetCs !== "-") ||
        (chassisField && chassisField !== "-") ||
        (clientRaw && clientRaw !== "-" && clientRaw !== "Client non renseigné")
      );

      if (!hasRealVehicle) {
        return null;
      }

      const no =
        parsedNo ||
        l2n2500 ||
        sheetCs ||
        `SHEET-${index + 1}`;
      const serie =
        readField(raw, [
          "Série",
          "Serie",
          "Immatriculation",
          "Plaque",
          "Matricule Véhicule",
          "Matricule Vehicule",
        ]) ||
        no.slice(-5);
      const emplacement = normalizeSheetEmplacement(readField(raw, [
        "Emplacement",
        "Place",
        "Zone",
        "Position",
        "Poste",
      ]));
      const client = clientRaw || "Client non renseigné";
      const modele = readField(raw, ["Modèle", "Modele", "Modele Power BI"], "-");
      const dateEntreeBrute = getValidField(
        raw,
        [
          "Date entrée",
          "Date entree",
          "Date",
          "Date Début Rép 1",
          "Date Début Rép",
          "Date Debut Rep 1",
          "Date Debut Rep",
        ],
        "-"
      );
      let dateEntree = dateEntreeBrute;
      let heureEntree = readField(
        raw,
        ["Heure entrée", "Heure entree", "Heure"],
        "-"
      );

      if (heureEntree === "-" && dateEntreeBrute.includes(" ")) {
        const parts = dateEntreeBrute.split(/\s+/);
        dateEntree = parts[0] || dateEntreeBrute;
        heureEntree = parts.slice(1).join(" ") || "-";
      }

      if ((!dateEntree || dateEntree === "-") && index === 0) {
        const nowD = new Date();
        const dd = String(nowD.getDate()).padStart(2, "0");
        const mm = String(nowD.getMonth() + 1).padStart(2, "0");
        const yyyy = nowD.getFullYear();
        dateEntree = `${dd}/${mm}/${yyyy}`;
      }

      const marque = readField(raw, ["Marque"], "IVECO");
      const categorie = readField(raw, ["Catégorie", "Categorie"], "-");
      const eq1 = readField(raw, ["EQUIPE 1", "Équipe 1", "Equipe 1"]);
      const eq2 = readField(raw, ["EQUIPE 2", "Équipe 2", "Equipe 2"]);
      const eq3 = readField(raw, ["EQUIPE 3", "Équipe 3", "Equipe 3"]);

      const mat1 = readField(raw, ["N°Matricule 1", "Matricule 1"]);
      const mat2 = readField(raw, ["N°Matricule 2", "Matricule 2"]);
      const mat3 = readField(raw, ["N°Matricule 3", "Matricule 3"]);

      const nom1 = readField(raw, ["NOM DE Technicien 1", "Nom Technicien 1"]);
      const nom2 = readField(raw, ["NOM DE Technicien 2", "Nom Technicien 2"]);
      const nom3 = readField(raw, ["NOM De Technicien 3", "Nom Technicien 3"]);

      const av1 = readField(raw, ["AVANCEMENT 1", "Avancement 1"]);
      const av2 = readField(raw, ["AVANCEMENT 2", "Avancement 2"]);
      const av3 = readField(raw, ["AVANCEMENT 3", "Avancement 3"]);

      const fin1 = readField(raw, ["Date Fin Rép 1", "Date Fin Rep 1"]);
      const fin2 = readField(raw, ["Date Fin Rép 2", "Date Fin Rep 2"]);
      const fin3 = readField(raw, ["Date Fin Rép 3", "Date Fin Rep 3"]);

      const hasValidValue = (val?: string): boolean => {
        if (!val) return false;
        const s = val.trim();
        return s !== "" && s !== "-" && s !== "NA" && s !== "#N/A" && s !== "undefined" && s !== "null";
      };

      const normAv1 = (av1 || "").trim().toLowerCase();
      const isBloc1Fini = Boolean(
        (hasValidValue(av1) && (normAv1.startsWith("vr") || normAv1 === "terminer")) ||
        (hasValidValue(fin1) && hasValidValue(av1))
      );
      const normAv2 = (av2 || "").trim().toLowerCase();
      const isBloc2Fini = Boolean(
        (hasValidValue(av2) && (normAv2.startsWith("vr") || normAv2 === "terminer")) ||
        (hasValidValue(fin2) && hasValidValue(av2))
      );

      let activeBloc: 1 | 2 | 3 = 1;
      if (isBloc1Fini && isBloc2Fini) {
        activeBloc = 3;
      } else if (isBloc1Fini) {
        activeBloc = 2;
      } else {
        activeBloc = 1;
      }

      const getVrTargetTeam = (vr: string): string => {
        const v = vr.toLowerCase();
        if (v.includes("changan")) return "Changan";
        if (v.includes("daily")) return "Daily1";
        if (v.includes("lourd")) return "Lourd";
        if (v.includes("service rapide") || v.includes("serv")) return "Service Rapide";
        if (v.includes("carrosserie") || v.includes("carross")) return "Carrosserie";
        if (v.includes("elictrique") || v.includes("electrique")) return "Elictrique";
        return "";
      };

      let technicien = "-";
      let nomTechnicien = "-";
      let equipe = "-";
      let avancement = "-";
      let dateFinRep = "-";

      if (activeBloc === 3) {
        equipe = (hasValidValue(eq3) ? eq3 : "") || (av2 ? getVrTargetTeam(av2) : "") || (hasValidValue(eq2) ? eq2 : "") || (hasValidValue(eq1) ? eq1 : "") || "-";
        technicien = hasValidValue(mat3) ? mat3 : "-";
        nomTechnicien = hasValidValue(nom3) ? nom3 : "-";
        avancement = hasValidValue(av3) ? av3 : (hasValidValue(mat3) ? "En cours - 10%" : "-");
        dateFinRep = hasValidValue(fin3) ? fin3 : "-";
      } else if (activeBloc === 2) {
        equipe = (hasValidValue(eq2) ? eq2 : "") || (av1 ? getVrTargetTeam(av1) : "") || (hasValidValue(eq1) ? eq1 : "") || "-";
        technicien = hasValidValue(mat2) ? mat2 : "-";
        nomTechnicien = hasValidValue(nom2) ? nom2 : "-";
        avancement = hasValidValue(av2) ? av2 : (hasValidValue(mat2) ? "En cours - 10%" : "-");
        dateFinRep = hasValidValue(fin2) ? fin2 : "-";
      } else {
        equipe = hasValidValue(eq1) ? eq1 : "-";
        technicien = hasValidValue(mat1) ? mat1 : "-";
        nomTechnicien = hasValidValue(nom1) ? nom1 : "-";
        avancement = hasValidValue(av1) ? av1 : "-";
        dateFinRep = hasValidValue(fin1) ? fin1 : "-";
      }
      const cleVehicule = readField(raw, ["Clé véhicule", "Cle vehicule"]);
      const prioriteIntervention = readField(raw, [
        "Priorité intervention",
        "Priorite intervention",
      ]);
      const lignePrincipale = readField(raw, [
        "Ligne principale",
        "Principal",
        "Principale",
      ]);
      let etatIntervention = normalizeStatus(
        readField(raw, ["Etat Intervention", "Etat", "Statut", "Status"])
      );
      // Si un bloc secondaire (bloc 2 ou 3) ou le véhicule a un technicien affecté, l'intervention est En cours
      if (
        etatIntervention !== "Essai" &&
        etatIntervention !== "attends acheter" &&
        etatIntervention !== "Livré" &&
        etatIntervention !== "Attente Client"
      ) {
        if (hasValidValue(technicien) && technicien !== "-") {
          etatIntervention = "En cours";
        } else if (avancement.toLowerCase().startsWith("en cours") || avancement.includes("%")) {
          etatIntervention = "En cours";
        }
      }

      return {
        id: index + 1,
        sheetRowNumber: index + 2,
        l2n2500,
        cs: sheetCs,
        cleVehicule,
        prioriteIntervention,
        lignePrincipale,
        date: dateEntree,
        ordre: no,
        immatriculation: serie,
        marque,
        modele,
        atelier: readField(raw, ["Atelier", "Catégorie", "Categorie"], categorie),
        operation: readField(
          raw,
          [
            "Type d'Intervention",
            "Type Intervention",
            "Description Travail",
            "Operation",
            "Opération",
            "Intervention",
          ],
          "-"
        ),
        statut: etatIntervention,
        montant: parseNumber(readField(raw, ["Montant", "Prix", "Total"])),
        temps: parseNumber(
          readField(raw, [
            "Temps Rép. (h)",
            "Temps Rep h",
            "Durée Immob. (h)",
            "Duree Immob h",
            "Temps",
            "Heures",
            "Durée",
            "Duree",
          ])
        ),
        no,
        nbIntervention: Math.max(
          1,
          Math.round(parseNumber(readField(raw, ["NB Intervention", "Nb intervention"])))
        ),
        client,
        modelePowerBI: modele,
        categorie,
        chassis: readField(raw, ["N° Chassis", "No Chassis", "Châssis", "Chassis", "VIN"], "-"),
        dateEntree,
        heureEntree,
        technicien,
        nomTechnicien,
        equipe,
        avancement,
        dateFinRep,
        etatIntervention,
        emplacement: emplacement || "NA",
        serie,
        bloc: activeBloc,
        avancement1: av1 || "-",
        avancement2: av2 || "-",
        avancement3: av3 || "-",
        equipe1: eq1 || "-",
        equipe2: eq2 || "-",
        equipe3: eq3 || "-",
      };
    })
    .filter((row): row is Flux => Boolean(row))
    .filter((row) =>
      [row.l2n2500, row.cs, row.client, row.chassis, row.emplacement, row.serie].some(
        (value) => value && value !== "-" && value !== "NA"
      )
    );

  return parsedRows;
}

function makeGvizUrl(responseHandler?: string, gid = SHEET_GID) {
  const tqx = responseHandler
    ? `out:json;responseHandler:${responseHandler}`
    : "out:json";

  return `${BASE_GVIZ_URL}?gid=${gid}&headers=1&tqx=${encodeURIComponent(tqx)}&_t=${Date.now()}`;
}

async function fetchWithCors(gid = SHEET_GID) {
  const response = await fetch(makeGvizUrl(undefined, gid), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google Sheets a répondu ${response.status}.`);
  }

  return extractGvizJson(await response.text());
}

function cleanupJsonp(
  timer: number | undefined,
  jsonpWindow: Record<string, any>,
  callbackName: string,
  script?: HTMLScriptElement
) {
  if (timer) window.clearTimeout(timer);
  if (jsonpWindow && callbackName) {
    jsonpWindow[callbackName] = () => {
      try {
        delete jsonpWindow[callbackName];
      } catch (_) {}
    };
  }
  if (script) {
    try {
      script.remove();
    } catch (_) {}
  }
}

function fetchWithJsonp(gid = SHEET_GID) {
  return new Promise<GvizResponse>((resolve, reject) => {
    const callbackName = `__fluxAtelierSheet_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const jsonpWindow = window as unknown as Window &
      Record<string, ((response: GvizResponse) => void) | undefined>;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("La feuille Google Sheets ne répond pas."));
    }, 15000);

    function cleanup() {
      cleanupJsonp(timeout, jsonpWindow, callbackName, script);
    }

    jsonpWindow[callbackName] = (response) => {
      cleanup();
      resolve(response);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Impossible de charger la feuille Google Sheets."));
    };
    script.src = makeGvizUrl(callbackName, gid);

    document.head.appendChild(script);
  });
}

function parseSuiviGvizRows(response: GvizResponse): SuiviEntree[] {
  const table = response.table;
  const columns = table?.cols ?? [];
  const rows = table?.rows ?? [];
  const headers = columns.map((col, index) => {
    const label = col.label || col.id || `col${index + 1}`;
    return normalizeKey(label);
  });

  const results: SuiviEntree[] = [];

  rows.forEach((row, index) => {
    const cells = row.c ?? [];
    const raw = headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
      acc[header] = cellToText(cells[cellIndex]);
      return acc;
    }, {});

    const noOr = readField(raw, ["N° OR", "No OR", "N OR", "OR"]);
    const cs = readField(raw, ["CS"]);
    const chassis = readField(raw, ["N° Chassis", "No Chassis", "Châssis", "Chassis"]);
    const immatriculation = readField(raw, [
      "N° Immatriculation",
      "No Immatriculation",
      "Immatriculation",
      "Immat",
      "Série",
      "Serie",
      "Plaque",
      "Matricule Véhicule",
    ]);
    const codeClient = readField(raw, ["Code client", "Code"]);
    const nomClient = readField(raw, ["nom Client", "Nom client", "Client"]);
    const dateEntreeHeure = readField(raw, ["Date Entrée et Heure", "Date Entree et Heure", "Date entrée", "Date"]);
    const marque = readField(raw, ["Marque"], "IVECO");
    const modele = readField(raw, ["Modèle", "Modele"]);
    const categorie = readField(raw, ["Catégorie", "Categorie"]);
    const equipe = readField(raw, ["EQUIPE", "Équipe", "Equipe"]);
    const technicien = readField(raw, ["Technicien"]);
    const nomTechnicien = readField(raw, ["NOM DE Technicien", "Nom Technicien"]);
    const dateDebutRep = readField(raw, ["Date Début Rép", "Date Debut Rep"]);
    const avancement = readField(raw, ["AvANCEMENT", "Avancement"]);
    const dateFinRep = readField(raw, ["Date Fin Rép", "Date Fin Rep"]);
    const heureFin = readField(raw, ["Heure Fin"]);
    const etat = readField(raw, ["Etat", "État"]);
    const retourClient = readField(raw, ["Retour Client"]);

    const hasContent = Boolean(noOr || chassis || nomClient || cs || immatriculation);
    if (!hasContent) return;

    results.push({
      id: index + 1,
      sheetRowNumber: index + 2,
      noOr,
      cs,
      chassis,
      immatriculation,
      codeClient,
      nomClient,
      dateEntreeHeure,
      marque,
      modele,
      categorie,
      equipe,
      technicien,
      nomTechnicien,
      dateDebutRep,
      avancement,
      dateFinRep,
      heureFin,
      etat,
      retourClient,
    });
  });

  return results;
}

export async function fetchGoogleSheetFluxData() {
  const response = await fetchWithCors(SHEET_GID).catch(() => fetchWithJsonp(SHEET_GID));
  const rows = parseGvizRows(response);

  if (rows.length === 0) {
    throw new Error("Aucune ligne exploitable dans la feuille Google Sheets.");
  }

  return rows;
}

export async function fetchSuiviEntreesData() {
  const response = await fetchWithCors(SUIVI_GID).catch(() => fetchWithJsonp(SUIVI_GID));
  const rows = parseSuiviGvizRows(response);

  return rows;
}

export interface EquipeMember {
  team: string;
  name: string;
  poste: string;
  matricule: string;
}

export interface EquipeSheetResult {
  members: EquipeMember[];
  chefsEquipe: EquipeMember[];
  teamByMemberName: Map<string, string>;
}

export const DEFAULT_EQUIPE_MAPPINGS: EquipeMember[] = [
  // 1. Daily1
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
  if (clean.includes("CHANGAN") || clean.includes("AMEN")) return "Changan";
  return "Daily1";
}

const CUSTOM_EQUIPES_KEY = "flux_atelier_equipes_custom";

export function getCustomEquipeMembers(): EquipeMember[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CUSTOM_EQUIPES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Ignored
  }
  return null;
}

export function saveCustomEquipeMembers(members: EquipeMember[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_EQUIPES_KEY, JSON.stringify(members));
  } catch (err) {
    console.warn("Erreur sauvegarde équipes locales:", err);
  }
}

export function resetCustomEquipeMembers(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CUSTOM_EQUIPES_KEY);
  } catch (err) {
    console.warn("Erreur réinitialisation équipes locales:", err);
  }
}

export async function fetchEquipeSheetData(): Promise<EquipeSheetResult> {
  const customMembers = getCustomEquipeMembers();
  if (customMembers && customMembers.length > 0) {
    const teamByMemberName = new Map<string, string>();
    customMembers.forEach((m) => {
      teamByMemberName.set(normalizePersonName(m.name), m.team);
    });
    return {
      members: customMembers,
      chefsEquipe: customMembers.filter((m) =>
        m.poste.toUpperCase().includes("CHEF")
      ),
      teamByMemberName,
    };
  }

  const tqx = "out:json";
  const url = `${BASE_GVIZ_URL}?sheet=EQUIPE&headers=1&tqx=${encodeURIComponent(tqx)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Erreur HTTP " + res.status);
    const text = await res.text();
    const json = extractGvizJson(text);

    const rows = json.table?.rows ?? [];

    const members: EquipeMember[] = [];
    const teamByMemberName = new Map<string, string>();

    function addMember(team: string, mat: unknown, nom: unknown, poste: unknown) {
      if (
        nom &&
        typeof nom === "string" &&
        nom.trim() &&
        !nom.toLowerCase().includes("technicien") &&
        !nom.toLowerCase().includes("colonne") &&
        !nom.toLowerCase().includes("correspondance")
      ) {
        const cleanName = nom.trim();
        members.push({
          team,
          name: cleanName,
          poste: String(poste || "").trim(),
          matricule: mat ? String(mat).trim() : "",
        });
        teamByMemberName.set(normalizePersonName(cleanName), team);
      }
    }

    // Group 1 (Cols A-B-C: 0, 1, 2): Daily1 (rows 1-6), Service Rapide (rows 11-12)
    for (let r = 1; r <= 6; r++) {
      addMember("Daily1", rows[r]?.c?.[0]?.v, rows[r]?.c?.[1]?.v, rows[r]?.c?.[2]?.v);
    }
    for (let r = 11; r <= 12; r++) {
      addMember("Service Rapide", rows[r]?.c?.[0]?.v, rows[r]?.c?.[1]?.v, rows[r]?.c?.[2]?.v);
    }

    // Group 2 (Cols E-F-G: 4, 5, 6): Daily2 (rows 1-2), Lourd (rows 6-11)
    for (let r = 1; r <= 2; r++) {
      addMember("Daily2", rows[r]?.c?.[4]?.v, rows[r]?.c?.[5]?.v, rows[r]?.c?.[6]?.v);
    }
    for (let r = 6; r <= 11; r++) {
      addMember("Lourd", rows[r]?.c?.[4]?.v, rows[r]?.c?.[5]?.v, rows[r]?.c?.[6]?.v);
    }

    // Group 3 (Cols I-J-K: 8, 9, 10): Changan (rows 1-2), Carrosserie (rows 7-8), Elictrique (rows 13-14)
    for (let r = 1; r <= 2; r++) {
      addMember("Changan", rows[r]?.c?.[8]?.v, rows[r]?.c?.[9]?.v, rows[r]?.c?.[10]?.v);
    }
    for (let r = 7; r <= 8; r++) {
      addMember("Carrosserie", rows[r]?.c?.[8]?.v, rows[r]?.c?.[9]?.v, rows[r]?.c?.[10]?.v);
    }
    for (let r = 13; r <= 14; r++) {
      addMember("Elictrique", rows[r]?.c?.[8]?.v, rows[r]?.c?.[9]?.v, rows[r]?.c?.[10]?.v);
    }

    // Safety merge: ensure every known default member/technician is included
    DEFAULT_EQUIPE_MAPPINGS.forEach((def) => {
      const exists = members.some(
        (m) =>
          normalizePersonName(m.name) === normalizePersonName(def.name) ||
          (def.matricule && m.matricule === def.matricule)
      );
      if (!exists) {
        members.push(def);
        teamByMemberName.set(normalizePersonName(def.name), def.team);
      }
    });

    const chefsEquipe = members.filter((m) =>
      m.poste.toUpperCase().includes("CHEF")
    );

    return { members, chefsEquipe, teamByMemberName };
  } catch (err) {
    console.warn("Chargement distant EQUIPE échoué, fallback sur données intégrées:", err);
    const teamByMemberName = new Map<string, string>();
    DEFAULT_EQUIPE_MAPPINGS.forEach((m) => {
      teamByMemberName.set(normalizePersonName(m.name), m.team);
    });
    return {
      members: DEFAULT_EQUIPE_MAPPINGS,
      chefsEquipe: DEFAULT_EQUIPE_MAPPINGS.filter((m) =>
        m.poste.toUpperCase().includes("CHEF")
      ),
      teamByMemberName,
    };
  }
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
    const rawGviz = await fetchWithCors(MOYENNES_GID).catch(() => fetchWithJsonp(MOYENNES_GID));
    const rows = rawGviz?.table?.rows || [];
    if (!rows.length) {
      return DEFAULT_MOYENNES_DATA;
    }

    let annee = 2026;
    let mois = 9;
    const equipes: MoyennesRow[] = [];
    let equipesTotal: MoyennesRow | undefined = undefined;
    const modeles: MoyennesRow[] = [];
    let modelesTotal: MoyennesRow | undefined = undefined;
    const correspondances: ModeleCorrespondance[] = [];

    let currentSection: "" | "equipe" | "modele" = "";

    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r]?.c || [];
      const cell0 = cells[0]?.v !== undefined && cells[0]?.v !== null ? String(cells[0].v).trim() : "";
      const cell1 = cells[1]?.v !== undefined && cells[1]?.v !== null ? cells[1].v : null;

      if (cell0.toLowerCase() === "année" && cell1) {
        annee = Number(cell1) || 2026;
      }
      if (cell0.toLowerCase() === "mois" && cell1) {
        mois = Number(cell1) || 9;
      }

      if (cell0.toUpperCase() === "EQUIPE") {
        currentSection = "equipe";
        continue;
      }
      if (cell0.toLowerCase().includes("modèle") || cell0.toLowerCase().includes("modele")) {
        currentSection = "modele";
        continue;
      }

      // Correspondances in cols 35 and 36
      const codeMod = cells[35]?.v ? String(cells[35].v).trim() : "";
      const familleMod = cells[36]?.v ? String(cells[36].v).trim() : "";
      if (codeMod && familleMod && codeMod !== "Code Modèle" && codeMod !== "CORRESPONDANCE DES MODÈLES") {
        correspondances.push({ codeModele: codeMod, famille: familleMod });
      }

      if (cell0 && (currentSection === "equipe" || currentSection === "modele")) {
        const days: number[] = [];
        for (let d = 1; d <= 31; d++) {
          const val = cells[d]?.v;
          days.push(typeof val === "number" ? val : (Number(val) || 0));
        }
        const totalVal = cells[32]?.v;
        const total = typeof totalVal === "number" ? totalVal : (Number(totalVal) || days.reduce((a, b) => a + b, 0));

        let moyVal = cells[33]?.v;
        if (typeof moyVal === "string") {
          moyVal = parseFloat(moyVal.replace(",", "."));
        }
        const moyenne = typeof moyVal === "number" && !isNaN(moyVal) ? moyVal : 0;

        const rowObj: MoyennesRow = {
          name: cell0,
          days,
          total,
          moyenne,
          isTotal: cell0.toLowerCase() === "total",
        };

        if (currentSection === "equipe") {
          if (cell0.toLowerCase() === "total") {
            equipesTotal = rowObj;
          } else {
            equipes.push(rowObj);
          }
        } else if (currentSection === "modele") {
          if (cell0.toLowerCase() === "total") {
            modelesTotal = rowObj;
          } else {
            modeles.push(rowObj);
          }
        }
      }
    }

    const result: MoyennesSheetData = {
      annee,
      mois,
      equipes: equipes.length > 0 ? equipes : DEFAULT_MOYENNES_DATA.equipes,
      equipesTotal: equipesTotal || DEFAULT_MOYENNES_DATA.equipesTotal,
      modeles: modeles.length > 0 ? modeles : DEFAULT_MOYENNES_DATA.modeles,
      modelesTotal: modelesTotal || DEFAULT_MOYENNES_DATA.modelesTotal,
      correspondances: correspondances.length > 0 ? correspondances : DEFAULT_MOYENNES_DATA.correspondances,
      lastUpdated: new Date().toISOString(),
    };

    try {
      localStorage.setItem(MOYENNES_STORAGE_KEY, JSON.stringify(result));
    } catch {}

    return result;
  } catch (err) {
    console.warn("Échec du chargement de la feuille Moyennes, utilisation du cache ou des données intégrées:", err);
    try {
      const cached = localStorage.getItem(MOYENNES_STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached) as MoyennesSheetData;
      }
    } catch {}
    return DEFAULT_MOYENNES_DATA;
  }
}

/**
 * Met à jour l'année et le mois configurés dans l'onglet Moyennes de Google Sheets (cellules B1 et B2).
 */
export async function updateGoogleSheetMoyennesPeriode(
  annee: number,
  mois: number
): Promise<{ ok: boolean; message?: string }> {
  if (!isGoogleSheetWriteConfigured()) {
    return { ok: true, message: "Période mise à jour localement." };
  }

  return new Promise((resolve) => {
    let timeout = 0;
    const callbackName = `cb_moy_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const jsonpWindow = window as unknown as Window &
      Record<
        string,
        | ((response: { ok: boolean; message?: string; error?: string }) => void)
        | undefined
      >;
    const script = document.createElement("script");

    function cleanup() {
      cleanupJsonp(timeout, jsonpWindow, callbackName, script);
    }

    try {
      const url = new URL(getSheetWriteUrl());
      url.searchParams.set("action", "updateMoyennesPeriode");
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("annee", String(annee));
      url.searchParams.set("mois", String(mois));

      const token = getSheetWriteToken();
      if (token) {
        url.searchParams.set("token", token);
      }

      timeout = window.setTimeout(() => {
        cleanup();
        resolve({
          ok: true,
          message: "Délai dépassé, période appliquée localement.",
        });
      }, 15000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();
        if (response && response.ok) {
          resolve({ ok: true, message: response.message || "Période mise à jour avec succès dans Google Sheets." });
        } else {
          resolve({
            ok: false,
            message: response?.error || "Erreur lors de la mise à jour Google Sheets.",
          });
        }
      };

      script.onerror = () => {
        cleanup();
        resolve({ ok: true, message: "Période appliquée localement." });
      };

      script.src = url.toString();
      document.head.appendChild(script);
    } catch {
      cleanup();
      resolve({ ok: true, message: "Période appliquée localement." });
    }
  });
}

export function isGoogleSheetWriteConfigured() {
  return getSheetWriteUrl().length > 0;
}

function assertSheetWriteConfigured() {
  if (!isGoogleSheetWriteConfigured()) {
    throw new Error(
      "URL Google Apps Script non configurée. Déployez l'application Web Apps Script pour enregistrer directement dans Google Sheets."
    );
  }
}

function statusToSheetValue(status: WorkshopStatus) {
  return status === "A livré" ? "Livré" : status;
}

function callSheetWriteAction(
  row: Flux,
  action: string,
  values: Record<string, string>
) {
  assertSheetWriteConfigured();

  return new Promise<void>((resolve, reject) => {
    let timeout = 0;
    const callbackName = `__fluxAtelierWrite_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const jsonpWindow = window as unknown as Window &
      Record<string, ((response: SheetWriteResponse) => void) | undefined>;
    const script = document.createElement("script");

    function cleanup() {
      cleanupJsonp(timeout, jsonpWindow, callbackName, script);
    }

    try {
      const url = new URL(getSheetWriteUrl());

      url.searchParams.set("action", action);
      url.searchParams.set("callback", callbackName);

      Object.entries(values).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });

      url.searchParams.set("no", row.no);
      url.searchParams.set("chassis", row.chassis);

      const rowProps = row as unknown as Record<string, unknown>;

      if (rowProps.cs) {
        url.searchParams.set("cs", String(rowProps.cs));
      }

      if (row.sheetRowNumber) {
        url.searchParams.set("rowNumber", String(row.sheetRowNumber));
      }

      if (rowProps.rowSuivi) {
        url.searchParams.set("rowSuivi", String(rowProps.rowSuivi));
      }

      const token = getSheetWriteToken();
      if (token) {
        url.searchParams.set("token", token);
      }

      timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Google Sheets n'a pas confirme la modification."));
      }, 40000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();

        if (!response.ok) {
          const defaultError =
            action === "updateEtat" &&
            String(response.error || "").includes("Action inconnue")
              ? "Redéploie le script Apps Script pour activer la modification de l'Etat."
              : "Google Sheets a refuse la modification.";

          reject(
            new Error(
              response.error && !response.error.includes("Action inconnue")
                ? response.error
                : defaultError
            )
          );
          return;
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
        }
        resolve();
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Impossible d'appeler le script Google Sheets."));
      };
      script.src = url.toString();
      document.head.appendChild(script);
    } catch (error) {
      cleanup();
      reject(
        error instanceof Error
          ? error
          : new Error("URL du script Google Sheets invalide.")
      );
    }
  });
}

export async function updateGoogleSheetEmplacement(row: Flux, emplacement: string) {
  const normalizedEmplacement = normalizeSheetEmplacement(emplacement);

  if (!normalizedEmplacement) {
    throw new Error("Choisis un emplacement avant d'enregistrer.");
  }

  return callSheetWriteAction(row, "updateEmplacement", {
    emplacement: normalizedEmplacement,
  });
}

export async function updateGoogleSheetEtat(
  row: Flux,
  etat: WorkshopStatus,
  equipe?: string,
  technicien?: string,
  nomTechnicien?: string,
  poste?: string,
  bloc?: number
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

  return callSheetWriteAction(row, "updateEtat", values);
}

export async function updateGoogleSheetTechnicien(
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
  statutAchat?: "Attente" | "Livrer" | "Livré";
  dateLivraison?: string;
  livrePar?: string;
}

export interface DemandeEssaiControle {
  id?: string;
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
  equipe?: string;
  demandeur?: string;
  statutDevis?: "En attente accord" | "Accepté" | "Refusé";
  commentaire?: string;
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
      statutDevis: devis.statutDevis || "En attente accord",
    };
    localStorage.setItem(STORAGE_KEY_DEMANDES_DEVIS, JSON.stringify(all));
    window.dispatchEvent(new Event("demandes_devis_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde demande devis:", e);
  }
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
    window.dispatchEvent(new Event("demandes_achat_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde demande achat:", e);
  }
}

const STORAGE_KEY_ESSAIS_CONTROLE = "flux_atelier_essais_controle";


export function getEssaisControleLocal(): Record<string, DemandeEssaiControle> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ESSAIS_CONTROLE);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture essais contrôle:", e);
  }
  return {};
}

export function saveEssaiControleLocal(essai: DemandeEssaiControle): void {
  try {
    const all = getEssaisControleLocal();
    const key = String(essai.vehicleId || essai.or || essai.chassis);
    all[key] = essai;
    localStorage.setItem(STORAGE_KEY_ESSAIS_CONTROLE, JSON.stringify(all));
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
      window.dispatchEvent(new Event("demandes_achat_updated"));
      return all[targetKey];
    }
  } catch (e) {
    console.warn("Erreur marquage livraison achat:", e);
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

export async function updateGoogleSheetStatutAchat(
  row: Flux,
  demande: DemandeAchat,
  nouveauStatut: "Attente" | "Livré"
) {
  return callSheetWriteAction(row, "updateStatutAchat", {
    ref: demande.ref,
    designation: demande.designation,
    statutAchat: nouveauStatut,
    dateLivraison: demande.dateLivraison || "",
    livrePar: demande.livrePar || "",
  });
}

export async function updateGoogleSheetAvancement(
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

  const values: Record<string, string> = {
    avancement: avancement.trim(),
  };
  if (equipe || row.equipe) {
    values.equipe = (equipe || row.equipe || "").trim();
  }
  const targetBloc = bloc ?? row.bloc;
  if (targetBloc) {
    values.bloc = String(targetBloc);
  }

  if (demandeAchat) {
    values.ref = demandeAchat.ref;
    values.designation = demandeAchat.designation;
    values.qt = String(demandeAchat.qt);
    values.commentaire = demandeAchat.commentaire || "";
    values.dateDemande = demandeAchat.date;
    values.client = demandeAchat.client;
    values.chassis = demandeAchat.chassis;
    values.noOr = demandeAchat.or;
  }

  if (demandeDevis) {
    values.numeroDevis = demandeDevis.numeroDevis;
    values.dateDevis = demandeDevis.date;
    values.client = demandeDevis.client;
    values.chassis = demandeDevis.chassis;
    values.noOr = demandeDevis.or;
    values.modele = demandeDevis.modele;
    values.immatriculation = demandeDevis.immatriculation;
    if (demandeDevis.commentaire) {
      values.commentaire = demandeDevis.commentaire;
    }
  }

  if (extraParams) {
    Object.assign(values, extraParams);
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
    emplacement: "Attente",
    bloc: 1,
    nbIntervention: 1,
    montant: 0,
    temps: 0,
  };

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("flux_pending_new_chargement_entries");
      let list: PendingAddedFluxVehicle[] = raw ? JSON.parse(raw) : [];
      // Garder les ajouts récents (5 dernières minutes) et éviter les doublons
      list = list.filter((p) => now - p.timestamp < 300000 && p.vehicle.no !== newFlux.no);
      list.unshift({ timestamp: now, vehicle: newFlux });
      localStorage.setItem("flux_pending_new_chargement_entries", JSON.stringify(list));
    } catch (_) {}

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
        // Déjà indexé et visible dans Google Sheets GViz : enrichir les métadonnées
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
        // Pas encore dans le cache GViz Google Sheets : maintenir affiché en tête absolue
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
}) {
  assertSheetWriteConfigured();

  // Enregistrer immédiatement dans le cache local et notifier le Dashboard pour le chef d'équipe
  registerPendingAddedVehicle(entree);

  return new Promise<void>((resolve, reject) => {
    let timeout = 0;
    const callbackName = `__fluxAtelierAdd_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const jsonpWindow = window as unknown as Window &
      Record<string, ((response: SheetWriteResponse) => void) | undefined>;
    const script = document.createElement("script");

    function cleanup() {
      cleanupJsonp(timeout, jsonpWindow, callbackName, script);
    }

    try {
      const url = new URL(getSheetWriteUrl());
      url.searchParams.set("action", "ajouterEntree");
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("noOr", entree.noOr.trim());
      url.searchParams.set("cs", entree.cs.trim());
      url.searchParams.set("chassis", entree.chassis.trim());
      url.searchParams.set("codeClient", (entree.codeClient || "").trim());
      url.searchParams.set("nomClient", (entree.nomClient || "Client non renseigné").trim());
      // Horodatage précis de maintenant (JJ/MM/AAAA HH:mm:ss) pour la nouvelle entrée
      let dateAEnregistrer = (entree.dateEntreeHeure || "").trim();
      if (!dateAEnregistrer) {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, "0");
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const yyyy = now.getFullYear();
        const hh = String(now.getHours()).padStart(2, "0");
        const min = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        dateAEnregistrer = `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
      }
      url.searchParams.set("dateEntreeHeure", dateAEnregistrer);
      url.searchParams.set("marque", entree.marque.trim());
      url.searchParams.set("modele", entree.modele.trim());
      url.searchParams.set("categorie", (entree.categorie || "").trim());
      url.searchParams.set("equipe", (entree.equipe || "Daily").trim());

      const token = getSheetWriteToken();
      if (token) {
        url.searchParams.set("token", token);
      }

      timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Google Sheets n'a pas confirmé l'enregistrement de l'entrée."));
      }, 40000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();

        if (!response.ok) {
          reject(
            new Error(
              response.error || "Impossible d'ajouter l'entrée dans Google Sheets."
            )
          );
          return;
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
        }
        resolve();
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Impossible d'appeler le script Google Sheets."));
      };

      script.src = url.toString();
      document.head.appendChild(script);
    } catch (error) {
      cleanup();
      reject(
        error instanceof Error
          ? error
          : new Error("URL du script Google Sheets invalide.")
      );
    }
  });
}

/**
 * Actualise à l'instant tout le tableau de chargement :
 * 1. Déclenche la synchronisation automatique Apps Script (Suivi -> Tableaux de chargement)
 * 2. Récupère immédiatement l'intégralité des véhicules avec cache-buster
 */
export async function synchroniserTableauxDeChargement(): Promise<{
  ok: boolean;
  count: number;
  rows: Flux[];
  message: string;
}> {
  const writeUrl = getSheetWriteUrl();
  if (writeUrl) {
    try {
      await new Promise<void>((resolve) => {
        let timeout = 0;
        const callbackName = `__fluxSync_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}`;
        const jsonpWindow = window as unknown as Window &
          Record<
            string,
            ((res: { ok?: boolean; count?: number; message?: string }) => void) | undefined
          >;
        const script = document.createElement("script");

        function cleanup() {
          cleanupJsonp(timeout, jsonpWindow, callbackName, script);
        }

        try {
          const url = new URL(writeUrl);
          url.searchParams.set("action", "synchroniserEntrees");
          url.searchParams.set("callback", callbackName);
          url.searchParams.set("_t", String(Date.now()));
          const token = getSheetWriteToken();
          if (token) url.searchParams.set("token", token);

          timeout = window.setTimeout(() => {
            cleanup();
            resolve();
          }, 15000);

          jsonpWindow[callbackName] = () => {
            cleanup();
            resolve();
          };

          script.onerror = () => {
            cleanup();
            resolve();
          };

          script.src = url.toString();
          document.head.appendChild(script);
        } catch {
          cleanup();
          resolve();
        }
      });
    } catch {
      // Poursuivre avec la lecture directe
    }
  }

  // Lecture instantanée sans cache de tout le tableau de chargement
  const rows = await fetchGoogleSheetFluxData();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
  }

  return {
    ok: true,
    count: rows.length,
    rows,
    message: `${rows.length} véhicules synchronisés en direct depuis Google Sheets.`,
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
}

/**
 * Recherche instantanée d'un véhicule dans l'onglet VIN de Google Sheets
 * Récupère l'ensemble des caractéristiques alignées sur la feuille :
 * Col C: VIN, Col D: Marque, Col E: Modèle, Col F: Version, Col G: Description,
 * Col H: Couleur, Col I: Code couleur, Col K: Immatriculation, Col L/B: Date MEC,
 * Col AD: N° Client, Col AF: Nom Client, Col AG: Date vente, Col AH: Date livraison.
 */
export async function searchVehicleByVin(
  query: string
): Promise<VinVehicleInfo | null> {
  const clean = query.trim().toUpperCase();
  if (clean.length < 5) return null;

  try {
    const q = encodeURIComponent(
      `select C, D, E, F, G, K, L, AD, AF, AG, AH, H, I, B where upper(C) = '${clean}' or upper(C) like '%${clean}%' limit 1`
    );
    const url = `${BASE_GVIZ_URL}?tqx=out:json&gid=${VIN_GID}&tq=${q}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;

    const json: GvizResponse = JSON.parse(text.substring(start, end + 1));
    if (json.table && json.table.rows && json.table.rows.length > 0) {
      const c = json.table.rows[0].c;
      if (!c) return null;

      const chassisVal = c[0] ? cellToText(c[0]) : clean;
      const marqueVal = c[1] ? cellToText(c[1]) : "IVECO";
      const modeleVal = c[2] ? cellToText(c[2]) : "";
      const numModeleVersionVal = c[3] ? cellToText(c[3]) : "";
      const descVal = c[4] ? cellToText(c[4]) : "";
      const immatVal = c[5] ? cellToText(c[5]) : "";
      const dateMecVal = (c[6] ? cellToText(c[6]) : "") || (c[13] ? cellToText(c[13]) : "");
      const codeClientVal = c[7] ? cellToText(c[7]) : "";
      const nomClientVal = c[8] ? cellToText(c[8]) : "";
      const dateVenteVal = c[9] ? cellToText(c[9]) : "";
      const dateLivraisonVal = c[10] ? cellToText(c[10]) : "";
      const couleurVal = c[11] ? cellToText(c[11]) : "";
      const codeCouleurVal = c[12] ? cellToText(c[12]) : "";

      return {
        chassis: chassisVal,
        marque: marqueVal,
        codeMarque: marqueVal,
        modele: modeleVal,
        codeModele: modeleVal,
        numModeleVersion: numModeleVersionVal,
        descriptionSection: descVal,
        categorie: descVal,
        couleurCarrosserie: couleurVal,
        codeCouleur: codeCouleurVal,
        immatriculation: immatVal,
        dateMiseCirculation: dateMecVal,
        dateVente: dateVenteVal || dateLivraisonVal,
        dateLivraison: dateLivraisonVal,
        codeClient: codeClientVal,
        nomClient: nomClientVal,
      };
    }
  } catch (err) {
    console.warn("Erreur recherche VIN Google Sheets:", err);
  }
  return null;
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
 * Enregistre un nouveau véhicule dans l'onglet "VIN" de Google Sheets.
 * Prend en charge les colonnes alignées :
 * VIN (C), Code marque (D), Code modèle (E), N° version (F), Description (G),
 * Couleur (H), Code couleur (I), Immat (K), Date MEC (L), N° client (AD),
 * Nom client (AF), Date vente (AG), Date livraison (AH).
 */
export async function ajouterNouveauVin(
  payload: NouveauVinPayload
): Promise<{ ok: boolean; message?: string; vsn?: string }> {
  if (!isGoogleSheetWriteConfigured()) {
    throw new Error(
      "La synchronisation d'écriture Google Sheets n'est pas configurée."
    );
  }

  return new Promise((resolve, reject) => {
    const callbackName = `cb_vin_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const jsonpWindow = window as unknown as Record<
      string,
      ((response: { ok: boolean; message?: string; error?: string; vsn?: string }) => void) | undefined
    >;
    let timeout: number | undefined;

    const script = document.createElement("script");

    function cleanup() {
      cleanupJsonp(timeout, jsonpWindow, callbackName, script);
    }

    try {
      const url = new URL(getSheetWriteUrl());
      url.searchParams.set("action", "ajouterVin");
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("chassis", payload.chassis.trim().toUpperCase());
      url.searchParams.set("vin", payload.chassis.trim().toUpperCase());
      url.searchParams.set("codeMarque", (payload.codeMarque || payload.marque || "IVECO").trim());
      url.searchParams.set("marque", (payload.codeMarque || payload.marque || "IVECO").trim());
      url.searchParams.set("codeModele", (payload.codeModele || payload.modele || "").trim());
      url.searchParams.set("modele", (payload.codeModele || payload.modele || "").trim());
      url.searchParams.set("numModeleVersion", (payload.numModeleVersion || "").trim());
      url.searchParams.set("descriptionSection", (payload.descriptionSection || payload.categorie || "").trim());
      url.searchParams.set("categorie", (payload.descriptionSection || payload.categorie || "").trim());
      url.searchParams.set("couleurCarrosserie", (payload.couleurCarrosserie || payload.couleur || "").trim());
      url.searchParams.set("codeCouleur", (payload.codeCouleur || "").trim());
      url.searchParams.set("dateMiseCirculation", (payload.dateMiseCirculation || "").trim());
      url.searchParams.set("immatriculation", (payload.immatriculation || "").trim());
      url.searchParams.set("dateVente", (payload.dateVente || "").trim());
      url.searchParams.set("dateLivraison", (payload.dateLivraison || "").trim());
      url.searchParams.set("codeClient", (payload.codeClient || "").trim());
      url.searchParams.set("nomClient", (payload.nomClient || "").trim());

      const token = getSheetWriteToken();
      if (token) {
        url.searchParams.set("token", token);
      }

      timeout = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Google Sheets n'a pas confirmé l'enregistrement du VIN dans le délai imparti."
          )
        );
      }, 40000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();
        if (!response.ok) {
          reject(
            new Error(
              response.error || "Impossible d'ajouter le VIN dans Google Sheets."
            )
          );
          return;
        }
        resolve({ ok: true, message: response.message, vsn: response.vsn });
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Impossible de contacter le script Google Sheets."));
      };

      script.src = url.toString();
      document.head.appendChild(script);
    } catch (err) {
      cleanup();
      reject(
        err instanceof Error
          ? err
          : new Error("Erreur de configuration Google Sheets.")
      );
    }
  });
}

/**
 * Modifie un véhicule existant dans l'onglet "VIN" de Google Sheets.
 */
export async function modifierVin(
  payload: NouveauVinPayload
): Promise<{ ok: boolean; message?: string }> {
  if (!isGoogleSheetWriteConfigured()) {
    throw new Error(
      "La synchronisation d'écriture Google Sheets n'est pas configurée."
    );
  }

  return new Promise((resolve, reject) => {
    const callbackName = `cb_mod_vin_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const jsonpWindow = window as unknown as Record<
      string,
      ((response: { ok: boolean; message?: string; error?: string }) => void) | undefined
    >;
    let timeout: number | undefined;

    const script = document.createElement("script");

    function cleanup() {
      cleanupJsonp(timeout, jsonpWindow, callbackName, script);
    }

    try {
      const url = new URL(getSheetWriteUrl());
      url.searchParams.set("action", "modifierVin");
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("chassis", payload.chassis.trim().toUpperCase());
      url.searchParams.set("vin", payload.chassis.trim().toUpperCase());
      if (payload.codeMarque || payload.marque) {
        url.searchParams.set("codeMarque", (payload.codeMarque || payload.marque || "").trim());
      }
      if (payload.codeModele || payload.modele) {
        url.searchParams.set("codeModele", (payload.codeModele || payload.modele || "").trim());
      }
      if (payload.numModeleVersion !== undefined) {
        url.searchParams.set("numModeleVersion", payload.numModeleVersion.trim());
      }
      if (payload.descriptionSection || payload.categorie) {
        url.searchParams.set("descriptionSection", (payload.descriptionSection || payload.categorie || "").trim());
      }
      if (payload.couleurCarrosserie || payload.couleur) {
        url.searchParams.set("couleurCarrosserie", (payload.couleurCarrosserie || payload.couleur || "").trim());
      }
      if (payload.codeCouleur !== undefined) {
        url.searchParams.set("codeCouleur", payload.codeCouleur.trim());
      }
      if (payload.dateMiseCirculation !== undefined) {
        url.searchParams.set("dateMiseCirculation", payload.dateMiseCirculation.trim());
      }
      if (payload.immatriculation !== undefined) {
        url.searchParams.set("immatriculation", payload.immatriculation.trim());
      }
      if (payload.dateVente !== undefined) {
        url.searchParams.set("dateVente", payload.dateVente.trim());
      }
      if (payload.dateLivraison !== undefined) {
        url.searchParams.set("dateLivraison", payload.dateLivraison.trim());
      }
      if (payload.codeClient !== undefined) {
        url.searchParams.set("codeClient", payload.codeClient.trim());
      }
      if (payload.nomClient !== undefined) {
        url.searchParams.set("nomClient", payload.nomClient.trim());
      }

      const token = getSheetWriteToken();
      if (token) {
        url.searchParams.set("token", token);
      }

      timeout = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Google Sheets n'a pas confirmé la modification du VIN dans le délai imparti."
          )
        );
      }, 40000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();
        if (!response.ok) {
          reject(
            new Error(
              response.error || "Impossible de modifier le VIN dans Google Sheets."
            )
          );
          return;
        }
        resolve({ ok: true, message: response.message });
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Impossible de contacter le script Google Sheets."));
      };

      script.src = url.toString();
      document.head.appendChild(script);
    } catch (err) {
      cleanup();
      reject(
        err instanceof Error
          ? err
          : new Error("Erreur de configuration Google Sheets.")
      );
    }
  });
}

export interface ModifierEntreePayload {
  noOr: string;
  cs: string;
  chassis: string;
  codeClient?: string;
  nomClient?: string;
  dateEntreeHeure?: string;
  marque?: string;
  modele?: string;
  categorie?: string;
  etat?: string;
  equipe?: string;
  emplacement?: string;
  rowSuivi?: number;
  rowNumber?: number;
  origNo?: string;
  origCs?: string;
  origChassis?: string;
}

/**
 * Modifie une entrée existante dans Google Sheets (onglets "Suivi des entrées" et "tableaux de chargement").
 */
export async function modifierDossierEntree(
  payload: ModifierEntreePayload
): Promise<{ ok: boolean; message?: string }> {
  assertSheetWriteConfigured();

  return new Promise((resolve, reject) => {
    let timeout = 0;
    const callbackName = `cb_mod_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const jsonpWindow = window as unknown as Window &
      Record<
        string,
        | ((response: { ok: boolean; message?: string; error?: string }) => void)
        | undefined
      >;
    const script = document.createElement("script");

    function cleanup() {
      cleanupJsonp(timeout, jsonpWindow, callbackName, script);
    }

    try {
      const url = new URL(getSheetWriteUrl());
      url.searchParams.set("action", "modifierEntree");
      url.searchParams.set("callback", callbackName);
      const cleanNo = (payload.noOr || "").trim() === "-" ? "" : (payload.noOr || "").trim();
      const cleanCs = (payload.cs || "").trim() === "-" ? "" : (payload.cs || "").trim();
      const cleanChassis = (payload.chassis || "").trim().toUpperCase() === "-" ? "" : (payload.chassis || "").trim().toUpperCase();
      url.searchParams.set("noOr", cleanNo);
      url.searchParams.set("no", cleanNo);
      url.searchParams.set("cs", cleanCs);
      url.searchParams.set("chassis", cleanChassis);
      url.searchParams.set("codeClient", (payload.codeClient || "").trim());
      url.searchParams.set("nomClient", (payload.nomClient || "").trim());
      url.searchParams.set("dateEntreeHeure", (payload.dateEntreeHeure || "").trim());
      url.searchParams.set("marque", (payload.marque || "IVECO").trim());
      url.searchParams.set("modele", (payload.modele || "").trim());
      url.searchParams.set("categorie", (payload.categorie || "").trim());
      if (payload.etat) url.searchParams.set("etat", payload.etat.trim());
      if (payload.equipe) url.searchParams.set("equipe", payload.equipe.trim());
      if (payload.emplacement) url.searchParams.set("emplacement", payload.emplacement.trim());
      if (payload.rowSuivi) url.searchParams.set("rowSuivi", String(payload.rowSuivi));
      if (payload.rowNumber) url.searchParams.set("rowNumber", String(payload.rowNumber));
      if (payload.origNo) url.searchParams.set("origNo", payload.origNo.trim());
      if (payload.origCs) url.searchParams.set("origCs", payload.origCs.trim());
      if (payload.origChassis) url.searchParams.set("origChassis", payload.origChassis.trim());

      const token = getSheetWriteToken();
      if (token) {
        url.searchParams.set("token", token);
      }

      timeout = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Google Sheets n'a pas confirmé la modification du dossier dans le délai imparti (vérifiez le déploiement Apps Script)."
          )
        );
      }, 60000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();
        if (!response.ok) {
          reject(
            new Error(
              response.error ||
                "Impossible de modifier le dossier dans Google Sheets."
            )
          );
          return;
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
        }
        resolve({ ok: true, message: response.message });
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Impossible de contacter le script Google Sheets."));
      };

      script.src = url.toString();
      document.head.appendChild(script);
    } catch (err) {
      cleanup();
      reject(
        err instanceof Error
          ? err
          : new Error("Erreur lors de la préparation de la requête.")
      );
    }
  });
}

export interface SupprimerEntreePayload {
  noOr: string;
  cs: string;
  chassis: string;
  rowSuivi?: number;
  rowNumber?: number;
}

/**
 * Supprime définitivement une entrée de Google Sheets (onglets "Suivi des entrées" et "tableaux de chargement").
 */
export async function supprimerDossierEntree(
  payload: SupprimerEntreePayload
): Promise<{ ok: boolean; message?: string }> {
  assertSheetWriteConfigured();

  return new Promise((resolve, reject) => {
    let timeout = 0;
    const callbackName = `cb_del_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const jsonpWindow = window as unknown as Window &
      Record<
        string,
        | ((response: { ok: boolean; message?: string; error?: string }) => void)
        | undefined
      >;
    const script = document.createElement("script");

    function cleanup() {
      cleanupJsonp(timeout, jsonpWindow, callbackName, script);
    }

    try {
      const url = new URL(getSheetWriteUrl());
      url.searchParams.set("action", "supprimerEntree");
      url.searchParams.set("callback", callbackName);
      const cleanNo = (payload.noOr || "").trim() === "-" ? "" : (payload.noOr || "").trim();
      const cleanCs = (payload.cs || "").trim() === "-" ? "" : (payload.cs || "").trim();
      const cleanChassis = (payload.chassis || "").trim().toUpperCase() === "-" ? "" : (payload.chassis || "").trim().toUpperCase();
      url.searchParams.set("noOr", cleanNo);
      url.searchParams.set("no", cleanNo);
      url.searchParams.set("cs", cleanCs);
      url.searchParams.set("chassis", cleanChassis);
      if (payload.rowSuivi) url.searchParams.set("rowSuivi", String(payload.rowSuivi));
      if (payload.rowNumber) url.searchParams.set("rowNumber", String(payload.rowNumber));

      const token = getSheetWriteToken();
      if (token) {
        url.searchParams.set("token", token);
      }

      timeout = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Google Sheets n'a pas confirmé la suppression du dossier dans le délai imparti (vérifiez le déploiement Apps Script)."
          )
        );
      }, 60000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();
        if (!response.ok) {
          reject(
            new Error(
              response.error ||
                "Impossible de supprimer le dossier dans Google Sheets."
            )
          );
          return;
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("flux_refresh_requested"));
        }
        resolve({ ok: true, message: response.message });
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Impossible de contacter le script Google Sheets."));
      };

      script.src = url.toString();
      document.head.appendChild(script);
    } catch (err) {
      cleanup();
      reject(
        err instanceof Error
          ? err
          : new Error("Erreur lors de la préparation de la suppression.")
      );
    }
  });
}

let activeFetchRemoteAccountsPromise: Promise<AuthorizedAccount[]> | null = null;

/**
 * Récupère la liste des comptes enregistrés sur la feuille Google Sheets "COMPTES".
 */
export async function fetchRemoteAccounts(): Promise<AuthorizedAccount[]> {
  if (activeFetchRemoteAccountsPromise) {
    return activeFetchRemoteAccountsPromise;
  }

  activeFetchRemoteAccountsPromise = (async () => {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=COMPTES&tqx=out:json`;
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          const json = JSON.parse(text.substring(start, end + 1));
          const rows = json.table?.rows || [];
          const accounts: AuthorizedAccount[] = [];

          for (let i = 0; i < rows.length; i++) {
            const c = rows[i]?.c;
            if (!c) continue;
            const id = String(c[0]?.v ?? c[0]?.f ?? "").trim();
            const name = String(c[1]?.v ?? c[1]?.f ?? "").trim();
            const email = String(c[2]?.v ?? c[2]?.f ?? "").trim();
            const password = String(c[3]?.v ?? c[3]?.f ?? "").trim();
            const roleRaw = String(c[4]?.v ?? c[4]?.f ?? "").trim();
            const teamRaw = String(c[5]?.v ?? c[5]?.f ?? "").trim();

            // Ignorer l'en-tête
            if (
              !id ||
              id.toLowerCase() === "id" ||
              id.toLowerCase() === "horodateur" ||
              email.toLowerCase() === "email"
            ) {
              continue;
            }

            if (email && password) {
              let role: RoleType = "chef_equipe";
              if (
                roleRaw === "administration" ||
                roleRaw === "chef_atelier" ||
                roleRaw === "reception" ||
                roleRaw === "chef_equipe"
              ) {
                role = roleRaw;
              }
              accounts.push({
                id: id || `remote_${Math.random().toString(36).slice(2, 8)}`,
                name: name || email,
                email,
                password,
                role,
                assignedTeam: teamRaw || undefined,
              });
            }
          }
          if (accounts.length > 0) {
            return accounts;
          }
        }
      }
    } catch (e) {
      console.warn("fetchRemoteAccounts gviz error:", e);
    }

    // Fallback via Apps Script JSONP action=getComptes
    try {
      const writeUrl = getSheetWriteUrl();
      if (writeUrl && typeof window !== "undefined") {
        return await new Promise<AuthorizedAccount[]>((resolve) => {
          let timeout = 0;
          const callbackName = `cb_getacc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const jsonpWindow = window as unknown as Window &
            Record<string, ((r: { ok?: boolean; comptes?: AuthorizedAccount[] }) => void) | undefined>;
          const script = document.createElement("script");

          function cleanup() {
            window.clearTimeout(timeout);
            // Laisser un no-op pour que toute réponse tardive ne provoque pas ReferenceError
            if (jsonpWindow[callbackName]) {
              jsonpWindow[callbackName] = () => {
                try { delete jsonpWindow[callbackName]; } catch (_) {}
              };
            }
            try {
              script.remove();
            } catch (_) {}
          }

          const url = new URL(writeUrl);
          url.searchParams.set("action", "getComptes");
          url.searchParams.set("callback", callbackName);
          const token = getSheetWriteToken();
          if (token) url.searchParams.set("token", token);

          timeout = window.setTimeout(() => {
            cleanup();
            resolve([]);
          }, 25000);

          jsonpWindow[callbackName] = (response) => {
            cleanup();
            if (response?.ok && Array.isArray(response.comptes)) {
              resolve(response.comptes);
            } else {
              resolve([]);
            }
          };

          script.onerror = () => {
            cleanup();
            resolve([]);
          };

          script.src = url.toString();
          document.head.appendChild(script);
        });
      }
    } catch (err) {
      console.warn("fetchRemoteAccounts JSONP error:", err);
    }

    return [];
  })().finally(() => {
    activeFetchRemoteAccountsPromise = null;
  });

  return activeFetchRemoteAccountsPromise;
}

/**
 * Enregistre ou met à jour un compte dans la feuille Google Sheets "COMPTES".
 */
export async function saveRemoteAccount(
  account: AuthorizedAccount
): Promise<{ ok: boolean; message?: string }> {
  const writeUrl = getSheetWriteUrl();
  if (!writeUrl) return { ok: false, message: "URL Apps Script non configurée" };

  return new Promise((resolve) => {
    let timeout = 0;
    const callbackName = `cb_acc_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const jsonpWindow = window as unknown as Window &
      Record<string, ((r: { ok?: boolean; message?: string }) => void) | undefined>;
    const script = document.createElement("script");

    function cleanup() {
      window.clearTimeout(timeout);
      if (jsonpWindow[callbackName]) {
        jsonpWindow[callbackName] = () => {
          try { delete jsonpWindow[callbackName]; } catch (_) {}
        };
      }
      try {
        script.remove();
      } catch (_) {}
    }

    try {
      const url = new URL(writeUrl);
      url.searchParams.set("action", "sauvegarderCompte");
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("id", account.id);
      url.searchParams.set("name", account.name);
      url.searchParams.set("email", account.email);
      url.searchParams.set("password", account.password);
      url.searchParams.set("role", account.role);
      url.searchParams.set("team", account.assignedTeam || "");

      const token = getSheetWriteToken();
      if (token) url.searchParams.set("token", token);

      timeout = window.setTimeout(() => {
        cleanup();
        resolve({ ok: false, message: "Délai dépassé pour la sauvegarde distante." });
      }, 15000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();
        resolve({ ok: response?.ok ?? true, message: response?.message });
      };

      script.onerror = () => {
        cleanup();
        resolve({ ok: false, message: "Impossible de contacter le script Google." });
      };

      script.src = url.toString();
      document.head.appendChild(script);
    } catch {
      cleanup();
      resolve({ ok: false, message: "Erreur préparation requête." });
    }
  });
}

/**
 * Supprime un compte de la feuille Google Sheets "COMPTES".
 */
export async function deleteRemoteAccount(
  id: string,
  email?: string
): Promise<{ ok: boolean; message?: string }> {
  const writeUrl = getSheetWriteUrl();
  if (!writeUrl) return { ok: false, message: "URL Apps Script non configurée" };

  return new Promise((resolve) => {
    let timeout = 0;
    const callbackName = `cb_delacc_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const jsonpWindow = window as unknown as Window &
      Record<string, ((r: { ok?: boolean; message?: string }) => void) | undefined>;
    const script = document.createElement("script");

    function cleanup() {
      window.clearTimeout(timeout);
      if (jsonpWindow[callbackName]) {
        jsonpWindow[callbackName] = () => {
          try { delete jsonpWindow[callbackName]; } catch (_) {}
        };
      }
      try {
        script.remove();
      } catch (_) {}
    }

    try {
      const url = new URL(writeUrl);
      url.searchParams.set("action", "supprimerCompte");
      url.searchParams.set("callback", callbackName);
      url.searchParams.set("id", id);
      if (email) url.searchParams.set("email", email);

      const token = getSheetWriteToken();
      if (token) url.searchParams.set("token", token);

      timeout = window.setTimeout(() => {
        cleanup();
        resolve({ ok: false, message: "Délai dépassé pour la suppression distante." });
      }, 15000);

      jsonpWindow[callbackName] = (response) => {
        cleanup();
        resolve({ ok: response?.ok ?? true, message: response?.message });
      };

      script.onerror = () => {
        cleanup();
        resolve({ ok: false, message: "Impossible de contacter le script Google." });
      };

      script.src = url.toString();
      document.head.appendChild(script);
    } catch {
      cleanup();
      resolve({ ok: false, message: "Erreur préparation suppression." });
    }
  });
}

