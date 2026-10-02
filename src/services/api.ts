export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String(payload.error)
      : `Erreur API (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export function listCollection<T>(collection: string): Promise<T[]> {
  return apiRequest<T[]>(`/api/data/${encodeURIComponent(collection)}`);
}

export function saveCollectionRecord<T>(collection: string, record: T): Promise<{ ok: boolean; count?: number }> {
  return apiRequest(`/api/data/${encodeURIComponent(collection)}`, {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

export function updateCollectionRecord(
  collection: string,
  key: string | number,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return apiRequest(`/api/data/${encodeURIComponent(collection)}/${encodeURIComponent(String(key))}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deleteCollectionRecord(collection: string, key: string | number): Promise<{ ok: boolean; deleted?: number }> {
  return apiRequest(`/api/data/${encodeURIComponent(collection)}/${encodeURIComponent(String(key))}`, {
    method: 'DELETE',
  });
}

export interface VehicleInventoryRow {
  sourceRow: number;
  serialNo: string;
  vin: string | null;
  brandCode: string | null;
  modelCode: string | null;
  modelDescription: string | null;
  registration: string | null;
  stockStatus: string | null;
  warehouseCode: string | null;
  locationCode: string | null;
  customerCode: string | null;
  customerName: string | null;
  data: Record<string, unknown>;
}

export interface VehicleInventoryPage {
  rows: VehicleInventoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ManualVehicleInventoryInput {
  vin: string;
  brandCode: string;
  serialNo?: string;
  modelCode?: string;
  modelDescription?: string;
  registration?: string;
  stockStatus?: string;
  warehouseCode?: string;
  locationCode?: string;
  customerCode?: string;
  customerName?: string;
}

export function listVehicleInventory(params: { page: number; pageSize: number; search: string }): Promise<VehicleInventoryPage> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    search: params.search,
  });
  return apiRequest<VehicleInventoryPage>(`/api/inventory/vehicles?${query.toString()}`);
}

export function addVehicleInventory(input: ManualVehicleInventoryInput): Promise<{ ok: boolean; row: VehicleInventoryRow }> {
  return apiRequest<{ ok: boolean; row: VehicleInventoryRow }>('/api/inventory/vehicles/manual', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface VehicleInventoryImportResult {
  ok: boolean;
  fileName: string;
  inputRows: number;
  addedRows: number;
  duplicateVinRows: number;
  missingVinRows: number;
  total: number;
  error?: string;
}

export async function importVehicleInventory(file: File): Promise<VehicleInventoryImportResult> {
  const buffer = await file.arrayBuffer();
  return apiRequest<VehicleInventoryImportResult>('/api/inventory/vehicles/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: buffer,
  });
}

function recordKey(record: Record<string, unknown>): string {
  return String(record.id ?? record.vehicleId ?? record.or ?? record.noOr ?? record.chassis ?? '');
}

export async function hydrateSqlLocalCache(currentRole?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const role = currentRole || localStorage.getItem('flux_atelier_active_role') || '';
  const canEssai = !role || ['administration', 'chef_atelier', 'chef_equipe'].includes(role);
  const canViewVehicleTimes = !role || ['administration', 'chef_atelier', 'chef_equipe', 'garantie'].includes(role);

  for (const storageKey of [
    'flux_atelier_demandes_achat', 'flux_atelier_demandes_devis', 'flux_atelier_essais_controle',
    'flux_atelier_reaffectations', 'flux_atelier_vehicle_time_logs', 'flux_atelier_devis_accord_notifications',
    'flux_atelier_transfers_timeline', 'flux_atelier_essais_timeline', 'flux_atelier_equipes_custom',
    'flux_atelier_moyennes_cache', 'flux_pending_new_chargement_entries',
  ]) localStorage.removeItem(storageKey);

  const keyedCollections: Array<[string, string, (record: Record<string, unknown>) => string]> = [
    ['purchases', 'flux_atelier_demandes_achat', recordKey],
    ['quotes', 'flux_atelier_demandes_devis', recordKey],
    ...(canEssai ? [['essai_controls', 'flux_atelier_essais_controle', recordKey] as [string, string, (record: Record<string, unknown>) => string]] : []),
    ['reassignments', 'flux_atelier_reaffectations', recordKey],
    ...(canViewVehicleTimes ? [['vehicle_times', 'flux_atelier_vehicle_time_logs', (record) => String(record.vehicleKey ?? recordKey(record))] as [string, string, (record: Record<string, unknown>) => string]] : []),
  ];
  await Promise.all(keyedCollections.map(async ([collection, storageKey, keyOf]) => {
    try {
      const rows = await listCollection<Record<string, unknown>>(collection);
      if (!rows.length) {
        localStorage.removeItem(storageKey);
        return;
      }
      const map = Object.fromEntries(rows.map((row) => [keyOf(row), row]).filter(([key]) => Boolean(key)));
      localStorage.setItem(storageKey, JSON.stringify(map));
    } catch {}
  }));

  const arrayCollections: Array<[string, string]> = [
    ['devis_notifications', 'flux_atelier_devis_accord_notifications'],
    ['entree_notifications', 'flux_atelier_nouvelle_entree_notifications'],
    ['facturation_notifications', 'flux_atelier_facturation_notifications'],
    ['transfers', 'flux_atelier_transfers_timeline'],
    ['essais', 'flux_atelier_essais_timeline'],
  ];
  await Promise.all(arrayCollections.map(async ([collection, storageKey]) => {
    try {
      const rows = await listCollection(collection);
      if (rows.length) localStorage.setItem(storageKey, JSON.stringify(rows));
      else localStorage.removeItem(storageKey);
    } catch {}
  }));

  try {
    const members = await listCollection('teams');
    if (members.length) localStorage.setItem('flux_atelier_equipes_custom', JSON.stringify(members));
    else localStorage.removeItem('flux_atelier_equipes_custom');
  } catch {}
  try {
    const averages = await listCollection('averages');
    if (averages[0]) localStorage.setItem('flux_atelier_moyennes_cache', JSON.stringify(averages[0]));
    else localStorage.removeItem('flux_atelier_moyennes_cache');
  } catch {}

  for (const eventName of [
    'demandes_achat_updated', 'demandes_devis_updated', 'essais_controle_updated',
    'devis_accord_updated', 'nouvelle_entree_notification_updated', 'facturation_notifications_updated',
    'reaffectations_updated', 'vehicle_transfers_updated',
    'vehicle_essais_updated', 'vehicle_time_tracking_updated', 'equipes_custom_updated',
  ]) window.dispatchEvent(new Event(eventName));
}
