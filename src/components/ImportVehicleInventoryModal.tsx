import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  PlusCircle,
  UploadCloud,
  X,
} from 'lucide-react';
import { importVehicleInventory, type VehicleInventoryImportResult } from '../services/api';

interface ImportVehicleInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: VehicleInventoryImportResult) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export default function ImportVehicleInventoryModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportVehicleInventoryModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VehicleInventoryImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  function handleFileSelected(selectedFile: File) {
    setError('');
    setResult(null);
    const lowerName = selectedFile.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      setError('Veuillez sélectionner un fichier Excel au format .xlsx ou .xls.');
      setFile(null);
      return;
    }
    if (selectedFile.size > 64 * 1024 * 1024) {
      setError('Le fichier dépasse la taille maximale autorisée (64 Mo).');
      setFile(null);
      return;
    }
    setFile(selectedFile);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFileSelected(event.dataTransfer.files[0]);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      handleFileSelected(event.target.files[0]);
    }
  }

  async function handleImport() {
    if (!file) {
      setError('Veuillez d’abord choisir un fichier Excel.');
      return;
    }

    setIsUploading(true);
    setError('');
    setResult(null);

    try {
      const res = await importVehicleInventory(file);
      setResult(res);
      onSuccess(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de l’importation du fichier.');
    } finally {
      setIsUploading(false);
    }
  }

  function resetForm() {
    setFile(null);
    setError('');
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleCloseModal() {
    if (isUploading) return;
    resetForm();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 id="import-modal-title" className="text-base font-black text-slate-900">
                Importer de nouveaux véhicules
              </h3>
              <p className="text-xs text-slate-500">
                Comparaison par VIN avec la base PostgreSQL
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            disabled={isUploading}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Règles d'import / Comparaison */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <Database size={14} className="text-blue-600 shrink-0" />
              Comparaison automatique par VIN :
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-blue-800">
              <li>
                <span className="font-semibold text-emerald-700">VIN non trouvé dans la base</span> : le véhicule est <strong>ajouté</strong> à votre parc.
              </li>
              <li>
                <span className="font-semibold text-amber-700">VIN déjà trouvé dans la base</span> : la ligne est <strong>ignorée</strong> (aucun doublon créé).
              </li>
              <li>
                Les doublons internes au fichier et les lignes sans VIN sont également ignorés.
              </li>
            </ul>
          </div>

          {/* Erreur */}
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800">
              <AlertCircle size={16} className="shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Résultat si disponible */}
          {result ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                <h4 className="text-sm font-black text-slate-900">
                  {result.addedRows > 0
                    ? `${result.addedRows} nouveau(x) véhicule(s) ajouté(s) avec succès !`
                    : 'Comparaison terminée : aucun nouveau véhicule à ajouter.'}
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Lignes lues</div>
                  <div className="mt-1 text-base font-black text-slate-900">{result.inputRows}</div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Ajoutés</div>
                  <div className="mt-1 text-base font-black text-emerald-700">+{result.addedRows}</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Déjà en base</div>
                  <div className="mt-1 text-base font-black text-amber-700">{result.duplicateVinRows}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sans VIN</div>
                  <div className="mt-1 text-base font-black text-slate-600">{result.missingVinRows}</div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs">
                <span className="font-medium text-slate-600">Total actuel dans le parc :</span>
                <span className="font-black text-slate-900">{result.total.toLocaleString('fr-FR')} véhicules</span>
              </div>
            </div>
          ) : (
            /* Zone de dépôt / sélection de fichier */
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={onInputChange}
                className="hidden"
                id="vehicle-inventory-excel-input"
              />

              {!file ? (
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition ${
                    isDragging
                      ? 'border-emerald-500 bg-emerald-50/60'
                      : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-600 shadow-xs">
                    <UploadCloud size={32} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Glissez votre fichier Excel ici, ou{' '}
                      <span className="text-emerald-600 underline">parcourez</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Formats supportés : .xlsx ou .xls (jusqu'à 64 Mo)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  {!isUploading && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-xs font-bold text-slate-500 hover:text-rose-600 transition px-2 py-1"
                    >
                      Changer
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied de page avec actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50/60 px-6 py-3.5 rounded-b-2xl">
          {result ? (
            <>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Importer un autre fichier
              </button>
              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Fermer et voir les véhicules
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isUploading}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={!file || isUploading}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <LoaderCircle size={15} className="animate-spin" />
                    Comparaison & import en cours…
                  </>
                ) : (
                  <>
                    <PlusCircle size={15} />
                    Lancer la comparaison & l'import
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
