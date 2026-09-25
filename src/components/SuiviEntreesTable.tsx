import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  RefreshCcw,
  Plus,
  Car,
  Filter,
  Calendar,
  ShieldCheck,
  AlertCircle,
  FileSpreadsheet,
  ChevronRight,
  MapPin,
  Clock,
  Wrench,
  CheckCircle2,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowDownUp,
  Sparkles,
  Lock,
  Loader2,
  Check,
  Settings,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import {
  fetchSuiviEntreesData,
  fetchGoogleSheetFluxData,
  updateReceptionRowEtat,
  updateReceptionRowEmplacement,
  isGoogleSheetWriteConfigured,
  DELIVERED_EMPLACEMENT,
  DEFAULT_SUIVI_GID,
  DEFAULT_SHEET_GID,
  VEHICLE_SHEET_URL,
} from "../services/googleSheets";
import type { Flux, WorkshopStatus } from "../data/mockData";
import { useRole } from "../context/RoleContext";
import NouvelleEntreeModal from "./NouvelleEntreeModal";
import NouveauVinModal from "./NouveauVinModal";
import ModifierEntreeModal from "./ModifierEntreeModal";
import ConfirmationSuppressionModal from "./ConfirmationSuppressionModal";
import GoogleSheetConfigModal from "./GoogleSheetConfigModal";
import DetailVehiculeModal from "./DetailVehiculeModal";

export interface UnifiedReceptionRow {
  id: string;
  sheetRowNumber: number;
  chargementRowNumber?: number;
  suiviRowNumber?: number;
  orderIndex: number;
  noOr: string;
  cs: string;
  chassis: string;
  immatriculation?: string;
  nomClient: string;
  codeClient?: string;
  etat: string;
  equipe: string;
  matricule: string;
  nomTechnicien?: string;
  avancement: string;
  dateFinRep: string;
  emplacement: string;
  dateEntreeHeure?: string;
  marque?: string;
  modele?: string;
  categorie?: string;
}

type SortField =
  | "dateEntreeHeure"
  | "noOr"
  | "immatriculation"
  | "nomClient"
  | "etat"
  | "equipe"
  | "matricule"
  | "avancement"
  | "dateFinRep"
  | "emplacement";

type SortDirection = "asc" | "desc";

function normalizeKey(value?: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isAvancementTermine(avancement?: string): boolean {
  if (!avancement) return false;
  const clean = avancement.toLowerCase().trim();
  return (
    clean.includes("termin") ||
    clean.includes("fini") ||
    clean === "100%" ||
    clean.includes("100%")
  );
}

function parseDateEntreeTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const str = String(dateStr).trim();
  if (str.includes("1899")) return 0;

  // gviz Date(YYYY, M, D, H, M, S)
  const gvizMatch = str.match(
    /Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?\)/i
  );
  if (gvizMatch) {
    const year = Number(gvizMatch[1]);
    const month = Number(gvizMatch[2]);
    const day = Number(gvizMatch[3]);
    const hour = Number(gvizMatch[4] || 0);
    const minute = Number(gvizMatch[5] || 0);
    const second = Number(gvizMatch[6] || 0);
    if (year <= 1900) return 0;
    return new Date(year, month, day, hour, minute, second).getTime();
  }

  // French format: DD/MM/YYYY or DD-MM-YYYY with optional HH:mm:ss
  const frMatch = str.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2})[:hH](\d{2})(?::(\d{2}))?)?/
  );
  if (frMatch) {
    const day = Number(frMatch[1]);
    const month = Number(frMatch[2]) - 1;
    let year = Number(frMatch[3]);
    if (year < 100) year += 2000;
    const hour = Number(frMatch[4] || 0);
    const minute = Number(frMatch[5] || 0);
    const second = Number(frMatch[6] || 0);
    if (year <= 1900) return 0;
    return new Date(year, month, day, hour, minute, second).getTime();
  }

  // ISO format: YYYY-MM-DD
  const isoMatch = str.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const hour = Number(isoMatch[4] || 0);
    const minute = Number(isoMatch[5] || 0);
    const second = Number(isoMatch[6] || 0);
    if (year <= 1900) return 0;
    return new Date(year, month, day, hour, minute, second).getTime();
  }

  const parsed = Date.parse(str);
  if (Number.isFinite(parsed)) {
    const d = new Date(parsed);
    if (d.getFullYear() > 1900) return parsed;
  }

  return 0;
}

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr || dateStr.includes("1899")) return "-";

  const gvizMatch = dateStr.match(
    /Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?\)/i
  );
  if (gvizMatch) {
    const y = gvizMatch[1];
    const m = String(Number(gvizMatch[2]) + 1).padStart(2, "0");
    const d = String(Number(gvizMatch[3])).padStart(2, "0");
    const hh = String(Number(gvizMatch[4] || 0)).padStart(2, "0");
    const mm = String(Number(gvizMatch[5] || 0)).padStart(2, "0");
    return `${d}/${m}/${y} ${hh}:${mm}`;
  }

  return dateStr;
}

function parseAvancementPct(value: string): number | null {
  if (!value || value === "-") return null;
  const lower = value.toLowerCase();
  if (lower.includes("termin")) return 100;
  const match = value.match(/(\d{1,3})\s*%/);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : null;
  }
  return null;
}

