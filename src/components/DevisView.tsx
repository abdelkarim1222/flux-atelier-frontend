import { useState, useEffect, useMemo, type CSSProperties } from "react";
import {
  FileSignature,
  Search,
  Filter,
  CheckCircle2,
  RotateCw,
  ExternalLink,
  Tag,
  Hash,
  PhoneCall,
  AlertTriangle,
  XCircle,
  Users,
  Wrench,
  Clock,
  Pencil,
  X,
  ClipboardList,
} from "lucide-react";
import type { Flux } from "../data/mockData";
import {
  getDemandesDevisLocal,
  marquerDevisAppele,
  marquerDevisAccepte,
  marquerDevisRefuse,
  marquerDevisRelance,
  saveDevisAccordNotification,
  updateDatabaseStatutDevis,
  getAvancementOptionsForTeam,
  type DemandeDevis,
} from "../services/database";

interface DevisViewProps {
  vehicles: Flux[];
  onUpdateAvancement: (
    row: Flux,
    nextAvancement: string,
    demandeAchat?: any,
    extraParams?: any,
    demandeDevis?: DemandeDevis
  ) => Promise<void> | void;
  onSelectVehicle?: (vehicle: Flux) => void;
  onViewDetail?: (vehicle: Flux) => void;
  savingVehicleId?: number | null;
  canEdit?: boolean;
  userTeam?: string;
  isChefEquipe?: boolean;
  role?: string;
  currentUser?: { name?: string; role?: string } | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onNavigateToTab?: (tab: string, filter?: string, vehicleId?: number) => void;
}

function getAvancementBadgeStyle(val?: string): CSSProperties {
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
      fontWeight: 700,
    };
  }
  if (lower.includes("termin")) {
    return {
      backgroundColor: "#ecfdf5",
      color: "#047857",
      borderColor: "#6ee7b7",
      fontWeight: 700,
    };
  }
  if (lower.includes("essai")) {
    return {
      backgroundColor: "#f5f3ff",
      color: "#6d28d9",
      borderColor: "#c4b5fd",
      fontWeight: 700,
    };
  }
  if (lower.includes("achet")) {
    return {
      backgroundColor: "#fffbeb",
      color: "#b45309",
      borderColor: "#fcd34d",
      fontWeight: 700,
    };
  }
  return {
    backgroundColor: "#eff6ff",
    color: "#1d4ed8",
    borderColor: "#93c5fd",
    fontWeight: 600,
  };
}

/**
 * Calcule si un devis dépasse 1 jour (24 heures) sans réponse du client
 */
export function isDevisDepassee24h(devis?: DemandeDevis): boolean {
  if (!devis) return false;
  if (devis.statutDevis === "Accepté" || devis.statutDevis === "Refusé") return false;

  const now = Date.now();
  // Vérification par timestamps
  const ts = devis.calledAtTimestamp || devis.createdAtTimestamp;
  if (ts) {
    const diffHours = (now - ts) / (1000 * 60 * 60);
    return diffHours >= 24;
  }

  // Vérification de secours par chaîne de date (ex: "24/09/2026")
  const dateStr = devis.dateAppel || devis.date;
  if (dateStr) {
    try {
      const parts = dateStr.split(" ")[0].split("/");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        const diffDays = (now - d.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays >= 1;
      }
    } catch {
      // Ignorer
    }
  }

  return false;
}

