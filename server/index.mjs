import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import XLSX from 'xlsx';

const { Pool } = pg;
const PORT = Number(process.env.API_PORT || 3001);
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : randomBytes(32).toString('hex'));
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const COOKIE_NAME = 'flux_atelier_session';
const ROLE_VALUES = new Set(['administration', 'chef_atelier', 'reception', 'chef_equipe']);
const VEHICLE_COLLECTIONS = new Set(['flux', 'reception', 'vin']);
const RECORD_COLLECTIONS = new Set([
  'teams', 'averages', 'purchases', 'quotes', 'essai_controls',
  'vehicle_times', 'transfers', 'reassignments', 'essais', 'devis_notifications',
  'entree_notifications',
]);

if (!DATABASE_URL) {
  console.error('DATABASE_URL est requis. Copiez .env.example vers .env et configurez PostgreSQL.');
  process.exit(1);
}
if (!SESSION_SECRET) {
  console.error('SESSION_SECRET est requis en production.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function passwordMatches(password, stored) {
  const [scheme, salt, expectedHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function signSession(accountId, expiresAt) {
  const value = `${accountId}.${expiresAt}`;
  const signature = createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
  return `${value}.${signature}`;
}

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const pair = cookies.map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

function verifySession(req) {
  const token = readCookie(req, COOKIE_NAME);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [accountId, expiresAtRaw, suppliedSignature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!accountId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const expected = createHmac('sha256', SESSION_SECRET)
    .update(`${accountId}.${expiresAtRaw}`)
    .digest();
  let supplied;
  try { supplied = Buffer.from(suppliedSignature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return accountId;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw new Error('La requête dépasse la limite de 5 Mo.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function readBinary(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Le classeur dépasse la limite de 32 Mo.');
      error.httpStatus = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function importVehicleWorkbook(req, res) {
  const account = await requireAccount(req, res);
  if (!account) return;
  if (!['administration', 'chef_atelier'].includes(account.role)) {
    return send(res, 403, { ok: false, error: 'L’import de l’inventaire est réservé à l’administration et à la direction atelier.' });
  }

  let fileName = 'vehicules.xlsx';
  try {
    fileName = decodeURIComponent(String(req.headers['x-file-name'] || fileName));
  } catch {
    return send(res, 400, { ok: false, error: 'Le nom du fichier est invalide.' });
  }
  fileName = path.basename(fileName).slice(0, 180);
  const lowerName = fileName.toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
    return send(res, 400, { ok: false, error: 'Sélectionnez un classeur Excel au format .xlsx ou .xls.' });
  }

  const workbookBuffer = await readBinary(req, 64 * 1024 * 1024);
  if (workbookBuffer.length < 4) {
    return send(res, 400, { ok: false, error: 'Le fichier envoyé est vide ou corrompu.' });
  }

  let workbook;
  try {
    workbook = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: true });
  } catch {
    return send(res, 400, { ok: false, error: 'Le fichier sélectionné n’est pas un classeur Excel valide.' });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return send(res, 400, { ok: false, error: 'Le classeur Excel ne contient aucune feuille de calcul.' });
  }
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: null });
  if (!rows || rows.length === 0) {
    return send(res, 400, { ok: false, error: 'La feuille Excel est vide.' });
  }

  const rawHeaders = rows[0] || [];
  const usedHeaders = {};
  const headers = [];
  for (let i = 0; i < rawHeaders.length; i++) {
    let label = String(rawHeaders[i] || '').trim();
    if (!label) label = `Colonne ${i + 1}`;
    usedHeaders[label] = (usedHeaders[label] || 0) + 1;
    if (usedHeaders[label] > 1) {
      label = `${label} (${usedHeaders[label]})`;
    }
    headers.push(label);
  }

  function normalizeHeader(h) {
    return String(h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[°º_.-]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }
  const normalizedHeaders = headers.map(normalizeHeader);

  const fieldAliases = {
    serialNo: ['n de serie', 'numero de serie', 'no de serie', 'n serie', 'numero serie', 'serie', 'chassis'],
    vin: ['vin', 'v i n', 'chassis', 'n de chassis', 'numero de chassis'],
    brandCode: ['code marque', 'marque'],
    modelCode: ['code modele', 'modele'],
    modelDescription: ['description', 'designation', 'modele description', 'nom modele'],
    registration: ['n immatriculation', 'numero immatriculation', 'no immatriculation', 'immatriculation', 'immat'],
    stockStatus: ['stocks', 'stock', 'statut', 'etat'],
    warehouseCode: ['code magasin', 'magasin'],
    locationCode: ['code emplacement', 'emplacement'],
    customerCode: ['n client', 'numero client', 'no client', 'code client'],
    customerName: ['nom du client', 'nom client', 'client'],
  };

  const columnIndices = {};
  for (const [field, aliases] of Object.entries(fieldAliases)) {
    let foundIdx = -1;
    for (const alias of aliases) {
      const idx = normalizedHeaders.indexOf(alias);
      if (idx !== -1) {
        foundIdx = idx;
        break;
      }
    }
    columnIndices[field] = foundIdx !== -1 ? foundIdx : null;
  }

  if (columnIndices.vin === null) {
    return send(res, 400, {
      ok: false,
      error: 'La feuille Excel doit obligatoirement contenir une colonne « VIN » (ou « Châssis »).',
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  let inputRows = 0;
  let addedRows = 0;
  let duplicateVinRows = 0;
  let missingVinRows = 0;
  const seenVinsInFile = new Set();
  const batch = [];

  const columns = [
    'serial_no', 'vin', 'vin_key', 'brand_code', 'model_code', 'model_description',
    'registration', 'stock_status', 'warehouse_code', 'location_code',
    'customer_code', 'customer_name', 'raw_data',
  ];

  async function flushBatch() {
    if (!batch.length) return;
    const width = columns.length;
    const values = batch.flatMap((row) => [
      row.serialNo,
      row.vin,
      row.vinKey,
      row.brandCode,
      row.modelCode,
      row.modelDescription,
      row.registration,
      row.stockStatus,
      row.warehouseCode,
      row.locationCode,
      row.customerCode,
      row.customerName,
      JSON.stringify(row.data),
    ]);
    const valueGroups = batch.map((_, rowIndex) => {
      const start = rowIndex * width;
      return `(${columns.map((_, columnIndex) => `$${start + columnIndex + 1}${columnIndex === width - 1 ? '::jsonb' : ''}`).join(', ')})`;
    });

    const inserted = await client.query(
      `INSERT INTO vehicle_inventory (${columns.join(', ')})
       VALUES ${valueGroups.join(', ')}
       ON CONFLICT (vin_key) WHERE vin_key IS NOT NULL DO NOTHING
       RETURNING source_row`,
      values,
    );
    addedRows += inserted.rowCount;
    duplicateVinRows += (batch.length - inserted.rowCount);
    batch.length = 0;
  }

  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('vehicle_inventory_import'))");

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (!row || !Array.isArray(row)) continue;
      let hasValue = false;
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '') {
          hasValue = true;
          break;
        }
      }
      if (!hasValue) continue;

      inputRows += 1;

      const rawData = {};
      for (let c = 0; c < headers.length; c++) {
        const val = row[c];
        rawData[headers[c]] = (val !== null && val !== undefined) ? (val instanceof Date ? val.toISOString() : val) : null;
      }

      function cellText(idx) {
        if (idx === null || idx === undefined || idx >= row.length) return null;
        const v = row[idx];
        if (v === null || v === undefined) return null;
        if (v instanceof Date) return v.toISOString().split('T')[0];
        const s = String(v).trim();
        return s === '' ? null : s;
      }

      const rawVin = cellText(columnIndices.vin);
      if (!rawVin) {
        missingVinRows += 1;
        continue;
      }

      const vinKey = rawVin.toUpperCase().replace(/\s+/g, '');
      if (seenVinsInFile.has(vinKey)) {
        duplicateVinRows += 1;
        continue;
      }
      seenVinsInFile.add(vinKey);

      const serialNo = cellText(columnIndices.serialNo) || `Ligne ${rowIndex + 1}`;
      batch.push({
        serialNo,
        vin: rawVin,
        vinKey,
        brandCode: cellText(columnIndices.brandCode),
        modelCode: cellText(columnIndices.modelCode),
        modelDescription: cellText(columnIndices.modelDescription),
        registration: cellText(columnIndices.registration),
        stockStatus: cellText(columnIndices.stockStatus),
        warehouseCode: cellText(columnIndices.warehouseCode),
        locationCode: cellText(columnIndices.locationCode),
        customerCode: cellText(columnIndices.customerCode),
        customerName: cellText(columnIndices.customerName),
        data: rawData,
      });

      if (batch.length >= 200) {
        await flushBatch();
      }
    }

    await flushBatch();
    await client.query('COMMIT');
    transactionStarted = false;

    const count = await pool.query('SELECT COUNT(*)::int AS total FROM vehicle_inventory');
    return send(res, 200, {
      ok: true,
      fileName,
      inputRows,
      addedRows,
      duplicateVinRows,
      missingVinRows,
      total: count.rows[0].total,
    });
  } catch (error) {
    if (transactionStarted) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    throw error;
  } finally {
    client.release();
  }
}

function cleanAccount(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    assignedTeam: row.assigned_team || undefined,
    password: '',
  };
}

