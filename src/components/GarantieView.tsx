import { useState, useMemo } from "react";
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  Clock,
  Download,
  Printer,
  RotateCw,
  Award,
  Layers,
  ExternalLink,
  Timer,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { Flux } from "../data/mockData";
import { updateDatabaseStatutGarantie, getNowFormatted, supprimerDossierGarantie } from "../services/database";
import { calculateVehicleTimes, formatMinutes, recordVehicleModification } from "../services/timeTracking";
import { isWarrantyVehicle, isWorkshopFinished } from "../services/warranty";
import ChronoTimelineModal from "./ChronoTimelineModal";

interface GarantieViewProps {
  vehicles: Flux[];
  onUpdateAvancement?: (
    row: Flux,
    nextAvancement: string,
    demandeAchat?: any,
    extraParams?: any,
    demandeDevis?: any
  ) => Promise<void> | void;
  onSelectVehicle?: (vehicle: Flux) => void;
  onViewDetail?: (vehicle: Flux) => void;
  savingVehicleId?: number | null;
  role?: string;
  currentUser?: { name?: string; role?: string; assignedTeam?: string } | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const STATUTS_GARANTIE = [
  "À traiter garantie",
  "En attente accord constructeur",
  "Accordé constructeur",
  "Refus constructeur",
  "Pièces retournées",
  "Dossier clôturé",
] as const;

export default function GarantieView({
  vehicles,
  onSelectVehicle,
  onViewDetail,
  currentUser,
  onRefresh,
  isRefreshing,
}: GarantieViewProps) {
  const triggerDetail = onViewDetail || onSelectVehicle;
  const [search, setSearch] = useState("");
  // Le tableau Garantie doit afficher tous les dossiers R10 dès son ouverture,
  // y compris ceux dont les travaux sont toujours en cours.
  const [filterState, setFilterState] = useState<"tous" | "termines" | "en_cours" | "accordes" | "clos">("tous");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chronoVehicle, setChronoVehicle] = useState<Flux | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Flux | null>(null);
  const [editStatut, setEditStatut] = useState("");
  const [editAccord, setEditAccord] = useState("");
  const [editCommentaire, setEditCommentaire] = useState("");

