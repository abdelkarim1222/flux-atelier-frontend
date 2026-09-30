import { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  X,
  Check,
  Calendar,
  Hash,
  User,
  Car,
  Tag,
  ShieldCheck,
  AlertCircle,
  FileSignature,
  Wrench,
} from "lucide-react";
import type { Flux } from "../data/mockData";
import type { DemandeDevis } from "../services/database";

interface DemandeDevisModalProps {
  isOpen: boolean;
  vehicle: Flux | null;
  currentChefEquipeName?: string;
  onClose: () => void;
  onConfirm: (devis: DemandeDevis) => Promise<void> | void;
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

export default function DemandeDevisModal({
  isOpen,
  vehicle,
  currentChefEquipeName,
  onClose,
  onConfirm,
}: DemandeDevisModalProps) {
  const [numeroDevis, setNumeroDevis] = useState("");
  const [pieces, setPieces] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [dateDevis, setDateDevis] = useState(getNowFormatted);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && vehicle) {
      setNumeroDevis("");
      setPieces("");
      setCommentaire("");
      setDateDevis(getNowFormatted());
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, vehicle]);

  if (!isOpen || !vehicle) return null;

  const noOr = vehicle.no || vehicle.ordre || vehicle.l2n2500 || "-";
  const chassis = vehicle.chassis || "-";
  const client = vehicle.client || "-";
  const modele = vehicle.modele || vehicle.modelePowerBI || "-";
  const immat = vehicle.immatriculation || vehicle.serie || "-";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNum = numeroDevis.trim();
    if (!cleanNum) {
      setError("Veuillez renseigner le N° DV (Numéro de Devis).");
      return;
    }

    setIsSubmitting(true);
    try {
      const devis: DemandeDevis = {
        id: `dv-${Date.now()}-${vehicle.id}`,
        vehicleId: vehicle.id,
        numeroDevis: cleanNum,
        or: noOr,
        chassis: chassis,
        client: client,
        modele: modele,
        immatriculation: immat,
        date: dateDevis || getNowFormatted(),
        pieces: pieces.trim() || undefined,
        equipe: vehicle.equipe || undefined,
        equipeOrigine: vehicle.equipe || undefined,
        technicien: vehicle.technicien && vehicle.technicien !== "-" ? vehicle.technicien : undefined,
        nomTechnicien: vehicle.nomTechnicien && vehicle.nomTechnicien !== "-" ? vehicle.nomTechnicien : undefined,
        demandeur: currentChefEquipeName || undefined,
        statutDevis: "En attente accord",
        commentaire: commentaire.trim() || undefined,
        createdAtTimestamp: Date.now(),
      };

      await onConfirm(devis);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'enregistrement du devis."
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
      aria-labelledby="modal-demande-devis-title"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
              <FileSignature size={20} />
            </div>
            <div>
              <h3
                id="modal-demande-devis-title"
                className="text-base font-bold text-slate-900 leading-tight"
              >
                Fiche Attente Devis (N° DV)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Renseignez le numéro de devis pour basculer le véhicule vers la <strong>Page Devis</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Bloc d'informations automatiques du véhicule */}
          <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
              <span>Informations Véhicule Récupérées Automatiquement</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-extrabold border border-orange-200">
                ATENDE DEVIS
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                  <Hash size={11} className="text-orange-500" /> N° OR
                </div>
                <div className="font-mono font-bold text-slate-800 mt-0.5 truncate">
                  {noOr}
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                  <Tag size={11} className="text-orange-500" /> Immatriculation
                </div>
                <div className="font-bold text-slate-800 mt-0.5 truncate">
                  {immat}
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                  <Car size={11} className="text-orange-500" /> Modèle
                </div>
                <div className="font-bold text-slate-800 mt-0.5 truncate">
                  {modele}
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                  <ShieldCheck size={11} className="text-orange-500" /> N° Châssis
                </div>
                <div className="font-mono text-[11px] font-semibold text-slate-700 mt-0.5 truncate" title={chassis}>
                  {chassis}
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs sm:col-span-2">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                  <User size={11} className="text-orange-500" /> Nom Client
                </div>
                <div className="font-semibold text-slate-800 mt-0.5 truncate" title={client}>
                  {client}
                </div>
              </div>
            </div>
          </div>

          {/* Saisie obligatoire : N° DV */}
          <div>
            <label
              htmlFor="numero-devis-input"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              N° DV (Numéro de Devis) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="numero-devis-input"
                type="text"
                autoFocus
                value={numeroDevis}
                onChange={(e) => setNumeroDevis(e.target.value)}
                placeholder="Ex : DV-2026-0045, DEV-8912..."
                required
                className="w-full px-3.5 py-2.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-xl shadow-2xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-sans placeholder:font-normal"
              />
              <FileText size={18} className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Ce numéro permettra de suivre le devis et l'accord client dans la <strong>Page Devis</strong>.
            </p>
          </div>

          {/* Pièces à remplacer dès réception de la demande (Piess) */}
          <div>
            <label
              htmlFor="pieces-devis-input"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              Pièces à remplacer (Pièces / Piess) <span className="text-amber-600 font-semibold text-[11px]">(Identifiées dès réception)</span>
            </label>
            <div className="relative">
              <input
                id="pieces-devis-input"
                type="text"
                value={pieces}
                onChange={(e) => setPieces(e.target.value)}
                placeholder="Ex : Plaquettes AV + Disques, Kit distribution, Pompe à eau..."
                className="w-full px-3.5 py-2.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl shadow-2xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
              />
              <Wrench size={16} className="absolute right-3 top-2.5 text-amber-500 pointer-events-none" />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Ces pièces seront directement visibles par la <strong>Réception</strong> pour détailler le devis au client.
            </p>
          </div>

          {/* Commentaire optionnel */}
          <div>
            <label
              htmlFor="commentaire-devis-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Commentaire / Détails du devis <span className="text-slate-400 font-normal">(optionnel)</span>
            </label>
            <textarea
              id="commentaire-devis-input"
              rows={2}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Ex : Devis complémentaire boîte de vitesses, en attente accord de la direction du client..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl shadow-2xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all resize-none placeholder:text-slate-400"
            />
          </div>

          {/* Metadata date et demandeur */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span className="flex items-center gap-1 font-medium">
              <Calendar size={12} className="text-slate-400" /> {dateDevis}
            </span>
            {currentChefEquipeName && (
              <span className="font-medium text-slate-600">
                Demandeur : <strong className="text-slate-800">{currentChefEquipeName}</strong>
              </span>
            )}
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Message explicatif de redirection */}
          <div className="p-3 bg-orange-50/80 border border-orange-200/80 rounded-xl text-orange-900 text-[11px] flex items-center gap-2">
            <Check size={14} className="text-orange-600 shrink-0" />
            <span>
              À la validation, l'avancement sera défini sur <strong>ATENDE DEVIS</strong> et l'emplacement passera automatiquement en <strong>P (Parking)</strong>.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-95 rounded-xl shadow-md shadow-orange-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Valider et Transférer vers Page Devis</span>
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