function normalizeAccountIdentifier(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getRecordKey(record) {
  return String(
    record?.recordKey ?? record?.id ?? record?.sheetRowNumber ?? record?.rowNumber ??
    record?.noOr ?? record?.or ?? record?.ordre ?? record?.chassis ?? randomUUID(),
  ).trim();
}

function getVehicleColumns(record) {
  return [
    record?.noOr ?? record?.no ?? record?.numeroOR ?? record?.or ?? record?.ordre ?? null,
    record?.chassis ?? record?.vin ?? null,
    record?.equipe ?? record?.atelier ?? null,
    record?.etatIntervention ?? record?.etat ?? record?.statut ?? null,
    record?.avancement ?? null,
    record?.emplacement ?? null,
  ];
}

function isExclusiveWorkshopLocation(value) {
  const location = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return Boolean(location) && !['-', 'NA', 'LIVRAISONAUCLIENT', 'PLACECOMPLET', 'PARCCOMPLET'].includes(location);
}

async function requireAccount(req, res) {
  const id = verifySession(req);
  if (!id) {
    send(res, 401, { ok: false, error: 'Session absente ou expirée.' });
    return null;
  }
  const result = await pool.query(
    'SELECT id, name, email, role, assigned_team FROM accounts WHERE id = $1',
    [id],
  );
  if (!result.rowCount) {
    send(res, 401, { ok: false, error: 'Compte introuvable.' });
    return null;
  }
  return result.rows[0];
}

async function requireAdministrator(req, res) {
  const account = await requireAccount(req, res);
  if (!account) return null;
  if (!['administration', 'chef_atelier'].includes(account.role)) {
    send(res, 403, { ok: false, error: 'Cette action est réservée à la direction atelier.' });
    return null;
  }
  return account;
}

async function saveVehicleRecord(client, type, record, recordKey) {
  const [noOr, chassis, team, status, advancement, location] = getVehicleColumns(record);
  await client.query(
    `INSERT INTO vehicles (record_type, record_key, no_or, chassis, team, status, advancement, location, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (record_type, record_key) DO UPDATE SET
       no_or = EXCLUDED.no_or, chassis = EXCLUDED.chassis, team = EXCLUDED.team,
       status = EXCLUDED.status, advancement = EXCLUDED.advancement, location = EXCLUDED.location,
       payload = EXCLUDED.payload, updated_at = NOW()`,
    [type, recordKey, noOr, chassis, team, status, advancement, location, JSON.stringify(record)],
  );
}

async function resolveAccountTeam(account) {
  if (account.assigned_team) return String(account.assigned_team).trim();
  const result = await pool.query(
    `SELECT payload->>'team' AS team FROM app_records
     WHERE collection = 'teams' AND LOWER(payload->>'name') = LOWER($1) LIMIT 1`,
    [account.name],
  );
  return String(result.rows[0]?.team || '').trim();
}

async function updateVehicleBySelectors(query, updates, preferredType, allowedTeam) {
  const noOr = String(query.get('noOr') || query.get('no') || query.get('numeroOR') || query.get('or') || '').trim();
  const chassis = String(query.get('chassis') || query.get('vin') || '').trim();
  const rowNumber = String(query.get('rowNumber') || query.get('rowSuivi') || '').trim();
  const recordKey = String(query.get('recordKey') || '').trim();
  const params = [noOr, chassis, rowNumber, recordKey];
  const accessFilters = [];
  if (preferredType) {
    params.push(preferredType);
    accessFilters.push(`record_type = $${params.length}`);
  }
  if (allowedTeam) {
    const norm = allowedTeam.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (norm.includes('DAILY')) {
      accessFilters.push(`UPPER(COALESCE(team, '')) IN ('DAILY', 'DAILY1', 'DAILY2')`);
    } else {
      params.push(allowedTeam);
      accessFilters.push(`UPPER(COALESCE(team, '')) = UPPER($${params.length})`);
    }
  }
  const accessClause = accessFilters.length ? `AND ${accessFilters.join(' AND ')}` : '';
  const found = await pool.query(
    `SELECT id, record_type, record_key, payload FROM vehicles
     WHERE (($1 <> '' AND (no_or = $1 OR record_key = $1 OR payload->>'numeroOR' = $1))
        OR ($2 <> '' AND (chassis = $2 OR UPPER(chassis) = UPPER($2) OR UPPER(payload->>'vin') = UPPER($2)))
        OR ($3 <> '' AND (payload->>'sheetRowNumber' = $3 OR payload->>'rowNumber' = $3))
        OR ($4 <> '' AND (record_key = $4 OR payload->>'id' = $4)))
     ${accessClause}
     ORDER BY updated_at DESC, id DESC`,
    params,
  );
  if (!found.rowCount) return false;

  // Une place atelier ne peut accueillir qu'un seul véhicule. Les enregistrements
  // flux et réception représentant ce même véhicule sont exclus du contrôle.
  if (updates.emplacement !== undefined && isExclusiveWorkshopLocation(updates.emplacement)) {
    const locationKey = String(updates.emplacement).trim().toUpperCase().replace(/\s+/g, '');
    const targetIds = found.rows.map((row) => row.id);
    const occupied = await pool.query(
      `SELECT no_or, chassis FROM vehicles
       WHERE UPPER(REGEXP_REPLACE(COALESCE(location, ''), '\\s+', '', 'g')) = $1
         AND NOT (id = ANY($2::bigint[]))
       LIMIT 1`,
      [locationKey, targetIds],
    );
    if (occupied.rowCount) {
      const vehicle = occupied.rows[0];
      const error = new Error(`L'emplacement ${updates.emplacement} est déjà occupé par le véhicule ${vehicle.no_or || vehicle.chassis || ''}.`);
      error.statusCode = 409;
      throw error;
    }
  }
  for (const current of found.rows) {
    const payload = { ...current.payload, ...updates };
    if (updates.etat !== undefined) {
      payload.etatIntervention = updates.etat;
      payload.statut = updates.etat;
    }
    if (updates.etatIntervention !== undefined) {
      payload.etat = updates.etatIntervention;
      payload.statut = updates.etatIntervention;
    }
    if (updates.emplacement !== undefined) payload.emplacement = updates.emplacement;
    if (updates.technicien !== undefined) payload.technicien = updates.technicien;
    if (updates.nomTechnicien !== undefined) payload.nomTechnicien = updates.nomTechnicien;
    if (updates.equipe !== undefined) payload.equipe = updates.equipe;
    if (updates.avancement !== undefined) payload.avancement = updates.avancement;
    await saveVehicleRecord(pool, current.record_type, payload, current.record_key);
  }
  return true;
}

function sendActionResult(res, result) {
  return send(res, result.ok === false ? 400 : 200, result);
}

async function handleDatabaseAction(req, res, url) {
  const account = await requireAccount(req, res);
  if (!account) return;
  const body = req.method === 'POST' ? await readJson(req) : {};
  const action = String(url.searchParams.get('action') || body.action || '');
  const query = new URLSearchParams(url.searchParams);
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' || typeof value === 'number') query.set(key, String(value));
  }
  const text = (key, fallback = '') => String(query.get(key) || fallback).trim();
  const jsonParam = (key) => {
    const raw = query.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const managementRoles = new Set(['administration', 'chef_atelier']);
  const receptionRoles = new Set([...managementRoles, 'reception']);
  const workshopRoles = new Set([...managementRoles, 'chef_equipe']);
  const managementActions = new Set(['getComptes', 'sauvegarderEquipes', 'updateMoyennesPeriode']);
  const receptionActions = new Set(['ajouterEntree', 'modifierEntree', 'supprimerEntree', 'ajouterVin', 'modifierVin', 'updateStatutDevis', 'livrerVehicule']);
  const workshopActions = new Set(['updateEmplacement', 'updateEtat', 'updateTechnicien', 'updateAvancement', 'synchroniserEntrees', 'repararValidations', 'accepterEntreeChefEquipe']);
  const managementOnlyActions = new Set(['updateStatutAchat']);
  if (managementActions.has(action) && !managementRoles.has(account.role)) {
    return sendActionResult(res, { ok: false, error: 'Action réservée à la direction atelier.' });
  }
  if (receptionActions.has(action) && !receptionRoles.has(account.role)) {
    return sendActionResult(res, { ok: false, error: 'Action réservée à la réception et à la direction atelier.' });
  }
  if (workshopActions.has(action) && !workshopRoles.has(account.role)) {
    return sendActionResult(res, { ok: false, error: 'Action réservée aux équipes atelier.' });
  }
  if (managementOnlyActions.has(action) && !managementRoles.has(account.role)) {
    return sendActionResult(res, { ok: false, error: 'Action réservée à la direction atelier.' });
  }
  const allowedTeam = account.role === 'chef_equipe' && workshopActions.has(action)
    ? await resolveAccountTeam(account)
    : '';
  if (account.role === 'chef_equipe' && workshopActions.has(action) && !allowedTeam) {
    return sendActionResult(res, { ok: false, error: 'Aucune équipe n’est affectée à ce compte.' });
  }

  if (action === 'getComptes') {
    const rows = await pool.query('SELECT id, name, email, role, assigned_team FROM accounts ORDER BY name');
    return sendActionResult(res, { ok: true, comptes: rows.rows.map(cleanAccount) });
  }
  if (action === 'synchroniserEntrees' || action === 'repararValidations') {
    return sendActionResult(res, { ok: true, message: 'Synchronisation SQL terminée.' });
  }
  if (action === 'sauvegarderEquipes') {
    const members = jsonParam('equipesJson') || jsonParam('membresJson') || body.equipes || [];
    if (!Array.isArray(members)) return sendActionResult(res, { ok: false, error: 'Données d’équipe invalides.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("DELETE FROM app_records WHERE collection = 'teams'");
      for (const member of members) {
        const key = `${member.team || ''}:${member.matricule || member.name || randomUUID()}`;
        await client.query(
          `INSERT INTO app_records (collection, record_key, payload) VALUES ('teams', $1, $2::jsonb)`,
          [key, JSON.stringify(member)],
        );
      }
      await client.query('COMMIT');
      return sendActionResult(res, { ok: true, message: 'Équipes enregistrées dans PostgreSQL.' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  if (action === 'updateMoyennesPeriode') {
    const annee = Number(text('annee'));
    const mois = Number(text('mois'));
    await pool.query(
      `INSERT INTO app_records (collection, record_key, payload) VALUES ('averages', 'current', $1::jsonb)
       ON CONFLICT (collection, record_key) DO UPDATE SET
         payload = app_records.payload || EXCLUDED.payload, updated_at = NOW()`,
      [JSON.stringify({ annee, mois, lastUpdated: new Date().toISOString() })],
    );
    return sendActionResult(res, { ok: true, annee, mois, message: 'Période enregistrée dans PostgreSQL.' });
  }
  if (action === 'ajouterVin' || action === 'modifierVin') {
    const raw = jsonParam('payload') || body.payload || Object.fromEntries(query.entries());
    const chassis = String(raw.chassis || raw.vin || text('chassis')).trim().toUpperCase();
    if (!chassis) return sendActionResult(res, { ok: false, error: 'Le numéro de châssis est requis.' });
    const existing = await pool.query("SELECT record_key, payload FROM vehicles WHERE record_type = 'vin' AND UPPER(chassis) = $1 LIMIT 1", [chassis]);
    const record = { ...existing.rows[0]?.payload, ...raw, chassis };
    await saveVehicleRecord(pool, 'vin', record, existing.rows[0]?.record_key || chassis);
    return sendActionResult(res, { ok: true, message: 'Fiche VIN enregistrée dans PostgreSQL.' });
  }
  if (action === 'ajouterEntree') {
    const noOr = text('noOr', text('no', text('numeroOR', text('or'))));
    const chassis = text('chassis', text('vin')).toUpperCase();
    const immatriculation = text('immatriculation', text('immat', '-'));
    const existing = await pool.query(
      "SELECT record_key, payload FROM vehicles WHERE record_type = 'reception' AND (($1 <> '' AND (no_or = $1 OR payload->>'numeroOR' = $1)) OR ($2 <> '' AND (UPPER(chassis) = $2 OR UPPER(payload->>'vin') = $2))) ORDER BY id DESC LIMIT 1",
      [noOr, chassis],
    );
    const reception = {
      ...existing.rows[0]?.payload,
      id: existing.rows[0]?.payload?.id || Date.now(),
      noOr, no: noOr, numeroOR: noOr, cs: text('cs'), chassis, vin: chassis,
      immatriculation: immatriculation !== '-' ? immatriculation : (existing.rows[0]?.payload?.immatriculation || '-'),
      codeClient: text('codeClient'), nomClient: text('nomClient', text('client')),
      dateEntreeHeure: text('dateEntreeHeure'), marque: text('marque', 'IVECO'),
      modele: text('modele'), categorie: text('categorie'), equipe: text('equipe'),
      etat: text('etat', 'Attente Réparation'), emplacement: text('emplacement'),
      statutAcceptation: 'en_attente',
      dateAcceptation: '',
      dateMiseEnAttente: '',
    };
    await saveVehicleRecord(pool, 'reception', reception, existing.rows[0]?.record_key || noOr || chassis);
    const flux = {
      id: reception.id, ordre: noOr, no: noOr, numeroOR: noOr, or: noOr, chassis, vin: chassis, cs: reception.cs,
      date: reception.dateEntreeHeure.split(' ')[0] || '', dateEntree: reception.dateEntreeHeure.split(' ')[0] || '',
      immatriculation: reception.immatriculation, marque: reception.marque, modele: reception.modele,
      modelePowerBI: reception.modele, categorie: reception.categorie, atelier: reception.categorie,
      operation: 'Entrée atelier', statut: reception.etat, etatIntervention: reception.etat,
      montant: 0, temps: 0, nbIntervention: 1, client: reception.nomClient,
      equipe: reception.equipe, avancement: '-', emplacement: reception.emplacement || '-',
      technicien: '-', nomTechnicien: '-', serie: '-',
      statutAcceptation: 'en_attente',
      dateAcceptation: '',
      dateMiseEnAttente: '',
    };
    await saveVehicleRecord(pool, 'flux', flux, String(reception.id));
    return sendActionResult(res, { ok: true, message: 'Entrée enregistrée dans PostgreSQL.', recordKey: String(reception.id) });
  }
  if (action === 'modifierEntree') {
    const noOr = text('noOr', text('no'));
    const chassis = text('chassis').toUpperCase();
    const updated = await updateVehicleBySelectors(query, {
      noOr, no: noOr, cs: text('cs'), chassis,
      immatriculation: text('immatriculation'),
      codeClient: text('codeClient'), nomClient: text('nomClient'),
      dateEntreeHeure: text('dateEntreeHeure'), marque: text('marque'),
      modele: text('modele'), categorie: text('categorie'), equipe: text('equipe'),
      etat: text('etat'), emplacement: text('emplacement'),
    }, 'reception');
    if (!updated) return sendActionResult(res, { ok: false, error: 'Dossier introuvable.' });
    return sendActionResult(res, { ok: true, message: 'Dossier modifié dans PostgreSQL.' });
  }
  if (action === 'supprimerEntree') {
    const noOr = text('noOr', text('no', text('numeroOR', text('or'))));
    const chassis = text('chassis', text('vin')).toUpperCase();
    const id = text('id');
    const recordKey = text('recordKey');
    const immat = text('immatriculation', text('immat'));
    const result = await pool.query(
      `DELETE FROM vehicles WHERE record_type IN ('flux', 'reception')
       AND (($1 <> '' AND (no_or = $1 OR record_key = $1 OR payload->>'numeroOR' = $1))
         OR ($2 <> '' AND (UPPER(chassis) = $2 OR UPPER(payload->>'vin') = $2))
         OR ($3 <> '' AND (record_key = $3 OR payload->>'id' = $3 OR id::text = $3))
         OR ($4 <> '' AND (record_key = $4 OR payload->>'recordKey' = $4))
         OR ($5 <> '' AND (payload->>'immatriculation' = $5 OR UPPER(payload->>'immat') = UPPER($5))))`,
      [noOr, chassis, id, recordKey, immat],
    );
    return sendActionResult(res, { ok: true, message: `${result.rowCount} enregistrement(s) supprimé(s).` });
  }
  if (action === 'accepterEntreeChefEquipe') {
    const decision = text('decision', 'accepte');
    const nowFr = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const dateDecision = text('dateDecision', nowFr);
    const decisionPar = text('decisionPar', account.name || account.email);
    const updateObj = decision === 'accepte'
      ? {
          statutAcceptation: 'accepte',
          dateAcceptation: dateDecision,
          acceptePar: decisionPar,
          dateDebutRep: query.get('dateDebutRep') || dateDecision,
          dateDebutTravail: query.get('dateDebutTravail') || dateDecision,
          heureDebutTravail: query.get('heureDebutTravail') || (dateDecision.split(' ')[1] || ''),
          ...(query.get('statut') ? { statut: query.get('statut') } : {}),
          ...(query.get('etat') ? { etat: query.get('etat'), etatIntervention: query.get('etat') } : {}),
          ...(query.get('etatIntervention') ? { etatIntervention: query.get('etatIntervention'), etat: query.get('etatIntervention') } : {}),
          ...(query.get('avancement') ? { avancement: query.get('avancement') } : {}),
          ...(query.get('emplacement') ? { emplacement: query.get('emplacement') } : {}),
          ...(query.get('technicien') ? { technicien: query.get('technicien') } : {}),
          ...(query.get('nomTechnicien') ? { nomTechnicien: query.get('nomTechnicien') } : {}),
        }
      : { statutAcceptation: 'mis_en_attente', dateMiseEnAttente: dateDecision, misEnAttentePar: decisionPar };
    const updatedFlux = await updateVehicleBySelectors(query, updateObj, 'flux', allowedTeam);
    const updatedReception = await updateVehicleBySelectors(query, updateObj, 'reception', allowedTeam);
    if (!updatedFlux && !updatedReception) {
      const updatedAny = await updateVehicleBySelectors(query, updateObj, undefined, allowedTeam);
      if (!updatedAny) return sendActionResult(res, { ok: false, error: 'Véhicule introuvable pour cette équipe.' });
    }
    return sendActionResult(res, { ok: true, decision, dateDecision, decisionPar });
  }

  // ══ livrerVehicule : action dédiée réception pour livrer un véhicule avec mode de paiement
  if (action === 'livrerVehicule') {
    const nowFr = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const modePaiement = text('modePaiement');
    const livrePar = text('livrePar', account.name || account.email || '');
    const updateObj = {
      etat: 'Livré',
      etatIntervention: 'Livré',
      statut: 'Livré',
      emplacement: 'Livraison au client',
      modePaiement,
      dateLivraisonClient: nowFr,
      livrePar,
    };
    const updated = await updateVehicleBySelectors(query, updateObj, undefined, '');
    if (!updated) return sendActionResult(res, { ok: false, error: 'Véhicule introuvable dans PostgreSQL.' });
    return sendActionResult(res, { ok: true, message: `Véhicule livré (${modePaiement || 'mode non précisé'}) enregistré dans PostgreSQL.` });
  }


  const updateFields = {};
  for (const [key, value] of query.entries()) {
    if (!['action', 'token', 'no', 'noOr', 'chassis', 'cs', 'rowNumber', 'rowSuivi'].includes(key)) {
      updateFields[key] = value;
    }
  }
  if (action === 'updateStatutAchat') updateFields.statutAchat = text('statutAchat', text('statut'));
  if (action === 'updateStatutDevis') updateFields.statutDevis = text('statutDevis', text('statut'));
  if (['updateEmplacement', 'updateEtat', 'updateTechnicien', 'updateAvancement', 'updateStatutAchat', 'updateStatutDevis'].includes(action)) {
    const updated = await updateVehicleBySelectors(query, updateFields, undefined, allowedTeam);
    if (!updated) return sendActionResult(res, { ok: false, error: 'Véhicule introuvable dans PostgreSQL.' });
    return sendActionResult(res, { ok: true, message: 'Véhicule mis à jour dans PostgreSQL.' });
  }
  return sendActionResult(res, { ok: false, error: `Action SQL inconnue : ${action}` });
}

async function bootstrap() {
  const schema = await readFile(schemaPath, 'utf8');
  await pool.query(schema);

  const count = await pool.query('SELECT COUNT(*)::int AS count FROM accounts');
  if (count.rows[0].count === 0 && process.env.INITIAL_ADMIN_EMAIL && process.env.INITIAL_ADMIN_PASSWORD) {
    await pool.query(
      `INSERT INTO accounts (id, name, email, password_hash, role)
       VALUES ($1, $2, LOWER($3), $4, 'administration')
       ON CONFLICT (email) DO NOTHING`,
      [randomUUID(), process.env.INITIAL_ADMIN_NAME || 'Administrateur', process.env.INITIAL_ADMIN_EMAIL.trim(), passwordHash(process.env.INITIAL_ADMIN_PASSWORD)],
    );
    console.log('Compte administrateur initial créé depuis les variables INITIAL_ADMIN_*.');
  }
}

async function handle(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    await pool.query('SELECT 1');
    return send(res, 200, { ok: true, database: 'postgresql' });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson(req);
    const identifier = normalizeAccountIdentifier(body.identifier);
    const password = String(body.password || '');
    const shortEmail = identifier.includes('@') ? identifier.split('@')[0] : identifier;
    const result = await pool.query(
      `SELECT * FROM accounts
       WHERE LOWER(email) = $1 OR LOWER(SPLIT_PART(email, '@', 1)) = $2
          OR LOWER(name) = $3 OR LOWER(id) = $3
       LIMIT 1`,
      [identifier, shortEmail, identifier],
    );
    const account = result.rows[0];
    if (!account || !passwordMatches(password, account.password_hash)) {
      return send(res, 401, { ok: false, error: 'Identifiant ou mot de passe incorrect.' });
    }
    const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
    const token = signSession(account.id, expiresAt);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return send(res, 200, { ok: true, user: cleanAccount(account) }, {
      'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const account = await requireAccount(req, res);
    if (!account) return;
    return send(res, 200, { ok: true, user: cleanAccount(account) });
  }

  if (url.pathname === '/api/actions' && req.method === 'POST') {
    return handleDatabaseAction(req, res, url);
  }

  if (parts[0] !== 'api') return send(res, 404, { ok: false, error: 'Route introuvable.' });

  if (parts[1] === 'accounts') {
    const actor = await requireAdministrator(req, res);
    if (!actor) return;
    if (parts.length === 2 && req.method === 'GET') {
      const result = await pool.query('SELECT id, name, email, role, assigned_team FROM accounts ORDER BY name');
      return send(res, 200, result.rows.map(cleanAccount));
    }
    if (parts.length === 2 && req.method === 'POST') {
      const body = await readJson(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      const role = String(body.role || 'chef_equipe');
      if (!name || !email.includes('@') || !password || !ROLE_VALUES.has(role)) {
        return send(res, 400, { ok: false, error: 'Nom, email, mot de passe et rôle valide requis.' });
      }
      const id = String(body.id || randomUUID());
      const result = await pool.query(
        `INSERT INTO accounts (id, name, email, password_hash, role, assigned_team)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, name, email, role, assigned_team`,
        [id, name, email, passwordHash(password), role, body.assignedTeam || null],
      );
      if (!result.rowCount) return send(res, 409, { ok: false, error: 'Un compte avec cette adresse existe déjà.' });
      return send(res, 200, { ok: true, account: cleanAccount(result.rows[0]) });
    }
    if (parts.length === 3 && req.method === 'PUT') {
      const body = await readJson(req);
      const role = String(body.role || 'chef_equipe');
      if (body.role && !ROLE_VALUES.has(role)) {
        return send(res, 400, { ok: false, error: 'Rôle invalide.' });
      }
      const current = await pool.query('SELECT * FROM accounts WHERE id = $1', [parts[2]]);
      if (!current.rowCount) return send(res, 404, { ok: false, error: 'Compte introuvable.' });
      const old = current.rows[0];
      const password = String(body.password || '').trim();
      const result = await pool.query(
        `UPDATE accounts SET name = $2, email = LOWER($3), role = $4, assigned_team = $5,
           password_hash = $6, updated_at = NOW()
         WHERE id = $1 RETURNING id, name, email, role, assigned_team`,
        [
          parts[2], String(body.name ?? old.name).trim(), String(body.email ?? old.email).trim(),
          body.role || old.role, body.assignedTeam ?? old.assigned_team,
          password ? passwordHash(password) : old.password_hash,
        ],
      );
      return send(res, 200, { ok: true, account: cleanAccount(result.rows[0]) });
    }
    if (parts.length === 3 && req.method === 'DELETE') {
      await pool.query('DELETE FROM accounts WHERE id = $1 OR LOWER(email) = LOWER($1)', [parts[2]]);
      return send(res, 200, { ok: true });
    }
  }

  if (parts[1] === 'inventory' && parts[2] === 'vehicles') {
    if (parts.length === 4 && parts[3] === 'import' && req.method === 'POST') {
      return importVehicleWorkbook(req, res);
    }

    if (parts.length === 4 && parts[3] === 'lookup' && req.method === 'GET') {
      const account = await requireAccount(req, res);
      if (!account) return;

      const q = String(url.searchParams.get('q') || url.searchParams.get('vin') || '').trim();
      if (!q || q.length < 3) {
        return send(res, 200, { ok: true, vehicle: null });
      }

      const cleanQ = q.toUpperCase();
      const vinNoSpaces = cleanQ.replace(/\s+/g, '');

      // 1. Chercher en priorité dans vehicle_inventory (Parc véhicules & engins)
      const invResult = await pool.query(
        `SELECT source_row AS "sourceRow", serial_no AS "serialNo", vin,
          brand_code AS "brandCode", model_code AS "modelCode",
          model_description AS "modelDescription", registration,
          stock_status AS "stockStatus", warehouse_code AS "warehouseCode",
          location_code AS "locationCode", customer_code AS "customerCode",
          customer_name AS "customerName", raw_data AS "data"
         FROM vehicle_inventory
         WHERE vin_key = $1
            OR UPPER(vin) = $2
            OR UPPER(REPLACE(COALESCE(vin, ''), ' ', '')) = $1
            OR (LENGTH($1) >= 5 AND (vin_key LIKE '%' || $1 OR UPPER(vin) LIKE '%' || $2))
            OR (registration IS NOT NULL AND BTRIM(registration) <> '' AND (
                  UPPER(REPLACE(registration, ' ', '')) = $1
                  OR UPPER(registration) = $2
               ))
         ORDER BY
           CASE
             WHEN vin_key = $1 OR UPPER(vin) = $2 THEN 0
             WHEN UPPER(REPLACE(COALESCE(vin, ''), ' ', '')) = $1 THEN 1
             WHEN registration IS NOT NULL AND UPPER(REPLACE(registration, ' ', '')) = $1 THEN 2
             WHEN vin_key LIKE '%' || $1 THEN 3
             ELSE 4
           END,
           source_row DESC
         LIMIT 1`,
        [vinNoSpaces, cleanQ],
      );

      if (invResult.rows.length > 0) {
        const row = invResult.rows[0];
        const data = row.data || {};
        const reg = row.registration || data['N° Immatriculation'] || data['Ne Immatriculation'] || data['Immatriculation'] || data['No Immatriculation'] || '';
        const clientName = row.customerName || data['Nom du client'] || data['Nom client'] || data['Client'] || '';
        const clientCode = row.customerCode || data['N° client'] || data['Code client'] || '';
        const brand = row.brandCode || data['Code marque'] || data['Marque'] || 'IVECO';
        const model = row.modelCode || data['Code modèle'] || data['Code modele'] || '';
        const desc = row.modelDescription || data['Description'] || data['Désignation'] || model || '';

        return send(res, 200, {
          ok: true,
          source: 'inventory',
          vehicle: {
            chassis: row.vin || cleanQ,
            vin: row.vin || cleanQ,
            marque: brand,
            codeMarque: brand,
            modele: model || desc,
            codeModele: model,
            categorie: desc,
            descriptionSection: desc,
            immatriculation: reg,
            codeClient: clientCode,
            nomClient: clientName,
            emplacement: row.locationCode || '',
            magasin: row.warehouseCode || '',
          },
        });
      }

      // 2. Si pas trouvé dans vehicle_inventory, chercher dans vehicles (record_type = 'vin')
      const vinResult = await pool.query(
        `SELECT payload FROM vehicles
         WHERE record_type = 'vin'
           AND (UPPER(chassis) = $1 OR UPPER(chassis) LIKE '%' || $1 OR record_key = $1)
         ORDER BY id DESC LIMIT 1`,
        [cleanQ],
      );

      if (vinResult.rows.length > 0) {
        const payload = vinResult.rows[0].payload || {};
        return send(res, 200, {
          ok: true,
          source: 'vin',
          vehicle: {
            chassis: payload.chassis || cleanQ,
            vin: payload.chassis || cleanQ,
            marque: payload.marque || payload.codeMarque || 'IVECO',
            modele: payload.modele || payload.codeModele || '',
            categorie: payload.categorie || payload.descriptionSection || '',
            immatriculation: payload.immatriculation || '',
            codeClient: payload.codeClient || '',
            nomClient: payload.nomClient || '',
          },
        });
      }

      return send(res, 200, { ok: true, vehicle: null });
    }

    if (parts.length === 4 && parts[3] === 'manual' && req.method === 'POST') {
      const account = await requireAccount(req, res);
      if (!account) return;
      if (!['administration', 'chef_atelier'].includes(account.role)) {
        return send(res, 403, { ok: false, error: 'L’ajout manuel au parc est réservé à l’administration et au Chef d’Atelier.' });
      }

      const body = await readJson(req);
      const text = (key) => String(body[key] || '').trim();
      const vin = text('vin').toUpperCase();
      const brandCode = text('brandCode').toUpperCase();
      if (!vin || !brandCode) {
        return send(res, 400, { ok: false, error: 'Le VIN et le code marque sont obligatoires.' });
      }

      const vinKey = vin.replace(/\s+/g, '');
      const serialNo = text('serialNo') || `MAN-${vinKey}`;
      const rawData = {
        'N° de série': serialNo,
        VIN: vin,
        'Code marque': brandCode,
        'Code modèle': text('modelCode') || null,
        Description: text('modelDescription') || null,
        'N° Immatriculation': text('registration') || null,
        Stocks: text('stockStatus') || null,
        'Code magasin': text('warehouseCode') || null,
        'Code emplacement': text('locationCode') || null,
        'N° client': text('customerCode') || null,
        'Nom du client': text('customerName') || null,
        source: 'manual',
      };
      const result = await pool.query(
        `INSERT INTO vehicle_inventory (
          serial_no, vin, vin_key, brand_code, model_code, model_description,
          registration, stock_status, warehouse_code, location_code,
          customer_code, customer_name, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
        ON CONFLICT (vin_key) WHERE vin_key IS NOT NULL DO NOTHING
        RETURNING source_row AS "sourceRow", serial_no AS "serialNo", vin,
          brand_code AS "brandCode", model_code AS "modelCode",
          model_description AS "modelDescription", registration,
          stock_status AS "stockStatus", warehouse_code AS "warehouseCode",
          location_code AS "locationCode", customer_code AS "customerCode",
          customer_name AS "customerName", raw_data AS "data"`,
        [
          serialNo, vin, vinKey, brandCode, text('modelCode') || null, text('modelDescription') || null,
          text('registration') || null, text('stockStatus') || null, text('warehouseCode') || null,
          text('locationCode') || null, text('customerCode') || null, text('customerName') || null,
          JSON.stringify(rawData),
        ],
      );
      if (!result.rowCount) {
        return send(res, 409, { ok: false, error: 'Ce VIN existe déjà dans le Parc véhicules & engins.' });
      }
      return send(res, 201, { ok: true, row: result.rows[0] });
    }

    if (parts.length === 3 && req.method === 'GET') {
      const account = await requireAccount(req, res);
      if (!account) return;
      if (!['administration', 'chef_atelier', 'reception'].includes(account.role)) {
        return send(res, 403, { ok: false, error: 'Accès à l’inventaire réservé à l’administration, à la direction atelier et à la réception.' });
      }

      const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(10, Number.parseInt(url.searchParams.get('pageSize') || '50', 10) || 50));
      const search = String(url.searchParams.get('search') || '').trim().slice(0, 120);
      const searchFields = [
        'serial_no', 'vin', 'brand_code', 'model_code', 'model_description',
        'registration', 'stock_status', 'warehouse_code', 'location_code',
        'customer_code', 'customer_name',
      ];
      // Périmètre du Parc : seules les trois marques gérées sont consultables.
      // Les autres lignes sont exclues de la liste, sans suppression en base.
      const brandScope = "(UPPER(BTRIM(COALESCE(brand_code, ''))) IN ('CHANGAN', 'IVECO', 'JMC') OR raw_data->>'source' = 'manual')";
      const searchClause = search
        ? `WHERE ${brandScope} AND (${searchFields.map((field) => `POSITION(LOWER($1) IN LOWER(COALESCE(${field}, ''))) > 0`).join(' OR ')})`
        : `WHERE ${brandScope}`;
      const filterValues = search ? [search] : [];
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM vehicle_inventory ${searchClause}`,
        filterValues,
      );
      const rowValues = [...filterValues, pageSize, (page - 1) * pageSize];
      const limitParameter = filterValues.length + 1;
      const offsetParameter = filterValues.length + 2;
      const result = await pool.query(
        `SELECT source_row AS "sourceRow", serial_no AS "serialNo", vin,
          brand_code AS "brandCode", model_code AS "modelCode",
          model_description AS "modelDescription", registration,
          stock_status AS "stockStatus", warehouse_code AS "warehouseCode",
          location_code AS "locationCode", customer_code AS "customerCode",
          customer_name AS "customerName", raw_data AS "data"
         FROM vehicle_inventory ${searchClause}
         ORDER BY source_row
         LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
        rowValues,
      );
      return send(res, 200, {
        rows: result.rows,
        total: countResult.rows[0].total,
        page,
        pageSize,
      }, { 'Cache-Control': 'no-store' });
    }
  }

  if (parts[1] === 'data' && parts.length >= 3) {
    const collection = parts[2];
    const vehicleCollection = VEHICLE_COLLECTIONS.has(collection);
    if (!vehicleCollection && !RECORD_COLLECTIONS.has(collection)) {
      return send(res, 404, { ok: false, error: 'Collection SQL inconnue.' });
    }
    const account = await requireAccount(req, res);
    if (!account) return;
    if (req.method !== 'GET' && (collection === 'teams' || collection === 'averages') && !['administration', 'chef_atelier'].includes(account.role)) {
      return send(res, 403, { ok: false, error: 'Action réservée à la direction atelier.' });
    }
    const collectionRoles = {
      purchases: ['administration', 'chef_atelier', 'chef_equipe'],
      quotes: ['administration', 'chef_atelier', 'reception'],
      essai_controls: ['administration', 'chef_atelier', 'chef_equipe'],
      // Les chefs d'équipe enregistrent les bascules horodatées (PDR, devis,
      // réaffectation, essai) : ils doivent pouvoir lire et écrire leur chronométrie.
      vehicle_times: ['administration', 'chef_atelier', 'chef_equipe'],
      transfers: ['administration', 'chef_atelier', 'chef_equipe'],
      reassignments: ['administration', 'chef_atelier', 'chef_equipe'],
      essais: ['administration', 'chef_atelier', 'chef_equipe'],
      // La réception crée la notification, puis le chef d'équipe concerné la lit
      // et l'accepte : les deux rôles doivent pouvoir la synchroniser/supprimer.
      devis_notifications: ['administration', 'chef_atelier', 'reception', 'chef_equipe'],
      entree_notifications: ['administration', 'chef_atelier', 'reception', 'chef_equipe'],
    };
    if (req.method !== 'GET' && vehicleCollection && !['administration', 'chef_atelier'].includes(account.role)) {
      return send(res, 403, { ok: false, error: 'Modification des véhicules réservée à la direction atelier.' });
    }
    if (req.method !== 'GET' && collectionRoles[collection] && !collectionRoles[collection].includes(account.role)) {
      return send(res, 403, { ok: false, error: 'Accès à cette collection non autorisé pour ce rôle.' });
    }

    if (parts.length === 3 && req.method === 'GET') {
      if (vehicleCollection) {
        let result;
        if (account.role === 'chef_equipe' && collection !== 'vin') {
          const team = await resolveAccountTeam(account);
          if (!team) return send(res, 403, { ok: false, error: 'Aucune équipe n’est affectée à ce compte.' });
          const normTeam = team.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (normTeam.includes('DAILY')) {
            result = await pool.query(
              `SELECT payload FROM vehicles WHERE record_type = $1
               AND UPPER(COALESCE(team, '')) IN ('DAILY', 'DAILY1', 'DAILY2') ORDER BY id`, [collection],
            );
          } else {
            result = await pool.query(
              `SELECT payload FROM vehicles WHERE record_type = $1
               AND UPPER(COALESCE(team, '')) = UPPER($2) ORDER BY id`, [collection, team],
            );
          }
        } else {
          result = await pool.query(
            'SELECT payload FROM vehicles WHERE record_type = $1 ORDER BY id', [collection],
          );
        }
        return send(res, 200, result.rows.map((row) => row.payload));
      }
      const result = await pool.query(
        'SELECT payload FROM app_records WHERE collection = $1 ORDER BY updated_at DESC', [collection],
      );
      return send(res, 200, result.rows.map((row) => row.payload));
    }

    if (parts.length === 3 && (req.method === 'POST' || req.method === 'PUT')) {
      const body = await readJson(req);
      const records = Array.isArray(body) ? body : [body];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const record of records) {
          if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
          const key = getRecordKey(record);
          if (vehicleCollection) {
            const [noOr, chassis, team, status, advancement, location] = getVehicleColumns(record);
            await client.query(
              `INSERT INTO vehicles (record_type, record_key, no_or, chassis, team, status, advancement, location, payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
               ON CONFLICT (record_type, record_key) DO UPDATE SET
                 no_or = EXCLUDED.no_or, chassis = EXCLUDED.chassis, team = EXCLUDED.team,
                 status = EXCLUDED.status, advancement = EXCLUDED.advancement, location = EXCLUDED.location,
                 payload = EXCLUDED.payload, updated_at = NOW()`,
              [collection, key, noOr, chassis, team, status, advancement, location, JSON.stringify(record)],
            );
          } else {
            const vehicleKey = String(record.vehicleId || record.noOr || record.or || record.chassis || '') || null;
            await client.query(
              `INSERT INTO app_records (collection, record_key, vehicle_key, payload)
               VALUES ($1, $2, $3, $4::jsonb)
               ON CONFLICT (collection, record_key) DO UPDATE SET
                 vehicle_key = EXCLUDED.vehicle_key, payload = EXCLUDED.payload, updated_at = NOW()`,
              [collection, key, vehicleKey, JSON.stringify(record)],
            );
          }
        }
        await client.query('COMMIT');
        return send(res, 200, { ok: true, count: records.length });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (parts.length === 4 && req.method === 'PUT') {
      const body = await readJson(req);
      const key = parts[3];
      if (vehicleCollection) {
        const current = await pool.query(
          'SELECT payload FROM vehicles WHERE record_type = $1 AND record_key = $2', [collection, key],
        );
        if (!current.rowCount) return send(res, 404, { ok: false, error: 'Véhicule introuvable.' });
        const merged = { ...current.rows[0].payload, ...body };
        const [noOr, chassis, team, status, advancement, location] = getVehicleColumns(merged);
        await pool.query(
          `UPDATE vehicles SET no_or = $3, chassis = $4, team = $5, status = $6,
           advancement = $7, location = $8, payload = $9::jsonb, updated_at = NOW()
           WHERE record_type = $1 AND record_key = $2`,
          [collection, key, noOr, chassis, team, status, advancement, location, JSON.stringify(merged)],
        );
      } else {
        await pool.query(
          `INSERT INTO app_records (collection, record_key, payload)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (collection, record_key) DO UPDATE SET
             payload = app_records.payload || EXCLUDED.payload, updated_at = NOW()`,
          [collection, key, JSON.stringify(body)],
        );
      }
      return send(res, 200, { ok: true });
    }

    if (parts.length === 4 && req.method === 'DELETE') {
      if (vehicleCollection) {
        const result = await pool.query(
          `DELETE FROM vehicles WHERE record_type = $1
           AND (record_key = $2 OR no_or = $2 OR chassis = $2 OR id::text = $2 OR payload->>'id' = $2)`, [collection, parts[3]],
        );
        return send(res, 200, { ok: true, deleted: result.rowCount });
      }
      const result = await pool.query(
        'DELETE FROM app_records WHERE collection = $1 AND record_key = $2', [collection, parts[3]],
      );
      return send(res, 200, { ok: true, deleted: result.rowCount });
    }
  }

  return send(res, 404, { ok: false, error: 'Route introuvable.' });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('Erreur API PostgreSQL:', error);
    if (!res.headersSent) send(res, error.statusCode || 500, { ok: false, error: error.message || 'Erreur interne du serveur.' });
    else res.end();
  });
});

bootstrap().then(() => {
  server.listen(PORT, () => console.log(`API PostgreSQL prête sur http://localhost:${PORT}`));
}).catch((error) => {
  console.error('Initialisation PostgreSQL impossible:', error);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await pool.end();
    process.exit(0);
  }));
}