  // 1. Filtrer les véhicules de Garantie (Centre de service R10 ou tagués Garantie)
  const garantieVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      return isWarrantyVehicle(v);
    });
  }, [vehicles]);

  // 2. Détecter si un véhicule est terminé côté atelier
  const isFinished = (v: Flux) => {
    return isWorkshopFinished(v);
  };

  // 3. Comptes statistiques
  const stats = useMemo(() => {
    let termines = 0;
    let enCours = 0;
    let accordes = 0;
    let clos = 0;

    garantieVehicles.forEach((v) => {
      const st = String((v as any).statutGarantie || "").trim();
      if (st === "Dossier clôturé") {
        clos++;
      } else if (st === "Accordé constructeur") {
        accordes++;
      } else if (isFinished(v)) {
        termines++;
      } else {
        enCours++;
      }
    });

    return {
      total: garantieVehicles.length,
      termines,
      enCours,
      accordes,
      clos,
    };
  }, [garantieVehicles]);

  // 4. Filtrage dynamique selon la recherche et le filtre sélectionné
  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();

    return garantieVehicles.filter((v) => {
      // Filtre d'onglet
      if (filterState === "termines") {
        const st = String((v as any).statutGarantie || "").trim();
        if (st === "Dossier clôturé") return false;
        if (!isFinished(v)) return false;
      } else if (filterState === "en_cours") {
        if (isFinished(v)) return false;
      } else if (filterState === "accordes") {
        const st = String((v as any).statutGarantie || "").trim();
        if (st !== "Accordé constructeur") return false;
      } else if (filterState === "clos") {
        const st = String((v as any).statutGarantie || "").trim();
        if (st !== "Dossier clôturé") return false;
      }

      // Recherche textuelle
      if (q) {
        const matchOr = (v.no || v.ordre || "").toLowerCase().includes(q);
        const matchChassis = (v.chassis || "").toLowerCase().includes(q);
        const matchImmat = (v.immatriculation || v.serie || "").toLowerCase().includes(q);
        const matchClient = (v.client || "").toLowerCase().includes(q);
        const matchModele = (v.modele || v.marque || "").toLowerCase().includes(q);
        if (!matchOr && !matchChassis && !matchImmat && !matchClient && !matchModele) {
          return false;
        }
      }

      return true;
    });
  }, [garantieVehicles, filterState, search]);

  // 5. Mise à jour du statut garantie
  const handleStatutChange = async (vehicle: Flux, newStatut: string, extra?: { commentaire?: string; numeroAccord?: string }) => {
    const previousStatut = String((vehicle as any).statutGarantie || "").trim() || (isFinished(vehicle) ? "À traiter garantie" : "En cours atelier");
    if (previousStatut === newStatut && !extra) return;
    setSavingId(vehicle.id);
    try {
      await updateDatabaseStatutGarantie(vehicle, newStatut, extra);
      (vehicle as any).statutGarantie = newStatut;
      if (extra?.numeroAccord) (vehicle as any).numeroAccordGarantie = extra.numeroAccord;
      if (extra?.commentaire) (vehicle as any).commentaireGarantie = extra.commentaire;
      const dateModification = getNowFormatted();
      (vehicle as any).dateValidationGarantie = dateModification;
      recordVehicleModification(
        vehicle,
        "Statut garantie modifié",
        `${previousStatut} → ${newStatut}${extra?.numeroAccord ? ` • Accord : ${extra.numeroAccord}` : ""}${extra?.commentaire ? ` • ${extra.commentaire}` : ""}${currentUser?.name ? ` • Par ${currentUser.name}` : ""}`,
      );
      setNotice(`✅ Statut garantie mis à jour pour l'OR ${vehicle.no || vehicle.ordre || vehicle.chassis} : "${newStatut}"`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      alert(`Erreur de mise à jour garantie: ${err.message || err}`);
    } finally {
      setSavingId(null);
    }
  };

  const openEdit = (vehicle: Flux) => {
    setEditingVehicle(vehicle);
    setEditStatut(String((vehicle as any).statutGarantie || "").trim() || "À traiter garantie");
    setEditAccord(String((vehicle as any).numeroAccordGarantie || ""));
    setEditCommentaire(String((vehicle as any).commentaireGarantie || ""));
  };

  const saveEdit = async () => {
    if (!editingVehicle || !editStatut) return;
    await handleStatutChange(editingVehicle, editStatut, { numeroAccord: editAccord.trim(), commentaire: editCommentaire.trim() });
    setEditingVehicle(null);
  };

  const reopenDossier = async (vehicle: Flux) => {
    await handleStatutChange(vehicle, "À traiter garantie", { commentaire: "Dossier réouvert pour traitement" });
  };

  const deleteDossier = async (vehicle: Flux) => {
    const reference = vehicle.no || vehicle.ordre || vehicle.chassis || "ce dossier";
    if (!window.confirm(`Supprimer définitivement le dossier garantie ${reference} ? Cette action ne peut pas être annulée.`)) return;
    setSavingId(vehicle.id);
    try {
      await supprimerDossierGarantie({
        id: vehicle.id,
        recordKey: String((vehicle as any).recordKey || ""),
        noOr: vehicle.no || vehicle.ordre || "",
        cs: vehicle.cs || "R10",
        chassis: vehicle.chassis || "",
        immatriculation: vehicle.immatriculation || vehicle.serie || "",
      });
      setNotice(`✅ Dossier garantie ${reference} supprimé.`);
      onRefresh?.();
    } catch (err: any) {
      alert(`Erreur de suppression garantie : ${err.message || err}`);
    } finally {
      setSavingId(null);
    }
  };

  // 6. Export CSV
  const handleExportCSV = () => {
    const headers = [
      "N° OR",
      "Centre Service",
      "Date Entrée",
      "Châssis (VIN)",
      "Immatriculation",
      "Marque / Modèle",
      "Client",
      "Équipe",
      "Technicien",
      "Avancement Atelier",
      "Date Fin Travaux",
      "Temps travail net",
      "Statut Garantie",
    ];

    const rows = filteredVehicles.map((v) => [
      `"${v.no || v.ordre || ""}"`,
      `"${v.cs || "R10"}"`,
      `"${(v as any).dateEntreeHeure || v.dateEntree || v.date || ""}"`,
      `"${v.chassis || ""}"`,
      `"${v.immatriculation || v.serie || ""}"`,
      `"${v.marque || ""} ${v.modele || ""}"`.trim(),
      `"${v.client || ""}"`,
      `"${v.equipe || ""}"`,
      `"${v.nomTechnicien || v.technicien || ""}"`,
      `"${v.avancement || v.etatIntervention || ""}"`,
      `"${v.dateFinRep || v.dateModification || ""}"`,
      `"${formatMinutes(calculateVehicleTimes(v).tempsTravailEffectifMin)}"`,
      `"${(v as any).statutGarantie || (isFinished(v) ? "À traiter garantie" : "En cours atelier")}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Tableau_Garantie_R10_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
    <div className="space-y-4 p-3 sm:p-6 bg-slate-50/70 min-h-screen">
      {/* En-tête Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-100/90 text-teal-800 flex items-center justify-center shadow-inner shrink-0 border border-teal-200">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                Tableau de Suivi Garantie (R10)
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
                Centre Service R10
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestion et suivi des dossiers sous garantie après réalisation des travaux atelier • Non comptabilisé dans les moyennes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-teal-600" : ""}`} />
              <span>Actualiser</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Exporter CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Imprimer</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center justify-between animate-in fade-in">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900">
            ×
          </button>
        </div>
      )}

      {/* Cartes d'indicateurs KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setFilterState("tous")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterState === "tous"
              ? "bg-teal-50 border-teal-300 ring-2 ring-teal-400/20"
              : "bg-white border-slate-200 hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Dossiers R10</span>
            <Layers className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{stats.total}</div>
        </div>

        <div
          onClick={() => setFilterState("termines")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterState === "termines"
              ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400/20"
              : "bg-white border-slate-200 hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-xs font-medium">
            <span>Travaux Terminés (À traiter)</span>
            <CheckCircle2 className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-amber-900 mt-1 flex items-center gap-2">
            <span>{stats.termines}</span>
            {stats.termines > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800">
                Action requise
              </span>
            )}
          </div>
        </div>

        <div
          onClick={() => setFilterState("en_cours")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterState === "en_cours"
              ? "bg-blue-50 border-blue-300 ring-2 ring-blue-400/20"
              : "bg-white border-slate-200 hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center justify-between text-blue-700 text-xs font-medium">
            <span>En cours atelier</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-extrabold text-blue-900 mt-1">{stats.enCours}</div>
        </div>

        <div
          onClick={() => setFilterState("accordes")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterState === "accordes"
              ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20"
              : "bg-white border-slate-200 hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 text-xs font-medium">
            <span>Accord Constructeur</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-emerald-900 mt-1">{stats.accordes}</div>
        </div>

        <div
          onClick={() => setFilterState("clos")}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            filterState === "clos"
              ? "bg-slate-100 border-slate-300 ring-2 ring-slate-400/20"
              : "bg-white border-slate-200 hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
            <span>Dossiers Clôturés</span>
            <Award className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-xl font-extrabold text-slate-800 mt-1">{stats.clos}</div>
        </div>
      </div>

      {/* Barre de recherche et onglets */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par N° OR, VIN châssis, Immatriculation, Client, Modèle..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterState("termines")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterState === "termines"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            Terminés atelier ({stats.termines})
          </button>

          <button
            type="button"
            onClick={() => setFilterState("tous")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterState === "tous"
                ? "bg-teal-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            Tous ({stats.total})
          </button>

          <button
            type="button"
            onClick={() => setFilterState("en_cours")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterState === "en_cours"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            En cours ({stats.enCours})
          </button>

          <button
            type="button"
            onClick={() => setFilterState("accordes")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterState === "accordes"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            Accordés ({stats.accordes})
          </button>

          <button
            type="button"
            onClick={() => setFilterState("clos")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterState === "clos"
                ? "bg-slate-700 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            Clôturés ({stats.clos})
          </button>
        </div>
      </div>

      {/* Tableau des Véhicules Garantie */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="zebra-table w-full text-left border-collapse min-w-[1050px]">
            <thead>
              <tr className="bg-slate-100/80 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-3">N° OR & CS</th>
                <th className="py-3 px-3">Date Entrée</th>
                <th className="py-3 px-3">Châssis (VIN)</th>
                <th className="py-3 px-3">Immat & Modèle</th>
                <th className="py-3 px-3">Client</th>
                <th className="py-3 px-3">Équipe & Tech</th>
                <th className="py-3 px-3">Avancement Atelier</th>
                <th className="py-3 px-3">Fin Travaux</th>
                <th className="py-3 px-3">Temps travail net</th>
                <th className="py-3 px-3">Statut Dossier Garantie</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-medium">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <span>Aucun véhicule trouvé pour ce filtre de garantie.</span>
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((v) => {
                  const finished = isFinished(v);
                  const currentGarantieStatus = String((v as any).statutGarantie || "").trim() || (finished ? "À traiter garantie" : "En cours atelier");
                  const isClos = currentGarantieStatus === "Dossier clôturé";
                  const isAccorde = currentGarantieStatus === "Accordé constructeur";
                  const isSavingThis = savingId === v.id;
                  const timeCalculation = calculateVehicleTimes(v);

                  return (
                    <tr
                      key={v.id}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        isClos ? "bg-slate-50/40 opacity-80" : isAccorde ? "bg-emerald-50/20" : finished ? "bg-amber-50/20" : ""
                      }`}
                    >
                      {/* N° OR */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {triggerDetail ? (
                            <button
                              type="button"
                              onClick={() => triggerDetail(v)}
                              className="font-extrabold text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 font-mono transition-colors cursor-pointer"
                              title="Voir la fiche détaillée du véhicule"
                            >
                              {v.no || v.ordre || "-"}
                            </button>
                          ) : (
                            <span className="font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono">
                              {v.no || v.ordre || "-"}
                            </span>
                          )}
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-100 text-teal-800">
                            {v.cs || "R10"}
                          </span>
                        </div>
                      </td>

                      {/* Date Entrée */}
                      <td className="py-2.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Clock size={11} className="text-slate-400 shrink-0" />
                          <span>{(v as any).dateEntreeHeure || v.dateEntree || v.date || "-"}</span>
                        </div>
                      </td>

                      {/* Châssis (VIN) */}
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-semibold text-slate-800 text-[11px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60 block truncate max-w-[150px]">
                          {v.chassis || "-"}
                        </span>
                      </td>

                      {/* Immat & Modèle */}
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 text-xs">
                          {v.immatriculation || v.serie || "-"}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                          {v.marque || ""} {v.modele || ""}
                        </div>
                      </td>

                      {/* Client */}
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-800 truncate max-w-[150px]" title={v.client}>
                          {v.client || "Client non renseigné"}
                        </div>
                      </td>

                      {/* Équipe & Technicien */}
                      <td className="py-2.5 px-3">
                        <div className="text-[11px] font-bold text-indigo-700">{v.equipe || "-"}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
                          {v.nomTechnicien || v.technicien || "-"}
                        </div>
                      </td>

                      {/* Avancement Atelier */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold w-fit border ${
                              finished
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : String(v.avancement || "").includes("%")
                                ? "bg-blue-100 text-blue-800 border-blue-300"
                                : "bg-slate-100 text-slate-700 border-slate-300"
                            }`}
                          >
                            {v.avancement || v.etatIntervention || "-"}
                          </span>
                          {(v.dateAvancement || v.dateModification) && (
                            <div className="text-[9px] text-slate-400 font-medium flex items-center gap-1">
                              <Clock size={9} className="text-slate-400 shrink-0" />
                              <span>{v.dateAvancement || v.dateModification}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Fin Travaux */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                        {v.dateFinRep ? (
                          <div className="font-bold text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 size={11} className="text-emerald-600" />
                            <span>{v.dateFinRep}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">En cours</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setChronoVehicle(v)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-extrabold text-indigo-800 hover:bg-indigo-100 transition-colors"
                          title="Voir le calcul détaillé et tout l'historique d'avancement"
                        >
                          <Timer size={12} />
                          {formatMinutes(timeCalculation.tempsTravailEffectifMin)}
                        </button>
                      </td>

                      {/* Statut Garantie */}
                      <td className="py-2.5 px-3">
                        <select
                          disabled={isSavingThis}
                          value={currentGarantieStatus}
                          onChange={(e) => void handleStatutChange(v, e.target.value)}
                          className={`text-xs font-bold px-2 py-1 rounded-xl border transition-all focus:outline-none focus:ring-2 cursor-pointer ${
                            isClos
                              ? "bg-slate-100 text-slate-700 border-slate-300 focus:ring-slate-400/30"
                              : isAccorde
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300 focus:ring-emerald-500/30"
                              : currentGarantieStatus === "Refus constructeur"
                              ? "bg-rose-100 text-rose-800 border-rose-300 focus:ring-rose-500/30"
                              : currentGarantieStatus === "En attente accord constructeur"
                              ? "bg-blue-100 text-blue-800 border-blue-300 focus:ring-blue-500/30"
                              : "bg-amber-100 text-amber-900 border-amber-300 focus:ring-amber-500/30"
                          }`}
                        >
                          {STATUTS_GARANTIE.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {onViewDetail && (
                            <button
                              type="button"
                              onClick={() => onViewDetail(v)}
                              className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors"
                              title="Voir les détails du véhicule"
                            >
                              <ExternalLink size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(v)}
                            disabled={isSavingThis}
                            className="p-1.5 rounded-lg hover:bg-teal-100 text-teal-700 transition-colors disabled:opacity-50"
                            title="Modifier le dossier garantie"
                          >
                            <Pencil size={13} />
                          </button>
                          {isClos && (
                            <button
                              type="button"
                              onClick={() => void reopenDossier(v)}
                              disabled={isSavingThis}
                              className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-700 transition-colors disabled:opacity-50"
                              title="Réouvrir le dossier garantie"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void deleteDossier(v)}
                            disabled={isSavingThis}
                            className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-700 transition-colors disabled:opacity-50"
                            title="Supprimer définitivement le dossier garantie"
                          >
                            <Trash2 size={13} />
                          </button>
                          {!isClos && (
                            <button
                              type="button"
                              onClick={() => void handleStatutChange(v, "Dossier clôturé")}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-all cursor-pointer whitespace-nowrap"
                              title="Marquer le dossier garantie comme définitivement clos"
                            >
                              Clôturer
                            </button>
                          )}
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
    </div>
    <ChronoTimelineModal
      isOpen={Boolean(chronoVehicle)}
      onClose={() => setChronoVehicle(null)}
      vehicle={chronoVehicle}
    />
    {editingVehicle && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
        <form
          onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}
          className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        >
          <h2 className="text-base font-extrabold text-slate-900">Modifier le dossier garantie</h2>
          <p className="mt-1 text-xs text-slate-500">OR {editingVehicle.no || editingVehicle.ordre || "-"} · {editingVehicle.chassis || "VIN non renseigné"}</p>
          <label className="mt-4 block text-xs font-bold text-slate-700">Statut</label>
          <select value={editStatut} onChange={(event) => setEditStatut(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
            {STATUTS_GARANTIE.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <label className="mt-3 block text-xs font-bold text-slate-700">N° d'accord constructeur</label>
          <input value={editAccord} onChange={(event) => setEditAccord(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Ex. ACC-2026-001" />
          <label className="mt-3 block text-xs font-bold text-slate-700">Commentaire</label>
          <textarea value={editCommentaire} onChange={(event) => setEditCommentaire(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Ajouter une précision au dossier" />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setEditingVehicle(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Annuler</button>
            <button type="submit" disabled={savingId === editingVehicle.id} className="rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Enregistrer</button>
          </div>
        </form>
      </div>
    )}
    </>
  );
}
