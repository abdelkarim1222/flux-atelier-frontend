import type { Flux } from "../data/mockData";

export const DELIVERED_EMPLACEMENT = "Livraison au client";
export const FULL_PARKING_EMPLACEMENT = "Place complet";

export const LEGACY_DAILY_MAPPING: Record<string, string> = {
  D1: "D510",
  D11: "D511",
  D12: "D512",
  D2: "D520",
  D21: "D521",
  D22: "D522",
  D3: "D610",
  D31: "D611",
  D32: "D612",
  D4: "D620",
  D41: "D621",
  D42: "D622",
  D5: "D710",
  D51: "D711",
  D52: "D712",
  D6: "D720",
  D61: "D721",
  D62: "D722",
  D7: "D810",
  D71: "D811",
  D72: "D812",
  D8: "D820",
  D81: "D821",
  D82: "D822",
};

export const LEGACY_ELECTRIQUE_MAPPING: Record<string, string> = {
  E1: "E410",
  E11: "E411",
  E12: "E412",
  E2: "E420",
  E21: "E421",
  E22: "E422",
};

export const EMPLACEMENT_ZONES = {
  DAILY: [
    "D510", "D520", "D610", "D620", "D710", "D720", "D810", "D820",
    "D511", "D512", "D521", "D522", "D611", "D612", "D621", "D622",
    "D711", "D712", "D721", "D722", "D811", "D812", "D821", "D822"
  ],
  CHANGAN: [
    "J11", "J12", "J21", "J22", "J31", "J32", "J41", "J42", "J51", "J52", "J61", "J62"
  ],
  ELECTRIQUE: [
    "E410", "E411", "E412", "E420", "E421", "E422"
  ],
  SERVICE_RAPIDE: [
    "S21", "S11", "S22"
  ],
  CARROSSERIE: [
    "C1", "C2", "C3"
  ],
  LOURD_T: [
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T11", "T12", "T21", "T22", "T31", "T32", "T41", "T42"
  ],
  LOURD_M: [
    "M11", "M21", "M12"
  ],
  ATTENTE_CLIENT_L: [
    "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"
  ],
  // Colonne droite P1–P10, petites places P11–P13, puis parking P14–P81.
  PARKING_P: Array.from({ length: 81 }, (_, i) => `P${i + 1}`)
} as const;

export const ALL_EMPLACEMENTS: string[] = [
  ...EMPLACEMENT_ZONES.DAILY,
  ...EMPLACEMENT_ZONES.CHANGAN,
  ...EMPLACEMENT_ZONES.ELECTRIQUE,
  ...EMPLACEMENT_ZONES.SERVICE_RAPIDE,
  ...EMPLACEMENT_ZONES.CARROSSERIE,
  ...EMPLACEMENT_ZONES.LOURD_T,
  ...EMPLACEMENT_ZONES.LOURD_M,
  ...EMPLACEMENT_ZONES.ATTENTE_CLIENT_L,
  ...EMPLACEMENT_ZONES.PARKING_P,
];

export const VALID_EMPLACEMENTS_SET = new Set<string>([
  ...ALL_EMPLACEMENTS.map((e) => e.toUpperCase()),
  ...Object.keys(LEGACY_DAILY_MAPPING),
  ...Object.keys(LEGACY_ELECTRIQUE_MAPPING),
  FULL_PARKING_EMPLACEMENT.toUpperCase(),
  "PARC COMPLET",
  "PARCCOMPLET",
]);

/**
 * Détermine l'équipe active responsable de l'intervention actuelle du véhicule,
 * en tenant compte des passages Équipe 1, Équipe 2 et Équipe 3.
 */
export function getActiveTeamForVehicle(vehicle: Partial<Flux>): string {
  const bloc = Number(vehicle.bloc) || 1;
  if (bloc === 3 && vehicle.equipe3 && vehicle.equipe3 !== "-") {
    return vehicle.equipe3;
  }
  if (bloc === 2 && vehicle.equipe2 && vehicle.equipe2 !== "-") {
    return vehicle.equipe2;
  }
  if (vehicle.equipe && vehicle.equipe !== "-") {
    return vehicle.equipe;
  }
  if (vehicle.equipe1 && vehicle.equipe1 !== "-") {
    return vehicle.equipe1;
  }
  return "Daily";
}

