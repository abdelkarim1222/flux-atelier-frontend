import { useState, useMemo, useEffect, type CSSProperties } from "react";
import {
  Gauge,
  Search,
  Filter,
  RefreshCw,
  MapPin,
  CheckCircle2,
  Eye,
} from "lucide-react";
import type { Flux } from "../data/mockData";
import {
  getAvancementOptionsForTeam,
  getEssaisControleLocal,
  type DemandeEssaiControle,
} from "../services/googleSheets";
import ValidationEssaiModal, {
  type EssaiValidationPayload,
} from "./ValidationEssaiModal";

interface EssaiViewProps {
  vehicles: Flux[];
  onUpdateAvancement: (row: Flux, nextAvancement: string) => Promise<void>;
  onValidateEssai?: (payload: EssaiValidationPayload) => Promise<void>;
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

export default function EssaiView({
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
  onValidateEssai,
}: EssaiViewProps) {
  const triggerViewDetail = onViewDetail || onSelectVehicle;
  const [search, setSearch] = useState("");
  const [selectedEquipe, setSelectedEquipe] = useState("Toutes");
  const [essaiModalVehicle, setEssaiModalVehicle] = useState<Flux | null>(null);
  const [essaisHistory, setEssaisHistory] = useState<Record<string, DemandeEssaiControle>>(() =>
    getEssaisControleLocal()
  );

  useEffect(() => {
    const handleUpdate = () => {
      setEssaisHistory(getEssaisControleLocal());
    };
    window.addEventListener("essais_controle_updated", handleUpdate);
    return () => {
      window.removeEventListener("essais_controle_updated", handleUpdate);
    };
  }, []);


  // Filtre les véhicules qui sont actuellement en "Essai"
  const essaiVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const av = (v.avancement || "").trim().toLowerCase();
      const etat = (v.etatIntervention || "").trim().toLowerCase();
      return av === "essai" || etat === "essai";
    });
  }, [vehicles]);

  // Équipes présentes parmi les véhicules en essai
  const availableEquipes = useMemo(() => {
    const set = new Set<string>();
    essaiVehicles.forEach((v) => {
      if (v.equipe && v.equipe !== "-") {
        set.add(v.equipe.trim());
      }
    });
    return ["Toutes", ...Array.from(set).sort()];
  }, [essaiVehicles]);

  // Données filtrées pour l'affichage
  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return essaiVehicles.filter((row) => {
      if (selectedEquipe !== "Toutes") {
        if (!row.equipe || row.equipe.trim().toLowerCase() !== selectedEquipe.toLowerCase()) {
          return false;
        }
      }

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
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [essaiVehicles, selectedEquipe, search]);

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-in fade-in duration-200">
      {/* En-tête de la Page Essai */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-purple-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-purple-500/20 text-purple-300 rounded-2xl border border-purple-400/30 shadow-inner">
              <Gauge className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Véhicules en Essai & Contrôle
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-500/30 text-purple-200 border border-purple-400/40">
                  {essaiVehicles.length} en cours
                </span>
              </div>
              <p className="text-xs text-purple-200/80 mt-1 max-w-2xl">
                Suivi des véhicules ayant terminé leurs réparations mécaniques et actuellement soumis aux essais sur route, contrôles qualité ou vérifications finales.
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-purple-500/20">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-purple-200/70 font-semibold">Total en Essai</div>
            <div className="text-2xl font-black text-white mt-0.5">{essaiVehicles.length}</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-purple-200/70 font-semibold">Équipes mobilisées</div>
            <div className="text-2xl font-black text-purple-300 mt-0.5">
              {availableEquipes.filter((e) => e !== "Toutes").length}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-purple-200/70 font-semibold">Validation finale</div>
            <div className="text-xs font-medium text-purple-100 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Prêt pour passage à Terminer</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher (OR, Châssis, Client...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedEquipe}
            onChange={(e) => setSelectedEquipe(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-purple-500/20 cursor-pointer"
          >
            {availableEquipes.map((eq) => (
              <option key={eq} value={eq}>
                Équipe : {eq}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tableau des véhicules en essai */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5">N° OR / Dossier</th>
                <th className="py-3 px-3.5">Châssis & Véhicule</th>
                <th className="py-3 px-3.5">Client</th>
                <th className="py-3 px-3.5">Équipe & Tech</th>
                <th className="py-3 px-3.5">Emplacement</th>
                <th className="py-3 px-3.5 min-w-[210px]">Contrôle & Validation Essai</th>
                <th className="py-3 px-3.5 text-center min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Gauge className="w-10 h-10 text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-600 text-sm">
                        Aucun véhicule actuellement en essai
                      </p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Lorsqu'un chef d'équipe sélectionne l'avancement "Essai", le véhicule est automatiquement transféré dans cette page.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const isSaving = savingVehicleId === row.id;
                  const allowedOptions = getAvancementOptionsForTeam(row.equipe, row);
                  const vehicleKey = String(row.id || row.no || row.chassis);
                  const lastEssai =
                    essaisHistory[vehicleKey] ||
                    (row.no ? essaisHistory[row.no] : undefined) ||
                    (row.chassis ? essaisHistory[row.chassis] : undefined);

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-purple-50/30 transition-colors group cursor-pointer"
                      onClick={() => onViewDetail?.(row)}
                    >
                      {/* N° OR */}
                      <td className="py-3 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="inline-block px-2.5 py-1 rounded-md bg-purple-50 text-purple-900 border border-purple-200 font-mono text-xs font-bold shadow-2xs">
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
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {row.equipe || "-"}
                          </span>
                          <span className="text-slate-600 text-[11px]">
                            {row.nomTechnicien || row.technicien || "-"}
                          </span>
                        </div>
                      </td>

                      {/* Emplacement */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          <MapPin className="w-3 h-3 text-purple-600" />
                          <span>{row.emplacement || "-"}</span>
                        </span>
                      </td>

                      {/* Contrôle & Validation Essai */}
                      <td
                        className="py-3 px-3.5 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col gap-1.5 items-start">
                          <button
                            type="button"
                            disabled={isSaving || !canEdit}
                            onClick={() => setEssaiModalVehicle(row)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-bold text-xs shadow-xs hover:shadow active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                            title="Ouvrir le formulaire de contrôle de l'essayeur"
                          >
                            <Gauge className="w-3.5 h-3.5 text-purple-200" />
                            <span>Contrôle Essai</span>
                          </button>

                          {lastEssai ? (
                            <div className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                              <span className="font-semibold text-slate-600">{lastEssai.essayeur}:</span>
                              <span
                                className={`font-bold ${
                                  lastEssai.resultat === "CONFORME"
                                    ? "text-emerald-700"
                                    : "text-rose-700"
                                }`}
                              >
                                {lastEssai.resultat}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <select
                                disabled={isSaving || !canEdit}
                                style={getAvancementBadgeStyle(row.avancement)}
                                value={row.avancement || "Essai"}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "Terminer" || val.startsWith("vr")) {
                                    setEssaiModalVehicle(row);
                                  } else {
                                    void onUpdateAvancement(row, val);
                                  }
                                }}
                                className="px-2 py-0.5 text-[11px] rounded-lg border font-bold shadow-2xs outline-none cursor-pointer focus:ring-2 focus:ring-purple-500/20 disabled:opacity-60"
                                title="Avancement direct"
                              >
                                <option value="Essai">Essai (En test)</option>
                                <option value="Terminer">Terminer (Test validé)</option>
                                <optgroup label="Renvoyer en En cours">
                                  {[
                                    "ATENDE DEVIS",
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
                                <optgroup label="Autres options">
                                  <option value="attends acheter">attends acheter</option>
                                  {allowedOptions
                                    .filter((opt) => opt.startsWith("vr"))
                                    .map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3 px-3.5 text-center whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={isSaving || !canEdit}
                            onClick={() => setEssaiModalVehicle(row)}
                            className="p-1.5 rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 hover:text-purple-900 border border-purple-200 transition-colors cursor-pointer"
                            title="Effectuer le contrôle de l'essayeur"
                          >
                            <Gauge className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerViewDetail?.(row)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-purple-800 hover:bg-purple-100/70 border border-slate-200 hover:border-purple-200 transition-colors cursor-pointer"
                            title="Voir la fiche détaillée"
                          >
                            <Eye className="w-4 h-4" />
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

      {/* Modal Validation Essai */}
      <ValidationEssaiModal
        isOpen={Boolean(essaiModalVehicle)}
        vehicle={essaiModalVehicle}
        onClose={() => setEssaiModalVehicle(null)}
        onConfirm={async (payload) => {
          if (onValidateEssai) {
            await onValidateEssai(payload);
          } else {
            if (payload.resultat === "CONFORME") {
              await onUpdateAvancement(payload.vehicle, "Terminer");
            } else if (payload.actionNonConforme === "transfert_vr" && payload.targetVr) {
              await onUpdateAvancement(payload.vehicle, payload.targetVr);
            } else {
              await onUpdateAvancement(payload.vehicle, "Attente client");
            }
          }
        }}
      />
    </div>
  );
}

