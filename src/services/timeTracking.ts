/**
 * Service de calcul et de suivi des temps d'atelier par véhicule
 * Permet aux Chefs d'équipe et à l'Atelier de calculer précisément :
 * - Le temps d'attente réparation (Réception -> Prise en charge équipe)
 * - Le temps de travail effectif net (Main d'œuvre active en atelier)
 * - Les temps d'attente pièces / achat
 * - Les temps d'attente accord devis
 * - Le temps total de séjour en atelier
 */

import type { Flux } from "../data/mockData";
import type { SuiviEntree } from "./googleSheets";
import {
  getDemandesAchatLocal,
  getDemandesDevisLocal,
  getReaffectationsLocal,
  getVehicleEssaisLocal,
  getVehicleTransfersLocal,
} from "./googleSheets";

export type TimeStepType =
  | "reception"
  | "entree_equipe"
  | "attente_reparation"
  | "attente_pieces"
  | "attente_devis"
  | "reaffectation"
  | "essai"
  | "attente_client"
  | "travail"
  | "fin";

export interface VehicleTimeStep {
  id: string;
  type: TimeStepType;
  label: string;
  dateDebut: string; // "DD/MM/YYYY HH:mm" ou ISO
  dateFin?: string;  // "DD/MM/YYYY HH:mm" ou ISO
  dureeMinutes?: number;
  commentaire?: string;
  automatique?: boolean;
}

export interface VehicleTimeLog {
  vehicleKey: string; // N° OR ou Châssis
  noOr: string;
  chassis: string;
  immatriculation?: string;
  client?: string;
  equipe?: string;
  dateEntreeReception?: string;
  datePriseEnChargeEquipe?: string;
  dateFinReparation?: string;
  tempsPresenceTotalMin?: number; // Permet de spécifier le temps total entre l'entrée et la sortie (ex: 6h = 360 min)
  tempsAttenteReparationMin?: number;
  tempsAttentePiecesMin?: number;
  tempsAttenteDevisMin?: number;
  tempsReaffecteMin?: number;     // Technicien réaffecté (ex: 30 min)
  tempsEssaiMin?: number;         // Essai routier (ex: 15 min)
  tempsAlloueMin?: number;        // Temps prévu/alloué ou barème constructeur (en minutes)
  customSteps?: VehicleTimeStep[];
  updatedAt?: number;
}

export interface VehicleTimeCalculation {
  vehicleKey: string;
  noOr: string;
  chassis: string;
  immatriculation: string;
  client: string;
  equipe: string;
  etat: string;
  avancement: string;
  avancementPct: number;

  dateEntreeReception?: string;
  datePriseEnChargeEquipe?: string;
  dateFinReparation?: string;

  // Durées en minutes
  tempsAttenteReparationMin: number;
  tempsAttentePiecesMin: number;
  tempsAttenteDevisMin: number;
  tempsReaffecteMin: number;
  tempsEssaiMin: number;
  totalAttentesMin: number;
  tempsTravailEffectifMin: number;
  tempsPresenceTotalMin: number;

  // Temps restant dans le travail ("combien reste dans le travail")
  tempsAlloueMin?: number;
  tempsAlloueFormat?: string;
  tempsRestantEstimeMin: number;
  tempsRestantEstimeFormat: string;
  resteTravailStatut: "termine" | "en_cours" | "a_demarrer" | "depasse";

  // Formule mathématique explicite
  formuleCalcul: string;

  // Libellés formatés
  tempsAttenteReparationFormat: string;
  tempsAttentePiecesFormat: string;
  tempsAttenteDevisFormat: string;
  tempsReaffecteFormat: string;
  tempsEssaiFormat: string;
  totalAttentesFormat: string;
  tempsTravailEffectifFormat: string;
  tempsPresenceTotalFormat: string;

  // Liste ordonnée de toutes les étapes chronologiques
  steps: VehicleTimeStep[];
}

const STORAGE_KEY_TIME_LOGS = "flux_atelier_vehicle_time_logs";

/**
 * Extrait le pourcentage d'avancement numérique (0 à 100)
 */
export function parseAvancementPct(val?: string): number {
  if (!val) return 0;
  const s = String(val).toLowerCase().trim();
  if (
    s.includes("termin") ||
    s.includes("fini") ||
    s.includes("livr") ||
    s.includes("pret") ||
    s === "100%" ||
    s === "100"
  ) {
    return 100;
  }
  const match = s.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return Math.min(100, Math.max(0, num));
  }
  return 0;
}

/**
 * Analyse n'importe quel format de date et retourne le timestamp en ms
 */