/**
 * Normalise un emplacement saisi ou stocké
 */
export function normalizeEmplacementCode(val: string): string {
  const clean = (val || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!clean || clean === "-" || clean === "NA") return "NA";
  if (clean === "LIVRAISONAUCLIENT" || clean.includes("LIVR")) return DELIVERED_EMPLACEMENT;
  if (clean.includes("COMPLET") || clean.includes("PLEIN")) return FULL_PARKING_EMPLACEMENT;
  const stripped = clean.replace(/^(ZONE|PARKING)/, "");
  if (LEGACY_DAILY_MAPPING[stripped]) return LEGACY_DAILY_MAPPING[stripped];
  if (LEGACY_ELECTRIQUE_MAPPING[stripped]) return LEGACY_ELECTRIQUE_MAPPING[stripped];
  if (VALID_EMPLACEMENTS_SET.has(stripped)) return stripped;
  return clean;
}

/**
 * Détermine la zone architecturale d'un code emplacement
 */
export function getZoneForEmplacement(place: string): string {
  const norm = normalizeEmplacementCode(place);
  if (norm === DELIVERED_EMPLACEMENT) return "Livré";
  if (norm === FULL_PARKING_EMPLACEMENT) return "Place complet";
  if (norm.startsWith("D")) return "Zone D (Daily1 / Daily2)";
  if (norm.startsWith("J")) return "Zone J (Changan / JMC)";
  if (norm.startsWith("E")) return "Zone E (Électrique)";
  if (norm.startsWith("S")) return "Zone S (Service Rapide)";
  if (norm.startsWith("C")) return "Zone C (Carrosserie)";
  if (norm.startsWith("T") || norm.startsWith("M")) return "Zone T / M (Lourd)";
  if (norm.startsWith("L")) return "Zone L (Attente Client)";
  if (norm.startsWith("P")) return "Zone P (Parking général)";
  return "Autre";
}

/**
 * Calcule automatiquement la première place disponible selon la règle d'atelier :
 * 
 * 1. Véhicule « Livré » :
 *    - Devient « Livraison au client », ce qui libère sa précédente place dans l'atelier.
 * 2. Véhicule « Attente client » (ou terminé à 100% en attente livraison) :
 *    - Utilise en priorité la zone L (L1 à L8).
 *    - Si la zone L est pleine, bascule sur le parking général P (P1 à P85).
 * 3. Véhicule « Attente réparation » (ou toute mise en attente) :
 *    - Attribué dans le parking général P (P1 à P85).
 * 4. Véhicule « En cours » :
 *    - Dépend de l'équipe active (Daily1/Daily2 -> D, Changan -> J, Électrique -> E,
 *      Service Rapide -> S, Carrosserie -> C, Lourd -> T/M).
 *    - Si les postes de l'équipe sont pleins, bascule sur le parking général P.
 */
