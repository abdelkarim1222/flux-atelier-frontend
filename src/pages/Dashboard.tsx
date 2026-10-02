import {
  AlertTriangle,
  BarChart3,
  Car,
  CheckCircle2,
  ChevronLeft,
  CircleGauge,
  ClipboardList,
  Database,
  Clock,
  Gauge,
  LogOut,
  PackageOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldAlert,
  ShoppingCart,
  Users,
  Wrench,
  Eye,
  MapPin,
  Maximize2,
  Minimize2,
  X,
  Bell,
  UserCheck,
  ArrowRightLeft,
  FileSignature,
  Timer,
  PhoneCall,
  XCircle,
  Receipt,
  FileText,
  Award,
} from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { atelierMapSvg } from "../components/atelierMapMarkup";
import SuiviEntreesTable from "../components/SuiviEntreesTable";
import VehicleInventoryView from "../components/VehicleInventoryView";
import FacturationView from "../components/FacturationView";
import GestionAccesView from "../components/GestionAccesView";
import GestionEquipesView from "../components/GestionEquipesView";
import MoyennesView from "../components/MoyennesView";
import EssaiView from "../components/EssaiView";
import AcheterView from "../components/AcheterView";
import GarantieView from "../components/GarantieView";
import DetailVehiculeModal from "../components/DetailVehiculeModal";
import DemandeAchatModal from "../components/DemandeAchatModal";
import AffecterTechnicienModal, {
  getActiveVehicleForTech,
  isVehicleFinished,
  isVehicleActivelyOccupyingTech,
} from "../components/AffecterTechnicienModal";
import DemandeDevisModal from "../components/DemandeDevisModal";
import DevisView, { isDevisDepassee24h } from "../components/DevisView";
import SuiviTempsView from "../components/SuiviTempsView";
import { useAuth } from "../context/AuthContext";
import { useRole } from "../context/RoleContext";
import { USER_NOTIFICATIONS_ENABLED } from "../config/featureFlags";
import { getWorkshopNow } from "../services/workshopTime";
import {
  fluxData,
  statusMeta,
  type Flux,
  type WorkshopStatus,
} from "../data/mockData";
import {
  DELIVERED_EMPLACEMENT,
  DEFAULT_EQUIPE_MAPPINGS,
  fetchEquipeSheetData,
  getCustomEquipeMembers,
  normalizePersonName,
  fetchDatabaseFluxData,
  fetchSuiviEntreesData,
  synchroniserTableauxDeChargement,
  getTeamForChefEquipe,
  isDatabaseWriteConfigured,
  isSheetEmplacementOutsideMap,
  normalizeSheetEmplacement,
  updateDatabaseEtat,
  updateDatabaseTechnicien,
  updateDatabaseAvancement,
  updateDatabaseEmplacement,
  getAvancementOptionsForTeam,
  saveDemandeAchatLocal,
  getDemandesAchatLocal,
  marquerDemandeAchatLivree,
  marquerDemandeAchatAccepteeParEquipe,
  marquerDemandeAchatAttente,
  updateDatabaseStatutAchat,
  type DemandeAchat,
  saveEssaiControleLocal,
  saveDemandeDevisLocal,
  getDemandesDevisLocal,
  marquerDevisAppele,
  marquerDevisAccepte,
  marquerDevisRefuse,
  marquerDevisRelance,
  updateDatabaseStatutDevis,
  syncDemandesDevisFromSql,
  syncDevisNotificationsFromSql,
  type DemandeDevis,
  type ReaffectationRecord,
  getReaffectationsLocal,
  marquerVehiculeReaffecte,
  marquerVehiculeReprise,
  type DevisAccordNotification,
  getDevisAccordNotifications,
  saveDevisAccordNotification,
  removeDevisAccordNotification,
  type NouvelleEntreeNotification,
  getNouvelleEntreeNotifications,
  saveNouvelleEntreeNotification,
  accepterEntreeParChefEquipe,
  removeNouvelleEntreeNotification,
  type EquipeSheetResult,
  mergeRecentAddedVehicles,
  getNowFormatted,
  marquerDebutTransfertVR,
  marquerTransfertAccepte,
  getTeamFromVr,
  marquerDebutEssai,
  marquerFinEssai,
  notifierFinTravauxTechnicien,
  getFacturationNotifications,
  type FacturationNotification,
  livrerVehiculeReception,
} from "../services/database";
import {
  recordAvancementStatusChange,
  recordVehicleModification,
} from "../services/timeTracking";
import { isCompletedWarrantyVehicle, isWarrantyVehicle } from "../services/warranty";
import type { EssaiValidationPayload } from "../components/ValidationEssaiModal";
import { isVehicleMatchingTeam } from "../config/teams";
import {
  calculerEmplacementAutomatique,
  ALL_EMPLACEMENTS,
  DELIVERED_EMPLACEMENT as AUTO_DELIVERED_EMPLACEMENT,
  FULL_PARKING_EMPLACEMENT,
  getZoneForEmplacement,
  normalizeEmplacementCode,
} from "../services/emplacementService";

type StatusFilter = "Tous" | "Attentes" | WorkshopStatus;
type DatabaseStatus = "loading" | "ready" | "fallback";
const ALL_DATES = "Toutes";
const atelierMapDisplaySvg = atelierMapSvg;

const waitingStatuses = new Set<WorkshopStatus>([
  "Attente Client",
  "Attente Réparation",
  "En attente",
  "Attente PDR",
]);

const statusLookup = new Map(
  statusMeta.map((status) => [status.label, status])
);

const tableStatusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: "Tous", value: "Tous" },
  { label: "Attentes", value: "Attentes" },
  ...statusMeta.map((status) => ({
    label: formatStatusLabel(status.label),
    value: status.label,
  })),
];

const editableStatusOptions = statusMeta.map((status) => status.label);
const editableStatusSet = new Set<WorkshopStatus>(editableStatusOptions);

const mapZoneIds = new Set(
  Array.from(atelierMapSvg.matchAll(/\bid="([^"]+)"/g), (match) =>
    match[1].toUpperCase()
  )
);

const editableMapZoneIds = Array.from(
  new Set([
    AUTO_DELIVERED_EMPLACEMENT,
    ...ALL_EMPLACEMENTS,
    ...Array.from(mapZoneIds).filter((zone) => /^[A-Z]+\d+$/.test(zone)),
  ])
);

function removeDraft(
  drafts: Record<number, string>,
  vehicleId: number
) {
  if (!(vehicleId in drafts)) return drafts;

  const nextDrafts = { ...drafts };
  delete nextDrafts[vehicleId];
  return nextDrafts;
}

function statusMatchesFilter(row: Flux, filter: StatusFilter) {
  if (filter === "Tous") return true;
  if (filter === "Attentes") {
    return waitingStatuses.has(row.etatIntervention) || isAttenteReparation(row.etatIntervention, row.avancement);
  }
  if (filter === "Attente Réparation") {
    return isAttenteReparation(row.etatIntervention, row.avancement);
  }

  return String(row.etatIntervention || "").trim().toLowerCase() === String(filter).trim().toLowerCase();
}

function formatStatusLabel(status: WorkshopStatus) {
  if (status === "A livré") return "Livré";
  if (status === "En attente") return "Attente Client";
  if (status === "Attente PDR") return "Attente Réparation";

  return status;
}

function isAttenteReparation(etat?: string, avancement?: string) {
  if (!etat && !avancement) return false;
  const normalized = (etat || "").trim().toLowerCase();
  const normAv = (avancement || "").trim().toLowerCase();
  return (
    normalized === "attente réparation" ||
    normalized === "attente reparation" ||
    normalized === "attente pdr" ||
    normalized.includes("réparation") ||
    normalized.includes("reparation") ||
    normAv === "lancement devis" ||
    normAv === "attente accord" ||
    normAv === "lancement attente accord" ||
    normAv === "atende devis" ||
    normAv === "attente devis" ||
    normAv.includes("devis") ||
    normAv.includes("accord")
  );
}

function isEnCours(
  etat?: string,
  avancement?: string,
  technicien?: string,
  isReaffecteActive?: boolean
): boolean {
  const normEtat = (etat || "").trim().toLowerCase();
  const normAv = (avancement || "").trim().toLowerCase();
  const hasTech = Boolean(technicien && technicien !== "-" && technicien.trim() !== "");

  // Exclusions explicites
  if (normEtat === "essai" || normAv === "essai") return false;
  if (normEtat.includes("achet") || normAv.includes("achet")) return false;
  if (normEtat.includes("livr") || normAv.includes("livr")) return false;
  if (normEtat === "terminer" || normAv === "terminer") return false;
  if (normEtat.includes("attente client") || normAv.includes("attente client")) return false;

  // IMPORTANT : Lancement devis et attente accord devis ne sont PAS en cours
  if (
    normAv.includes("devis") ||
    normAv.includes("accord") ||
    normEtat.includes("devis")
  ) {
    return false;
  }

  // Technicien réaffecté : reste OBLIGATOIREMENT dans le tableau Interventions En cours
  if (
    isReaffecteActive ||
    normAv.includes("réaffect") ||
    normAv.includes("reaffect")
  ) {
    return true;
  }

  // Inclusions : si l'avancement indique un travail en cours ou pourcentage
  if (normAv.startsWith("en cours") || normAv.includes("%")) return true;
  // Si l'état général est En cours
  if (normEtat === "en cours") return true;
  // Si un technicien est affecté (intervention prise en charge par l'équipe) et non en attente de transfert sortant (vr) et non en attente
  if (hasTech && !normAv.startsWith("vr") && !normEtat.includes("attente")) return true;

  return false;
}

function isEssai(row: Flux): boolean {
  const etat = (row.etatIntervention || "").trim().toLowerCase();
  const avancement = (row.avancement || "").trim().toLowerCase();
  return etat === "essai" || avancement === "essai";
}

function isAttenteAchat(row: Flux): boolean {
  const etat = (row.etatIntervention || "").trim().toLowerCase();
  const avancement = (row.avancement || "").trim().toLowerCase();
  return (
    etat === "attends acheter" ||
    etat === "attente achat" ||
    etat === "achat" ||
    avancement === "attends acheter" ||
    avancement.includes("achet")
  );
}

function isAttenteDevis(row: Flux, demandesMap?: Record<string, DemandeDevis>): boolean {
  const etat = (row.etatIntervention || "").trim().toLowerCase();
  const avancement = (row.avancement || "").trim().toLowerCase();
  if (
    avancement === "accepter accord" ||
    avancement === "accord accepté" ||
    avancement === "accord accepte" ||
    etat === "en cours" ||
    avancement.startsWith("en cours")
  ) {
    return false;
  }
  const rowStatutDevis = String((row as any).statutDevis || "").trim().toLowerCase();
  if (
    rowStatutDevis === "accepté" ||
    rowStatutDevis === "accepte" ||
    rowStatutDevis === "accord accepté" ||
    rowStatutDevis === "accord accepte" ||
    rowStatutDevis === "refusé" ||
    rowStatutDevis === "refuse"
  ) {
    return false;
  }
  const d = demandesMap ? (
    demandesMap[String(row.id)] ||
    (row.no && demandesMap[row.no.trim()]) ||
    (row.chassis && demandesMap[row.chassis.trim()])
  ) : undefined;
  if (d && (d.statutDevis === "Accepté" || d.statutDevis === "Refusé")) {
    return false;
  }
  const hasDevis = Boolean(d);
  return (
    avancement === "atende devis" ||
    avancement === "attente devis" ||
    avancement === "lancement devis" ||
    avancement === "attente accord" ||
    avancement === "lancement attente accord" ||
    avancement.includes("devis") ||
    (avancement.includes("accord") && avancement !== "accepter accord" && avancement !== "accord accepté" && avancement !== "accord accepte") ||
    etat === "atende devis" ||
    etat === "attente devis" ||
    etat.includes("devis") ||
    hasDevis
  );
}

function parseAvancementPct(value?: string): number | null {
  if (!value || value === "-") return null;
  const lower = value.toLowerCase();
  if (lower.includes("termin") || lower.includes("fini")) return 100;
  const match = value.match(/(\d{1,3})\s*%/);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : null;
  }
  return null;
}

function getAvancementStyle(val?: string): CSSProperties {
  if (!val || val === "-") {
    return {
      backgroundColor: "#f8fafc",
      color: "#64748b",
      borderColor: "#cbd5e1",
    };
  }
  const lower = val.toLowerCase();
  if (lower.includes("accepter") || lower.includes("accepté") || lower === "accepter accord") {
    return {
      backgroundColor: "#ecfdf5",
      color: "#047857",
      borderColor: "#6ee7b7",
      fontWeight: 700,
    };
  }
  if (lower.includes("devis") || lower.includes("accord")) {
    return {
      backgroundColor: "#fff7ed",
      color: "#c2410c",
      borderColor: "#fed7aa",
    };
  }
  if (lower === "essai") {
    return {
      backgroundColor: "#f5f3ff",
      color: "#6d28d9",
      borderColor: "#ddd6fe",
    };
  }
  if (lower.includes("pdr")) {
    return {
      backgroundColor: "#fff7ed",
      color: "#c2410c",
      borderColor: "#fed7aa",
    };
  }
  if (lower.includes("réaffect") || lower.includes("reaffect")) {
    return {
      backgroundColor: "#fdf4ff",
      color: "#86198f",
      borderColor: "#f0abfc",
    };
  }
  if (lower.includes("attente réparation") || lower.includes("attente reparation")) {
    return {
      backgroundColor: "#fdf2f8",
      color: "#9d174d",
      borderColor: "#fbcfe8",
    };
  }
  if (lower.includes("achet")) {
    return {
      backgroundColor: "#fffbeb",
      color: "#b45309",
      borderColor: "#fde68a",
    };
  }
  if (lower.includes("termin")) {
    return {
      backgroundColor: "#ecfdf5",
      color: "#047857",
      borderColor: "#a7f3d0",
    };
  }
  if (lower.includes("cours")) {
    return {
      backgroundColor: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  }
  if (lower.startsWith("vr")) {
    return {
      backgroundColor: "#faf5ff",
      color: "#7e22ce",
      borderColor: "#e9d5ff",
    };
  }
  return {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    borderColor: "#cbd5e1",
  };
}

function formatStatusFilter(filter: StatusFilter) {
  return filter === "Tous" || filter === "Attentes"
    ? filter
    : formatStatusLabel(filter);
}

function displayText(value: string | number | undefined) {
  const text = String(value ?? "").trim();

  return text || "-";
}

function normalizeDateLabel(value: string | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function parseStoredDate(value: string | undefined) {
  const text = normalizeDateLabel(value);
  const serializedDate = text.match(
    /^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/
  );

  if (serializedDate) {
    return new Date(
      Number(serializedDate[1]),
      Number(serializedDate[2]),
      Number(serializedDate[3])
    ).getTime();
  }

  const frenchDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (frenchDate) {
    const year =
      frenchDate[3].length === 2
        ? 2000 + Number(frenchDate[3])
        : Number(frenchDate[3]);

    return new Date(
      year,
      Number(frenchDate[2]) - 1,
      Number(frenchDate[1])
    ).getTime();
  }

  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (isoDate) {
    return new Date(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3])
    ).getTime();
  }

  return Number.NEGATIVE_INFINITY;
}

function getStatusColor(status: WorkshopStatus) {
  return statusLookup.get(status)?.color ?? "#64748b";
}

/** Couleur du véhicule dans le plan : l'avancement est prioritaire sur l'état. */
function getPlanVehicleColor(row: Pick<Flux, "avancement" | "etatIntervention">): string {
  const advancement = String(row.avancement || "").toLowerCase();
  const progress = advancement.match(/(\d{1,3})\s*%/)?.[1];
  const percent = progress ? Number(progress) : NaN;

  if (Number.isFinite(percent) && percent >= 10 && percent <= 30) return "#0ea5e9"; // bleu
  if (Number.isFinite(percent) && percent >= 40 && percent <= 70) return "#f59e0b"; // ambre
  if (Number.isFinite(percent) && percent >= 80 && percent <= 90) return "#22c55e"; // vert
  if (advancement.includes("attente pdr") || advancement.includes("réaffect") || advancement.includes("reaffect") || advancement.includes("achet")) return "#f97316"; // orange
  if (advancement.includes("essai")) return "#8b5cf6"; // violet
  if (advancement.includes("attente réparation") || advancement.includes("attente reparation") || String(row.etatIntervention || "").toLowerCase().includes("attente réparation")) return "#64748b"; // gris ardoise
  return getStatusColor(row.etatIntervention);
}

/** Couleurs stables des postes libres : elles ne disparaissent pas après le chargement. */
function getFreeEmplacementStyle(zone: string): { fill: string; stroke: string } {
  const prefix = zone.charAt(0).toUpperCase();
  if (prefix === "D") return { fill: "#dbeafe", stroke: "#60a5fa" };
  if (prefix === "J") return { fill: "#dcfce7", stroke: "#34d399" };
  if (prefix === "E") return { fill: "#f3e8ff", stroke: "#c084fc" };
  if (prefix === "S") return { fill: "#d1fae5", stroke: "#34d399" };
  if (prefix === "C") return { fill: "#fae8ff", stroke: "#d946ef" };
  if (prefix === "T" || prefix === "M") return { fill: "#e0f2fe", stroke: "#38bdf8" };
  if (prefix === "L") return { fill: "#ffedd5", stroke: "#fb923c" };
  return { fill: "#f1f5f9", stroke: "#94a3b8" };
}

function badgeStyle(status: WorkshopStatus): CSSProperties {
  const color = getStatusColor(status);

  return {
    backgroundColor: `${color}18`,
    borderColor: `${color}33`,
    color,
  };
}