export function parseDateTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const str = String(dateStr).trim();
  if (str.includes("1899") || str === "-" || str.toLowerCase() === "na") return 0;

  // Google GVIZ format Date(yyyy,m,d,h,m,s)
  const gvizMatch = str.match(
    /Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?\)/i
  );
  if (gvizMatch) {
    const y = Number(gvizMatch[1]);
    const m = Number(gvizMatch[2]);
    const d = Number(gvizMatch[3]);
    const h = Number(gvizMatch[4] || 0);
    const min = Number(gvizMatch[5] || 0);
    const s = Number(gvizMatch[6] || 0);
    if (y <= 1900) return 0;
    return new Date(y, m, d, h, min, s).getTime();
  }

  // Format français standard : DD/MM/YYYY ou DD-MM-YYYY avec heure optionnelle HH:mm ou HH:mm:ss
  const frMatch = str.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2})[:hH](\d{2})(?::(\d{2}))?)?/
  );
  if (frMatch) {
    const d = Number(frMatch[1]);
    const m = Number(frMatch[2]) - 1;
    let y = Number(frMatch[3]);
    if (y < 100) y += 2000;
    const h = Number(frMatch[4] || 0);
    const min = Number(frMatch[5] || 0);
    const s = Number(frMatch[6] || 0);
    return new Date(y, m, d, h, min, s).getTime();
  }

  // ISO standard ou fallback Date.parse
  const parsed = Date.parse(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Vérifie si la chaîne de date contient une composante horaire explicite (HH:mm, HH:mm:ss, etc.)
 */
export function hasExplicitTime(dateStr?: string): boolean {
  if (!dateStr) return false;
  const str = String(dateStr).trim();
  if (/\b\d{1,2}[:hH]\d{2}(:\d{2})?\b/.test(str)) return true;
  if (/Date\(\d{4},\s*\d{1,2},\s*\d{1,2},\s*\d{1,2}/i.test(str)) return true;
  if (/T\d{2}:\d{2}/.test(str)) return true;
  return false;
}

/**
 * Ajuste un timestamp qui a été renseigné comme date seule (00h00)
 * pour éviter de se retrouver avant la date d'entrée du véhicule
 */
export function adjustDateOnlyTimestamp(tsDateOnly: number, tsEntree: number): number {
  if (!tsDateOnly) return 0;
  if (tsDateOnly > tsEntree) return tsDateOnly;

  const dDate = new Date(tsDateOnly);
  const dEntree = new Date(tsEntree);
  const isSameDay =
    dDate.getFullYear() === dEntree.getFullYear() &&
    dDate.getMonth() === dEntree.getMonth() &&
    dDate.getDate() === dEntree.getDate();

  if (isSameDay) {
    const now = Date.now();
    const dNow = new Date(now);
    const isToday =
      dNow.getFullYear() === dEntree.getFullYear() &&
      dNow.getMonth() === dEntree.getMonth() &&
      dNow.getDate() === dEntree.getDate();

    if (isToday && now > tsEntree) {
      return now;
    }
    // Si c'était un jour antérieur ou même jour passé,
    // on prend 18:00 de ce jour-là ou heure d'entrée + 1h
    const endOfDay = new Date(dDate.getFullYear(), dDate.getMonth(), dDate.getDate(), 18, 0, 0).getTime();
    return Math.max(endOfDay, tsEntree + 60 * 60 * 1000);
  }

  // Si le jour était antérieur par erreur de saisie, au minimum l'heure d'entrée
  return Math.max(Date.now(), tsEntree);
}

/**
 * Formate un nombre de minutes en texte lisible (ex: "45 min", "1h 15min", "1 jour 2h")
 */
export function formatMinutes(minutes: number): string {
  if (isNaN(minutes) || minutes <= 0) return "0 min";

  const totalMin = Math.round(minutes);
  if (totalMin < 60) {
    return `${totalMin} min`;
  }

  const days = Math.floor(totalMin / (60 * 24));
  const remainingHours = Math.floor((totalMin % (60 * 24)) / 60);
  const remainingMin = totalMin % 60;

  if (days >= 1) {
    if (days === 1 && remainingHours === 0) return "1 jour";
    if (remainingHours === 0) return `${days} jours`;
    return `${days}j ${remainingHours}h`;
  }

  if (remainingMin === 0) {
    return `${remainingHours}h`;
  }
  return `${remainingHours}h ${String(remainingMin).padStart(2, "0")}min`;
}

/**
 * Retourne la date formatée sous la forme "DD/MM/YYYY HH:mm"
 */
export function formatDateDisplay(dateStrOrTs?: string | number): string {
  if (!dateStrOrTs) return "-";
  let ts = 0;
  if (typeof dateStrOrTs === "number") {
    ts = dateStrOrTs;
  } else {
    ts = parseDateTimestamp(dateStrOrTs);
  }
  if (!ts) return String(dateStrOrTs || "-");

  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Récupère les données de temps manuelles ou personnalisées depuis le localStorage
 */
export function getVehicleTimeLogs(): Record<string, VehicleTimeLog> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TIME_LOGS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erreur lecture time logs:", e);
  }
  return {};
}

/**
 * Sauvegarde un log de temps pour un véhicule
 */
export function saveVehicleTimeLog(log: VehicleTimeLog): void {
  try {
    const all = getVehicleTimeLogs();
    const key = normalizeVehicleKey(log.vehicleKey || log.noOr || log.chassis);
    all[key] = {
      ...log,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY_TIME_LOGS, JSON.stringify(all));
    window.dispatchEvent(new Event("vehicle_time_tracking_updated"));
  } catch (e) {
    console.warn("Erreur sauvegarde time log:", e);
  }
}

function normalizeVehicleKey(key?: string): string {
  return String(key || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Calcule tous les temps d'un véhicule en fusionnant les données Sheets, les demandes d'achats, devis et les logs locaux
 */
export function calculateVehicleTimes(
  vehicle: Partial<Flux> & Partial<SuiviEntree> & {
    id?: any;
    noOr?: string;
    ordre?: string;
    no?: string;
    chassis?: string;
    client?: string;
    nomClient?: string;
    immatriculation?: string;
    serie?: string;
    equipe?: string;
    statut?: string;
    etat?: string;
    etatIntervention?: string;
    dateEntree?: string;
    dateEntreeHeure?: string;
    heureEntree?: string;
    dateDebutRep?: string;
    dateFinRep?: string;
    heureFin?: string;
    avancement?: string;
  }
): VehicleTimeCalculation {
  const or = vehicle.noOr || vehicle.ordre || vehicle.no || "-";
  const chassis = vehicle.chassis || "-";
  const immat = vehicle.immatriculation || vehicle.serie || "-";
  const client = vehicle.nomClient || vehicle.client || "Client non spécifié";
  const equipe = vehicle.equipe || "Daily";
  const etat = vehicle.etatIntervention || vehicle.etat || vehicle.statut || "En cours";
  const avancement = vehicle.avancement || "0%";

  const key = normalizeVehicleKey(or !== "-" ? or : chassis);
  const timeLogs = getVehicleTimeLogs();
  const customLog = timeLogs[key] || timeLogs[normalizeVehicleKey(chassis)] || null;

  // 1. Détermination de la date d'entrée réception
  const dateEntreeRaw =
    customLog?.dateEntreeReception ||
    vehicle.dateEntreeHeure ||
    (vehicle.dateEntree && vehicle.heureEntree ? `${vehicle.dateEntree} ${vehicle.heureEntree}`.trim() : vehicle.dateEntree) ||
    vehicle.date ||
    "";
  let tsEntree = parseDateTimestamp(dateEntreeRaw);
  if (tsEntree === 0 && vehicle.creationTimestamp && vehicle.creationTimestamp > 0) {
    tsEntree = vehicle.creationTimestamp;
  }

  // Détection si le véhicule est en "Attente Réparation"
  const isEnAttenteReparation =
    etat.toLowerCase().includes("attente r") ||
    etat.toLowerCase().includes("attente_r") ||
    etat.toLowerCase() === "attente réparation" ||
    avancement.toLowerCase().includes("attente r") ||
    avancement.toLowerCase() === "attente réparation";

  // 2. Détermination de la date de prise en charge en atelier (entrée équipe)
  let datePriseEnChargeRaw =
    customLog?.datePriseEnChargeEquipe ||
    vehicle.dateDebutRep ||
    "";

  let tsPriseEnCharge = parseDateTimestamp(datePriseEnChargeRaw);
  if (tsPriseEnCharge > 0 && tsEntree > 0 && tsPriseEnCharge <= tsEntree && !hasExplicitTime(datePriseEnChargeRaw)) {
    tsPriseEnCharge = adjustDateOnlyTimestamp(tsPriseEnCharge, tsEntree);
  }
  if (!tsPriseEnCharge && tsEntree > 0) {
    // Si l'état est "En cours" (et pas en attente de réparation) et qu'aucune date début n'est renseignée
    if (!isEnAttenteReparation && (etat.toLowerCase().includes("cours") || avancement.toLowerCase().includes("cours"))) {
      tsPriseEnCharge = tsEntree; // fallback prise en charge dès l'entrée
    }
  }

  // 3. Détermination de la date de fin des travaux
  const isTermine =
    avancement.toLowerCase().includes("termin") ||
    avancement.toLowerCase().includes("fini") ||
    parseAvancementPct(avancement) >= 100 ||
    etat.toLowerCase().includes("livr") ||
    etat.toLowerCase().includes("pret") ||
    etat.toLowerCase().includes("termin");

  const dateFinRaw =
    customLog?.dateFinReparation ||
    (vehicle.dateFinRep && vehicle.heureFin ? `${vehicle.dateFinRep} ${vehicle.heureFin}`.trim() : vehicle.dateFinRep) ||
    "";

  // Calcul du point de fin effectif :
  // - Si le véhicule est EN COURS (!isTermine) : le séjour en atelier court jusqu'à MAINTENANT (Date.now())
  // - Si le véhicule est TERMINÉ (isTermine) :
  //     a) dateFinReparation personnalisée si définie
  //     b) dateFinRep avec heure si disponible
  //     c) si dateFinRep est sans heure ou <= tsEntree (ex: "27/9/2026" 00h00), ajuster à aujourd'hui maintenant ou fin de journée
  let tsFinEffective = Date.now();

  if (isTermine) {
    if (customLog?.dateFinReparation) {
      const parsedCustom = parseDateTimestamp(customLog.dateFinReparation);
      if (parsedCustom > 0) tsFinEffective = parsedCustom;
    } else if (dateFinRaw) {
      const parsedFin = parseDateTimestamp(dateFinRaw);
      if (parsedFin > 0) {
        if (!hasExplicitTime(dateFinRaw) || (tsEntree > 0 && parsedFin <= tsEntree)) {
          tsFinEffective = adjustDateOnlyTimestamp(parsedFin, tsEntree);
        } else {
          tsFinEffective = parsedFin;
        }
      }
    }
  } else {
    // En cours de travaux ou en attente : séjour en direct jusqu'à maintenant
    tsFinEffective = Date.now();
  }

  // Sécurité absolue : tsFinEffective ne doit jamais être avant tsEntree si tsEntree existe
  if (tsEntree > 0 && tsFinEffective < tsEntree) {
    tsFinEffective = Math.max(Date.now(), tsEntree);
  }

  // Helper pour matcher le véhicule sur OR, châssis, immatriculation ou vehicleId
  const matchVehicle = (item: { or?: string; chassis?: string; immatriculation?: string; vehicleId?: any; id?: string }) => {
    if (vehicle.id && item.vehicleId && String(item.vehicleId) === String(vehicle.id)) return true;
    if (vehicle.id && item.id && String(item.id) === String(vehicle.id)) return true;
    if (item.or && normalizeVehicleKey(item.or) === key) return true;
    if (item.chassis && normalizeVehicleKey(item.chassis) === normalizeVehicleKey(chassis)) return true;
    if (item.immatriculation && immat && normalizeVehicleKey(item.immatriculation) === normalizeVehicleKey(immat)) return true;
    return false;
  };

  // 4. Analyse des demandes d'achat (Pièces) pour ce véhicule
  const allAchats = getDemandesAchatLocal();
  const vehicleAchats = Object.values(allAchats).filter(matchVehicle);

  let totalAttentePiecesMin = 0;
  const piecesSteps: VehicleTimeStep[] = [];

  vehicleAchats.forEach((achat, idx) => {
    const tsAchatDemande = parseDateTimestamp(achat.date);
    if (tsAchatDemande > 0) {
      let tsAchatLivre = parseDateTimestamp(achat.dateLivraison);
      if (!tsAchatLivre && achat.statutAchat === "Livré") {
        tsAchatLivre = tsAchatDemande + 15 * 60 * 1000; // approximation 15min si non spécifié
      } else if (!tsAchatLivre) {
        tsAchatLivre = tsFinEffective;
      }

      if (tsAchatLivre < tsAchatDemande && achat.dateLivraison && !hasExplicitTime(achat.dateLivraison)) {
        tsAchatLivre = adjustDateOnlyTimestamp(tsAchatLivre, tsAchatDemande);
      }

      const diffMin = Math.max(0, Math.round((tsAchatLivre - tsAchatDemande) / (1000 * 60)));
      totalAttentePiecesMin += diffMin;

      piecesSteps.push({
        id: `achat-${idx}`,
        type: "attente_pieces",
        label: `Attente pièces : ${achat.designation || achat.ref || "Pièces"}`,
        dateDebut: formatDateDisplay(tsAchatDemande),
        dateFin: achat.statutAchat === "Livré" ? formatDateDisplay(tsAchatLivre) : "En cours",
        dureeMinutes: diffMin,
        commentaire: `Qté: ${achat.qt || 1} • Statut: ${achat.statutAchat || "Attente"}`,
        automatique: true,
      });
    }
  });

  // Détection automatique si le véhicule est en Attente PDR ou attends acheter sans fiche achat préalable
  if (
    totalAttentePiecesMin === 0 &&
    (avancement.toLowerCase().includes("pdr") ||
      avancement.toLowerCase().includes("achet") ||
      etat.toLowerCase().includes("pdr") ||
      etat.toLowerCase().includes("achet"))
  ) {
    const tsModif = parseDateTimestamp(vehicle.dateModification);
    const tsDebutPieces = tsModif > 0 ? tsModif : (tsPriseEnCharge > 0 ? tsPriseEnCharge : (tsEntree > 0 ? tsEntree : Date.now()));
    const diffMin = Math.max(0, Math.round((tsFinEffective - tsDebutPieces) / (1000 * 60)));
    totalAttentePiecesMin = diffMin;

    piecesSteps.push({
      id: "pieces-active-auto",
      type: "attente_pieces",
      label: "Attente Pièces de Rechange (PDR)",
      dateDebut: formatDateDisplay(tsDebutPieces),
      dateFin: isTermine ? formatDateDisplay(tsFinEffective) : "En cours",
      dureeMinutes: diffMin,
      commentaire: `Attente pièces active depuis le ${formatDateDisplay(tsDebutPieces)}`,
      automatique: true,
    });
  }

  // 5. Analyse des demandes de devis pour ce véhicule
  const allDevis = getDemandesDevisLocal();
  const vehicleDevis = Object.values(allDevis).filter(matchVehicle);

  let totalAttenteDevisMin = 0;
  const devisSteps: VehicleTimeStep[] = [];

  vehicleDevis.forEach((devis, idx) => {
    // 1. Détermination précise du début de l'attente devis
    let tsDevisDemande = 0;
    if (devis.createdAtTimestamp && devis.createdAtTimestamp > 0) {
      tsDevisDemande = devis.createdAtTimestamp;
    } else if (devis.date && devis.date.includes(":") && parseDateTimestamp(devis.date) > 0) {
      tsDevisDemande = parseDateTimestamp(devis.date);
    } else if (devis.calledAtTimestamp && devis.calledAtTimestamp > 0) {
      tsDevisDemande = devis.calledAtTimestamp;
    } else if (devis.dateAppel && parseDateTimestamp(devis.dateAppel) > 0) {
      tsDevisDemande = parseDateTimestamp(devis.dateAppel);
    } else if (devis.date) {
      tsDevisDemande = parseDateTimestamp(devis.date);
    }

    if (tsDevisDemande > 0) {
      // 2. Détermination précise de la fin de l'attente devis (accord ou refus client)
      let tsDevisAccord = tsFinEffective;

      if (devis.statutDevis === "Accepté" || devis.statutDevis === "Refusé") {
        if (devis.decisionAtTimestamp && devis.decisionAtTimestamp > 0) {
          tsDevisAccord = devis.decisionAtTimestamp;
        } else if (devis.dateDecision) {
          const parsed = parseDateTimestamp(devis.dateDecision);
          if (parsed > 0) {
            tsDevisAccord = parsed;
          }
        }
      }

      if (tsDevisAccord < tsDevisDemande && devis.dateDecision && !hasExplicitTime(devis.dateDecision)) {
        tsDevisAccord = adjustDateOnlyTimestamp(tsDevisAccord, tsDevisDemande);
      }

      const diffMin = Math.max(0, Math.round((tsDevisAccord - tsDevisDemande) / (1000 * 60)));
      totalAttenteDevisMin += diffMin;

      devisSteps.push({
        id: `devis-${idx}`,
        type: "attente_devis",
        label: `Attente accord devis (${devis.numeroDevis || "N° DV"})`,
        dateDebut: formatDateDisplay(tsDevisDemande),
        dateFin:
          devis.statutDevis === "Accepté" || devis.statutDevis === "Refusé"
            ? formatDateDisplay(tsDevisAccord)
            : "En attente d'accord",
        dureeMinutes: diffMin,
        commentaire: `Statut: ${devis.statutDevis || "En attente"} • Durée: ${formatMinutes(diffMin)}`,
        automatique: true,
      });
    }
  });

  // Détection automatique si le véhicule est en ATENDE DEVIS sans fiche devis préalable
  if (
    totalAttenteDevisMin === 0 &&
    (avancement.toUpperCase().includes("DEVIS") || etat.toUpperCase().includes("DEVIS"))
  ) {
    const tsModif = parseDateTimestamp(vehicle.dateModification);
    const tsDebutDevis = tsModif > 0 ? tsModif : (tsPriseEnCharge > 0 ? tsPriseEnCharge : (tsEntree > 0 ? tsEntree : Date.now()));
    const diffMin = Math.max(0, Math.round((tsFinEffective - tsDebutDevis) / (1000 * 60)));
    totalAttenteDevisMin = diffMin;

    devisSteps.push({
      id: "devis-active-auto",
      type: "attente_devis",
      label: "Attente accord devis client",
      dateDebut: formatDateDisplay(tsDebutDevis),
      dateFin: isTermine ? formatDateDisplay(tsFinEffective) : "En attente accord",
      dureeMinutes: diffMin,
      commentaire: `Attente devis active depuis le ${formatDateDisplay(tsDebutDevis)}`,
      automatique: true,
    });
  }

  // 5.b Analyse des réaffectations du technicien pour ce véhicule
  const allReaffectations = getReaffectationsLocal();
  const vehicleReaffectations = Object.values(allReaffectations).filter(matchVehicle);

  let totalReaffecteMin = 0;
  const reaffectSteps: VehicleTimeStep[] = [];
  const treatedReaffectIds = new Set<string>();

  vehicleReaffectations.forEach((reaff, idx) => {
    if (treatedReaffectIds.has(reaff.id)) return;
    treatedReaffectIds.add(reaff.id);

    const tsDebut = reaff.timestampReaffectation || parseDateTimestamp(reaff.dateReaffectation);
    if (tsDebut > 0) {
      let tsFin = reaff.timestampReprise || parseDateTimestamp(reaff.dateReprise);
      if (!tsFin && reaff.isRepris) {
        tsFin = tsDebut + 30 * 60 * 1000; // approximation 30min si non spécifié
      } else if (!tsFin) {
        tsFin = tsFinEffective;
      }

      if (tsFin < tsDebut && reaff.dateReprise && !hasExplicitTime(reaff.dateReprise)) {
        tsFin = adjustDateOnlyTimestamp(tsFin, tsDebut);
      }

      const diffMin = Math.max(0, Math.round((tsFin - tsDebut) / (1000 * 60)));
      totalReaffecteMin += diffMin;

      reaffectSteps.push({
        id: `reaffect-${idx}`,
        type: "reaffectation",
        label: `Technicien réaffecté : ${reaff.technicienNom || reaff.technicienMatricule || "Technicien"}`,
        dateDebut: formatDateDisplay(tsDebut),
        dateFin: reaff.isRepris ? formatDateDisplay(tsFin) : "En cours de réaffectation",
        dureeMinutes: diffMin,
        commentaire: `Équipe: ${reaff.equipe || equipe} • ${reaff.isRepris ? "Travail repris" : "Pause réaffectation"}`,
        automatique: true,
      });
    }
  });

  // Détection automatique si Technicien réaffecté sans fiche préalable
  if (
    totalReaffecteMin === 0 &&
    (avancement.toLowerCase().includes("reaffect") || etat.toLowerCase().includes("reaffect"))
  ) {
    const tsModif = parseDateTimestamp(vehicle.dateModification);
    const tsDebutReaff = tsModif > 0 ? tsModif : (tsPriseEnCharge > 0 ? tsPriseEnCharge : (tsEntree > 0 ? tsEntree : Date.now()));
    const diffMin = Math.max(0, Math.round((tsFinEffective - tsDebutReaff) / (1000 * 60)));
    totalReaffecteMin = diffMin;

    reaffectSteps.push({
      id: "reaffect-active-auto",
      type: "reaffectation",
      label: "Technicien réaffecté",
      dateDebut: formatDateDisplay(tsDebutReaff),
      dateFin: isTermine ? formatDateDisplay(tsFinEffective) : "En cours de réaffectation",
      dureeMinutes: diffMin,
      commentaire: `Réaffectation active depuis le ${formatDateDisplay(tsDebutReaff)}`,
      automatique: true,
    });
  }

  // 5.c Analyse des essais routiers et contrôles pour ce véhicule
  const allEssais = getVehicleEssaisLocal();
  const vehicleEssais = allEssais.filter(matchVehicle);

  let totalEssaiMin = 0;
  const essaiSteps: VehicleTimeStep[] = [];
  const treatedEssaiIds = new Set<string>();

  vehicleEssais.forEach((essai, idx) => {
    if (treatedEssaiIds.has(essai.id)) return;
    treatedEssaiIds.add(essai.id);

    const tsDebut = essai.timestampDebut || parseDateTimestamp(essai.dateDebut);
    if (tsDebut > 0) {
      let tsFin = essai.timestampFin || parseDateTimestamp(essai.dateFin);
      if (!tsFin && essai.isTermine) {
        tsFin = tsDebut + 15 * 60 * 1000; // approximation 15min si non spécifié
      } else if (!tsFin) {
        tsFin = tsFinEffective;
      }

      if (tsFin < tsDebut && essai.dateFin && !hasExplicitTime(essai.dateFin)) {
        tsFin = adjustDateOnlyTimestamp(tsFin, tsDebut);
      }

      const diffMin = Math.max(0, Math.round((tsFin - tsDebut) / (1000 * 60)));
      totalEssaiMin += diffMin;

      essaiSteps.push({
        id: `essai-${idx}`,
        type: "essai",
        label: `Essai routier & Contrôle : ${essai.essayeur || "Atelier"}`,
        dateDebut: formatDateDisplay(tsDebut),
        dateFin: essai.isTermine ? formatDateDisplay(tsFin) : "Essai en cours",
        dureeMinutes: diffMin,
        commentaire: `Résultat: ${essai.resultat || "En cours"} • ${essai.isTermine ? "Terminé" : "En cours"}`,
        automatique: true,
      });
    }
  });

  // Détection automatique si Essai sans fiche préalable
  if (
    totalEssaiMin === 0 &&
    (avancement.toLowerCase().includes("essai") || etat.toLowerCase() === "essai")
  ) {
    const tsModif = parseDateTimestamp(vehicle.dateModification);
    const tsDebutEssai = tsModif > 0 ? tsModif : (tsPriseEnCharge > 0 ? tsPriseEnCharge : (tsEntree > 0 ? tsEntree : Date.now()));
    const diffMin = Math.max(0, Math.round((tsFinEffective - tsDebutEssai) / (1000 * 60)));
    totalEssaiMin = diffMin;

    essaiSteps.push({
      id: "essai-active-auto",
      type: "essai",
      label: "Contrôle & Essai Routier",
      dateDebut: formatDateDisplay(tsDebutEssai),
      dateFin: isTermine ? formatDateDisplay(tsFinEffective) : "Essai en cours",
      dureeMinutes: diffMin,
      commentaire: `Essai en cours depuis le ${formatDateDisplay(tsDebutEssai)}`,
      automatique: true,
    });
  }

  // 5.d Analyse des transferts VR (inter-équipes) pour ce véhicule
  const allTransfers = getVehicleTransfersLocal();
  const vehicleTransfers = allTransfers.filter(matchVehicle);
  const transferSteps: VehicleTimeStep[] = [];
  const treatedTransferIds = new Set<string>();

  vehicleTransfers.forEach((tr, idx) => {
    if (treatedTransferIds.has(tr.id)) return;
    treatedTransferIds.add(tr.id);

    const tsDebut = tr.timestampTransfert || parseDateTimestamp(tr.dateTransfert);
    if (tsDebut > 0) {
      let tsFin = tr.timestampAcceptation || parseDateTimestamp(tr.dateAcceptation);
      if (!tsFin && tr.isAccepte) {
        tsFin = tsDebut + 10 * 60 * 1000;
      } else if (!tsFin) {
        tsFin = tsFinEffective;
      }
      const diffMin = Math.max(0, Math.round((tsFin - tsDebut) / (1000 * 60)));

      transferSteps.push({
        id: `transfer-${idx}`,
        type: "travail",
        label: `Transfert ${tr.vrCode} (${tr.equipeDepart} → ${tr.equipeCible})`,
        dateDebut: formatDateDisplay(tsDebut),
        dateFin: tr.isAccepte ? formatDateDisplay(tsFin) : "En attente acceptation",
        dureeMinutes: diffMin,
        commentaire: `Transféré le ${formatDateDisplay(tsDebut)} • ${tr.isAccepte ? "Accepté par " + (tr.acceptePar || "Équipe") : "En attente"}`,
        automatique: true,
      });
    }
  });

  if (transferSteps.length === 0 && avancement.toLowerCase().startsWith("vr")) {
    const tsModif = parseDateTimestamp(vehicle.dateModification);
    const tsDebutTransfer = tsModif > 0 ? tsModif : Date.now();
    const diffMin = Math.max(0, Math.round((tsFinEffective - tsDebutTransfer) / (1000 * 60)));
    transferSteps.push({
      id: "transfer-active-auto",
      type: "travail",
      label: `Transfert ${avancement}`,
      dateDebut: formatDateDisplay(tsDebutTransfer),
      dateFin: "En cours",
      dureeMinutes: diffMin,
      commentaire: `Transfert ${avancement} initié le ${formatDateDisplay(tsDebutTransfer)}`,
      automatique: true,
    });
  }

  // 6. Prise en compte des étapes manuelles ou personnalisées
  let customAttenteReparationMin = 0;
  if (customLog?.customSteps && customLog.customSteps.length > 0) {
    customLog.customSteps.forEach((cs) => {
      const tsD = parseDateTimestamp(cs.dateDebut);
      const tsF = cs.dateFin ? parseDateTimestamp(cs.dateFin) : (isTermine ? tsFinEffective : Date.now());
      const min = cs.dureeMinutes ?? (tsD > 0 && tsF > tsD ? Math.round((tsF - tsD) / 60000) : 0);

      if (cs.type === "attente_reparation") {
        customAttenteReparationMin += min;
      } else if (cs.type === "attente_pieces") {
        totalAttentePiecesMin += min;
        piecesSteps.push({ ...cs, dureeMinutes: min });
      } else if (cs.type === "attente_devis") {
        totalAttenteDevisMin += min;
        devisSteps.push({ ...cs, dureeMinutes: min });
      } else if (cs.type === "reaffectation") {
        totalReaffecteMin += min;
        reaffectSteps.push({ ...cs, dureeMinutes: min });
      } else if (cs.type === "essai") {
        totalEssaiMin += min;
        essaiSteps.push({ ...cs, dureeMinutes: min });
      }
    });
  }

  // Surcharges manuelles directes du log si définies
  if (typeof customLog?.tempsReaffecteMin === "number") {
    totalReaffecteMin = customLog.tempsReaffecteMin;
  }
  if (typeof customLog?.tempsEssaiMin === "number") {
    totalEssaiMin = customLog.tempsEssaiMin;
  }
  if (typeof customLog?.tempsAttentePiecesMin === "number") {
    totalAttentePiecesMin = customLog.tempsAttentePiecesMin;
  }
  if (typeof customLog?.tempsAttenteDevisMin === "number") {
    totalAttenteDevisMin = customLog.tempsAttenteDevisMin;
  }

  // 7. Calculs fondamentaux selon la formule exacte de l'atelier :
  // Travail Net Effectif = Temps entre entrée et sortie - (Attente Réparation + Attente Pièces + Attente Devis + Technicien réaffecté + Essai)

  // A. Tout le temps (Temps total entre entrée et sortie, ou séjour total)
  let tempsPresenceTotalMin = 0;
  if (typeof customLog?.tempsPresenceTotalMin === "number" && customLog.tempsPresenceTotalMin > 0) {
    tempsPresenceTotalMin = customLog.tempsPresenceTotalMin;
  } else if (tsEntree > 0) {
    tempsPresenceTotalMin = Math.max(0, Math.round((tsFinEffective - tsEntree) / (1000 * 60)));
  }

  // B. Attente Réparation (Entrée atelier - Réception, ou tout le séjour si pas encore pris en charge)
  let tempsAttenteReparationMin = 0;
  if (typeof customLog?.tempsAttenteReparationMin === "number") {
    tempsAttenteReparationMin = customLog.tempsAttenteReparationMin;
  } else if (customAttenteReparationMin > 0) {
    tempsAttenteReparationMin = customAttenteReparationMin;
  } else if (tsEntree > 0 && tsPriseEnCharge > tsEntree) {
    tempsAttenteReparationMin = Math.round((tsPriseEnCharge - tsEntree) / (1000 * 60));
  } else if (tsEntree > 0 && (isEnAttenteReparation || !tsPriseEnCharge) && !isTermine) {
    // Le véhicule attend toujours sa prise en charge en atelier
    tempsAttenteReparationMin = tempsPresenceTotalMin;
  }

  // C. Somme des déductions d'attente et interruptions :
  // (Attente Réparation + Attente Pièces + Attente Devis + Technicien réaffecté + Essai)
  const totalAttentesMin = Math.min(
    tempsPresenceTotalMin > 0 ? tempsPresenceTotalMin : Infinity,
    tempsAttenteReparationMin + totalAttentePiecesMin + totalAttenteDevisMin + totalReaffecteMin + totalEssaiMin
  );

  // D. Temps de travail effectif NET = Temps total entre l'entrée et la sortie - (Attente Réparation + Attente Pièces + Attente Devis + Technicien réaffecté + Essai)
  const tempsTravailEffectifMin = Math.max(0, tempsPresenceTotalMin - totalAttentesMin);

  // Formule mathématique lisible et explicite :
  // Exemple exact : 6h - (30min [Rép] + 15min [Pièces] + 3h [Devis] + 30min [Réaffecté] + 15min [Essai]) = 1h 30min de travail net effectif
  const formuleCalcul = `${formatMinutes(tempsPresenceTotalMin)} - (${formatMinutes(
    tempsAttenteReparationMin
  )} [Rép] + ${formatMinutes(totalAttentePiecesMin)} [Pièces] + ${formatMinutes(totalAttenteDevisMin)} [Devis] + ${formatMinutes(
    totalReaffecteMin
  )} [Réaffecté] + ${formatMinutes(totalEssaiMin)} [Essai]) = ${formatMinutes(tempsTravailEffectifMin)} de travail net effectif`;

  // E. Combien reste dans le travail (Temps restant estimé pour achever le véhicule)
  const avancementPct = parseAvancementPct(avancement);
  const tempsAlloueMin = customLog?.tempsAlloueMin;
  let tempsRestantEstimeMin = 0;
  let tempsRestantEstimeFormat = "0 min";
  let resteTravailStatut: "termine" | "en_cours" | "a_demarrer" | "depasse" = "en_cours";

  if (isTermine || avancementPct >= 100) {
    tempsRestantEstimeMin = 0;
    tempsRestantEstimeFormat = "0 min (Terminé)";
    resteTravailStatut = "termine";
  } else if (tempsAlloueMin && tempsAlloueMin > 0) {
    // Si un barème constructeur / temps alloué est saisi (ex: 2h = 120min)
    const diff = tempsAlloueMin - tempsTravailEffectifMin;
    if (diff <= 0) {
      tempsRestantEstimeMin = 0;
      tempsRestantEstimeFormat = `Dépassé de ${formatMinutes(Math.abs(diff))}`;
      resteTravailStatut = "depasse";
    } else {
      tempsRestantEstimeMin = diff;
      tempsRestantEstimeFormat = formatMinutes(diff);
      resteTravailStatut = "en_cours";
    }
  } else if (avancementPct > 0 && tempsTravailEffectifMin > 0) {
    // Calcul proportionnel basé sur l'avancement :
    // Ex: si 50% réalisé en 45 min de travail net -> reste (100 - 50)/50 * 45 = 45 min
    const pctRestant = 100 - avancementPct;
    tempsRestantEstimeMin = Math.round(tempsTravailEffectifMin * (pctRestant / avancementPct));
    tempsRestantEstimeFormat = `${formatMinutes(tempsRestantEstimeMin)} (${pctRestant}% restant)`;
    resteTravailStatut = "en_cours";
  } else if (avancementPct === 0 && tempsTravailEffectifMin === 0) {
    tempsRestantEstimeMin = 0;
    tempsRestantEstimeFormat = "En attente démarrage";
    resteTravailStatut = "a_demarrer";
  } else {
    tempsRestantEstimeMin = 0;
    tempsRestantEstimeFormat = "En cours";
    resteTravailStatut = "en_cours";
  }

  // 8. Construction de la timeline ordonnée
  const steps: VehicleTimeStep[] = [];

  if (tsEntree > 0) {
    steps.push({
      id: "step-reception",
      type: "reception",
      label: "Entrée Réception Atelier",
      dateDebut: formatDateDisplay(tsEntree),
      commentaire: `Réceptionné le ${formatDateDisplay(tsEntree)}`,
      automatique: true,
    });
  }

  if (tsPriseEnCharge > 0) {
    steps.push({
      id: "step-prise-en-charge",
      type: "entree_equipe",
      label: `Prise en charge Équipe (${equipe})`,
      dateDebut: formatDateDisplay(tsPriseEnCharge),
      commentaire: `Attente avant réparation : ${formatMinutes(tempsAttenteReparationMin)}`,
      dureeMinutes: tempsAttenteReparationMin,
      automatique: true,
    });
  }

  // Ajout des attentes pièces, devis, réaffectation, essais et transferts
  steps.push(...piecesSteps);
  steps.push(...devisSteps);
  steps.push(...reaffectSteps);
  steps.push(...essaiSteps);
  steps.push(...transferSteps);

  if (isTermine) {
    steps.push({
      id: "step-fin",
      type: "fin",
      label: "Fin des travaux / Prêt",
      dateDebut: formatDateDisplay(tsFinEffective),
      commentaire: `Temps de travail effectif net : ${formatMinutes(tempsTravailEffectifMin)}`,
      dureeMinutes: tempsTravailEffectifMin,
      automatique: true,
    });
  }

  // Tri chronologique de l'ensemble des étapes
  steps.sort((a, b) => {
    const tsA = parseDateTimestamp(a.dateDebut);
    const tsB = parseDateTimestamp(b.dateDebut);
    return tsA - tsB;
  });

  return {
    vehicleKey: key,
    noOr: or,
    chassis,
    immatriculation: immat,
    client,
    equipe,
    etat,
    avancement,
    avancementPct,
    dateEntreeReception: dateEntreeRaw ? formatDateDisplay(dateEntreeRaw) : "-",
    datePriseEnChargeEquipe: datePriseEnChargeRaw ? formatDateDisplay(datePriseEnChargeRaw) : "-",
    dateFinReparation: dateFinRaw ? formatDateDisplay(dateFinRaw) : (isTermine ? "Terminé" : "En cours"),

    tempsAttenteReparationMin,
    tempsAttentePiecesMin: totalAttentePiecesMin,
    tempsAttenteDevisMin: totalAttenteDevisMin,
    tempsReaffecteMin: totalReaffecteMin,
    tempsEssaiMin: totalEssaiMin,
    totalAttentesMin,
    tempsTravailEffectifMin,
    tempsPresenceTotalMin,

    tempsAlloueMin,
    tempsAlloueFormat: tempsAlloueMin ? formatMinutes(tempsAlloueMin) : undefined,
    tempsRestantEstimeMin,
    tempsRestantEstimeFormat,
    resteTravailStatut,
    formuleCalcul,

    tempsAttenteReparationFormat: formatMinutes(tempsAttenteReparationMin),
    tempsAttentePiecesFormat: formatMinutes(totalAttentePiecesMin),
    tempsAttenteDevisFormat: formatMinutes(totalAttenteDevisMin),
    tempsReaffecteFormat: formatMinutes(totalReaffecteMin),
    tempsEssaiFormat: formatMinutes(totalEssaiMin),
    totalAttentesFormat: formatMinutes(totalAttentesMin),
    tempsTravailEffectifFormat: formatMinutes(tempsTravailEffectifMin),
    tempsPresenceTotalFormat: formatMinutes(tempsPresenceTotalMin),

    steps,
  };
}

/**
 * Enregistre immédiatement l'horodatage exact (DD/MM/YYYY HH:mm) de chaque modification d'avancement
 * pour le véhicule (ATENDE DEVIS, Attente PDR, Technicien réaffecté, attends acheter, Essai, Terminer, vr...)
 */
export function recordAvancementStatusChange(
  vehicle: Partial<Flux>,
  avancement: string,
  timestampStr?: string,
  auteur?: string
): void {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const nowFormatted = timestampStr || `${dd}/${mm}/${yyyy} ${hh}:${min}`;

  const key = normalizeVehicleKey(vehicle.ordre || vehicle.no || vehicle.chassis);
  if (!key) return;

  const allLogs = getVehicleTimeLogs();
  const existingLog = allLogs[key] || {
    vehicleKey: key,
    noOr: vehicle.ordre || vehicle.no || "",
    chassis: vehicle.chassis || "",
    immatriculation: vehicle.immatriculation || vehicle.serie || "",
    client: vehicle.client || "",
    equipe: vehicle.equipe || "",
  };

  const steps = existingLog.customSteps ? [...existingLog.customSteps] : [];
  const cleanAv = (avancement || "").trim();

  let stepType: TimeStepType = "travail";
  let stepLabel = `Modification Avancement : ${cleanAv}`;

  if (cleanAv === "ATENDE DEVIS" || cleanAv.toLowerCase().includes("devis")) {
    stepType = "attente_devis";
    stepLabel = `Attente accord devis (${nowFormatted})`;
  } else if (cleanAv === "Attente PDR" || cleanAv === "attends acheter" || cleanAv.toLowerCase().includes("pdr")) {
    stepType = "attente_pieces";
    stepLabel = `Attente pièces / achat (${nowFormatted})`;
  } else if (cleanAv === "Technicien réaffecté") {
    stepType = "reaffectation";
    stepLabel = `Technicien réaffecté (${nowFormatted})`;
  } else if (cleanAv === "Essai") {
    stepType = "essai";
    stepLabel = `Contrôle & Essai routier (${nowFormatted})`;
  } else if (cleanAv === "Terminer") {
    stepType = "fin";
    stepLabel = `Travaux terminés (${nowFormatted})`;
    existingLog.dateFinReparation = nowFormatted;
  } else if (cleanAv.startsWith("vr")) {
    stepType = "travail";
    stepLabel = `Transfert ${cleanAv} (${nowFormatted})`;
  }

  // Fermer la dernière étape ouverte si elle était en cours
  if (steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    if (!lastStep.dateFin || lastStep.dateFin === "En cours") {
      lastStep.dateFin = nowFormatted;
      const tsD = parseDateTimestamp(lastStep.dateDebut);
      const tsF = parseDateTimestamp(nowFormatted);
      if (tsD > 0 && tsF >= tsD) {
        lastStep.dureeMinutes = Math.round((tsF - tsD) / 60000);
      }
    }
  }

  steps.push({
    id: `modif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    type: stepType,
    label: stepLabel,
    dateDebut: nowFormatted,
    dateFin: cleanAv === "Terminer" ? nowFormatted : "En cours",
    dureeMinutes: 0,
    commentaire: `Modification enregistrée à ${nowFormatted}${auteur ? ` par ${auteur}` : ""}`,
    automatique: true,
  });

  existingLog.customSteps = steps;
  saveVehicleTimeLog(existingLog);
}
