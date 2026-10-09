import { useState, useEffect, useMemo, type CSSProperties } from "react";
import {
  ShoppingCart,
  Search,
  Filter,
  RefreshCw,
  MapPin,
  Eye,
  PackageSearch,
  Tag,
  CheckCircle2,
  Clock,
} from "lucide-react";
import type { Flux } from "../data/mockData";
import {
  getAvancementOptionsForTeam,
  getDemandesAchatLocal,
  type DemandeAchat,
} from "../services/database";

interface AcheterViewProps {
  vehicles: Flux[];
  onUpdateAvancement: (row: Flux, nextAvancement: string) => Promise<void>;
  savingVehicleId: number | null;
  canEdit: boolean;
  activeChefEquipeTeam?: string;
  userTeam?: string;
  role?: string;
  isChefEquipe?: boolean;
  onViewDetail?: (vehicle: Flux) => void;
  onSelectVehicle?: (vehicle: Flux) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onMarquerLivrer?: (vehicle: Flux, demande: DemandeAchat) => Promise<void> | void;
  onMarquerAttente?: (vehicle: Flux, demande: DemandeAchat) => Promise<void> | void;
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
  if (lower.includes("termin")) {
    return {
      backgroundColor: "#ecfdf5",
      color: "#047857",
      borderColor: "#6ee7b7",
      fontWeight: 700,
    };
  }
  if (lower.includes("devis")) {
    return {
      backgroundColor: "#fff7ed",
      color: "#c2410c",
      borderColor: "#fed7aa",
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

export default function AcheterView({
  vehicles,
  onUpdateAvancement,
  savingVehicleId,
  canEdit,
  activeChefEquipeTeam: _activeChefEquipeTeam,
  userTeam: _userTeam,
  role: _role = "chef_equipe",
  isChefEquipe: _isChefEquipe,
  onViewDetail,
  onSelectVehicle,
  onRefresh,
  isRefreshing,
  onMarquerLivrer,
  onMarquerAttente,
}: AcheterViewProps) {
  const triggerViewDetail = onViewDetail || onSelectVehicle;
  const [search, setSearch] = useState("");
  const [selectedEquipe, setSelectedEquipe] = useState("Toutes");
  const [statusFilter, setStatusFilter] = useState<"tous" | "attente" | "livre">("tous");
  const [demandesMap, setDemandesMap] = useState<Record<string, DemandeAchat>>(getDemandesAchatLocal);

  useEffect(() => {
    const handleUpdate = () => {
      setDemandesMap(getDemandesAchatLocal());
    };
    window.addEventListener("demandes_achat_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("demandes_achat_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  // Filtre les véhicules qui sont actuellement en "attends acheter" ou ayant une demande d'achat
  const acheterVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const av = (v.avancement || "").trim().toLowerCase();
      const etat = (v.etatIntervention || "").trim().toLowerCase();
      const hasDemande = Boolean(
        demandesMap[String(v.id)] ||
        (v.no && demandesMap[v.no.trim()]) ||
        (v.chassis && demandesMap[v.chassis.trim()])
      );
      return (
        hasDemande ||
        av === "attends acheter" ||
        av.includes("achet") ||
        etat === "attends acheter" ||
        etat.includes("attente pdr") ||
        etat.includes("attente pièce")
      );
    }).sort((a, b) => Number(b.creationTimestamp || b.id || 0) - Number(a.creationTimestamp || a.id || 0));
  }, [vehicles, demandesMap]);

  // Comptes par statut pour les badges filtres
  const isPieceRetiree = (d?: DemandeAchat) => {
    return d?.statutAchat === "Pièce retirée" || d?.statutAchat === "Livrer" || d?.statutAchat === "Livré";
  };

  const enAttenteCount = useMemo(() => {
    return acheterVehicles.filter((v) => {
      const d =
        demandesMap[String(v.id)] ||
        (v.no && demandesMap[v.no.trim()]) ||
        (v.chassis && demandesMap[v.chassis.trim()]);
      return !isPieceRetiree(d);
    }).length;
  }, [acheterVehicles, demandesMap]);

  const livreCount = useMemo(() => {
    return acheterVehicles.filter((v) => {
      const d =
        demandesMap[String(v.id)] ||
        (v.no && demandesMap[v.no.trim()]) ||
        (v.chassis && demandesMap[v.chassis.trim()]);
      return isPieceRetiree(d);
    }).length;
  }, [acheterVehicles, demandesMap]);

  // Équipes présentes parmi les véhicules en attente achat
  const availableEquipes = useMemo(() => {
    const set = new Set<string>();
    acheterVehicles.forEach((v) => {
      if (v.equipe && v.equipe !== "-") {
        set.add(v.equipe.trim());
      }
    });
    return ["Toutes", ...Array.from(set).sort()];
  }, [acheterVehicles]);

  // Données filtrées pour l'affichage
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return acheterVehicles.filter((row) => {
      if (selectedEquipe !== "Toutes") {
        if (!row.equipe || row.equipe.trim().toLowerCase() !== selectedEquipe.toLowerCase()) {
          return false;
        }
      }

      const d =
        demandesMap[String(row.id)] ||
        (row.no && demandesMap[row.no.trim()]) ||
        (row.chassis && demandesMap[row.chassis.trim()]);
      const isLivre = isPieceRetiree(d);

      if (statusFilter === "attente" && isLivre) return false;
      if (statusFilter === "livre" && !isLivre) return false;

      if (!q) return true;

      const haystack = [
        row.no,
        row.ordre,
        row.cs,
        row.chassis,
        row.client,
        row.marque,
        row.modele,
        row.immatriculation,
        row.technicien,
        row.nomTechnicien,
        row.equipe,
        row.emplacement,
        d?.ref,
        d?.designation,
        d?.commentaire,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [acheterVehicles, selectedEquipe, search, statusFilter, demandesMap]);

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-8 space-y-6 animate-in fade-in duration-200">
      {/* En-tête de la Page Acheter */}
      <div className="bg-gradient-to-r from-amber-900 via-orange-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-amber-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-amber-500/20 text-amber-300 rounded-2xl border border-amber-400/30 shadow-inner">
              <ShoppingCart className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Véhicules en Attente Achat (Pièces / Devis)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/30 text-amber-200 border border-amber-400/40">
                  {acheterVehicles.length} dossiers
                </span>
              </div>
              <p className="text-xs text-amber-200/80 mt-1 max-w-2xl">
                Suivi des commandes et réceptions de pièces. Cliquez sur <strong>Pièce retirée</strong> dès disponibilité au magasin : le véhicule réintègre immédiatement l'atelier en cours avec notification d'acceptation, et une trace reste conservée dans cette liste.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-sm border border-white/15 transition-all cursor-pointer disabled:opacity-50"
                title="Actualiser les données"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Actualiser</span>
              </button>
            )}
          </div>
        </div>

        {/* Mini stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-amber-500/20">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-amber-200/70 font-semibold">Total dossiers</div>
            <div className="text-2xl font-black text-white mt-0.5">{acheterVehicles.length}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-amber-200/70 font-semibold">⏳ En attente pièces</div>
            <div className="text-2xl font-black text-amber-300 mt-0.5">{enAttenteCount}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-emerald-300/80 font-semibold">✅ Pièces retirées (Traces)</div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{livreCount}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-amber-200/70 font-semibold">Équipes concernées</div>
            <div className="text-2xl font-black text-amber-200 mt-0.5">
              {availableEquipes.filter((e) => e !== "Toutes").length}
            </div>
          </div>
        </div>
      </div>

      {/* Barre de recherche et filtres de statut */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher (OR, Châssis, Client, Réf...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedEquipe}
              onChange={(e) => setSelectedEquipe(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer w-full sm:w-auto"
            >
              {availableEquipes.map((eq) => (
                <option key={eq} value={eq}>
                  Équipe : {eq}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtres rapides par statut */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter("tous")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === "tous"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tous ({acheterVehicles.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("attente")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === "attente"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-600 hover:text-amber-800"
            }`}
          >
            <Clock size={12} />
            <span>En attente ({enAttenteCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("livre")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === "livre"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:text-emerald-800"
            }`}
          >
            <CheckCircle2 size={12} />
            <span>Pièces retirées ({livreCount})</span>
          </button>
        </div>
      </div>

      {/* Tableau des véhicules en attente achat */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="zebra-table w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5">N° OR / Dossier</th>
                <th className="py-3 px-3.5">Châssis & Véhicule</th>
                <th className="py-3 px-3.5">Client</th>
                <th className="py-3 px-3.5">Équipe & Tech</th>
                <th className="py-3 px-3.5 min-w-[200px]">Demande Pièce / Achat</th>
                <th className="py-3 px-3.5">Emplacement</th>
                <th className="py-3 px-3.5 min-w-[210px]">Statut Achat</th>
                <th className="py-3 px-3.5 min-w-[170px]">Avancement (Modifier)</th>
                <th className="py-3 px-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <PackageSearch className="w-10 h-10 text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-600 text-sm">
                        Aucun dossier ne correspond à votre sélection
                      </p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {statusFilter === "livre"
                          ? "Aucune pièce marquée comme livrée dans l'historique."
                          : "Lorsqu'un chef d'équipe sélectionne 'attends acheter', le dossier apparaît immédiatement ici."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const isSaving = savingVehicleId === row.id;
                  const allowedOptions = getAvancementOptionsForTeam(row.equipe, row);
                  const demande =
                    demandesMap[String(row.id)] ||
                    (row.no && demandesMap[row.no.trim()]) ||
                    (row.chassis && demandesMap[row.chassis.trim()]);
                  const isLivre = demande?.statutAchat === "Livrer" || demande?.statutAchat === "Livré";

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors group cursor-pointer ${
                        isLivre ? "bg-emerald-50/20 hover:bg-emerald-50/40" : "hover:bg-amber-50/30"
                      }`}
                      onClick={() => onViewDetail?.(row)}
                    >
                      {/* N° OR */}
                      <td className="py-3 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md font-mono text-xs font-bold shadow-2xs border ${
                              isLivre
                                ? "bg-emerald-50 text-emerald-950 border-emerald-200"
                                : "bg-amber-50 text-amber-900 border-amber-200"
                            }`}
                          >
                            {row.no || row.ordre || "-"}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {row.cs || "-"}
                          </span>
                        </div>
                      </td>

                      {/* Châssis & Véhicule */}
                      <td className="py-3 px-3.5">
                        <div className="font-mono text-xs font-semibold text-slate-800">
                          {row.chassis || "-"}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span className="font-bold text-slate-700">{row.marque}</span>
                          <span>•</span>
                          <span>{row.modele}</span>
                          {row.immatriculation && row.immatriculation !== "-" && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                              {row.immatriculation}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Client */}
                      <td className="py-3 px-3.5 max-w-[200px] truncate" title={row.client}>
                        <div className="font-medium text-slate-800 truncate">
                          {row.client || "Client non spécifié"}
                        </div>
                      </td>

                      {/* Équipe & Tech */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {row.equipe || "-"}
                          </span>
                          <span className="text-slate-600 text-[11px]">
                            {row.nomTechnicien || row.technicien || "-"}
                          </span>
                        </div>
                      </td>

                      {/* Demande Pièce / Achat */}
                      <td className="py-3 px-3.5">
                        {demande ? (
                          <div className="flex flex-col gap-1 max-w-[260px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                                <Tag size={10} />
                                {demande.ref}
                              </span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-800 border border-slate-200">
                                Qté: {demande.qt}
                              </span>
                              <span className="text-[9.5px] font-mono text-slate-400">
                                {demande.date}
                              </span>
                            </div>
                            <div className="font-semibold text-slate-800 text-[11px] truncate" title={demande.designation}>
                              {demande.designation}
                            </div>
                            {demande.modeCommande === "Téléphone" && (
                              <div className="text-[10px] font-semibold text-sky-700 truncate" title={demande.telephoneFournisseur || demande.fournisseur}>
                                ☎ Commande téléphone{demande.fournisseur ? ` · ${demande.fournisseur}` : ""}{demande.telephoneFournisseur ? ` · ${demande.telephoneFournisseur}` : ""}
                              </div>
                            )}
                            {demande.commentaire && (
                              <div className="text-[10px] text-slate-500 italic truncate" title={demande.commentaire}>
                                💬 {demande.commentaire}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">En attente approvisionnement</span>
                        )}
                      </td>

                      {/* Emplacement */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          <MapPin className="w-3 h-3 text-amber-600" />
                          <span>{row.emplacement || "-"}</span>
                        </span>
                      </td>

                      {/* Statut Achat (Attente / Livrer) */}
                      <td
                        className="py-3 px-3.5 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col gap-1.5">
                          {/* Groupe de boutons Attente / Livrer */}
                          <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200/90 shadow-2xs w-fit">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => {
                                if (isLivre) {
                                  const effectiveDemande: DemandeAchat = demande || {
                                    id: `achat_${row.id}_${Date.now()}`,
                                    vehicleId: row.id,
                                    ref: "-",
                                    designation: "Achat pièces",
                                    qt: 1,
                                    or: row.no || row.ordre || "-",
                                    chassis: row.chassis || "-",
                                    client: row.client || "-",
                                    date: new Date().toLocaleDateString("fr-FR"),
                                    commentaire: "",
                                    statutAchat: "Attente",
                                  };
                                  void onMarquerAttente?.(row, effectiveDemande);
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                !isLivre
                                  ? "bg-amber-500 text-white shadow-sm font-black"
                                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                              }`}
                              title="Dossier en attente de commande ou livraison de pièces"
                            >
                              <Clock size={12} className={!isLivre ? "animate-pulse" : ""} />
                              <span>Attente</span>
                            </button>

                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => {
                                if (!isLivre) {
                                  const effectiveDemande: DemandeAchat = demande || {
                                    id: `achat_${row.id}_${Date.now()}`,
                                    vehicleId: row.id,
                                    ref: "-",
                                    designation: "Achat pièces",
                                    qt: 1,
                                    or: row.no || row.ordre || "-",
                                    chassis: row.chassis || "-",
                                    client: row.client || "-",
                                    date: new Date().toLocaleDateString("fr-FR"),
                                    commentaire: "",
                                    statutAchat: "Attente",
                                  };
                                  void onMarquerLivrer?.(row, effectiveDemande);
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                isLivre
                                  ? "bg-emerald-600 text-white shadow-sm font-black"
                                  : "text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                              }`}
                              title="Pièce retirée du magasin PDR : renvoie le véhicule en cours d'intervention pour son équipe avec notification pour accepter"
                            >
                              <CheckCircle2 size={12} />
                              <span>Pièce retirée</span>
                            </button>
                          </div>

                          {/* Badge d'état & Trace */}
                          {isLivre ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 w-fit">
                                <CheckCircle2 size={11} className="text-emerald-600" />
                                <span>Pièce arrivée {demande?.dateLivraison ? `le ${demande.dateLivraison}` : ""}</span>
                              </span>
                              <span className="text-[9.5px] text-emerald-700 font-semibold italic">
                                Notification envoyée à l'équipe • En attente d'acceptation
                              </span>
                            </div>
                          ) : (
                            <span className="text-[9.5px] text-amber-700/80 font-medium">
                              En attente de retrait magasin
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Avancement (Sélecteur direct pour le Chef d'Équipe) */}
                      <td
                        className="py-3 px-3.5 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col gap-1 min-w-[150px]">
                          <select
                            disabled={isSaving || !canEdit}
                            style={getAvancementBadgeStyle(row.avancement)}
                            value={row.avancement || "attends acheter"}
                            onChange={(e) => void onUpdateAvancement(row, e.target.value)}
                            className="px-2.5 py-1 text-xs rounded-lg border font-bold shadow-2xs outline-none cursor-pointer focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60"
                            title="Avancement - Choisissez l'avancement de 10% à 100%."
                          >
                            <option value="attends acheter">attends acheter (Attente pièces)</option>
                            <optgroup label="Relancer en atelier (Pièces reçues)">
                              {[
                                "Lancement devis",
                                "En cours - 10%",
                                "En cours - 20%",
                                "En cours - 30%",
                                "En cours - 40%",
                                "En cours - 50%",
                                "En cours - 60%",
                                "En cours - 70%",
                                "En cours - 80%",
                                "En cours - 90%",
                              ].map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Passer en Essai ou Terminer">
                              <option value="Essai">Essai</option>
                              <option value="Terminer">Terminer</option>
                            </optgroup>
                            {allowedOptions.filter((opt) => opt.startsWith("vr")).length > 0 && (
                              <optgroup label="Transfert VR">
                                {allowedOptions
                                  .filter((opt) => opt.startsWith("vr"))
                                  .map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                          </select>
                          <span className="text-[9.5px] text-amber-700/80 font-medium">
                            {isLivre ? "Retour en Attente Réparation jusqu'à l'acceptation de l'équipe" : "Le chef d'équipe enregistre date et heure de la demande"}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td
                        className="py-3 px-3.5 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => triggerViewDetail?.(row)}
                          className="p-1.5 rounded-lg text-amber-700 hover:text-amber-900 hover:bg-amber-100/70 border border-amber-200 transition-colors cursor-pointer"
                          title="Voir la fiche détaillée"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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
  );
}