export default function DevisView({
  vehicles,
  onUpdateAvancement,
  onSelectVehicle,
  onViewDetail,
  savingVehicleId,
  canEdit = true,
  role = "reception",
  currentUser,
  onRefresh,
  isRefreshing = false,
  onNavigateToTab,
}: DevisViewProps) {
  const triggerViewDetail = onViewDetail || onSelectVehicle;
  const [search, setSearch] = useState("");
  const [selectedEquipe, setSelectedEquipe] = useState("Toutes");
  const [statusFilter, setStatusFilter] = useState<"tous" | "a_appeler" | "relance" | "accorde" | "refuse">("tous");
  const [demandesDevisMap, setDemandesDevisMap] = useState<Record<string, DemandeDevis>>(getDemandesDevisLocal);
  const [actionSuccessNotice, setActionSuccessNotice] = useState<{
    message: string;
    vehicleId?: number;
    techInfo?: string;
  } | null>(null);

  // Modal d'enregistrement d'appel client avec date et heure
  const [isAppelModalOpen, setIsAppelModalOpen] = useState(false);
  const [modalVehicle, setModalVehicle] = useState<Flux | null>(null);
  const [modalDevis, setModalDevis] = useState<DemandeDevis | null>(null);
  const [callDate, setCallDate] = useState("");
  const [callTime, setCallTime] = useState("");
  const [callerName, setCallerName] = useState("");
  const [callNotes, setCallNotes] = useState("");

  useEffect(() => {
    const handleUpdate = () => {
      setDemandesDevisMap(getDemandesDevisLocal());
    };
    window.addEventListener("demandes_devis_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("demandes_devis_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Filtre les véhicules au statut « Lancement devis » ou ayant une fiche devis.
  const devisVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const av = (v.avancement || "").trim().toLowerCase();
      const etat = (v.etatIntervention || "").trim().toLowerCase();
      const hasDevis = Boolean(
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()])
      );
      const devis =
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()]);

      // Dès qu'une décision est prise, la Réception n'a plus à garder le
      // dossier dans sa liste de travail. L'administration conserve la trace.
      if (role === "reception" && (devis?.statutDevis === "Accepté" || devis?.statutDevis === "Refusé")) {
        return false;
      }
      return (
        hasDevis ||
        av === "atende devis" ||
        av === "attente devis" ||
        av.includes("devis") ||
        etat.includes("devis")
      );
    });
  }, [vehicles, demandesDevisMap, role]);

  // Comptes statistiques
  const aAppelerCount = useMemo(() => {
    return devisVehicles.filter((v) => {
      const d =
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()]);
      return !d || !d.statutDevis || d.statutDevis === "Attente validation devis" || d.statutDevis === "En attente accord";
    }).length;
  }, [devisVehicles, demandesDevisMap]);

  const relanceCount = useMemo(() => {
    return devisVehicles.filter((v) => {
      const d =
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()]);
      return isDevisDepassee24h(d);
    }).length;
  }, [devisVehicles, demandesDevisMap]);

  const accordeCount = useMemo(() => {
    return devisVehicles.filter((v) => {
      const d =
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()]);
      return d?.statutDevis === "Accepté";
    }).length;
  }, [devisVehicles, demandesDevisMap]);

  const refuseCount = useMemo(() => {
    return devisVehicles.filter((v) => {
      const d =
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()]);
      return d?.statutDevis === "Refusé";
    }).length;
  }, [devisVehicles, demandesDevisMap]);

  // Équipes disponibles
  const availableEquipes = useMemo(() => {
    const set = new Set<string>();
    devisVehicles.forEach((v) => {
      if (v.equipe && v.equipe !== "-") {
        set.add(v.equipe.trim());
      }
    });
    return ["Toutes", ...Array.from(set).sort()];
  }, [devisVehicles]);

  // Données filtrées
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devisVehicles.filter((row) => {
      if (selectedEquipe !== "Toutes") {
        if (!row.equipe || row.equipe.trim().toLowerCase() !== selectedEquipe.toLowerCase()) {
          return false;
        }
      }

      const d =
        demandesDevisMap[String(row.id)] ||
        (row.no && demandesDevisMap[row.no.trim()]) ||
        (row.chassis && demandesDevisMap[row.chassis.trim()]);

      const isAAppeler = !d || !d.statutDevis || d.statutDevis === "Attente validation devis" || d.statutDevis === "En attente accord";
      const isRelance = isDevisDepassee24h(d);
      const isAccorde = d?.statutDevis === "Accepté";
      const isRefuse = d?.statutDevis === "Refusé";

      if (statusFilter === "a_appeler" && !isAAppeler) return false;
      if (statusFilter === "relance" && !isRelance) return false;
      if (statusFilter === "accorde" && !isAccorde) return false;
      if (statusFilter === "refuse" && !isRefuse) return false;

      if (!q) return true;

      const haystack = [
        row.no,
        row.ordre,
        row.chassis,
        row.client,
        row.marque,
        row.modele,
        row.immatriculation,
        row.technicien,
        row.nomTechnicien,
        row.equipe,
        d?.numeroDevis,
        d?.pieces,
        d?.commentaire,
        d?.equipeOrigine,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [devisVehicles, selectedEquipe, search, statusFilter, demandesDevisMap]);

  const getNowDateIso = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const getNowTimeIso = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const handleOpenAppelModal = (row: Flux, devis?: DemandeDevis | null) => {
    setModalVehicle(row);
    setModalDevis(devis || null);

    if (devis?.dateAppel && devis.dateAppel.includes("/")) {
      const parts = devis.dateAppel.trim().split(" ");
      const dateParts = parts[0].split("/");
      if (dateParts.length === 3) {
        setCallDate(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
      } else {
        setCallDate(getNowDateIso());
      }
      setCallTime(parts[1] ? parts[1].slice(0, 5) : getNowTimeIso());
    } else {
      setCallDate(getNowDateIso());
      setCallTime(getNowTimeIso());
    }

    setCallerName(devis?.appelant || currentUser?.name || "Réception");
    setCallNotes(devis?.commentaire || "");
    setIsAppelModalOpen(true);
  };

  const handleConfirmAppelModal = () => {
    if (!modalVehicle) return;

    let formattedDateAppel = "";
    if (callDate) {
      const parts = callDate.split("-");
      if (parts.length === 3) {
        formattedDateAppel = `${parts[2]}/${parts[1]}/${parts[0]} ${callTime || getNowTimeIso()}`;
      }
    }
    if (!formattedDateAppel) {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      formattedDateAppel = `${dd}/${mm}/${yyyy} ${getNowTimeIso()}`;
    }

    const key = (modalVehicle.no || modalVehicle.ordre || modalVehicle.chassis || String(modalVehicle.id)).trim();
    const finalCaller = callerName.trim() || currentUser?.name || "Réception";
    const updated = marquerDevisAppele(key, finalCaller, formattedDateAppel, modalVehicle, callNotes);
    if (updated) {
      void updateDatabaseStatutDevis(modalVehicle, updated, "Client appelé");
    }

    setActionSuccessNotice({
      message: `📞 Appel au client enregistré le ${formattedDateAppel} par ${finalCaller} (OR: ${modalVehicle.no || modalVehicle.ordre}).`,
    });
    setTimeout(() => setActionSuccessNotice(null), 5000);
    setIsAppelModalOpen(false);
  };

  // Actions utilisateur
  const handleMarquerAppele = async (row: Flux) => {
    const d =
      demandesDevisMap[String(row.id)] ||
      (row.no && demandesDevisMap[row.no.trim()]) ||
      (row.chassis && demandesDevisMap[row.chassis.trim()]);
    handleOpenAppelModal(row, d);
  };

  const handleMarquerRelance = async (row: Flux) => {
    const key = (row.no || row.ordre || row.chassis || String(row.id)).trim();
    const updated = marquerDevisRelance(key, currentUser?.name || "Réception");
    if (updated) {
      void updateDatabaseStatutDevis(row, updated, "Client appelé");
    }
    setActionSuccessNotice({
      message: `⚠️ Relance client enregistrée pour le devis ${row.no || row.ordre}.`,
    });
    setTimeout(() => setActionSuccessNotice(null), 4000);
  };

  // ACCEPTATION DU DEVIS : Retour pour le MÊME TECHNICIEN dans Tableaux de chargement (Attente Réparation)
  const handleValiderAccordClient = async (row: Flux) => {
    const key = (row.no || row.ordre || row.chassis || String(row.id)).trim();
    const d =
      demandesDevisMap[String(row.id)] ||
      (row.no && demandesDevisMap[row.no.trim()]) ||
      (row.chassis && demandesDevisMap[row.chassis.trim()]);

    const updated = marquerDevisAccepte(key);
    if (updated) {
      void updateDatabaseStatutDevis(row, updated, "Accepté");
    }

    // Récupérer l'équipe d'origine pour renvoyer le véhicule exactement à son équipe
    const targetEquipe = d?.equipeOrigine || d?.equipe || row.equipe || "Daily1";

    // Récupérer le même technicien qui avait le véhicule / qui a établi le devis
    const targetTech =
      row.technicien && row.technicien !== "-"
        ? row.technicien
        : d?.technicien && d.technicien !== "-"
        ? d.technicien
        : "";
    const targetNomTech =
      row.nomTechnicien && row.nomTechnicien !== "-"
        ? row.nomTechnicien
        : d?.nomTechnicien && d.nomTechnicien !== "-"
        ? d.nomTechnicien
        : "";

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const dateAccord = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

    // Émettre la notification pour le chef d'équipe et le technicien de l'équipe concernée
    saveDevisAccordNotification({
      id: `devis-accord-${row.id || row.no || row.chassis}`,
      vehicleId: row.id,
      or: row.no || row.ordre || "-",
      chassis: row.chassis || "-",
      client: row.client || d?.client || "Client",
      marque: row.marque || "IVECO",
      modele: row.modele || d?.modele || "-",
      immatriculation: row.serie || row.immatriculation || "-",
      equipeCible: targetEquipe,
      numeroDevis: d?.numeroDevis || "-",
      dateAccord,
      timestamp: `${hh}:${min}`,
      timestampMs: Date.now(),
      technicien: targetTech,
      nomTechnicien: targetNomTech,
    });

    // Renvoyer au même technicien dans Tableaux de chargement avec l'état "Attente Réparation"
    await onUpdateAvancement(
      row,
      "Attente réparation",
      undefined,
      {
        equipe: targetEquipe,
        etat: "Attente Réparation",
        technicien: targetTech,
        nomTechnicien: targetNomTech,
      },
      updated || d || undefined
    );

    const techDisplay = targetNomTech
      ? `${targetNomTech}${targetTech ? ` (${targetTech})` : ""}`
      : targetTech || "";

    setActionSuccessNotice({
      message: `✅ Devis accepté par le client ! Le véhicule ${row.no || row.ordre} est retourné à l'équipe ${targetEquipe} dans "Tableaux de chargement (Attente Réparation)".`,
      vehicleId: row.id,
      techInfo: techDisplay ? `Technicien réaffecté : ${techDisplay}` : undefined,
    });
    setTimeout(() => setActionSuccessNotice(null), 8000);
  };

  // REFUS DU DEVIS : Passage AUTOMATIQUE à "Terminer"
  const handleRefuserDevisClient = async (row: Flux) => {
    const key = (row.no || row.ordre || row.chassis || String(row.id)).trim();
    const d =
      demandesDevisMap[String(row.id)] ||
      (row.no && demandesDevisMap[row.no.trim()]) ||
      (row.chassis && demandesDevisMap[row.chassis.trim()]);

    const updated = marquerDevisRefuse(key);
    if (updated) {
      void updateDatabaseStatutDevis(row, updated, "Refusé");
    }

    // Passer automatiquement l'avancement à "Terminer" (Attente Client pour restitution)
    await onUpdateAvancement(
      row,
      "Terminer",
      undefined,
      { etatIntervention: "Attente Client" },
      updated || d || undefined
    );

    setActionSuccessNotice({
      message: `❌ Devis marqué comme annulé (refus client) : Le véhicule ${row.no || row.ordre} est passé automatiquement en avancement "Terminer" (Attente Client pour restitution).`,
    });
    setTimeout(() => setActionSuccessNotice(null), 5000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-in fade-in duration-200">
      {/* Bannière de notification d'action */}
      {actionSuccessNotice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-start sm:items-center gap-2.5 text-xs font-bold">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span>{actionSuccessNotice.message}</span>
              {actionSuccessNotice.techInfo && (
                <div className="text-[11px] font-semibold text-emerald-800 mt-0.5 flex items-center gap-1.5">
                  <Wrench size={12} className="text-emerald-700" />
                  <span>{actionSuccessNotice.techInfo}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {actionSuccessNotice.vehicleId && onNavigateToTab && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToTab("chargement", "Attente Réparation", actionSuccessNotice.vehicleId);
                  setActionSuccessNotice(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <ClipboardList size={13} />
                <span>Voir dans Tableaux de chargement</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActionSuccessNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2 py-1 rounded hover:bg-emerald-500/10 cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* En-tête de la Page Devis */}
      <div className="bg-gradient-to-r from-orange-950 via-amber-950 to-slate-900 rounded-2xl p-4 text-white shadow-xl border border-orange-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/20 text-orange-300 rounded-xl border border-orange-400/30 shadow-inner">
              <FileSignature className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  Véhicules en Attente Devis (N° DV)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-orange-500/30 text-orange-200 border border-orange-400/40">
                  {devisVehicles.length} dossiers
                </span>
              </div>
              <p className="text-[11px] leading-snug text-orange-200/80 mt-0.5 max-w-3xl">
                Suivi des devis créés par les équipes d'atelier. La Réception appelle le client dès notification de création. Si le client ne répond pas sous 1 jour (24h), un rappel est déclenché. En cas d'acceptation, le véhicule retourne à son équipe ; en cas de refus, l'avancement passe automatiquement à <strong>Terminer</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 active:scale-95 text-white rounded-xl border border-white/10 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <RotateCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                <span>Actualiser</span>
              </button>
            )}
          </div>
        </div>

        {/* Cartes d'indicateurs rapides */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 pt-3 border-t border-orange-500/20">
          <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
            <div className="text-[11px] text-orange-200/70 font-semibold">Total Devis</div>
            <div className="text-2xl font-black text-white mt-0.5">{devisVehicles.length}</div>
          </div>

          <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
            <div className="text-[11px] text-amber-300 font-semibold flex items-center gap-1">
              <PhoneCall size={12} />
              <span>À appeler</span>
            </div>
            <div className="text-2xl font-black text-amber-300 mt-0.5">{aAppelerCount}</div>
            <div className="text-[10px] text-amber-200/60 mt-0.5">Nouveaux créés</div>
          </div>

          <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
            <div className="text-[11px] text-rose-300 font-semibold flex items-center gap-1">
              <AlertTriangle size={12} />
              <span>Relance &gt; 24h</span>
            </div>
            <div className={`text-2xl font-black mt-0.5 ${relanceCount > 0 ? "text-rose-400 animate-pulse" : "text-white"}`}>
              {relanceCount}
            </div>
            <div className="text-[10px] text-rose-200/60 mt-0.5">Sans réponse 1j</div>
          </div>

          <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
            <div className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1">
              <CheckCircle2 size={12} />
              <span>Acceptés</span>
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{accordeCount}</div>
            <div className="text-[10px] text-emerald-200/60 mt-0.5">Renvoyés équipe</div>
          </div>

          <div className="bg-white/5 rounded-xl p-2.5 border border-white/10">
            <div className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
              <XCircle size={12} />
              <span>Refusés</span>
            </div>
            <div className="text-2xl font-black text-slate-300 mt-0.5">{refuseCount}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Terminés auto</div>
          </div>
        </div>
      </div>

      {/* Barre de filtres et recherche */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par N° OR, N° DV, Châssis, Immat, Client..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
            />
          </div>

          {availableEquipes.length > 2 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
              <Filter size={14} className="text-slate-400" />
              <select
                value={selectedEquipe}
                onChange={(e) => setSelectedEquipe(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none cursor-pointer hover:bg-slate-100"
              >
                {availableEquipes.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq === "Toutes" ? "Toutes les équipes" : `Équipe ${eq}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Boutons de filtrage par état */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start lg:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter("tous")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              statusFilter === "tous"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tous ({devisVehicles.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("a_appeler")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === "a_appeler"
                ? "bg-amber-500 text-white shadow-2xs"
                : "text-slate-600 hover:text-amber-800"
            }`}
          >
            <PhoneCall size={12} />
            <span>À appeler ({aAppelerCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("relance")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === "relance"
                ? "bg-rose-600 text-white shadow-2xs"
                : "text-slate-600 hover:text-rose-800"
            }`}
          >
            <AlertTriangle size={12} />
            <span>Relance &gt; 24h ({relanceCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("accorde")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === "accorde"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "text-slate-600 hover:text-emerald-800"
            }`}
          >
            <CheckCircle2 size={12} />
            <span>Acceptés ({accordeCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("refuse")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === "refuse"
                ? "bg-slate-700 text-white shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <XCircle size={12} />
            <span>Refusés ({refuseCount})</span>
          </button>
        </div>
      </div>

      {/* Table des dossiers sous devis */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                <th className="py-3 px-3.5">N° OR</th>
                <th className="py-3 px-3.5">N° DV (Devis)</th>
                <th className="py-3 px-3.5">Immatriculation & Modèle</th>
                <th className="py-3 px-3.5 min-w-[160px]">Pièces à Remplacer (Piess)</th>
                <th className="py-3 px-3.5">Client & Contact</th>
                <th className="py-3 px-3.5">Équipe Créatrice</th>
                <th className="py-3 px-3.5 min-w-[170px]">Statut Accord Devis</th>
                {role !== "reception" && (
                  <th className="py-3 px-3.5 min-w-[150px]">Avancement Atelier</th>
                )}
                <th className="py-3 px-3.5 text-center min-w-[220px]">Actions (Réception / Atelier)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={role === "reception" ? 8 : 9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileSignature size={36} className="text-slate-300" />
                      <p className="font-bold text-sm text-slate-600">Aucun dossier devis trouvé</p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {search
                          ? "Aucun résultat ne correspond à votre recherche."
                          : "Lorsqu'une équipe choisit « Lancement devis », le véhicule apparaît automatiquement ici avec son N° DV."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const devis =
                    demandesDevisMap[String(row.id)] ||
                    (row.no && demandesDevisMap[row.no.trim()]) ||
                    (row.chassis && demandesDevisMap[row.chassis.trim()]);
                  const isSaving = savingVehicleId === row.id;
                  const allowedOptions = getAvancementOptionsForTeam(row.equipe, row);
                  const isAccorde = devis?.statutDevis === "Accepté";
                  const isRefuse = devis?.statutDevis === "Refusé";
                  const isAppele = devis?.statutDevis === "Client appelé";
                  const isDepassee24h = isDevisDepassee24h(devis);
                  const equipeInitiale = devis?.equipeOrigine || devis?.equipe || row.equipe || "-";

                  return (
                    <tr
                      key={row.id}
                      onClick={() => triggerViewDetail && triggerViewDetail(row)}
                      className={`hover:bg-orange-50/40 transition-colors cursor-pointer ${
                        isAccorde
                          ? "bg-emerald-50/20"
                          : isRefuse
                          ? "bg-slate-50 opacity-80"
                          : isDepassee24h
                          ? "bg-rose-50/30"
                          : ""
                      }`}
                    >
                      {/* N° OR */}
                      <td className="py-3 px-3.5 font-bold font-mono text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Hash size={12} className="text-orange-500" />
                          <span>{row.no || row.ordre || "-"}</span>
                        </div>
                      </td>

                      {/* N° DV */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {devis?.numeroDevis ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-orange-100 text-orange-900 border border-orange-300 shadow-2xs">
                            <Tag size={11} className="text-orange-600" />
                            {devis.numeroDevis}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            Non renseigné
                          </span>
                        )}
                      </td>

                      {/* Immatriculation & Modèle */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-800">
                          {row.immatriculation || row.serie || "-"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {row.modele || row.marque || "-"} • <span className="font-mono">{row.chassis || "-"}</span>
                        </div>
                      </td>

                      {/* Pièces à remplacer (Piess) */}
                      <td className="py-3 px-3.5">
                        {devis?.pieces ? (
                          <div className="flex items-start gap-1.5 max-w-[200px]">
                            <Wrench size={13} className="text-amber-600 mt-0.5 shrink-0" />
                            <span className="font-semibold text-slate-800 text-[11px] leading-tight">
                              {devis.pieces}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Non spécifiées
                          </span>
                        )}
                      </td>

                      {/* Client & Contact */}
                      <td className="py-3 px-3.5 whitespace-nowrap max-w-[190px] truncate" title={row.client}>
                        <div className="font-medium text-slate-800 truncate">
                          {row.client || "-"}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Créé : {devis?.date || row.date || "-"}
                        </div>
                      </td>

                      {/* Équipe créatrice */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            <Users size={11} className="text-blue-600" />
                            <span>{equipeInitiale}</span>
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Tech : {row.nomTechnicien || row.technicien || "-"}
                        </div>
                      </td>

                      {/* Statut Accord Devis (avec date et heure précises pour l'appel et l'accord) */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {isAccorde ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 w-fit">
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              <span>Devis Accepté</span>
                            </span>
                            <span className="text-[11px] font-bold text-emerald-900 mt-0.5">
                              Accepté le : {devis?.dateDecision || "Accord client validé"}
                            </span>
                            {devis?.dateAppel && (
                              <span className="text-[10px] text-slate-500">
                                Appelé le : {devis.dateAppel} {devis.appelant ? `(par ${devis.appelant})` : ""}
                              </span>
                            )}
                            <span className="text-[10px] text-emerald-700 font-semibold">
                              Tableaux de chargement (Attente Réparation)
                            </span>
                            {(row.nomTechnicien || row.technicien || devis?.nomTechnicien || devis?.technicien) && (
                              <span className="text-[10px] text-slate-700 font-bold flex items-center gap-1">
                                <Wrench size={10} className="text-emerald-700" />
                                <span>Tech : {row.nomTechnicien || devis?.nomTechnicien || row.technicien || devis?.technicien}</span>
                              </span>
                            )}
                          </div>
                        ) : isRefuse ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 w-fit">
                              <XCircle size={12} className="text-rose-600" />
                              <span>Devis Annulé (Refusé)</span>
                            </span>
                            <span className="text-[11px] font-bold text-rose-900 mt-0.5">
                              Refusé le : {devis?.dateDecision || "-"}
                            </span>
                            {devis?.dateAppel && (
                              <span className="text-[10px] text-slate-500">
                                Appelé le : {devis.dateAppel}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500 font-semibold">
                              Avancement classé Terminer
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {isAppele ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300 w-fit">
                                  <PhoneCall size={11} className="text-blue-700" />
                                  <span>Client appelé</span>
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-bold text-blue-900 font-mono">
                                    Quand ai-je appelé : {devis?.dateAppel || "Date non enregistrée"}
                                  </span>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAppelModal(row, devis)}
                                      className="text-blue-600 hover:text-blue-800 p-0.5 rounded hover:bg-blue-100/70 transition-colors cursor-pointer"
                                      title="Modifier la date et heure de l'appel"
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </div>
                                {devis?.appelant && (
                                  <span className="text-[10px] text-slate-500">
                                    par {devis.appelant}
                                  </span>
                                )}
                                {devis?.dateRelance && (
                                  <span className="text-[10px] font-bold text-amber-700">
                                    Relancé le : {devis.dateRelance}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 w-fit animate-pulse">
                                  <PhoneCall size={11} className="text-amber-600" />
                                  <span>À appeler par réception</span>
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  En attente d'appel client
                                </span>
                              </div>
                            )}

                            {isDepassee24h && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 w-fit">
                                <AlertTriangle size={11} className="text-rose-600 animate-bounce" />
                                <span>⚠️ Relance requise (&gt;24h)</span>
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Avancement (Sélecteur direct pour le Chef d'Équipe) - Éliminé pour Réception */}
                      {role !== "reception" && (
                        <td
                          className="py-3 px-3.5 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <select
                              disabled={isSaving || !canEdit}
                              style={getAvancementBadgeStyle(row.avancement)}
                              value={row.avancement || "Lancement devis"}
                              onChange={(e) => void onUpdateAvancement(row, e.target.value)}
                              className="px-2 py-1 text-xs rounded-lg border font-bold shadow-2xs outline-none cursor-pointer focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60"
                              title="Avancement de l'intervention"
                            >
                              {row.avancement && !allowedOptions.includes(row.avancement) && (
                                <option value={row.avancement}>{row.avancement}</option>
                              )}
                              {allowedOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      )}

                      {/* Actions dédiées Réception / Atelier */}
                      <td
                        className="py-3 px-3.5 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* 1. Bouton "Appel effectué" si pas encore appelé */}
                          {canEdit && !isAccorde && !isRefuse && !isAppele && (
                            <button
                              type="button"
                              onClick={() => void handleMarquerAppele(row)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                              title="Indiquer que la réception a appelé le client pour présenter le devis"
                            >
                              <PhoneCall size={11} />
                              <span>Appel fait</span>
                            </button>
                          )}

                          {/* 2. Bouton "Relance effectuée" si > 24h sans réponse */}
                          {canEdit && !isAccorde && !isRefuse && isDepassee24h && (
                            <button
                              type="button"
                              onClick={() => void handleMarquerRelance(row)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 rounded-lg shadow-2xs transition-all disabled:opacity-50 cursor-pointer animate-pulse"
                              title="Marquer que le client a été relancé après 24h sans réponse"
                            >
                              <AlertTriangle size={11} />
                              <span>Relance faite</span>
                            </button>
                          )}

                          {/* 3. Bouton "Devis Accepté" (Retourne à l'équipe d'origine à 10%) */}
                          {canEdit && !isAccorde && (
                            <button
                              type="button"
                              onClick={() => void handleValiderAccordClient(row)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                              title={`Le client accepte le devis : la voiture retourne automatiquement à l'équipe ${equipeInitiale} en atelier`}
                            >
                              <CheckCircle2 size={12} />
                              <span>Accepter</span>
                            </button>
                          )}

                          {/* 3 bis. Accès direct Tableaux de chargement si accepté */}
                          {isAccorde && onNavigateToTab && (
                            <button
                              type="button"
                              onClick={() => onNavigateToTab("chargement", "Attente Réparation", row.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer"
                              title="Voir ce véhicule dans Tableaux de chargement (Attente Réparation)"
                            >
                              <ClipboardList size={12} />
                              <span>Voir Chargement</span>
                            </button>
                          )}

                          {/* 4. Bouton "Devis Refusé" (Marqué comme annulé et passe automatiquement en Terminer) */}
                          {canEdit && !isRefuse && (
                            <button
                              type="button"
                              onClick={() => void handleRefuserDevisClient(row)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 active:scale-95 rounded-lg shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                              title="Le client refuse le devis : marquer automatiquement comme annulé et passer en avancement 'Terminer' pour restitution"
                            >
                              <XCircle size={12} />
                              <span>Refuser (Annulé)</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => triggerViewDetail && triggerViewDetail(row)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Consulter la fiche détaillée"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL ENREGISTRER APPEL CLIENT AVEC DATE ET HEURE */}
      {isAppelModalOpen && modalVehicle && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsAppelModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
                  <PhoneCall size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Enregistrer l'Appel au Client</h3>
                  <p className="text-xs text-blue-100">
                    Saisir et synchroniser la date et l'heure de l'appel pour le devis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAppelModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Corps */}
            <div className="p-6 space-y-4">
              {/* Résumé Véhicule & Client */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">N° OR / Dossier :</span>
                  <strong className="text-slate-900 font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                    {modalVehicle.no || modalVehicle.ordre || "-"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Client :</span>
                  <strong className="text-slate-900">
                    {modalVehicle.client || "Client non renseigné"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Véhicule :</span>
                  <span className="text-slate-700">
                    {modalVehicle.marque} {modalVehicle.modele || ""} • {modalVehicle.chassis || "-"}
                  </span>
                </div>
                {modalDevis?.pieces && (
                  <div className="pt-1 border-t border-slate-200">
                    <span className="text-slate-500 font-medium block">Pièces en devis :</span>
                    <span className="text-slate-800 font-medium">{modalDevis.pieces}</span>
                  </div>
                )}
              </div>

              {/* Champ Date et Heure */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock size={14} className="text-blue-600" />
                    Date et Heure de l'appel au client :
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setCallDate(getNowDateIso());
                      setCallTime(getNowTimeIso());
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>🕒 Mettre l'heure actuelle</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Date de l'appel</label>
                    <input
                      type="date"
                      value={callDate}
                      onChange={(e) => setCallDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Heure de l'appel</label>
                    <input
                      type="time"
                      value={callTime}
                      onChange={(e) => setCallTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Cette date et heure sera visible dans le tableau, la fiche véhicule et enregistrée dans le PostgreSQL.
                </p>
              </div>

              {/* Champ Qui a appelé */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Users size={14} className="text-blue-600" />
                  Appelé par (Votre nom / Réception) :
                </label>
                <input
                  type="text"
                  value={callerName}
                  onChange={(e) => setCallerName(e.target.value)}
                  placeholder="Ex: Réception, Sonia, etc."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Remarques / Échange client */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">
                  Commentaire / Réponse du client (optionnel) :
                </label>
                <textarea
                  rows={2}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Ex: Client informé du montant, attend accord de sa société..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsAppelModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmAppelModal}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <PhoneCall size={13} />
                <span>Enregistrer l'appel client</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