function formatRefreshDate() {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

function MetricCard({
  active,
  accent,
  helper,
  icon,
  label,
  onClick,
  value,
}: {
  active: boolean;
  accent: string;
  helper: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  value: number;
}) {
  return (
    <button
      className={`metric-card ${active ? "metric-card-active" : ""}`}
      onClick={onClick}
      style={{ "--accent": accent } as CSSProperties}
      type="button"
    >
      <span className="metric-icon">{icon}</span>
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
      <span className="metric-helper">{helper}</span>
    </button>
  );
}

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const { role, roleInfo, permissions } = useRole();
  const assignedReceptionCs = (role === "reception" || role === "garantie")
    ? (currentUser?.assignedTeam || (role === "garantie" ? "R10" : "")).trim().toUpperCase()
    : "";
  type TabType = "chargement" | "en_cours" | "essai" | "attente_achat" | "devis" | "garantie" | "plan_atelier" | "suivi_entrees" | "suivi_temps" | "gestion_acces" | "gestion_equipes" | "moyennes" | "vehicle_inventory" | "facturation" | "att_facture";

  const [activeTab, setActiveTabState] = useState<TabType>(() => {
    try {
      const saved =
        sessionStorage.getItem("flux_atelier_dashboard_tab") ||
        localStorage.getItem("flux_atelier_dashboard_tab");
      if (
        saved === "chargement" ||
        saved === "en_cours" ||
        saved === "essai" ||
        saved === "attente_achat" ||
        saved === "devis" ||
        saved === "garantie" ||
        saved === "plan_atelier" ||
        saved === "suivi_entrees" ||
        saved === "suivi_temps" ||
        saved === "gestion_acces" ||
        saved === "gestion_equipes" ||
        saved === "moyennes" ||
        saved === "vehicle_inventory" ||
        saved === "facturation" ||
        saved === "att_facture"
      ) {
        // Sécurité sur les onglets restreints selon les permissions effectives
        if ((saved === "facturation" || saved === "att_facture") && !permissions.canViewFacturation) {
          return permissions.defaultTab;
        }
        if (saved === "garantie" && !permissions.canViewGarantie) {
          return permissions.defaultTab;
        }
        if (saved === "attente_achat" && !permissions.canViewAttenteAchat) {
          return permissions.defaultTab;
        }
        if (saved === "essai" && !permissions.canViewEssai) {
          return permissions.defaultTab;
        }
        if (saved === "suivi_temps" && !permissions.canViewSuiviTemps) {
          return permissions.defaultTab;
        }
        if (saved === "devis" && !permissions.canViewDevis) {
          return permissions.defaultTab;
        }
        if (saved === "vehicle_inventory" && !(role === "administration" || role === "chef_atelier")) {
          return permissions.defaultTab;
        }
        if (saved === "gestion_acces" && !(role === "administration" || role === "chef_atelier")) {
          return permissions.defaultTab;
        }
        if (saved === "gestion_equipes" && !(role === "administration" || role === "chef_atelier" || permissions.canManageEquipes)) {
          return permissions.defaultTab;
        }
        if (saved === "moyennes" && !(role === "administration" || role === "chef_atelier")) {
          return permissions.defaultTab;
        }
        return saved;
      }
    } catch { }
    return permissions.defaultTab;
  });

  const setActiveTab = useCallback(
    (tab: TabType) => {
      // Sécurité : vérification des autorisations selon permissions
      if (tab === "facturation" && !permissions.canViewFacturation) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      if (tab === "garantie" && !permissions.canViewGarantie) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      if (tab === "attente_achat" && !permissions.canViewAttenteAchat) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      if (tab === "essai" && !permissions.canViewEssai) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      if (tab === "suivi_temps" && !permissions.canViewSuiviTemps) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      if (tab === "devis" && !permissions.canViewDevis) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      if (tab === "vehicle_inventory" && !(role === "administration" || role === "chef_atelier")) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      if (tab === "gestion_equipes" && !(role === "administration" || role === "chef_atelier" || permissions.canManageEquipes)) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      if ((tab === "gestion_acces" || tab === "moyennes") && !(role === "administration" || role === "chef_atelier")) {
        setActiveTabState(permissions.defaultTab);
        return;
      }
      setActiveTabState(tab);
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
      try {
        sessionStorage.setItem("flux_atelier_dashboard_tab", tab);
        localStorage.setItem("flux_atelier_dashboard_tab", tab);
      } catch { }
    },
    [permissions, role]
  );

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  useEffect(() => {
    // Redirection automatique si le rôle actuel est sur un onglet non autorisé
    if ((activeTab === "facturation" || activeTab === "att_facture") && !permissions.canViewFacturation) {
      setActiveTab(permissions.defaultTab);
      return;
    }
    if (activeTab === "attente_achat" && !permissions.canViewAttenteAchat) {
      setActiveTab(permissions.defaultTab);
      return;
    }
    if (activeTab === "essai" && !permissions.canViewEssai) {
      setActiveTab(permissions.defaultTab);
      return;
    }
    if (activeTab === "suivi_temps" && !permissions.canViewSuiviTemps) {
      setActiveTab(permissions.defaultTab);
      return;
    }
    if (activeTab === "devis" && !permissions.canViewDevis) {
      setActiveTab(permissions.defaultTab);
      return;
    }
    if (activeTab === "vehicle_inventory" && !(role === "administration" || role === "chef_atelier")) {
      setActiveTab(permissions.defaultTab);
      return;
    }
    if (activeTab === "gestion_equipes" && !(role === "administration" || role === "chef_atelier" || permissions.canManageEquipes)) {
      setActiveTab(permissions.defaultTab);
      return;
    }
    if ((activeTab === "gestion_acces" || activeTab === "moyennes") && !(role === "administration" || role === "chef_atelier")) {
      setActiveTab(permissions.defaultTab);
      return;
    }

    const saved = sessionStorage.getItem("flux_atelier_dashboard_tab");
    if (!saved) {
      if (role === "facturation") {
        setActiveTab("facturation");
      } else if (role === "reception" || role === "garantie") {
        setActiveTab("suivi_entrees");
      } else if (role === "chef_equipe") {
        setActiveTab("chargement");
        setActiveFilter("Attente Réparation");
      } else if (role === "administration" || role === "chef_atelier") {
        setActiveFilter("Tous");
      }
    } else if (saved === "chargement" && (role === "administration" || role === "chef_atelier")) {
      setActiveFilter("Tous");
    }
  }, [role, activeTab, setActiveTab]);

  const mapRef = useRef<HTMLDivElement>(null);
  const planStageRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (planStageRef.current?.requestFullscreen) {
          await planStageRef.current.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  const [activeFilter, setActiveFilter] = useState<StatusFilter>(
    role === "chef_equipe" ? "Attente Réparation" : "Tous"
  );
  const [selectedZone, setSelectedZone] = useState<string | null>(
    null
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(
    null
  );
  const [isDetailPinned, setIsDetailPinned] = useState(false);
  const [vehiculeModalData, setVehiculeModalData] = useState<Flux | null>(null);
  const [vehicles, setVehicles] = useState<Flux[]>(fluxData);
  const [databaseStatus, setDatabaseStatus] =
    useState<DatabaseStatus>("loading");
  const [databaseError, setDatabaseError] = useState("");
  const [lastRefresh, setLastRefresh] = useState("26/03/2026 08:57");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(ALL_DATES);
  const [draftEmplacements, setDraftEmplacements] = useState<Record<number, string>>({});
  const [savingVehicleId, setSavingVehicleId] = useState<number | null>(null);
  const [writeNotice, setWriteNotice] = useState("");
  const [writeError, setWriteError] = useState("");
  const [showStatusDashboard, setShowStatusDashboard] = useState(false);
  const [showMapLegend, setShowMapLegend] = useState(true);
  const [isMapToolbarCollapsed, setIsMapToolbarCollapsed] = useState(false);
  const canWriteToDatabase = isDatabaseWriteConfigured();

  // Sur téléphone, le plan reste visible dès l'ouverture. La légende peut
  // toujours être développée avec le bouton ☰.
  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 640px)");
    const syncMapToolbar = () => setIsMapToolbarCollapsed(mobileQuery.matches);

    syncMapToolbar();
    mobileQuery.addEventListener("change", syncMapToolbar);
    return () => mobileQuery.removeEventListener("change", syncMapToolbar);
  }, []);

  const [equipeData, setEquipeData] = useState<EquipeSheetResult | null>(null);
  const [pendingEnCoursVehicle, setPendingEnCoursVehicle] = useState<Flux | null>(null);
  const [repriseChooserVehicle, setRepriseChooserVehicle] = useState<Flux | null>(null);
  const [pendingAchatVehicle, setPendingAchatVehicle] = useState<Flux | null>(null);
  const [pendingDevisVehicle, setPendingDevisVehicle] = useState<Flux | null>(null);
  const [demandesDevisMap, setDemandesDevisMap] = useState<Record<string, DemandeDevis>>(getDemandesDevisLocal);
  const [reaffectationsMap, setReaffectationsMap] = useState<Record<string, ReaffectationRecord>>(getReaffectationsLocal);
  const [devisAccordNotifications, setDevisAccordNotifications] = useState<DevisAccordNotification[]>(getDevisAccordNotifications);
  const [nouvelleEntreeNotifications, setNouvelleEntreeNotifications] = useState<NouvelleEntreeNotification[]>(getNouvelleEntreeNotifications);
  const [dismissedEntreeNotifIds, setDismissedEntreeNotifIds] = useState<Set<string>>(new Set());
  const [dismissedReadyNotifIds, setDismissedReadyNotifIds] = useState<Set<number>>(new Set());
  const [facturationNotifications, setFacturationNotifications] = useState<FacturationNotification[]>(getFacturationNotifications);
  const [dismissedFacturationNotifIds, setDismissedFacturationNotifIds] = useState<Set<string>>(new Set());
  const [deliveredAchatNotifications, setDeliveredAchatNotifications] = useState<
    Array<{ vehicle: Flux; demande: DemandeAchat; timestamp: string }>
  >([]);
  const [returnedEssaiNotifications, setReturnedEssaiNotifications] = useState<
    Array<{ vehicle: Flux; equipe: string; timestamp: string }>
  >([]);
  const [receptionNotice, setReceptionNotice] = useState<string | null>(null);

  useEffect(() => {
    void syncDemandesDevisFromSql();
    void syncDevisNotificationsFromSql();
    const handleDevisUpdate = () => {
      setDemandesDevisMap(getDemandesDevisLocal());
    };
    const handleReaffectationUpdate = () => {
      setReaffectationsMap(getReaffectationsLocal());
    };
    const handleDevisAccordUpdate = () => {
      setDevisAccordNotifications(getDevisAccordNotifications());
    };
    const handleNouvelleEntreeNotifUpdate = () => {
      setNouvelleEntreeNotifications(getNouvelleEntreeNotifications());
    };
    const handleFacturationNotifUpdate = () => {
      setFacturationNotifications(getFacturationNotifications());
    };
    window.addEventListener("demandes_devis_updated", handleDevisUpdate);
    window.addEventListener("reaffectations_updated", handleReaffectationUpdate);
    window.addEventListener("devis_accord_updated", handleDevisAccordUpdate);
    window.addEventListener("nouvelle_entree_notification_updated", handleNouvelleEntreeNotifUpdate);
    window.addEventListener("facturation_notifications_updated", handleFacturationNotifUpdate);
    window.addEventListener("storage", handleDevisUpdate);
    window.addEventListener("storage", handleReaffectationUpdate);
    window.addEventListener("storage", handleDevisAccordUpdate);
    window.addEventListener("storage", handleNouvelleEntreeNotifUpdate);
    window.addEventListener("storage", handleFacturationNotifUpdate);
    return () => {
      window.removeEventListener("demandes_devis_updated", handleDevisUpdate);
      window.removeEventListener("reaffectations_updated", handleReaffectationUpdate);
      window.removeEventListener("devis_accord_updated", handleDevisAccordUpdate);
      window.removeEventListener("nouvelle_entree_notification_updated", handleNouvelleEntreeNotifUpdate);
      window.removeEventListener("facturation_notifications_updated", handleFacturationNotifUpdate);
      window.removeEventListener("storage", handleDevisUpdate);
      window.removeEventListener("storage", handleReaffectationUpdate);
      window.removeEventListener("storage", handleDevisAccordUpdate);
      window.removeEventListener("storage", handleNouvelleEntreeNotifUpdate);
      window.removeEventListener("storage", handleFacturationNotifUpdate);
    };
  }, []);

  const activeFacturationPendingNotifications = useMemo(() => {
    // L'administration consulte les archives et ne reçoit jamais d'alertes
    // opérationnelles (facturation comprise).
    if (role === "administration") return [];

    const isRestrictedFacturation =
      role === "facturation" &&
      Boolean(currentUser?.assignedTeam) &&
      (currentUser?.assignedTeam || "").trim().toLowerCase() !== "toutes" &&
      (currentUser?.assignedTeam || "").trim().toLowerCase() !== "all";

    return facturationNotifications.filter((n) => {
      if (dismissedFacturationNotifIds.has(n.id)) return false;
      const v = vehicles.find((item) =>
        (n.vehicleId && item.id === n.vehicleId) ||
        (n.or && (item.no === n.or || item.ordre === n.or)) ||
        (!n.or && !n.vehicleId && n.chassis && item.chassis === n.chassis)
      );
      if (v && isWarrantyVehicle(v)) return false;
      if (v?.modePaiement) return false;

      // Filtrer par équipes assignées pour l'utilisateur Facturation
      if (isRestrictedFacturation) {
        const itemTeam = n.equipe || v?.equipe || "";
        if (!itemTeam || !isVehicleMatchingTeam(itemTeam, currentUser?.assignedTeam || "")) {
          return false;
        }
      }

      return true;
    });
  }, [facturationNotifications, vehicles, dismissedFacturationNotifIds, role, currentUser?.assignedTeam]);

  const facturationPendingCount = useMemo(() => {
    return USER_NOTIFICATIONS_ENABLED ? activeFacturationPendingNotifications.length : 0;
  }, [activeFacturationPendingNotifications]);

  const facturationAFacturerCount = useMemo(() => {
    const isRestrictedFacturation =
      role === "facturation" &&
      Boolean(currentUser?.assignedTeam) &&
      (currentUser?.assignedTeam || "").trim().toLowerCase() !== "toutes" &&
      (currentUser?.assignedTeam || "").trim().toLowerCase() !== "all";

    const fromVehicles = vehicles.filter((v) => {
      if (isWarrantyVehicle(v)) return false;
      if (isRestrictedFacturation && (!v.equipe || !isVehicleMatchingTeam(v.equipe, currentUser?.assignedTeam || ""))) {
        return false;
      }
      return (
        (v.modePaiement === "Att Facture" ||
         v.modePaiement === "Édition fin de travaux" ||
         (v as any).statutFacturation === "edition_fin_travaux") &&
        v.statutFacturationFinale !== "facture"
      );
    }).length;

    const fromNotifs = facturationNotifications.filter((n) => {
      if (isRestrictedFacturation) {
        const v = vehicles.find((item) =>
          (n.vehicleId && item.id === n.vehicleId) ||
          (n.or && (item.no === n.or || item.ordre === n.or)) ||
          (!n.or && !n.vehicleId && n.chassis && item.chassis === n.chassis)
        );
        if (v && isWarrantyVehicle(v)) return false;
        const itemTeam = n.equipe || v?.equipe || "";
        if (!itemTeam || !isVehicleMatchingTeam(itemTeam, currentUser?.assignedTeam || "")) {
          return false;
        }
      }
      return n.statutPaiement === "edition_fin_travaux" && n.statutFacturationFinale !== "facture";
    }).length;

    return Math.max(fromVehicles, fromNotifs);
  }, [vehicles, facturationNotifications, role, currentUser?.assignedTeam]);

  // Une livraison est persistée avec la demande : l'équipe qui l'a créée reçoit
  // donc encore la notification après une actualisation ou une nouvelle connexion.
  useEffect(() => {
    const delivered = Object.values(getDemandesAchatLocal())
      .filter((demande) => demande.statutAchat === "Livré" && !demande.dateAcceptationEquipe)
      .map((demande) => {
        const vehicle = vehicles.find((item) =>
          (demande.vehicleId && String(item.id) === String(demande.vehicleId)) ||
          (demande.or && [item.no, item.ordre].filter(Boolean).some((key) => key === demande.or)) ||
          (!demande.or && !demande.vehicleId && demande.chassis && item.chassis === demande.chassis)
        );
        return vehicle && demande.dateLivraison
          ? { vehicle, demande, timestamp: demande.dateLivraison.split(" ").slice(-1)[0] || demande.dateLivraison }
          : null;
      })
      .filter((item): item is { vehicle: Flux; demande: DemandeAchat; timestamp: string } => Boolean(item));

    setDeliveredAchatNotifications((previous) => {
      const previousKeys = new Set(previous.map((item) => String(item.vehicle.id)));
      const missing = delivered.filter((item) => !previousKeys.has(String(item.vehicle.id)));
      return missing.length > 0 ? [...previous, ...missing] : previous;
    });
  }, [vehicles]);

  const getReaffectationForVehicle = useCallback(
    (v: Flux): ReaffectationRecord | undefined => {
      return (
        reaffectationsMap[String(v.id)] ||
        (v.no && reaffectationsMap[v.no.trim()]) ||
        (v.chassis && reaffectationsMap[v.chassis.trim()])
      );
    },
    [reaffectationsMap]
  );
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [isOnlyTechChange, setIsOnlyTechChange] = useState(false);

  useEffect(() => {
    fetchEquipeSheetData()
      .then((data) => setEquipeData(data))
      .catch((err) => console.warn("Erreur chargement EQUIPE:", err));
  }, []);

  // Écouter les modifications des équipes en temps réel
  useEffect(() => {
    const handleEquipesUpdated = () => {
      fetchEquipeSheetData()
        .then((data) => setEquipeData(data))
        .catch(() => {});
    };
    window.addEventListener("flux_equipes_updated", handleEquipesUpdated);
    window.addEventListener("storage", handleEquipesUpdated);
    return () => {
      window.removeEventListener("flux_equipes_updated", handleEquipesUpdated);
      window.removeEventListener("storage", handleEquipesUpdated);
    };
  }, []);

  const [selectedChefEquipeName, setSelectedChefEquipeName] = useState<string>(() => {
    if (currentUser?.name && currentUser.name !== "Chef d'Équipe Atelier") {
      return currentUser.name;
    }
    return "WAJIH TOUIL";
  });

  useEffect(() => {
    if (currentUser?.name && currentUser.name !== "Chef d'Équipe Atelier") {
      setSelectedChefEquipeName(currentUser.name);
    }
  }, [currentUser?.name]);

  const activeChefEquipeTeam = useMemo(() => {
    if (currentUser?.assignedTeam && currentUser.assignedTeam.trim()) {
      return currentUser.assignedTeam.trim();
    }
    const nameToMatch = selectedChefEquipeName || currentUser?.name || "WAJIH TOUIL";
    const custom = getCustomEquipeMembers();
    if (custom && custom.length > 0) {
      const map = new Map<string, string>();
      custom.forEach((m) => map.set(normalizePersonName(m.name), m.team));
      return getTeamForChefEquipe(nameToMatch, map);
    }
    return getTeamForChefEquipe(nameToMatch, equipeData?.teamByMemberName);
  }, [currentUser, selectedChefEquipeName, equipeData]);

  const chefAssignedTeams = useMemo(() => {
    if (!activeChefEquipeTeam) return [];
    return activeChefEquipeTeam.split(",").map((t) => t.trim()).filter(Boolean);
  }, [activeChefEquipeTeam]);

  const [chefSubTeamFilter, setChefSubTeamFilter] = useState<string>("all");

  const effectiveChefFilterTeam = useMemo(() => {
    if (chefSubTeamFilter !== "all" && chefAssignedTeams.includes(chefSubTeamFilter)) {
      return chefSubTeamFilter;
    }
    return activeChefEquipeTeam;
  }, [chefSubTeamFilter, chefAssignedTeams, activeChefEquipeTeam]);

  const resolvedEquipeMembers = useMemo(() => {
    const custom = getCustomEquipeMembers();
    if (custom && custom.length > 0) return custom;
    if (equipeData?.members && equipeData.members.length > 0) return equipeData.members;
    return DEFAULT_EQUIPE_MAPPINGS;
  }, [equipeData?.members]);

  // Helper pour extraire l'équipe d'origine d'un véhicule transféré
  const getOriginTeam = useCallback((v: Flux): string => {
    if (v.bloc === 3) {
      return (v.equipe2 && v.equipe2 !== "-" ? v.equipe2 : v.equipe1) || "Équipe précédente";
    }
    return (v.equipe1 && v.equipe1 !== "-" ? v.equipe1 : "") || "Équipe précédente";
  }, []);

  // Gestion des transferts entrants pour le Chef d'Équipe
  const [deferredTransferIds, setDeferredTransferIds] = useState<Set<number>>(new Set());
  const [isTransferAcceptanceModal, setIsTransferAcceptanceModal] = useState<boolean>(false);
  const [enCoursTransferOnly, setEnCoursTransferOnly] = useState<boolean>(false);
  const prevIncomingIdsRef = useRef<Set<number>>(new Set());

  // Détection des véhicules transférés à destination de l'équipe du chef actuel (non encore affectés à un technicien)
  const incomingTransfers = useMemo(() => {
    if (role !== "chef_equipe" || !activeChefEquipeTeam) return [];
    return vehicles.filter((v) => {
      const isMyTeam = isVehicleMatchingTeam(v.equipe || "", activeChefEquipeTeam);
      const isTransferred =
        Boolean(v.bloc && v.bloc > 1) ||
        Boolean(v.avancement1 && v.avancement1.toLowerCase().startsWith("vr")) ||
        Boolean(v.avancement2 && v.avancement2.toLowerCase().startsWith("vr")) ||
        Boolean(v.equipe1 && v.equipe1 !== "-" && !isVehicleMatchingTeam(v.equipe1, activeChefEquipeTeam));
      const isTechUnassigned = !v.technicien || v.technicien === "-" || v.technicien.trim() === "";
      return isMyTeam && isTransferred && isTechUnassigned;
    });
  }, [vehicles, role, activeChefEquipeTeam]);

  // Tous les véhicules transférés reçus par mon équipe (en attente OU déjà acceptés et en cours)
  const allTransferredToMyTeam = useMemo(() => {
    if (role !== "chef_equipe" || !activeChefEquipeTeam) return [];
    return vehicles.filter((v) => {
      const isMyTeam = isVehicleMatchingTeam(v.equipe || "", activeChefEquipeTeam);
      const isTransferred =
        Boolean(v.bloc && v.bloc > 1) ||
        Boolean(v.avancement1 && v.avancement1.toLowerCase().startsWith("vr")) ||
        Boolean(v.avancement2 && v.avancement2.toLowerCase().startsWith("vr")) ||
        Boolean(v.equipe1 && v.equipe1 !== "-" && !isVehicleMatchingTeam(v.equipe1, activeChefEquipeTeam));
      return isMyTeam && isTransferred;
    });
  }, [vehicles, role, activeChefEquipeTeam]);

  // Transferts non encore mis en attente pour la popup volante
  const unhandledTransfers = useMemo(() => {
    return incomingTransfers.filter((v) => !deferredTransferIds.has(v.id));
  }, [incomingTransfers, deferredTransferIds]);

  // Alerte sonore discrète lors de l'arrivée d'un nouveau transfert
  useEffect(() => {
    if (USER_NOTIFICATIONS_ENABLED && unhandledTransfers.length > 0) {
      const newIds = unhandledTransfers.map((v) => v.id);
      const hasBrandNew = newIds.some((id) => !prevIncomingIdsRef.current.has(id));
      if (hasBrandNew) {
        try {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.36);
          }
        } catch {
          // AudioContext indisponible ou bloqué par le navigateur
        }
      }
    }
    prevIncomingIdsRef.current = new Set(incomingTransfers.map((v) => v.id));
  }, [incomingTransfers, unhandledTransfers]);

  // Actions de transfert
  const handleAcceptTransfer = useCallback((vehicle: Flux) => {
    setPendingEnCoursVehicle(vehicle);
    setIsOnlyTechChange(true);
    setIsTransferAcceptanceModal(true);
    setIsTechModalOpen(true);
  }, []);

  const handleDeferTransfer = useCallback((vehicleId: number) => {
    setDeferredTransferIds((prev) => new Set([...prev, vehicleId]));
  }, []);

  const loadVehicles = useCallback(async (silent = false) => {
    if (!silent) {
      setDatabaseStatus("loading");
    }
    setDraftEmplacements({});
    setWriteError("");
    setWriteNotice("");

    try {
      void syncDemandesDevisFromSql();
      void syncDevisNotificationsFromSql();
      const [rows, entrees] = await Promise.all([
        fetchDatabaseFluxData(),
        fetchSuiviEntreesData().catch(() => []),
      ]);
      // Le plan reprend aussi les emplacements saisis dans le suivi des entrées.
      // Une ligne du flux reste prioritaire pour l'état, le technicien et les
      // autres données de travail ; l'emplacement du suivi complète les lignes
      // historiques qui ne sont pas encore présentes dans le tableau Flux.
      const rowsByOr = new Map<string, Flux>();
      const rowsByChassis = new Map<string, Flux>();
      rows.forEach((row) => {
        const orKey = String(row.ordre || row.no || (row as any).numeroOR || "").trim().toUpperCase();
        if (orKey && orKey !== "-") rowsByOr.set(orKey, row);
        const chKey = String(row.chassis || (row as any).vin || "").trim().toUpperCase();
        if (chKey && chKey !== "-") rowsByChassis.set(chKey, row);
      });
      const withReceptionLocations = [...rows];
      entrees.forEach((entree) => {
        const emplacement = normalizeSheetEmplacement(entree.emplacement || "");
        const entreeOr = String(entree.noOr || (entree as any).no || "").trim().toUpperCase();
        const entreeChassis = String(entree.chassis || (entree as any).vin || "").trim().toUpperCase();
        // PRIORITÉ STRICTE : Si un N° OR est renseigné, correspondance UNIQUEMENT par N° OR
        // Le châssis ne sert de fallback QUE si l'entrée n'a aucun N° OR.
        const existing = (entreeOr && entreeOr !== "-")
          ? rowsByOr.get(entreeOr)
          : (entreeChassis && entreeChassis !== "-")
            ? rowsByChassis.get(entreeChassis)
            : undefined;

        if (existing) {
          if (!isSheetEmplacementOutsideMap(emplacement)) {
            existing.emplacement = emplacement;
          }
          // L'état actif du flux (interventions atelier en cours) EST STRICTEMENT PRIORITAIRE :
          // Le suivi d'entrée ne doit JAMAIS réinitialiser un travail en cours ou assigné en "Attente Réparation" !
          const isExistingActiveInWorkshop =
            existing.etatIntervention === "En cours" ||
            existing.statut === "En cours" ||
            String(existing.avancement || "").toLowerCase().startsWith("en cours") ||
            String(existing.avancement || "").toLowerCase().includes("accord") ||
            String(existing.avancement || "").toLowerCase().includes("devis") ||
            (existing.technicien && existing.technicien !== "-" && existing.technicien !== "");

          if (entree.equipe && entree.equipe !== "-") {
            const teamChanged = existing.equipe && existing.equipe !== "-" && existing.equipe.trim().toLowerCase() !== entree.equipe.trim().toLowerCase();
            if (!isExistingActiveInWorkshop || !existing.equipe || existing.equipe === "-") {
              existing.equipe = entree.equipe;
              existing.atelier = entree.equipe;
              existing.equipe1 = entree.equipe;
              if (teamChanged && !isExistingActiveInWorkshop) {
                existing.technicien = "-";
                existing.nomTechnicien = "-";
                existing.avancement = "Attente Réparation";
                existing.statutAcceptation = "en_attente";
              }
            }
          }
          if (entree.etat) {
            const isEntreeLivre = String(entree.etat).toLowerCase().includes("livr");
            if (isEntreeLivre) {
              existing.statut = "Livré";
              existing.etatIntervention = "Livré";
              existing.avancement = "Livré";
            } else if (!isExistingActiveInWorkshop) {
              existing.statut = entree.etat as WorkshopStatus;
              existing.etatIntervention = entree.etat as WorkshopStatus;
              if (isAttenteReparation(entree.etat)) {
                if (!existing.avancement || existing.avancement === "-" || existing.avancement === "NA") {
                  existing.avancement = "Attente Réparation";
                }
                if (!existing.technicien || existing.technicien === "") {
                  existing.technicien = "-";
                  existing.nomTechnicien = "-";
                }
              }
            }
          }
          if (entree.nomClient && entree.nomClient !== "-" && !entree.nomClient.toLowerCase().includes("non renseign")) {
            existing.client = entree.nomClient;
          }
          if (entree.immatriculation && entree.immatriculation !== "-") {
            existing.immatriculation = entree.immatriculation;
            existing.serie = entree.immatriculation;
          }
          if (entree.marque && entree.marque !== "-") existing.marque = entree.marque;
          if (entree.modele && entree.modele !== "-") {
            existing.modele = entree.modele;
            existing.modelePowerBI = entree.modele;
          }
          if (entree.categorie && entree.categorie !== "-") existing.categorie = entree.categorie;
          return;
        }
        withReceptionLocations.push({
          id: Number(entree.id) || Date.now(),
          ordre: entree.noOr || "-",
          no: entree.noOr || "-",
          chassis: entree.chassis || "-",
          immatriculation: entree.immatriculation || "-",
          marque: entree.marque || "-",
          modele: entree.modele || "-",
          modelePowerBI: entree.modele || "-",
          atelier: entree.categorie || "-",
          operation: "Entrée atelier",
          statut: (entree.etat || "Attente Réparation") as WorkshopStatus,
          etatIntervention: (entree.etat || "Attente Réparation") as WorkshopStatus,
          montant: 0,
          temps: 0,
          nbIntervention: 0,
          client: entree.nomClient || "Client non spécifié",
          categorie: entree.categorie || "-",
          date: entree.dateEntreeHeure || "",
          dateEntree: entree.dateEntreeHeure || "",
          equipe: entree.equipe || "-",
          technicien: entree.technicien || "-",
          nomTechnicien: entree.nomTechnicien || "-",
          avancement: entree.avancement || "Attente Réparation",
          dateDebutRep: entree.dateDebutRep || "",
          dateFinRep: entree.dateFinRep || "",
          emplacement,
          serie: entree.immatriculation || "-",
          cs: entree.cs || "-",
        });
      });
      const mergedRows = mergeRecentAddedVehicles(withReceptionLocations);
      setVehicles(mergedRows);
      setDatabaseStatus("ready");
      setDatabaseError("");
    } catch (error) {
      if (!silent) {
        setVehicles(mergeRecentAddedVehicles(fluxData));
        setDatabaseStatus("fallback");
        setDatabaseError(
          error instanceof Error
            ? error.message
            : "Impossible de lire PostgreSQL."
        );
      }
    } finally {
      setLastRefresh(formatRefreshDate());
    }
  }, []);

  useEffect(() => {
    void loadVehicles(false);

    // Auto-synchronisation temps réel toutes les 3 secondes
    const interval = setInterval(() => {
      void loadVehicles(true);
    }, 3000);

    const handleRefreshRequested = () => {
      void loadVehicles(true);
    };
    window.addEventListener("flux_refresh_requested", handleRefreshRequested);

    const handleNewVehicleAdded = (e: Event) => {
      const customEvent = e as CustomEvent<Flux>;
      if (customEvent.detail) {
        const newV = customEvent.detail;
        setVehicles((prev) => {
          if (prev.some((v) => v.no === newV.no)) return prev;
          return [newV, ...prev];
        });
        setSearch("");
        if (role !== "chef_equipe") {
          setActiveFilter("Tous");
        }
        setDateFilter(ALL_DATES);
      }
    };
    window.addEventListener("flux_new_vehicle_added", handleNewVehicleAdded);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "flux_pending_new_chargement_entries") {
        void loadVehicles(true);
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("flux_refresh_requested", handleRefreshRequested);
      window.removeEventListener("flux_new_vehicle_added", handleNewVehicleAdded);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadVehicles]);

  const [isInstantSyncing, setIsInstantSyncing] = useState(false);

  const handleInstantSync = useCallback(async () => {
    setIsInstantSyncing(true);
    setWriteError("");
    setWriteNotice("");

    try {
      if (role === "administration" || role === "chef_atelier") {
        setActiveFilter("Tous");
        setDateFilter(ALL_DATES);
        setSelectedZone(null);
        setSelectedVehicleId(null);
        setIsDetailPinned(false);
      }
      const res = await synchroniserTableauxDeChargement();
      setVehicles(res.rows);
      setDatabaseStatus("ready");
      setDatabaseError("");
      setWriteNotice(
        `Tableaux de chargement actualisé à l'instant : ${res.count} véhicules chargés en direct.`
      );
      setTimeout(() => setWriteNotice(""), 5000);
    } catch (error) {
      console.warn("Info synchronisation directe:", error);
      await loadVehicles(false);
      setWriteNotice("Tableaux de chargement actualisé à l'instant.");
      setTimeout(() => setWriteNotice(""), 4000);
    } finally {
      setIsInstantSyncing(false);
      setLastRefresh(formatRefreshDate());
    }
  }, [role, loadVehicles]);

  const saveVehicleEmplacement = useCallback(
    async (row: Flux, value: string) => {
      if (!permissions.canEditEmplacement) {
        setWriteError("Votre profil ne vous permet pas de modifier les emplacements atelier.");
        return;
      }

      const nextEmplacement = normalizeSheetEmplacement(value);

      if (!nextEmplacement || nextEmplacement === row.emplacement) {
        setDraftEmplacements((current) => removeDraft(current, row.id));
        return;
      }

      const locationCanBeOccupied = nextEmplacement !== "NA" &&
        nextEmplacement !== AUTO_DELIVERED_EMPLACEMENT &&
        nextEmplacement !== FULL_PARKING_EMPLACEMENT;
      const occupiedBy = locationCanBeOccupied
        ? vehicles.find((vehicle) => {
            if (vehicle.id === row.id) return false;
            if (normalizeEmplacementCode(vehicle.emplacement || "") !== normalizeEmplacementCode(nextEmplacement)) return false;
            const status = `${vehicle.etatIntervention || ""} ${vehicle.avancement || ""}`.toLowerCase();
            return !status.includes("livr");
          })
        : undefined;
      if (occupiedBy) {
        setWriteError(`L'emplacement ${nextEmplacement} est déjà occupé par le véhicule ${occupiedBy.no || occupiedBy.ordre || occupiedBy.chassis}.`);
        return;
      }

      const previousEmplacement = row.emplacement;

      setWriteNotice("");
      setWriteError("");
      setSavingVehicleId(row.id);
      setVehicles((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, emplacement: nextEmplacement }
            : item
        )
      );
      setSelectedVehicleId(row.id);
      setSelectedZone(nextEmplacement);

      if (!canWriteToDatabase) {
        setSavingVehicleId(null);
        setDraftEmplacements((current) => removeDraft(current, row.id));
        setWriteError(
          "L'enregistrement de l'emplacement a échoué. Vérifiez que l'API PostgreSQL est disponible puis réessayez."
        );
        return;
      }

      try {
        await updateDatabaseEmplacement(row, nextEmplacement);
        setDraftEmplacements((current) => removeDraft(current, row.id));
        setLastRefresh(formatRefreshDate());
        setDatabaseStatus("ready");
        setDatabaseError("");
        recordVehicleModification(
          row,
          "Emplacement modifié",
          `${previousEmplacement || "-"} → ${nextEmplacement}`,
        );
        setWriteNotice(
          `Emplacement ${row.serie || row.no} mis à jour: ${previousEmplacement} -> ${nextEmplacement}.`
        );
      } catch (error) {
        setVehicles((current) =>
          current.map((item) =>
            item.id === row.id
              ? { ...item, emplacement: previousEmplacement }
              : item
          )
        );
        setSelectedVehicleId(row.id);
        setSelectedZone(previousEmplacement);
        setWriteError(
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer l'emplacement dans PostgreSQL."
        );
      } finally {
        setSavingVehicleId((current) =>
          current === row.id ? null : current
        );
      }
    },
    [canWriteToDatabase, permissions.canEditEmplacement, vehicles]
  );

  const saveVehicleEtat = useCallback(
    async (row: Flux, nextEtat: WorkshopStatus) => {
      if (!permissions.canEditEtat && !(role === "reception" && nextEtat === "Livré")) {
        setWriteError("Votre profil ne vous permet pas de modifier l'état des véhicules.");
        return;
      }

      if (nextEtat === row.etatIntervention) return;

      const previousEtat = row.etatIntervention;
      const previousEmplacement = row.emplacement;
      const previousEquipe = row.equipe;
      const isDelivered = formatStatusLabel(nextEtat) === "Livré";

      // Si passage à "En cours", on affecte l'équipe appropriée du Chef d'Équipe actif
      // Si passage à "En cours", on conserve l'équipe réelle du véhicule ou de la sous-équipe active
      const isGoingToEnCours = nextEtat === "En cours";
      let assignedTeam = row.equipe;
      if (isGoingToEnCours) {
        if (assignedTeam && !assignedTeam.includes(",") && assignedTeam.trim() !== "-") {
          // Conserver l'équipe réelle déjà affectée au véhicule
        } else if (chefSubTeamFilter !== "all" && chefAssignedTeams.includes(chefSubTeamFilter)) {
          assignedTeam = chefSubTeamFilter;
        } else if (chefAssignedTeams.length > 0) {
          assignedTeam = chefAssignedTeams[0];
        } else {
          assignedTeam = "Daily1";
        }
      }

      // Calcul automatique de l'emplacement selon l'état et l'équipe active
      const computedVehicle: Partial<Flux> = {
        ...row,
        etatIntervention: nextEtat,
        statut: nextEtat,
        equipe: (isGoingToEnCours && assignedTeam ? assignedTeam : row.equipe) || "Daily1",
      };
      const nextEmplacement = isDelivered
        ? DELIVERED_EMPLACEMENT
        : calculerEmplacementAutomatique(computedVehicle, vehicles, row.id);

      setWriteNotice("");
      setWriteError("");
      setSavingVehicleId(row.id);
      setVehicles((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
              ...item,
              etatIntervention: nextEtat,
              statut: nextEtat,
              emplacement: nextEmplacement,
              ...(isGoingToEnCours && assignedTeam ? { equipe: assignedTeam } : {}),
            }
            : item
        )
      );
      setSelectedVehicleId(row.id);
      setSelectedZone(isDelivered ? null : nextEmplacement);

      if (!canWriteToDatabase) {
        setSavingVehicleId(null);
        setWriteError(
          "La mise à jour n'a pas été enregistrée dans PostgreSQL. Vérifiez la connexion à la base puis réessayez."
        );
        return;
      }

      try {
        await updateDatabaseEtat(
          row,
          nextEtat,
          isGoingToEnCours ? assignedTeam : undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          nextEmplacement
        );
        setLastRefresh(formatRefreshDate());
        setDatabaseStatus("ready");
        setDatabaseError("");
        recordVehicleModification(
          row,
          "État modifié",
          `${formatStatusLabel(previousEtat)} → ${formatStatusLabel(nextEtat)}${nextEmplacement !== previousEmplacement ? ` • Emplacement : ${previousEmplacement || "-"} → ${nextEmplacement}` : ""}`,
        );
        if (!isWarrantyVehicle(row) && ((nextEtat as string) === "Attente Client" || (nextEtat as string) === "Prêt / Fini")) {
          notifierFinTravauxTechnicien(
            row,
            currentUser?.name || selectedChefEquipeName || "Chef d'équipe"
          );
        }
        setWriteNotice(
          isDelivered
            ? `Etat ${row.serie || row.no} mis à jour: ${formatStatusLabel(previousEtat)} -> Livré. Emplacement: ${DELIVERED_EMPLACEMENT}.`
            : isGoingToEnCours
              ? `Véhicule ${row.serie || row.no} passé en cours (${nextEmplacement}). Équipe affectée : ${assignedTeam}.`
              : `Etat ${row.serie || row.no} mis à jour: ${formatStatusLabel(previousEtat)} -> ${formatStatusLabel(nextEtat)} (${nextEmplacement}).`
        );
      } catch (error) {
        setVehicles((current) =>
          current.map((item) =>
            item.id === row.id
              ? {
                ...item,
                etatIntervention: previousEtat,
                statut: previousEtat,
                emplacement: previousEmplacement,
                equipe: previousEquipe,
              }
              : item
          )
        );
        setSelectedZone(previousEmplacement);
        setWriteError(
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer l'état dans PostgreSQL."
        );
      } finally {
        setSavingVehicleId((current) =>
          current === row.id ? null : current
        );
      }
    },
    [canWriteToDatabase, permissions.canEditEtat, activeChefEquipeTeam, vehicles]
  );

  const saveVehicleEtatWithTech = useCallback(
    async (payload: {
      vehicle: Flux;
      technicien: string;
      nomTechnicien: string;
      poste: string;
      equipe: string;
    }) => {
      const { vehicle: row, technicien, nomTechnicien, poste, equipe: assignedTeam } = payload;
      const nextEtat: WorkshopStatus = "En cours";
      const previousEtat = row.etatIntervention;
      const previousEmplacement = row.emplacement;
      const previousEquipe = row.equipe;
      const previousTech = row.technicien;
      const previousNomTech = row.nomTechnicien;

      // Avancement initialisé à "En cours - 10%" dès le début de prise en charge
      const nextAvancement =
        (!row.avancement || row.avancement === "-" || row.avancement === "NA" || row.avancement.toLowerCase().includes("attente") || row.avancement === "Accepter accord" || row.avancement.toLowerCase().includes("accord"))
          ? "En cours - 10%"
          : row.avancement;

      const { dateTime: currentDateTime, time: currentTime } = getWorkshopNow();
      const dateDebut = row.dateDebutRep || row.dateDebutTravail || currentDateTime;
      const heureDebut = row.heureDebutTravail || currentTime;

      // Calcul automatique de l'emplacement atelier selon l'équipe responsable
      const computedVehicle: Partial<Flux> = {
        ...row,
        etatIntervention: nextEtat,
        statut: nextEtat,
        avancement: nextAvancement,
        equipe: assignedTeam || row.equipe,
        technicien: technicien !== "-" ? technicien : row.technicien,
        nomTechnicien: nomTechnicien !== "-" ? nomTechnicien : row.nomTechnicien,
        dateDebutRep: dateDebut,
        dateDebutTravail: dateDebut,
        heureDebutTravail: heureDebut,
        statutAcceptation: "accepte",
        dateAcceptation: row.dateAcceptation || currentDateTime,
      };
      const nextEmplacement = calculerEmplacementAutomatique(computedVehicle, vehicles, row.id);

      setWriteNotice("");
      setWriteError("");
      setSavingVehicleId(row.id);

      setVehicles((current) => {
        let matched = false;
        const updated = current.map((item) => {
          const isTarget =
            (row.id && (item.id === row.id || String(item.id) === String(row.id))) ||
            (row.no && (item.no === row.no || item.ordre === row.no)) ||
            (row.ordre && (item.no === row.ordre || item.ordre === row.ordre)) ||
            (!row.no && !row.ordre && row.chassis && item.chassis && item.chassis.trim().toUpperCase() === row.chassis.trim().toUpperCase());

          if (!isTarget) return item;
          matched = true;

          return {
            ...item,
            etatIntervention: nextEtat,
            statut: nextEtat,
            avancement: nextAvancement,
            equipe: assignedTeam,
            emplacement: nextEmplacement,
            technicien: technicien && technicien !== "-" ? technicien : item.technicien,
            nomTechnicien: nomTechnicien && nomTechnicien !== "-" ? nomTechnicien : item.nomTechnicien,
            dateDebutRep: item.dateDebutRep || dateDebut,
            dateDebutTravail: item.dateDebutTravail || dateDebut,
            heureDebutTravail: item.heureDebutTravail || heureDebut,
            statutAcceptation: "accepte" as const,
            dateAcceptation: item.dateAcceptation || currentDateTime,
          };
        });

        if (matched) return updated;
        return [
          {
            ...row,
            etatIntervention: nextEtat,
            statut: nextEtat,
            avancement: nextAvancement,
            equipe: assignedTeam,
            emplacement: nextEmplacement,
            technicien: technicien && technicien !== "-" ? technicien : row.technicien,
            nomTechnicien: nomTechnicien && nomTechnicien !== "-" ? nomTechnicien : row.nomTechnicien,
            dateDebutRep: row.dateDebutRep || dateDebut,
            dateDebutTravail: row.dateDebutTravail || dateDebut,
            heureDebutTravail: row.heureDebutTravail || heureDebut,
            statutAcceptation: "accepte" as const,
            dateAcceptation: row.dateAcceptation || currentDateTime,
          },
          ...current,
        ];
      });
      setSelectedVehicleId(row.id);
      setSelectedZone(nextEmplacement);

      // Si une notification d'entrée était active pour ce véhicule, la retirer
      const matchingNotif = nouvelleEntreeNotifications.find(
        (n) => (n.noOr && (n.noOr === row.no || n.noOr === row.ordre)) || (n.chassis && n.chassis === row.chassis)
      );
      if (matchingNotif) {
        removeNouvelleEntreeNotification(matchingNotif.id);
      }

      if (!canWriteToDatabase) {
        setSavingVehicleId(null);
        setWriteNotice(
          `Véhicule ${row.serie || row.no} passé en cours (${nextEmplacement} - ${nextAvancement} - Début : ${dateDebut}). Équipe : ${assignedTeam}${technicien && technicien !== "-" ? ` • Technicien : [${technicien}] ${nomTechnicien}` : ""
          }.`
        );
        return;
      }

      try {
        await updateDatabaseEtat(
          row,
          nextEtat,
          assignedTeam,
          technicien !== "-" ? technicien : undefined,
          nomTechnicien !== "-" ? nomTechnicien : undefined,
          poste !== "-" ? poste : undefined,
          row.bloc,
          nextEmplacement,
          nextAvancement,
          dateDebut
        );
        setLastRefresh(formatRefreshDate());
        setDatabaseStatus("ready");
        setDatabaseError("");
        if (nextAvancement !== row.avancement) {
          recordAvancementStatusChange(
            row,
            nextAvancement,
            currentDateTime,
            currentUser?.name || selectedChefEquipeName || "Chef d'équipe",
          );
        }
        recordVehicleModification(
          row,
          "Prise en charge / affectation",
          `Équipe : ${assignedTeam || "-"} • Technicien : ${technicien || "-"} ${nomTechnicien || ""}`.trim(),
        );
        setWriteNotice(
          `Véhicule ${row.serie || row.no} passé en cours (${nextEmplacement} - ${nextAvancement} - Début : ${dateDebut}). Équipe : ${assignedTeam}${technicien && technicien !== "-" ? ` • Technicien : [${technicien}] ${nomTechnicien}` : ""
          }.`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isValidationRuleError =
          errorMsg.toLowerCase().includes("validation") ||
          errorMsg.toLowerCase().includes("cellule") ||
          errorMsg.toLowerCase().includes("règles de validation");

        if (isValidationRuleError) {
          setWriteNotice(
            `Véhicule ${row.serie || row.no} pris en charge : Équipe ${assignedTeam}${technicien && technicien !== "-" ? ` • Technicien : [${technicien}] ${nomTechnicien}` : ""
            }. PostgreSQL a refusé l'enregistrement. Vérifiez les données puis actualisez.`
          );
        } else {
          setVehicles((current) =>
            current.map((item) =>
              item.id === row.id
                ? {
                  ...item,
                  etatIntervention: previousEtat,
                  statut: previousEtat,
                  emplacement: previousEmplacement,
                  equipe: previousEquipe,
                  technicien: previousTech,
                  nomTechnicien: previousNomTech,
                }
                : item
            )
          );
          setWriteError(
            error instanceof Error
              ? error.message
              : "Impossible d'enregistrer l'intervention dans PostgreSQL."
          );
        }
      } finally {
        setSavingVehicleId((current) => (current === row.id ? null : current));
      }
    },
    [canWriteToDatabase, vehicles]
  );

  const saveVehicleTechnicienOnly = useCallback(
    async (payload: {
      vehicle: Flux;
      technicien: string;
      nomTechnicien: string;
      poste: string;
      equipe: string;
    }) => {
      const { vehicle: row, technicien, nomTechnicien, poste, equipe: assignedTeam } = payload;
      const previousTech = row.technicien;
      const previousNomTech = row.nomTechnicien;
      const previousEquipe = row.equipe;
      const previousEtat = row.etatIntervention;
      const previousStatut = row.statut;
      const previousAvancement = row.avancement;

      setWriteNotice("");
      setWriteError("");
      setSavingVehicleId(row.id);

      const isTransferInit =
        Boolean(row.bloc && row.bloc > 1) ||
        (!row.avancement || row.avancement === "-" || row.avancement.toLowerCase().startsWith("vr"));
      const nextAvancement = isTransferInit
        ? "En cours - 10%"
        : row.avancement && row.avancement !== "-"
          ? row.avancement
          : "En cours - 10%";
      let finalTeam = assignedTeam || row.equipe;
      if (!finalTeam || finalTeam.includes(",")) {
        if (row.equipe && !row.equipe.includes(",") && row.equipe.trim() !== "-") {
          finalTeam = row.equipe.trim();
        } else if (chefSubTeamFilter !== "all" && chefAssignedTeams.includes(chefSubTeamFilter)) {
          finalTeam = chefSubTeamFilter;
        } else {
          finalTeam = chefAssignedTeams[0] || "Daily1";
        }
      }

      const { dateTime: currentDateTime, time: currentTime } = getWorkshopNow();

      const computedVehicle: Partial<Flux> = {
        ...row,
        equipe: finalTeam,
        technicien: technicien && technicien !== "-" ? technicien : row.technicien,
        nomTechnicien: nomTechnicien && nomTechnicien !== "-" ? nomTechnicien : row.nomTechnicien,
        avancement: nextAvancement,
        etatIntervention: "En cours",
        statut: "En cours",
      };
      const nextEmplacement = isTransferInit
        ? calculerEmplacementAutomatique(computedVehicle, vehicles, row.id)
        : row.emplacement;

      setVehicles((current) =>
        current.map((item) => {
          const isTarget =
            (row.id && (item.id === row.id || String(item.id) === String(row.id))) ||
            (row.no && (item.no === row.no || item.ordre === row.no)) ||
            (row.ordre && (item.no === row.ordre || item.ordre === row.ordre)) ||
            (!row.no && !row.ordre && row.chassis && item.chassis && item.chassis.trim().toUpperCase() === row.chassis.trim().toUpperCase());

          if (!isTarget) return item;

          return {
            ...item,
            technicien: technicien && technicien !== "-" ? technicien : item.technicien,
            nomTechnicien: nomTechnicien && nomTechnicien !== "-" ? nomTechnicien : item.nomTechnicien,
            equipe: finalTeam,
            emplacement: nextEmplacement,
            etatIntervention: "En cours",
            statut: "En cours",
            avancement: nextAvancement,
            dateDebutRep: isTransferInit ? currentDateTime : (item.dateDebutRep || currentDateTime),
            dateDebutTravail: isTransferInit ? currentDateTime : (item.dateDebutTravail || currentDateTime),
            heureDebutTravail: isTransferInit ? currentTime : (item.heureDebutTravail || currentTime),
          };
        })
      );

      // L'équipe destinataire vient de prendre le travail : mémoriser immédiatement
      // sa date/heure d'acceptation et la durée exacte restée en attente.
      if (isTransferInit) {
        const currentUserName = currentUser?.name || selectedChefEquipeName || "Chef d'équipe";
        marquerTransfertAccepte(row, currentUserName);
      }

      if (!canWriteToDatabase) {
        setSavingVehicleId(null);
        setWriteNotice(
          `Technicien mis à jour pour ${row.serie || row.no} : [${technicien}] ${nomTechnicien}.`
        );
        return;
      }

      try {
        await updateDatabaseTechnicien(
          row,
          technicien,
          nomTechnicien,
          finalTeam,
          poste,
          row.bloc
        );
        if (isTransferInit) {
          // L'avancement porte déjà l'emplacement choisi. Éviter l'appel
          // séparé « updateEmplacement », qui peut rencontrer une ancienne
          // place occupée avant que le serveur n'attribue une place libre.
          await updateDatabaseAvancement(
            row,
            nextAvancement,
            finalTeam,
            row.bloc,
            undefined,
            {
              dateModification: currentDateTime,
              dateDebutRep: currentDateTime,
              heureDebutTravail: currentTime,
              emplacement: nextEmplacement,
            }
          );
          recordAvancementStatusChange(
            row,
            nextAvancement,
            currentDateTime,
            currentUser?.name || selectedChefEquipeName || "Chef d'équipe",
          );
        }
        setLastRefresh(formatRefreshDate());
        setDatabaseStatus("ready");
        recordVehicleModification(
          row,
          isTransferInit ? "Prise en charge / affectation" : "Technicien modifié",
          `Équipe : ${finalTeam || "-"} • Technicien : ${technicien || "-"} ${nomTechnicien || ""}`.trim(),
          currentDateTime,
        );
        setWriteNotice(
          `Technicien mis à jour pour ${row.serie || row.no} : [${technicien}] ${nomTechnicien}.`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isValidationRuleError =
          errorMsg.toLowerCase().includes("validation") ||
          errorMsg.toLowerCase().includes("cellule") ||
          errorMsg.toLowerCase().includes("règles de validation");

        if (isValidationRuleError) {
          setWriteNotice(
            `Technicien affecté pour ${row.serie || row.no} : [${technicien}] ${nomTechnicien}. PostgreSQL a refusé l'enregistrement. Vérifiez les données puis actualisez.`
          );
        } else {
          setVehicles((current) =>
            current.map((item) =>
              item.id === row.id
                ? {
                  ...item,
                  technicien: previousTech,
                  nomTechnicien: previousNomTech,
                  equipe: previousEquipe,
                  etatIntervention: previousEtat,
                  statut: previousStatut,
                  avancement: previousAvancement,
                }
                : item
            )
          );
          setWriteError(
            error instanceof Error
              ? error.message
              : "Impossible d'enregistrer le technicien dans PostgreSQL."
          );
        }
      } finally {
        setSavingVehicleId((current) => (current === row.id ? null : current));
      }
    },
    [canWriteToDatabase, activeChefEquipeTeam]
  );

  const saveVehicleAvancement = useCallback(
    async (
      row: Flux,
      nextAvancement: string,
      demandeAchat?: DemandeAchat,
      extraParams?: Record<string, string>,
      demandeDevis?: DemandeDevis
    ) => {
      const isDevisTransition = Boolean(extraParams?.etat || demandeDevis);
      if (!permissions.canEditEtat && !permissions.canEditAvancement && !isDevisTransition) {
        setWriteError("Votre profil ne vous permet pas de modifier l'avancement atelier.");
        return;
      }

      if (
        !nextAvancement ||
        nextAvancement === "-" ||
        (nextAvancement === row.avancement && !demandeAchat && !demandeDevis)
      ) {
        return;
      }

      const nowFormatted = getNowFormatted();
      const currentUserName = currentUser?.name || selectedChefEquipeName || "Chef d'équipe";

      // Si le chef d'équipe choisit "attends acheter" sans formulaire de demande, ouvrir le modal
      if (nextAvancement === "attends acheter" && !demandeAchat) {
        setPendingAchatVehicle(row);
        return;
      }

      // Si le chef d'équipe choisit « Lancement devis » ou « Attente accord » sans formulaire, ouvrir le modal.
      if (
        (nextAvancement === "Lancement devis" ||
          nextAvancement === "Attente accord" ||
          nextAvancement === "Lancement attente accord") &&
        !demandeDevis
      ) {
        setPendingDevisVehicle(row);
        return;
      }

      let activeDemandeAchat = demandeAchat;
      // Si "Attente PDR" est choisi sans formulaire, créer la demande PDR horodatée à maintenant
      if (nextAvancement === "Attente PDR" && !activeDemandeAchat) {
        activeDemandeAchat = {
          date: nowFormatted,
          or: row.no || row.ordre || "",
          chassis: row.chassis || "",
          client: row.client || "",
          ref: "PDR",
          designation: "Attente Pièces de Rechange (PDR)",
          qt: 1,
          commentaire: "Attente pièces en magasin",
          equipe: row.equipe || "",
          statutAchat: "Attente",
          createdAtTimestamp: Date.now(),
        };
        saveDemandeAchatLocal(activeDemandeAchat);
      } else if (activeDemandeAchat) {
        activeDemandeAchat.date = activeDemandeAchat.date || nowFormatted;
        saveDemandeAchatLocal(activeDemandeAchat);
      }

      // Si une demande de devis est transmise, l'enregistrer localement avec la date de maintenant
      if (demandeDevis) {
        demandeDevis.date = demandeDevis.date || nowFormatted;
        saveDemandeDevisLocal(demandeDevis);
        setDemandesDevisMap(getDemandesDevisLocal());
      }

      const previousAvancement = row.avancement;
      const previousEtat = row.etatIntervention;
      const previousEmplacement = row.emplacement;

      let effectiveAvancement = nextAvancement;
      if (
        nextAvancement === "Lancement devis" ||
        nextAvancement === "Attente accord" ||
        nextAvancement === "Lancement attente accord"
      ) {
        effectiveAvancement = "Attente accord";
      }

      const isAccordAccepte =
        nextAvancement === "Accepter accord" ||
        nextAvancement === "Accord accepté" ||
        nextAvancement.toLowerCase() === "accepter accord";

      const isDevis =
        !isAccordAccepte && (
          nextAvancement === "Lancement devis" ||
          nextAvancement === "Attente accord" ||
          nextAvancement === "Lancement attente accord" ||
          effectiveAvancement === "Attente accord" ||
          nextAvancement === "ATENDE DEVIS" ||
          nextAvancement.toLowerCase().includes("devis") ||
          nextAvancement.toLowerCase().includes("accord")
        );

      let shouldMarkReprise = false;
      if (nextAvancement === "Technicien réaffecté") {
        const record = marquerVehiculeReaffecte(row, currentUserName);
        effectiveAvancement = "Attente réparation";
        setWriteNotice(
          `🔄 Technicien réaffecté pour ${row.serie || row.no} le ${record.dateReaffectation}. L'avancement devient "Attente réparation" (reste dans Interventions En cours).`
        );
      } else if (
        nextAvancement.startsWith("En cours") ||
        nextAvancement.includes("%")
      ) {
        const existingReaff = getReaffectationForVehicle(row);
        shouldMarkReprise = Boolean(existingReaff && !existingReaff.isRepris);
      }

      // Essai routier : démarrer le contrôle horodaté à maintenant
      if (nextAvancement === "Essai") {
        marquerDebutEssai(row, currentUserName);
      }

      // Terminer : clôturer l'essai si ouvert et enregistrer la date de fin effective de réparation
      if (nextAvancement === "Terminer" || parseAvancementPct(effectiveAvancement) === 100) {
        const techStr = row.technicien && row.technicien !== "-"
          ? ` • Technicien : ${row.technicien} ${row.nomTechnicien || ""}`.trim()
          : (row.nomTechnicien && row.nomTechnicien !== "-" ? ` • Technicien : ${row.nomTechnicien}` : "");
        recordVehicleModification(
          row,
          "Prise en charge / terminer",
          `Équipe : ${row.equipe || "Atelier"}${techStr} • Travaux terminés`.trim(),
          nowFormatted
        );
        marquerFinEssai(row, { dateControle: nowFormatted, resultat: "CONFORME" });
        if (!isWarrantyVehicle(row)) {
          notifierFinTravauxTechnicien(row, currentUserName, nowFormatted);
        }
      }

      // Déduire l'état d'intervention selon la valeur d'avancement
      const nextEtat: WorkshopStatus = effectiveAvancement === "Terminer"
        ? "Attente Client"
        : effectiveAvancement === "Essai"
          ? "Essai"
          : effectiveAvancement === "attends acheter"
            ? "attends acheter"
        : effectiveAvancement === "Attente client"
              ? "Attente Client"
                : effectiveAvancement.startsWith("vr")
                  ? "Attente Réparation"
                  // Une demande de devis suspend l'intervention : le véhicule
                  // retourne au tableau de chargement de son équipe (Attente Réparation).
                  : isDevis
                    ? "Attente Réparation"
                  : nextAvancement === "Technicien réaffecté"
                  ? "Attente Réparation"
                  : effectiveAvancement === "Attente réparation" || effectiveAvancement === "Attente Réparation"
                    ? ((extraParams?.etat as WorkshopStatus) || "Attente Réparation")
                    : effectiveAvancement.startsWith("En cours")
                      ? "En cours"
                      : row.etatIntervention;

      // Emplacement automatique : calculé selon l'avancement, l'état et l'équipe active
      const isVrTransfer = nextAvancement.startsWith("vr");
      const vrTargetTeam = isVrTransfer ? getTeamFromVr(nextAvancement) : "";
      const currentBloc = row.bloc || 1;
      const rawNextBloc = isVrTransfer ? currentBloc + 1 : currentBloc;
      const nextBloc = (Math.min(rawNextBloc, 3) as 1 | 2 | 3);
      const targetEquipe = (extraParams?.equipe || demandeDevis?.equipeOrigine || vrTargetTeam || row.equipe || "").trim() || row.equipe || "";
      const targetTech = isVrTransfer || isDevis
        ? "-"
        : (extraParams?.technicien !== undefined ? extraParams.technicien : (demandeDevis?.technicien || row.technicien));
      const targetNomTech = isVrTransfer || isDevis
        ? "-"
        : (extraParams?.nomTechnicien !== undefined ? extraParams.nomTechnicien : (demandeDevis?.nomTechnicien || row.nomTechnicien));

      const computedVehicle: Partial<Flux> = {
        ...row,
        avancement: effectiveAvancement,
        etatIntervention: nextEtat,
        statut: nextEtat,
        equipe: targetEquipe,
        bloc: nextBloc,
        technicien: targetTech,
        nomTechnicien: targetNomTech,
        ...(isVrTransfer ? { statutAcceptation: "en_attente" as const } : {}),
      };
      // Toute attente (devis inclus) doit recevoir une place P numérotée du
      // plan atelier, jamais le code générique « P ». Le calcul choisit P1 à
      // P76 selon la première place réellement libre.
      const nextEmplacement = calculerEmplacementAutomatique(computedVehicle, vehicles, row.id);

      // Transferts VR : enregistrer le début du transfert vers l'équipe cible horodaté à maintenant
      if (isVrTransfer) {
        const techStr = row.technicien && row.technicien !== "-"
          ? ` • Technicien : ${row.technicien} ${row.nomTechnicien || ""}`.trim()
          : (row.nomTechnicien && row.nomTechnicien !== "-" ? ` • Technicien : ${row.nomTechnicien}` : "");
        recordVehicleModification(
          row,
          "Prise en charge / terminer",
          `Équipe : ${row.equipe || "Atelier"}${techStr} • Fin de prise en charge avant transfert ${nextAvancement}`.trim(),
          nowFormatted
        );
        marquerDebutTransfertVR(row, nextAvancement, targetEquipe, currentUserName);
        saveNouvelleEntreeNotification({
          id: `vr-${row.id}-${nextAvancement}-${Date.now()}`,
          noOr: row.no || row.ordre || "-",
          chassis: row.chassis || "-",
          immatriculation: row.serie || row.immatriculation || "-",
          nomClient: row.client || "Client non renseigné",
          marque: row.marque || "-",
          modele: row.modele || "-",
          equipe: targetEquipe,
          cs: row.cs || "",
          dateEntreeHeure: nowFormatted,
          statutAcceptation: "en_attente",
          createdAt: Date.now(),
        });
      }

      // Si l'avancement cible est En cours, vérifier que le technicien n'est pas déjà occupé sur un autre véhicule
      const isTryingEnCours =
        !isVrTransfer && nextAvancement !== "Technicien réaffecté" && (
          effectiveAvancement.startsWith("En cours") ||
          effectiveAvancement.includes("%") ||
          nextEtat === "En cours"
        );

      if (isTryingEnCours && ((targetTech && targetTech !== "-") || (targetNomTech && targetNomTech !== "-"))) {
        const busyCar = getActiveVehicleForTech(
          targetTech || "",
          targetNomTech || "",
          vehicles,
          row.id,
          row.no,
          reaffectationsMap
        );
        if (busyCar) {
          setWriteError(
            `⛔ Impossible de passer En cours : Le technicien [${targetTech}] ${targetNomTech || ""} est actuellement occupé sur le véhicule OR ${busyCar.no || busyCar.serie || busyCar.id} (${busyCar.marque || ""} ${busyCar.modele || ""}). Il doit obligatoirement terminer ce nouveau travail avant de reprendre ce véhicule !`
          );
          return;
        }
      }

      setWriteNotice("");
      setWriteError("");

      // La reprise et la chronométrie ne sont enregistrées qu'après la validation :
      // un clic refusé car le technicien est occupé ne peut plus libérer le véhicule réaffecté.
      if (shouldMarkReprise) {
        const rec = marquerVehiculeReprise(row, currentUserName);
        setWriteNotice(`✅ Travail repris sur ${row.serie || row.no} le ${rec.dateReprise} !`);
      }
      setSavingVehicleId(row.id);
      setVehicles((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
              ...item,
              avancement: effectiveAvancement,
              etatIntervention: nextEtat,
              statut: nextEtat,
              emplacement: nextEmplacement,
              equipe: targetEquipe,
              bloc: nextBloc,
              ...(isVrTransfer ? { statutAcceptation: "en_attente" as const } : {}),
              technicien: (isVrTransfer || isDevis) ? "-" : (targetTech !== undefined ? targetTech : item.technicien),
              nomTechnicien: (isVrTransfer || isDevis) ? "-" : (targetNomTech !== undefined ? targetNomTech : item.nomTechnicien),
              dateModification: nowFormatted,
              dateAvancement: nowFormatted,
              heureAvancement: nowFormatted.split(" ")[1] || "",
              dateHeureAvancement: nowFormatted,
              dateFinRep: (effectiveAvancement === "Terminer" || isVrTransfer) ? nowFormatted : item.dateFinRep,
              ...(isWarrantyVehicle(row) && effectiveAvancement === "Terminer"
                ? { statutGarantie: String((row as any).statutGarantie || "").trim() || "À traiter garantie" }
                : {}),
              ...(isVrTransfer && currentBloc === 1
                ? {
                    equipe1: row.equipe || "Atelier",
                    avancement1: nextAvancement,
                    dateFin1: nowFormatted,
                    technicien1: row.technicien,
                    nomTechnicien1: row.nomTechnicien,
                  }
                : {}),
              ...(isVrTransfer && currentBloc === 2
                ? {
                    equipe2: row.equipe || "Atelier",
                    avancement2: nextAvancement,
                    dateFin2: nowFormatted,
                    technicien2: row.technicien,
                    nomTechnicien2: row.nomTechnicien,
                  }
                : {}),
            }
            : item
        )
      );

      if (isDevis) {
        setSelectedZone(nextEmplacement);
      }

      // Basculer automatiquement vers la page correspondante selon les permissions
      if (nextAvancement === "Essai" && permissions.canViewEssai) {
        setActiveTab("essai");
      } else if (nextAvancement === "attends acheter" && permissions.canViewAttenteAchat) {
        setActiveTab("attente_achat");
      } else if (isDevis) {
        // Le chef d'équipe et l'atelier retournent au Tableau de chargement
        // Si le rôle est réception, il va sur la page devis.
        if (role === "reception" && permissions.canViewDevis) {
          setActiveTab("devis");
        } else {
          setActiveTab("chargement");
          if (role === "chef_equipe") {
            setActiveFilter("Attente Réparation");
          } else {
            setActiveFilter("Tous");
          }
        }
      } else if (isAccordAccepte) {
        setActiveTab("chargement");
        setActiveFilter("Attente Réparation");
      }

      if (!canWriteToDatabase) {
        setSavingVehicleId(null);
        setWriteError(
          "La modification de l'avancement n'a pas été enregistrée dans PostgreSQL. Vérifiez l'API puis réessayez."
        );
        return;
      }

      const timeStr = nowFormatted.split(" ")[1] || "";
      const extraPayload: Record<string, string> = {
        ...(extraParams || {}),
        etat: nextEtat,
        statut: nextEtat,
        dateModification: nowFormatted,
        dateAvancement: nowFormatted,
        heureAvancement: timeStr,
        dateHeureAvancement: nowFormatted,
      };
      if (nextEmplacement) {
        extraPayload.emplacement = nextEmplacement;
      }
      if (isDevis) {
        extraPayload.dateDevis = nowFormatted;
        extraPayload.technicien = "-";
        extraPayload.nomTechnicien = "-";
        extraPayload.avancement = "Attente accord";
        extraPayload.etat = "Attente Réparation";
        extraPayload.statut = "Attente Réparation";
      }
      if (isAccordAccepte) {
        extraPayload.avancement = "Accepter accord";
        extraPayload.etat = "Attente Réparation";
        extraPayload.statut = "Attente Réparation";
        if (targetTech && targetTech !== "-") {
          extraPayload.technicien = targetTech;
        }
        if (targetNomTech && targetNomTech !== "-") {
          extraPayload.nomTechnicien = targetNomTech;
        }
      }
      if (nextAvancement === "Attente PDR" || nextAvancement === "attends acheter") {
        extraPayload.dateDemande = nowFormatted;
      }
      if (nextAvancement === "Technicien réaffecté") {
        extraPayload.dateReaffectation = nowFormatted;
      }
      if (nextAvancement === "Essai") {
        extraPayload.dateControle = nowFormatted;
        extraPayload.dateDebutEssai = nowFormatted;
      }
      if (nextAvancement === "Terminer") {
        extraPayload.dateFin = nowFormatted;
        extraPayload.dateFinRep = nowFormatted;
        if (isWarrantyVehicle(row)) {
          // À la fin des travaux R10, le dossier quitte les tableaux atelier
          // et reste à traiter exclusivement dans le Tableau Garantie.
          extraPayload.statutGarantie = String((row as any).statutGarantie || "").trim() || "À traiter garantie";
        }
      }
      if (isVrTransfer) {
        extraPayload.dateTransfert = nowFormatted;
        extraPayload.bloc = String(nextBloc);
        extraPayload.equipe = targetEquipe;
        extraPayload.technicien = "-";
        extraPayload.nomTechnicien = "-";
        extraPayload.dateFinRep = nowFormatted;
        extraPayload.dateFin = nowFormatted;
        extraPayload.statutAcceptation = "en_attente";
        if (currentBloc === 1) {
          extraPayload.equipe1 = row.equipe || "Atelier";
          extraPayload.avancement1 = nextAvancement;
          extraPayload.dateFin1 = nowFormatted;
          if (row.technicien && row.technicien !== "-") {
            extraPayload.technicien1 = row.technicien;
          }
          if (row.nomTechnicien && row.nomTechnicien !== "-") {
            extraPayload.nomTechnicien1 = row.nomTechnicien;
          }
        } else if (currentBloc === 2) {
          extraPayload.equipe2 = row.equipe || "Atelier";
          extraPayload.avancement2 = nextAvancement;
          extraPayload.dateFin2 = nowFormatted;
          if (row.technicien && row.technicien !== "-") {
            extraPayload.technicien2 = row.technicien;
          }
          if (row.nomTechnicien && row.nomTechnicien !== "-") {
            extraPayload.nomTechnicien2 = row.nomTechnicien;
          }
        }
      }
      if (!isVrTransfer && targetTech) {
        extraPayload.technicien = targetTech;
      }
      if (!isVrTransfer && targetNomTech) {
        extraPayload.nomTechnicien = targetNomTech;
      }

      try {
        await updateDatabaseAvancement(
          row,
          effectiveAvancement,
          targetEquipe,
          nextBloc,
          activeDemandeAchat,
          extraPayload,
          demandeDevis
        );
        // L'emplacement P numéroté choisi ci-dessus est transmis dans
        // extraPayload et enregistré avec l'avancement.
        // Si un technicien est réaffecté ou spécifié, synchroniser aussi la colonne technicien
        if (!isVrTransfer && !isDevis && (extraParams?.technicien || extraParams?.nomTechnicien)) {
          updateDatabaseTechnicien(
            row,
            targetTech || "",
            targetNomTech || ""
          ).catch(() => {});
        } else if (isVrTransfer || isDevis) {
          updateDatabaseTechnicien(row, "-", "-").catch(() => {});
        }
        setLastRefresh(formatRefreshDate());
        setDatabaseStatus("ready");
        setDatabaseError("");
        // L'historique est créé uniquement après la validation PostgreSQL :
        // un changement refusé ne peut donc jamais produire une fausse trace.
        recordAvancementStatusChange(row, nextAvancement, nowFormatted, currentUserName);
        recordVehicleModification(
          row,
          "Avancement modifié",
          `${previousAvancement || "-"} → ${effectiveAvancement}${previousEtat !== nextEtat ? ` • État : ${formatStatusLabel(previousEtat)} → ${formatStatusLabel(nextEtat)}` : ""}${targetEquipe !== row.equipe ? ` • Équipe : ${row.equipe || "-"} → ${targetEquipe || "-"}` : ""}`,
        );
        const noticeMsg =
          isVrTransfer
            ? `🔄 Transfert ${nextAvancement} : véhicule ${row.serie || row.no} envoyé en Attente Réparation à l'équipe ${targetEquipe}, en attente de son acceptation. Technicien ${row.nomTechnicien || row.technicien || ""} libéré (🟢 Disponible).`
            : nextAvancement === "Essai"
              ? `Véhicule ${row.serie || row.no} mis à jour : Essai (transféré vers la Page Essai).`
              : nextAvancement === "attends acheter"
                ? `Véhicule ${row.serie || row.no} mis à jour : attends acheter (transféré vers la Page Acheter).`
                : isDevis
                  ? `📋 Véhicule ${row.serie || row.no} : Lancement devis enregistré${demandeDevis?.numeroDevis ? ` (N° DV ${demandeDevis.numeroDevis})` : ""}. Le véhicule retourne dans Tableaux de chargement avec l'avancement "Attente accord" (emplacement ${nextEmplacement}). Technicien ${row.nomTechnicien || row.technicien || ""} libéré (🟢 Disponible).`
                  : nextAvancement === "Technicien réaffecté"
                    ? `🔄 Technicien réaffecté pour ${row.serie || row.no} : avancement passé en "Attente réparation" (reste dans Interventions En cours).`
                    : nextAvancement === "Terminer"
                      ? `Essai CONFORME validé pour ${row.serie || row.no} : intervention Terminer (transféré en Attente Client).`
                      : nextAvancement === "Attente client"
                        ? `Essai NON-CONFORME pour ${row.serie || row.no} : placé en Attente Client (accord requis pour la nouvelle panne).`
                        : `Avancement ${row.serie || row.no} mis à jour : ${nextAvancement}.`;
        setWriteNotice(noticeMsg);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Les données locales peuvent être en retard sur PostgreSQL. Si la
        // première place automatique (ex. D1) vient d'être prise, relire les
        // emplacements et enregistrer directement la prochaine place libre.
        if (errorMessage.toLowerCase().includes("emplacement") && errorMessage.toLowerCase().includes("occup")) {
          try {
            const freshVehicles = await fetchDatabaseFluxData();
            const alternativeEmplacement = calculerEmplacementAutomatique(
              computedVehicle,
              freshVehicles,
              row.id,
            );
            if (alternativeEmplacement && alternativeEmplacement !== nextEmplacement && alternativeEmplacement !== FULL_PARKING_EMPLACEMENT) {
              const retryPayload = { ...extraPayload, emplacement: alternativeEmplacement };
              await updateDatabaseAvancement(
                row,
                effectiveAvancement,
                targetEquipe,
                nextBloc,
                activeDemandeAchat,
                retryPayload,
                demandeDevis,
              );
              setVehicles((current) => current.map((item) =>
                item.id === row.id ? { ...item, emplacement: alternativeEmplacement } : item
              ));
              setSelectedZone(alternativeEmplacement);
              setLastRefresh(formatRefreshDate());
              setDatabaseStatus("ready");
              setWriteError("");
              recordAvancementStatusChange(row, nextAvancement, nowFormatted, currentUserName);
              recordVehicleModification(
                row,
                "Avancement modifié",
                `${previousAvancement || "-"} → ${effectiveAvancement} • Emplacement : ${nextEmplacement} → ${alternativeEmplacement}`,
              );
              setWriteNotice(
                `La place ${nextEmplacement} était déjà occupée. Le véhicule ${row.serie || row.no} a été placé automatiquement en ${alternativeEmplacement}.`
              );
              return;
            }
          } catch (retryError) {
            error = retryError;
          }
        }
        if (
          nextAvancement === "attends acheter" ||
          nextAvancement === "Essai" ||
          nextAvancement === "Terminer" ||
          nextAvancement === "Attente client" ||
          nextAvancement === "Lancement devis" ||
          nextAvancement === "Attente accord" ||
          nextAvancement === "Lancement attente accord"
        ) {
          // Pour ces statuts, on conserve le véhicule dans l'état et la page cible
          setWriteNotice(
            nextAvancement === "attends acheter"
              ? `Véhicule ${row.serie || row.no} enregistré dans l'application en attente d'achat.`
              : nextAvancement === "Essai"
                ? `Véhicule ${row.serie || row.no} transféré en essai dans l'application.`
                : nextAvancement === "Lancement devis" || nextAvancement === "Attente accord" || nextAvancement === "Lancement attente accord"
                  ? `Véhicule ${row.serie || row.no} enregistré en Attente accord (emplacement P) dans l'application.`
                  : nextAvancement === "Terminer"
                    ? `Contrôle conforme pour ${row.serie || row.no} enregistré dans l'application.`
                    : `Véhicule ${row.serie || row.no} placé en attente client dans l'application.`
          );
          setWriteError(
            error instanceof Error
              ? `Échec de l'enregistrement PostgreSQL : ${error.message}.`
              : "La modification n'a pas été enregistrée dans PostgreSQL. Vérifiez l'API puis actualisez."
          );
        } else {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const isValidationRuleError =
            errorMsg.toLowerCase().includes("validation") ||
            errorMsg.toLowerCase().includes("cellule") ||
            errorMsg.toLowerCase().includes("règles de validation");

          if (isValidationRuleError) {
            setWriteNotice(
              `Avancement pour ${row.serie || row.no} mis à jour : ${nextAvancement}. PostgreSQL a refusé l'enregistrement. Vérifiez les données puis actualisez.`
            );
          } else {
            setVehicles((current) =>
              current.map((item) =>
                item.id === row.id
                  ? {
                    ...item,
                    avancement: previousAvancement,
                    etatIntervention: previousEtat,
                    statut: previousEtat,
                    emplacement: previousEmplacement,
                  }
                  : item
              )
            );
            setWriteError(
              error instanceof Error
                ? error.message
                : "Impossible d'enregistrer l'avancement dans PostgreSQL."
            );
          }
        }
      } finally {
        setSavingVehicleId((current) => (current === row.id ? null : current));
      }
    },
    [canWriteToDatabase, permissions.canEditEtat, permissions.canEditAvancement, setActiveTab, role]
  );

  const handleReprendreTravail = useCallback(
    async (row: Flux) => {
      // Vérifier si le technicien est actuellement occupé sur un autre véhicule
      const tech = row.technicien || "";
      const nomTech = row.nomTechnicien || "";
      if ((tech && tech !== "-") || (nomTech && nomTech !== "-")) {
        const busyCar = getActiveVehicleForTech(
          tech,
          nomTech,
          vehicles,
          row.id,
          row.no,
          reaffectationsMap
        );
        if (busyCar) {
          setWriteError(
            `⛔ Impossible de reprendre le travail : Le technicien [${tech}] ${nomTech} est actuellement occupé sur le véhicule OR ${busyCar.no || busyCar.serie || busyCar.id} (${busyCar.marque || ""} ${busyCar.modele || ""}). Il doit obligatoirement terminer ce nouveau travail avant de reprendre l'ancien véhicule !`
          );
          return;
        }
      }

      const rec = marquerVehiculeReprise(row, currentUser?.name);
      await saveVehicleAvancement(row, "En cours - 10%");
      setWriteNotice(
        `✅ Travail repris sur ${row.serie || row.no || row.chassis} le ${rec.dateReprise} !`
      );
    },
    [currentUser?.name, saveVehicleAvancement, vehicles, reaffectationsMap]
  );

  // Tous les travaux encore ouverts du technicien sélectionné. Cette liste permet
  // au chef d'équipe de choisir explicitement quel OR réaffecté doit reprendre.
  const repriseChooserWorks = useMemo(() => {
    if (!repriseChooserVehicle) return [];
    const matricule = (repriseChooserVehicle.technicien || "").trim().toLowerCase();
    const nom = (repriseChooserVehicle.nomTechnicien || "").trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      if (isVehicleFinished(vehicle)) return false;
      const vehicleMatricule = (vehicle.technicien || "").trim().toLowerCase();
      const vehicleNom = (vehicle.nomTechnicien || "").trim().toLowerCase();
      const isSameTechnician =
        (matricule && matricule !== "-" && vehicleMatricule === matricule) ||
        (nom && nom !== "-" && (vehicleNom === nom || vehicleNom.includes(nom) || nom.includes(vehicleNom)));
      if (!isSameTechnician) return false;

      const record = getReaffectationForVehicle(vehicle);
      return Boolean(
        isVehicleActivelyOccupyingTech(vehicle, reaffectationsMap) ||
        (record && !record.isRepris)
      );
    });
  }, [repriseChooserVehicle, vehicles, reaffectationsMap, getReaffectationForVehicle]);

  // Validation du contrôle d'essai depuis la Page Essai (modal essayeur)
  const handleValidateEssai = useCallback(
    async (payload: EssaiValidationPayload) => {
      const vehicle = payload.vehicle;
      let nextAvancement: string;
      const nowFormatted = getNowFormatted();
      const extraParams: Record<string, string> = {
        essayeur: payload.essayeur,
        resultatEssai: payload.resultat,
        dateControle: payload.dateControle || nowFormatted,
        dateModification: nowFormatted,
      };

      if (payload.resultat === "CONFORME") {
        nextAvancement = "Terminer";
        extraParams.dateFin = payload.dateControle || nowFormatted;
      } else {
        if (payload.actionNonConforme === "transfert_vr" && payload.targetVr) {
          // Retour après essai non conforme : l'équipe doit accepter explicitement
          // avant que le véhicule ne redémarre en intervention.
          nextAvancement = "Attente réparation";
          extraParams.actionNonConforme = "retour_equipe_apres_essai";
          extraParams.targetVr = payload.targetVr;
          extraParams.equipe = getTeamFromVr(payload.targetVr);
          extraParams.dateRetourEssai = payload.dateControle || nowFormatted;
        } else {
          nextAvancement = "Attente client";
          extraParams.actionNonConforme = "attente_client";
          extraParams.descriptionPanne = payload.descriptionPanne || "";
        }
      }

      // 1. Sauvegarde locale de la fiche de contrôle essai
      saveEssaiControleLocal({
        id: `essai-controle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        vehicleId: vehicle.id,
        or: payload.or,
        chassis: vehicle.chassis || "",
        modele: payload.modele,
        client: vehicle.client || "",
        essayeur: payload.essayeur,
        resultat: payload.resultat,
        actionNonConforme: payload.actionNonConforme,
        targetVr: payload.targetVr,
        descriptionPanne: payload.descriptionPanne,
        remarque: payload.remarque,
        dateControle: payload.dateControle,
        timestamp: Date.now(),
      });

      // Un contrôle clôture toujours l'essai ouvert, même s'il est non conforme.
      marquerFinEssai(vehicle, {
        essayeur: payload.essayeur,
        resultat: payload.resultat,
        dateControle: payload.dateControle || nowFormatted,
      });

      // 2. Mettre à jour l'avancement et synchroniser vers PostgreSQL
      await saveVehicleAvancement(vehicle, nextAvancement, undefined, extraParams);

      if (payload.resultat === "NON-CONFORME" && payload.actionNonConforme === "transfert_vr" && payload.targetVr) {
        const equipeRetour = getTeamFromVr(payload.targetVr);
        setReturnedEssaiNotifications((previous) => [
          ...previous.filter((item) => item.vehicle.id !== vehicle.id),
          {
            vehicle: {
              ...vehicle,
              equipe: equipeRetour,
              avancement: "Attente réparation",
              etatIntervention: "Attente Réparation",
              statut: "Attente Réparation",
            },
            equipe: equipeRetour,
            timestamp: payload.dateControle || nowFormatted,
          },
        ]);
      }
    },
    [saveVehicleAvancement]
  );


  // Gestion du marquage Achat Livré / Attente depuis la Page Acheter
  const handleMarquerAchatLivrer = useCallback(
    async (vehicle: Flux, demande: DemandeAchat) => {
      const orKey = (vehicle.no || vehicle.ordre || vehicle.chassis || String(vehicle.id)).trim();
      const userName = (currentUser?.name || selectedChefEquipeName || "Chef d'équipe").trim();

      // 1. Marquer localement la demande comme Livrée
      marquerDemandeAchatLivree(orKey, userName);

      // 2. La pièce arrivée ne démarre jamais le travail automatiquement.
      // Le véhicule retourne dans les Tableaux de chargement, en Attente réparation,
      // jusqu'à l'acceptation explicite de l'équipe qui l'a demandée.
      const nextAvancement = "Attente réparation";
      await saveVehicleAvancement(vehicle, nextAvancement);

      // 3. Déclencher la synchronisation PostgreSQL du statut d'achat
      void updateDatabaseStatutAchat(vehicle, demande, "Livré");

      // 4. Ajouter la notification d'acceptation pour le chef d'équipe
      const updatedDemande: DemandeAchat = {
        ...demande,
        statutAchat: "Livré",
        dateLivraison: new Date().toLocaleString("fr-FR"),
        livrePar: userName,
      };

      setDeliveredAchatNotifications((prev) => [
        ...prev.filter(
          (n) => (n.vehicle.no || n.vehicle.id) !== (vehicle.no || vehicle.id)
        ),
        {
          vehicle: {
            ...vehicle,
            avancement: nextAvancement,
            etatIntervention: "Attente Réparation",
            statut: "Attente Réparation",
          },
          demande: updatedDemande,
          timestamp: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    },
    [currentUser?.name, selectedChefEquipeName, saveVehicleAvancement]
  );

  const handleMarquerAchatAttente = useCallback(async (vehicle: Flux, demande: DemandeAchat) => {
    const orKey = (vehicle.no || vehicle.ordre || vehicle.chassis || String(vehicle.id)).trim();
    marquerDemandeAchatAttente(orKey);
    void updateDatabaseStatutAchat(vehicle, demande, "Attente");
    setDeliveredAchatNotifications((prev) =>
      prev.filter((n) => (n.vehicle.no || n.vehicle.id) !== (vehicle.no || vehicle.id))
    );
  }, []);

  const handleAcceptDeliveredAchat = useCallback(async (item: { vehicle: Flux; demande: DemandeAchat }) => {
    const busyCar = getActiveVehicleForTech(
      item.vehicle.technicien || "",
      item.vehicle.nomTechnicien || "",
      vehicles,
      item.vehicle.id,
      item.vehicle.no,
      reaffectationsMap
    );
    if (busyCar) {
      setWriteError(
        `⏳ OR ${item.vehicle.no || item.vehicle.ordre || item.vehicle.id} reste en Attente Réparation : ${item.vehicle.nomTechnicien || item.vehicle.technicien} est encore occupé sur OR ${busyCar.no || busyCar.ordre || busyCar.id}.`
      );
      setActiveTab("chargement");
      setActiveFilter("Attente Réparation");
      setSelectedVehicleId(item.vehicle.id);
      return;
    }

    // L'équipe accepte : le technicien est libre, l'intervention peut redémarrer.
    await saveVehicleAvancement(item.vehicle, "En cours - 10%");
    marquerDemandeAchatAccepteeParEquipe(
      (item.vehicle.no || item.vehicle.ordre || item.vehicle.chassis || String(item.vehicle.id)).trim(),
      currentUser?.name || selectedChefEquipeName
    );
    setDeliveredAchatNotifications((prev) =>
      prev.filter((n) => (n.vehicle.no || n.vehicle.id) !== (item.vehicle.no || item.vehicle.id))
    );
    setActiveTab("en_cours");
    setActiveFilter("En cours");
    setSelectedVehicleId(item.vehicle.id);
    setVehiculeModalData(item.vehicle);
  }, [vehicles, reaffectationsMap, saveVehicleAvancement, currentUser?.name, selectedChefEquipeName]);

  const handleDismissDeliveredAchat = useCallback((vehicleId: number | string) => {
    setDeliveredAchatNotifications((prev) =>
      prev.filter((n) => n.vehicle.id !== vehicleId && n.vehicle.no !== vehicleId)
    );
  }, []);

  const handleAcceptReturnedEssai = useCallback(async (item: { vehicle: Flux; equipe: string }) => {
    const busyCar = getActiveVehicleForTech(
      item.vehicle.technicien || "",
      item.vehicle.nomTechnicien || "",
      vehicles,
      item.vehicle.id,
      item.vehicle.no,
      reaffectationsMap
    );
    if (busyCar) {
      setWriteError(
        `⏳ Retour d'essai maintenu en Attente Réparation : ${item.vehicle.nomTechnicien || item.vehicle.technicien} est occupé sur OR ${busyCar.no || busyCar.ordre || busyCar.id}.`
      );
      setActiveTab("chargement");
      setActiveFilter("Attente Réparation");
      setSelectedVehicleId(item.vehicle.id);
      return;
    }

    await saveVehicleAvancement(item.vehicle, "En cours - 10%");
    setReturnedEssaiNotifications((previous) => previous.filter((entry) => entry.vehicle.id !== item.vehicle.id));
    setActiveTab("en_cours");
    setActiveFilter("En cours");
    setSelectedVehicleId(item.vehicle.id);
  }, [vehicles, reaffectationsMap, saveVehicleAvancement]);

  const rowsByZone = useMemo(() => {
    const zones = new Map<string, Flux[]>();

    vehicles.forEach((row) => {
      if (isCompletedWarrantyVehicle(row)) return;
      const zone = (row.emplacement || "").toUpperCase().trim();
      if (!zone || zone === "NA" || zone.startsWith("#") || isSheetEmplacementOutsideMap(zone)) {
        return;
      }
      zones.set(zone, [...(zones.get(zone) ?? []), row]);
    });

    return zones;
  }, [vehicles]);

  const attenteReparationCount = useMemo(() => {
    if (role === "chef_equipe" && effectiveChefFilterTeam) {
      return vehicles.filter(
        (v) =>
          isAttenteReparation(v.etatIntervention, v.avancement) &&
          isVehicleMatchingTeam(v.equipe || v.equipe1 || "", effectiveChefFilterTeam)
      ).length;
    }
    return vehicles.filter((v) => isAttenteReparation(v.etatIntervention, v.avancement)).length;
  }, [vehicles, role, effectiveChefFilterTeam]);

  const enCoursCount = useMemo(() => {
    if (role === "chef_equipe" && effectiveChefFilterTeam) {
      return vehicles.filter((v) => {
        const r = getReaffectationForVehicle(v);
        const isReaffActive = Boolean(r && !r.isRepris);
        return (
          isEnCours(v.etatIntervention, v.avancement, v.technicien, isReaffActive) &&
          isVehicleMatchingTeam(v.equipe || "", effectiveChefFilterTeam)
        );
      }).length;
    }
    return vehicles.filter((v) => {
      const r = getReaffectationForVehicle(v);
      const isReaffActive = Boolean(r && !r.isRepris);
      return isEnCours(v.etatIntervention, v.avancement, v.technicien, isReaffActive);
    }).length;
  }, [vehicles, role, effectiveChefFilterTeam, getReaffectationForVehicle]);

  const essaiCount = useMemo(() => {
    if (role === "chef_equipe" && effectiveChefFilterTeam) {
      return vehicles.filter(
        (v) =>
          isEssai(v) &&
          isVehicleMatchingTeam(v.equipe || "", effectiveChefFilterTeam)
      ).length;
    }
    return vehicles.filter(isEssai).length;
  }, [vehicles, role, effectiveChefFilterTeam]);

  const attenteAchatCount = useMemo(() => {
    if (role === "chef_equipe" && effectiveChefFilterTeam) {
      return vehicles.filter(
        (v) =>
          isAttenteAchat(v) &&
          isVehicleMatchingTeam(v.equipe || "", effectiveChefFilterTeam)
      ).length;
    }
    return vehicles.filter(isAttenteAchat).length;
  }, [vehicles, role, effectiveChefFilterTeam]);

  const devisCount = useMemo(() => {
    if (role === "chef_equipe" && effectiveChefFilterTeam) {
      return vehicles.filter(
        (v) =>
          isAttenteDevis(v, demandesDevisMap) &&
          isVehicleMatchingTeam(v.equipe || "", effectiveChefFilterTeam)
      ).length;
    }
    return vehicles.filter((v) => isAttenteDevis(v, demandesDevisMap)).length;
  }, [vehicles, role, effectiveChefFilterTeam, demandesDevisMap]);

  const devisAAppelerCount = useMemo(() => {
    return vehicles.filter((v) => {
      const d =
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()]);
      if (role === "reception" && assignedReceptionCs) {
        const vCs = String(v.cs || d?.cs || "").trim().toUpperCase();
        if (vCs && vCs !== assignedReceptionCs) return false;
      }
      const av = (v.avancement || "").toLowerCase();
      const isEnDevis = av.includes("devis") || (v.etatIntervention || "").toLowerCase().includes("devis");
      return isEnDevis && (!d || !d.statutDevis || d.statutDevis === "Attente validation devis" || d.statutDevis === "En attente accord");
    }).length;
  }, [vehicles, demandesDevisMap, role, assignedReceptionCs]);

  const devisRelanceCount = useMemo(() => {
    return vehicles.filter((v) => {
      const d =
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()]);
      if (role === "reception" && assignedReceptionCs) {
        const vCs = String(v.cs || d?.cs || "").trim().toUpperCase();
        if (vCs && vCs !== assignedReceptionCs) return false;
      }
      const av = (v.avancement || "").toLowerCase();
      const isEnDevis = av.includes("devis") || (v.etatIntervention || "").toLowerCase().includes("devis");
      return isEnDevis && isDevisDepassee24h(d);
    }).length;
  }, [vehicles, demandesDevisMap, role, assignedReceptionCs]);

  const [dismissedDevisNotifIds, setDismissedDevisNotifIds] = useState<Set<string>>(new Set());

  const activeDevisAppelerNotifications = useMemo(() => {
    // Les notifications opérationnelles sont destinées à la Réception ;
    // elles ne doivent pas interrompre l'Administration ni le Chef d'Atelier.
    if (role !== "reception") {
      return [];
    }
    return vehicles
      .map((v) => {
        const d =
          demandesDevisMap[String(v.id)] ||
          (v.no && demandesDevisMap[v.no.trim()]) ||
          (v.chassis && demandesDevisMap[v.chassis.trim()]);
        return { vehicle: v, devis: d };
      })
      .filter(({ vehicle, devis }) => {
        const notifId = `appeler-${vehicle.id}`;
        if (dismissedDevisNotifIds.has(notifId)) return false;
        if (!devis) return false;
        if (devis.statutDevis === "Accepté" || devis.statutDevis === "Refusé") return false;
        if (assignedReceptionCs) {
          const vCs = String(vehicle.cs || devis?.cs || "").trim().toUpperCase();
          if (vCs && vCs !== assignedReceptionCs) return false;
        }
        const av = (vehicle.avancement || "").toLowerCase();
        const isEnDevis = av.includes("devis") || (vehicle.etatIntervention || "").toLowerCase().includes("devis");
        return isEnDevis && (!devis.statutDevis || devis.statutDevis === "Attente validation devis" || devis.statutDevis === "En attente accord");
      });
  }, [vehicles, demandesDevisMap, role, dismissedDevisNotifIds, assignedReceptionCs]);

  const activeDevisRelanceNotifications = useMemo(() => {
    if (role !== "reception") {
      return [];
    }
    return vehicles
      .map((v) => {
        const d =
          demandesDevisMap[String(v.id)] ||
          (v.no && demandesDevisMap[v.no.trim()]) ||
          (v.chassis && demandesDevisMap[v.chassis.trim()]);
        return { vehicle: v, devis: d };
      })
      .filter(({ vehicle, devis }) => {
        const notifId = `relance-${vehicle.id}`;
        if (dismissedDevisNotifIds.has(notifId)) return false;
        if (!devis) return false;
        if (devis.statutDevis === "Accepté" || devis.statutDevis === "Refusé") return false;
        if (assignedReceptionCs) {
          const vCs = String(vehicle.cs || devis?.cs || "").trim().toUpperCase();
          if (vCs && vCs !== assignedReceptionCs) return false;
        }
        const av = (vehicle.avancement || "").toLowerCase();
        const isEnDevis = av.includes("devis") || (vehicle.etatIntervention || "").toLowerCase().includes("devis");
        return isEnDevis && isDevisDepassee24h(devis);
      });
  }, [vehicles, demandesDevisMap, role, dismissedDevisNotifIds, assignedReceptionCs]);

  const handleAppelerClientFromNotif = useCallback((item: { vehicle: Flux; devis: DemandeDevis }) => {
    const key = (item.vehicle.no || item.vehicle.ordre || item.vehicle.chassis || String(item.vehicle.id)).trim();
    const updated = marquerDevisAppele(key, currentUser?.name || "Réception", undefined, item.vehicle);
    if (updated) {
      void updateDatabaseStatutDevis(item.vehicle, updated, "Client appelé");
    }
    const dateHeureAppel = updated?.dateAppel || "";
    setWriteNotice(`📞 Client appelé le ${dateHeureAppel} pour le devis N° DV ${item.devis.numeroDevis} (${item.vehicle.no || item.vehicle.ordre}).`);
  }, [currentUser?.name]);

  const handleAccepterDevisFromNotif = useCallback(async (item: { vehicle: Flux; devis: DemandeDevis }) => {
    const key = (item.vehicle.no || item.vehicle.ordre || item.vehicle.chassis || String(item.vehicle.id)).trim();
    const updated = marquerDevisAccepte(key);
    const devisData: DemandeDevis = updated || item.devis;
    void updateDatabaseStatutDevis(item.vehicle, devisData, "Accepté");
    const targetEquipe = item.devis.equipeOrigine || item.devis.equipe || item.vehicle.equipe || "Daily1";
    const targetTech =
      item.vehicle.technicien && item.vehicle.technicien !== "-"
        ? item.vehicle.technicien
        : item.devis.technicien && item.devis.technicien !== "-"
        ? item.devis.technicien
        : "";
    const targetNomTech =
      item.vehicle.nomTechnicien && item.vehicle.nomTechnicien !== "-"
        ? item.vehicle.nomTechnicien
        : item.devis.nomTechnicien && item.devis.nomTechnicien !== "-"
        ? item.devis.nomTechnicien
        : "";

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const dateAccord = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

    saveDevisAccordNotification({
      id: `devis-accord-${item.vehicle.id || item.vehicle.no || item.vehicle.chassis}`,
      vehicleId: item.vehicle.id,
      or: item.vehicle.no || item.vehicle.ordre || "-",
      chassis: item.vehicle.chassis || "-",
      client: item.vehicle.client || item.devis.client || "Client",
      marque: item.vehicle.marque || "IVECO",
      modele: item.vehicle.modele || item.devis.modele || "-",
      immatriculation: item.vehicle.serie || item.vehicle.immatriculation || "-",
      equipeCible: targetEquipe,
      numeroDevis: item.devis.numeroDevis || "-",
      dateAccord,
      timestamp: `${hh}:${min}`,
      timestampMs: Date.now(),
      technicien: targetTech,
      nomTechnicien: targetNomTech,
    });

    await saveVehicleAvancement(
      item.vehicle,
      "Accepter accord",
      undefined,
      {
        equipe: targetEquipe,
        etat: "Attente Réparation",
        technicien: targetTech,
        nomTechnicien: targetNomTech,
        avancement: "Accepter accord",
      },
      updated || item.devis
    );
    const techDisplay = targetNomTech
      ? `👨‍🔧 Technicien : ${targetNomTech}${targetTech ? ` (${targetTech})` : ""}`
      : targetTech
      ? `👨‍🔧 Tech : ${targetTech}`
      : "";
    setWriteNotice(`✅ Devis N° DV ${item.devis.numeroDevis} accepté ! Véhicule passé en avancement "Accepter accord" et retourné à l'équipe ${targetEquipe} ${techDisplay ? `[${techDisplay}] ` : ""}dans "Tableaux de chargement (Attente Réparation)".`);
  }, [saveVehicleAvancement]);

  const handleRefuserDevisFromNotif = useCallback(async (item: { vehicle: Flux; devis: DemandeDevis }) => {
    const key = (item.vehicle.no || item.vehicle.ordre || item.vehicle.chassis || String(item.vehicle.id)).trim();
    const updated = marquerDevisRefuse(key);
    const devisData: DemandeDevis = updated || item.devis;
    void updateDatabaseStatutDevis(item.vehicle, devisData, "Refusé");
    await saveVehicleAvancement(
      item.vehicle,
      "Terminer",
      undefined,
      {
        etatIntervention: "Attente Client",
        avancement: "Terminer",
        statut: "Attente Client",
        etat: "Attente Client",
      },
      updated || item.devis
    );
    setWriteNotice(`❌ Devis N° DV ${item.devis.numeroDevis} refusé par le client : Véhicule passé automatiquement en "Terminer" (Attente Client pour restitution).`);
  }, [saveVehicleAvancement]);

  const handleRelancerClientFromNotif = useCallback((item: { vehicle: Flux; devis: DemandeDevis }) => {
    const key = (item.vehicle.no || item.vehicle.ordre || item.vehicle.chassis || String(item.vehicle.id)).trim();
    const updated = marquerDevisRelance(key, currentUser?.name || "Réception");
    if (updated) {
      void updateDatabaseStatutDevis(item.vehicle, updated, "Client appelé");
    }
    setWriteNotice(`⚠️ Relance client effectuée pour le devis N° DV ${item.devis.numeroDevis} (${item.vehicle.no || item.vehicle.ordre}).`);
  }, [currentUser?.name]);

  const handleDismissDevisNotif = useCallback((notifId: string) => {
    setDismissedDevisNotifIds((prev) => new Set([...prev, notifId]));
  }, []);

  const activeDevisAccordNotificationsForUser = useMemo(() => {
    if (role !== "chef_equipe") return [];
    return devisAccordNotifications.filter((notif) => {
      if (role === "chef_equipe") {
        if (!activeChefEquipeTeam) return false;
        return isVehicleMatchingTeam(notif.equipeCible, activeChefEquipeTeam);
      }
      return false;
    });
  }, [devisAccordNotifications, role, activeChefEquipeTeam]);

  const handlePrendreEnChargeDevisAccord = useCallback(
    (notif: DevisAccordNotification, vehicle: Flux) => {
      const busyCar = getActiveVehicleForTech(
        vehicle.technicien || notif.technicien || "",
        vehicle.nomTechnicien || notif.nomTechnicien || "",
        vehicles,
        vehicle.id,
        vehicle.no,
        reaffectationsMap
      );
      if (busyCar) {
        setWriteError(
          `⏳ Le retour de devis reste en Attente Réparation : ${vehicle.nomTechnicien || vehicle.technicien || notif.nomTechnicien || notif.technicien} est occupé sur OR ${busyCar.no || busyCar.ordre || busyCar.id}.`
        );
        setActiveTab("chargement");
        setActiveFilter("Attente Réparation");
        setSelectedVehicleId(vehicle.id);
        return;
      }
      removeDevisAccordNotification(notif.id);
      setPendingEnCoursVehicle(vehicle);
      setIsTechModalOpen(true);
    },
    [vehicles, reaffectationsMap]
  );

  const handleVoirDansChargement = useCallback(
    (_notif: DevisAccordNotification, vehicle?: Flux) => {
      setActiveTab("chargement");
      setActiveFilter("Attente Réparation");
      if (vehicle) {
        setSelectedVehicleId(vehicle.id);
      }
    },
    []
  );

  // Le chef peut différer la reprise : le véhicule reste dans son tableau
  // « Attente Réparation », seule la notification est acquittée.
  const handleMettreEnAttenteDevisAccord = useCallback(
    (notif: DevisAccordNotification, vehicle?: Flux) => {
      removeDevisAccordNotification(notif.id);
      setActiveTab("chargement");
      setActiveFilter("Attente Réparation");
      if (vehicle) setSelectedVehicleId(vehicle.id);
      setWriteNotice(
        `⏸️ OR ${notif.or} maintenu dans Tableaux de chargement (Attente Réparation) pour l'équipe ${notif.equipeCible}.`
      );
    },
    []
  );

  const activeReceptionReadyVehicles = useMemo(() => {
    if (role !== "reception") return [];
    return vehicles.filter((v) => {
      if (assignedReceptionCs && String(v.cs || "").trim().toUpperCase() !== assignedReceptionCs) {
        return false;
      }
      if (String(v.cs || "").trim().toUpperCase() === "R10" || v.isGarantie) {
        return false;
      }
      // Att Facture autorise aussi le départ du client ; le règlement final
      // reste à traiter par la Facturation en fin de mois.
      const isPaymentValidated = ["Facture", "Bon de commande", "Att Facture", "Attente Facture", "Édition fin de travaux"].includes(v.modePaiement || "");
      const isReady =
        isPaymentValidated &&
        (v.etatIntervention === "Attente Client" || v.statut === "Attente Client");
      const isDelivered =
        v.etatIntervention === "Livré" ||
        v.statut === "Livré" ||
        v.avancement === "Livré" ||
        v.avancement === "Sorti" ||
        Boolean((v as any).dateLivraisonClient);
      return isReady && !isDelivered && !dismissedReadyNotifIds.has(v.id);
    });
  }, [vehicles, role, dismissedReadyNotifIds, assignedReceptionCs]);

  const activeNouvelleEntreeNotificationsForUser = useMemo(() => {
    // Seuls les Chefs d'équipe reçoivent les entrées à accepter/mettre en attente.
    if (role !== "chef_equipe") return [];
    return nouvelleEntreeNotifications.filter((notif) => {
      if (dismissedEntreeNotifIds.has(notif.id)) return false;
      if (notif.statutAcceptation && notif.statutAcceptation !== "en_attente") return false;
      if (!notif.equipe || notif.equipe === "-" || notif.equipe === "NA") return false;

      // Seul le chef d'équipe de l'équipe qui prend le travail peut voir et accepter la notification
      // (ex: si l'entrée est pour Daily, seuls Daily1 et Daily2 la voient)
      if (role === "chef_equipe") {
        if (!activeChefEquipeTeam) return false;
        return isVehicleMatchingTeam(notif.equipe, activeChefEquipeTeam);
      }

      // Si l'utilisateur a une équipe explicitement affectée
      if (activeChefEquipeTeam && (role === "chef_atelier" || role === "administration")) {
        return isVehicleMatchingTeam(notif.equipe, activeChefEquipeTeam);
      }
      return false;
    });
  }, [nouvelleEntreeNotifications, dismissedEntreeNotifIds, role, activeChefEquipeTeam]);

  const handleAccepterNouvelleEntree = useCallback(
    async (item: NouvelleEntreeNotification, matchingVehicle?: Flux) => {
      const chefName = (currentUser?.name || selectedChefEquipeName || "Chef d'équipe").trim();

      // Basculer immédiatement vers le tableau Interventions En cours
      setActiveTab("en_cours");
      setActiveFilter("En cours");

      const assignedTeam =
        item.equipe && !item.equipe.includes(",") && item.equipe.trim() !== "-"
          ? item.equipe.trim()
          : (chefAssignedTeams[0] || "Daily1");

      const normOr = (item.noOr || "").trim();
      const normChassis = (item.chassis || "").trim().toUpperCase();
      const resolvedVehicle = matchingVehicle || vehicles.find((v) => {
        const vOr = (v.no || v.ordre || "").trim();
        const vChassis = (v.chassis || "").trim().toUpperCase();
        return (normOr && vOr === normOr) || (!normOr && normChassis && vChassis === normChassis);
      });

      // Préparer le véhicule pour passage direct en "En cours - 10%"
      const baseVehicle: Partial<Flux> = resolvedVehicle
        ? {
            ...resolvedVehicle,
            equipe: assignedTeam,
            equipe1: resolvedVehicle.equipe1 && resolvedVehicle.equipe1 !== "-" ? resolvedVehicle.equipe1 : assignedTeam,
            statut: "En cours",
            etatIntervention: "En cours",
            avancement: "En cours - 10%",
            statutAcceptation: "accepte" as const,
            dateAcceptation: "",
            acceptePar: chefName,
          }
        : {
            id: typeof item.id === "number" ? item.id : Number(item.id) || Date.now(),
            no: item.noOr,
            ordre: item.noOr,
            chassis: item.chassis,
            immatriculation: item.immatriculation || "-",
            marque: item.marque,
            modele: item.modele,
            modelePowerBI: item.modele,
            client: item.nomClient,
            equipe: assignedTeam,
            equipe1: assignedTeam,
            statut: "En cours",
            etatIntervention: "En cours",
            avancement: "En cours - 10%",
            emplacement: "-",
            technicien: "-",
            nomTechnicien: "-",
            serie: item.noOr,
            dateEntree: item.dateEntreeHeure,
            date: item.dateEntreeHeure.split(" ")[0] || "",
            atelier: item.modele,
            categorie: item.modele,
            operation: "Entrée atelier",
            montant: 0,
            temps: 0,
            nbIntervention: 1,
            statutAcceptation: "accepte" as const,
            dateAcceptation: "",
            acceptePar: chefName,
          };

      // Calcul automatique de l'emplacement selon l'équipe responsable (Daily->D, Électrique->E, Service Rapide->S, Carrosserie->C, Lourd->T/M)
      const autoEmp = calculerEmplacementAutomatique(baseVehicle, vehicles, baseVehicle.id);
      baseVehicle.emplacement = autoEmp;

      const { dateTime: currentDateTime, time: currentTime } = getWorkshopNow();

      baseVehicle.dateDebutRep = currentDateTime;
      baseVehicle.dateDebutTravail = currentDateTime;
      baseVehicle.heureDebutTravail = currentTime;

      const res = await accepterEntreeParChefEquipe({
        noOr: item.noOr,
        chassis: item.chassis,
        decision: "accepte",
        equipe: assignedTeam,
        decisionPar: chefName,
        statut: "En cours",
        etat: "En cours",
        avancement: "En cours - 10%",
        emplacement: autoEmp,
        dateDebutRep: currentDateTime,
        dateDebutTravail: currentDateTime,
        heureDebutTravail: currentTime,
      });

      const targetVehicle: Flux = {
        ...(baseVehicle as Flux),
        id: typeof baseVehicle.id === "number" ? baseVehicle.id : (typeof item.id === "number" ? item.id : Number(item.id) || Date.now()),
        dateAcceptation: res.dateDecision,
        dateDebutRep: res.dateDecision || currentDateTime,
        dateDebutTravail: res.dateDecision || currentDateTime,
        heureDebutTravail: (res.dateDecision || currentDateTime).split(" ")[1] || currentTime,
      };

      // Nettoyer la notification
      removeNouvelleEntreeNotification(item.id);

      // Mettre à jour l'état local des véhicules
      setVehicles((prev) => {
        const exists = prev.some((v) =>
          (normOr && (v.no === normOr || v.ordre === normOr)) ||
          (!normOr && normChassis && v.chassis && v.chassis.trim().toUpperCase() === normChassis)
        );
        if (exists) {
          return prev.map((v) =>
            ((normOr && (v.no === normOr || v.ordre === normOr)) ||
             (!normOr && normChassis && v.chassis && v.chassis.trim().toUpperCase() === normChassis))
              ? {
                  ...v,
                  equipe: assignedTeam,
                  statut: "En cours",
                  etatIntervention: "En cours",
                  avancement: "En cours - 10%",
                  statutAcceptation: "accepte",
                  dateAcceptation: res.dateDecision,
                  dateDebutRep: res.dateDecision || currentDateTime,
                  dateDebutTravail: res.dateDecision || currentDateTime,
                  heureDebutTravail: (res.dateDecision || currentDateTime).split(" ")[1] || currentTime,
                  acceptePar: chefName,
                  emplacement: autoEmp,
                }
              : v
          );
        }
        return [targetVehicle, ...prev];
      });

      // Ouvrir immédiatement la modal d'affectation technicien
      setPendingEnCoursVehicle(targetVehicle);
      setIsOnlyTechChange(false);
      setIsTechModalOpen(true);

      setWriteNotice(
        `✅ Entrée N° OR ${item.noOr} acceptée et placée dans Interventions En cours (${autoEmp} • Avancement 10%). Choisissez un technicien libre.`
      );
    },
    [currentUser?.name, selectedChefEquipeName, setActiveTab, vehicles]
  );

  const handleMettreEnAttenteEntree = useCallback(
    async (item: NouvelleEntreeNotification) => {
      const chefName = (currentUser?.name || selectedChefEquipeName || "Chef d'équipe").trim();
      const res = await accepterEntreeParChefEquipe({
        noOr: item.noOr,
        chassis: item.chassis,
        decision: "mis_en_attente",
        equipe: item.equipe,
        decisionPar: chefName,
        etat: "Attente Réparation",
        statut: "Attente Réparation",
        etatIntervention: "Attente Réparation",
      });

      removeNouvelleEntreeNotification(item.id);
      setDismissedEntreeNotifIds((prev) => new Set([...prev, item.id]));

      // Mettre à jour l'état local des véhicules
      setVehicles((prev) =>
        prev.map((v) =>
          ((item.noOr && (v.no === item.noOr || v.ordre === item.noOr)) ||
           (!item.noOr && item.chassis && v.chassis === item.chassis))
            ? {
                ...v,
                etatIntervention: "Attente Réparation",
                statut: "Attente Réparation",
                statutAcceptation: "mis_en_attente",
                dateMiseEnAttente: res.dateDecision,
                misEnAttentePar: chefName,
              }
            : v
        )
      );

      setActiveTab("chargement");
      setActiveFilter("Attente Réparation");

      setWriteNotice(
        `⏸️ Entrée N° OR ${item.noOr} mise en attente le ${res.dateDecision} dans Tableaux de chargement (Attente Réparation).`
      );
    },
    [currentUser?.name, selectedChefEquipeName]
  );


  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return vehicles
      .filter((row) => {
        // Une intervention garantie terminée est sortie du flux opérationnel :
        // elle reste accessible uniquement depuis le Tableau de Suivi Garantie.
        if (isCompletedWarrantyVehicle(row)) {
          return false;
        }
        if (role !== "administration" && (
          row.etatIntervention === "Livré" || row.statut === "Livré" ||
          row.avancement === "Livré" || row.avancement === "Sorti"
        )) {
          return false;
        }
        if (role === "reception" && assignedReceptionCs && String(row.cs || "").trim().toUpperCase() !== assignedReceptionCs) {
          return false;
        }
        // 1. Si on est sur l'onglet 'en_cours' : uniquement les véhicules 'En cours'
        if (activeTab === "en_cours") {
          const r = getReaffectationForVehicle(row);
          const isReaffActive = Boolean(r && !r.isRepris);
          if (!isEnCours(row.etatIntervention, row.avancement, row.technicien, isReaffActive)) {
            return false;
          }
          // Si rôle 'chef_equipe' : trouver seulement les véhicules de son équipe
          if (role === "chef_equipe" && effectiveChefFilterTeam) {
            if (!isVehicleMatchingTeam(row.equipe || "", effectiveChefFilterTeam)) {
              return false;
            }
            if (enCoursTransferOnly) {
              const isTransferred =
                Boolean(row.bloc && row.bloc > 1) ||
                Boolean(row.avancement1 && row.avancement1.toLowerCase().startsWith("vr")) ||
                Boolean(row.avancement2 && row.avancement2.toLowerCase().startsWith("vr")) ||
                Boolean(row.equipe1 && row.equipe1 !== "-" && !isVehicleMatchingTeam(row.equipe1, effectiveChefFilterTeam));
              if (!isTransferred) return false;
            }
          }
        }

        // 2. Si on est sur 'chargement' ET rôle 'chef_equipe' : uniquement 'Attente Réparation' de son équipe
        if (activeTab === "chargement" && role === "chef_equipe") {
          const r = getReaffectationForVehicle(row);
          const isReaffActive = Boolean(r && !r.isRepris);
          if (isReaffActive) {
            return false;
          }
          if (!isAttenteReparation(row.etatIntervention, row.avancement)) {
            return false;
          }
          if (effectiveChefFilterTeam && !isVehicleMatchingTeam(row.equipe || row.equipe1 || "", effectiveChefFilterTeam)) {
            return false;
          }
        }

        const matchesStatus =
          activeTab === "en_cours" || (activeTab === "chargement" && role === "chef_equipe")
            ? true
            : statusMatchesFilter(row, activeFilter);

        const matchesDate =
          dateFilter === ALL_DATES ||
          normalizeDateLabel(row.dateEntree) === dateFilter;
        const haystack = [
          row.emplacement,
          row.l2n2500,
          row.cs,
          row.no,
          row.client,
          row.chassis,
          row.dateEntree,
          row.heureEntree,
          row.marque,
          row.modele,
          row.modelePowerBI,
          row.categorie,
          row.technicien,
          row.nomTechnicien,
          row.equipe,
          row.avancement,
          row.serie,
          row.etatIntervention,
        ]
          .join(" ")
          .toLowerCase();

        return matchesStatus && matchesDate && (!query || haystack.includes(query));
      })
      .sort((a, b) => {
        // 1. Priorité absolue : entrées en cours d'ajout / locales récentes (optimistes)
        const aIsPending = Boolean(
          a.isPendingNewEntry ||
          (typeof a.id === "number" && a.id > 1000000000000 && (!a.sheetRowNumber || a.sheetRowNumber <= 2))
        );
        const bIsPending = Boolean(
          b.isPendingNewEntry ||
          (typeof b.id === "number" && b.id > 1000000000000 && (!b.sheetRowNumber || b.sheetRowNumber <= 2))
        );

        if (aIsPending && !bIsPending) return -1;
        if (!aIsPending && bIsPending) return 1;
        if (aIsPending && bIsPending) {
          return (b.creationTimestamp ?? b.id) - (a.creationTimestamp ?? a.id);
        }

        // 2. Règle commune des tableaux : la dernière entrée est toujours en tête.
        // La date/heure d'entrée est prioritaire ; l'identifiant sert de secours
        // pour les anciennes lignes qui ne possèdent pas encore d'horodatage.
        const dateA = parseStoredDate(`${a.dateEntree || ""} ${a.heureEntree || ""}`) ||
          parseStoredDate(a.dateModification) || a.creationTimestamp || (typeof a.id === "number" ? a.id : 0);
        const dateB = parseStoredDate(`${b.dateEntree || ""} ${b.heureEntree || ""}`) ||
          parseStoredDate(b.dateModification) || b.creationTimestamp || (typeof b.id === "number" ? b.id : 0);
        if (dateA !== dateB) return dateB - dateA;
        return String(b.id ?? "").localeCompare(String(a.id ?? ""), undefined, { numeric: true });
      });
  }, [activeFilter, dateFilter, search, vehicles, role, assignedReceptionCs, activeTab, effectiveChefFilterTeam, enCoursTransferOnly]);

  const workshopVehicles = useMemo(
    () => vehicles.filter((vehicle) => !isCompletedWarrantyVehicle(vehicle)),
    [vehicles]
  );

  const dateOptions = useMemo(
    () =>
      Array.from(
        new Set(
          workshopVehicles
            .map((row) => normalizeDateLabel(row.dateEntree))
            .filter(Boolean)
        )
      ).sort((a, b) => parseStoredDate(b) - parseStoredDate(a)),
    [workshopVehicles]
  );

  const statusRows = useMemo(
    () =>
      statusMeta
        .map((status) => ({
          ...status,
          count: workshopVehicles.filter(
            (row) => row.etatIntervention === status.label
          ).length,
        }))
        .filter((status) => status.count > 0),
    [workshopVehicles]
  );

  const selectedVehicle = selectedZone
    ? vehicles.find((row) => row.id === selectedVehicleId) ??
    rowsByZone.get(selectedZone)?.[0] ??
    null
    : null;

  const selectedRows = selectedZone
    ? rowsByZone.get(selectedZone) ?? []
    : [];

  const missingMapZones = useMemo(
    () =>
      Array.from(rowsByZone.keys())
        .filter(
          (zone) => !isSheetEmplacementOutsideMap(zone) && !mapZoneIds.has(zone)
        )
        .sort((a, b) => a.localeCompare(b)),
    [rowsByZone]
  );

  const kpis = [
    {
      label: "Véhicules en attente",
      helper: "Etat intervention",
      value: workshopVehicles.filter((row) =>
        waitingStatuses.has(row.etatIntervention)
      ).length,
      accent: "#d97706",
      filter: "Attentes" as StatusFilter,
      icon: <CircleGauge size={18} />,
    },
    {
      label: "Attente Client",
      helper: "Client à confirmer",
      value: workshopVehicles.filter(
        (row) => row.etatIntervention === "Attente Client"
      ).length,
      accent: "#dc2626",
      filter: "Attente Client" as StatusFilter,
      icon: <PackageOpen size={18} />,
    },
    {
      label: "Véhicules en cours",
      helper: "Intervention active",
      value: workshopVehicles.filter((row) =>
        isEnCours(row.etatIntervention, row.avancement, row.technicien)
      ).length,
      accent: "#2563eb",
      filter: "En cours" as StatusFilter,
      icon: <Wrench size={18} />,
    },
    {
      label: "À livrer / prêts",
      helper: "Sortie atelier",
      value: workshopVehicles.filter(
        (row) => formatStatusLabel(row.etatIntervention) === "Livré"
      ).length,
      accent: "#16a34a",
      filter: "Livré" as StatusFilter,
      icon: <CheckCircle2 size={18} />,
    },
    {
      label: "Travaux Exterieurs",
      helper: "Hors atelier",
      value: workshopVehicles.filter(
        (row) => row.etatIntervention === "Travaux Exterieurs"
      ).length,
      accent: "#0891b2",
      filter: "Travaux Exterieurs" as StatusFilter,
      icon: <AlertTriangle size={18} />,
    },
  ];

  useEffect(() => {
    const mapRoot = mapRef.current;
    const svg = mapRoot?.querySelector<SVGSVGElement>("svg");

    if (!mapRoot || !svg) return;

    mapRoot
      .querySelectorAll<SVGGraphicsElement>(".atelier-zone-label")
      .forEach((label) => label.remove());

    mapZoneIds.forEach((zone) => {
      let element: SVGGraphicsElement | null = null;
      try {
        element = svg.querySelector<SVGGraphicsElement>(`#${CSS.escape(zone)}`);
      } catch {
        return;
      }

      if (!element) return;

      const isOccupied = rowsByZone.has(zone);
      const isSelected = selectedZone === zone;

      if (!isOccupied) {
        const freeStyle = getFreeEmplacementStyle(zone);
        element.style.setProperty("fill", isSelected ? "#3b82f6" : freeStyle.fill);
        element.style.setProperty("fill-opacity", isSelected ? "0.55" : "0.95");
        element.style.setProperty("stroke", isSelected ? "#1d4ed8" : freeStyle.stroke);
        element.style.setProperty("stroke-width", isSelected ? "3.5" : "2");
        element.style.setProperty("stroke-opacity", "1");
      }
      const previousTitle = element.querySelector("title[data-atelier-zone-tooltip]");
      previousTitle?.remove();
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.setAttribute("data-atelier-zone-tooltip", "true");
      title.textContent = isOccupied
        ? `${zone} — ${rowsByZone.get(zone)?.length || 1} véhicule(s) affecté(s)`
        : `${zone} — Emplacement libre`;
      element.prepend(title);
      element.style.setProperty("cursor", "pointer");
      element.style.setProperty("pointer-events", "visiblePainted");
      element.style.setProperty("transition", "all 160ms ease");
    });

    const labelLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    labelLayer.setAttribute("class", "atelier-zone-label");
    labelLayer.setAttribute("pointer-events", "none");
    svg.appendChild(labelLayer);

    rowsByZone.forEach((rows, zone) => {
      if (!zone || !mapZoneIds.has(zone)) return;
      let element: SVGGraphicsElement | null = null;
      try {
        element = svg.querySelector<SVGGraphicsElement>(`#${CSS.escape(zone)}`);
      } catch {
        return;
      }

      if (!element) return;

      const row = rows[0];
      const color = getPlanVehicleColor(row);
      const isSelected = selectedZone === zone;
      // Un poste occupé reste toujours éclairé : les filtres ne doivent pas
      // masquer visuellement un véhicule présent dans l'atelier.
      const isVisible = true;

      element.style.setProperty("fill", color);
      element.style.setProperty("opacity", "1");
      element.style.setProperty(
        "fill-opacity",
        isVisible ? "0.82" : "0.15"
      );
      element.style.setProperty("stroke", isSelected ? "#ffffff" : color);
      element.style.setProperty(
        "stroke-width",
        isSelected ? "5" : "3"
      );
      element.style.setProperty(
        "stroke-opacity",
        isVisible ? "0.95" : "0.25"
      );

      const tooltip = element.querySelector("title[data-atelier-zone-tooltip]");
      if (tooltip) {
        tooltip.textContent = [
          `Emplacement ${zone}`,
          `Véhicule : ${row.serie || row.chassis || row.no || "-"}`,
          `OR : ${row.l2n2500 || row.no || "-"}`,
          `État : ${formatStatusLabel(row.etatIntervention)}`,
          `Avancement : ${row.avancement || "-"}`,
          `Équipe : ${row.equipe || "-"}`,
        ].join("\n");
      }

      if (isSelected) {
        element.style.setProperty(
          "filter",
          "drop-shadow(0 0 14px rgba(255, 255, 255, 0.95))"
        );
      } else {
        element.style.removeProperty("filter");
      }

      try {
        const box = element.getBBox();
        const label = row.serie || row.no.slice(-4);
        const fontSize = Math.max(14, Math.min(20, box.height * 0.3));

        // Background capsule badge for the vehicle label
        const badgeW = Math.min(box.width - 4, Math.max(64, label.length * 10 + 16));
        const badgeH = Math.max(22, Math.min(28, box.height * 0.35));
        const badgeX = box.x + box.width / 2 - badgeW / 2;
        const badgeY = box.y + box.height / 2 - badgeH / 2;

        const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bgRect.setAttribute("x", String(badgeX));
        bgRect.setAttribute("y", String(badgeY));
        bgRect.setAttribute("width", String(badgeW));
        bgRect.setAttribute("height", String(badgeH));
        bgRect.setAttribute("rx", "6");
        bgRect.setAttribute("fill", "#ffffff");
        bgRect.setAttribute("stroke", isSelected ? "#0f172a" : color);
        bgRect.setAttribute("stroke-width", isSelected ? "3" : "2.5");
        bgRect.setAttribute("opacity", isVisible ? "0.98" : "0.35");
        bgRect.setAttribute("filter", "url(#badgeGlow)");
        labelLayer.appendChild(bgRect);

        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        text.setAttribute("x", String(box.x + box.width / 2));
        text.setAttribute("y", String(box.y + box.height / 2 + fontSize * 0.35));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute(
          "font-family",
          "ui-monospace, SFMono-Regular, Menlo, monospace"
        );
        text.setAttribute("font-size", String(fontSize));
        text.setAttribute("font-weight", "900");
        text.setAttribute("fill", "#000000");
        text.setAttribute("opacity", isVisible ? "1" : "0.4");
        text.textContent = label;
        labelLayer.appendChild(text);
      } catch {
        return;
      }
    });
  }, [
    rowsByZone,
    selectedZone,
  ]);

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    let element = event.target as Element | null;

    while (element && element !== event.currentTarget) {
      const zone = element.id?.toUpperCase();

      if (zone && (rowsByZone.has(zone) || mapZoneIds.has(zone))) {
        setSelectedZone(zone);
        setSelectedVehicleId(null);
        setIsDetailPinned(true);
        return;
      }

      element = element.parentElement;
    }

    setSelectedZone(null);
    setSelectedVehicleId(null);
    setIsDetailPinned(false);
  };

  const hideVehicleDetails = () => {
    if (isDetailPinned) return;

    setSelectedZone(null);
    setSelectedVehicleId(null);
  };

  const resetFilters = () => {
    if (activeTab === "en_cours") {
      setActiveFilter("En cours");
    } else if (role === "chef_equipe") {
      setActiveFilter("Attente Réparation");
    } else {
      setActiveFilter("Tous");
    }
    setDateFilter(ALL_DATES);
    setSelectedZone(null);
    setSelectedVehicleId(null);
    setIsDetailPinned(false);
    setSearch("");
  };

  return (
    <div className="pbix-monitor">
      <header className="monitor-topbar">
        <div className="monitor-brand">
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer flex items-center justify-center border border-slate-200/80 shadow-2xs mr-1 shrink-0"
            title={isSidebarOpen ? "Fermer le menu latéral" : "Ouvrir le menu latéral"}
            aria-label={isSidebarOpen ? "Fermer le menu latéral" : "Ouvrir le menu latéral"}
          >
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <div className="brand-badge" aria-hidden="true">
            <Car size={18} />
          </div>

          <div>
            <p className="monitor-kicker">ITALCAR</p>
            <h1>Flux Atelier</h1>
          </div>
        </div>

        <div className="monitor-actions">
          {currentUser && (
            <div className="monitor-user-summary flex items-center gap-2.5 px-3 py-1.5 bg-white/95 border border-slate-200/80 rounded-xl text-xs shadow-2xs">
              <div className="w-5 h-5 rounded-full bg-slate-900 text-white font-black text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="font-bold text-slate-800 hidden sm:inline"
                  title={currentUser.name}
                >
                  {currentUser.name}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleInfo.badgeBg}`}
                >
                  {roleInfo.badgeText}
                </span>
                {role === "chef_equipe" && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                    {activeChefEquipeTeam}
                  </span>
                )}
              </div>
            </div>
          )}

          {(activeTab === "chargement" || activeTab === "en_cours" || activeTab === "plan_atelier") && (
            <>
              {activeTab === "chargement" && role !== "chef_equipe" && (
                <button
                  aria-pressed={showStatusDashboard}
                  className={`monitor-button ${showStatusDashboard ? "monitor-button-active" : ""
                    }`}
                  onClick={() =>
                    setShowStatusDashboard((current) => !current)
                  }
                  type="button"
                >
                  <CircleGauge size={14} />
                  Dashboard
                </button>
              )}

              <button
                className={`monitor-button monitor-button-accent monitor-refresh-button ${(role === "administration" || role === "chef_atelier") && activeTab === "chargement"
                    ? "!bg-amber-600 hover:!bg-amber-700 !text-white !font-bold shadow-xs"
                    : ""
                  }`}
                disabled={databaseStatus === "loading" || isInstantSyncing}
                onClick={() => {
                  if ((role === "administration" || role === "chef_atelier") && activeTab === "chargement") {
                    void handleInstantSync();
                  } else {
                    void loadVehicles();
                  }
                }}
                type="button"
                title="Actualiser à l'instant tout le tableau de chargement"
              >
                <RefreshCw size={14} className={isInstantSyncing || databaseStatus === "loading" ? "animate-spin" : ""} />
                <span className="monitor-refresh-label">
                  {(role === "administration" || role === "chef_atelier") && activeTab === "chargement"
                    ? (isInstantSyncing ? "Actualisation..." : "Actualiser à l'instant")
                    : "Actualiser"}
                </span>
              </button>

              <button
                className="monitor-button monitor-reset-button"
                onClick={resetFilters}
                type="button"
              >
                <RotateCcw size={14} />
                Réinitialiser
              </button>
            </>
          )}

          <button
            type="button"
            onClick={logout}
            className="monitor-button hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            title="Se déconnecter de l'atelier"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* Floating button when sidebar is closed */}
      {!isSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="fixed left-3 top-[66px] z-40 px-3 py-2 rounded-xl bg-white/95 backdrop-blur-md text-slate-800 hover:text-amber-600 hover:bg-amber-50/90 border border-slate-200 shadow-md transition-all cursor-pointer flex items-center gap-2 group text-xs font-bold"
          title="Ouvrir le menu latéral"
        >
          <PanelLeftOpen size={17} className="text-amber-600" />
          <span className="text-[11px] font-bold text-slate-700">Menu</span>
        </button>
      )}

      {/* Backdrop sombre sur mobile quand le menu latéral est ouvert */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 top-[56px] bg-slate-900/60 backdrop-blur-xs z-35 md:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="dashboard-layout">
        {/* Collapsible Sidebar */}
        <aside
          className={`dashboard-sidebar ${isSidebarOpen
              ? "w-64 min-w-[16rem]"
              : "w-0 min-w-0 opacity-0 overflow-hidden border-r-0 pointer-events-none"
            }`}
          aria-label="Navigation latérale"
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Menu Atelier
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
              title="Fermer le menu latéral"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav
            onClickCapture={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) {
                setIsSidebarOpen(false);
              }
            }}
            className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto"
          >
            {/* ══════════════════════════════════════════════════════ */}
            {/* Suivi des Entrées & Avancement Atelier — EN TÊTE DE MENU */}
            {/* ══════════════════════════════════════════════════════ */}
            {(permissions.canViewAll || role === "reception" || role === "garantie" || role === "chef_atelier" || role === "administration" || permissions.canAddEntree) && (
              <button
                type="button"
                onClick={() => setActiveTab("suivi_entrees")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "suivi_entrees"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-emerald-700 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardList size={16} className={activeTab === "suivi_entrees" ? "text-white" : "text-emerald-600"} />
                  <div>
                    <div className="leading-tight">Suivi des Entrées</div>
                    <div className={`text-[10px] font-medium ${activeTab === "suivi_entrees" ? "text-emerald-100" : "text-slate-400"}`}>
                      Avancement Atelier
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "suivi_entrees"
                    ? "bg-white/25 text-white"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}>
                  {role === "garantie" ? (currentUser?.assignedTeam || "R10") : "Réception"}
                </span>
              </button>
            )}

            {(permissions.canViewAll || role === "reception" || role === "chef_equipe" || role === "chef_atelier" || role === "administration") && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("chargement");
                  if (role === "chef_equipe") {
                    setActiveFilter("Attente Réparation");
                  } else {
                    setActiveFilter("Tous");
                    setDateFilter(ALL_DATES);
                    void loadVehicles(true);
                  }
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "chargement"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Clock size={16} className={activeTab === "chargement" ? "text-white" : "text-amber-600"} />
                  <div>
                    <div className="leading-tight">Tableaux de chargement</div>
                    {role === "chef_equipe" && (
                      <div className={`text-[10px] font-medium ${activeTab === "chargement" ? "text-amber-100" : "text-slate-400"}`}>
                        Attente Réparation
                      </div>
                    )}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "chargement"
                    ? "bg-white/25 text-white"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}>
                  {role === "chef_equipe" ? attenteReparationCount : vehicles.length}
                </span>
              </button>
            )}

            {(permissions.canViewAll || role === "chef_equipe" || role === "chef_atelier" || role === "administration") && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("en_cours");
                  setActiveFilter("En cours");
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "en_cours"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Wrench size={16} className={activeTab === "en_cours" ? "text-white" : "text-blue-600"} />
                  <div>
                    <div className="leading-tight">Interventions En cours</div>
                    <div className={`text-[10px] font-medium ${activeTab === "en_cours" ? "text-blue-100" : "text-slate-400"}`}>
                      En cours de travaux
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "en_cours"
                    ? "bg-white/25 text-white"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}>
                  {enCoursCount}
                </span>
              </button>
            )}

            {permissions.canViewEssai && (
              <button
                type="button"
                onClick={() => setActiveTab("essai")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "essai"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Gauge size={16} className={activeTab === "essai" ? "text-white" : "text-indigo-600"} />
                  <div>
                    <div className="leading-tight">Page Essai</div>
                    <div className={`text-[10px] font-medium ${activeTab === "essai" ? "text-indigo-100" : "text-slate-400"}`}>
                      Contrôle & essai routier
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "essai"
                    ? "bg-white/25 text-white"
                    : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  }`}>
                  {essaiCount}
                </span>
              </button>
            )}

            {permissions.canViewAttenteAchat && (
              <button
                type="button"
                onClick={() => setActiveTab("attente_achat")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "attente_achat"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingCart size={16} className={activeTab === "attente_achat" ? "text-white" : "text-amber-600"} />
                  <div>
                    <div className="leading-tight">Page Acheter</div>
                    <div className={`text-[10px] font-medium ${activeTab === "attente_achat" ? "text-amber-100" : "text-slate-400"}`}>
                      Attente pièces / achat
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "attente_achat"
                    ? "bg-white/25 text-white"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>
                  {attenteAchatCount}
                </span>
              </button>
            )}

            {permissions.canViewDevis && (
              <button
                type="button"
                onClick={() => setActiveTab("devis")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "devis"
                    ? "bg-orange-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileSignature size={16} className={activeTab === "devis" ? "text-white" : "text-orange-600"} />
                  <div>
                    <div className="leading-tight">Page Devis</div>
                    <div className={`text-[10px] font-medium ${activeTab === "devis" ? "text-orange-100" : "text-slate-400"}`}>
                      Attente devis (N° DV)
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {(devisAAppelerCount > 0 || devisRelanceCount > 0) && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white animate-pulse"
                      title={`${devisAAppelerCount} à appeler, ${devisRelanceCount} relance(s)`}
                    >
                      {devisAAppelerCount + devisRelanceCount} !
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "devis"
                      ? "bg-white/25 text-white"
                      : "bg-orange-50 text-orange-700 border border-orange-200"
                    }`}>
                    {devisCount}
                  </span>
                </div>
              </button>
            )}

            {permissions.canViewMap && (
              <button
                type="button"
                onClick={() => setActiveTab("plan_atelier")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "plan_atelier"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-amber-700 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <MapPin size={16} className={activeTab === "plan_atelier" ? "text-white" : "text-amber-600"} />
                  <div>
                    <div className="leading-tight">Plan d'Atelier</div>
                    <div className={`text-[10px] font-medium ${activeTab === "plan_atelier" ? "text-amber-100" : "text-slate-400"}`}>
                      Synoptique interactif
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "plan_atelier"
                    ? "bg-white/25 text-white"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                  }`}>
                  Synoptique
                </span>
              </button>
            )}


            {permissions.canViewSuiviTemps && (
              <button
                type="button"
                onClick={() => setActiveTab("suivi_temps")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "suivi_temps"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-indigo-700 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Timer size={16} className={activeTab === "suivi_temps" ? "text-white" : "text-indigo-600"} />
                  <div>
                    <div className="leading-tight">Chronométrie & Calcul des Temps</div>
                    <div className={`text-[10px] font-medium ${activeTab === "suivi_temps" ? "text-indigo-100" : "text-slate-400"}`}>
                      Administration & Chef d'Atelier
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "suivi_temps"
                    ? "bg-white/25 text-white"
                    : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  }`}>
                  Chrono
                </span>
              </button>
            )}

            {(role === "chef_atelier" || role === "administration") && (
              <button
                type="button"
                onClick={() => setActiveTab("gestion_acces")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "gestion_acces"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-purple-700 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Shield size={16} className={activeTab === "gestion_acces" ? "text-white" : "text-purple-600"} />
                  <div>
                    <div className="leading-tight">Gestion des Accès</div>
                    <div className={`text-[10px] font-medium ${activeTab === "gestion_acces" ? "text-purple-100" : "text-slate-400"}`}>
                      Comptes & rôles
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "gestion_acces"
                    ? "bg-white/25 text-white"
                    : "bg-purple-50 text-purple-700 border border-purple-200"
                  }`}>
                  Admin
                </span>
              </button>
            )}

            {(role === "administration" || role === "chef_atelier" || permissions.canManageEquipes) && (
              <button
                type="button"
                onClick={() => setActiveTab("gestion_equipes")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "gestion_equipes"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-rose-700 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users size={16} className={activeTab === "gestion_equipes" ? "text-white" : "text-rose-600"} />
                  <div>
                    <div className="leading-tight">Tableaux ÉQUIPE</div>
                    <div className={`text-[10px] font-medium ${activeTab === "gestion_equipes" ? "text-rose-100" : "text-slate-400"}`}>
                      Membres atelier
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "gestion_equipes"
                    ? "bg-white/25 text-white"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}>
                  {role === "administration" || role === "chef_atelier" ? "Admin" : "Équipe"}
                </span>
              </button>
            )}

            {(role === "administration" || role === "chef_atelier") && (
              <button
                type="button"
                onClick={() => setActiveTab("moyennes")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "moyennes"
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-teal-700 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <BarChart3 size={16} className={activeTab === "moyennes" ? "text-white" : "text-teal-600"} />
                  <div>
                    <div className="leading-tight">Page Moyennes</div>
                    <div className={`text-[10px] font-medium ${activeTab === "moyennes" ? "text-teal-100" : "text-slate-400"}`}>
                      Par équipe & modèle
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "moyennes"
                    ? "bg-white/25 text-white"
                    : "bg-teal-50 text-teal-700 border border-teal-200"
                  }`}>
                  KPI
                </span>
              </button>
            )}

            {(role === "administration" || role === "chef_atelier") && (
              <button
                type="button"
                onClick={() => setActiveTab("vehicle_inventory")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "vehicle_inventory"
                    ? "bg-cyan-700 text-white shadow-sm"
                    : "text-slate-600 hover:text-cyan-800 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Database size={16} className={activeTab === "vehicle_inventory" ? "text-white" : "text-cyan-700"} />
                  <div>
                    <div className="leading-tight">Parc véhicules & engins</div>
                    <div className={`text-[10px] font-medium ${activeTab === "vehicle_inventory" ? "text-cyan-100" : "text-slate-400"}`}>
                      Inventaire Excel enregistré
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "vehicle_inventory"
                    ? "bg-white/25 text-white"
                    : "bg-cyan-50 text-cyan-800 border border-cyan-200"
                  }`}>
                  SQL
                </span>
              </button>
            )}

            {permissions.canViewFacturation && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab("facturation")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "facturation"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-amber-700 hover:bg-slate-100/90"
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Receipt size={16} className={activeTab === "facturation" ? "text-white" : "text-amber-600"} />
                    <div>
                      <div className="leading-tight">Facturation & Caisse</div>
                      <div className={`text-[10px] font-medium ${activeTab === "facturation" ? "text-amber-100" : "text-slate-400"}`}>
                        En attente paiement
                      </div>
                    </div>
                  </div>
                  {facturationPendingCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 bg-red-500 text-white animate-pulse">
                      {facturationPendingCount}
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "facturation"
                        ? "bg-white/25 text-white"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}>
                      Caisse
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("att_facture")}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "att_facture"
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-orange-700 hover:bg-slate-100/90"
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText size={16} className={activeTab === "att_facture" ? "text-white" : "text-orange-600"} />
                    <div>
                      <div className="leading-tight">Page Att Facture</div>
                      <div className={`text-[10px] font-medium ${activeTab === "att_facture" ? "text-orange-100" : "text-slate-400"}`}>
                        Dossiers à facturer
                      </div>
                    </div>
                  </div>
                  {facturationAFacturerCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 bg-orange-500 text-white animate-pulse">
                      {facturationAFacturerCount}
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "att_facture"
                        ? "bg-white/25 text-white"
                        : "bg-orange-50 text-orange-700 border border-orange-200"
                      }`}>
                      Att Fact
                    </span>
                  )}
                </button>
              </>
            )}

            {permissions.canViewGarantie && (
              <button
                type="button"
                onClick={() => setActiveTab("garantie")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${activeTab === "garantie"
                    ? "bg-purple-700 text-white shadow-sm"
                    : "text-slate-600 hover:text-purple-800 hover:bg-slate-100/90"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Award size={16} className={activeTab === "garantie" ? "text-white" : "text-purple-700"} />
                  <div>
                    <div className="leading-tight">Tableau Garantie</div>
                    <div className={`text-[10px] font-medium ${activeTab === "garantie" ? "text-purple-100" : "text-slate-400"}`}>
                      Centre R10 & Accords
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${activeTab === "garantie"
                    ? "bg-white/25 text-white"
                    : "bg-purple-50 text-purple-700 border border-purple-200"
                  }`}>
                  R10
                </span>
              </button>
            )}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-slate-200/80 bg-slate-50/50">
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[10px] font-bold text-slate-600 truncate">
                {roleInfo.title} {activeChefEquipeTeam ? `(${activeChefEquipeTeam})` : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Fermer le menu</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="dashboard-content-area">
          {/* Notifications : Nouvelles Entrées, Devis Réception, Relances & Devis Accepté par le client */}
          {USER_NOTIFICATIONS_ENABLED && (activeNouvelleEntreeNotificationsForUser.length > 0 ||
            activeDevisAppelerNotifications.length > 0 ||
            activeDevisRelanceNotifications.length > 0 ||
            activeDevisAccordNotificationsForUser.length > 0 ||
            activeReceptionReadyVehicles.length > 0 ||
            (permissions.canViewFacturation && activeFacturationPendingNotifications.length > 0)) && (
            <div className="p-3 sm:p-4 space-y-2.5 bg-gradient-to-r from-blue-50/95 via-emerald-50/90 to-amber-50/90 border-b border-blue-200 shadow-2xs animate-in slide-in-from-top-1 duration-200">
              {/* Notification 0 : Nouvelle Entrée Réception assignée à l'équipe => Accepter ou Mettre en attente */}
              {activeNouvelleEntreeNotificationsForUser.map((item) => {
                const matchingVehicle = vehicles.find(
                  (v) =>
                    (item.noOr && (v.no === item.noOr || v.ordre === item.noOr)) ||
                    (!item.noOr && item.chassis && v.chassis === item.chassis)
                );
                return (
                  <div
                    key={`entree-banner-${item.id}`}
                    className="p-3.5 bg-white/95 rounded-2xl border-2 border-blue-500 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 animate-in fade-in duration-200"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Car size={20} className="animate-pulse" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-2xs">
                            Nouvelle Entrée Atelier
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-100 text-blue-900 border border-blue-300">
                            Équipe : {item.equipe}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            Tableaux de chargement (Attente Réparation)
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            Enregistré le {item.dateEntreeHeure}
                          </span>
                        </div>

                        <div className="text-xs text-slate-800 font-semibold flex items-center gap-2 flex-wrap">
                          <span>N° OR : <strong className="font-mono text-slate-950 font-black">{item.noOr}</strong></span>
                          <span>•</span>
                          <span>Châssis (VIN) : <strong className="font-mono text-slate-700">{item.chassis}</strong></span>
                          <span>•</span>
                          <span>Immat : <strong className="font-mono text-blue-900">{item.immatriculation || "-"}</strong></span>
                          <span>•</span>
                          <span>Véhicule : <strong className="text-slate-900">{item.marque} {item.modele}</strong></span>
                          <span>•</span>
                          <span>Client : <strong className="text-slate-900">{item.nomClient}</strong></span>
                        </div>

                        <p className="text-[11px] text-slate-600">
                          Véhicule transmis à l'équipe <strong>{item.equipe}</strong>. Acceptez pour affecter immédiatement un technicien libre, ou mettez-le en attente.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end lg:self-center flex-wrap">
                      <button
                        type="button"
                        onClick={() => void handleAccepterNouvelleEntree(item, matchingVehicle)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-2xs transition-all cursor-pointer"
                        title="Accepter l'entrée et affecter un technicien"
                      >
                        <CheckCircle2 size={14} />
                        <span>Accepter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMettreEnAttenteEntree(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 active:scale-95 rounded-xl shadow-2xs transition-all cursor-pointer"
                        title="Mettre en attente dans Tableaux de chargement (Attente Réparation)"
                      >
                        <Clock size={14} />
                        <span>Mettre en attente</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedEntreeNotifIds((prev) => new Set([...prev, item.id]))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Masquer cette alerte"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Notification 1 : Nouveau devis créé => Appeler le client */}
              {activeDevisAppelerNotifications.map((item) => {
                const notifId = `appeler-${item.vehicle.id}`;
                return (
                  <div
                    key={notifId}
                    className="p-3 bg-white/95 rounded-xl border border-orange-300/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0 border border-orange-300">
                        <PhoneCall size={16} className="animate-pulse" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-orange-500 text-white tracking-wide">
                            Nouveau Devis Créé
                          </span>
                          <span className="font-mono font-bold text-xs text-orange-950">
                            N° DV : {item.devis.numeroDevis}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            • Créé par équipe <strong className="text-slate-700">{item.devis.equipeOrigine || item.vehicle.equipe || "-"}</strong>
                          </span>
                        </div>
                        <div className="text-xs text-slate-800 font-semibold flex items-center gap-2 flex-wrap">
                          <span>OR : <strong className="font-mono text-slate-900">{item.vehicle.no || item.vehicle.ordre}</strong></span>
                          <span>•</span>
                          <span>Immat : <strong>{item.vehicle.immatriculation || item.vehicle.serie || "-"}</strong> ({item.vehicle.modele || "-"})</span>
                          <span>•</span>
                          <span>Client : <strong className="text-slate-900">{item.vehicle.client || "-"}</strong></span>
                        </div>
                        {item.devis.pieces && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-900 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200/80 w-fit mt-1">
                            <Wrench size={13} className="text-amber-700 shrink-0" />
                            <span>Pièces identifiées à remplacer : <strong>{item.devis.pieces}</strong></span>
                          </div>
                        )}
                        {item.devis.commentaire && !item.devis.pieces && (
                          <p className="text-[11px] text-slate-500 truncate max-w-xl">
                            Note : {item.devis.commentaire}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => handleAppelerClientFromNotif(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Indiquer que la réception a appelé le client pour présenter le devis"
                      >
                        <PhoneCall size={13} />
                        <span>Appel fait</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("devis")}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-orange-800 bg-orange-100 hover:bg-orange-200 border border-orange-300 rounded-lg transition-colors cursor-pointer"
                        title="Consulter ce dossier dans la Page Devis"
                      >
                        <FileSignature size={13} />
                        <span>Page Devis</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissDevisNotif(notifId)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Masquer cette alerte"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Notification 2 : Relance client requise (> 24h sans réponse) */}
              {activeDevisRelanceNotifications.map((item) => {
                const notifId = `relance-${item.vehicle.id}`;
                return (
                  <div
                    key={notifId}
                    className="p-3 bg-white/95 rounded-xl border border-rose-300 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in slide-in-from-top-1"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-300">
                        <AlertTriangle size={16} className="animate-bounce" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-600 text-white tracking-wide">
                            ⚠️ Relance Client Requise (&gt; 24h sans réponse)
                          </span>
                          <span className="font-mono font-bold text-xs text-rose-950">
                            N° DV : {item.devis.numeroDevis}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            • Véhicule : {item.vehicle.no || item.vehicle.ordre} ({item.vehicle.immatriculation || item.vehicle.serie || "-"})
                          </span>
                        </div>
                        <div className="text-xs text-slate-800 font-semibold">
                          Client : <strong className="text-slate-900">{item.vehicle.client || "-"}</strong> — Devis sans réponse depuis plus de 24h.
                        </div>
                        {item.devis.pieces && (
                          <div className="flex items-center gap-1.5 text-xs text-rose-900 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/70 w-fit">
                            <Wrench size={12} className="text-rose-700 shrink-0" />
                            <span>Pièces : <strong>{item.devis.pieces}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleRelancerClientFromNotif(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Enregistrer que le client a été relancé"
                      >
                        <PhoneCall size={12} />
                        <span>Relance faite</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAccepterDevisFromNotif(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Le client a accepté le devis : retour automatique à l'équipe en atelier"
                      >
                        <CheckCircle2 size={12} />
                        <span>Accepter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRefuserDevisFromNotif(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Le client refuse le devis : marquer comme annulé et passer en Terminer"
                      >
                        <XCircle size={12} />
                        <span>Refuser (Annulé)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissDevisNotif(notifId)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Masquer cette alerte"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Notification 3 : Devis Client Accepté => Pour Chef d'Équipe de l'équipe d'origine (et Chef d'Atelier / Admin) */}
              {activeDevisAccordNotificationsForUser.map((item) => {
                const matchingVehicle = vehicles.find(
                  (v) =>
                    (item.vehicleId && v.id === item.vehicleId) ||
                    (item.or && (v.no === item.or || v.ordre === item.or)) ||
                    (!item.or && !item.vehicleId && item.chassis && v.chassis === item.chassis)
                );
                return (
                  <div
                    key={`banner-${item.id}`}
                    className="p-3.5 bg-white/95 rounded-xl border-2 border-emerald-500 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in fade-in duration-200"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <CheckCircle2 size={18} className="animate-pulse" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide">
                            Devis Accepté par le Client
                          </span>
                          <span className="font-mono font-bold text-xs text-emerald-950">
                            N° DV : {item.numeroDevis}
                          </span>
                          <span className="text-[11px] text-slate-600">
                            • Retourné à l'équipe <strong className="text-emerald-700 font-bold">{item.equipeCible}</strong>
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                            Tableaux de chargement (Attente réparation)
                          </span>
                          {(item.nomTechnicien || item.technicien || matchingVehicle?.nomTechnicien || matchingVehicle?.technicien) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100/80 text-emerald-900 border border-emerald-300 text-[11px] font-bold">
                              <Wrench size={11} className="text-emerald-700" />
                              <span>
                                Tech : {item.nomTechnicien || matchingVehicle?.nomTechnicien || item.technicien || matchingVehicle?.technicien}
                                {(item.technicien || matchingVehicle?.technicien) ? ` (${item.technicien || matchingVehicle?.technicien})` : ""}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-800 font-semibold flex items-center gap-2 flex-wrap">
                          <span>OR : <strong className="font-mono text-slate-900">{item.or}</strong></span>
                          <span>•</span>
                          <span>Châssis : <strong className="font-mono text-slate-700">{item.chassis}</strong></span>
                          <span>•</span>
                          <span>Véhicule : <strong>{item.marque} {item.modele}</strong> ({item.immatriculation || "-"})</span>
                          <span>•</span>
                          <span>Client : <strong className="text-slate-900">{item.client}</strong></span>
                        </div>
                        <p className="text-[11px] text-emerald-800 font-medium">
                          Accord client confirmé le {item.dateAccord}. Le véhicule est de retour dans votre équipe ({item.equipeCible}) assigné au même technicien dans Tableaux de chargement (Attente réparation).
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleVoirDansChargement(item, matchingVehicle)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 active:scale-95 rounded-lg shadow-sm transition-all cursor-pointer"
                        title="Consulter le véhicule dans Tableaux de chargement (Attente Réparation)"
                      >
                        <ClipboardList size={13} />
                        <span>Voir dans Tableaux de chargement</span>
                      </button>
                      {matchingVehicle && (permissions.canEditEtat || permissions.canEditChargement) && (
                        <button
                          type="button"
                          onClick={() => handlePrendreEnChargeDevisAccord(item, matchingVehicle)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer"
                          title="Affecter ou démarrer l'intervention"
                        >
                          <UserCheck size={13} />
                          <span>Accepter le véhicule</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleMettreEnAttenteDevisAccord(item, matchingVehicle)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer"
                        title="Conserver le véhicule dans Attente Réparation et fermer la notification"
                      >
                        <Clock size={13} />
                        <span>Mettre en attente</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVoirDansChargement(item, matchingVehicle)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Voir dans Tableaux de chargement sans supprimer la notification"
                      >
                        <ClipboardList size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Notification 4 : Réception - Véhicules Terminer -> Attente client (clients à contacter pour livraison) */}
              {activeReceptionReadyVehicles.map((v) => (
                <div
                  key={`ready-banner-${v.id}`}
                  className="p-3.5 bg-white/95 rounded-xl border-2 border-emerald-500 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in fade-in duration-200"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <PhoneCall size={18} className="animate-pulse" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide">
                          Prêt pour Livraison / Contacter Client
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          {v.etatIntervention || "Attente Client"}
                        </span>
                        {v.emplacement && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                            Emplacement : {v.emplacement}
                          </span>
                        )}
                        {v.dateFinRep && (
                          <span className="text-[11px] text-slate-500 font-medium">
                            Terminé le : {v.dateFinRep}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-800 font-semibold flex items-center gap-2 flex-wrap">
                        <span>OR : <strong className="font-mono text-slate-900">{v.no || v.ordre}</strong></span>
                        <span>•</span>
                        <span>Client : <strong className="text-slate-900">{v.client || "-"}</strong></span>
                        <span>•</span>
                        <span>Véhicule : <strong>{v.marque} {v.modele}</strong> ({v.serie || v.immatriculation || "-"})</span>
                        {v.nomTechnicien && v.nomTechnicien !== "-" && (
                          <>
                            <span>•</span>
                            <span>Réparé par : <strong className="text-slate-700">{v.nomTechnicien}</strong></span>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Intervention terminée par l'atelier. Informer le client <strong>{v.client || ""}</strong> que son véhicule est prêt pour restitution.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                    <button
                      type="button"
                      onClick={async () => {
                        const mode = v.modePaiement || "Facture";
                        try {
                          await livrerVehiculeReception(
                            {
                              noOr: v.no || v.ordre || "",
                              cs: v.cs,
                              chassis: v.chassis,
                              chargementRowNumber: v.sheetRowNumber,
                              sheetRowNumber: v.sheetRowNumber,
                            },
                            mode
                          );
                          setWriteNotice(`Véhicule ${v.serie || v.no} marqué comme Livré au client.`);
                          void loadVehicles(true);
                        } catch (err) {
                          setWriteError(err instanceof Error ? err.message : "Erreur lors de la livraison.");
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 rounded-lg shadow-xs transition-all cursor-pointer"
                      title="Valider la restitution et passer le véhicule à Livré"
                    >
                      <CheckCircle2 size={13} />
                      <span>Livrer au client</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVehicleId(v.id);
                        setActiveTab("chargement");
                        setActiveFilter("Attente Client");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg border border-slate-300 transition-all cursor-pointer"
                      title="Consulter le véhicule en Attente Client"
                    >
                      <CheckCircle2 size={13} />
                      <span>Voir Attente Client</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedReadyNotifIds((prev) => new Set([...prev, v.id]))}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Masquer cette notification"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Notification 5 : Facturation - Fin des travaux technicien => Donner le mode de paiement (Facture, Bon de commande, Édition fin de travaux) */}
              {permissions.canViewFacturation && activeFacturationPendingNotifications.map((item) => (
                <div
                  key={`facturation-banner-${item.id}`}
                  className="p-3.5 bg-white/95 rounded-xl border-2 border-amber-500 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in fade-in duration-200"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Receipt size={18} className="animate-pulse" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-600 text-white tracking-wide">
                          Travaux Terminés • Mode de Paiement Requis
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          Équipe : {item.equipe}
                        </span>
                        {item.dateFinTravaux && (
                          <span className="text-[11px] text-slate-500 font-medium">
                            Fin travaux : {item.dateFinTravaux}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-800 font-semibold flex items-center gap-2 flex-wrap">
                        <span>OR : <strong className="font-mono text-slate-900">{item.or}</strong></span>
                        <span>•</span>
                        <span>Client : <strong className="text-slate-900">{item.client}</strong></span>
                        <span>•</span>
                        <span>Véhicule : <strong>{item.marque || ""} {item.modele || ""}</strong> ({item.immatriculation || "-"})</span>
                        {item.nomTechnicien && item.nomTechnicien !== "-" && (
                          <>
                            <span>•</span>
                            <span>Technicien : <strong className="text-slate-700">{item.nomTechnicien}</strong></span>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Le technicien a terminé le travail. Veuillez sélectionner le mode de paiement (Facture, Bon de commande, ou Édition fin de travaux) pour libérer la livraison au client.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActiveTab("facturation")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer"
                      title="Ouvrir la page Facturation pour traiter ce dossier"
                    >
                      <Receipt size={13} />
                      <span>Traiter Facturation</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedFacturationNotifIds((prev) => new Set([...prev, item.id]))}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Masquer cette notification"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "suivi_temps" ? (
            permissions.canViewSuiviTemps ? (
              <SuiviTempsView userTeam={role === "chef_equipe" ? activeChefEquipeTeam : undefined} />
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl m-4 sm:m-6 border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Accès Restreint</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  La page Suivi des Voitures & Calcul des Temps Atelier est exclusivement réservée à l'Administration et à la Direction Atelier.
                </p>
              </div>
            )
          ) : activeTab === "suivi_entrees" ? (
            <SuiviEntreesTable
              initialNotice={receptionNotice}
              onNavigateToMap={(emp) => {
                const targetZone = normalizeEmplacementCode(emp);
                setActiveTab("plan_atelier");
                setSelectedZone(targetZone);
                setIsDetailPinned(true);
              }}
            />
          ) : activeTab === "vehicle_inventory" ? (
            role === "administration" || role === "chef_atelier" ? (
              <VehicleInventoryView />
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl m-4 sm:m-6 border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Accès Restreint</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  La consultation du Parc véhicules & engins est réservée à l'Administration et au Chef d'Atelier.
                </p>
              </div>
            )
          ) : activeTab === "facturation" || activeTab === "att_facture" ? (
            permissions.canViewFacturation ? (
              <FacturationView
                vehicles={vehicles}
                onRefresh={() => void loadVehicles()}
                initialSubTab={activeTab === "att_facture" ? "edition_fin_travaux" : "en_attente"}
                onNavigateToReception={(noticeMsg) => {
                  if (noticeMsg) setReceptionNotice(noticeMsg);
                  setActiveTab("suivi_entrees");
                }}
                onSelectVehicle={(v: Flux) => {
                  setSelectedVehicleId(v.id);
                  setVehiculeModalData(v);
                }}
              />
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl m-4 sm:m-6 border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Accès Restreint</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  La page Facturation & Caisse est réservée au service Facturation, à l'Administration et au Chef d'Atelier.
                </p>
              </div>
            )
          ) : activeTab === "gestion_acces" ? (
            <GestionAccesView />
          ) : activeTab === "gestion_equipes" ? (
            <GestionEquipesView />
          ) : activeTab === "moyennes" ? (
            <MoyennesView vehicles={vehicles} />
          ) : activeTab === "essai" ? (
            permissions.canViewEssai ? (
              <EssaiView
                vehicles={workshopVehicles}
                onUpdateAvancement={saveVehicleAvancement}
                onValidateEssai={handleValidateEssai}
                onSelectVehicle={(v) => {
                  setSelectedVehicleId(v.id);
                  setVehiculeModalData(v);
                }}
                savingVehicleId={savingVehicleId}
                canEdit={permissions.canEditEtat || permissions.canEditAvancement}
                role={role}
                userTeam={role === "chef_equipe" ? activeChefEquipeTeam : undefined}
                isChefEquipe={role === "chef_equipe"}
                onRefresh={() => void loadVehicles()}
                isRefreshing={databaseStatus === "loading" || isInstantSyncing}
              />
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl m-4 sm:m-6 border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Accès Restreint</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  La page Véhicules en Essai & Contrôle est réservée à l'Administration et aux Chefs d'équipe.
                </p>
              </div>
            )
          ) : activeTab === "attente_achat" ? (
            permissions.canViewAttenteAchat ? (
              <AcheterView
                vehicles={workshopVehicles}
                onUpdateAvancement={saveVehicleAvancement}
                onSelectVehicle={(v) => {
                  setSelectedVehicleId(v.id);
                  setVehiculeModalData(v);
                }}
                savingVehicleId={savingVehicleId}
                canEdit={permissions.canEditEtat || permissions.canEditAvancement}
                userTeam={role === "chef_equipe" ? activeChefEquipeTeam : undefined}
                isChefEquipe={role === "chef_equipe"}
                onMarquerLivrer={handleMarquerAchatLivrer}
                onMarquerAttente={handleMarquerAchatAttente}
                onRefresh={() => void loadVehicles()}
                isRefreshing={databaseStatus === "loading" || isInstantSyncing}
              />
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl m-4 sm:m-6 border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Accès Restreint</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  La page Véhicules en Attente Achat (Pièces / Devis) est réservée à l'Administration.
                </p>
              </div>
            )
          ) : activeTab === "devis" ? (
            permissions.canViewDevis ? (
              <DevisView
                vehicles={workshopVehicles}
                onUpdateAvancement={saveVehicleAvancement}
                onSelectVehicle={(v) => {
                  setSelectedVehicleId(v.id);
                  setVehiculeModalData(v);
                }}
                savingVehicleId={savingVehicleId}
                canEdit={permissions.canEditEtat || permissions.canEditAvancement || role === "reception"}
                userTeam={role === "chef_equipe" ? activeChefEquipeTeam : undefined}
                isChefEquipe={role === "chef_equipe"}
                role={role}
                currentUser={currentUser}
                userCs={assignedReceptionCs}
                onRefresh={() => void loadVehicles()}
                isRefreshing={databaseStatus === "loading" || isInstantSyncing}
                onNavigateToTab={(tab, filter, vehicleId) => {
                  setActiveTab(tab as any);
                  if (filter) setActiveFilter(filter as any);
                  if (vehicleId) setSelectedVehicleId(vehicleId);
                }}
              />
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl m-4 sm:m-6 border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Accès Restreint</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  La page Devis est réservée à la Réception et à l'Administration.
                </p>
              </div>
            )
          ) : activeTab === "garantie" ? (
            permissions.canViewGarantie ? (
              <GarantieView
                vehicles={vehicles}
                currentUser={currentUser}
                onRefresh={() => void loadVehicles()}
                onSelectVehicle={(v) => {
                  setSelectedVehicleId(v.id);
                  setVehiculeModalData(v);
                }}
              />
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl m-4 sm:m-6 border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-base font-bold text-slate-800">Accès Restreint</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Le Tableau Garantie est réservé au Service Garantie (R10), à l'Administration et au Chef d'Atelier.
                </p>
              </div>
            )
          ) : activeTab === "plan_atelier" ? (
            <main className="plan-stage" ref={planStageRef}>
              <section className="map-panel" aria-label="Plan d'Atelier Mécanique">
                <div className={`map-toolbar ${isMapToolbarCollapsed ? "map-toolbar-collapsed" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setIsMapToolbarCollapsed((collapsed) => !collapsed)}
                    className="map-toolbar-close-btn"
                    title={isMapToolbarCollapsed ? "Ouvrir le panneau du plan" : "Masquer le panneau du plan"}
                    aria-label={isMapToolbarCollapsed ? "Ouvrir le panneau du plan" : "Masquer le panneau du plan"}
                  >
                    {isMapToolbarCollapsed ? "☰" : "×"}
                  </button>
                  <div className="map-toolbar-brand">
                    <p className="panel-kicker">Synoptique Atelier Mécanique</p>
                    <h2>Plan d'Atelier Haute Précision</h2>
                  </div>

                  <div className="map-toolbar-divider" />

                  {/* Légende des statuts, affichable ou masquable */}
                  {showMapLegend && <div className="map-statuses-bar">
                    {statusMeta.map((status) => {
                      const isActive = activeFilter === status.label;
                      return (
                        <button
                          key={status.label}
                          type="button"
                          onClick={() =>
                            setActiveFilter((current) =>
                              current === status.label ? "Tous" : status.label
                            )
                          }
                          className={`map-status-btn ${isActive ? "status-btn-active" : ""}`}
                          title={`Filtrer par : ${formatStatusLabel(status.label)}`}
                        >
                          <span
                            className="status-dot"
                            style={{ backgroundColor: status.color }}
                          />
                          <span>{formatStatusLabel(status.label)}</span>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={resetFilters}
                      className={`map-status-btn ${activeFilter === "Tous" && !selectedZone ? "status-btn-active" : ""}`}
                      title="Tous les emplacements / Libre"
                    >
                      <span className="status-dot" style={{ backgroundColor: "#94a3b8" }} />
                      <span>Libre</span>
                    </button>

                    <span className="map-status-btn" title="Couleur selon l'avancement : 10% à 30%">
                      <span className="status-dot" style={{ backgroundColor: "#0ea5e9" }} />10–30%
                    </span>
                    <span className="map-status-btn" title="Couleur selon l'avancement : 40% à 70%">
                      <span className="status-dot" style={{ backgroundColor: "#f59e0b" }} />40–70%
                    </span>
                    <span className="map-status-btn" title="Couleur selon l'avancement : 80% à 90%">
                      <span className="status-dot" style={{ backgroundColor: "#22c55e" }} />80–90%
                    </span>
                    <span className="map-status-btn" title="Attente PDR, technicien réaffecté ou achat">
                      <span className="status-dot" style={{ backgroundColor: "#f97316" }} />Attentes atelier
                    </span>
                    <span className="map-status-btn" title="Essai">
                      <span className="status-dot" style={{ backgroundColor: "#8b5cf6" }} />Essai
                    </span>
                    <span className="map-status-btn" title="Attente Réparation">
                      <span className="status-dot" style={{ backgroundColor: "#64748b" }} />Attente réparation
                    </span>
                  </div>}

                  {(activeFilter !== "Tous" || selectedZone) && (
                    <div className="map-chips">
                      {activeFilter !== "Tous" && (
                        <button
                          className="map-chip"
                          onClick={() => setActiveFilter("Tous")}
                          type="button"
                          title="Effacer le filtre"
                        >
                          {formatStatusFilter(activeFilter)}
                          <span aria-hidden="true">×</span>
                        </button>
                      )}

                      {selectedZone && (
                        <button
                          className="map-chip"
                          onClick={() => {
                            setSelectedZone(null);
                            setSelectedVehicleId(null);
                            setIsDetailPinned(false);
                          }}
                          type="button"
                          title="Désélectionner le poste"
                        >
                          {selectedZone}
                          <span aria-hidden="true">×</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Plein écran à droite */}
                <div className="map-controls">
                  <button
                    className="map-ctrl-btn"
                    onClick={() => setShowMapLegend((shown) => !shown)}
                    title={showMapLegend ? "Masquer la légende des états" : "Afficher la légende des états"}
                    type="button"
                  >
                    <Eye size={14} />
                    <span className="hidden sm:inline">{showMapLegend ? "Masquer légende" : "Afficher légende"}</span>
                  </button>
                  <button
                    className="map-ctrl-btn"
                    onClick={() => void toggleFullscreen()}
                    title={isFullscreen ? "Quitter le plein écran" : "Afficher en plein écran"}
                    type="button"
                  >
                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    <span className="hidden sm:inline">{isFullscreen ? "Quitter" : "Plein écran"}</span>
                  </button>
                </div>

                <div
                  className="atelier-map"
                  dangerouslySetInnerHTML={{ __html: atelierMapDisplaySvg }}
                  onClick={handleMapClick}
                  ref={mapRef}
                />
              </section>

              <aside
                className={`panel detail-panel ${(selectedVehicle || selectedZone) ? "detail-open" : ""
                  } ${isDetailPinned ? "detail-pinned" : ""}`}
                aria-label="Fiche synoptique du véhicule"
              >
                {selectedVehicle ? (
                  <>
                    <div className="panel-head">
                      <div>
                        <p className="panel-kicker">Détail Poste</p>
                        <h2>Emplacement {selectedZone}</h2>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className="detail-badge"
                          style={badgeStyle(selectedVehicle.etatIntervention)}
                        >
                          {formatStatusLabel(selectedVehicle.etatIntervention)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedZone(null);
                            setSelectedVehicleId(null);
                            setIsDetailPinned(false);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Fermer la fiche"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="serie-card">
                      <Car size={18} />
                      <span>{selectedVehicle.serie}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setVehiculeModalData(selectedVehicle)}
                      className="w-full my-2.5 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                      title="Consulter les détails techniques et la condition complète du véhicule"
                    >
                      <Eye size={14} />
                      <span>Voir détails & condition</span>
                    </button>

                    <div className="detail-grid">
                      <div>
                        <span>OR</span>
                        <strong>
                          {displayText(selectedVehicle.l2n2500 || selectedVehicle.no)}
                        </strong>
                      </div>
                      <div>
                        <span>CS</span>
                        <strong>{displayText(selectedVehicle.cs)}</strong>
                      </div>
                      <div>
                        <span>Client</span>
                        <strong>{displayText(selectedVehicle.client)}</strong>
                      </div>
                      <div>
                        <span>Date entrée</span>
                        <strong>{displayText(selectedVehicle.dateEntree)}</strong>
                      </div>
                      <div>
                        <span>Heure entrée</span>
                        <strong>{displayText(selectedVehicle.heureEntree)}</strong>
                      </div>
                      <div>
                        <span>Marque</span>
                        <strong>{displayText(selectedVehicle.marque)}</strong>
                      </div>
                      <div>
                        <span>Modèle</span>
                        <strong>
                          {displayText(selectedVehicle.modele || selectedVehicle.modelePowerBI)}
                        </strong>
                      </div>
                      <div>
                        <span>N° Chassis</span>
                        <strong>{displayText(selectedVehicle.chassis)}</strong>
                      </div>
                      <div>
                        <span>Catégorie</span>
                        <strong>{displayText(selectedVehicle.categorie)}</strong>
                      </div>
                      <div>
                        <span>N° Matricule</span>
                        <strong>{displayText(selectedVehicle.technicien)}</strong>
                      </div>
                      <div>
                        <span>NOM DE TECHNICIEN</span>
                        <strong>{displayText(selectedVehicle.nomTechnicien)}</strong>
                      </div>
                      <div>
                        <span>Equipe</span>
                        {selectedVehicle.equipe && selectedVehicle.equipe !== "-" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {selectedVehicle.equipe}
                          </span>
                        ) : (
                          <strong>-</strong>
                        )}
                      </div>
                      <div>
                        <span>Etat</span>
                        <strong>
                          {formatStatusLabel(selectedVehicle.etatIntervention)}
                        </strong>
                      </div>
                      <div>
                        <span>Emplacement</span>
                        <strong>{displayText(selectedVehicle.emplacement)}</strong>
                      </div>
                    </div>

                    {selectedRows.length > 1 && (
                      <p className="detail-note">
                        {selectedRows.length} véhicules occupent cette zone.
                      </p>
                    )}
                  </>
                ) : selectedZone ? (
                  <div className="flex flex-col gap-4 p-1">
                    <div className="panel-head">
                      <div>
                        <p className="panel-kicker text-emerald-600 font-bold">Poste Disponible</p>
                        <h2 className="text-xl font-black text-slate-900">Emplacement {selectedZone}</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Libre
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedZone(null);
                            setSelectedVehicleId(null);
                            setIsDetailPinned(false);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Fermer la fiche"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-semibold">Zone d'atelier :</span>
                        <strong className="text-slate-800">{getZoneForEmplacement(selectedZone)}</strong>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-semibold">Statut actuel :</span>
                        <span className="font-bold text-emerald-700">Aucun véhicule affecté</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      Ce poste de travail est actuellement vacant et prêt à accueillir une intervention pour l'équipe responsable.
                    </p>
                  </div>
                ) : null}
              </aside>
            </main>
          ) : (
            <>
              <main className="chargement-stage">
                {showStatusDashboard && (
                  <section className="metric-grid" aria-label="Indicateurs atelier">
                    {kpis.map((kpi) => (
                      <MetricCard
                        active={activeFilter === kpi.filter}
                        accent={kpi.accent}
                        helper={kpi.helper}
                        icon={kpi.icon}
                        key={kpi.label}
                        label={kpi.label}
                        onClick={() =>
                          setActiveFilter((current) =>
                            current === kpi.filter ? "Tous" : kpi.filter
                          )
                        }
                        value={kpi.value}
                      />
                    ))}
                  </section>
                )}

                <div className="chargement-body">
                  {showStatusDashboard && (
                    <section className="panel pie-panel" aria-label="Répartition des statuts">
                      <div className="panel-head">
                        <div>
                          <p className="panel-kicker">Répartition</p>
                          <h2>Etat intervention</h2>
                        </div>

                        <span className="panel-total">{vehicles.length} véh.</span>
                      </div>

                      <div className="pie-wrap">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              cx="50%"
                              cy="50%"
                              data={statusRows}
                              dataKey="count"
                              innerRadius={38}
                              nameKey="label"
                              outerRadius={64}
                              paddingAngle={2}
                              stroke="#fff"
                              strokeWidth={3}
                            >
                              {statusRows.map((entry) => (
                                <Cell fill={entry.color} key={entry.label} />
                              ))}
                            </Pie>

                            <Tooltip
                              contentStyle={{
                                border: "1px solid #e8e2d9",
                                borderRadius: 10,
                                boxShadow: "0 16px 42px rgba(0,0,0,.12)",
                                fontSize: 12,
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="status-stack">
                        {statusRows.map((status) => {
                          const pct = Math.round(
                            vehicles.length > 0
                              ? (status.count / vehicles.length) * 100
                              : 0
                          );

                          return (
                            <button
                              className={`status-row ${activeFilter === status.label ? "status-row-active" : ""
                                }`}
                              key={status.label}
                              onClick={() =>
                                setActiveFilter((current) =>
                                  current === status.label ? "Tous" : status.label
                                )
                              }
                              style={{ "--accent": status.color } as CSSProperties}
                              type="button"
                            >
                              <span className="status-dot" />
                              <span className="status-name">
                                {formatStatusLabel(status.label)}
                              </span>
                              <span className="status-bar">
                                <span style={{ width: `${pct}%` }} />
                              </span>
                              <span className="status-count">{status.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  <section className="panel table-panel" aria-label="Tableau détail">
                    <div className="panel-head">
                      <div>
                        <p className="panel-kicker">
                          {activeTab === "en_cours"
                            ? "Atelier Mécanique"
                            : role === "chef_equipe"
                              ? "Planning & Chargement"
                              : "Tableaux de chargement"}
                        </p>
                        <h2>
                          {activeTab === "en_cours"
                            ? "Interventions En cours"
                            : role === "chef_equipe"
                              ? "Tableaux de chargement (Attente Réparation)"
                              : "Tableaux de chargement complet (Tous les véhicules)"}
                        </h2>
                      </div>

                      <div className="table-source flex items-center gap-2">
                        {(role === "administration" || role === "chef_atelier") && activeTab === "chargement" && (
                          <button
                            type="button"
                            onClick={() => void handleInstantSync()}
                            disabled={isInstantSyncing || databaseStatus === "loading"}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-2xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Synchroniser et actualiser à l'instant tout le tableau de chargement"
                          >
                            <RefreshCw size={13} className={isInstantSyncing ? "animate-spin text-amber-700" : "text-amber-700"} />
                            {isInstantSyncing ? "Actualisation..." : "Actualiser à l'instant"}
                          </button>
                        )}
                        <span className="sheet-link">PostgreSQL</span>
                        <span
                          className={`sheet-state sheet-state-${databaseStatus}`}
                          title={databaseError}
                        >
                          {databaseStatus === "loading"
                            ? "Chargement"
                            : databaseStatus === "ready"
                              ? "Connecté"
                              : "Secours"}
                        </span>
                        <span className="panel-total">{filteredRows.length}</span>
                      </div>
                    </div>

                    {/* Bannière de notification des transferts pour Chef d'Équipe */}
                    {USER_NOTIFICATIONS_ENABLED && role === "chef_equipe" && incomingTransfers.length > 0 && (
                      <div className="mx-6 mt-4 mb-2 p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm animate-bounce shrink-0">
                            <Bell size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-black text-amber-950">
                                {incomingTransfers.length} {incomingTransfers.length > 1 ? "nouveaux travaux transférés reçus" : "nouveau travail transféré reçu"}
                              </h3>
                              <span className="px-2 py-0.5 text-[10px] font-black bg-amber-200 text-amber-900 rounded-full border border-amber-300">
                                Action requise
                              </span>
                            </div>
                            <p className="text-xs text-amber-800 mt-0.5">
                              Des véhicules ont été envoyés à votre équipe ({activeChefEquipeTeam}). Acceptez le travail pour affecter immédiatement un technicien.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {incomingTransfers.map((v) => {
                            const fromTeam = getOriginTeam(v);
                            return (
                              <div
                                key={v.id}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-amber-300 shadow-2xs"
                              >
                                <span className="text-xs font-bold text-slate-900 font-mono">
                                  {v.serie || v.no}
                                </span>
                                <span className="text-[11px] text-slate-600">
                                  (de <strong className="text-slate-800">{fromTeam}</strong>)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAcceptTransfer(v)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer"
                                  title="Accepter le travail et affecter un technicien"
                                >
                                  <UserCheck size={13} />
                                  <span>Accepter le travail</span>
                                </button>
                              </div>
                            );
                          })}

                          {allTransferredToMyTeam.some((v) => isEnCours(v.etatIntervention, v.avancement, v.technicien)) && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("en_cours");
                                setActiveFilter("En cours");
                                setEnCoursTransferOnly(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 hover:bg-amber-200 active:scale-95 text-amber-900 rounded-lg text-xs font-bold transition-all cursor-pointer border border-amber-300 shadow-2xs"
                              title="Voir les travaux transférés déjà acceptés et en cours d'intervention"
                            >
                              <ArrowRightLeft size={13} />
                              <span>Voir les transferts acceptés ({allTransferredToMyTeam.filter((v) => isEnCours(v.etatIntervention, v.avancement, v.technicien)).length})</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="table-controls">
                      <label className="search-shell">
                        <Search size={14} />
                        <input
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Rechercher OR, CS, client, chassis..."
                          type="search"
                          value={search}
                        />
                      </label>

                      <label className="state-filter date-filter">
                        <span>Date</span>
                        <select
                          aria-label="Filtrer par date d'entrée"
                          onChange={(event) => {
                            setDateFilter(event.target.value);
                            setSelectedZone(null);
                            setSelectedVehicleId(null);
                            setIsDetailPinned(false);
                          }}
                          value={dateFilter}
                        >
                          <option value={ALL_DATES}>Toutes</option>
                          {dateOptions.map((date) => (
                            <option key={date} value={date}>
                              {date}
                            </option>
                          ))}
                        </select>
                      </label>

                      {/* Sélecteur multi-équipes pour le Chef d'Équipe gérant plusieurs équipes */}
                      {role === "chef_equipe" && chefAssignedTeams.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-300 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => setChefSubTeamFilter("all")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                              chefSubTeamFilter === "all"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                            }`}
                          >
                            <span>Toutes mes équipes ({chefAssignedTeams.length})</span>
                          </button>
                          {chefAssignedTeams.map((teamName) => {
                            const displayName =
                              teamName.toLowerCase().includes("elect") || teamName.toLowerCase().includes("elict")
                                ? "Électrique"
                                : teamName;

                            const subTeamCount = vehicles.filter((v) => {
                              const matchesTab = activeTab === "chargement"
                                ? isAttenteReparation(v.etatIntervention, v.avancement)
                                : activeTab === "en_cours"
                                  ? isEnCours(v.etatIntervention, v.avancement, v.technicien)
                                  : activeTab === "essai"
                                    ? isEssai(v)
                                    : activeTab === "acheter"
                                      ? isAttenteAchat(v)
                                      : activeTab === "devis"
                                        ? isAttenteDevis(v, demandesDevisMap)
                                        : true;
                              return matchesTab && isVehicleMatchingTeam(v.equipe || v.equipe1 || "", teamName);
                            }).length;

                            return (
                              <button
                                key={teamName}
                                type="button"
                                onClick={() => setChefSubTeamFilter(teamName)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                                  chefSubTeamFilter === teamName
                                    ? "bg-indigo-600 text-white shadow-xs"
                                    : "text-slate-700 hover:text-indigo-800 hover:bg-slate-200/60"
                                }`}
                              >
                                <span>{displayName}</span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                    chefSubTeamFilter === teamName
                                      ? "bg-white/20 text-white"
                                      : "bg-slate-200 text-slate-700"
                                  }`}
                                >
                                  {subTeamCount}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {activeTab === "en_cours" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="state-filter flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-800 shadow-2xs">
                            <span className="text-slate-500 font-normal">Etat :</span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                              En cours
                            </span>
                          </div>

                          {role === "chef_equipe" && (
                            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                              <button
                                type="button"
                                onClick={() => setEnCoursTransferOnly(false)}
                                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${!enCoursTransferOnly
                                    ? "bg-white text-blue-700 shadow-2xs"
                                    : "text-slate-600 hover:text-slate-900"
                                  }`}
                              >
                                Tous ({vehicles.filter((v) => isEnCours(v.etatIntervention, v.avancement, v.technicien) && isVehicleMatchingTeam(v.equipe || "", effectiveChefFilterTeam)).length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setEnCoursTransferOnly(true)}
                                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 ${enCoursTransferOnly
                                    ? "bg-amber-500 text-white shadow-2xs"
                                    : "text-slate-600 hover:text-slate-900"
                                  }`}
                                title="Afficher uniquement les travaux reçus par transfert d'une autre équipe"
                              >
                                <ArrowRightLeft size={12} />
                                <span>Transférés reçus ({allTransferredToMyTeam.filter((v) => isEnCours(v.etatIntervention, v.avancement, v.technicien)).length})</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : role === "chef_equipe" ? (
                        <div className="state-filter flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-800 shadow-2xs">
                          <span className="text-slate-500 font-normal">Etat :</span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                            Attente Réparation
                          </span>
                        </div>
                      ) : (
                        <label className="state-filter">
                          <span>Etat</span>
                          <select
                            aria-label="Filtrer par état"
                            onChange={(event) => {
                              setActiveFilter(event.target.value as StatusFilter);
                              setSelectedZone(null);
                              setSelectedVehicleId(null);
                              setIsDetailPinned(false);
                            }}
                            value={activeFilter}
                          >
                            {tableStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>

                    {databaseStatus === "fallback" && (
                      <div className="table-alert">
                        PostgreSQL n'est pas accessible. Vérifiez la configuration de la base et l'état du serveur API.
                      </div>
                    )}

                    {databaseStatus === "ready" && missingMapZones.length > 0 && (
                      <div className="table-alert table-alert-info">
                        Emplacements absents du plan:{" "}
                        {missingMapZones.slice(0, 8).join(", ")}
                        {missingMapZones.length > 8 ? "..." : ""}
                      </div>
                    )}

                    {!canWriteToDatabase && !writeError && (
                      <div className="table-alert table-alert-info">
                        Le serveur PostgreSQL n'est pas configuré. Vérifiez DATABASE_URL dans le fichier .env du serveur.
                      </div>
                    )}

                    {writeError && (
                      <div className="table-alert">{writeError}</div>
                    )}

                    {writeNotice && (
                      <div className="table-alert table-alert-success">
                        {writeNotice}
                      </div>
                    )}

                    <datalist id="atelier-zone-options">
                      <option value="Place complet" />
                      <option value="Livraison au client" />
                      {editableMapZoneIds.map((zone) => (
                        <option key={zone} value={zone} />
                      ))}
                    </datalist>

                    {(() => {
                      const isChefEquipeChargement = activeTab === "chargement" && role === "chef_equipe";
                      const isEnCoursTab = activeTab === "en_cours";

                      return (
                        <div className="table-scroll">
                          <table
                            className={`zebra-table monitor-table vehicle-detail-table ${isChefEquipeChargement
                                ? "table-chargement-chef"
                                : isEnCoursTab
                                  ? "table-encours"
                                  : ""
                              }`}
                          >
                            {isChefEquipeChargement ? (
                              <colgroup>
                                <col className="col-or" />
                                <col className="col-client" />
                                <col className="col-marque" />
                                <col className="col-modele" />
                                <col className="col-chassis" />
                                <col className="col-immat" />
                                <col className="col-state" />
                                <col className="col-emplacement" />
                                {role !== "chef_equipe" && <col className="col-action" />}
                              </colgroup>
                            ) : isEnCoursTab ? (
                              <colgroup>
                                <col className="col-or" />
                                <col className="col-client" />
                                <col className="col-marque" />
                                <col className="col-modele" />
                                <col className="col-chassis" />
                                <col className={role === "chef_equipe" ? "col-immat" : "col-state"} />
                                <col className="col-tech" />
                                <col className="col-tech-name" />
                                {role !== "chef_equipe" && <col className="col-team" />}
                                <col className="col-avancement" />
                                <col className="col-emplacement" />
                                {role !== "chef_equipe" && <col className="col-action" />}
                              </colgroup>
                            ) : (
                              <colgroup>
                                <col className="col-or" />
                                <col className="col-cs" />
                                <col className="col-client" />
                                <col className="col-date" />
                                <col className="col-time" />
                                <col className="col-marque" />
                                <col className="col-modele" />
                                <col className="col-chassis" />
                                <col className="col-immat" />
                                <col className="col-categorie" />
                                <col className="col-tech" />
                                <col className="col-tech-name" />
                                <col className="col-team" />
                                <col className="col-avancement" />
                                <col className="col-state" />
                                <col className="col-emplacement" />
                                {role !== "chef_equipe" && <col className="col-action" />}
                              </colgroup>
                            )}

                            <thead>
                              {isChefEquipeChargement ? (
                                <tr>
                                  <th>OR</th>
                                  <th>Client</th>
                                  <th>Marque</th>
                                  <th>Modèle</th>
                                  <th>N° Chassis</th>
                                  <th>Immatriculation</th>
                                  <th>Etat</th>
                                  <th>Emplacement</th>
                                  {role !== "chef_equipe" && <th>Actions</th>}
                                </tr>
                              ) : isEnCoursTab ? (
                                <tr>
                                  <th>OR</th>
                                  <th>Client</th>
                                  <th>Marque</th>
                                  <th>Modèle</th>
                                  <th>N° Chassis</th>
                                  {role === "chef_equipe" ? (
                                    <th>Matricule</th>
                                  ) : (
                                    <th>Etat</th>
                                  )}
                                  <th>N° Matricule</th>
                                  <th>NOM DE TECHNICIEN</th>
                                  {role !== "chef_equipe" && <th>Équipe</th>}
                                  <th>Avancement</th>
                                  <th>Emplacement</th>
                                  {role !== "chef_equipe" && <th>Actions</th>}
                                </tr>
                              ) : (
                                <tr>
                                  <th>OR</th>
                                  <th>CS</th>
                                  <th>Client</th>
                                  <th>Date Entrée</th>
                                  <th>Heure Entrée</th>
                                  <th>Marque</th>
                                  <th>Modèle</th>
                                  <th>N° Chassis</th>
                                  <th>Immatriculation</th>
                                  <th>Catégorie</th>
                                  <th>N° Matricule</th>
                                  <th>NOM DE TECHNICIEN</th>
                                  <th>Équipe</th>
                                  <th>Avancement</th>
                                  <th>Etat</th>
                                  <th>Emplacement</th>
                                  {role !== "chef_equipe" && <th>Actions</th>}
                                </tr>
                              )}
                            </thead>

                            <tbody>
                              {filteredRows.map((row) => {
                                const draftValue =
                                  draftEmplacements[row.id] ?? row.emplacement;
                                const normalizedDraft =
                                  normalizeSheetEmplacement(draftValue);
                                const hasDraftChange =
                                  normalizedDraft !== row.emplacement;
                                const isSaving = savingVehicleId === row.id;
                                const hasEditableStatus = editableStatusSet.has(
                                  row.etatIntervention
                                );

                                const teamForOptions =
                                  row.equipe && row.equipe !== "-" && !row.equipe.includes(",")
                                    ? row.equipe
                                    : (chefAssignedTeams[0] || "Daily1");
                                const allowedAvancementOptions =
                                  getAvancementOptionsForTeam(teamForOptions, row);
                                const directTransferOptions = [
                                  { team: "Elictrique", code: "vrElictrique" },
                                  { team: "Service Rapide", code: "vrService Rapide" },
                                  { team: "Carrosserie", code: "vrCarrosserie" },
                                  { team: "Daily", code: "vrDaily" },
                                  { team: "Lourd", code: "vrLourd" },
                                  { team: "Changan", code: "vrChangan" },
                                ].filter((option) => !isVehicleMatchingTeam(teamForOptions, option.team));
                                const pct = parseAvancementPct(row.avancement);
                                const reaff = getReaffectationForVehicle(row);
                                const isReaffActive = Boolean(reaff && !reaff.isRepris);

                                const isTransferPending =
                                  Boolean(row.bloc && row.bloc > 1) &&
                                  (!row.technicien || row.technicien === "-") &&
                                  isVehicleMatchingTeam(row.equipe || "", activeChefEquipeTeam);

                                // Sous-blocs réutilisables de cellules
                                const renderCellEtat = () => {
                                  const devis =
                                    demandesDevisMap[String(row.id)] ||
                                    (row.no && demandesDevisMap[row.no.trim()]) ||
                                    (row.chassis && demandesDevisMap[row.chassis.trim()]);

                                  const rowStatutDevis = String((row as any).statutDevis || "").trim().toLowerCase();
                                  const rowAvancement = String(row.avancement || "").trim().toLowerCase();

                                  const isAccordAccepte =
                                    rowAvancement === "accepter accord" ||
                                    rowAvancement === "accord accepté" ||
                                    rowAvancement === "accord accepte" ||
                                    rowStatutDevis === "accepté" ||
                                    rowStatutDevis === "accepte" ||
                                    rowStatutDevis === "accord accepté" ||
                                    rowStatutDevis === "accord accepte" ||
                                    (devis?.statutDevis === "Accepté" && row.etatIntervention !== "En cours" && !row.avancement?.startsWith("En cours"));

                                  const isAttenteAccord =
                                    !isAccordAccepte && (
                                      row.avancement === "Attente accord" ||
                                      row.avancement === "Lancement attente accord" ||
                                      row.avancement === "Lancement devis" ||
                                      (row.avancement && row.avancement.toLowerCase().includes("accord")) ||
                                      isAttenteDevis(row, demandesDevisMap)
                                    );

                                  if (isAttenteAccord) {
                                    return (
                                      <td>
                                        <div className="flex flex-col gap-1.5 py-0.5">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <div
                                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs whitespace-nowrap"
                                              title={`En attente d'accord devis client${devis?.numeroDevis ? ` (N° DV: ${devis.numeroDevis})` : ""}. Traitement géré par la réception : modification verrouillée jusqu'à acceptation ou refus.`}
                                            >
                                              <FileSignature size={12} className="text-amber-800 shrink-0" />
                                              <span>Attente accord{devis?.numeroDevis ? ` (DV: ${devis.numeroDevis})` : ""}</span>
                                            </div>
                                          </div>

                                          {row.dateMiseEnAttente && (
                                            <div
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 w-fit"
                                              title={`Mis en attente le ${row.dateMiseEnAttente}`}
                                            >
                                              <Clock size={10} className="text-amber-600 shrink-0" />
                                              <span>En attente : {row.dateMiseEnAttente}</span>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  }

                                  if (isAccordAccepte) {
                                    return (
                                      <td>
                                        <div className="flex flex-col gap-1.5 py-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              aria-label={`Accord client accepté : affecter un technicien au véhicule ${row.no} et passer En cours`}
                                              disabled={isSaving}
                                              onClick={() => {
                                                setPendingEnCoursVehicle(row);
                                                setIsOnlyTechChange(false);
                                                setIsTechModalOpen(true);
                                              }}
                                              onFocus={() => {
                                                setSelectedVehicleId(row.id);
                                                setSelectedZone(row.emplacement);
                                              }}
                                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-full shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                                              title="Accord accepté ! Cliquer pour Affecter un Technicien & Passer En cours"
                                            >
                                              <CheckCircle2 size={13} className="text-white shrink-0" />
                                              <span>Accepter accord</span>
                                            </button>
                                          </div>
                                          {row.dateAcceptation && (
                                            <div
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mt-1 w-fit"
                                              title={`Accepté le ${row.dateAcceptation}`}
                                            >
                                              <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />
                                              <span>Accord validé : {row.dateAcceptation}</span>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  }

                                  return (
                                    <td>
                                      <div className="flex items-center gap-1.5">
                                        {role === "chef_equipe" && permissions.canEditAvancement ? (
                                          <button
                                            type="button"
                                            aria-label={`Affecter un technicien au véhicule ${row.no} et passer En cours`}
                                            disabled={isSaving}
                                            onClick={() => {
                                              if (isTransferPending) {
                                                handleAcceptTransfer(row);
                                              } else {
                                                setPendingEnCoursVehicle(row);
                                                setIsOnlyTechChange(false);
                                                setIsTechModalOpen(true);
                                              }
                                            }}
                                            onFocus={() => {
                                              setSelectedVehicleId(row.id);
                                              setSelectedZone(row.emplacement);
                                            }}
                                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 text-[11px] font-bold text-white ${
                                              isTransferPending
                                                ? "bg-emerald-600 hover:bg-emerald-700"
                                                : "bg-blue-600 hover:bg-blue-700"
                                            } active:scale-95 rounded-full shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50`}
                                            title={isTransferPending ? "Accepter ce travail transféré et passer En cours" : "Affecter un Technicien & Passer En cours"}
                                          >
                                            <Play size={10} className="fill-white" />
                                            <span>En cours</span>
                                          </button>
                                        ) : (
                                        <select
                                          aria-label={`Modifier Etat ${row.no}`}
                                          className="state-editor"
                                          disabled={isSaving || (!permissions.canEditEtat && !(role === "reception" && (row.etatIntervention === "Attente Client" || row.statut === "Attente Client")))}
                                          title={!permissions.canEditEtat ? "Modification de l'état réservée au Chef Atelier ou Chef d'équipe" : undefined}
                                          onChange={(event) => {
                                            const nextEtat = event.target.value as WorkshopStatus;
                                            if (nextEtat === "En cours") {
                                              setPendingEnCoursVehicle(row);
                                              setIsOnlyTechChange(false);
                                              setIsTechModalOpen(true);
                                            } else {
                                              void saveVehicleEtat(row, nextEtat);
                                            }
                                          }}
                                          onFocus={() => {
                                            setSelectedVehicleId(row.id);
                                            setSelectedZone(row.emplacement);
                                          }}
                                          style={badgeStyle(row.etatIntervention)}
                                          value={row.etatIntervention}
                                        >
                                          {!hasEditableStatus && (
                                            <option hidden value={row.etatIntervention}>
                                              {formatStatusLabel(row.etatIntervention)}
                                            </option>
                                          )}

                                          {role === "reception" && (row.etatIntervention === "Attente Client" || row.statut === "Attente Client") && !permissions.canEditEtat ? (
                                            <>
                                              <option value="Attente Client">Attente Client</option>
                                              <option value="Livré">Livré</option>
                                            </>
                                          ) : (
                                            editableStatusOptions.map((status) => (
                                              <option key={status} value={status}>
                                                {status}
                                              </option>
                                            ))
                                          )}
                                        </select>
                                        )}

                                        {permissions.canEditAvancement && (
                                          <select
                                            aria-label={`Transférer le véhicule ${row.no} vers une autre équipe`}
                                            value=""
                                            disabled={isSaving}
                                            onChange={(event) => {
                                              const transferCode = event.target.value;
                                              if (transferCode) void saveVehicleAvancement(row, transferCode);
                                            }}
                                            className="max-w-[145px] px-2 py-1 rounded-lg border border-fuchsia-300 bg-fuchsia-50 text-[10px] font-bold text-fuchsia-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30"
                                            title="Transférer ce véhicule vers une autre équipe : il restera en Attente Réparation jusqu'à acceptation"
                                          >
                                            <option value="">↪ Envoyer équipe…</option>
                                            {directTransferOptions.map((option) => (
                                              <option key={option.code} value={option.code}>Vers {option.team}</option>
                                            ))}
                                          </select>
                                        )}
                                      </div>
                                      {row.dateAcceptation && (
                                        <div
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mt-1 w-fit"
                                          title={`Accepté le ${row.dateAcceptation}${row.acceptePar ? ` par ${row.acceptePar}` : ""}`}
                                        >
                                          <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />
                                          <span>Accepté : {row.dateAcceptation}</span>
                                        </div>
                                      )}
                                      {(row.dateDebutRep || row.dateDebutTravail) && (
                                        <div
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 mt-1 w-fit"
                                          title={`Début des travaux : ${row.dateDebutRep || row.dateDebutTravail}`}
                                        >
                                          <Clock size={10} className="text-blue-600 shrink-0" />
                                          <span>Début : {row.dateDebutRep || row.dateDebutTravail}</span>
                                        </div>
                                      )}
                                      {row.dateMiseEnAttente && !row.dateAcceptation && (
                                        <div
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 mt-1 w-fit"
                                          title={`Mis en attente le ${row.dateMiseEnAttente}${row.misEnAttentePar ? ` par ${row.misEnAttentePar}` : ""}`}
                                        >
                                          <Clock size={10} className="text-amber-600 shrink-0" />
                                          <span>En attente : {row.dateMiseEnAttente}</span>
                                        </div>
                                      )}
                                    </td>
                                  );
                                };

                                const renderCellTech = () => (
                                  <td
                                    className={permissions.canEditEtat ? "cursor-pointer hover:bg-blue-50/70 transition-colors" : ""}
                                    onClick={() => {
                                      if (!permissions.canEditEtat) return;
                                      if (isTransferPending) {
                                        handleAcceptTransfer(row);
                                      } else {
                                        setPendingEnCoursVehicle(row);
                                        setIsOnlyTechChange(true);
                                        setIsTechModalOpen(true);
                                      }
                                    }}
                                    title={permissions.canEditEtat ? (isTransferPending ? "Transfert reçu : Cliquez pour choisir le technicien" : "Cliquer pour affecter ou modifier le technicien") : undefined}
                                  >
                                    {isTransferPending ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                                        À affecter
                                      </span>
                                    ) : (
                                      <span className="font-mono font-semibold text-slate-800">
                                        {displayText(row.technicien)}
                                      </span>
                                    )}
                                  </td>
                                );

                                const renderCellNomTech = () => {
                                  if (isTransferPending && permissions.canEditEtat) {
                                    return (
                                      <td
                                        className="cursor-pointer bg-amber-50/80 hover:bg-amber-100 transition-colors"
                                        onClick={() => handleAcceptTransfer(row)}
                                        title="Transfert reçu : Cliquez pour affecter un technicien de votre équipe"
                                      >
                                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-200 text-amber-950 border border-amber-300 shadow-2xs animate-pulse whitespace-nowrap">
                                          <UserCheck size={11} className="text-amber-800 shrink-0" />
                                          <span>Choisir Tech</span>
                                        </div>
                                      </td>
                                    );
                                  }

                                  const hasTech = Boolean(
                                    (row.technicien && row.technicien !== "-") ||
                                    (row.nomTechnicien && row.nomTechnicien !== "-")
                                  );
                                  const isTechOccupied = hasTech && isVehicleActivelyOccupyingTech(row, reaffectationsMap);

                                  return (
                                    <td
                                      title={row.nomTechnicien || (permissions.canEditEtat ? "Cliquer pour affecter ou modifier le technicien" : undefined)}
                                      className={permissions.canEditEtat ? "cursor-pointer hover:bg-blue-50/70 transition-colors" : ""}
                                      onClick={() => {
                                        if (!permissions.canEditEtat) return;
                                        setPendingEnCoursVehicle(row);
                                        setIsOnlyTechChange(true);
                                        setIsTechModalOpen(true);
                                      }}
                                    >
                                      <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="truncate">{displayText(row.nomTechnicien)}</span>
                                          {permissions.canEditEtat && (
                                            <Wrench size={11} className="text-slate-300 hover:text-blue-600 shrink-0" />
                                          )}
                                        </div>
                                        {hasTech && (
                                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                            {isTechOccupied ? (
                                              <span
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs"
                                                title="Mécanicien affecté et intervention active en cours : 🔴 Occupé"
                                              >
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                                                <span>🔴 Occupé</span>
                                              </span>
                                            ) : (
                                              <span
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs"
                                                title="Intervention terminée, en attente ou réaffectée : 🟢 Disponible"
                                              >
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                <span>🟢 Disponible</span>
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {isReaffActive && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300 w-fit">
                                            <Clock size={10} className="text-fuchsia-700 shrink-0" />
                                            <span>Réaffecté ({reaff?.dateReaffectation.split(" ")[1] || "fait"})</span>
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                };

                                const renderCellEquipe = () => (
                                  <td>
                                    <div className="flex flex-wrap items-center gap-1">
                                      {row.equipe && row.equipe !== "-" ? (
                                        <span
                                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${row.equipe.toLowerCase().includes("daily1")
                                              ? "bg-blue-50 text-blue-700 border-blue-200"
                                              : row.equipe.toLowerCase().includes("daily2")
                                                ? "bg-teal-50 text-teal-700 border-teal-200"
                                                : row.equipe.toLowerCase().includes("changan")
                                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                                  : "bg-slate-100 text-slate-700 border-slate-200"
                                            }`}
                                        >
                                          {row.equipe}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                      {Boolean(row.bloc && row.bloc > 1) && (
                                        <span
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                                          title={`Travail transféré depuis : ${getOriginTeam(row)}`}
                                        >
                                          <ArrowRightLeft size={10} />
                                          <span>de {getOriginTeam(row)}</span>
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );

                                const canModifyAvancement =
                                  permissions.canEditEtat ||
                                  permissions.canEditAvancement;

                                const renderCellAvancement = () => {
                                  const devis =
                                    demandesDevisMap[String(row.id)] ||
                                    (row.no && demandesDevisMap[row.no.trim()]) ||
                                    (row.chassis && demandesDevisMap[row.chassis.trim()]);

                                  const rowStatutDevis = String((row as any).statutDevis || "").trim().toLowerCase();
                                  const rowAvancement = String(row.avancement || "").trim().toLowerCase();

                                  const isAccordAccepte =
                                    rowAvancement === "accepter accord" ||
                                    rowAvancement === "accord accepté" ||
                                    rowAvancement === "accord accepte" ||
                                    rowStatutDevis === "accepté" ||
                                    rowStatutDevis === "accepte" ||
                                    rowStatutDevis === "accord accepté" ||
                                    rowStatutDevis === "accord accepte" ||
                                    (devis?.statutDevis === "Accepté" && row.etatIntervention !== "En cours" && !row.avancement?.startsWith("En cours"));

                                  const isAttenteAccord =
                                    !isAccordAccepte && (
                                      row.avancement === "Attente accord" ||
                                      row.avancement === "Lancement attente accord" ||
                                      row.avancement === "Lancement devis" ||
                                      (row.avancement && row.avancement.toLowerCase().includes("accord")) ||
                                      isAttenteDevis(row, demandesDevisMap)
                                    );
                                  const techBusyCar = (row.technicien && row.technicien !== "-") || (row.nomTechnicien && row.nomTechnicien !== "-")
                                    ? getActiveVehicleForTech(row.technicien || "", row.nomTechnicien || "", vehicles, row.id, row.no, reaffectationsMap)
                                    : undefined;
                                  const avancementDateHeure = row.dateHeureAvancement || row.dateAvancement || (row.dateModification && (row.avancement && row.avancement !== "-") ? row.dateModification : undefined);

                                  return (
                                    <td>
                                      {canModifyAvancement ? (
                                        <div className="flex flex-col gap-1 min-w-[140px] max-w-[170px]">
                                          <select
                                            aria-label={`Modifier Avancement ${row.no}`}
                                            className="avancement-editor"
                                            disabled={isSaving || !canModifyAvancement || isAttenteAccord}
                                            style={getAvancementStyle(row.avancement)}
                                            value={row.avancement && row.avancement !== "-" ? row.avancement : "-"}
                                            onChange={(e) => void saveVehicleAvancement(row, e.target.value)}
                                            title={isAttenteAccord ? "Devis en attente d'accord client : modification verrouillée jusqu'à acceptation ou refus" : "Avancement - Choisissez l'avancement"}
                                          >
                                            {(!row.avancement || row.avancement === "-") && (
                                              <option value="-">- Définir -</option>
                                            )}
                                            {row.avancement &&
                                              row.avancement !== "-" &&
                                              !allowedAvancementOptions.includes(row.avancement) && (
                                                <option value={row.avancement}>{row.avancement}</option>
                                              )}
                                            {allowedAvancementOptions.map((opt) => {
                                              const isEnCoursOpt = opt.startsWith("En cours") || opt.includes("%") || opt.startsWith("vr");
                                              const isOptDisabled = Boolean(techBusyCar && isEnCoursOpt);
                                              return (
                                                <option
                                                  key={opt}
                                                  value={opt}
                                                  disabled={isOptDisabled}
                                                  title={isOptDisabled ? `Technicien actuellement occupé sur OR ${techBusyCar?.no || techBusyCar?.serie || techBusyCar?.id}` : undefined}
                                                >
                                                  {opt} {isOptDisabled ? "(⛔ Tech. occupé)" : ""}
                                                </option>
                                              );
                                            })}
                                          </select>
                                          {pct !== null && (
                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                                              <div
                                                className={`h-full rounded-full transition-all duration-300 ${pct === 100
                                                    ? "bg-emerald-500"
                                                    : pct > 40
                                                      ? "bg-blue-500"
                                                      : "bg-amber-500"
                                                  }`}
                                                style={{ width: `${pct}%` }}
                                              />
                                            </div>
                                          )}
                                          {avancementDateHeure && (
                                            <div
                                              className="mt-0.5 text-[9px] font-medium text-slate-600 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/80 flex items-center gap-1 w-fit whitespace-nowrap"
                                              title={`Avancement enregistré le : ${avancementDateHeure}`}
                                            >
                                              <Clock size={9} className="text-slate-500 shrink-0" />
                                              <span>{avancementDateHeure}</span>
                                            </div>
                                          )}
                                          {isReaffActive && (
                                            <div className={`mt-1 flex flex-col gap-1 p-1.5 rounded text-[10px] border ${
                                              techBusyCar ? "bg-amber-50/80 border-amber-200" : "bg-fuchsia-50 border-fuchsia-200"
                                            }`}>
                                              <span className={`font-bold flex items-center gap-1 ${
                                                techBusyCar ? "text-amber-900" : "text-fuchsia-900"
                                              }`}>
                                                <Clock size={11} className={techBusyCar ? "text-amber-700 shrink-0" : "text-fuchsia-700 shrink-0"} />
                                                <span>Réaffecté : {reaff?.dateReaffectation}</span>
                                              </span>
                                              {techBusyCar ? (
                                                <div className="flex flex-col gap-1">
                                                  <div
                                                    className="text-[9px] font-bold text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1 truncate"
                                                    title={`Occupé sur OR ${techBusyCar.no || techBusyCar.serie || techBusyCar.id} (${techBusyCar.marque || ""})`}
                                                  >
                                                    <AlertTriangle size={10} className="text-amber-700 shrink-0" />
                                                    <span className="truncate">
                                                      {row.nomTechnicien || row.technicien} : Occupé sur OR {techBusyCar.no || techBusyCar.serie || techBusyCar.id}
                                                    </span>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => setRepriseChooserVehicle(row)}
                                                    className="inline-flex items-center justify-center gap-1 px-2 py-1 font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded text-[10px] transition-colors cursor-pointer"
                                                    title={`Voir tous les travaux de ${row.nomTechnicien || row.technicien} et choisir l'OR à reprendre`}
                                                  >
                                                    <Play size={9} className="fill-amber-800 text-amber-800" />
                                                    <span>Choisir le travail à reprendre</span>
                                                  </button>
                                                </div>
                                              ) : (
                                                <button
                                                  type="button"
                                                  onClick={() => void handleReprendreTravail(row)}
                                                  className="inline-flex items-center justify-center gap-1 px-2 py-1 font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-700 active:scale-95 rounded text-[10px] shadow-2xs transition-all cursor-pointer"
                                                  title="Cliquer pour reprendre le travail et enregistrer l'heure de reprise"
                                                >
                                                  <Play size={9} className="fill-white" />
                                                  <span>Reprendre le travail</span>
                                                </button>
                                              )}
                                            </div>
                                          )}
                                          {reaff && reaff.isRepris && (
                                            <div className="mt-0.5 text-[9px] text-slate-500 font-medium flex items-center gap-1">
                                              <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />
                                              <span>Repris le : {reaff.dateReprise}</span>
                                            </div>
                                          )}
                                          {(row.dateDebutRep || row.dateDebutTravail) && (
                                            <div
                                              className="mt-0.5 text-[9px] font-semibold text-blue-800 bg-blue-50/90 px-1.5 py-0.5 rounded border border-blue-200/80 flex items-center gap-1 w-fit"
                                              title={`Début des travaux : ${row.dateDebutRep || row.dateDebutTravail}`}
                                            >
                                              <Clock size={9} className="text-blue-600 shrink-0" />
                                              <span>Début : {row.dateDebutRep || row.dateDebutTravail}</span>
                                            </div>
                                          )}
                                        </div>
                                      ) : row.avancement && row.avancement !== "-" ? (
                                        <div className="flex flex-col gap-1 min-w-[120px] max-w-[150px]">
                                          <div className="flex items-center justify-between gap-1">
                                            <span
                                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border truncate max-w-[95px] ${row.avancement.toLowerCase().includes("termin")
                                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                  : row.avancement.toLowerCase().includes("devis")
                                                    ? "bg-orange-50 text-orange-700 border-orange-200"
                                                    : row.avancement.toLowerCase().includes("cours")
                                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                                      : "bg-slate-100 text-slate-700 border-slate-200"
                                                }`}
                                              title={row.avancement}
                                            >
                                              {row.avancement}
                                            </span>
                                            {pct !== null && (
                                              <span className="text-[10px] font-black text-slate-500 font-mono shrink-0">
                                                {pct}%
                                              </span>
                                            )}
                                          </div>
                                          {pct !== null && (
                                            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                                              <div
                                                className={`h-full rounded-full transition-all duration-300 ${pct === 100
                                                    ? "bg-emerald-500"
                                                    : pct > 40
                                                      ? "bg-blue-500"
                                                      : "bg-amber-500"
                                                  }`}
                                                style={{ width: `${pct}%` }}
                                              />
                                            </div>
                                          )}
                                          {avancementDateHeure && (
                                            <div
                                              className="mt-0.5 text-[9px] font-medium text-slate-600 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/80 flex items-center gap-1 w-fit whitespace-nowrap"
                                              title={`Avancement enregistré le : ${avancementDateHeure}`}
                                            >
                                              <Clock size={9} className="text-slate-500 shrink-0" />
                                              <span>{avancementDateHeure}</span>
                                            </div>
                                          )}
                                          {isReaffActive && (
                                            <div className={`mt-1 flex flex-col gap-1 p-1.5 rounded text-[10px] border ${
                                              techBusyCar ? "bg-amber-50/80 border-amber-200" : "bg-fuchsia-50 border-fuchsia-200"
                                            }`}>
                                              <span className={`font-bold flex items-center gap-1 ${
                                                techBusyCar ? "text-amber-900" : "text-fuchsia-900"
                                              }`}>
                                                <Clock size={11} className={techBusyCar ? "text-amber-700 shrink-0" : "text-fuchsia-700 shrink-0"} />
                                                <span>Réaffecté : {reaff?.dateReaffectation}</span>
                                              </span>
                                              {techBusyCar ? (
                                                <div className="text-[9px] font-bold text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                                                  <AlertTriangle size={10} className="text-amber-700 shrink-0" />
                                                  <span className="truncate">
                                                    {row.nomTechnicien || row.technicien} : Occupé sur OR {techBusyCar.no || techBusyCar.serie || techBusyCar.id}
                                                  </span>
                                                </div>
                                              ) : (
                                                <button
                                                  type="button"
                                                  onClick={() => void handleReprendreTravail(row)}
                                                  className="inline-flex items-center justify-center gap-1 px-2 py-1 font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-700 active:scale-95 rounded text-[10px] shadow-2xs transition-all cursor-pointer"
                                                  title="Cliquer pour reprendre le travail"
                                                >
                                                  <Play size={9} className="fill-white" />
                                                  <span>Reprendre le travail</span>
                                                </button>
                                              )}
                                            </div>
                                          )}
                                          {reaff && reaff.isRepris && (
                                            <div className="mt-0.5 text-[9px] text-slate-500 font-medium flex items-center gap-1">
                                              <CheckCircle2 size={10} className="text-emerald-600 shrink-0" />
                                              <span>Repris : {reaff.dateReprise}</span>
                                            </div>
                                          )}
                                          {(row.dateDebutRep || row.dateDebutTravail) && (
                                            <div
                                              className="mt-0.5 text-[9px] font-semibold text-blue-800 bg-blue-50/90 px-1.5 py-0.5 rounded border border-blue-200/80 flex items-center gap-1 w-fit"
                                              title={`Début des travaux : ${row.dateDebutRep || row.dateDebutTravail}`}
                                            >
                                              <Clock size={9} className="text-blue-600 shrink-0" />
                                              <span>Début : {row.dateDebutRep || row.dateDebutTravail}</span>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex flex-col gap-0.5">
                                          <span className="text-slate-400 text-xs font-semibold">-</span>
                                          {isReaffActive && (
                                            <span className="text-[10px] text-fuchsia-800 font-bold">
                                              Réaffecté : {reaff?.dateReaffectation}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  );
                                };

                                const renderCellEmplacement = () => {
                                  const isComplet = draftValue === FULL_PARKING_EMPLACEMENT || row.emplacement === FULL_PARKING_EMPLACEMENT;
                                  return (
                                    <td>
                                      <div className="flex items-center gap-1.5">
                                        <div className={`emplacement-editor ${isComplet ? "border-red-400 bg-red-50/50" : ""}`}>
                                      <input
                                        aria-label={`Modifier emplacement ${row.no}`}
                                        disabled={isSaving || !permissions.canEditEmplacement}
                                        title={!permissions.canEditEmplacement ? "Modification de l'emplacement réservée au Chef Atelier ou Chef d'équipe" : undefined}
                                        list="atelier-zone-options"
                                        onBlur={(event) => {
                                          const nextValue = event.currentTarget.value;
                                          if (
                                            normalizeSheetEmplacement(nextValue) !==
                                            row.emplacement
                                          ) {
                                            void saveVehicleEmplacement(row, nextValue);
                                          }
                                        }}
                                        onChange={(event) => {
                                          const nextValue = normalizeSheetEmplacement(
                                            event.target.value
                                          );
                                          setDraftEmplacements((current) => ({
                                            ...current,
                                            [row.id]: nextValue,
                                          }));
                                        }}
                                        onFocus={() => {
                                          setSelectedVehicleId(row.id);
                                          setSelectedZone(row.emplacement);
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            void saveVehicleEmplacement(
                                              row,
                                              event.currentTarget.value
                                            );
                                          }
                                          if (event.key === "Escape") {
                                            event.preventDefault();
                                            setDraftEmplacements((current) =>
                                              removeDraft(current, row.id)
                                            );
                                          }
                                        }}
                                        value={draftValue}
                                      />

                                      <button
                                        aria-label={`Enregistrer emplacement ${row.no}`}
                                        className="emplacement-save"
                                        disabled={!hasDraftChange || isSaving || !permissions.canEditEmplacement}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void saveVehicleEmplacement(row, draftValue);
                                        }}
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                        }}
                                        title="Enregistrer emplacement"
                                        type="button"
                                      >
                                        <Save size={12} />
                                      </button>
                                    </div>

                                    {row.emplacement && row.emplacement !== "-" && row.emplacement !== "NA" && (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          const targetZone = normalizeEmplacementCode(row.emplacement);
                                          setActiveTab("plan_atelier");
                                          setSelectedZone(targetZone);
                                          setSelectedVehicleId(row.id);
                                          setIsDetailPinned(true);
                                        }}
                                        className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                                          isComplet
                                            ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                        }`}
                                        title={
                                          isComplet
                                            ? "Atelier complet (aucune place libre disponible)"
                                            : `Voir le poste ${row.emplacement} sur le Plan d'Atelier`
                                        }
                                      >
                                        <MapPin size={12} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            };

                                const renderCellFiche = () => (
                                  <td className="text-center">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setVehiculeModalData(row);
                                      }}
                                      className="p-1 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200 transition-colors cursor-pointer"
                                      title={`Voir la fiche détaillée et la condition du véhicule ${row.no}`}
                                    >
                                      <Eye size={13} />
                                    </button>
                                  </td>
                                );

                                return (
                                  <tr
                                    className={`${selectedVehicleId === row.id ? "table-row-selected" : ""
                                      } ${isTransferPending ? "bg-amber-50/40 border-l-4 border-l-amber-500" : ""}`.trim()}
                                    key={row.id}
                                    onClick={() => {
                                      setSelectedVehicleId(row.id);
                                      setSelectedZone(row.emplacement);
                                      setIsDetailPinned(true);
                                    }}
                                    onMouseEnter={() => {
                                      if (isDetailPinned) return;

                                      setSelectedVehicleId(row.id);
                                      setSelectedZone(row.emplacement);
                                    }}
                                    onMouseLeave={hideVehicleDetails}
                                  >
                                    {/* CAS 1 : Tableaux de chargement (Attente Réparation) pour Chef d'Équipe */}
                                    {isChefEquipeChargement ? (
                                      <>
                                        <td>{displayText(row.l2n2500 || row.no)}</td>
                                        <td title={row.client}>{displayText(row.client)}</td>
                                        <td>{displayText(row.marque)}</td>
                                        <td title={row.modele || row.modelePowerBI}>{displayText(row.modele || row.modelePowerBI)}</td>
                                        <td title={row.chassis}>{displayText(row.chassis)}</td>
                                        <td title={row.immatriculation || row.serie}>{displayText(row.immatriculation || row.serie)}</td>
                                        {renderCellEtat()}
                                        {renderCellEmplacement()}
                                        {role !== "chef_equipe" && renderCellFiche()}
                                      </>
                                    ) : isEnCoursTab ? (
                                      /* CAS 2 : Interventions En cours (OR, Client, Marque, Modèle, N° Chassis, Etat/Matricule, Tech, Nom Tech, Avancement, Emplacement, Fiche) */
                                      <>
                                        <td>
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span>{displayText(row.l2n2500 || row.no)}</span>
                                            {(Boolean(row.bloc && row.bloc > 1) || Boolean(row.equipe1 && row.equipe1 !== "-" && !isVehicleMatchingTeam(row.equipe1, activeChefEquipeTeam))) && (
                                              <span
                                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                                                title={`Travail transféré depuis : ${getOriginTeam(row)}`}
                                              >
                                                <ArrowRightLeft size={10} />
                                                <span>de {getOriginTeam(row)}</span>
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td title={row.client}>{displayText(row.client)}</td>
                                        <td>{displayText(row.marque)}</td>
                                        <td title={row.modele || row.modelePowerBI}>{displayText(row.modele || row.modelePowerBI)}</td>
                                        <td title={row.chassis}>{displayText(row.chassis)}</td>
                                        {role === "chef_equipe" ? (
                                          <td title={`Matricule: ${displayText(row.immatriculation || row.serie)}`}>
                                            <span className="font-mono font-bold text-slate-800 text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-300/80">
                                              {displayText(row.immatriculation || row.serie)}
                                            </span>
                                          </td>
                                        ) : (
                                          renderCellEtat()
                                        )}
                                        {renderCellTech()}
                                        {renderCellNomTech()}
                                        {role !== "chef_equipe" && renderCellEquipe()}
                                        {renderCellAvancement()}
                                        {renderCellEmplacement()}
                                        {role !== "chef_equipe" && renderCellFiche()}
                                      </>
                                    ) : (
                                      /* CAS 3 : Tableaux de chargement complet (Tous les véhicules) - 16 colonnes */
                                      <>
                                        <td>{displayText(row.l2n2500 || row.no)}</td>
                                        <td>{displayText(row.cs)}</td>
                                        <td title={row.client}>{displayText(row.client)}</td>
                                        <td>{displayText(row.dateEntree)}</td>
                                        <td>{displayText(row.heureEntree)}</td>
                                        <td>{displayText(row.marque)}</td>
                                        <td title={row.modele || row.modelePowerBI}>{displayText(row.modele || row.modelePowerBI)}</td>
                                        <td title={row.chassis}>{displayText(row.chassis)}</td>
                                        <td title={row.immatriculation || row.serie}>{displayText(row.immatriculation || row.serie)}</td>
                                        <td>{displayText(row.categorie)}</td>
                                        {renderCellTech()}
                                        {renderCellNomTech()}
                                        {renderCellEquipe()}
                                        {renderCellAvancement()}
                                        {renderCellEtat()}
                                        {renderCellEmplacement()}
                                        {role !== "chef_equipe" && renderCellFiche()}
                                      </>
                                    )}
                                  </tr>
                                );
                              })}

                              {filteredRows.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={
                                      isChefEquipeChargement
                                        ? role === "chef_equipe" ? 8 : 9
                                        : isEnCoursTab
                                          ? role === "chef_equipe"
                                            ? 11
                                            : 12
                                          : role === "chef_equipe" ? 16 : 17
                                    }
                                  >
                                    <div className="table-empty">
                                      Aucun véhicule pour ce filtre.
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </section>
                </div>
              </main>

              <footer className="monitor-footer" aria-live="polite">
                <span className="monitor-time">
                  Dernière mise à jour: {lastRefresh}
                </span>
              </footer>
            </>
          )}
        </div>
      </div>

      {/* Modal Fiche Détail Véhicule & Condition */}
      <DetailVehiculeModal
        isOpen={Boolean(vehiculeModalData)}
        onClose={() => setVehiculeModalData(null)}
        vehicule={
          vehiculeModalData
            ? {
              id: vehiculeModalData.id,
              noOr: vehiculeModalData.l2n2500 || vehiculeModalData.no || vehiculeModalData.ordre,
              cs: vehiculeModalData.cs,
              chassis: vehiculeModalData.chassis,
              immatriculation: vehiculeModalData.immatriculation || vehiculeModalData.serie,
              serie: vehiculeModalData.serie || vehiculeModalData.immatriculation,
              nomClient: vehiculeModalData.client,
              dateEntree: vehiculeModalData.dateEntree,
              heureEntree: vehiculeModalData.heureEntree,
              dateEntreeHeure:
                vehiculeModalData.dateEntree && vehiculeModalData.heureEntree
                  ? `${vehiculeModalData.dateEntree} ${vehiculeModalData.heureEntree}`.trim()
                  : vehiculeModalData.dateEntree,
              marque: vehiculeModalData.marque,
              modele: vehiculeModalData.modele || vehiculeModalData.modelePowerBI,
              categorie: vehiculeModalData.categorie,
              etat: vehiculeModalData.etatIntervention || vehiculeModalData.statut,
              etatIntervention: vehiculeModalData.etatIntervention,
              equipe: vehiculeModalData.equipe,
              technicien: vehiculeModalData.technicien,
              nomTechnicien: vehiculeModalData.nomTechnicien,
              avancement: vehiculeModalData.avancement,
              dateFinRep: vehiculeModalData.dateFinRep,
              heureFin: (vehiculeModalData as any).heureFin,
              emplacement: vehiculeModalData.emplacement,
              sheetRowNumber: vehiculeModalData.sheetRowNumber,
            }
            : null
        }
        canEdit={false}
      />

      {/* Notification Flottante - Transfert Entrant avec 2 choix */}
      {USER_NOTIFICATIONS_ENABLED && role === "chef_equipe" && unhandledTransfers.length > 0 && (
        <div className="fixed top-20 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
          {unhandledTransfers.slice(0, 1).map((v) => {
            const originTeam = getOriginTeam(v);
            return (
              <div
                key={v.id}
                className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-amber-400 p-5 relative overflow-hidden"
              >
                {/* Glow bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 animate-pulse" />

                <div className="flex items-start justify-between gap-3 mb-3 pt-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md animate-bounce shrink-0">
                      <Bell size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 leading-tight">
                        Nouveau travail transféré !
                      </h3>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Transmis par : <strong className="text-slate-900">{originTeam}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeferTransfer(v.id)}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Mettre en attente"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 mb-4 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Véhicule :</span>
                    <strong className="text-slate-900 font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                      {v.serie || v.no}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Marque / Modèle :</span>
                    <strong className="text-slate-800">
                      {v.marque} {v.modele || v.modelePowerBI || ""}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Client :</span>
                    <strong className="text-slate-800 truncate max-w-[170px]" title={v.client}>
                      {v.client}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Emplacement :</span>
                    <span className="font-semibold text-slate-700">{v.emplacement}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAcceptTransfer(v)}
                    className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                    title="Accepter le travail et choisir le technicien"
                  >
                    <UserCheck size={16} />
                    <span>Accepter le travail</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeferTransfer(v.id)}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="Mettre en attente (choisir plus tard)"
                  >
                    <Clock size={14} />
                    <span>Mettre en attente</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notification équipe : retour après essai non conforme, à accepter avant reprise */}
      {USER_NOTIFICATIONS_ENABLED && role === "chef_equipe" && returnedEssaiNotifications.filter((item) =>
        isVehicleMatchingTeam(item.equipe, activeChefEquipeTeam || "")
      ).length > 0 && (
        <div className="fixed top-24 right-6 z-50 max-w-sm w-full pointer-events-auto flex flex-col gap-3">
          {returnedEssaiNotifications
            .filter((item) => isVehicleMatchingTeam(item.equipe, activeChefEquipeTeam || ""))
            .slice(0, 2)
            .map((item) => (
              <div key={`notif-retour-essai-${item.vehicle.id}`} className="bg-white rounded-2xl shadow-2xl border-2 border-violet-500 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-violet-700">Retour après essai</p>
                    <h3 className="mt-1 text-sm font-black text-slate-900">OR {item.vehicle.no || item.vehicle.ordre || item.vehicle.id}</h3>
                    <p className="mt-1 text-xs text-slate-600">Essai non conforme · retour le {item.timestamp}</p>
                  </div>
                  <Gauge size={22} className="text-violet-600 shrink-0" />
                </div>
                <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900">
                  Le véhicule est dans <strong>Tableaux de chargement · Attente Réparation</strong>. Acceptez-le pour redémarrer le travail.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAcceptReturnedEssai(item)}
                    className="flex-1 py-2.5 px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Accepter & démarrer
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturnedEssaiNotifications((previous) => previous.filter((entry) => entry.vehicle.id !== item.vehicle.id))}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 transition-colors cursor-pointer"
                  >
                    Plus tard
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Notification Flottante - Pièces Achat Retirées avec Bouton Accepter et Reprendre */}
      {USER_NOTIFICATIONS_ENABLED && role === "chef_equipe" && deliveredAchatNotifications.filter((item) =>
        isVehicleMatchingTeam(item.demande.equipe || item.vehicle.equipe || "", activeChefEquipeTeam || "")
      ).length > 0 && (
        <div className="fixed top-24 right-6 z-50 max-w-sm w-full animate-in fade-in slide-from-top-4 duration-300 pointer-events-auto flex flex-col gap-3">
          {deliveredAchatNotifications
            .filter((item) => isVehicleMatchingTeam(item.demande.equipe || item.vehicle.equipe || "", activeChefEquipeTeam || ""))
            .slice(0, 2)
            .map((item) => (
            <div
              key={`notif-achat-${item.vehicle.id}`}
              className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-emerald-500 p-5 relative overflow-hidden"
            >
              {/* Glow bar */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400 animate-pulse" />

              <div className="flex items-start justify-between gap-3 mb-3 pt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md animate-bounce shrink-0">
                    <PackageOpen size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 leading-tight">
                      📦 Pièce arrivée pour votre équipe
                    </h3>
                    <p className="text-[11px] text-emerald-800 font-semibold mt-0.5">
                      En attente de votre acceptation • {item.timestamp}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissDeliveredAchat(item.vehicle.id)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Fermer la notification"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 mb-4 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">N° OR / Dossier :</span>
                  <strong className="text-slate-900 font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                    {item.vehicle.no || item.vehicle.ordre || "-"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Châssis :</span>
                  <strong className="text-slate-800 font-mono font-semibold">
                    {item.vehicle.chassis || "-"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Véhicule :</span>
                  <strong className="text-slate-800">
                    {item.vehicle.marque} {item.vehicle.modele || ""}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Client :</span>
                  <strong className="text-slate-800 truncate max-w-[170px]" title={item.vehicle.client}>
                    {item.vehicle.client || "-"}
                  </strong>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Pièce retirée :</span>
                  <div className="text-right">
                    <span className="font-bold text-emerald-800">{item.demande.ref}</span>
                    <span className="text-[10px] text-slate-500 ml-1">({item.demande.designation})</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleAcceptDeliveredAchat(item)}
                  className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  title="Accepter et démarrer uniquement si le technicien est disponible"
                >
                  <CheckCircle2 size={16} />
                  <span>Accepter & Démarrer</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDismissDeliveredAchat(item.vehicle.id)}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                  title="Conserver en trace sans naviguer"
                >
                  <Clock size={14} />
                  <span>Plus tard</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification Flottante Réception - Nouveaux Devis à Appeler */}
      {USER_NOTIFICATIONS_ENABLED && activeDevisAppelerNotifications.length > 0 && (
        <div className="fixed top-24 right-6 z-50 max-w-sm w-full animate-in fade-in slide-from-top-4 duration-300 pointer-events-auto flex flex-col gap-3">
          {activeDevisAppelerNotifications.slice(0, 1).map(({ vehicle, devis }) => (
            <div
              key={`notif-devis-appeler-${vehicle.id}`}
              className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-orange-500 p-5 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400 via-amber-500 to-orange-400 animate-pulse" />

              <div className="flex items-start justify-between gap-3 mb-3 pt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shadow-md animate-bounce shrink-0">
                    <PhoneCall size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 leading-tight">
                      📞 Devis créé : Appeler client !
                    </h3>
                    <p className="text-[11px] text-orange-800 font-semibold mt-0.5">
                      N° DV : {devis?.numeroDevis || "En cours"} • Équipe {devis?.equipe || vehicle.equipe}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissDevisNotif(`appeler-${vehicle.id}`)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Fermer la notification"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 mb-4 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">N° OR / Châssis :</span>
                  <span className="font-mono font-bold text-slate-900">
                    {vehicle.no || vehicle.ordre || "-"} • {vehicle.chassis || "-"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Client :</span>
                  <strong className="text-slate-800 truncate max-w-[170px]" title={vehicle.client}>
                    {vehicle.client || "-"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Véhicule :</span>
                  <span className="text-slate-700 font-medium">
                    {vehicle.marque} {vehicle.modele || ""}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleAppelerClientFromNotif({ vehicle, devis: devis! })}
                  className="flex-1 py-2 px-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                  title="Marquer que la réception a contacté le client"
                >
                  <PhoneCall size={13} />
                  <span>Client Appelé</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAccepterDevisFromNotif({ vehicle, devis: devis! })}
                  className="py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  title="Le client accepte le devis : renvoyer à l'équipe"
                >
                  <CheckCircle2 size={13} />
                  <span>Accepter</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRefuserDevisFromNotif({ vehicle, devis: devis! })}
                  className="py-2 px-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 active:scale-95 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                  title="Le client refuse : passer automatiquement en Terminer"
                >
                  <XCircle size={13} />
                  <span>Refuser</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification Flottante Réception - Relance Devis (>24h sans réponse) */}
      {USER_NOTIFICATIONS_ENABLED && activeDevisRelanceNotifications.length > 0 && (
        <div className="fixed top-28 right-6 z-50 max-w-sm w-full animate-in fade-in slide-from-top-4 duration-300 pointer-events-auto flex flex-col gap-3">
          {activeDevisRelanceNotifications.slice(0, 1).map(({ vehicle, devis }) => (
            <div
              key={`notif-devis-relance-${vehicle.id}`}
              className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-rose-500 p-5 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500 animate-pulse" />

              <div className="flex items-start justify-between gap-3 mb-3 pt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-amber-600 text-white flex items-center justify-center shadow-md animate-bounce shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-rose-950 leading-tight">
                      ⚠️ Relance Devis (&gt; 24h) !
                    </h3>
                    <p className="text-[11px] text-rose-800 font-semibold mt-0.5">
                      Client sans réponse depuis 1 jour • N° DV : {devis?.numeroDevis}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissDevisNotif(`relance-${vehicle.id}`)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Fermer la notification"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200/80 mb-4 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Client à relancer :</span>
                  <strong className="text-slate-900 truncate max-w-[170px]" title={vehicle.client}>
                    {vehicle.client || "-"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Dossier :</span>
                  <span className="font-mono font-bold text-slate-800">
                    OR : {vehicle.no || vehicle.ordre || "-"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Créé / Premier appel :</span>
                  <span className="text-slate-700 font-semibold">
                    {devis?.dateAppel || devis?.date || "Depuis > 24h"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleRelancerClientFromNotif({ vehicle, devis: devis! })}
                  className="flex-1 py-2 px-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-md shadow-amber-600/20 transition-all cursor-pointer"
                  title="Marquer que le client a été relancé aujourd'hui"
                >
                  <AlertTriangle size={13} />
                  <span>Relance Faite</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAccepterDevisFromNotif({ vehicle, devis: devis! })}
                  className="py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  title="Le client accepte le devis : renvoyer à l'équipe en atelier"
                >
                  <CheckCircle2 size={13} />
                  <span>Accepter</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRefuserDevisFromNotif({ vehicle, devis: devis! })}
                  className="py-2 px-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 active:scale-95 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                  title="Le client refuse : passer automatiquement en Terminer"
                >
                  <XCircle size={13} />
                  <span>Refuser</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification Flottante - Devis Client Accepté (Pour Chef d'Équipe) */}
      {USER_NOTIFICATIONS_ENABLED && activeDevisAccordNotificationsForUser.length > 0 && (
        <div className="fixed top-24 right-6 z-50 max-w-sm w-full animate-in fade-in slide-from-top-4 duration-300 pointer-events-auto flex flex-col gap-3">
          {activeDevisAccordNotificationsForUser.slice(0, 2).map((item) => {
            const matchingVehicle = vehicles.find(
              (v) =>
                (item.vehicleId && v.id === item.vehicleId) ||
                (item.or && (v.no === item.or || v.ordre === item.or)) ||
                (!item.or && !item.vehicleId && item.chassis && v.chassis === item.chassis)
            );
            return (
              <div
                key={`floating-accord-${item.id}`}
                className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-emerald-500 p-5 relative overflow-hidden"
              >
                {/* Glow bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-green-500 animate-pulse" />

                <div className="flex items-start justify-between gap-3 mb-3 pt-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md animate-bounce shrink-0">
                      <FileSignature size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 leading-tight">
                        🎉 Devis Client Accepté !
                      </h3>
                      <p className="text-[11px] text-emerald-800 font-semibold mt-0.5">
                        Retourné à l'équipe {item.equipeCible} • {item.timestamp}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-800 text-center">
                    En attente d'acceptation
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 mb-4 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">N° OR / Dossier :</span>
                    <strong className="text-slate-900 font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                      {item.or}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">N° Devis :</span>
                    <strong className="text-emerald-700 font-mono font-semibold">
                      {item.numeroDevis}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Véhicule :</span>
                    <strong className="text-slate-800">
                      {item.marque} {item.modele}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">État :</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                      Tableaux de chargement (Attente réparation)
                    </span>
                  </div>
                  {(item.nomTechnicien || item.technicien || matchingVehicle?.nomTechnicien || matchingVehicle?.technicien) && (
                    <div className="flex justify-between items-center bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      <span className="text-emerald-800 font-bold flex items-center gap-1">
                        <Wrench size={12} className="text-emerald-700" />
                        Technicien :
                      </span>
                      <strong className="text-emerald-950 font-bold">
                        {item.nomTechnicien || matchingVehicle?.nomTechnicien || item.technicien || matchingVehicle?.technicien}
                        {(item.technicien || matchingVehicle?.technicien) ? ` (${item.technicien || matchingVehicle?.technicien})` : ""}
                      </strong>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Client :</span>
                    <strong className="text-slate-800 truncate max-w-[170px]" title={item.client}>
                      {item.client}
                    </strong>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleVoirDansChargement(item, matchingVehicle)}
                    className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <ClipboardList size={15} />
                    <span>Voir dans Tableaux de chargement</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {matchingVehicle && (permissions.canEditEtat || permissions.canEditChargement) && (
                      <button
                        type="button"
                        onClick={() => handlePrendreEnChargeDevisAccord(item, matchingVehicle)}
                        className="flex-1 py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                        title="Affecter ou démarrer l'intervention"
                      >
                        <UserCheck size={14} />
                        <span>Accepter le véhicule</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleVoirDansChargement(item, matchingVehicle)}
                      className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200"
                      title="Voir dans Tableaux de chargement sans supprimer la notification"
                    >
                      <ClipboardList size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMettreEnAttenteDevisAccord(item, matchingVehicle)}
                      className="flex-1 py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                      title="Conserver le véhicule dans Attente Réparation et fermer cette notification"
                    >
                      <Clock size={14} />
                      <span>Mettre en attente</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Choix du travail à reprendre après réaffectation */}
      {repriseChooserVehicle && (
        <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-fuchsia-700 to-violet-700 text-white flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-fuchsia-100">Technicien réaffecté</p>
                <h2 className="mt-1 text-base font-black">Choisir le travail à reprendre</h2>
                <p className="mt-1 text-xs text-fuchsia-100">
                  {repriseChooserVehicle.nomTechnicien || repriseChooserVehicle.technicien} — tous les OR ouverts sont affichés ci-dessous.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRepriseChooserVehicle(null)}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white transition-colors cursor-pointer"
                title="Fermer"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Un OR déjà <strong>En cours</strong> doit être terminé avant de reprendre un autre OR. Si tous les OR sont réaffectés, choisissez celui qui doit redémarrer.
              </p>

              {repriseChooserWorks.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Aucun travail ouvert trouvé pour ce technicien.</p>
              ) : (
                repriseChooserWorks.map((work) => {
                  const record = getReaffectationForVehicle(work);
                  const isActive = isVehicleActivelyOccupyingTech(work, reaffectationsMap);
                  const isReaffecte = Boolean(record && !record.isRepris && !isActive);
                  const busyWork = isReaffecte
                    ? getActiveVehicleForTech(
                        work.technicien || "",
                        work.nomTechnicien || "",
                        vehicles,
                        work.id,
                        work.no,
                        reaffectationsMap
                      )
                    : undefined;

                  return (
                    <div key={`reprise-choice-${work.id}`} className="rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-slate-900">OR {work.no || work.ordre || work.id}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                            isActive
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200"
                          }`}>
                            {isActive ? "En cours — travail actif" : "Réaffecté — attente réparation"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 truncate">
                          {work.marque || "-"} {work.modele || ""} · {work.client || "Client non renseigné"} · Emplacement {work.emplacement || "-"}
                        </p>
                        {busyWork && (
                          <p className="mt-1 text-[11px] font-semibold text-amber-800">
                            À reprendre après la fin de OR {busyWork.no || busyWork.ordre || busyWork.id}.
                          </p>
                        )}
                      </div>

                      {isReaffecte ? (
                        <button
                          type="button"
                          disabled={Boolean(busyWork) || savingVehicleId === work.id}
                          onClick={() => {
                            setRepriseChooserVehicle(null);
                            void handleReprendreTravail(work);
                          }}
                          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-extrabold transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Play size={12} className="fill-current" />
                          Reprendre cet OR
                        </button>
                      ) : (
                        <span className="shrink-0 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                          Travail en cours
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Affectation Technicien */}
      <AffecterTechnicienModal
        isOpen={isTechModalOpen}
        vehicle={pendingEnCoursVehicle}
        allVehicles={vehicles}
        reaffectationsMap={reaffectationsMap}
        assignedTeam={
          pendingEnCoursVehicle?.equipe && !pendingEnCoursVehicle.equipe.includes(",") && pendingEnCoursVehicle.equipe !== "-"
            ? pendingEnCoursVehicle.equipe
            : chefSubTeamFilter !== "all"
              ? chefSubTeamFilter
              : (chefAssignedTeams[0] || "Daily1")
        }
        allowedTeams={chefAssignedTeams.length > 1 ? chefAssignedTeams : undefined}
        equipeMembers={resolvedEquipeMembers}
        isOnlyTechnicienChange={isOnlyTechChange}
        isTransferAcceptance={isTransferAcceptanceModal}
        canChangeTeam={role !== "chef_equipe" || chefAssignedTeams.length > 1}
        onClose={() => {
          setIsTechModalOpen(false);
          setIsTransferAcceptanceModal(false);
          setPendingEnCoursVehicle(null);
        }}
        onConfirm={async (payload) => {
          const wasTransfer = isTransferAcceptanceModal;
          setIsTransferAcceptanceModal(false);
          if (isOnlyTechChange) {
            await saveVehicleTechnicienOnly(payload);
          } else {
            await saveVehicleEtatWithTech(payload);
            setActiveTab("en_cours");
            setActiveFilter("En cours");
            setDateFilter(ALL_DATES);
            setSearch("");
            setSelectedVehicleId(payload.vehicle.id);
          }
          if (wasTransfer) {
            setActiveTab("en_cours");
            setActiveFilter("En cours");
            setDateFilter(ALL_DATES);
            setSearch("");
            setEnCoursTransferOnly(false);
            setSelectedVehicleId(payload.vehicle.id);
            setWriteNotice(
              `✅ Travail transféré accepté pour ${payload.vehicle.serie || payload.vehicle.no} ! Retrouvez-le ci-dessous dans 'Interventions En cours' affecté au technicien [${payload.technicien}] ${payload.nomTechnicien}.`
            );
          }
        }}
        onConfirmWithoutTech={
          async (vehicle, team) => {
            const wasTransfer = isTransferAcceptanceModal;
            setIsTransferAcceptanceModal(false);
            if (isOnlyTechChange) {
              await saveVehicleTechnicienOnly({
                vehicle,
                technicien: "-",
                nomTechnicien: "-",
                poste: "-",
                equipe: team,
              });
            } else {
              await saveVehicleEtatWithTech({
                vehicle,
                technicien: "-",
                nomTechnicien: "-",
                poste: "-",
                equipe: team,
              });
            }
            if (wasTransfer) {
              setActiveTab("en_cours");
              setActiveFilter("En cours");
              setDateFilter(ALL_DATES);
              setSearch("");
              setEnCoursTransferOnly(false);
              setSelectedVehicleId(vehicle.id);
            }
          }
        }
      />

      <DemandeAchatModal
        isOpen={Boolean(pendingAchatVehicle)}
        vehicle={pendingAchatVehicle}
        currentChefEquipeName={selectedChefEquipeName || currentUser?.name}
        onClose={() => setPendingAchatVehicle(null)}
        onConfirm={async (demande) => {
          if (pendingAchatVehicle) {
            const v = pendingAchatVehicle;
            setPendingAchatVehicle(null);
            await saveVehicleAvancement(v, "attends acheter", demande);
          }
        }}
      />

      <DemandeDevisModal
        isOpen={Boolean(pendingDevisVehicle)}
        vehicle={pendingDevisVehicle}
        currentChefEquipeName={selectedChefEquipeName || currentUser?.name}
        onClose={() => setPendingDevisVehicle(null)}
        onConfirm={async (devis) => {
          if (pendingDevisVehicle) {
            const v = pendingDevisVehicle;
            setPendingDevisVehicle(null);
            await saveVehicleAvancement(v, "Lancement devis", undefined, undefined, devis);
          }
        }}
      />
    </div>
  );
}
