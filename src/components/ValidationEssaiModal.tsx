import { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  Gauge,
  X,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Hash,
  Car,
  ArrowRightLeft,
  Clock,
  FileText,
  AlertCircle,
} from "lucide-react";
import type { Flux } from "../data/mockData";

export const ESSAYEUR_OPTIONS = [
  "Wajih Touil",
  "Mohamed Hechmi",
  "Sami Gaied",
  "Aymen Ben Ali",
  "Mehdi Mefteh",
] as const;

export type EssayeurName = (typeof ESSAYEUR_OPTIONS)[number];

export const VR_RETOUR_OPTIONS = [
  { value: "vrService Rapide", label: "Service Rapide", color: "blue" },
  { value: "vrDaily", label: "Daily", color: "indigo" },
  { value: "vrElictrique", label: "Électrique", color: "amber" },
  { value: "vrCarrosserie", label: "Carrosserie", color: "rose" },
  { value: "vrLourd", label: "Lourd", color: "slate" },
  { value: "vrChangan", label: "Changan", color: "teal" },
] as const;

export interface EssaiValidationPayload {
  vehicle: Flux;
  essayeur: string;
  or: string;
  modele: string;
  resultat: "CONFORME" | "NON-CONFORME";
  actionNonConforme?: "transfert_vr" | "attente_client";
  targetVr?: string;
  descriptionPanne?: string;
  dateControle: string;
}

interface ValidationEssaiModalProps {
  isOpen: boolean;
  vehicle: Flux | null;
  onClose: () => void;
  onConfirm: (payload: EssaiValidationPayload) => Promise<void> | void;
}