export function calculerEmplacementAutomatique(
  vehicle: Partial<Flux>,
  allVehicles: Partial<Flux>[] = [],
  currentVehicleId?: string | number
): string {
  const etat = (vehicle.etatIntervention || vehicle.statut || "").trim().toLowerCase();
  const avancement = (vehicle.avancement || "").trim().toLowerCase();

  // 1. Livré -> libère la place
  if (
    etat.includes("livr") ||
    avancement.includes("livr") ||
    (vehicle as Record<string, unknown>).dateSortie
  ) {
    return DELIVERED_EMPLACEMENT;
  }

  // Collecter les places occupées par d'autres véhicules non livrés
  const occupiedPlaces = new Set<string>();
  const currentKey = currentVehicleId ? String(currentVehicleId).trim() : null;
  const currentNo = vehicle.no ? String(vehicle.no).trim() : null;
  const currentVin = vehicle.chassis ? String(vehicle.chassis).trim().toUpperCase() : null;

  for (const v of allVehicles) {
    if (!v) continue;

    // Ignorer le véhicule lui-même
    if (currentKey && String(v.id).trim() === currentKey) continue;
    if (currentNo && v.no && String(v.no).trim() === currentNo) continue;
    if (currentVin && v.chassis && String(v.chassis).trim().toUpperCase() === currentVin && currentVin !== "-") {
      continue;
    }

    const vEtat = (v.etatIntervention || v.statut || "").toLowerCase();
    const vAv = (v.avancement || "").toLowerCase();
    if (vEtat.includes("livr") || vAv.includes("livr")) {
      continue; // Un véhicule livré ne prend aucune place
    }

    const rawPlace = (v.emplacement || "").trim();
    const normPlace = normalizeEmplacementCode(rawPlace);
    if (
      normPlace &&
      normPlace !== "-" &&
      normPlace !== "NA" &&
      normPlace !== DELIVERED_EMPLACEMENT &&
      normPlace !== FULL_PARKING_EMPLACEMENT
    ) {
      occupiedPlaces.add(normPlace.toUpperCase());
    }
  }

  // 2. Attente client (ou travaux terminés) -> Zone L (L1..L8) puis P
  const isAttenteClient =
    etat.includes("attente client") ||
    avancement === "terminer" ||
    avancement.includes("termin") ||
    avancement === "100%";

  if (isAttenteClient) {
    for (const place of EMPLACEMENT_ZONES.ATTENTE_CLIENT_L) {
      if (!occupiedPlaces.has(place.toUpperCase())) {
        return place;
      }
    }
    for (const place of EMPLACEMENT_ZONES.PARKING_P) {
      if (!occupiedPlaces.has(place.toUpperCase())) {
        return place;
      }
    }
    return FULL_PARKING_EMPLACEMENT;
  }

  // 3. Attente Réparation -> Parking général P (P1..P76)
  const isEnCoursActif =
    (etat.includes("en cours") || avancement.startsWith("en cours") || (avancement.includes("%") && !avancement.includes("100%"))) &&
    !etat.includes("attente") &&
    !avancement.includes("attente") &&
    !avancement.includes("devis") &&
    !avancement.includes("achet");

  if (!isEnCoursActif) {
    for (const place of EMPLACEMENT_ZONES.PARKING_P) {
      if (!occupiedPlaces.has(place.toUpperCase())) {
        return place;
      }
    }
    return FULL_PARKING_EMPLACEMENT;
  }

  // 4. En cours -> Dépend de l'équipe active
  const activeTeam = getActiveTeamForVehicle(vehicle);
  const normTeam = activeTeam
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  let teamPlaces: readonly string[] = EMPLACEMENT_ZONES.DAILY;

  if (normTeam.includes("DAILY")) {
    teamPlaces = EMPLACEMENT_ZONES.DAILY;
  } else if (normTeam.includes("CHANGAN") || normTeam.includes("JMC")) {
    teamPlaces = EMPLACEMENT_ZONES.CHANGAN;
  } else if (normTeam.includes("ELECT") || normTeam.includes("ELICT")) {
    teamPlaces = EMPLACEMENT_ZONES.ELECTRIQUE;
  } else if (normTeam.includes("RAPIDE") || normTeam.includes("SERV")) {
    teamPlaces = EMPLACEMENT_ZONES.SERVICE_RAPIDE;
  } else if (normTeam.includes("CARROSS")) {
    teamPlaces = EMPLACEMENT_ZONES.CARROSSERIE;
  } else if (normTeam.includes("LOURD")) {
    teamPlaces = [...EMPLACEMENT_ZONES.LOURD_T, ...EMPLACEMENT_ZONES.LOURD_M];
  }

  for (const place of teamPlaces) {
    if (!occupiedPlaces.has(place.toUpperCase())) {
      return place;
    }
  }

  // Si tous les postes d'équipe sont occupés, basculer sur le parking général P
  for (const place of EMPLACEMENT_ZONES.PARKING_P) {
    if (!occupiedPlaces.has(place.toUpperCase())) {
      return place;
    }
  }

  return FULL_PARKING_EMPLACEMENT;
}
