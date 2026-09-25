import { useState, useEffect, useMemo, type CSSProperties } from "react";
import {
  FileSignature,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  RotateCw,
  ExternalLink,
  Tag,
  Hash,
} from "lucide-react";
import type { Flux } from "../data/mockData";
import {
  getDemandesDevisLocal,
  saveDemandeDevisLocal,
  getAvancementOptionsForTeam,
  type DemandeDevis,
} from "../services/googleSheets";

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
  onRefresh?: () => void;
  isRefreshing?: boolean;
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

export default function DevisView({
  vehicles,
  onUpdateAvancement,
  onSelectVehicle,
  onViewDetail,
  savingVehicleId,
  canEdit = true,
  onRefresh,
  isRefreshing = false,
}: DevisViewProps) {
  const triggerViewDetail = onViewDetail || onSelectVehicle;
  const [search, setSearch] = useState("");
  const [selectedEquipe, setSelectedEquipe] = useState("Toutes");
  const [statusFilter, setStatusFilter] = useState<"tous" | "attente" | "accorde">("tous");
  const [demandesDevisMap, setDemandesDevisMap] = useState<Record<string, DemandeDevis>>(getDemandesDevisLocal);

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

  // Filtre les véhicules qui sont actuellement en "ATENDE DEVIS" ou ayant une fiche devis
  const devisVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const av = (v.avancement || "").trim().toLowerCase();
      const etat = (v.etatIntervention || "").trim().toLowerCase();
      const hasDevis = Boolean(
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()])
      );
      return (
        hasDevis ||
        av === "atende devis" ||
        av === "attente devis" ||
        av.includes("devis") ||
        etat.includes("devis")
      );
    });
  }, [vehicles, demandesDevisMap]);

  // Comptes pour les statistiques
  const enAttenteCount = useMemo(() => {
    return devisVehicles.filter((v) => {
      const d =
        demandesDevisMap[String(v.id)] ||
        (v.no && demandesDevisMap[v.no.trim()]) ||
        (v.chassis && demandesDevisMap[v.chassis.trim()]);
      return !d || d.statutDevis !== "Accepté";
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
      const isAccorde = d?.statutDevis === "Accepté";

      if (statusFilter === "attente" && isAccorde) return false;
      if (statusFilter === "accorde" && !isAccorde) return false;

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
        d?.commentaire,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [devisVehicles, selectedEquipe, search, statusFilter, demandesDevisMap]);

  const handleValiderAccordClient = async (row: Flux) => {
    const d =
      demandesDevisMap[String(row.id)] ||
      (row.no && demandesDevisMap[row.no.trim()]) ||
      (row.chassis && demandesDevisMap[row.chassis.trim()]);

    if (d) {
      saveDemandeDevisLocal({
        ...d,
        statutDevis: "Accepté",
      });
    }
    // Renvoyer en atelier à 10%
    await onUpdateAvancement(row, "En cours - 10%");
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-in fade-in duration-200">
      {/* En-tête de la Page Devis */}
      <div className="bg-gradient-to-r from-orange-950 via-amber-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-orange-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-orange-500/20 text-orange-300 rounded-2xl border border-orange-400/30 shadow-inner">
              <FileSignature className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Véhicules en Attente Devis (N° DV)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-orange-500/30 text-orange-200 border border-orange-400/40">
                  {devisVehicles.length} dossiers
                </span>
              </div>
              <p className="text-xs text-orange-200/80 mt-1 max-w-2xl">
                Suivi des véhicules placés en <strong>ATENDE DEVIS</strong> avec leur <strong>N° DV</strong>. Dès que l'accord client est validé, vous pouvez relancer les réparations en atelier directement depuis cette page.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/15 active:scale-95 text-white rounded-xl border border-white/10 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <RotateCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                <span>Actualiser</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cartes d'indicateurs rapides */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Devis</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{devisVehicles.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Dossiers sous devis</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100">
            <FileSignature size={24} />
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600">En attente accord</div>
            <div className="text-2xl font-black text-amber-700 mt-0.5">{enAttenteCount}</div>
            <div className="text-[11px] text-amber-600/80 mt-0.5">N° DV émis / attente validation</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Clock size={24} />
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Accord Validé</div>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">{accordeCount}</div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">Prêt à reprendre l'atelier</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <CheckCircle2 size={24} />
          </div>
        </div>
      </div>

      {/* Barre de filtres et recherche */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
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
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start md:self-auto">
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
            onClick={() => setStatusFilter("attente")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              statusFilter === "attente"
                ? "bg-white text-amber-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            En attente ({enAttenteCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("accorde")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              statusFilter === "accorde"
                ? "bg-white text-emerald-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Accordé ({accordeCount})
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
                <th className="py-3 px-3.5">Immatriculation</th>
                <th className="py-3 px-3.5">Modèle</th>
                <th className="py-3 px-3.5">Châssis</th>
                <th className="py-3 px-3.5">Client</th>
                <th className="py-3 px-3.5">Équipe</th>
                <th className="py-3 px-3.5">Date Devis</th>
                <th className="py-3 px-3.5">Avancement</th>
                <th className="py-3 px-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileSignature size={36} className="text-slate-300" />
                      <p className="font-bold text-sm text-slate-600">Aucun dossier en attente devis</p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {search
                          ? "Aucun résultat ne correspond à votre recherche."
                          : "Lorsqu'un chef d'équipe choisit 'ATENDE DEVIS', le véhicule apparaît automatiquement ici avec son N° DV."}
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

                  return (
                    <tr
                      key={row.id}
                      onClick={() => triggerViewDetail && triggerViewDetail(row)}
                      className={`hover:bg-orange-50/40 transition-colors cursor-pointer ${
                        isAccorde ? "bg-emerald-50/20" : ""
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

                      {/* Immatriculation */}
                      <td className="py-3 px-3.5 font-bold text-slate-800 whitespace-nowrap">
                        {row.immatriculation || row.serie || "-"}
                      </td>

                      {/* Modèle */}
                      <td className="py-3 px-3.5 text-slate-700 whitespace-nowrap font-medium">
                        {row.modele || row.marque || "-"}
                      </td>

                      {/* N° Châssis */}
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap" title={row.chassis}>
                        {row.chassis || "-"}
                      </td>

                      {/* Client */}
                      <td className="py-3 px-3.5 font-medium text-slate-800 whitespace-nowrap max-w-[170px] truncate" title={row.client}>
                        {row.client || "-"}
                      </td>

                      {/* Équipe */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {row.equipe || "-"}
                        </span>
                      </td>

                      {/* Date Devis */}
                      <td className="py-3 px-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                        {devis?.date || "-"}
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
                            value={row.avancement || "ATENDE DEVIS"}
                            onChange={(e) => void onUpdateAvancement(row, e.target.value)}
                            className="px-2.5 py-1 text-xs rounded-lg border font-bold shadow-2xs outline-none cursor-pointer focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60"
                            title="Avancement - Choisissez pour relancer en atelier ou transférer"
                          >
                            <option value="ATENDE DEVIS">ATENDE DEVIS (En attente devis)</option>
                            <optgroup label="Relancer en atelier (Accord reçu)">
                              {[
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
                            <optgroup label="Attente Pièces">
                              <option value="attends acheter">attends acheter</option>
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
                        </div>
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3 px-3.5 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleValiderAccordClient(row)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 rounded-lg shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                              title="Valider l'accord devis et renvoyer en atelier (En cours - 10%)"
                            >
                              <CheckCircle2 size={12} />
                              <span>Accord Reçu</span>
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
    </div>
  );
}