function getNowFormatted(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export default function ValidationEssaiModal({
  isOpen,
  vehicle,
  onClose,
  onConfirm,
}: ValidationEssaiModalProps) {
  const [essayeur, setEssayeur] = useState<string>(ESSAYEUR_OPTIONS[0]);
  const [resultat, setResultat] = useState<"CONFORME" | "NON-CONFORME">("CONFORME");
  const [actionNonConforme, setActionNonConforme] = useState<"transfert_vr" | "attente_client">("transfert_vr");
  const [targetVr, setTargetVr] = useState<string>("vrService Rapide");
  const [descriptionPanne, setDescriptionPanne] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && vehicle) {
      setEssayeur(ESSAYEUR_OPTIONS[0]);
      setResultat("CONFORME");
      setActionNonConforme("transfert_vr");
      setTargetVr("vrService Rapide");
      setDescriptionPanne("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, vehicle]);

  if (!isOpen || !vehicle) return null;

  const noOr = vehicle.no || vehicle.ordre || vehicle.l2n2500 || "-";
  const rawModele = (vehicle.modele || vehicle.modelePowerBI || "").trim();
  const rawMarque = (vehicle.marque || "").trim();
  let modeleAffiche = rawModele;
  if (rawMarque && rawModele && !rawModele.toLowerCase().includes(rawMarque.toLowerCase())) {
    modeleAffiche = `${rawMarque} ${rawModele}`;
  } else if (!modeleAffiche) {
    modeleAffiche = rawMarque || "-";
  }
  const chassis = vehicle.chassis || "-";
  const client = vehicle.client || "-";


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!essayeur) {
      setError("Veuillez sélectionner le nom de l'essayeur.");
      return;
    }

    if (resultat === "NON-CONFORME") {
      if (actionNonConforme === "transfert_vr" && !targetVr) {
        setError("Veuillez sélectionner l'équipe de retour (VR).");
        return;
      }
      if (actionNonConforme === "attente_client" && !descriptionPanne.trim()) {
        setError("Veuillez saisir une description pour la nouvelle panne détectée.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: EssaiValidationPayload = {
        vehicle,
        essayeur,
        or: noOr,
        modele: modeleAffiche,
        resultat,
        actionNonConforme: resultat === "NON-CONFORME" ? actionNonConforme : undefined,
        targetVr: resultat === "NON-CONFORME" && actionNonConforme === "transfert_vr" ? targetVr : undefined,
        descriptionPanne:
          resultat === "NON-CONFORME" && actionNonConforme === "attente_client"
            ? descriptionPanne.trim()
            : undefined,
        dateControle: getNowFormatted(),
      };

      await onConfirm(payload);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue lors de l'enregistrement de l'essai."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-essai-title"
      >
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-purple-900 text-white p-5 relative shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-md shadow-inner text-purple-200">
                <Gauge className="w-6 h-6" />
              </div>
              <div>
                <h2 id="modal-essai-title" className="text-base sm:text-lg font-black text-white leading-tight">
                  Validation Essai & Contrôle
                </h2>
                <p className="text-xs text-purple-200/90 mt-0.5 font-medium">
                  Rapport de contrôle qualité et décision d'avancement
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 text-purple-200 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corps du Formulaire */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Fiche récapitulative du véhicule (automatique) */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
              <div className="flex items-center gap-1.5 text-slate-600">
                <Hash className="w-3.5 h-3.5 text-purple-700" />
                <span className="font-semibold">N° OR :</span>
              </div>
              <strong className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {noOr}
              </strong>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
              <div className="flex items-center gap-1.5 text-slate-600">
                <Car className="w-3.5 h-3.5 text-purple-700" />
                <span className="font-semibold">Modèle du véhicule :</span>
              </div>
              <strong className="text-slate-900 font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-right">
                {modeleAffiche}
              </strong>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 pt-0.5">
              <span>Châssis : <strong className="text-slate-700 font-mono">{chassis}</strong></span>
              <span>Client : <strong className="text-slate-700 truncate max-w-[150px] inline-block align-bottom" title={client}>{client}</strong></span>
            </div>
          </div>

          {/* Champ 1 : Nom de l'essayeur */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-purple-700" />
              <span>Nom de l'essayeur <span className="text-rose-500">*</span></span>
            </label>
            <select
              value={essayeur}
              onChange={(e) => setEssayeur(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 outline-none transition-all cursor-pointer shadow-2xs"
            >
              {ESSAYEUR_OPTIONS.map((nom) => (
                <option key={nom} value={nom}>
                  {nom}
                </option>
              ))}
            </select>
          </div>

          {/* Champ 2 : Résultat de l'essai */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-2">
              Résultat de l'essai <span className="text-rose-500">*</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              {/* Option CONFORME */}
              <button
                type="button"
                onClick={() => setResultat("CONFORME")}
                className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between gap-2 ${
                  resultat === "CONFORME"
                    ? "bg-emerald-50/80 border-emerald-500 shadow-sm"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold ${
                      resultat === "CONFORME"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      resultat === "CONFORME"
                        ? "bg-emerald-200/70 text-emerald-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    Prêt
                  </span>
                </div>
                <div>
                  <div className={`text-xs font-black ${resultat === "CONFORME" ? "text-emerald-900" : "text-slate-800"}`}>
                    CONFORME
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                    Essai concluant. Passe en Terminer.
                  </div>
                </div>
              </button>

              {/* Option NON-CONFORME */}
              <button
                type="button"
                onClick={() => setResultat("NON-CONFORME")}
                className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between gap-2 ${
                  resultat === "NON-CONFORME"
                    ? "bg-rose-50/80 border-rose-500 shadow-sm"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold ${
                      resultat === "NON-CONFORME"
                        ? "bg-rose-600 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      resultat === "NON-CONFORME"
                        ? "bg-rose-200/70 text-rose-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    Anomalie
                  </span>
                </div>
                <div>
                  <div className={`text-xs font-black ${resultat === "NON-CONFORME" ? "text-rose-900" : "text-slate-800"}`}>
                    NON-CONFORME
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                    Retour équipe ou accord client requis.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Section conditionnelle CONFORME */}
          {resultat === "CONFORME" && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-start gap-2.5 animate-in fade-in duration-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900">
                <p className="font-bold">L'intervention est déclarée CONFORME</p>
                <p className="text-[11px] text-emerald-800/90 mt-0.5 leading-relaxed">
                  L'avancement sera défini à <strong>Terminer</strong>. Le véhicule quittera la page Essai et passera en <strong>Attente Client</strong> pour restitution.
                </p>
              </div>
            </div>
          )}

          {/* Section conditionnelle NON-CONFORME */}
          {resultat === "NON-CONFORME" && (
            <div className="space-y-4 p-4 rounded-2xl bg-rose-50/60 border border-rose-200 animate-in fade-in duration-200">
              <div className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Action suite à la non-conformité :</span>
              </div>

              {/* Choix d'action : Retour équipe (VR) OU Attente acceptation client */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setActionNonConforme("transfert_vr")}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    actionNonConforme === "transfert_vr"
                      ? "bg-white border-purple-500 shadow-sm ring-2 ring-purple-500/20"
                      : "bg-white/80 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className={`w-4 h-4 ${actionNonConforme === "transfert_vr" ? "text-purple-600" : "text-slate-400"}`} />
                    <span className="text-xs font-bold text-slate-900">Retourner à une équipe</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 pl-6">
                    Transférer (VR) vers l'équipe responsable
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActionNonConforme("attente_client")}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    actionNonConforme === "attente_client"
                      ? "bg-white border-amber-500 shadow-sm ring-2 ring-amber-500/20"
                      : "bg-white/80 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${actionNonConforme === "attente_client" ? "text-amber-600" : "text-slate-400"}`} />
                    <span className="text-xs font-bold text-slate-900">Attente accord client</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 pl-6">
                    En attente de l'acceptation du client
                  </p>
                </button>
              </div>

              {/* Sous-choix A : Sélection de l'équipe VR */}
              {actionNonConforme === "transfert_vr" && (
                <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Sélectionnez l'équipe de destination (Transfert VR) :
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {VR_RETOUR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTargetVr(opt.value)}
                        className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                          targetVr === opt.value
                            ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                            : "bg-white text-slate-700 border-slate-200 hover:border-purple-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-purple-700 font-medium mt-1">
                    L'avancement sera défini à <strong>{targetVr}</strong> et l'équipe choisie recevra le travail dans ses transferts entrants.
                  </p>
                </div>
              )}

              {/* Sous-choix B : Description de la nouvelle panne pour le client */}
              {actionNonConforme === "attente_client" && (
                <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                  <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-amber-600" />
                    <span>Description pour la nouvelle panne <span className="text-rose-500">*</span> :</span>
                  </label>
                  <textarea
                    rows={3}
                    value={descriptionPanne}
                    onChange={(e) => setDescriptionPanne(e.target.value)}
                    placeholder="Décrivez précisément la panne ou l'anomalie constatée lors de l'essai (ex: bruit suspect train avant lors du freinage, devis complémentaire requis avant intervention...)"
                    className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all resize-none shadow-2xs font-normal text-slate-800 placeholder:text-slate-400"
                  />
                  <p className="text-[10px] text-amber-800 font-medium">
                    Le véhicule sera placé en état <strong>Attente client</strong> avec cette description de panne enregistrée.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Boutons d'action du bas */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                resultat === "CONFORME"
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20 active:scale-95"
                  : "bg-purple-600 hover:bg-purple-700 shadow-purple-600/20 active:scale-95"
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {resultat === "CONFORME" ? "Valider : Marquer Terminé" : "Valider le Contrôle Non-Conforme"}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
