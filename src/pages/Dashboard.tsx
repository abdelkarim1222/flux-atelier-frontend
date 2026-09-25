import {
  AlertTriangle,
  BarChart3,
  Car,
  CheckCircle2,
  ChevronLeft,
  CircleGauge,
  ClipboardList,
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
import GestionAccesView from "../components/GestionAccesView";
import GestionEquipesView from "../components/GestionEquipesView";
import MoyennesView from "../components/MoyennesView";
import EssaiView from "../components/EssaiView";
import AcheterView from "../components/AcheterView";
import DetailVehiculeModal from "../components/DetailVehiculeModal";
import AffecterTechnicienModal from "../components/AffecterTechnicienModal";
import DemandeAchatModal from "../components/DemandeAchatModal";
import DemandeDevisModal from "../components/DemandeDevisModal";
import DevisView from "../components/DevisView";
import { useAuth } from "../context/AuthContext";
import { useRole } from "../context/RoleContext";
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
  fetchGoogleSheetFluxData,
  synchroniserTableauxDeChargement,
  getTeamForChefEquipe,
  isGoogleSheetWriteConfigured,
  isSheetEmplacementOutsideMap,
  normalizeSheetEmplacement,
  updateGoogleSheetEtat,
  updateGoogleSheetTechnicien,
  updateGoogleSheetAvancement,
  updateGoogleSheetEmplacement,
  getAvancementOptionsForTeam,
  saveDemandeAchatLocal,
  marquerDemandeAchatLivree,
  marquerDemandeAchatAttente,
  updateGoogleSheetStatutAchat,
  type DemandeAchat,
  saveEssaiControleLocal,
  saveDemandeDevisLocal,
  getDemandesDevisLocal,
  type DemandeDevis,
  VEHICLE_SHEET_URL,
  type EquipeSheetResult,
  mergeRecentAddedVehicles,
} from "../services/googleSheets";
import type { EssaiValidationPayload } from "../components/ValidationEssaiModal";
import { normalizeTeamName, isVehicleMatchingTeam } from "../config/teams";

type StatusFilter = "Tous" | "Attentes" | WorkshopStatus;
type SheetStatus = "loading" | "ready" | "fallback";
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

const editableMapZoneIds = Array.from(mapZoneIds)
  .filter((zone) => /^[A-Z]+\d+$/.test(zone))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

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
    return waitingStatuses.has(row.etatIntervention);
  }

  return row.etatIntervention === filter;
}

function formatStatusLabel(status: WorkshopStatus) {
  if (status === "A livré") return "Livré";
  if (status === "En attente") return "Attente Client";
  if (status === "Attente PDR") return "Attente Réparation";

  return status;
}

function isAttenteReparation(etat?: string) {
  if (!etat) return false;
  const normalized = etat.trim().toLowerCase();
  return (
    normalized === "attente réparation" ||
    normalized === "attente reparation" ||
    normalized === "attente pdr" ||
    normalized.includes("réparation") ||
    normalized.includes("reparation")
  );
}

