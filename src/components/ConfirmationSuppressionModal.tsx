import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  supprimerDossierEntree,
  isDatabaseWriteConfigured,
} from "../services/database";
import type { UnifiedReceptionRow } from "./SuiviEntreesTable";

interface ConfirmationSuppressionModalProps {
  isOpen: boolean;
  row: UnifiedReceptionRow | null;
  onClose: () => void;
  onSuccess: (deletedNoOr?: string) => void;
}

export default function ConfirmationSuppressionModal({
  isOpen,
  row,
  onClose,
  onSuccess,
}: ConfirmationSuppressionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setError("");
      setLoading(false);
    }
  }, [isOpen, row]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen || !row) return null;

  const handleConfirmDelete = async () => {
    if (!isDatabaseWriteConfigured()) {
      setError(
        "Le serveur PostgreSQL n'est pas disponible. Vérifiez sa configuration puis réessayez."
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      await supprimerDossierEntree({
        id: row.id,
        recordKey: String(row.id || ""),
        noOr: row.noOr,
        cs: row.cs,
        chassis: row.chassis,
        immatriculation: row.immatriculation,
        rowSuivi: row.suiviRowNumber,
        rowNumber: row.chargementRowNumber,
      });

      onSuccess(row.noOr);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de la suppression du dossier dans PostgreSQL."
      );
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-supprimer-entree-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-red-200 overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-100 bg-gradient-to-r from-red-600 to-rose-700 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-red-100 shadow-xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="modal-supprimer-entree-title"
                className="text-base font-bold text-white flex items-center gap-2"
              >
                Confirmer la suppression
              </h3>
              <p className="text-xs text-red-100/80">
                Action irréversible sur PostgreSQL
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
            title="Fermer (Échap)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs font-medium animate-in fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          <div className="flex items-start gap-3 p-3.5 bg-red-50/70 rounded-xl border border-red-200/80 text-red-900 text-xs leading-relaxed">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              Êtes-vous sûr de vouloir supprimer définitivement ce dossier ? Cette
              ligne sera supprimée du <b>Suivi des entrées</b> et des
              <b> Tableaux de chargement</b>.
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">N° OR :</span>
              <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {row.noOr}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">CS :</span>
              <span className="font-bold text-blue-800">{row.cs}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">N° Châssis :</span>
              <span className="font-mono text-slate-800">{row.chassis}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium">Client :</span>
              <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                {row.nomClient || "-"}
              </span>
            </div>
            {row.dateEntreeHeure && (
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 font-medium">Date Entrée :</span>
                <span className="text-slate-700">{row.dateEntreeHeure}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md shadow-red-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Suppression...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Supprimer définitivement</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
