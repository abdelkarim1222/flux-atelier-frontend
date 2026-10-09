import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, Pencil, X } from 'lucide-react';
import { updateVehicleInventory, type ManualVehicleInventoryInput, type VehicleInventoryRow } from '../services/api';

interface Props {
  row: VehicleInventoryRow | null;
  onClose: () => void;
  onSuccess: () => void;
}

function makeForm(row: VehicleInventoryRow): ManualVehicleInventoryInput {
  return {
    vin: row.vin || '', brandCode: row.brandCode || '', serialNo: row.serialNo || '',
    modelCode: row.modelCode || '', modelDescription: row.modelDescription || '', registration: row.registration || '',
    stockStatus: row.stockStatus || '', warehouseCode: row.warehouseCode || '', locationCode: row.locationCode || '',
    customerCode: row.customerCode || '', customerName: row.customerName || '',
  };
}

const fields: Array<{ key: keyof ManualVehicleInventoryInput; label: string; required?: boolean }> = [
  { key: 'vin', label: 'VIN / N° châssis', required: true }, { key: 'brandCode', label: 'Code marque', required: true },
  { key: 'serialNo', label: 'N° de série' }, { key: 'modelCode', label: 'Code modèle' },
  { key: 'modelDescription', label: 'Description / modèle' }, { key: 'registration', label: 'Immatriculation' },
  { key: 'stockStatus', label: 'Statut stock' }, { key: 'warehouseCode', label: 'Code magasin' },
  { key: 'locationCode', label: 'Code emplacement' }, { key: 'customerCode', label: 'N° client' },
  { key: 'customerName', label: 'Nom client' },
];

export default function EditVehicleInventoryModal({ row, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<ManualVehicleInventoryInput>({ vin: '', brandCode: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { if (row) { setForm(makeForm(row)); setError(''); setSuccess(''); } }, [row]);
  if (!row) return null;
  const close = () => { if (!saving) onClose(); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await updateVehicleInventory(row.sourceRow, { ...form, vin: form.vin.trim().toUpperCase(), brandCode: form.brandCode.trim().toUpperCase() });
      setSuccess('Véhicule modifié avec succès.'); onSuccess();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de modifier ce véhicule.'); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
    <form onSubmit={submit} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><Pencil size={21} /></div><div><h2 className="text-base font-black text-slate-900">Modifier le véhicule</h2><p className="text-xs text-slate-500">Les données d’origine sont conservées dans la fiche.</p></div></div><button type="button" onClick={close} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button></header>
      <div className="flex-1 overflow-y-auto p-6">{error && <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"><AlertCircle size={16} className="shrink-0" />{error}</div>}{success && <div className="mb-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><CheckCircle2 size={16} className="shrink-0" />{success}</div>}<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className={field.key === 'modelDescription' || field.key === 'customerName' ? 'sm:col-span-2' : ''}><span className="mb-1 block text-[11px] font-bold text-slate-700">{field.label}{field.required ? ' *' : ''}</span><input required={field.required} value={form[field.key] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" /></label>)}</div></div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4"><button type="button" onClick={close} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700">Annuler</button><button type="submit" disabled={saving || Boolean(success)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? <><LoaderCircle size={15} className="animate-spin" /> Enregistrement…</> : <><Pencil size={15} /> Enregistrer les modifications</>}</button></footer>
    </form>
  </div>;
}