function isEnCours(etat?: string, avancement?: string, technicien?: string): boolean {
  const normEtat = (etat || "").trim().toLowerCase();
  const normAv = (avancement || "").trim().toLowerCase();
  const hasTech = Boolean(technicien && technicien !== "-" && technicien.trim() !== "");

  // Exclusions explicites
  if (normEtat === "essai" || normAv === "essai") return false;
  if (normEtat.includes("achet") || normAv.includes("achet")) return false;
  if (normEtat.includes("livr") || normAv.includes("livr")) return false;
  if (normEtat === "terminer" || normAv === "terminer") return false;
  if (normEtat.includes("attente client") || normAv.includes("attente client")) return false;

  // Inclusions : si l'avancement indique un travail en cours ou pourcentage
  if (normAv.startsWith("en cours") || normAv.includes("%") || normAv.includes("devis")) return true;
  // Si l'état général est En cours
  if (normEtat === "en cours") return true;
  // Si un technicien est affecté (intervention prise en charge par l'équipe) et non en attente de transfert sortant (vr)
  if (hasTech && !normAv.startsWith("vr")) return true;

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
  const hasDevis = demandesMap ? Boolean(
    demandesMap[String(row.id)] ||
    (row.no && demandesMap[row.no.trim()]) ||
    (row.chassis && demandesMap[row.chassis.trim()])
  ) : false;
  return (
    avancement === "atende devis" ||
    avancement === "attente devis" ||
    avancement.includes("devis") ||
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
  if (lower.includes("devis")) {
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

function parseSheetDate(value: string | undefined) {
  const text = normalizeDateLabel(value);
  const gvizDate = text.match(
    /^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/
  );

  if (gvizDate) {
    return new Date(
      Number(gvizDate[1]),
      Number(gvizDate[2]),
      Number(gvizDate[3])
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
  type TabType = "chargement" | "en_cours" | "essai" | "attente_achat" | "devis" | "plan_atelier" | "suivi_entrees" | "gestion_acces" | "gestion_equipes" | "moyennes";

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
        saved === "plan_atelier" ||
        saved === "suivi_entrees" ||
        saved === "gestion_acces" ||
        saved === "gestion_equipes" ||
        saved === "moyennes"
      ) {
        return saved;
      }
    } catch {}
    return permissions.defaultTab;
  });

  const setActiveTab = useCallback((tab: TabType) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    try {
      sessionStorage.setItem("flux_atelier_dashboard_tab", tab);
      localStorage.setItem("flux_atelier_dashboard_tab", tab);
    } catch {}
  }, []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  useEffect(() => {
    const saved = sessionStorage.getItem("flux_atelier_dashboard_tab");
    if (!saved) {
      if (role === "reception") {
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
  }, [role, setActiveTab]);

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
  const [sheetStatus, setSheetStatus] =
    useState<SheetStatus>("loading");
  const [sheetError, setSheetError] = useState("");
  const [lastRefresh, setLastRefresh] = useState("26/03/2026 08:57");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(ALL_DATES);
  const [draftEmplacements, setDraftEmplacements] = useState<Record<number, string>>({});
  const [savingVehicleId, setSavingVehicleId] = useState<number | null>(null);
  const [writeNotice, setWriteNotice] = useState("");
  const [writeError, setWriteError] = useState("");
  const [showStatusDashboard, setShowStatusDashboard] = useState(false);
  const canWriteToSheet = isGoogleSheetWriteConfigured();

  const [equipeData, setEquipeData] = useState<EquipeSheetResult | null>(null);
  const [pendingEnCoursVehicle, setPendingEnCoursVehicle] = useState<Flux | null>(null);
  const [pendingAchatVehicle, setPendingAchatVehicle] = useState<Flux | null>(null);
  const [pendingDevisVehicle, setPendingDevisVehicle] = useState<Flux | null>(null);
  const [demandesDevisMap, setDemandesDevisMap] = useState<Record<string, DemandeDevis>>(getDemandesDevisLocal);
  const [deliveredAchatNotifications, setDeliveredAchatNotifications] = useState<
    Array<{ vehicle: Flux; demande: DemandeAchat; timestamp: string }>
  >([]);

  useEffect(() => {
    const handleDevisUpdate = () => {
      setDemandesDevisMap(getDemandesDevisLocal());
    };
    window.addEventListener("demandes_devis_updated", handleDevisUpdate);
    window.addEventListener("storage", handleDevisUpdate);
    return () => {
      window.removeEventListener("demandes_devis_updated", handleDevisUpdate);
      window.removeEventListener("storage", handleDevisUpdate);
    };
  }, []);
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [isOnlyTechChange, setIsOnlyTechChange] = useState(false);

  useEffect(() => {
    fetchEquipeSheetData()
      .then((data) => setEquipeData(data))
      .catch((err) => console.warn("Erreur chargement EQUIPE:", err));
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
    return getTeamForChefEquipe(nameToMatch, equipeData?.teamByMemberName);
  }, [currentUser, selectedChefEquipeName, equipeData]);

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
    const myTeamNorm = normalizeTeamName(activeChefEquipeTeam);
    return vehicles.filter((v) => {
      const isMyTeam = normalizeTeamName(v.equipe || "") === myTeamNorm;
      const isTransferred =
        Boolean(v.bloc && v.bloc > 1) ||
        Boolean(v.avancement1 && v.avancement1.toLowerCase().startsWith("vr")) ||
        Boolean(v.avancement2 && v.avancement2.toLowerCase().startsWith("vr")) ||
        Boolean(v.equipe1 && v.equipe1 !== "-" && normalizeTeamName(v.equipe1) !== myTeamNorm);
      const isTechUnassigned = !v.technicien || v.technicien === "-" || v.technicien.trim() === "";
      return isMyTeam && isTransferred && isTechUnassigned;
    });
  }, [vehicles, role, activeChefEquipeTeam]);

  // Tous les véhicules transférés reçus par mon équipe (en attente OU déjà acceptés et en cours)
  const allTransferredToMyTeam = useMemo(() => {
    if (role !== "chef_equipe" || !activeChefEquipeTeam) return [];
    const myTeamNorm = normalizeTeamName(activeChefEquipeTeam);
    return vehicles.filter((v) => {
      const isMyTeam = normalizeTeamName(v.equipe || "") === myTeamNorm;
      const isTransferred =
        Boolean(v.bloc && v.bloc > 1) ||
        Boolean(v.avancement1 && v.avancement1.toLowerCase().startsWith("vr")) ||
        Boolean(v.avancement2 && v.avancement2.toLowerCase().startsWith("vr")) ||
        Boolean(v.equipe1 && v.equipe1 !== "-" && normalizeTeamName(v.equipe1) !== myTeamNorm);
      return isMyTeam && isTransferred;
    });
  }, [vehicles, role, activeChefEquipeTeam]);

  // Transferts non encore mis en attente pour la popup volante
  const unhandledTransfers = useMemo(() => {
    return incomingTransfers.filter((v) => !deferredTransferIds.has(v.id));
  }, [incomingTransfers, deferredTransferIds]);

  // Alerte sonore discrète lors de l'arrivée d'un nouveau transfert
  useEffect(() => {
    if (unhandledTransfers.length > 0) {
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
      setSheetStatus("loading");
    }
    setDraftEmplacements({});
    setWriteError("");
    setWriteNotice("");

    try {
      const rows = await fetchGoogleSheetFluxData();
      const mergedRows = mergeRecentAddedVehicles(rows);
      setVehicles(mergedRows);
      setSheetStatus("ready");
      setSheetError("");
    } catch (error) {
      if (!silent) {
        setVehicles(mergeRecentAddedVehicles(fluxData));
        setSheetStatus("fallback");
        setSheetError(
          error instanceof Error
            ? error.message
            : "Impossible de lire Google Sheets."
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
      setSheetStatus("ready");
      setSheetError("");
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

      if (!canWriteToSheet) {
        setSavingVehicleId(null);
        setDraftEmplacements((current) => removeDraft(current, row.id));
        setWriteError(
          "Emplacement modifié dans l'app seulement. Pour modifier aussi Google Sheets, crée le déploiement Apps Script puis ajoute VITE_SHEET_WRITE_URL dans .env.local."
        );
        return;
      }

      try {
        await updateGoogleSheetEmplacement(row, nextEmplacement);
        setDraftEmplacements((current) => removeDraft(current, row.id));
        setLastRefresh(formatRefreshDate());
        setSheetStatus("ready");
        setSheetError("");
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
            : "Impossible d'enregistrer l'emplacement dans Google Sheets."
        );
      } finally {
        setSavingVehicleId((current) =>
          current === row.id ? null : current
        );
      }
    },
    [canWriteToSheet, permissions.canEditEmplacement]
  );

  const saveVehicleEtat = useCallback(
    async (row: Flux, nextEtat: WorkshopStatus) => {
      if (!permissions.canEditEtat) {
        setWriteError("Votre profil ne vous permet pas de modifier l'état des véhicules.");
        return;
      }

      if (nextEtat === row.etatIntervention) return;

      const previousEtat = row.etatIntervention;
      const previousEmplacement = row.emplacement;
      const previousEquipe = row.equipe;
      const isDelivered = formatStatusLabel(nextEtat) === "Livré";
      const nextEmplacement = isDelivered
        ? DELIVERED_EMPLACEMENT
        : row.emplacement;

      // Si passage à "En cours", on affecte automatiquement l'équipe du Chef d'Équipe actif
      const isGoingToEnCours = nextEtat === "En cours";
      const assignedTeam = isGoingToEnCours ? activeChefEquipeTeam : row.equipe;

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

      if (!canWriteToSheet) {
        setSavingVehicleId(null);
        setWriteError(
          "Etat et équipe modifiés dans l'application. Déployez le script Apps Script pour enregistrer directement dans Google Sheets."
        );
        return;
      }

      try {
        await updateGoogleSheetEtat(
          row,
          nextEtat,
          isGoingToEnCours ? assignedTeam : undefined
        );
        setLastRefresh(formatRefreshDate());
        setSheetStatus("ready");
        setSheetError("");
        setWriteNotice(
          isDelivered
            ? `Etat ${row.serie || row.no} mis à jour: ${formatStatusLabel(previousEtat)} -> Livré. Emplacement: ${DELIVERED_EMPLACEMENT}.`
            : isGoingToEnCours
              ? `Véhicule ${row.serie || row.no} passé en cours. Équipe affectée automatiquement : ${assignedTeam}.`
              : `Etat ${row.serie || row.no} mis à jour: ${formatStatusLabel(previousEtat)} -> ${formatStatusLabel(nextEtat)}.`
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
            : "Impossible d'enregistrer l'état dans Google Sheets."
        );
      } finally {
        setSavingVehicleId((current) =>
          current === row.id ? null : current
        );
      }
    },
    [canWriteToSheet, permissions.canEditEtat, activeChefEquipeTeam]
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
                equipe: assignedTeam,
                technicien: technicien !== "-" ? technicien : item.technicien,
                nomTechnicien: nomTechnicien !== "-" ? nomTechnicien : item.nomTechnicien,
              }
            : item
        )
      );
      setSelectedVehicleId(row.id);

      if (!canWriteToSheet) {
        setSavingVehicleId(null);
        setWriteNotice(
          `Véhicule ${row.serie || row.no} passé en cours. Équipe : ${assignedTeam}${
            technicien && technicien !== "-" ? ` • Technicien : [${technicien}] ${nomTechnicien}` : ""
          }.`
        );
        return;
      }

      try {
        await updateGoogleSheetEtat(
          row,
          nextEtat,
          assignedTeam,
          technicien !== "-" ? technicien : undefined,
          nomTechnicien !== "-" ? nomTechnicien : undefined,
          poste !== "-" ? poste : undefined,
          row.bloc
        );
        setLastRefresh(formatRefreshDate());
        setSheetStatus("ready");
        setSheetError("");
        setWriteNotice(
          `Véhicule ${row.serie || row.no} passé en cours. Équipe : ${assignedTeam}${
            technicien && technicien !== "-" ? ` • Technicien : [${technicien}] ${nomTechnicien}` : ""
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
            `Véhicule ${row.serie || row.no} pris en charge : Équipe ${assignedTeam}${
              technicien && technicien !== "-" ? ` • Technicien : [${technicien}] ${nomTechnicien}` : ""
            }. (Enregistré dans l'application. Déployez le nouveau Code.gs pour débloquer la cellule dans Google Sheets).`
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
              : "Impossible d'enregistrer l'intervention dans Google Sheets."
          );
        }
      } finally {
        setSavingVehicleId((current) => (current === row.id ? null : current));
      }
    },
    [canWriteToSheet]
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
      const finalTeam = assignedTeam || row.equipe || (activeChefEquipeTeam || "Daily1");

      setVehicles((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                technicien: technicien !== "-" ? technicien : item.technicien,
                nomTechnicien: nomTechnicien !== "-" ? nomTechnicien : item.nomTechnicien,
                equipe: finalTeam,
                etatIntervention: "En cours",
                statut: "En cours",
                avancement: nextAvancement,
              }
            : item
        )
      );

      if (!canWriteToSheet) {
        setSavingVehicleId(null);
        setWriteNotice(
          `Technicien mis à jour pour ${row.serie || row.no} : [${technicien}] ${nomTechnicien}.`
        );
        return;
      }

      try {
        await updateGoogleSheetTechnicien(
          row,
          technicien,
          nomTechnicien,
          finalTeam,
          poste,
          row.bloc
        );
        setLastRefresh(formatRefreshDate());
        setSheetStatus("ready");
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
            `Technicien affecté pour ${row.serie || row.no} : [${technicien}] ${nomTechnicien}. (Enregistré dans l'application. Déployez le nouveau Code.gs pour débloquer la cellule dans Google Sheets).`
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
              : "Impossible d'enregistrer le technicien dans Google Sheets."
          );
        }
      } finally {
        setSavingVehicleId((current) => (current === row.id ? null : current));
      }
    },
    [canWriteToSheet, activeChefEquipeTeam]
  );

  const saveVehicleAvancement = useCallback(
    async (
      row: Flux,
      nextAvancement: string,
      demandeAchat?: DemandeAchat,
      extraParams?: Record<string, string>,
      demandeDevis?: DemandeDevis
    ) => {
      if (!permissions.canEditEtat) {
        setWriteError("Votre profil ne vous permet pas de modifier l'avancement.");
        return;
      }

      if (
        !nextAvancement ||
        nextAvancement === "-" ||
        (nextAvancement === row.avancement && !demandeAchat && !demandeDevis)
      ) {
        return;
      }

      // Si le chef d'équipe choisit "attends acheter" sans formulaire de demande, ouvrir le modal
      if (nextAvancement === "attends acheter" && !demandeAchat) {
        setPendingAchatVehicle(row);
        return;
      }

      // Si le chef d'équipe choisit "ATENDE DEVIS" sans formulaire de devis, ouvrir le modal
      if (nextAvancement === "ATENDE DEVIS" && !demandeDevis) {
        setPendingDevisVehicle(row);
        return;
      }

      // Si une demande de pièces/achat est transmise, l'enregistrer localement
      if (demandeAchat) {
        saveDemandeAchatLocal(demandeAchat);
      }

      // Si une demande de devis est transmise, l'enregistrer localement
      if (demandeDevis) {
        saveDemandeDevisLocal(demandeDevis);
      }

      const previousAvancement = row.avancement;
      const previousEtat = row.etatIntervention;

      // Déduire l'état d'intervention selon la valeur d'avancement
      const nextEtat: WorkshopStatus = nextAvancement === "Terminer"
        ? "Attente Client"
        : nextAvancement === "Essai"
        ? "Essai"
        : nextAvancement === "attends acheter"
        ? "attends acheter"
        : nextAvancement === "Attente client"
        ? "Attente Client"
        : nextAvancement.startsWith("vr")
        ? "En cours"
        : nextAvancement.startsWith("En cours") || nextAvancement.toLowerCase().includes("devis")
        ? "En cours"
        : row.etatIntervention;

      setWriteNotice("");
      setWriteError("");
      setSavingVehicleId(row.id);
      setVehicles((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                avancement: nextAvancement,
                etatIntervention: nextEtat,
                statut: nextEtat,
              }
            : item
        )
      );

      // Basculer automatiquement vers la page correspondante selon la demande de l'utilisateur
      if (nextAvancement === "Essai") {
        setActiveTab("essai");
      } else if (nextAvancement === "attends acheter") {
        setActiveTab("attente_achat");
      } else if (nextAvancement === "ATENDE DEVIS") {
        setActiveTab("devis");
      }

      if (!canWriteToSheet) {
        setSavingVehicleId(null);
        setWriteError(
          "Avancement modifié dans l'application. Déployez le script Apps Script pour enregistrer directement dans Google Sheets."
        );
        return;
      }

      try {
        await updateGoogleSheetAvancement(
          row,
          nextAvancement,
          row.equipe,
          row.bloc,
          demandeAchat,
          extraParams,
          demandeDevis
        );
        setLastRefresh(formatRefreshDate());
        setSheetStatus("ready");
        setSheetError("");
        const noticeMsg =
          nextAvancement === "Essai"
            ? `Véhicule ${row.serie || row.no} mis à jour : Essai (transféré vers la Page Essai).`
            : nextAvancement === "attends acheter"
            ? `Véhicule ${row.serie || row.no} mis à jour : attends acheter (transféré vers la Page Acheter).`
            : nextAvancement === "ATENDE DEVIS"
            ? `Véhicule ${row.serie || row.no} mis à jour : ATENDE DEVIS (transféré vers la Page Devis).`
            : nextAvancement === "Terminer"
            ? `Essai CONFORME validé pour ${row.serie || row.no} : intervention Terminer (transféré en Attente Client).`
            : nextAvancement === "Attente client"
            ? `Essai NON-CONFORME pour ${row.serie || row.no} : placé en Attente Client (accord requis pour la nouvelle panne).`
            : nextAvancement.startsWith("vr")
            ? `Essai NON-CONFORME pour ${row.serie || row.no} : retourné à l'équipe ${nextAvancement}.`
            : `Avancement ${row.serie || row.no} mis à jour : ${nextAvancement}.`;
        setWriteNotice(noticeMsg);
      } catch (error) {
        if (
          nextAvancement === "attends acheter" ||
          nextAvancement === "Essai" ||
          nextAvancement === "Terminer" ||
          nextAvancement === "Attente client"
        ) {
          // Pour ces statuts, on conserve le véhicule dans l'état et la page cible
          setWriteNotice(
            nextAvancement === "attends acheter"
              ? `Véhicule ${row.serie || row.no} enregistré dans l'application en attente d'achat.`
              : nextAvancement === "Essai"
              ? `Véhicule ${row.serie || row.no} transféré en essai dans l'application.`
              : nextAvancement === "Terminer"
              ? `Contrôle conforme pour ${row.serie || row.no} enregistré dans l'application.`
              : `Véhicule ${row.serie || row.no} placé en attente client dans l'application.`
          );
          setWriteError(
            error instanceof Error
              ? `Avertissement Google Sheets : ${error.message}. Pensez à déployer le script Code.gs à jour pour synchroniser.`
              : "Synchronisation Google Sheets en attente. Déployez le script Apps Script pour enregistrer directement dans Google Sheets."
          );
        } else {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const isValidationRuleError =
            errorMsg.toLowerCase().includes("validation") ||
            errorMsg.toLowerCase().includes("cellule") ||
            errorMsg.toLowerCase().includes("règles de validation");

          if (isValidationRuleError) {
            setWriteNotice(
              `Avancement pour ${row.serie || row.no} mis à jour : ${nextAvancement}. (Enregistré dans l'application. Déployez le nouveau Code.gs pour débloquer la cellule dans Google Sheets).`
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
                    }
                  : item
              )
            );
            setWriteError(
              error instanceof Error
                ? error.message
                : "Impossible d'enregistrer l'avancement dans Google Sheets."
            );
          }
        }
      } finally {
        setSavingVehicleId((current) => (current === row.id ? null : current));
      }
    },
    [canWriteToSheet, permissions.canEditEtat, setActiveTab]
  );

  // Validation du contrôle d'essai depuis la Page Essai (modal essayeur)
  const handleValidateEssai = useCallback(
    async (payload: EssaiValidationPayload) => {
      const vehicle = payload.vehicle;
      let nextAvancement: string;
      const extraParams: Record<string, string> = {
        essayeur: payload.essayeur,
        resultatEssai: payload.resultat,
        dateControle: payload.dateControle,
      };

      if (payload.resultat === "CONFORME") {
        nextAvancement = "Terminer";
      } else {
        if (payload.actionNonConforme === "transfert_vr" && payload.targetVr) {
          nextAvancement = payload.targetVr;
          extraParams.actionNonConforme = "transfert_vr";
          extraParams.targetVr = payload.targetVr;
        } else {
          nextAvancement = "Attente client";
          extraParams.actionNonConforme = "attente_client";
          extraParams.descriptionPanne = payload.descriptionPanne || "";
        }
      }

      // 1. Sauvegarde locale de la fiche de contrôle essai
      saveEssaiControleLocal({
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
        dateControle: payload.dateControle,
        timestamp: Date.now(),
      });

      // 2. Mettre à jour l'avancement et synchroniser vers Google Sheets
      await saveVehicleAvancement(vehicle, nextAvancement, undefined, extraParams);
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

      // 2. Mettre à jour l'avancement à "En cours - 10%" et l'état à "En cours"
      // (pour que le véhicule réintègre immédiatement Interventions En cours)
      const nextAvancement = "En cours - 10%";
      await saveVehicleAvancement(vehicle, nextAvancement);

      // 3. Déclencher la synchronisation Google Sheets du statut d'achat
      void updateGoogleSheetStatutAchat(vehicle, demande, "Livré");

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
            etatIntervention: "En cours",
            statut: "En cours",
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
    void updateGoogleSheetStatutAchat(vehicle, demande, "Attente");
    setDeliveredAchatNotifications((prev) =>
      prev.filter((n) => (n.vehicle.no || n.vehicle.id) !== (vehicle.no || vehicle.id))
    );
  }, []);

  const handleAcceptDeliveredAchat = useCallback((item: { vehicle: Flux; demande: DemandeAchat }) => {
    setDeliveredAchatNotifications((prev) =>
      prev.filter((n) => (n.vehicle.no || n.vehicle.id) !== (item.vehicle.no || item.vehicle.id))
    );
    setActiveTab("plan_atelier");
    setActiveFilter("En cours");
    setSelectedVehicleId(item.vehicle.id);
    setVehiculeModalData(item.vehicle);
  }, [setActiveTab]);

  const handleDismissDeliveredAchat = useCallback((vehicleId: number | string) => {
    setDeliveredAchatNotifications((prev) =>
      prev.filter((n) => n.vehicle.id !== vehicleId && n.vehicle.no !== vehicleId)
    );
  }, []);

  const rowsByZone = useMemo(() => {
    const zones = new Map<string, Flux[]>();

    vehicles.forEach((row) => {
      const zone = (row.emplacement || "").toUpperCase().trim();
      if (!zone || zone === "NA" || zone.startsWith("#") || isSheetEmplacementOutsideMap(zone)) {
        return;
      }
      zones.set(zone, [...(zones.get(zone) ?? []), row]);
    });

    return zones;
  }, [vehicles]);

  const attenteReparationCount = useMemo(() => {
    if (role === "chef_equipe" && activeChefEquipeTeam) {
      return vehicles.filter(
        (v) =>
          isAttenteReparation(v.etatIntervention) &&
          isVehicleMatchingTeam(v.equipe || v.equipe1 || "", activeChefEquipeTeam)
      ).length;
    }
    return vehicles.filter((v) => isAttenteReparation(v.etatIntervention)).length;
  }, [vehicles, role, activeChefEquipeTeam]);

  const enCoursCount = useMemo(() => {
    if (role === "chef_equipe" && activeChefEquipeTeam) {
      return vehicles.filter(
        (v) =>
          isEnCours(v.etatIntervention, v.avancement, v.technicien) &&
          isVehicleMatchingTeam(v.equipe || "", activeChefEquipeTeam)
      ).length;
    }
    return vehicles.filter((v) => isEnCours(v.etatIntervention, v.avancement, v.technicien)).length;
  }, [vehicles, role, activeChefEquipeTeam]);

  const essaiCount = useMemo(() => {
    if (role === "chef_equipe" && activeChefEquipeTeam) {
      return vehicles.filter(
        (v) =>
          isEssai(v) &&
          isVehicleMatchingTeam(v.equipe || "", activeChefEquipeTeam)
      ).length;
    }
    return vehicles.filter(isEssai).length;
  }, [vehicles, role, activeChefEquipeTeam]);

  const attenteAchatCount = useMemo(() => {
    if (role === "chef_equipe" && activeChefEquipeTeam) {
      return vehicles.filter(
        (v) =>
          isAttenteAchat(v) &&
          isVehicleMatchingTeam(v.equipe || "", activeChefEquipeTeam)
      ).length;
    }
    return vehicles.filter(isAttenteAchat).length;
  }, [vehicles, role, activeChefEquipeTeam]);

  const devisCount = useMemo(() => {
    if (role === "chef_equipe" && activeChefEquipeTeam) {
      return vehicles.filter(
        (v) =>
          isAttenteDevis(v, demandesDevisMap) &&
          isVehicleMatchingTeam(v.equipe || "", activeChefEquipeTeam)
      ).length;
    }
    return vehicles.filter((v) => isAttenteDevis(v, demandesDevisMap)).length;
  }, [vehicles, role, activeChefEquipeTeam, demandesDevisMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return vehicles
      .filter((row) => {
        // 1. Si on est sur l'onglet 'en_cours' : uniquement les véhicules 'En cours'
        if (activeTab === "en_cours") {
          if (!isEnCours(row.etatIntervention, row.avancement, row.technicien)) {
            return false;
          }
          // Si rôle 'chef_equipe' : trouver seulement les véhicules de son équipe
          if (role === "chef_equipe" && activeChefEquipeTeam) {
            if (!isVehicleMatchingTeam(row.equipe || "", activeChefEquipeTeam)) {
              return false;
            }
            if (enCoursTransferOnly) {
              const isTransferred =
                Boolean(row.bloc && row.bloc > 1) ||
                Boolean(row.avancement1 && row.avancement1.toLowerCase().startsWith("vr")) ||
                Boolean(row.avancement2 && row.avancement2.toLowerCase().startsWith("vr")) ||
                Boolean(row.equipe1 && row.equipe1 !== "-" && !isVehicleMatchingTeam(row.equipe1, activeChefEquipeTeam));
              if (!isTransferred) return false;
            }
          }
        }

        // 2. Si on est sur 'chargement' ET rôle 'chef_equipe' : uniquement 'Attente Réparation' de son équipe
        if (activeTab === "chargement" && role === "chef_equipe") {
          if (!isAttenteReparation(row.etatIntervention)) {
            return false;
          }
          if (activeChefEquipeTeam && !isVehicleMatchingTeam(row.equipe || row.equipe1 || "", activeChefEquipeTeam)) {
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

        // 2. Pour les lignes de la feuille Google Sheets :
        // Chaque nouvelle entrée est insérée directement en ligne 2 de la feuille Google Sheets
        // (sheet.insertRowBefore(2)), ce qui pousse les anciens véhicules vers les lignes 3, 4, etc.
        // La ligne 2 est donc le véhicule le plus récent et doit impérativement figurer EN TÊTE de tableau.
        // Un tri par sheetRowNumber croissant garantit que la ligne 2 est en première position pour tous les accès.
        const rowA =
          typeof a.sheetRowNumber === "number" && a.sheetRowNumber > 0
            ? a.sheetRowNumber
            : typeof a.id === "number"
            ? a.id
            : Infinity;
        const rowB =
          typeof b.sheetRowNumber === "number" && b.sheetRowNumber > 0
            ? b.sheetRowNumber
            : typeof b.id === "number"
            ? b.id
            : Infinity;

        if (rowA !== rowB) {
          return rowA - rowB;
        }

        return (b.id ?? 0) - (a.id ?? 0);
      });
  }, [activeFilter, dateFilter, search, vehicles, role, activeTab, activeChefEquipeTeam, enCoursTransferOnly]);

  const dateOptions = useMemo(
    () =>
      Array.from(
        new Set(
          vehicles
            .map((row) => normalizeDateLabel(row.dateEntree))
            .filter(Boolean)
        )
      ).sort((a, b) => parseSheetDate(b) - parseSheetDate(a)),
    [vehicles]
  );

  const visibleZones = useMemo(
    () =>
      new Set(
        filteredRows
          .map((row) => (row.emplacement || "").toUpperCase().trim())
          .filter((z) => z && !z.startsWith("#") && z !== "NA")
      ),
    [filteredRows]
  );

  const statusRows = useMemo(
    () =>
      statusMeta
        .map((status) => ({
          ...status,
          count: vehicles.filter(
            (row) => row.etatIntervention === status.label
          ).length,
        }))
        .filter((status) => status.count > 0),
    [vehicles]
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

  const hasActiveSearch = search.trim().length > 0;
  const hasVisualFilter =
    activeFilter !== "Tous" || dateFilter !== ALL_DATES || hasActiveSearch;

  const kpis = [
    {
      label: "Véhicules en attente",
      helper: "Etat intervention",
      value: vehicles.filter((row) =>
        waitingStatuses.has(row.etatIntervention)
      ).length,
      accent: "#d97706",
      filter: "Attentes" as StatusFilter,
      icon: <CircleGauge size={18} />,
    },
    {
      label: "Attente Client",
      helper: "Client à confirmer",
      value: vehicles.filter(
        (row) => row.etatIntervention === "Attente Client"
      ).length,
      accent: "#dc2626",
      filter: "Attente Client" as StatusFilter,
      icon: <PackageOpen size={18} />,
    },
    {
      label: "Véhicules en cours",
      helper: "Intervention active",
      value: vehicles.filter((row) =>
        isEnCours(row.etatIntervention, row.avancement, row.technicien)
      ).length,
      accent: "#2563eb",
      filter: "En cours" as StatusFilter,
      icon: <Wrench size={18} />,
    },
    {
      label: "À livrer / prêts",
      helper: "Sortie atelier",
      value: vehicles.filter(
        (row) => formatStatusLabel(row.etatIntervention) === "Livré"
      ).length,
      accent: "#16a34a",
      filter: "Livré" as StatusFilter,
      icon: <CheckCircle2 size={18} />,
    },
    {
      label: "Travaux Exterieurs",
      helper: "Hors atelier",
      value: vehicles.filter(
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

    rowsByZone.forEach((_, zone) => {
      if (!zone || !mapZoneIds.has(zone)) return;
      let element: SVGGraphicsElement | null = null;
      try {
        element = svg.querySelector<SVGGraphicsElement>(`#${CSS.escape(zone)}`);
      } catch {
        return;
      }

      if (!element) return;

      element.style.setProperty("fill", "transparent");
      element.style.setProperty("fill-opacity", "0");
      element.style.setProperty("stroke", "transparent");
      element.style.setProperty("stroke-width", "1");
      element.style.setProperty("stroke-opacity", "0");
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
      const color = getStatusColor(row.etatIntervention);
      const isSelected = selectedZone === zone;
      const isVisible = !hasVisualFilter || visibleZones.has(zone);

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
    hasVisualFilter,
    rowsByZone,
    selectedZone,
    visibleZones,
  ]);

  const handleMapHover = (event: MouseEvent<HTMLDivElement>) => {
    if (isDetailPinned) return;

    let element = event.target as Element | null;

    while (element && element !== event.currentTarget) {
      const zone = element.id?.toUpperCase();

      if (zone && rowsByZone.has(zone)) {
        setSelectedZone(zone);
        setSelectedVehicleId(null);
        return;
      }

      element = element.parentElement;
    }
  };

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    let element = event.target as Element | null;

    while (element && element !== event.currentTarget) {
      const zone = element.id?.toUpperCase();

      if (zone && rowsByZone.has(zone)) {
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
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white/95 border border-slate-200/80 rounded-xl text-xs shadow-2xs">
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
                  className={`monitor-button ${
                    showStatusDashboard ? "monitor-button-active" : ""
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
                className={`monitor-button monitor-button-accent ${
                  (role === "administration" || role === "chef_atelier") && activeTab === "chargement"
                    ? "!bg-amber-600 hover:!bg-amber-700 !text-white !font-bold shadow-xs"
                    : ""
                }`}
                disabled={sheetStatus === "loading" || isInstantSyncing}
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
                <RefreshCw size={14} className={isInstantSyncing || sheetStatus === "loading" ? "animate-spin" : ""} />
                {(role === "administration" || role === "chef_atelier") && activeTab === "chargement"
                  ? (isInstantSyncing ? "Actualisation..." : "Actualiser à l'instant")
                  : "Actualiser"}
              </button>

              <button
                className="monitor-button"
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
          className={`dashboard-sidebar ${
            isSidebarOpen
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "chargement"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "chargement"
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "en_cours"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "en_cours"
                    ? "bg-white/25 text-white"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}>
                  {enCoursCount}
                </span>
              </button>
            )}

            {(permissions.canViewAll || role === "chef_equipe" || role === "chef_atelier" || role === "administration") && (
              <button
                type="button"
                onClick={() => setActiveTab("essai")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "essai"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "essai"
                    ? "bg-white/25 text-white"
                    : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                }`}>
                  {essaiCount}
                </span>
              </button>
            )}

            {(permissions.canViewAll || role === "chef_equipe" || role === "chef_atelier" || role === "administration") && (
              <button
                type="button"
                onClick={() => setActiveTab("attente_achat")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "attente_achat"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "attente_achat"
                    ? "bg-white/25 text-white"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>
                  {attenteAchatCount}
                </span>
              </button>
            )}

            {(permissions.canViewAll || role === "chef_equipe" || role === "chef_atelier" || role === "administration") && (
              <button
                type="button"
                onClick={() => setActiveTab("devis")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "devis"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "devis"
                    ? "bg-white/25 text-white"
                    : "bg-orange-50 text-orange-700 border border-orange-200"
                }`}>
                  {devisCount}
                </span>
              </button>
            )}

            {permissions.canViewMap && (
              <button
                type="button"
                onClick={() => setActiveTab("plan_atelier")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "plan_atelier"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "plan_atelier"
                    ? "bg-white/25 text-white"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                }`}>
                  Synoptique
                </span>
              </button>
            )}

            {(permissions.canViewAll || role === "reception" || role === "chef_atelier" || role === "administration") && (
              <button
                type="button"
                onClick={() => setActiveTab("suivi_entrees")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "suivi_entrees"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-emerald-700 hover:bg-slate-100/90"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardList size={16} className={activeTab === "suivi_entrees" ? "text-white" : "text-emerald-600"} />
                  <div>
                    <div className="leading-tight">Suivi des entrées</div>
                    <div className={`text-[10px] font-medium ${activeTab === "suivi_entrees" ? "text-emerald-100" : "text-slate-400"}`}>
                      Réception & flux
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "suivi_entrees"
                    ? "bg-white/25 text-white"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                }`}>
                  Réception
                </span>
              </button>
            )}

            {(role === "chef_atelier" || role === "administration") && (
              <button
                type="button"
                onClick={() => setActiveTab("gestion_acces")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "gestion_acces"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "gestion_acces"
                    ? "bg-white/25 text-white"
                    : "bg-purple-50 text-purple-700 border border-purple-200"
                }`}>
                  Admin
                </span>
              </button>
            )}

            {(role === "administration" || role === "chef_atelier") && (
              <button
                type="button"
                onClick={() => setActiveTab("gestion_equipes")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "gestion_equipes"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "gestion_equipes"
                    ? "bg-white/25 text-white"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}>
                  Admin
                </span>
              </button>
            )}

            {(role === "administration" || role === "chef_atelier") && (
              <button
                type="button"
                onClick={() => setActiveTab("moyennes")}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                  activeTab === "moyennes"
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === "moyennes"
                    ? "bg-white/25 text-white"
                    : "bg-teal-50 text-teal-700 border border-teal-200"
                }`}>
                  KPI
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

      {activeTab === "suivi_entrees" ? (
        <SuiviEntreesTable />
      ) : activeTab === "gestion_acces" ? (
        <GestionAccesView />
      ) : activeTab === "gestion_equipes" ? (
        <GestionEquipesView />
      ) : activeTab === "moyennes" ? (
        <MoyennesView />
      ) : activeTab === "essai" ? (
        <EssaiView
          vehicles={vehicles}
          onUpdateAvancement={saveVehicleAvancement}
          onValidateEssai={handleValidateEssai}
          onSelectVehicle={(v) => {
            setSelectedVehicleId(v.id);
            setVehiculeModalData(v);
          }}
          savingVehicleId={savingVehicleId}
          canEdit={permissions.canEditEtat}
          userTeam={role === "chef_equipe" ? activeChefEquipeTeam : undefined}
          isChefEquipe={role === "chef_equipe"}
          onRefresh={() => void loadVehicles()}
          isRefreshing={sheetStatus === "loading" || isInstantSyncing}
        />
      ) : activeTab === "attente_achat" ? (
        <AcheterView
          vehicles={vehicles}
          onUpdateAvancement={saveVehicleAvancement}
          onSelectVehicle={(v) => {
            setSelectedVehicleId(v.id);
            setVehiculeModalData(v);
          }}
          savingVehicleId={savingVehicleId}
          canEdit={permissions.canEditEtat}
          userTeam={role === "chef_equipe" ? activeChefEquipeTeam : undefined}
          isChefEquipe={role === "chef_equipe"}
          onMarquerLivrer={handleMarquerAchatLivrer}
          onMarquerAttente={handleMarquerAchatAttente}
          onRefresh={() => void loadVehicles()}
          isRefreshing={sheetStatus === "loading" || isInstantSyncing}
        />
      ) : activeTab === "devis" ? (
        <DevisView
          vehicles={vehicles}
          onUpdateAvancement={saveVehicleAvancement}
          onSelectVehicle={(v) => {
            setSelectedVehicleId(v.id);
            setVehiculeModalData(v);
          }}
          savingVehicleId={savingVehicleId}
          canEdit={permissions.canEditEtat}
          userTeam={role === "chef_equipe" ? activeChefEquipeTeam : undefined}
          isChefEquipe={role === "chef_equipe"}
          onRefresh={() => void loadVehicles()}
          isRefreshing={sheetStatus === "loading" || isInstantSyncing}
        />
      ) : activeTab === "plan_atelier" ? (
        <main className="plan-stage" ref={planStageRef}>
          <section className="map-panel" aria-label="Plan d'Atelier Mécanique">
            <div className="map-toolbar">
              <div className="map-toolbar-brand">
                <p className="panel-kicker">Synoptique Atelier Mécanique</p>
                <h2>Plan d'Atelier Haute Précision</h2>
              </div>

              <div className="map-toolbar-divider" />

              {/* Statuts Horizontaux */}
              <div className="map-statuses-bar">
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
              </div>

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
              onMouseLeave={hideVehicleDetails}
              onMouseMove={handleMapHover}
              ref={mapRef}
            />
          </section>

          <aside
            className={`panel detail-panel ${
              selectedVehicle ? "detail-open" : ""
            } ${isDetailPinned ? "detail-pinned" : ""}`}
            aria-label="Fiche synoptique du véhicule"
          >
            {selectedVehicle && (
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
                    <span>Technicien</span>
                    <strong>{displayText(selectedVehicle.technicien)}</strong>
                  </div>
                  <div>
                    <span>NOM DE Technicien</span>
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
            )}
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
                          className={`status-row ${
                            activeFilter === status.label ? "status-row-active" : ""
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
                  disabled={isInstantSyncing || sheetStatus === "loading"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-2xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Synchroniser et actualiser à l'instant tout le tableau de chargement"
                >
                  <RefreshCw size={13} className={isInstantSyncing ? "animate-spin text-amber-700" : "text-amber-700"} />
                  {isInstantSyncing ? "Actualisation..." : "Actualiser à l'instant"}
                </button>
              )}
              <a
                className="sheet-link"
                href={VEHICLE_SHEET_URL}
                rel="noreferrer"
                target="_blank"
              >
                Google Sheets
              </a>
              <span
                className={`sheet-state sheet-state-${sheetStatus}`}
                title={sheetError}
              >
                {sheetStatus === "loading"
                  ? "Chargement"
                  : sheetStatus === "ready"
                    ? "Connecté"
                    : "Secours"}
              </span>
              <span className="panel-total">{filteredRows.length}</span>
            </div>
          </div>

          {/* Bannière de notification des transferts pour Chef d'Équipe */}
          {role === "chef_equipe" && incomingTransfers.length > 0 && (
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
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        !enCoursTransferOnly
                          ? "bg-white text-blue-700 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Tous ({vehicles.filter((v) => isEnCours(v.etatIntervention, v.avancement, v.technicien) && isVehicleMatchingTeam(v.equipe || "", activeChefEquipeTeam)).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnCoursTransferOnly(true)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                        enCoursTransferOnly
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

          {sheetStatus === "fallback" && (
            <div className="table-alert">
              Google Sheets n'est pas accessible. Partage la feuille en lecture
              avec toute personne ayant le lien.
            </div>
          )}

          {sheetStatus === "ready" && missingMapZones.length > 0 && (
            <div className="table-alert table-alert-info">
              Emplacements absents du plan:{" "}
              {missingMapZones.slice(0, 8).join(", ")}
              {missingMapZones.length > 8 ? "..." : ""}
            </div>
          )}

          {!canWriteToSheet && !writeError && (
            <div className="table-alert table-alert-info">
              Écriture Sheets à configurer: déploie le script Apps Script puis
              ajoute VITE_SHEET_WRITE_URL dans .env.local.
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
                  className={`monitor-table vehicle-detail-table ${
                    isChefEquipeChargement
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
                      <col className="col-state" />
                      <col className="col-emplacement" />
                      <col className="col-action" />
                    </colgroup>
                  ) : isEnCoursTab ? (
                    <colgroup>
                      <col className="col-or" />
                      <col className="col-client" />
                      <col className="col-marque" />
                      <col className="col-modele" />
                      <col className="col-chassis" />
                      <col className="col-state" />
                      <col className="col-tech" />
                      <col className="col-tech-name" />
                      {role !== "chef_equipe" && <col className="col-team" />}
                      <col className="col-avancement" />
                      <col className="col-emplacement" />
                      <col className="col-action" />
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
                      <col className="col-categorie" />
                      <col className="col-tech" />
                      <col className="col-tech-name" />
                      <col className="col-team" />
                      <col className="col-avancement" />
                      <col className="col-state" />
                      <col className="col-emplacement" />
                      <col className="col-action" />
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
                        <th>Etat</th>
                        <th>Emplacement</th>
                        <th>Fiche</th>
                      </tr>
                    ) : isEnCoursTab ? (
                      <tr>
                        <th>OR</th>
                        <th>Client</th>
                        <th>Marque</th>
                        <th>Modèle</th>
                        <th>N° Chassis</th>
                        <th>Etat</th>
                        <th>Technicien</th>
                        <th>NOM DE Technicien</th>
                        {role !== "chef_equipe" && <th>Équipe</th>}
                        <th>Avancement</th>
                        <th>Emplacement</th>
                        <th>Fiche</th>
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
                        <th>Catégorie</th>
                        <th>Technicien</th>
                        <th>NOM DE Technicien</th>
                        <th>Équipe</th>
                        <th>Avancement</th>
                        <th>Etat</th>
                        <th>Emplacement</th>
                        <th>Fiche</th>
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
                        row.equipe && row.equipe !== "-"
                          ? row.equipe
                          : activeChefEquipeTeam || "Daily1";
                      const allowedAvancementOptions =
                        getAvancementOptionsForTeam(teamForOptions, row);
                      const pct = parseAvancementPct(row.avancement);

                      const isTransferPending =
                        Boolean(row.bloc && row.bloc > 1) &&
                        (!row.technicien || row.technicien === "-") &&
                        normalizeTeamName(row.equipe || "") === normalizeTeamName(activeChefEquipeTeam || "");

                      // Sous-blocs réutilisables de cellules
                      const renderCellEtat = () => (
                        <td>
                          <div className="flex items-center gap-1.5">
                            <select
                              aria-label={`Modifier Etat ${row.no}`}
                              className="state-editor"
                              disabled={isSaving || !permissions.canEditEtat}
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

                              {editableStatusOptions.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>

                            {permissions.canEditEtat && isAttenteReparation(row.etatIntervention) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingEnCoursVehicle(row);
                                  setIsOnlyTechChange(false);
                                  setIsTechModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                                title="Affecter un technicien de l'équipe et passer En cours"
                              >
                                <Play size={10} className="fill-white" />
                                <span>En cours</span>
                              </button>
                            )}
                          </div>
                        </td>
                      );

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
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate">{displayText(row.nomTechnicien)}</span>
                              {permissions.canEditEtat && (
                                <Wrench size={11} className="text-slate-300 hover:text-blue-600 shrink-0" />
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
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                  row.equipe.toLowerCase().includes("daily1")
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

                      const renderCellAvancement = () => (
                        <td>
                          {permissions.canEditEtat ? (
                            <div className="flex flex-col gap-1 min-w-[140px] max-w-[160px]">
                              <select
                                aria-label={`Modifier Avancement ${row.no}`}
                                className="avancement-editor"
                                disabled={isSaving || !permissions.canEditEtat}
                                style={getAvancementStyle(row.avancement)}
                                value={row.avancement && row.avancement !== "-" ? row.avancement : "-"}
                                onChange={(e) => void saveVehicleAvancement(row, e.target.value)}
                                title="Avancement - Choisissez l'avancement de 10% à 100%."
                              >
                                {(!row.avancement || row.avancement === "-") && (
                                  <option value="-">- Définir -</option>
                                )}
                                {row.avancement &&
                                  row.avancement !== "-" &&
                                  !allowedAvancementOptions.includes(row.avancement) && (
                                    <option value={row.avancement}>{row.avancement}</option>
                                  )}
                                {allowedAvancementOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              {pct !== null && (
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      pct === 100
                                        ? "bg-emerald-500"
                                        : pct > 40
                                        ? "bg-blue-500"
                                        : "bg-amber-500"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          ) : row.avancement && row.avancement !== "-" ? (
                            <div className="flex flex-col gap-1 min-w-[120px] max-w-[135px]">
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border truncate max-w-[95px] ${
                                    row.avancement.toLowerCase().includes("termin")
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
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      pct === 100
                                        ? "bg-emerald-500"
                                        : pct > 40
                                        ? "bg-blue-500"
                                        : "bg-amber-500"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs font-semibold">-</span>
                          )}
                        </td>
                      );

                      const renderCellEmplacement = () => (
                        <td>
                          <div className="emplacement-editor">
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
                        </td>
                      );

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
                          className={`${
                            selectedVehicleId === row.id ? "table-row-selected" : ""
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
                              {renderCellEtat()}
                              {renderCellEmplacement()}
                              {renderCellFiche()}
                            </>
                          ) : isEnCoursTab ? (
                            /* CAS 2 : Interventions En cours (OR, Client, Marque, Modèle, N° Chassis, Etat, Tech, Nom Tech, Avancement, Emplacement, Fiche) */
                            <>
                              <td>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{displayText(row.l2n2500 || row.no)}</span>
                                  {(Boolean(row.bloc && row.bloc > 1) || Boolean(row.equipe1 && row.equipe1 !== "-" && normalizeTeamName(row.equipe1) !== normalizeTeamName(activeChefEquipeTeam || ""))) && (
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
                              {renderCellEtat()}
                              {renderCellTech()}
                              {renderCellNomTech()}
                              {role !== "chef_equipe" && renderCellEquipe()}
                              {renderCellAvancement()}
                              {renderCellEmplacement()}
                              {renderCellFiche()}
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
                              <td>{displayText(row.categorie)}</td>
                              {renderCellTech()}
                              {renderCellNomTech()}
                              {renderCellEquipe()}
                              {renderCellAvancement()}
                              {renderCellEtat()}
                              {renderCellEmplacement()}
                              {renderCellFiche()}
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
                              ? 8
                              : isEnCoursTab
                              ? role === "chef_equipe"
                                ? 11
                                : 12
                              : 16
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
                noOr: vehiculeModalData.l2n2500 || vehiculeModalData.no || vehiculeModalData.ordre,
                cs: vehiculeModalData.cs,
                chassis: vehiculeModalData.chassis,
                nomClient: vehiculeModalData.client,
                dateEntree: vehiculeModalData.dateEntree,
                heureEntree: vehiculeModalData.heureEntree,
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
                emplacement: vehiculeModalData.emplacement,
                sheetRowNumber: vehiculeModalData.sheetRowNumber,
              }
            : null
        }
        canEdit={false}
      />

      {/* Notification Flottante - Transfert Entrant avec 2 choix */}
      {role === "chef_equipe" && unhandledTransfers.length > 0 && (
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

      {/* Notification Flottante - Pièces Achat Livrées avec Bouton Accepter et Reprendre */}
      {deliveredAchatNotifications.length > 0 && (
        <div className="fixed top-24 right-6 z-50 max-w-sm w-full animate-in fade-in slide-from-top-4 duration-300 pointer-events-auto flex flex-col gap-3">
          {deliveredAchatNotifications.slice(0, 2).map((item) => (
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
                      📦 Pièces Livrées !
                    </h3>
                    <p className="text-[11px] text-emerald-800 font-semibold mt-0.5">
                      Prêt pour reprise en atelier • {item.timestamp}
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
                  <span className="text-slate-500">Pièce livrée :</span>
                  <div className="text-right">
                    <span className="font-bold text-emerald-800">{item.demande.ref}</span>
                    <span className="text-[10px] text-slate-500 ml-1">({item.demande.designation})</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAcceptDeliveredAchat(item)}
                  className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  title="Accepter et reprendre l'intervention en cours"
                >
                  <CheckCircle2 size={16} />
                  <span>Accepter & Reprendre</span>
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

      {/* Modal Affectation Technicien */}
      <AffecterTechnicienModal
        isOpen={isTechModalOpen}
        vehicle={pendingEnCoursVehicle}
        assignedTeam={
          role === "chef_equipe"
            ? (activeChefEquipeTeam || "Daily1")
            : (pendingEnCoursVehicle?.equipe && pendingEnCoursVehicle.equipe !== "-"
                ? pendingEnCoursVehicle.equipe
                : (activeChefEquipeTeam || "Daily1"))
        }
        equipeMembers={
          equipeData?.members && equipeData.members.length > 0
            ? equipeData.members
            : DEFAULT_EQUIPE_MAPPINGS
        }
        isOnlyTechnicienChange={isOnlyTechChange}
        isTransferAcceptance={isTransferAcceptanceModal}
        canChangeTeam={role !== "chef_equipe"}
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
            await saveVehicleAvancement(v, "ATENDE DEVIS", undefined, undefined, devis);
          }
        }}
      />
    </div>
  );
}
