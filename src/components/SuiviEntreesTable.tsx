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
  TableProperties,
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
  Pencil,
  Trash2,
  Eye,
  RotateCcw,
  Send,
} from "lucide-react";
import {
  fetchSuiviEntreesData,
  fetchDatabaseFluxData,
  isDatabaseWriteConfigured,
  updateReceptionRowEtat,
  updateReceptionRowEmplacement,
  livrerVehiculeReception,
  reouvrirOrLivre,
  traiterRetourReouvert,
  DELIVERED_EMPLACEMENT,
} from "../services/database";
import { EMPLACEMENT_ZONES, FULL_PARKING_EMPLACEMENT, normalizeEmplacementCode } from "../services/emplacementService";
import type { Flux, WorkshopStatus } from "../data/mockData";
import { useRole } from "../context/RoleContext";
import { useAuth } from "../context/AuthContext";
import NouvelleEntreeModal from "./NouvelleEntreeModal";
import NouveauVinModal from "./NouveauVinModal";
import ModifierEntreeModal from "./ModifierEntreeModal";
import ConfirmationSuppressionModal from "./ConfirmationSuppressionModal";
import DetailVehiculeModal from "./DetailVehiculeModal";
import { recordVehicleModification } from "../services/timeTracking";

export interface SuiviEntreesTableProps {
  onNavigateToMap?: (emplacement: string) => void;
  initialNotice?: string | null;
}

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
  statutAcceptation?: string;
  dateAcceptation?: string;
  dateMiseEnAttente?: string;
  acceptePar?: string;
  dateDebutRep?: string;
  dateDebutTravail?: string;
  heureDebutTravail?: string;
  modePaiement?: string;
  statutFacturation?: string;
  statutFacturationFinale?: string;
  facturationValideePar?: string;
  dateValidationFacturation?: string;
  dateLivraisonClient?: string;
  livrePar?: string;
  recordKey?: string;
  interventionId?: string;
  interventionNumero?: number;
  retourVehicule?: boolean;
  statutRetour?: string;
  descriptionRetour?: string;
  dateRetour?: string;
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

export function isVehiculeLivre(item: {
  etat?: string;
  avancement?: string;
  emplacement?: string;
  statut?: string;
  etatIntervention?: string;
  dateLivraisonClient?: string;
}): boolean {
  const etat = String(item.etat || "").toLowerCase();
  const statut = String(item.statut || "").toLowerCase();
  const etatIntervention = String(item.etatIntervention || "").toLowerCase();
  const avancement = String(item.avancement || "").toLowerCase();
  const dateLivraison = String(item.dateLivraisonClient || "").trim();

  if (
    etat.includes("livr") ||
    statut.includes("livr") ||
    etatIntervention.includes("livr") ||
    avancement.includes("livr")
  ) {
    return true;
  }
  if (dateLivraison && dateLivraison !== "-" && dateLivraison !== "NA") {
    return true;
  }
  return false;
}

function parseDateEntreeTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const str = String(dateStr).trim();
  if (str.includes("1899")) return 0;

  // Ancien format Date(YYYY, M, D, H, M, S)
  const serializedDateMatch = str.match(
    /Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?\)/i
  );
  if (serializedDateMatch) {
    const year = Number(serializedDateMatch[1]);
    const month = Number(serializedDateMatch[2]);
    const day = Number(serializedDateMatch[3]);
    const hour = Number(serializedDateMatch[4] || 0);
    const minute = Number(serializedDateMatch[5] || 0);
    const second = Number(serializedDateMatch[6] || 0);
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

  const serializedDateMatch = dateStr.match(
    /Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?(?:,\s*(\d{1,2}))?\)/i
  );
  if (serializedDateMatch) {
    const y = serializedDateMatch[1];
    const m = String(Number(serializedDateMatch[2]) + 1).padStart(2, "0");
    const d = String(Number(serializedDateMatch[3])).padStart(2, "0");
    const hh = String(Number(serializedDateMatch[4] || 0)).padStart(2, "0");
    const mm = String(Number(serializedDateMatch[5] || 0)).padStart(2, "0");
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


export default function SuiviEntreesTable({ onNavigateToMap, initialNotice }: SuiviEntreesTableProps = {}) {
  const { permissions, role } = useRole();
  const { currentUser } = useAuth();
  const assignedReceptionCs = role === "reception" ? (currentUser?.assignedTeam || "").trim().toUpperCase() : "";
  // Seuls l'Administration et le Chef d'Atelier ont accès à la colonne ACTIONS (Modifier, Supprimer).
  // La Réception n'a pas accès à la colonne ACTIONS (pas de suppression ni modification de fiche).
  const canManageActions = role === "administration" || role === "chef_atelier";
  const canManageEntries = role !== "chef_equipe";
  const canViewDetails = role !== "chef_equipe";
  const [items, setItems] = useState<UnifiedReceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedEquipe, setSelectedEquipe] = useState<string>("Toutes");
  const [selectedEtat, setSelectedEtat] = useState<string>("Tous");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoricalModalOpen, setIsHistoricalModalOpen] = useState(false);
  const [isVinModalOpen, setIsVinModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<UnifiedReceptionRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<UnifiedReceptionRow | null>(null);
  const [detailRow, setDetailRow] = useState<UnifiedReceptionRow | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  // Saving state for live updates on État / Emplacement
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice || null);

  useEffect(() => {
    if (initialNotice) {
      setNotice(initialNotice);
    }
  }, [initialNotice]);

  // Modal Mode de paiement (affiché quand on clique « Livrer » en override Direction)
  const [paiementModal, setPaiementModal] = useState<{
    item: UnifiedReceptionRow;
    mode: string;
  } | null>(null);
  const [returnReceptionModal, setReturnReceptionModal] = useState<UnifiedReceptionRow | null>(null);
  const [returnDescription, setReturnDescription] = useState("");
  const [returnTeam, setReturnTeam] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);

  const MODES_PAIEMENT = [
    { value: "Facture",                 icon: "📄" },
    { value: "Bon de commande",         icon: "📋" },
    { value: "Att Facture",             icon: "📑" },
    { value: "Édition fin de travaux",  icon: "📑" },
    { value: "Espèces",                 icon: "💵" },
    { value: "Chèque",                  icon: "📝" },
    { value: "Virement",                icon: "🏦" },
    { value: "Carte bancaire",          icon: "💳" },
    { value: "Autre",                   icon: "⚙️" },
  ];

  const RETURN_TEAMS = ["Daily1", "Daily2", "Changan", "Lourd", "Service Rapide", "Électrique", "Carrosserie"];

  const handleReopenOr = async (item: UnifiedReceptionRow) => {
    if (!window.confirm(`Réouvrir l'OR ${item.noOr} ? L'intervention livrée sera conservée dans l'historique et une nouvelle intervention sera envoyée à la Réception.`)) return;
    setSavingRowId(item.id);
    setNotice(null);
    try {
      const result = await reouvrirOrLivre(item);
      setNotice(result.message || `OR ${item.noOr} réouvert et envoyé à la Réception.`);
      await loadData(false);
    } catch (err) {
      setNotice(err instanceof Error ? `Impossible de réouvrir l'OR : ${err.message}` : "Impossible de réouvrir l'OR.");
    } finally {
      setSavingRowId(null);
    }
  };

  const openReturnReceptionModal = (item: UnifiedReceptionRow) => {
    setReturnReceptionModal(item);
    setReturnDescription(item.descriptionRetour || "");
    setReturnTeam("");
  };

  const handleSendReopenedReturn = async () => {
    if (!returnReceptionModal || !returnDescription.trim() || !returnTeam) return;
    setReturnSaving(true);
    try {
      await traiterRetourReouvert({
        recordKey: returnReceptionModal.recordKey || returnReceptionModal.id,
        noOr: returnReceptionModal.noOr,
        chassis: returnReceptionModal.chassis,
        descriptionRetour: returnDescription.trim(),
        equipe: returnTeam,
      });
      setNotice(`Retour de l'OR ${returnReceptionModal.noOr} envoyé à l'équipe ${returnTeam}.`);
      setReturnReceptionModal(null);
      await loadData(false);
    } catch (err) {
      setNotice(err instanceof Error ? `Impossible d'envoyer le retour : ${err.message}` : "Impossible d'envoyer le retour à l'équipe.");
    } finally {
      setReturnSaving(false);
    }
  };

  // Livraison avec modal (pour override Direction si aucun mode prédéfini)
  const handleConfirmLivraison = async () => {
    if (!paiementModal || !paiementModal.mode) return;
    const { item, mode } = paiementModal;
    const previousRow = item;
    setPaiementModal(null);

    // Optimistic UI update : pour la réception, le véhicule livré disparaît immédiatement de la vue
    setSavingRowId(item.id);
    setNotice(null);
    setItems((current) =>
      role === "reception"
        ? current.filter((row) => row.id !== item.id)
        : current.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  etat: "Livré",
                  emplacement: DELIVERED_EMPLACEMENT,
                  dateLivraisonClient: new Date().toLocaleString("fr-FR"),
                }
              : row
          )
    );

    try {
      if (isDatabaseWriteConfigured()) {
        await livrerVehiculeReception(item, mode);
        setNotice(
          `Dossier ${item.noOr} livré — Mode de paiement : ${mode}. Emplacement : ${DELIVERED_EMPLACEMENT}.`
        );
      } else {
        setNotice(
          `Dossier ${item.noOr} livré en local (mode : ${mode}). (Configurez DATABASE_URL pour enregistrer dans PostgreSQL).`
        );
      }
      recordVehicleModification(
        item,
        "Véhicule livré",
        `Mode de paiement : ${mode} • Emplacement : ${DELIVERED_EMPLACEMENT}`,
      );
    } catch (err) {
      // Revert on error
      setItems((current) => {
        if (role === "reception") {
          const exists = current.some((r) => r.id === previousRow.id);
          return exists ? current : [previousRow, ...current];
        }
        return current.map((row) =>
          row.id === previousRow.id
            ? { ...row, etat: previousRow.etat, emplacement: previousRow.emplacement }
            : row
        );
      });
      setNotice(
        err instanceof Error
          ? `Erreur livraison : ${err.message}`
          : "Impossible d'enregistrer la livraison dans PostgreSQL."
      );
    } finally {
      setSavingRowId(null);
    }
  };

  // Livraison directe pour la Réception une fois le dossier validé par la Facturation (« À livrer »)
  const handleConfirmLivraisonDirect = async (item: UnifiedReceptionRow) => {
    const mode = item.modePaiement || "Facture";
    const previousRow = item;
    setSavingRowId(item.id);
    setNotice(null);

    // Optimistic UI update : le véhicule livré disparaît immédiatement pour la Réception
    setItems((current) =>
      role === "reception"
        ? current.filter((row) => row.id !== item.id)
        : current.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  etat: "Livré",
                  emplacement: DELIVERED_EMPLACEMENT,
                  dateLivraisonClient: new Date().toLocaleString("fr-FR"),
                }
              : row
          )
    );

    try {
      if (isDatabaseWriteConfigured()) {
        await livrerVehiculeReception(item, mode);
        setNotice(
          `Dossier ${item.noOr} livré au client. Véhicule sorti d'atelier (Mode : ${mode}).`
        );
      } else {
        setNotice(
          `Dossier ${item.noOr} livré au client (mode : ${mode}).`
        );
      }
      recordVehicleModification(
        item,
        "Véhicule livré",
        `Le client a récupéré son véhicule • Mode de paiement : ${mode} • Emplacement : ${DELIVERED_EMPLACEMENT}`,
      );
    } catch (err) {
      // Revert on error
      setItems((current) => {
        if (role === "reception") {
          const exists = current.some((r) => r.id === previousRow.id);
          return exists ? current : [previousRow, ...current];
        }
        return current.map((row) =>
          row.id === previousRow.id
            ? { ...row, etat: previousRow.etat, emplacement: previousRow.emplacement }
            : row
        );
      });
      setNotice(
        err instanceof Error
          ? `Erreur livraison : ${err.message}`
          : "Impossible d'enregistrer la livraison du véhicule."
      );
    } finally {
      setSavingRowId(null);
    }
  };

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
        fetchDatabaseFluxData().catch((err) => {
          console.warn("Tableaux de chargement fallback:", err);
          return [] as Flux[];
        }),
      ]);

      const fluxByOr = new Map<string, Flux>();
      const fluxByChassis = new Map<string, Flux>();

      const interventionKey = (row: Record<string, unknown>) => {
        const intervention = String(row.interventionId || row.recordKey || "").trim();
        return intervention ? `intervention:${intervention}` : "";
      };

      chargementData.forEach((row) => {
        const orKey = normalizeKey(row.ordre || row.no);
        const chKey = normalizeKey(row.chassis);
        const key = interventionKey(row as unknown as Record<string, unknown>);
        if (key) fluxByOr.set(key, row);
        if (orKey) fluxByOr.set(orKey, row);
        if (chKey) fluxByChassis.set(chKey, row);
      });

      const matchedOrs = new Set<string>();

      const merged: UnifiedReceptionRow[] = suiviData.map((s, idx) => {
        const orKey = normalizeKey(s.noOr);
        const chKey = normalizeKey(s.chassis);
        const ownInterventionKey = interventionKey(s as unknown as Record<string, unknown>);
        // Un même véhicule peut revenir avec un nouvel OR. L'OR identifie le
        // dossier de travail ; le châssis ne sert de secours que sans OR.
        const f = (ownInterventionKey ? fluxByOr.get(ownInterventionKey) : undefined) || fluxByOr.get(orKey) || (!orKey ? fluxByChassis.get(chKey) : undefined);

        if (orKey) matchedOrs.add(orKey);
        else if (chKey) matchedOrs.add(chKey);

        const equipe =
          s.equipe && s.equipe !== "-" ? s.equipe : f?.equipe && f.equipe !== "-" ? f.equipe : "-";
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
        const isLivre =
          String(s.etat || "").toLowerCase().includes("livr") ||
          String(f?.etatIntervention || "").toLowerCase().includes("livr") ||
          String(f?.statut || "").toLowerCase().includes("livr") ||
          Boolean((s as any).dateLivraisonClient || (f as any)?.dateLivraisonClient);

        const emplacement = isLivre
          ? DELIVERED_EMPLACEMENT
          : (f?.emplacement && f.emplacement !== "NA" && f.emplacement !== "-"
              ? f.emplacement
              : (s as any).emplacement || "NA");

        const etat = isLivre
          ? "Livré"
          : (f?.etatIntervention || f?.statut || s.etat || "En attente");

        const immatriculation =
          s.immatriculation || f?.immatriculation || f?.serie || "-";

        return {
          id: String((s as any).recordKey || s.id || `suivi-${idx}`),
          recordKey: String((s as any).recordKey || (f as any)?.recordKey || ""),
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
          statutAcceptation: f?.statutAcceptation || (s as any).statutAcceptation,
          dateAcceptation: f?.dateAcceptation || (s as any).dateAcceptation,
          dateMiseEnAttente: f?.dateMiseEnAttente || (s as any).dateMiseEnAttente,
          acceptePar: f?.acceptePar || (s as any).acceptePar,
          dateDebutRep: f?.dateDebutRep || (s as any).dateDebutRep || f?.dateDebutTravail || (s as any).dateDebutTravail,
          dateDebutTravail: f?.dateDebutTravail || (s as any).dateDebutTravail || f?.dateDebutRep,
          heureDebutTravail: f?.heureDebutTravail || (s as any).heureDebutTravail,
          modePaiement: f?.modePaiement || (s as any).modePaiement,
          statutFacturation: f?.statutFacturation || (s as any).statutFacturation,
          statutFacturationFinale: f?.statutFacturationFinale || (s as any).statutFacturationFinale,
          facturationValideePar: f?.facturationValideePar || (s as any).facturationValideePar,
          dateValidationFacturation: f?.dateValidationFacturation || (s as any).dateValidationFacturation,
          dateLivraisonClient: (s as any).dateLivraisonClient || (f as any)?.dateLivraisonClient,
          livrePar: (s as any).livrePar || (f as any)?.livrePar,
          interventionId: (s as any).interventionId || (f as any)?.interventionId,
          interventionNumero: (s as any).interventionNumero || (f as any)?.interventionNumero,
          retourVehicule: Boolean((s as any).retourVehicule || (f as any)?.retourVehicule),
          statutRetour: (s as any).statutRetour || (f as any)?.statutRetour,
          descriptionRetour: (s as any).descriptionRetour || (f as any)?.descriptionRetour,
          dateRetour: (s as any).dateRetour || (f as any)?.dateRetour,
        };
      });

      chargementData.forEach((f, idx) => {
        const orKey = normalizeKey(f.ordre || f.no);
        const chKey = normalizeKey(f.chassis);
        if ((orKey && matchedOrs.has(orKey)) || (!orKey && chKey && matchedOrs.has(chKey))) {
          return;
        }

        const isLivre =
          String(f.etatIntervention || "").toLowerCase().includes("livr") ||
          String(f.statut || "").toLowerCase().includes("livr") ||
          Boolean((f as any).dateLivraisonClient);

        const etat = isLivre ? "Livré" : (f.etatIntervention || f.statut || "En cours");
        const emplacement = isLivre ? DELIVERED_EMPLACEMENT : (f.emplacement || "NA");

        merged.push({
          id: String((f as any).recordKey || f.id || `charge-${idx}`),
          recordKey: String((f as any).recordKey || ""),
          sheetRowNumber: f.sheetRowNumber || 1000 + idx,
          chargementRowNumber: f.sheetRowNumber,
          suiviRowNumber: undefined,
          orderIndex: 1000 + idx,
          noOr: f.ordre || f.no || "-",
          cs: f.cs || "-",
          chassis: f.chassis || "-",
          immatriculation: f.immatriculation || f.serie || "-",
          nomClient: f.client || "Client non spécifié",
          etat,
          equipe: f.equipe || "-",
          matricule: f.technicien || "-",
          nomTechnicien: f.nomTechnicien,
          avancement: f.avancement || "-",
          dateFinRep: f.dateFinRep || "-",
          emplacement,
          dateEntreeHeure: f.dateEntree,
          marque: f.marque || "IVECO",
          modele: f.modele || "-",
          categorie: f.categorie,
          statutAcceptation: f.statutAcceptation,
          dateAcceptation: f.dateAcceptation,
          dateMiseEnAttente: f.dateMiseEnAttente,
          acceptePar: f.acceptePar,
          dateDebutRep: f.dateDebutRep || f.dateDebutTravail,
          dateDebutTravail: f.dateDebutTravail || f.dateDebutRep,
          heureDebutTravail: f.heureDebutTravail,
          modePaiement: f.modePaiement,
          statutFacturation: f.statutFacturation,
          statutFacturationFinale: f.statutFacturationFinale,
          facturationValideePar: f.facturationValideePar,
          dateValidationFacturation: f.dateValidationFacturation,
          dateLivraisonClient: (f as any).dateLivraisonClient,
          livrePar: (f as any).livrePar,
          interventionId: (f as any).interventionId,
          interventionNumero: (f as any).interventionNumero,
          retourVehicule: Boolean((f as any).retourVehicule),
          statutRetour: (f as any).statutRetour,
          descriptionRetour: (f as any).descriptionRetour,
          dateRetour: (f as any).dateRetour,
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
      if (isDatabaseWriteConfigured()) {
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
          `Dossier ${item.noOr} mis à jour en local : État "${nextEtat}". (Pour enregistrer dans PostgreSQL, configurez DATABASE_URL).`
        );
      }
      recordVehicleModification(
        item,
        "État modifié à la réception",
        `${previousEtat || "-"} → ${nextEtat}${nextEmplacement !== previousEmplacement ? ` • Emplacement : ${previousEmplacement || "-"} → ${nextEmplacement}` : ""}`,
      );
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
          : "Impossible de modifier l'état dans PostgreSQL."
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

    const normalizedTarget = normalizeEmplacementCode(nextEmplacement);
    const isExclusiveLocation = normalizedTarget !== "NA" &&
      normalizedTarget !== DELIVERED_EMPLACEMENT &&
      normalizedTarget !== FULL_PARKING_EMPLACEMENT;
    const occupiedBy = isExclusiveLocation
      ? items.find((row) => {
          if (row.id === item.id || normalizeEmplacementCode(row.emplacement) !== normalizedTarget) return false;
          return !`${row.etat} ${row.avancement}`.toLowerCase().includes("livr");
        })
      : undefined;
    if (occupiedBy) {
      setNotice(`Emplacement ${nextEmplacement} indisponible : il est déjà occupé par le dossier ${occupiedBy.noOr || occupiedBy.chassis}.`);
      return;
    }

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
      if (isDatabaseWriteConfigured()) {
        await updateReceptionRowEmplacement(item, nextEmplacement);
        setNotice(
          `Emplacement ${item.noOr} mis à jour : ${previousEmplacement} -> ${nextEmplacement}.`
        );
      } else {
        setNotice(
          `Emplacement ${item.noOr} mis à jour en local : ${nextEmplacement}. (Configurez DATABASE_URL pour PostgreSQL).`
        );
      }
      recordVehicleModification(
        item,
        "Emplacement modifié à la réception",
        `${previousEmplacement || "-"} → ${nextEmplacement}`,
      );
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
          : "Impossible de modifier l'emplacement dans PostgreSQL."
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
    const source = role === "reception"
      ? items.filter((item) => !isVehiculeLivre(item) && (!assignedReceptionCs || item.cs.trim().toUpperCase() === assignedReceptionCs))
      : items;
    const list = Array.from(
      new Set(
        source
          .map((e) => e.etat.trim())
          .filter((et) => et && et !== "-" && et.toLowerCase() !== "na")
      )
    ).sort();
    return ["Tous", ...list];
  }, [items, role, assignedReceptionCs]);

  const stats = useMemo(() => {
    // L'historique des véhicules livrés est réservé à l'Administration.
    const visibleItems = role === "administration"
      ? items
      : items.filter((item) => !isVehiculeLivre(item) && (role !== "reception" || !assignedReceptionCs || item.cs.trim().toUpperCase() === assignedReceptionCs));
    const total = visibleItems.length;
    let enCours = 0;
    let attente = 0;
    let livre = 0;

    visibleItems.forEach((item) => {
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
  }, [items, role, assignedReceptionCs]);

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((item) => {
      // Seule l'Administration peut consulter les véhicules livrés.
      if (role !== "administration" && isVehiculeLivre(item)) {
        return false;
      }
      if (role === "reception" && assignedReceptionCs && item.cs.trim().toUpperCase() !== assignedReceptionCs) {
        return false;
      }
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
    assignedReceptionCs,
    sortField,
    sortDirection,
    role,
  ]);

  const getEtatBadge = (etat: string) => {
    const e = (etat || "").toLowerCase();
    if (e.includes("livr") || e.includes("termin")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (e.includes("attente client")) {
      return "bg-amber-50 text-amber-900 border-amber-300";
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
    if (emp.includes("LIVR")) {
      return {
        bg: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
        label: "Livraison au client",
      };
    }
    if (emp.includes("COMPLET") || emp.includes("PLEIN")) {
      return {
        bg: "bg-red-100 text-red-800 border-red-300 font-extrabold animate-pulse",
        label: FULL_PARKING_EMPLACEMENT,
      };
    }
    if (emp.startsWith("L")) {
      return {
        bg: "bg-blue-100 text-blue-800 border-blue-300 font-extrabold",
        label: emp,
      };
    }
    if (emp.startsWith("D")) {
      return {
        bg: "bg-indigo-100 text-indigo-800 border-indigo-300 font-extrabold",
        label: emp,
      };
    }
    if (emp.startsWith("J")) {
      return {
        bg: "bg-teal-100 text-teal-800 border-teal-300 font-extrabold",
        label: emp,
      };
    }
    if (emp.startsWith("E")) {
      return {
        bg: "bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold",
        label: emp,
      };
    }
    if (emp.startsWith("S")) {
      return {
        bg: "bg-amber-100 text-amber-800 border-amber-300 font-extrabold",
        label: emp,
      };
    }
    if (emp.startsWith("C")) {
      return {
        bg: "bg-rose-100 text-rose-800 border-rose-300 font-extrabold",
        label: emp,
      };
    }
    if (emp.startsWith("T") || emp.startsWith("M")) {
      return {
        bg: "bg-purple-100 text-purple-800 border-purple-300 font-extrabold",
        label: emp,
      };
    }
    if (emp.startsWith("P")) {
      return {
        bg: "bg-cyan-100 text-cyan-800 border-cyan-300 font-bold",
        label: emp,
      };
    }
    return {
      bg: "bg-slate-100 text-slate-700 border-slate-300 font-bold",
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
              <TableProperties className="w-6 h-6" />
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
            <div className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border bg-emerald-50 text-emerald-800 border-emerald-300" title="Les données sont enregistrées dans PostgreSQL">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Base SQL</span>
            </div>

            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
              title="Recharger les données PostgreSQL"
            >
              <RefreshCcw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Actualiser
            </button>

            {canManageEntries && permissions.canAddEntree ? (
              <div className="flex items-center gap-2">
                {canManageActions && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsVinModalOpen(true)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl shadow-xs transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                      title="Enregistrer un nouveau N° de Châssis dans la base VIN (Direction)"
                    >
                      <Car className="w-4 h-4 text-blue-600" />
                      + Ajouter VIN
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsHistoricalModalOpen(true)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl shadow-xs transition-all cursor-pointer"
                      title="Ajouter un véhicule ancien avec une date manuelle"
                    >
                      <Calendar className="w-4 h-4 text-amber-700" />
                      + Véhicule historique
                    </button>
                  </>
                )}

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
        <div className={`grid grid-cols-2 ${role === "reception" ? "sm:grid-cols-3" : "sm:grid-cols-4"} gap-3 mt-4 pt-4 border-t border-slate-100`}>
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

          {role !== "reception" && (
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
          )}
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
            <p className="font-bold">Erreur de chargement PostgreSQL</p>
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

                {/* 12. Actions (Modifier / Supprimer) - Réservé Direction */}
                {canManageActions && (
                  <th className="py-3 px-3.5 whitespace-nowrap text-center sticky right-0 bg-slate-100/95 backdrop-blur-md shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] z-10">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={canManageActions ? 13 : 12} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <RefreshCcw className="w-7 h-7 animate-spin text-emerald-600" />
                      <p className="font-semibold text-slate-700 text-sm">
                        Chargement des données unifiées Réception & Atelier...
                      </p>
                      <p className="text-xs text-slate-400">
                        Chargement des dossiers depuis PostgreSQL
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={canManageActions ? 13 : 12} className="py-16 text-center text-slate-400">
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
                    const isTermine =
                      isAvancementTermine(item.avancement) ||
                      item.etat === "Attente Client" ||
                      item.etat === "Prêt / Fini" ||
                      Boolean(item.modePaiement || item.dateValidationFacturation);
                    const isSaving = savingRowId === item.id;
                    const isDelivered = isVehiculeLivre(item);
                    const isReturnAwaitingReception = item.statutRetour === "a_receptionner" ||
                      String(item.etat || "").toLowerCase().includes("à réceptionner");
                    // Att Facture autorise la livraison : le règlement final
                    // intervient ensuite, à la fin du mois.
                    const hasFacturation = ["Facture", "Bon de commande", "Att Facture", "Attente Facture", "Édition fin de travaux"].includes(item.modePaiement || "");
                    const canEditEmplacement =
                      (permissions.canEditEmplacement || permissions.canViewAll) && isTermine;

                  return (
                    <tr
                      key={item.id}
                      onClick={canViewDetails ? () => setDetailRow(item) : undefined}
                      className={`hover:bg-blue-50/40 transition-colors group ${canViewDetails ? "cursor-pointer" : ""}`}
                      title={canViewDetails ? "Cliquer pour voir la fiche détaillée et la condition du véhicule" : undefined}
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
                        ) : isReturnAwaitingReception ? (
                          <div className="flex flex-col items-start gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-violet-100 text-violet-800 border border-violet-300">
                              <RotateCcw className="w-3 h-3" /> Retour véhicule – À réceptionner
                            </span>
                            {role === "reception" && (
                              <button
                                type="button"
                                onClick={() => openReturnReceptionModal(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 text-[10px] font-bold transition-colors"
                              >
                                <Send className="w-3 h-3" /> Traiter le retour
                              </button>
                            )}
                          </div>
                        ) : isDelivered ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                              <Check className="w-3 h-3 text-emerald-600" />
                              Livré
                            </span>
                            {canManageActions && (
                              <select
                                value="Livré"
                                onChange={(e) =>
                                  handleUpdateEtat(item, e.target.value)
                                }
                                className="text-[10px] bg-slate-50 border border-slate-200 text-slate-600 rounded px-1.5 py-0.5 cursor-pointer hover:bg-slate-100"
                                title="Changer l'état (Direction)"
                              >
                                <option value="Livré">Livré</option>
                                <option value="Attente Client">Attente Client</option>
                                <option value="En cours">En cours</option>
                              </select>
                            )}
                          </div>
                        ) : isTermine ? (
                          <div className="flex flex-col gap-1 items-start">
                            {/* Ligne 1 : Badge Attente Client + Bouton Livrer vert (conforme à l'image) */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getEtatBadge(
                                  item.etat || "Attente Client"
                                )}`}
                              >
                                {item.etat || "Attente Client"}
                              </span>
                              {hasFacturation ? (
                                <button
                                  type="button"
                                  onClick={() => handleConfirmLivraisonDirect(item)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-slate-900 bg-emerald-600 hover:bg-emerald-700 hover:text-white active:scale-95 shadow-2xs transition-all cursor-pointer"
                                  title={`Facturation validée (${item.modePaiement || "Facture"}). Cliquer pour confirmer et mettre Livré au client.`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-900" />
                                  <span>Livrer</span>
                                </button>
                              ) : role === "reception" ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-full shadow-2xs"
                                  title="Travaux terminés en atelier. En attente de validation du mode de paiement par la Facturation."
                                >
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Attente Facturation</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPaiementModal({ item, mode: item.modePaiement || "Facture" })
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-slate-900 bg-emerald-600 hover:bg-emerald-700 hover:text-white active:scale-95 shadow-2xs transition-all cursor-pointer"
                                  title="Choisir le mode de paiement et passer à Livré (Direction)"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-900" />
                                  <span>Livrer</span>
                                </button>
                              )}
                            </div>

                            {/* Ligne 2 : Boîte bleue Début : date/heure (affichée pour tous, Réception comprise, conforme à l'image) */}
                            {(item.dateDebutRep || item.dateDebutTravail || item.dateEntreeHeure) && (
                              <div
                                className="text-[11px] font-medium text-blue-700 bg-blue-50/90 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1.5 w-fit mt-0.5"
                                title={`Début des travaux : ${item.dateDebutRep || item.dateDebutTravail || item.dateEntreeHeure}`}
                              >
                                <Clock size={12} className="text-blue-600 shrink-0" />
                                <span>
                                  Début : {item.dateDebutRep || item.dateDebutTravail || formatDisplayDate(item.dateEntreeHeure)}
                                </span>
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

                        {/* Métadonnées temporelles et caisse additionnelles pour Direction / Facturation */}
                        {role !== "reception" && (
                          <>
                            {item.modePaiement && (
                              <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mt-1 w-fit bg-amber-50 text-amber-900 border border-amber-300" title={`Mode de paiement validé par ${item.facturationValideePar || "Facturation"} le ${item.dateValidationFacturation || ""}`}>
                                <span>💳 Caisse :</span>
                                <span className="font-extrabold">{item.modePaiement}</span>
                                {item.statutFacturationFinale === "facture" ? (
                                  <span className="text-[9px] text-emerald-800 bg-emerald-100 px-1 rounded font-black">Facturé</span>
                                ) : item.modePaiement === "Édition fin de travaux" || item.modePaiement === "Att Facture" ? (
                                  <span className="text-[9px] text-amber-900 bg-amber-200 px-1 rounded font-black">À facturer</span>
                                ) : null}
                              </div>
                            )}
                            {item.dateAcceptation && (
                              <div className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-1 w-fit" title={`Accepté par ${item.acceptePar || "le chef d'équipe"}`}>
                                ✓ Accepté : {item.dateAcceptation}
                              </div>
                            )}
                            {!isTermine && (item.dateDebutRep || item.dateDebutTravail) && (
                              <div className="text-[10px] font-semibold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 mt-1 w-fit flex items-center gap-1" title={`Début des travaux : ${item.dateDebutRep || item.dateDebutTravail}`}>
                                <Clock size={10} className="text-blue-600 shrink-0" />
                                <span>Début : {item.dateDebutRep || item.dateDebutTravail}</span>
                              </div>
                            )}
                            {item.dateMiseEnAttente && !item.dateAcceptation && (
                              <div className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 w-fit">
                                ⏸ Mis en attente : {item.dateMiseEnAttente}
                              </div>
                            )}
                          </>
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
                                  isTermine ? "text-emerald-700" : "text-slate-800"
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
                            {(item.dateDebutRep || item.dateDebutTravail) && (
                              <div className="text-[9px] font-semibold text-blue-800 bg-blue-50/80 px-1.5 py-0.5 rounded border border-blue-200/80 mt-1 w-fit flex items-center gap-1" title={`Début des travaux : ${item.dateDebutRep || item.dateDebutTravail}`}>
                                <Clock size={9} className="text-blue-600 shrink-0" />
                                <span>Début : {item.dateDebutRep || item.dateDebutTravail}</span>
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
                        ) : canEditEmplacement ? (
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
                              <option value="Place complet">
                                ⛔ Place complet
                              </option>
                              <optgroup label="Zone D — Daily1 / Daily2">
                                {EMPLACEMENT_ZONES.DAILY.map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zone J — Changan / JMC">
                                {EMPLACEMENT_ZONES.CHANGAN.map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zone E — Électrique">
                                {EMPLACEMENT_ZONES.ELECTRIQUE.map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zone S — Service Rapide">
                                {EMPLACEMENT_ZONES.SERVICE_RAPIDE.map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zone C — Carrosserie">
                                {EMPLACEMENT_ZONES.CARROSSERIE.map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zone T — Lourd (Postes T)">
                                {EMPLACEMENT_ZONES.LOURD_T.map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zone M — Lourd (Postes M)">
                                {EMPLACEMENT_ZONES.LOURD_M.map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zone L — Attente Client">
                                {EMPLACEMENT_ZONES.ATTENTE_CLIENT_L.map((z) => (
                                  <option key={z} value={z}>
                                    Zone {z}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Zone P — Parking général">
                                {EMPLACEMENT_ZONES.PARKING_P.map((z) => (
                                  <option key={z} value={z}>
                                    Parking {z}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            {onNavigateToMap && item.emplacement && item.emplacement !== "-" && item.emplacement !== "NA" && (
                              <button
                                type="button"
                                onClick={() => onNavigateToMap(item.emplacement)}
                                className="p-1 rounded-md text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition-colors cursor-pointer"
                                title={`Voir ${item.emplacement} sur le Plan d'Atelier`}
                              >
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1"
                            title={
                              onNavigateToMap && item.emplacement && item.emplacement !== "-" && item.emplacement !== "NA"
                                ? `Cliquer pour voir ${item.emplacement} sur le Plan d'Atelier`
                                : "Emplacement atelier"
                            }
                          >
                            <button
                              type="button"
                              disabled={!onNavigateToMap || !item.emplacement || item.emplacement === "-" || item.emplacement === "NA"}
                              onClick={() => onNavigateToMap?.(item.emplacement)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border ${empBadge.bg} shadow-2xs ${
                                onNavigateToMap && item.emplacement && item.emplacement !== "-" && item.emplacement !== "NA"
                                  ? "cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                                  : ""
                              }`}
                            >
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>{empBadge.label}</span>
                            </button>
                            <Lock className="w-3 h-3 text-slate-300" />
                          </div>
                        )}
                      </td>

                      {/* 12. Actions : Détails, Modifier & Supprimer (Réservé Direction) */}
                      {canManageActions && (
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
                            {role === "administration" && isDelivered && (
                              <button
                                type="button"
                                onClick={() => void handleReopenOr(item)}
                                className="inline-flex items-center gap-1 p-1.5 rounded-lg text-violet-700 hover:text-violet-900 hover:bg-violet-50 border border-violet-200 transition-all cursor-pointer shadow-2xs group/btn"
                                title={`Réouvrir l'OR ${item.noOr} et créer une nouvelle intervention à la Réception`}
                              >
                                <RotateCcw className="w-3.5 h-3.5 group-hover/btn:rotate-[-30deg] transition-transform" />
                              </button>
                            )}
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
                      )}
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

          <span>Source : PostgreSQL</span>
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
      <NouvelleEntreeModal
        isOpen={isHistoricalModalOpen}
        historique
        onClose={() => setIsHistoricalModalOpen(false)}
        onSuccess={() => {
          setIsHistoricalModalOpen(false);
          void loadData(false);
          setNotice("Véhicule historique enregistré.");
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
          setNotice(`Dossier ${updatedNoOr || ""} mis à jour dans PostgreSQL.`);
          loadData();
        }}
      />

      {/* Modal de confirmation de suppression d'une entrée */}
      <ConfirmationSuppressionModal
        isOpen={!!deletingRow}
        row={deletingRow}
        onClose={() => setDeletingRow(null)}
        onSuccess={(deletedNoOr) => {
          setNotice(`Dossier ${deletedNoOr || ""} supprimé de PostgreSQL.`);
          loadData();
        }}
      />

      {/* Modal de consultation des détails complets et de la condition du véhicule */}
      <DetailVehiculeModal
        isOpen={canViewDetails && Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        vehicule={detailRow}
        onEdit={(v) => {
          const target = items.find((i) => i.id === v.id) || detailRow;
          if (target) setEditingRow(target);
        }}
        canEdit={canManageActions}
      />

      {/* Réception : l'Administration a déjà créé la nouvelle intervention.
          La description est obligatoire avant l'envoi vers l'équipe. */}
      {returnReceptionModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-violet-200 overflow-hidden">
            <div className="px-5 py-4 bg-violet-700 text-white flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-black"><RotateCcw className="w-5 h-5" /> Retour véhicule à réceptionner</div>
                <p className="text-xs text-violet-100 mt-1">OR {returnReceptionModal.noOr} • intervention {returnReceptionModal.interventionNumero || 2}</p>
              </div>
              <button type="button" onClick={() => setReturnReceptionModal(null)} className="text-violet-100 hover:text-white text-xl leading-none" aria-label="Fermer">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">Indiquez le motif du retour, puis choisissez l’équipe qui prendra en charge la nouvelle intervention.</p>
              <label className="block text-xs font-extrabold text-slate-700">
                Description du retour <span className="text-red-600">*</span>
                <textarea
                  value={returnDescription}
                  onChange={(e) => setReturnDescription(e.target.value)}
                  rows={3}
                  placeholder="Ex. Client retourne à l’atelier : bruit moteur après réparation."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </label>
              <label className="block text-xs font-extrabold text-slate-700">
                Équipe concernée <span className="text-red-600">*</span>
                <select value={returnTeam} onChange={(e) => setReturnTeam(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="">Choisir une équipe</option>
                  {RETURN_TEAMS.map((team) => <option key={team} value={team}>{team}</option>)}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setReturnReceptionModal(null)} className="px-3 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">Annuler</button>
                <button
                  type="button"
                  disabled={returnSaving || !returnDescription.trim() || !returnTeam}
                  onClick={() => void handleSendReopenedReturn()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-700 text-white text-sm font-bold hover:bg-violet-800 disabled:opacity-50"
                >
                  {returnSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer à l’équipe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL MODE DE PAIEMENT ══════════════════════════════ */}
      {paiementModal && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setPaiementModal(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white leading-tight">Livraison du véhicule</h2>
                  <p className="text-emerald-100 text-xs font-medium">N° OR : {paiementModal.item.noOr}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaiementModal(null)}
                className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-colors cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                Sélectionnez le <span className="text-emerald-700">mode de paiement</span> avant de confirmer la livraison :
              </p>

              <div className="grid grid-cols-2 gap-3">
                {MODES_PAIEMENT.map(({ value, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaiementModal((p) => p ? { ...p, mode: value } : p)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all cursor-pointer ${
                      paiementModal.mode === value
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm"
                        : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-slate-700"
                    }`}
                  >
                    <span className="text-lg leading-none">{icon}</span>
                    <span>{value}</span>
                    {paiementModal.mode === value && (
                      <Check className="w-4 h-4 text-emerald-600 ml-auto shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Info box */}
              <div className="mt-4 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 font-medium">
                  Après confirmation, l’état passera à <strong>« Livré »</strong> et l’emplacement sera défini à <strong>« Livraison au client »</strong>.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaiementModal(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!paiementModal.mode}
                onClick={handleConfirmLivraison}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmer la livraison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