export default function SuiviEntreesTable() {
  const { permissions } = useRole();
  const [items, setItems] = useState<UnifiedReceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedEquipe, setSelectedEquipe] = useState<string>("Toutes");
  const [selectedEtat, setSelectedEtat] = useState<string>("Tous");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVinModalOpen, setIsVinModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<UnifiedReceptionRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<UnifiedReceptionRow | null>(null);
  const [detailRow, setDetailRow] = useState<UnifiedReceptionRow | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  // Saving state for live updates on État / Emplacement
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [writeActive, setWriteActive] = useState(() => isGoogleSheetWriteConfigured());

  // Default sort: Date Entrée et Heure descending (newest entries and new N° OR at the top)
  const [sortField, setSortField] = useState<SortField>("dateEntreeHeure");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [suiviData, chargementData] = await Promise.all([
        fetchSuiviEntreesData(),
        fetchGoogleSheetFluxData().catch((err) => {
          console.warn("Tableaux de chargement fallback:", err);
          return [] as Flux[];
        }),
      ]);

      const fluxByOr = new Map<string, Flux>();
      const fluxByChassis = new Map<string, Flux>();

      chargementData.forEach((row) => {
        const orKey = normalizeKey(row.ordre || row.no);
        const chKey = normalizeKey(row.chassis);
        if (orKey) fluxByOr.set(orKey, row);
        if (chKey) fluxByChassis.set(chKey, row);
      });

      const matchedOrs = new Set<string>();

      const merged: UnifiedReceptionRow[] = suiviData.map((s, idx) => {
        const orKey = normalizeKey(s.noOr);
        const chKey = normalizeKey(s.chassis);
        const f = fluxByOr.get(orKey) || fluxByChassis.get(chKey);

        if (orKey) matchedOrs.add(orKey);
        if (chKey) matchedOrs.add(chKey);

        const equipe =
          f?.equipe && f.equipe !== "-" ? f.equipe : s.equipe || "-";
        const matricule =
          f?.technicien && f.technicien !== "-"
            ? f.technicien
            : s.technicien || "-";
        const nomTechnicien =
          f?.nomTechnicien && f.nomTechnicien !== "-"
            ? f.nomTechnicien
            : s.nomTechnicien || "";
        const avancement =
          f?.avancement && f.avancement !== "-"
            ? f.avancement
            : s.avancement || "-";
        const dateFinRep =
          f?.dateFinRep && f.dateFinRep !== "-"
            ? f.dateFinRep
            : s.dateFinRep || "-";
        const emplacement = f?.emplacement || "NA";
        const etat =
          f?.etatIntervention || f?.statut || s.etat || "En attente";
        const immatriculation =
          s.immatriculation || f?.immatriculation || f?.serie || "-";

        return {
          id: `suivi-${s.id || idx}`,
          sheetRowNumber: f?.sheetRowNumber || s.sheetRowNumber || idx + 2,
          chargementRowNumber: f?.sheetRowNumber,
          suiviRowNumber: s.sheetRowNumber || idx + 2,
          orderIndex: idx,
          noOr: s.noOr || f?.ordre || f?.no || "-",
          cs: s.cs || f?.cs || "-",
          chassis: s.chassis || f?.chassis || "-",
          immatriculation,
          nomClient: s.nomClient || f?.client || "Client non spécifié",
          codeClient: s.codeClient,
          etat,
          equipe,
          matricule,
          nomTechnicien,
          avancement,
          dateFinRep,
          emplacement,
          dateEntreeHeure: s.dateEntreeHeure || f?.dateEntree,
          marque: s.marque || f?.marque || "IVECO",
          modele: s.modele || f?.modele || "-",
          categorie: s.categorie || f?.categorie,
        };
      });

      chargementData.forEach((f, idx) => {
        const orKey = normalizeKey(f.ordre || f.no);
        const chKey = normalizeKey(f.chassis);
        if ((orKey && matchedOrs.has(orKey)) || (chKey && matchedOrs.has(chKey))) {
          return;
        }

        merged.push({
          id: `charge-${f.id || idx}`,
          sheetRowNumber: f.sheetRowNumber || 1000 + idx,
          chargementRowNumber: f.sheetRowNumber,
          suiviRowNumber: undefined,
          orderIndex: 1000 + idx,
          noOr: f.ordre || f.no || "-",
          cs: f.cs || "-",
          chassis: f.chassis || "-",
          immatriculation: f.immatriculation || f.serie || "-",
          nomClient: f.client || "Client non spécifié",
          etat: f.etatIntervention || f.statut || "En cours",
          equipe: f.equipe || "-",
          matricule: f.technicien || "-",
          nomTechnicien: f.nomTechnicien,
          avancement: f.avancement || "-",
          dateFinRep: f.dateFinRep || "-",
          emplacement: f.emplacement || "NA",
          dateEntreeHeure: f.dateEntree,
          marque: f.marque || "IVECO",
          modele: f.modele || "-",
          categorie: f.categorie,
        });
      });

      setItems(merged);

      const now = new Date();
      setLastRefreshed(
        `${String(now.getHours()).padStart(2, "0")}:${String(
          now.getMinutes()
        ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
      );
    } catch (err) {
      if (!silent) {
        setError(
          err instanceof Error
            ? err.message
            : "Erreur lors du chargement des données unifiées."
        );
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      setWriteActive(isGoogleSheetWriteConfigured());
    }
  }, []);

  useEffect(() => {
    loadData(false);

    // Synchronisation en direct toutes les 3 secondes
    const interval = setInterval(() => {
      loadData(true);
    }, 3000);

    const handleRefreshRequested = () => {
      loadData(true);
    };
    window.addEventListener("flux_refresh_requested", handleRefreshRequested);

    return () => {
      clearInterval(interval);
      window.removeEventListener("flux_refresh_requested", handleRefreshRequested);
    };
  }, [loadData]);

  // Action: Changer l'État (autorisé quand AVANCEMENT = Terminer)
  const handleUpdateEtat = async (
    item: UnifiedReceptionRow,
    nextEtat: WorkshopStatus | string
  ) => {
    if (!isAvancementTermine(item.avancement)) {
      setNotice("Modification impossible : les réparations ne sont pas terminées.");
      return;
    }

    const previousEtat = item.etat;
    const previousEmplacement = item.emplacement;
    const isNowLivré = nextEtat.toLowerCase().includes("livr");
    const nextEmplacement = isNowLivré
      ? DELIVERED_EMPLACEMENT
      : item.emplacement;

    setSavingRowId(item.id);
    setNotice(null);

    // Optimistic UI update
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, etat: nextEtat, emplacement: nextEmplacement }
          : row
      )
    );

    try {
      if (isGoogleSheetWriteConfigured()) {
        await updateReceptionRowEtat(item, nextEtat);
        if (isNowLivré && nextEmplacement !== previousEmplacement) {
          await updateReceptionRowEmplacement(item, nextEmplacement).catch(
            () => {}
          );
        }
        setNotice(
          `Dossier ${item.noOr} mis à jour : État passé à "${nextEtat}" ${
            isNowLivré ? `(Emplacement : ${DELIVERED_EMPLACEMENT})` : ""
          }.`
        );
      } else {
        setNotice(
          `Dossier ${item.noOr} mis à jour en local : État "${nextEtat}". (Pour enregistrer dans Google Sheets, configurez VITE_SHEET_WRITE_URL).`
        );
      }
    } catch (err) {
      // Revert on error
      setItems((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, etat: previousEtat, emplacement: previousEmplacement }
            : row
        )
      );
      setNotice(
        err instanceof Error
          ? `Erreur : ${err.message}`
          : "Impossible de modifier l'état dans Google Sheets."
      );
    } finally {
      setSavingRowId(null);
    }
  };

  // Action: Changer l'Emplacement (autorisé quand AVANCEMENT = Terminer)
  const handleUpdateEmplacement = async (
    item: UnifiedReceptionRow,
    nextEmplacement: string
  ) => {
    if (!isAvancementTermine(item.avancement)) {
      setNotice("Modification impossible : les réparations ne sont pas terminées.");
      return;
    }

    if (!nextEmplacement || nextEmplacement === item.emplacement) return;

    const previousEmplacement = item.emplacement;
    setSavingRowId(item.id);
    setNotice(null);

    // Optimistic UI update
    setItems((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, emplacement: nextEmplacement } : row
      )
    );

    try {
      if (isGoogleSheetWriteConfigured()) {
        await updateReceptionRowEmplacement(item, nextEmplacement);
        setNotice(
          `Emplacement ${item.noOr} mis à jour : ${previousEmplacement} -> ${nextEmplacement}.`
        );
      } else {
        setNotice(
          `Emplacement ${item.noOr} mis à jour en local : ${nextEmplacement}. (Configurez VITE_SHEET_WRITE_URL pour Google Sheets).`
        );
      }
    } catch (err) {
      // Revert on error
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, emplacement: previousEmplacement } : row
        )
      );
      setNotice(
        err instanceof Error
          ? `Erreur : ${err.message}`
          : "Impossible de modifier l'emplacement dans Google Sheets."
      );
    } finally {
      setSavingRowId(null);
    }
  };

  // Handle column header clicks for instant sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      if (
        field === "dateEntreeHeure" ||
        field === "noOr" ||
        field === "avancement" ||
        field === "dateFinRep"
      ) {
        setSortDirection("desc");
      } else {
        setSortDirection("asc");
      }
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60 group-hover:opacity-100 shrink-0" />
      );
    }
    return sortDirection === "desc" ? (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
    );
  };

  const equipes = useMemo(() => {
    const list = Array.from(
      new Set(
        items
          .map((e) => e.equipe.trim())
          .filter((eq) => eq && eq !== "-" && eq.toLowerCase() !== "na")
      )
    ).sort();
    return ["Toutes", ...list];
  }, [items]);

  const etats = useMemo(() => {
    const list = Array.from(
      new Set(
        items
          .map((e) => e.etat.trim())
          .filter((et) => et && et !== "-" && et.toLowerCase() !== "na")
      )
    ).sort();
    return ["Tous", ...list];
  }, [items]);

  const stats = useMemo(() => {
    const total = items.length;
    let enCours = 0;
    let attente = 0;
    let livre = 0;

    items.forEach((item) => {
      const e = item.etat.toLowerCase();
      if (e.includes("livr") || e.includes("termin")) {
        livre++;
      } else if (e.includes("attente")) {
        attente++;
      } else {
        enCours++;
      }
    });

    return { total, enCours, attente, livre };
  }, [items]);

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesEquipe =
        selectedEquipe === "Toutes" || item.equipe.trim() === selectedEquipe;
      const matchesEtat =
        selectedEtat === "Tous" || item.etat.trim() === selectedEtat;

      if (!matchesEquipe || !matchesEtat) return false;
      if (!q) return true;

      const haystack = [
        item.noOr,
        item.cs,
        item.chassis,
        item.immatriculation,
        item.nomClient,
        item.codeClient,
        item.dateEntreeHeure,
        item.etat,
        item.equipe,
        item.matricule,
        item.nomTechnicien,
        item.avancement,
        item.dateFinRep,
        item.emplacement,
        item.marque,
        item.modele,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });

    return filtered.sort((a, b) => {
      let comparison = 0;

      if (sortField === "dateEntreeHeure") {
        const tsA = parseDateEntreeTimestamp(a.dateEntreeHeure);
        const tsB = parseDateEntreeTimestamp(b.dateEntreeHeure);

        if (tsB !== tsA) {
          return sortDirection === "desc" ? tsB - tsA : tsA - tsB;
        }

        // Si dates égales ou non parsables, respecter l'ordre d'insertion en tête de tableau (lignes du haut en premier)
        return sortDirection === "desc"
          ? (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
          : (b.orderIndex ?? 0) - (a.orderIndex ?? 0);
      }

      if (sortField === "noOr") {
        comparison = b.noOr.localeCompare(a.noOr, undefined, { numeric: true });
        return sortDirection === "desc" ? comparison : -comparison;
      }

      if (sortField === "nomClient") {
        comparison = a.nomClient.localeCompare(b.nomClient);
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (sortField === "etat") {
        comparison = a.etat.localeCompare(b.etat);
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (sortField === "equipe") {
        comparison = a.equipe.localeCompare(b.equipe);
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (sortField === "matricule") {
        comparison = a.matricule.localeCompare(b.matricule, undefined, { numeric: true });
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (sortField === "immatriculation") {
        comparison = (a.immatriculation || "").localeCompare(b.immatriculation || "");
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (sortField === "avancement") {
        const pctA = parseAvancementPct(a.avancement) ?? -1;
        const pctB = parseAvancementPct(b.avancement) ?? -1;
        comparison = pctB - pctA;
        return sortDirection === "desc" ? comparison : -comparison;
      }

      if (sortField === "emplacement") {
        comparison = a.emplacement.localeCompare(b.emplacement, undefined, { numeric: true });
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (sortField === "dateFinRep") {
        comparison = a.dateFinRep.localeCompare(b.dateFinRep);
        return sortDirection === "desc" ? comparison : -comparison;
      }

      const orderA = typeof a.orderIndex === "number" ? a.orderIndex : 0;
      const orderB = typeof b.orderIndex === "number" ? b.orderIndex : 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return (a.sheetRowNumber ?? 0) - (b.sheetRowNumber ?? 0);
    });
  }, [
    items,
    search,
    selectedEquipe,
    selectedEtat,
    sortField,
    sortDirection,
  ]);

  const getEtatBadge = (etat: string) => {
    const e = (etat || "").toLowerCase();
    if (e.includes("livr") || e.includes("termin")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (e.includes("attente client")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    if (e.includes("attente rep") || e.includes("pdr")) {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    if (e.includes("cours")) {
      return "bg-blue-50 text-blue-700 border-blue-200";
    }
    if (e.includes("exterieur")) {
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    }
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  const getEquipeBadge = (equipe: string) => {
    if (!equipe || equipe === "-") {
      return "bg-slate-100 text-slate-400 border-slate-200";
    }
    const eq = equipe.toLowerCase();
    if (eq.includes("daily")) {
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
    if (eq.includes("changan")) {
      return "bg-orange-50 text-orange-700 border-orange-200";
    }
    if (eq.includes("rapide")) {
      return "bg-sky-50 text-sky-700 border-sky-200";
    }
    if (eq.includes("lourd")) {
      return "bg-purple-50 text-purple-700 border-purple-200";
    }
    return "bg-teal-50 text-teal-700 border-teal-200";
  };

  const getEmplacementBadge = (emplacement: string) => {
    const emp = (emplacement || "").trim().toUpperCase();
    if (!emp || emp === "NA" || emp === "-") {
      return {
        bg: "bg-slate-100 text-slate-400 border-slate-200",
        label: "Non assigné",
      };
    }
    if (emp.includes("LIVRAISON")) {
      return {
        bg: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
        label: "Livraison au client",
      };
    }
    if (emp.startsWith("L")) {
      return {
        bg: "bg-blue-100 text-blue-800 border-blue-300 font-extrabold",
        label: emp,
      };
    }
    if (emp.startsWith("J")) {
      return {
        bg: "bg-teal-100 text-teal-800 border-teal-300 font-extrabold",
        label: emp,
      };
    }
    return {
      bg: "bg-amber-100 text-amber-800 border-amber-300 font-bold",
      label: emp,
    };
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-slate-900/10 p-3 md:p-6 overflow-y-auto">
      {/* Top Header Card */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-5 border border-white/60 shadow-lg mb-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Suivi des Entrées & Avancement Atelier
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Vue Réception Unifiée
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
                  <Clock className="w-3 h-3 text-emerald-600" />
                  Tri : Date Entrée & Heure
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center flex-wrap gap-2">
                <span>
                  Données fusionnées : <strong>Suivi des entrées</strong> +{" "}
                  <strong>Tableaux de chargement</strong>
                </span>
                {lastRefreshed && (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-[11px] font-semibold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    En direct (4s) • {lastRefreshed}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Top Quick Actions */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Bouton de statut/configuration Google Sheets */}
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                writeActive
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                  : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 shadow-2xs animate-pulse"
              }`}
              title="Configurer l'enregistrement automatique dans Google Sheets"
            >
              {writeActive ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Google Sheets Connecté</span>
                </>
              ) : (
                <>
                  <Settings className="w-3.5 h-3.5 text-amber-600" />
                  <span>Activer Synchro Google Sheets</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
              title="Recharger les données Google Sheets"
            >
              <RefreshCcw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Actualiser
            </button>

            {permissions.canAddEntree ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsVinModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl shadow-xs transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  title="Enregistrer un nouveau N° de Châssis dans la base VIN (Réception)"
                >
                  <Car className="w-4 h-4 text-blue-600" />
                  + Ajouter VIN
                </button>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl shadow-md shadow-emerald-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Nouvelle Entrée
                </button>
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 cursor-not-allowed"
                title="Ajout réservé au profil Réception et Chef d'Atelier."
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Ajout réservé à la Réception
              </div>
            )}
          </div>
        </div>

        {/* Action Notice Bar */}
        {notice && (
          <div className="mt-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center flex-wrap gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-semibold">{notice}</span>
              {!writeActive && (
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(true)}
                  className="ml-2 px-2.5 py-1 text-[11px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  ⚡ Activer la synchronisation Google Sheets
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-bold text-blue-500 hover:text-blue-800 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-200/60 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">
                {stats.total}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Dossiers
              </div>
            </div>
          </div>

          <div className="bg-blue-50/70 rounded-xl p-2.5 border border-blue-200/60 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-blue-900">
                {stats.enCours}
              </div>
              <div className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
                En Atelier / Cours
              </div>
            </div>
          </div>

          <div className="bg-amber-50/70 rounded-xl p-2.5 border border-amber-200/60 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-900">
                {stats.attente}
              </div>
              <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
                En Attente
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/70 rounded-xl p-2.5 border border-emerald-200/60 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-900">
                {stats.livre}
              </div>
              <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
                Livrés / Prêts
              </div>
            </div>
          </div>
        </div>

        {/* Search & Quick Filters Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par N° OR, Date, CS, Châssis, Client, Équipe, N° Matricule, Emplacement..."
              className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2.5 w-full md:w-auto">
            {/* Quick Sort Dropdown */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <ArrowDownUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "dateEntreeHeure-desc") {
                    setSortField("dateEntreeHeure");
                    setSortDirection("desc");
                  } else if (val === "dateEntreeHeure-asc") {
                    setSortField("dateEntreeHeure");
                    setSortDirection("asc");
                  } else if (val === "noOr-desc") {
                    setSortField("noOr");
                    setSortDirection("desc");
                  } else if (val === "noOr-asc") {
                    setSortField("noOr");
                    setSortDirection("asc");
                  } else if (val === "nomClient-asc") {
                    setSortField("nomClient");
                    setSortDirection("asc");
                  } else if (val === "avancement-desc") {
                    setSortField("avancement");
                    setSortDirection("desc");
                  }
                }}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full sm:w-auto cursor-pointer"
              >
                <option value="dateEntreeHeure-desc">
                  Tri : Date Entrée & Heure (Nouveaux au sommet)
                </option>
                <option value="dateEntreeHeure-asc">
                  Tri : Date Entrée & Heure (Plus anciens d'abord)
                </option>
                <option value="noOr-desc">
                  Tri : N° OR décroissant (N° élevés)
                </option>
                <option value="noOr-asc">
                  Tri : N° OR croissant (Plus anciens)
                </option>
                <option value="nomClient-asc">Tri : Client (A → Z)</option>
                <option value="avancement-desc">
                  Tri : Avancement (% décroissant)
                </option>
              </select>
            </div>

            {/* Filter Équipe */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedEquipe}
                onChange={(e) => setSelectedEquipe(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full sm:w-auto cursor-pointer"
              >
                {equipes.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq === "Toutes" ? "Toutes les équipes" : `Équipe: ${eq}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter État */}
            <div className="w-full sm:w-auto">
              <select
                value={selectedEtat}
                onChange={(e) => setSelectedEtat(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full sm:w-auto cursor-pointer"
              >
                {etats.map((et) => (
                  <option key={et} value={et}>
                    {et === "Tous" ? "Tous les états" : et}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="font-bold">Erreur de chargement Google Sheets</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => loadData(false)}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 font-semibold rounded-lg text-xs cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Main Unified Table */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-white/60 shadow-lg flex-1 flex flex-col min-h-[460px] overflow-hidden">
        <div className="overflow-x-auto flex-1">
          <table className="w-full min-w-[1280px] text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px] select-none sticky top-0 z-10 backdrop-blur-md">
                {/* 1. N° OR */}
                <th
                  onClick={() => handleSort("noOr")}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Cliquez pour trier par N° OR"
                >
                  <div className="flex items-center gap-1.5">
                    <span>N° OR</span>
                    {renderSortIndicator("noOr")}
                  </div>
                </th>

                {/* 2. Date Entrée & Heure */}
                <th
                  onClick={() => handleSort("dateEntreeHeure")}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Cliquez pour trier par Date Entrée & Heure (nouveaux au sommet)"
                >
                  <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold">
                    <span>Date Entrée & Heure</span>
                    {renderSortIndicator("dateEntreeHeure")}
                  </div>
                </th>

                {/* 3. CS */}
                <th className="py-3 px-3 whitespace-nowrap">CS</th>

                {/* 4. N° Châssis */}
                <th className="py-3 px-3.5 whitespace-nowrap">N° Châssis</th>

                {/* 4b. N° Immatriculation */}
                <th
                  onClick={() => handleSort("immatriculation")}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Cliquez pour trier par N° Immatriculation"
                >
                  <div className="flex items-center gap-1.5">
                    <span>N° Immatriculation</span>
                    {renderSortIndicator("immatriculation")}
                  </div>
                </th>

                {/* 5. Client */}
                <th
                  onClick={() => handleSort("nomClient")}
                  className="py-3 px-4 min-w-[190px] cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Cliquez pour trier par Client"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Client</span>
                    {renderSortIndicator("nomClient")}
                  </div>
                </th>

                {/* 6. État (Modifiable si Avancement = Terminer) */}
                <th
                  onClick={() => handleSort("etat")}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="État du véhicule (modifiable si Avancement = Terminer)"
                >
                  <div className="flex items-center gap-1.5">
                    <span>État</span>
                    {renderSortIndicator("etat")}
                  </div>
                </th>

                {/* 7. EQUIPE */}
                <th
                  onClick={() => handleSort("equipe")}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Cliquez pour trier par Équipe"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Équipe</span>
                    {renderSortIndicator("equipe")}
                  </div>
                </th>

                {/* 8. N° Matricule */}
                <th
                  onClick={() => handleSort("matricule")}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Cliquez pour trier par N° Matricule"
                >
                  <div className="flex items-center gap-1.5">
                    <span>N° Matricule</span>
                    {renderSortIndicator("matricule")}
                  </div>
                </th>

                {/* 9. AVANCEMENT */}
                <th
                  onClick={() => handleSort("avancement")}
                  className="py-3 px-3.5 min-w-[140px] cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Cliquez pour trier par Avancement %"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Avancement</span>
                    {renderSortIndicator("avancement")}
                  </div>
                </th>

                {/* 10. Date Fin Rép. */}
                <th
                  onClick={() => handleSort("dateFinRep")}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Cliquez pour trier par Date Fin"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Date Fin Rép.</span>
                    {renderSortIndicator("dateFinRep")}
                  </div>
                </th>

                {/* 11. Emplacement (Modifiable si Avancement = Terminer) */}
                <th
                  onClick={() => handleSort("emplacement")}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-200/60 transition-colors group"
                  title="Emplacement atelier (modifiable si Avancement = Terminer)"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Emplacement</span>
                    {renderSortIndicator("emplacement")}
                  </div>
                </th>

                {/* 12. Actions (Modifier / Supprimer) */}
                <th className="py-3 px-3.5 whitespace-nowrap text-center sticky right-0 bg-slate-100/95 backdrop-blur-md shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] z-10">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <RefreshCcw className="w-7 h-7 animate-spin text-emerald-600" />
                      <p className="font-semibold text-slate-700 text-sm">
                        Chargement des données unifiées Réception & Atelier...
                      </p>
                      <p className="text-xs text-slate-400">
                        Synchronisation avec les feuilles Google Sheets en cours
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Car className="w-9 h-9 text-slate-300" />
                      <p className="font-bold text-slate-700 text-sm">
                        Aucun dossier trouvé
                      </p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {search || selectedEquipe !== "Toutes" || selectedEtat !== "Tous"
                          ? "Aucun résultat ne correspond à vos filtres. Essayez de réinitialiser la recherche."
                          : "La base de données est actuellement vide."}
                      </p>
                      {(search || selectedEquipe !== "Toutes" || selectedEtat !== "Tous") && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch("");
                            setSelectedEquipe("Toutes");
                            setSelectedEtat("Tous");
                            setSortField("dateEntreeHeure");
                            setSortDirection("desc");
                          }}
                          className="mt-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Réinitialiser les filtres
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                (() => {
                  const nowTs = Date.now();
                  return filteredData.map((item) => {
                    const pct = parseAvancementPct(item.avancement);
                    const empBadge = getEmplacementBadge(item.emplacement);
                    const itemTs = parseDateEntreeTimestamp(item.dateEntreeHeure);
                    const isRecent =
                      itemTs > 0 &&
                      nowTs - itemTs < 24 * 60 * 60 * 1000 &&
                      nowTs >= itemTs - 60000;
                    const canEdit = isAvancementTermine(item.avancement);
                    const isSaving = savingRowId === item.id;
                    const isDelivered =
                      item.etat.toLowerCase().includes("livr") ||
                      item.etat.toLowerCase().includes("termin");

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setDetailRow(item)}
                      className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                      title="Cliquer pour voir la fiche détaillée et la condition du véhicule"
                    >
                      {/* 1. N° OR */}
                      <td className="py-3 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block px-2 py-1 rounded-md bg-slate-100 group-hover:bg-white text-slate-800 border border-slate-200/80 font-mono text-[11px] shadow-2xs font-semibold">
                            {item.noOr || "-"}
                          </span>
                          {isRecent && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                              title="Nouvelle Entrée Récente"
                            >
                              <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                              Nouveau
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Date Entrée & Heure */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {item.dateEntreeHeure && !item.dateEntreeHeure.includes("1899") ? (
                          <div className="flex items-center gap-1.5 text-slate-800 font-semibold text-[11px]">
                            <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-mono">
                              {formatDisplayDate(item.dateEntreeHeure)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">
                            -
                          </span>
                        )}
                      </td>

                      {/* 3. CS */}
                      <td className="py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">
                        <span className="text-xs font-mono font-bold text-slate-700">
                          {item.cs || "-"}
                        </span>
                      </td>

                      {/* 4. N° Châssis */}
                      <td className="py-3 px-3.5 font-mono text-slate-700 tracking-tight text-[11px] whitespace-nowrap">
                        {item.chassis || "-"}
                      </td>

                      {/* 4b. N° Immatriculation */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {item.immatriculation && item.immatriculation !== "-" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                            {item.immatriculation}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">-</span>
                        )}
                      </td>

                      {/* 5. Client */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 leading-snug">
                          {item.nomClient}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                          {item.marque && (
                            <span className="font-bold text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200/60">
                              {item.marque}
                            </span>
                          )}
                          {item.modele && item.modele !== "-" && (
                            <span className="font-medium text-slate-600">
                              {item.modele}
                            </span>
                          )}
                          {item.codeClient && (
                            <span className="text-slate-400 font-mono">
                              • {item.codeClient}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 6. État : Débloqué quand AVANCEMENT = Terminer */}
                      <td
                        onClick={(e) => e.stopPropagation()}
                        className="py-3 px-3.5 whitespace-nowrap"
                      >
                        {isSaving ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                            <span>Mise à jour...</span>
                          </div>
                        ) : canEdit ? (
                          <div className="flex items-center gap-2">
                            {/* Sélecteur d'état rapide ou bouton passer à Livré */}
                            {isDelivered ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  Livré
                                </span>
                                <select
                                  value="Livré"
                                  onChange={(e) =>
                                    handleUpdateEtat(item, e.target.value)
                                  }
                                  className="text-[10px] bg-slate-50 border border-slate-200 text-slate-600 rounded px-1.5 py-0.5 cursor-pointer hover:bg-slate-100"
                                  title="Changer l'état"
                                >
                                  <option value="Livré">Livré</option>
                                  <option value="Attente Client">Attente Client</option>
                                  <option value="En cours">En cours</option>
                                </select>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getEtatBadge(
                                    item.etat
                                  )}`}
                                >
                                  {item.etat || "Attente client"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateEtat(item, "Livré")}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 rounded-lg shadow-xs transition-all cursor-pointer"
                                  title="Passer à Livré (réparations terminées)"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Livrer</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1"
                            title="Modification bloquée : réparations en cours (Avancement != Terminer)"
                          >
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getEtatBadge(
                                item.etat
                              )}`}
                            >
                              {item.etat || "En attente"}
                            </span>
                            <Lock className="w-3 h-3 text-slate-300" />
                          </div>
                        )}
                      </td>

                      {/* 7. EQUIPE */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {item.equipe && item.equipe !== "-" ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${getEquipeBadge(
                              item.equipe
                            )}`}
                          >
                            {item.equipe}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">
                            Non affecté
                          </span>
                        )}
                      </td>

                      {/* 8. N°Matricule */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {item.matricule && item.matricule !== "-" ? (
                          <div className="leading-tight">
                            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                              {item.matricule}
                            </span>
                            {item.nomTechnicien && item.nomTechnicien !== "-" && (
                              <div
                                className="text-[10px] font-medium text-slate-600 mt-0.5 max-w-[130px] truncate"
                                title={item.nomTechnicien}
                              >
                                {item.nomTechnicien}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">
                            -
                          </span>
                        )}
                      </td>

                      {/* 9. AVANCEMENT */}
                      <td className="py-3 px-3.5">
                        {item.avancement && item.avancement !== "-" ? (
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span
                                className={`text-[11px] font-bold truncate max-w-[130px] ${
                                  canEdit ? "text-emerald-700" : "text-slate-800"
                                }`}
                                title={item.avancement}
                              >
                                {item.avancement}
                              </span>
                              {pct !== null && (
                                <span className="text-[10px] font-extrabold text-slate-500 font-mono">
                                  {pct}%
                                </span>
                              )}
                            </div>
                            {pct !== null && (
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                                <div
                                  className={`h-full rounded-full transition-all ${
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
                          <span className="text-slate-300 italic text-[11px]">
                            En attente
                          </span>
                        )}
                      </td>

                      {/* 10. Date Fin Rép */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {item.dateFinRep && item.dateFinRep !== "-" ? (
                          <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11px]">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{item.dateFinRep}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">
                            Non définie
                          </span>
                        )}
                      </td>

                      {/* 11. Emplacement : Modifiable quand AVANCEMENT = Terminer */}
                      <td
                        onClick={(e) => e.stopPropagation()}
                        className="py-3 px-3.5 whitespace-nowrap"
                      >
                        {isSaving ? (
                          <div className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                            <span>Sauvegarde...</span>
                          </div>
                        ) : canEdit ? (
                          <div className="relative inline-flex items-center gap-1">
                            <select
                              value={item.emplacement}
                              onChange={(e) =>
                                handleUpdateEmplacement(item, e.target.value)
                              }
                              className={`text-[11px] font-extrabold border rounded-lg px-2 py-1 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs ${empBadge.bg}`}
                              title="Modifier l'emplacement (autorisé car Avancement = Terminer)"
                            >
                              <option value={item.emplacement}>
                                {empBadge.label} (actuel)
                              </option>
                              <option value="Livraison au client">
                                🚚 Livraison au client
                              </option>
                              <optgroup label="Zones Attente Client (L)">
                                {["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"].map(
                                  (z) => (
                                    <option key={z} value={z}>
                                      Zone {z}
                                    </option>
                                  )
                                )}
                              </optgroup>
                              <optgroup label="Zones Daily (D)">
                                {[
                                  "D1",
                                  "D2",
                                  "D3",
                                  "D4",
                                  "D5",
                                  "D6",
                                  "D7",
                                  "D8",
                                ].map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zones Changan / JMC (J)">
                                {["J1", "J2", "J3", "J4", "J5", "J6"].map(
                                  (z) => (
                                    <option key={z} value={z}>
                                      Zone {z}
                                    </option>
                                  )
                                )}
                              </optgroup>
                              <optgroup label="Autres zones atelier">
                                {[
                                  "S11",
                                  "S21",
                                  "S22",
                                  "E1",
                                  "E2",
                                  "C1",
                                  "C2",
                                ].map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1"
                            title="Emplacement verrouillé : réparations en cours (Avancement != Terminer)"
                          >
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border ${empBadge.bg} shadow-2xs`}
                            >
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>{empBadge.label}</span>
                            </span>
                            <Lock className="w-3 h-3 text-slate-300" />
                          </div>
                        )}
                      </td>

                      {/* 12. Actions : Détails, Modifier & Supprimer */}
                      <td
                        onClick={(e) => e.stopPropagation()}
                        className="py-3 px-3.5 whitespace-nowrap text-center sticky right-0 bg-white group-hover:bg-slate-50/90 transition-colors shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailRow(item)}
                            className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200/70 transition-all cursor-pointer shadow-2xs group/btn"
                            title={`Voir la fiche détaillée et la condition du véhicule (OR ${item.noOr})`}
                          >
                            <Eye className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRow(item)}
                            className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-200/70 transition-all cursor-pointer shadow-2xs group/btn"
                            title={`Modifier le dossier ${item.noOr}`}
                          >
                            <Pencil className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingRow(item)}
                            className="p-1.5 rounded-lg text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200/70 transition-all cursor-pointer shadow-2xs group/btn"
                            title={`Supprimer le dossier ${item.noOr}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()
            )}
          </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            Affichage de{" "}
            <span className="font-bold text-slate-800">
              {filteredData.length}
            </span>{" "}
            sur <span className="font-bold text-slate-800">{items.length}</span>{" "}
            dossiers (tri actif :{" "}
            <span className="font-semibold text-emerald-700">
              {sortField === "dateEntreeHeure"
                ? `Date Entrée & Heure (${sortDirection === "desc" ? "Plus récents au sommet" : "Plus anciens d'abord"})`
                : sortField === "noOr"
                ? `N° OR (${sortDirection})`
                : `${sortField} (${sortDirection})`}
            </span>
            )
          </div>

          <div className="flex items-center gap-4">
            <a
              href={`${VEHICLE_SHEET_URL}#gid=${DEFAULT_SUIVI_GID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 hover:text-emerald-800 font-semibold hover:underline inline-flex items-center gap-1"
            >
              Suivi des entrées
              <ChevronRight className="w-3 h-3" />
            </a>
            <span className="text-slate-300">•</span>
            <a
              href={`${VEHICLE_SHEET_URL}#gid=${DEFAULT_SHEET_GID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-1"
            >
              Tableaux de chargement
              <ChevronRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Modal d'ajout nouvelle entrée */}
      <NouvelleEntreeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(newEntry) => {
          if (newEntry && newEntry.noOr) {
            const rowToAdd: UnifiedReceptionRow = {
              id: `suivi-new-${Date.now()}`,
              sheetRowNumber: 2,
              orderIndex: -1,
              noOr: newEntry.noOr || "-",
              cs: newEntry.cs || "-",
              chassis: newEntry.chassis || "-",
              immatriculation: (newEntry as any)?.immatriculation || (newEntry as any)?.serie || "-",
              nomClient: newEntry.nomClient || "Client non spécifié",
              codeClient: newEntry.codeClient,
              etat: "Attente réparation",
              equipe: newEntry.equipe || "-",
              matricule: "-",
              nomTechnicien: "",
              avancement: "-",
              dateFinRep: "-",
              emplacement: "NA",
              dateEntreeHeure: newEntry.dateEntreeHeure,
              marque: newEntry.marque || "IVECO",
              modele: newEntry.modele || "-",
              categorie: newEntry.categorie,
            };
            setItems((prev) => [rowToAdd, ...prev.filter((p) => p.noOr !== newEntry.noOr)]);
            setNotice(
              `Nouvelle entrée OR ${newEntry.noOr} ajoutée avec succès en tête du tableau avec horodatage automatique.`
            );
          }
          setSortField("dateEntreeHeure");
          setSortDirection("desc");
          setTimeout(() => loadData(true), 1200);
        }}
      />

      {/* Modal d'enregistrement d'un nouveau VIN (Réception sécurisée sans consultation) */}
      <NouveauVinModal
        isOpen={isVinModalOpen}
        onClose={() => setIsVinModalOpen(false)}
        onSuccess={(newChassis) => {
          setNotice(`Véhicule ${newChassis} enregistré avec succès dans la base VIN.`);
        }}
      />

      {/* Modal de modification d'une entrée existante */}
      <ModifierEntreeModal
        isOpen={!!editingRow}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSuccess={(updatedNoOr) => {
          setNotice(`Dossier ${updatedNoOr || ""} mis à jour avec succès dans Google Sheets.`);
          loadData();
        }}
      />

      {/* Modal de confirmation de suppression d'une entrée */}
      <ConfirmationSuppressionModal
        isOpen={!!deletingRow}
        row={deletingRow}
        onClose={() => setDeletingRow(null)}
        onSuccess={(deletedNoOr) => {
          setNotice(`Dossier ${deletedNoOr || ""} supprimé avec succès de Google Sheets.`);
          loadData();
        }}
      />

      {/* Modal de configuration de l'écriture directe Google Sheets */}
      <GoogleSheetConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onConfigured={() => {
          setWriteActive(isGoogleSheetWriteConfigured());
          loadData();
        }}
      />

      {/* Modal de consultation des détails complets et de la condition du véhicule */}
      <DetailVehiculeModal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        vehicule={detailRow}
        onEdit={(v) => {
          const target = items.find((i) => i.id === v.id) || detailRow;
          if (target) setEditingRow(target);
        }}
        canEdit={permissions.canAddEntree || permissions.canViewAll}
      />
    </div>
  );
}
