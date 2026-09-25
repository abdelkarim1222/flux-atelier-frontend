import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Wrench,
  UserCheck,
  X,
  Check,
  ArrowRight,
  Users,
  ShieldCheck,
  Zap,
  Hammer,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { type Flux } from "../data/mockData";
import { type EquipeMember, DEFAULT_EQUIPE_MAPPINGS } from "../services/googleSheets";

import { CANONICAL_TEAMS } from "../config/teams";

export function normalizeTeamName(t: string): string {
  const norm = (t || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (norm.includes("daily1")) return "daily1";
  if (norm.includes("daily2")) return "daily2";
  if (norm.includes("daily")) return "daily1";
  if (norm.includes("rapide") || norm.includes("serv")) return "servwrapide";
  if (norm.includes("lourd")) return "lourd";
  if (norm.includes("changan")) return "changan";
  if (norm.includes("carross")) return "carrosserie";
  if (norm.includes("elect") || norm.includes("elict")) return "elictrique";
  return norm;
}

interface AffecterTechnicienModalProps {
  isOpen: boolean;
  vehicle: Flux | null;
  assignedTeam: string;
  equipeMembers: EquipeMember[];
  isOnlyTechnicienChange?: boolean;
  isTransferAcceptance?: boolean;
  canChangeTeam?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    vehicle: Flux;
    technicien: string;
    nomTechnicien: string;
    poste: string;
    equipe: string;
  }) => Promise<void> | void;
  onConfirmWithoutTech?: (vehicle: Flux, equipe: string) => Promise<void> | void;
}

