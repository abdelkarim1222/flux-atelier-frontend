import { useState, type FormEvent } from 'react';
import { AlertCircle, Car, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { addVehicleInventory, type ManualVehicleInventoryInput } from '../services/api';

interface AddVehicleInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const initialForm: ManualVehicleInventoryInput = {
  vin: '', brandCode: '', serialNo: '', modelCode: '', modelDescription: '', registration: '',
  stockStatus: '', warehouseCode: '', locationCode: '', customerCode: '', customerName: '',
};

export default function AddVehicleInventoryModal({ isOpen, onClose, onSuccess }: AddVehicleInventoryModalProps) {
  const [form, setForm] = useState<ManualVehicleInventoryInput>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const update = (key: keyof ManualVehicleInventoryInput, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const close = () => {
    if (saving) return;
    setForm(initialForm);
    setError('');
    setSuccess('');
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.vin.trim() || !form.brandCode.trim()) {
      setError('Le VIN et le code marque sont obligatoires.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addVehicleInventory({
        ...form,
        vin: form.vin.trim().toUpperCase(),
        brandCode: form.brandCode.trim().toUpperCase(),
      });
      setSuccess(`Véhicule ${form.vin.trim().toUpperCase()} ajouté au Parc.`);
      onSuccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible d’ajouter ce véhicule.');
    } finally {
      setSaving(false);
    }
  };

  const fields: Array<{ key: keyof ManualVehicleInventoryInput; label: string; required?: boolean; placeholder?: string }> = [
    { key: 'vin', label: 'VIN / N° châssis', required: true, placeholder: 'Ex. ZCFC...' },
    { key: 'brandCode', label: 'Code marque', required: true, placeholder: 'IVECO, CHANGAN, JMC ou autre' },
    { key: 'serialNo', label: 'N° de série', placeholder: 'Optionnel' },
    { key: 'modelCode', label: 'Code modèle', placeholder: 'Ex. DAILY' },
    { key: 'modelDescription', label: 'Description / modèle', placeholder: 'Ex. Daily 35C15' },
    { key: 'registration', label: 'Immatriculation', placeholder: 'Ex. 12345-A-6' },
    { key: 'stockStatus', label: 'Statut stock', placeholder: 'Ex. Disponible' },
    { key: 'warehouseCode', label: 'Code magasin', placeholder: 'Ex. SR MEGRINE' },
    { key: 'locationCode', label: 'Code emplacement', placeholder: 'Ex. P12' },
    { key: 'customerCode', label: 'N° client', placeholder: 'Optionnel' },
    { key: 'customerName', label: 'Nom client', placeholder: 'Optionnel' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><Car size={21} /></div>
            <div>
              <h2 className="text-base font-black text-slate-900">Ajouter un véhicule manuellement</h2>
              <p className="text-xs text-slate-500">Tous les codes marques sont acceptés.</p>
            </div>
          </div>
          <button type="button" onClick={close} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs text-blue-900">
            Le véhicule est contrôlé par VIN pour éviter les doublons. Les véhicules ajoutés manuellement restent visibles, même avec une marque différente.
          </div>
          {error && <div className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"><AlertCircle size={16} className="shrink-0" />{error}</div>}
          {success && <div className="mb-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><CheckCircle2 size={16} className="shrink-0" />{success}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className={field.key === 'modelDescription' || field.key === 'customerName' ? 'sm:col-span-2' : ''}>
                <span className="mb-1 block text-[11px] font-bold text-slate-700">{field.label}{field.required ? ' *' : ''}</span>
                <input
                  required={field.required}
                  value={form[field.key] || ''}
                  onChange={(event) => update(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            ))}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={close} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700">Annuler</button>
          <button type="submit" disabled={saving || Boolean(success)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            {saving ? <><LoaderCircle size={15} className="animate-spin" /> Enregistrement…</> : <><Car size={15} /> Ajouter le véhicule</>}
          </button>
        </footer>
      </form>
    </div>
  );
}
