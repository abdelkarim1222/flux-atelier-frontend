import { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  ShoppingCart,
  X,
  Check,
  Calendar,
  Hash,
  User,
  ShieldCheck,
  Package,
  FileText,
  AlertCircle,
  Tag,
  Boxes,
} from "lucide-react";
import type { Flux } from "../data/mockData";
import type { DemandeAchat } from "../services/googleSheets";

interface DemandeAchatModalProps {
  isOpen: boolean;
  vehicle: Flux | null;
  currentChefEquipeName?: string;
  onClose: () => void;
  onConfirm: (demande: DemandeAchat) => Promise<void> | void;
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

export default function DemandeAchatModal({
  isOpen,
  vehicle,
  currentChefEquipeName,
  onClose,
  onConfirm,
}: DemandeAchatModalProps) {
  const [ref, setRef] = useState("");
  const [designation, setDesignation] = useState("");
  const [qt, setQt] = useState<number>(1);
  const [commentaire, setCommentaire] = useState("");
  const [dateDemand, setDateDemand] = useState(getNowFormatted);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialisation à l'ouverture
  useEffect(() => {
    if (isOpen && vehicle) {
      setRef("");
      setDesignation("");
      setQt(1);
      setCommentaire("");
      setDateDemand(getNowFormatted());
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, vehicle]);

  if (!isOpen || !vehicle) return null;

  const noOr = vehicle.no || vehicle.l2n2500 || "-";
  const chassis = vehicle.chassis || "-";
  const client = vehicle.client || "-";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanRef = ref.trim();
    const cleanDesignation = designation.trim();

    if (!cleanRef) {
      setError("Veuillez renseigner la Référence de la pièce (REF).");
      return;
    }

    if (!cleanDesignation) {
      setError("Veuillez renseigner la Désignation de la pièce.");
      return;
    }

    if (!qt || qt < 1) {
      setError("La quantité doit être supérieure ou égale à 1.");
      return;
    }

    setIsSubmitting(true);
    try {
      const demande: DemandeAchat = {
        id: `ach-${Date.now()}-${vehicle.id}`,
        vehicleId: vehicle.id,
        or: noOr,
        chassis: chassis,
        client: client,
        date: dateDemand || getNowFormatted(),
        ref: cleanRef,
        designation: cleanDesignation,
        qt: Number(qt),
        commentaire: commentaire.trim(),
        equipe: vehicle.equipe || undefined,
        demandeur: currentChefEquipeName || undefined,
      };

      await onConfirm(demande);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'enregistrement de la demande d'achat."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-demande-achat-title"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2
                id="modal-demande-achat-title"
                className="text-base font-extrabold text-slate-900 leading-tight"
              >
                Demande d'Achat & Approvisionnement
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Véhicule en attente d'achat • Pièces requises
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            title="Fermer sans enregistrer"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1 : Informations véhicule automatiques (Lecture seule) */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-600" />
                Données Véhicule Détectées (Automatiques)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Attends Acheter
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {/* OR */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <Hash size={11} /> N° OR
                </div>
                <div className="text-xs font-black text-slate-800 truncate mt-0.5">
                  {noOr}
                </div>
              </div>

              {/* Châssis */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <Tag size={11} /> Châssis
                </div>
                <div className="text-xs font-black text-slate-800 font-mono truncate mt-0.5" title={chassis}>
                  {chassis}
                </div>
              </div>

              {/* Client */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <User size={11} /> Client
                </div>
                <div className="text-xs font-black text-slate-800 truncate mt-0.5" title={client}>
                  {client}
                </div>
              </div>

              {/* Date */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <Calendar size={11} /> Date & Heure
                </div>
                <div className="text-xs font-black text-amber-700 font-mono truncate mt-0.5">
                  {dateDemand}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 : Détails de la Pièce / Achat */}
          <div className="space-y-3.5 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                Spécifications de la pièce demandée
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* REF */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  REF (Référence Pièce / Article) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                    placeholder="Ex: 5801234567, FILTRE-01, BRK-PAD..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all uppercase placeholder:normal-case font-mono"
                    autoFocus
                  />
                  <Tag size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* QT */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  QT (Quantité) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={999}
                    required
                    value={qt}
                    onChange={(e) => setQt(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all font-mono"
                  />
                  <Boxes size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Désignation */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Désignation de la pièce <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="Ex: Filtre à carburant, Plaquettes de frein avant, Injecteur..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                />
                <Package size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Commentaire */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Commentaire / Remarques atelier
              </label>
              <div className="relative">
                <textarea
                  rows={3}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Précisions utiles pour l'achat : référence fournisseur, urgence client, indisponible au magasin..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-normal rounded-xl border border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all resize-none"
                />
                <FileText size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Notice */}
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] leading-relaxed flex items-start gap-2">
            <ShoppingCart size={15} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Action automatique :</strong> En validant, le véhicule passe à l'état{" "}
              <span className="font-bold underline">attends acheter</span> et sera automatiquement basculé dans la{" "}
              <span className="font-bold underline">Page Acheter</span> avec cette demande détaillée.
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 rounded-xl shadow-md shadow-amber-600/20 active:scale-98 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <span>Enregistrement...</span>
              ) : (
                <>
                  <Check size={14} />
                  <span>Valider & Transférer à Page Acheter</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
