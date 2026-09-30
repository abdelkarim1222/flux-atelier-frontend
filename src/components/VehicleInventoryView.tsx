import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { listVehicleInventory, type VehicleInventoryRow } from '../services/api';
import ImportVehicleInventoryModal from './ImportVehicleInventoryModal';
import AddVehicleInventoryModal from './AddVehicleInventoryModal';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 50;
const ALLOWED_BRAND_CODES = new Set(['CHANGAN', 'IVECO', 'JMC']);

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function InventoryCell({ value, mono = false }: { value: unknown; mono?: boolean }) {
  return <span className={`block max-w-[250px] truncate ${mono ? 'font-mono text-[11px]' : ''}`} title={displayValue(value)}>{displayValue(value)}</span>;
}

function isAllowedBrand(row: VehicleInventoryRow): boolean {
  return ALLOWED_BRAND_CODES.has(String(row.brandCode || '').trim().toUpperCase()) || row.data?.source === 'manual';
}

export default function VehicleInventoryView() {
  const { currentUser } = useAuth();
  const canImport = currentUser?.role === 'administration' || currentUser?.role === 'chef_atelier';
  const [rows, setRows] = useState<VehicleInventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listVehicleInventory({ page, pageSize: PAGE_SIZE, search })
      .then((result) => {
        if (!active) return;
        setRows(result.rows);
        setTotal(result.total);
        setExpandedRow(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Impossible de charger l’inventaire.');
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, search, refreshKey]);

  // Garde-fou côté client : aucune autre marque ne peut être rendue, même si
  // le serveur n'a pas encore été redémarré avec son filtre SQL.
  const visibleRows = rows.filter(isAllowedBrand);
  const serverReturnedOutOfScopeRows = rows.some((row) => !isAllowedBrand(row));
  const visibleTotal = serverReturnedOutOfScopeRows ? visibleRows.length : total;
  const pageCount = Math.max(1, Math.ceil(visibleTotal / PAGE_SIZE));
  const firstResult = visibleTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, visibleTotal);

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-slate-50/75 p-4 sm:p-6" aria-label="Parc des véhicules et engins">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-800"><Database size={22} /></div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">Inventaire PostgreSQL</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">Parc véhicules & engins</h2>
            <p className="mt-1 text-xs text-slate-500">Marques visibles : CHANGAN, IVECO et JMC. Les autres marques sont exclues de cette vue.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canImport && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-cyan-800 active:scale-95"
            >
              <Plus size={15} /> Ajouter un véhicule
            </button>
          )}
          {canImport && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95"
            >
              <FileSpreadsheet size={15} /> Importer Excel
            </button>
          )}
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
            {visibleTotal.toLocaleString('fr-FR')} véhicule{visibleTotal > 1 ? 's' : ''}{search ? ' trouvé(s)' : ' affiché(s)'}
          </span>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="relative w-full sm:max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Rechercher VIN, série, immatriculation, client…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-100"
            />
          </div>
          <p className="text-[11px] text-slate-500">Filtre actif : CHANGAN, IVECO et JMC • Cliquez pour les détails.</p>
        </div>

        {error && (
          <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[1450px] w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-10 border-b border-slate-200 px-3 py-3" aria-label="Détails" />
                {['N° de série', 'VIN', 'Code marque', 'Code modèle', 'Description', 'Immatriculation', 'Stocks', 'Magasin', 'Emplacement', 'N° client', 'Nom du client'].map((label) => (
                  <th key={label} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-extrabold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-16 text-center text-slate-500"><LoaderCircle className="mx-auto mb-2 animate-spin" size={22} />Chargement des véhicules…</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-16 text-center text-slate-500">{error ? 'La liste ne peut pas être chargée.' : 'Aucun véhicule ne correspond à la recherche.'}</td></tr>
              ) : visibleRows.map((row) => (
                <InventoryTableRows
                  key={row.sourceRow}
                  row={row}
                  expanded={expandedRow === row.sourceRow}
                  onToggle={() => setExpandedRow((current) => current === row.sourceRow ? null : row.sourceRow)}
                />
              ))}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-xs font-medium text-slate-500">{firstResult.toLocaleString('fr-FR')}–{lastResult.toLocaleString('fr-FR')} sur {total.toLocaleString('fr-FR')}</p>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">
              <ChevronLeft size={14} /> Précédent
            </button>
            <span className="px-2 text-xs font-bold text-slate-600">Page {page.toLocaleString('fr-FR')} / {pageCount.toLocaleString('fr-FR')}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount || loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">
              Suivant <ChevronRight size={14} />
            </button>
          </div>
        </footer>
      </section>

      <ImportVehicleInventoryModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          setRefreshKey((value) => value + 1);
          setPage(1);
        }}
      />
      <AddVehicleInventoryModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          setRefreshKey((value) => value + 1);
          setPage(1);
        }}
      />
    </main>
  );
}

function InventoryTableRows({ row, expanded, onToggle }: { row: VehicleInventoryRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer text-slate-700 transition hover:bg-cyan-50/60" onClick={onToggle} aria-expanded={expanded}>
        <td className="border-b border-slate-100 px-3 py-3 text-cyan-800"><ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} /></td>
        <td className="border-b border-slate-100 px-3 py-3 font-bold text-slate-900"><InventoryCell value={row.serialNo} mono /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.vin} mono /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.brandCode} /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.modelCode} /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.modelDescription} /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.registration} mono /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.stockStatus} /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.warehouseCode} /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.locationCode} /></td>
        <td className="border-b border-slate-100 px-3 py-3"><InventoryCell value={row.customerCode} mono /></td>
        <td className="border-b border-slate-100 px-3 py-3 font-medium"><InventoryCell value={row.customerName} /></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} className="border-b border-cyan-100 bg-cyan-50/40 px-5 py-4">
            <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Object.entries(row.data).map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg border border-slate-200/80 bg-white px-3 py-2">
                  <dt className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label.trim() || 'Champ sans nom'}</dt>
                  <dd className="break-words text-xs font-medium text-slate-800">{displayValue(value)}</dd>
                </div>
              ))}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
