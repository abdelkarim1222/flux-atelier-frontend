import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  FileSpreadsheet,
  Check,
  ExternalLink,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  getSheetWriteUrl,
  setSheetWriteUrl,
  isGoogleSheetWriteConfigured,
  VEHICLE_SHEET_URL,
} from "../services/googleSheets";

interface GoogleSheetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigured?: () => void;
}

export default function GoogleSheetConfigModal({
  isOpen,
  onClose,
  onConfigured,
}: GoogleSheetConfigModalProps) {
  const [urlInput, setUrlInput] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(getSheetWriteUrl());
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfigured = isGoogleSheetWriteConfigured();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = urlInput.trim();
    setSheetWriteUrl(cleanUrl);
    setSavedSuccess(true);
    if (onConfigured) {
      onConfigured();
    }
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleClear = () => {
    setSheetWriteUrl("");
    setUrlInput("");
    setSavedSuccess(false);
    if (onConfigured) {
      onConfigured();
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Synchronisation Automatique Google Sheets
                {isConfigured && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-medium">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Active
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-300">
                Pour que chaque clic (Livrer, Emplacement, Nouvelle Entrée) écrive directement dans votre feuille.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {/* Status Alert */}
          {isConfigured ? (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-900">
                  Connexion Google Sheets Active !
                </p>
                <p className="text-emerald-700 mt-0.5">
                  Toutes les modifications effectuées dans l'application sont enregistrées automatiquement en temps réel dans votre feuille Google Sheets.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">
                  Écriture Google Sheets non connectée
                </p>
                <p className="text-amber-700 mt-0.5">
                  L'application lit les données en temps réel, mais pour écrire (changer l'état à <strong>Livré</strong>, modifier l'emplacement ou ajouter une entrée), une URL Google Apps Script Web App est requise.
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-3">
            <label className="block font-bold text-slate-800 text-xs">
              URL de l'application Web Google Apps Script :
            </label>
            <div className="relative">
              <input
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              {isConfigured ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold cursor-pointer underline"
                >
                  Déconnecter / Supprimer l'URL
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">
                  L'URL se termine toujours par <code>/exec</code>
                </span>
              )}

              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    Enregistré avec succès !
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Enregistrer et Activer
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Guide Steps */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h3 className="font-bold text-slate-900 text-xs mb-3 flex items-center gap-1.5">
              <span>Comment obtenir cette URL en 3 étapes simples :</span>
            </h3>

            <div className="space-y-2.5">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">
                    Ouvrir l'éditeur de script sur Google Sheets
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Allez sur votre feuille Google Sheets, puis dans le menu cliquez sur :{" "}
                    <strong>Extensions</strong> ➔ <strong>Apps Script</strong>.
                  </p>
                  <a
                    href={VEHICLE_SHEET_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-emerald-700 hover:text-emerald-800 font-semibold underline"
                  >
                    Ouvrir votre Google Sheet
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">
                    Déployer en tant qu'Application Web
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Dans Apps Script, collez le script <code>Code.gs</code> préparé dans votre projet. Cliquez ensuite sur le bouton bleu{" "}
                    <strong>Déployer</strong> ➔ <strong>Nouveau déploiement</strong>.
                  </p>
                  <div className="mt-1.5 text-[11px] bg-white p-2 rounded-lg border border-slate-200 space-y-1">
                    <p>• Type : <strong>Application Web</strong> (icône engrenage ⚙️)</p>
                    <p>• Exécuter en tant que : <strong>Moi</strong> (votre compte Google)</p>
                    <p>• Qui a accès : <strong>Tout le monde (Anyone)</strong></p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">
                    Copier l'URL et la coller ci-dessus
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Google affiche une fenêtre avec l'<strong>URL de l'application Web</strong> (qui se termine par <code>/exec</code>). Copiez-la et collez-la dans le champ ci-dessus !
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
