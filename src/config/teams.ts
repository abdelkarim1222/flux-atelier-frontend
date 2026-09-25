// The 7 canonical workshop teams matching the Google Sheets structure
export const CANONICAL_TEAMS = [
  "Daily1",
  "Service Rapide",
  "Daily2",
  "Lourd",
  "Changan",
  "Carrosserie",
  "Elictrique",
] as const;

export type CanonicalTeam = typeof CANONICAL_TEAMS[number];

// The 6 destination teams for New Vehicle Entry (Réception)
export const DESTINATION_TEAMS = [
  "Daily",
  "Service Rapide",
  "Lourd",
  "Carrosserie",
  "Elictrique",
  "Changan",
] as const;

export type DestinationTeam = typeof DESTINATION_TEAMS[number];

export function normalizeTeamName(t: string): string {
  const norm = (t || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (norm.includes("daily1")) return "Daily1";
  if (norm.includes("daily2")) return "Daily2";
  if (norm.includes("daily")) return "Daily1";
  if (norm.includes("rapide") || norm.includes("serv")) return "Service Rapide";
  if (norm.includes("lourd")) return "Lourd";
  if (norm.includes("changan")) return "Changan";
  if (norm.includes("carross")) return "Carrosserie";
  if (norm.includes("electrique") || norm.includes("elictrique")) return "Elictrique";
  return t.trim();
}

/**
 * Checks if a vehicle belongs to the given user's workshop team.
 * Specific rule:
 * - If vehicleTeam is "Daily", it matches BOTH Daily1 and Daily2.
 * - Otherwise it matches the specific team (Service Rapide, Lourd, Carrosserie, Elictrique, Changan).
 */
export function isVehicleMatchingTeam(vehicleTeam: string, userTeam: string): boolean {
  if (!userTeam) return true;

  const vNorm = (vehicleTeam || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const uNorm = (userTeam || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!vNorm || vNorm === "-" || vNorm === "na") {
    // Si aucune équipe n'est affectée au véhicule, il reste visible pour ne pas être perdu
    return true;
  }

  // Cas spécial Daily : si le véhicule est pour Daily, visible pour Daily1 ET Daily2
  if (vNorm === "daily") {
    return uNorm.includes("daily");
  }

  if (vNorm === "daily1") return uNorm.includes("daily1") || uNorm === "daily";
  if (vNorm === "daily2") return uNorm.includes("daily2") || uNorm === "daily";

  // Service Rapide
  if (vNorm.includes("rapide") || vNorm.includes("serv")) {
    return uNorm.includes("rapide") || uNorm.includes("serv");
  }

  // Lourd
  if (vNorm.includes("lourd")) {
    return uNorm.includes("lourd");
  }

  // Carrosserie
  if (vNorm.includes("carross")) {
    return uNorm.includes("carross");
  }

  // Elictrique / Electrique
  if (vNorm.includes("electrique") || vNorm.includes("elictrique")) {
    return uNorm.includes("electrique") || uNorm.includes("elictrique");
  }

  // Changan
  if (vNorm.includes("changan")) {
    return uNorm.includes("changan");
  }

  return normalizeTeamName(vehicleTeam) === normalizeTeamName(userTeam);
}