export default function AffecterTechnicienModal({
  isOpen,
  vehicle,
  assignedTeam,
  equipeMembers,
  isOnlyTechnicienChange = false,
  isTransferAcceptance = false,
  canChangeTeam = false,
  onClose,
  onConfirm,
  onConfirmWithoutTech,
}: AffecterTechnicienModalProps) {
  const [currentTeam, setCurrentTeam] = useState<string>(assignedTeam || "Daily1");
  const [selectedMatricule, setSelectedMatricule] = useState<string>("");
  const [selectedNom, setSelectedNom] = useState<string>("");
  const [selectedPoste, setSelectedPoste] = useState<string>("");
  const [showOtherTeams, setShowOtherTeams] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Synchronise currentTeam when modal opens or assignedTeam changes
  useEffect(() => {
    if (isOpen) {
      const targetTeam = assignedTeam && assignedTeam.trim() !== "-" ? assignedTeam.trim() : "Daily1";
      setCurrentTeam(targetTeam);
      setShowOtherTeams(false);
    }
  }, [isOpen, assignedTeam]);

  // Guaranteed full list of members
  const allMembers = useMemo(() => {
    return equipeMembers && equipeMembers.length > 0 ? equipeMembers : DEFAULT_EQUIPE_MAPPINGS;
  }, [equipeMembers]);

  // Group members into current team and other teams
  const { teamMembers, otherMembers } = useMemo(() => {
    const norm = normalizeTeamName(currentTeam);
    const inTeam: EquipeMember[] = [];
    const others: EquipeMember[] = [];

    allMembers.forEach((m) => {
      if (normalizeTeamName(m.team) === norm) {
        inTeam.push(m);
      } else {
        others.push(m);
      }
    });

    // Fallback if team has 0 members in sheet: take from defaults
    if (inTeam.length === 0) {
      DEFAULT_EQUIPE_MAPPINGS.forEach((m) => {
        if (normalizeTeamName(m.team) === norm) {
          inTeam.push(m);
        }
      });
    }

    // Sort so technicians/mechanics appear first, followed by Chef d'équipe
    inTeam.sort((a, b) => {
      const aIsChef = a.poste.toUpperCase().includes("CHEF") ? 1 : 0;
      const bIsChef = b.poste.toUpperCase().includes("CHEF") ? 1 : 0;
      return aIsChef - bIsChef;
    });

    return { teamMembers: inTeam, otherMembers: others };
  }, [allMembers, currentTeam]);

  // Pre-fill on open if vehicle already has a technicien
  useEffect(() => {
    if (!isOpen || !vehicle) return;

    if (vehicle.technicien && vehicle.technicien !== "-") {
      const match = allMembers.find(
        (m) =>
          m.matricule === vehicle.technicien ||
          (vehicle.nomTechnicien && m.name.toLowerCase() === vehicle.nomTechnicien.toLowerCase())
      );
      if (match) {
        setSelectedMatricule(match.matricule);
        setSelectedNom(match.name);
        setSelectedPoste(match.poste || "");
        if (match.team) {
          setCurrentTeam(match.team);
        }
        return;
      }
      setSelectedMatricule(vehicle.technicien && vehicle.technicien !== "-" ? vehicle.technicien : "");
      setSelectedNom(vehicle.nomTechnicien && vehicle.nomTechnicien !== "-" ? vehicle.nomTechnicien : "");
      setSelectedPoste("");
      return;
    }

    // Default: clear selection so the user can choose who works
    setSelectedMatricule("");
    setSelectedNom("");
    setSelectedPoste("");
  }, [isOpen, vehicle, allMembers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicle) return;

    setIsSubmitting(true);
    try {
      await onConfirm({
        vehicle,
        technicien: selectedMatricule.trim() || "-",
        nomTechnicien: selectedNom.trim() || "-",
        poste: selectedPoste.trim() || "-",
        equipe: currentTeam || assignedTeam || "Daily1",
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipTech = async () => {
    if (!vehicle || !onConfirmWithoutTech) return;
    setIsSubmitting(true);
    try {
      await onConfirmWithoutTech(vehicle, currentTeam || assignedTeam || "Daily1");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !vehicle) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 shadow-inner">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                {isTransferAcceptance
                  ? "Accepter le Travail & Choisir le Technicien"
                  : isOnlyTechnicienChange
                  ? "Modifier le Technicien"
                  : "Affecter un Technicien & Passer En cours"}
              </h3>
              <p className="text-xs text-blue-100 font-medium">
                {vehicle.no || vehicle.l2n2500 ? `OR: ${vehicle.no || vehicle.l2n2500} • ` : ""}
                {vehicle.marque} {vehicle.modele || vehicle.modelePowerBI || ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Status & Team Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-50/90 rounded-xl border border-blue-200/80 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-600 font-semibold">Équipe affectée :</span>
              <span className="px-2.5 py-0.5 rounded-md font-extrabold text-[12px] bg-blue-600 text-white shadow-xs">
                {currentTeam}
              </span>
            </div>

            {isTransferAcceptance ? (
              <div className="flex items-center gap-1.5 text-amber-800 font-bold bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
                <span>Transfert reçu de :</span>
                <span className="text-amber-950 font-extrabold">
                  {(vehicle.bloc === 3 ? (vehicle.equipe2 || vehicle.equipe1) : vehicle.equipe1) || "Équipe précédente"}
                </span>
              </div>
            ) : !isOnlyTechnicienChange ? (
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <span className="text-slate-600">{vehicle.etatIntervention || "Attente Réparation"}</span>
                <ArrowRight size={13} className="text-slate-400" />
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold">
                  En cours
                </span>
              </div>
            ) : null}
          </div>

          {/* Optional Team Selector for Chef Atelier / Admin */}
          {canChangeTeam && (
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 block">
                Changer d'équipe (Accès Responsable) :
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CANONICAL_TEAMS.map((teamName) => {
                  const isActive = normalizeTeamName(currentTeam) === normalizeTeamName(teamName);
                  return (
                    <button
                      key={teamName}
                      type="button"
                      onClick={() => {
                        setCurrentTeam(teamName);
                        setSelectedMatricule("");
                        setSelectedNom("");
                        setSelectedPoste("");
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        isActive
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-400/40"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {teamName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vehicle summary pills */}
          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Châssis</span>
              <span className="font-bold text-slate-800 font-mono text-[11px]">{vehicle.chassis || "-"}</span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Client</span>
              <span className="font-bold text-slate-800 truncate block text-[11px]" title={vehicle.client}>
                {vehicle.client || "-"}
              </span>
            </div>
          </div>

          {/* TEAM MEMBERS SELECTION CARDS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Users size={14} className="text-blue-600" />
                <span>
                  Qui de l'équipe <strong className="text-blue-700 font-black">{currentTeam}</strong> va travailler ?
                </span>
                <span className="text-red-500 font-bold">*</span>
              </label>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {teamMembers.length} {teamMembers.length > 1 ? "collaborateurs" : "collaborateur"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Cliquez directement sur la personne de cette équipe pour l'affecter à l'intervention :
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1.5 bg-slate-50/70 rounded-xl border border-slate-200">
              {teamMembers.map((member) => {
                const isSelected = selectedMatricule === member.matricule;
                const isChef = member.poste.toUpperCase().includes("CHEF");
                return (
                  <button
                    key={`${member.matricule}_${member.name}`}
                    type="button"
                    onClick={() => {
                      setSelectedMatricule(member.matricule);
                      setSelectedNom(member.name);
                      setSelectedPoste(member.poste);
                    }}
                    className={`group text-left p-3 rounded-xl border-2 transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                      isSelected
                        ? "border-blue-600 bg-blue-50 shadow-sm ring-2 ring-blue-500/30"
                        : "border-slate-200 hover:border-blue-300 hover:bg-white bg-white/90"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-transform group-hover:scale-105 ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-xs"
                            : isChef
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {isChef ? (
                          <ShieldCheck size={16} className={isSelected ? "text-white" : "text-amber-700"} />
                        ) : member.poste.toUpperCase().includes("ELEC") ? (
                          <Zap size={15} className={isSelected ? "text-white" : "text-purple-600"} />
                        ) : member.poste.toUpperCase().includes("TOLL") ? (
                          <Hammer size={15} className={isSelected ? "text-white" : "text-emerald-600"} />
                        ) : (
                          <Wrench size={15} className={isSelected ? "text-white" : "text-blue-600"} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-extrabold text-xs text-slate-900 truncate">
                          {member.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                          <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {member.matricule}
                          </span>
                          <span
                            className={`font-semibold uppercase truncate ${
                              isChef ? "text-amber-700 font-bold" : "text-slate-500"
                            }`}
                          >
                            {member.poste}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-xs scale-105"
                          : "border-2 border-slate-300 bg-white group-hover:border-blue-400"
                      }`}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Member Confirmation Card */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
              selectedMatricule
                ? "bg-emerald-50/90 border-emerald-300 text-emerald-950"
                : "bg-amber-50/80 border-amber-200 text-amber-900"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedMatricule ? "bg-emerald-600 text-white" : "bg-amber-200 text-amber-800"
                }`}
              >
                <UserCheck size={16} />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-[10px] block text-slate-500 uppercase tracking-wide">
                  Personne désignée :
                </span>
                {selectedMatricule ? (
                  <div className="font-extrabold text-xs text-emerald-900 truncate">
                    <span className="font-mono bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 mr-1.5">
                      {selectedMatricule}
                    </span>
                    {selectedNom} {selectedPoste ? `(${selectedPoste})` : ""}
                  </div>
                ) : (
                  <span className="text-amber-800 font-semibold italic text-xs">
                    Veuillez cliquer sur une personne de l'équipe ci-dessus.
                  </span>
                )}
              </div>
            </div>

            {selectedMatricule && (
              <span className="px-2 py-0.5 rounded-md font-extrabold text-[11px] bg-emerald-200 text-emerald-800 border border-emerald-300 shrink-0">
                Sélectionné
              </span>
            )}
           {/* Collapsible: Autre collaborateur ou autre équipe (Réservé au Chef Atelier / Administration) */}
          {canChangeTeam && (
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowOtherTeams(!showOtherTeams)}
                className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span>Besoin d'affecter un collaborateur d'une autre équipe ?</span>
                </div>
                {showOtherTeams ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showOtherTeams && (
                <div className="p-3 bg-white border-t border-slate-200 space-y-3 animate-in slide-in-from-top-1 duration-150">
                  <div>
                    <label htmlFor="select-other-member" className="block text-[11px] font-bold text-slate-700 mb-1">
                      Choisir un technicien parmi toutes les équipes :
                    </label>
                    <select
                      id="select-other-member"
                      value={selectedMatricule}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setSelectedMatricule("");
                          setSelectedNom("");
                          setSelectedPoste("");
                          return;
                        }
                        const match = allMembers.find((m) => m.matricule === val);
                        if (match) {
                          setSelectedMatricule(match.matricule);
                          setSelectedNom(match.name);
                          setSelectedPoste(match.poste);
                          setCurrentTeam(match.team);
                        }
                      }}
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-2"
                    >
                      <option value="">-- Sélectionner un autre collaborateur --</option>
                      {otherMembers.map((m) => (
                        <option key={`other_${m.team}_${m.matricule}`} value={m.matricule}>
                          [{m.team}] {m.name} ({m.poste}) - Mat: {m.matricule}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Annuler
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {!isOnlyTechnicienChange && onConfirmWithoutTech && (
                <button
                  type="button"
                  onClick={handleSkipTech}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  title="Passer en cours et affecter le technicien plus tard"
                >
                  Sans technicien
                </button>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !selectedMatricule}
                className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all cursor-pointer ${
                  selectedMatricule
                    ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                }`}
              >
                <Check size={14} strokeWidth={2.5} />
                <span>
                  {isSubmitting
                    ? "Enregistrement..."
                    : isTransferAcceptance
                    ? "Accepter le Travail & Affecter"
                    : isOnlyTechnicienChange
                    ? "Valider Technicien"
                    : "Valider & Passer En cours"}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
