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

export const DESTINATION_TEAMS = [
  "Daily",
  "Service Rapide",
  "Lourd",
  "Carrosserie",
  "Elictrique",
  "Changan",
] as const;

export type DestinationTeam = typeof DESTINATION_TEAMS[number];

const CUSTOM_TEAMS_STORAGE_KEY = "flux_atelier_custom_teams_list";

export function getCustomTeams(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_TEAMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((t) => String(t || "").trim()).filter(Boolean);
    }
  } catch {}
  return [];
}

export function saveCustomTeams(teams: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const clean = Array.from(new Set(teams.map((t) => t.trim()).filter(Boolean)));
    localStorage.setItem(CUSTOM_TEAMS_STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent("flux_teams_updated", { detail: clean }));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

export function addCustomTeam(teamName: string): string[] {
  const clean = teamName.trim();
  if (!clean) return getCustomTeams();
  const current = getCustomTeams();
  const exists =
    current.some((t) => t.toLowerCase() === clean.toLowerCase()) ||
    CANONICAL_TEAMS.some((t) => t.toLowerCase() === clean.toLowerCase());
  if (!exists) {
    const updated = [...current, clean];
    saveCustomTeams(updated);
    return updated;
  }
  return current;
}

export function removeCustomTeam(teamName: string): string[] {
  const clean = teamName.trim().toLowerCase();
  const current = getCustomTeams();
  const updated = current.filter((t) => t.trim().toLowerCase() !== clean);
  saveCustomTeams(updated);
  return updated;
}

export function getAllDestinationTeams(): string[] {
  const custom = getCustomTeams();
  const base: string[] = [...DESTINATION_TEAMS];
  custom.forEach((t) => {
    if (!base.some((b) => b.toLowerCase() === t.toLowerCase())) {
      base.push(t);
    }
  });
  return base;
}


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

