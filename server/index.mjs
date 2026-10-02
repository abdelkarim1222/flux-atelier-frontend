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
const WORKSHOP_TIME_ZONE = process.env.WORKSHOP_TIME_ZONE || 'Africa/Tunis';
const ROLE_VALUES = new Set(['administration', 'chef_atelier', 'reception', 'chef_equipe', 'facturation', 'garantie']);
// Les libellés historiques restent tous valides afin que les dossiers déjà
// créés puissent encore être régularisés ou livrés.
const FACTURATION_PAYMENT_MODES = new Set([
  'Facture',
  'Bon de commande',
  'Att Facture',
  'Attente Facture',
  'Édition fin de travaux',
]);
const ATT_FACTURE_PAYMENT_MODES = new Set(['Att Facture', 'Attente Facture', 'Édition fin de travaux']);
const ATT_FACTURE_OPTIONS = new Set(['standard', 'garant']);
const VEHICLE_COLLECTIONS = new Set(['flux', 'reception', 'vin']);
const RECORD_COLLECTIONS = new Set([
  'teams', 'averages', 'purchases', 'quotes', 'essai_controls',
  'vehicle_times', 'transfers', 'reassignments', 'essais', 'devis_notifications',
  'entree_notifications', 'facturation_notifications',
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

function getPersistedFacturationPaymentMode(payload) {
  const modePaiement = String(payload?.modePaiement || '').trim();
  if (!FACTURATION_PAYMENT_MODES.has(modePaiement)) return '';

  const statutFacturation = String(payload?.statutFacturation || '').trim();
  const statutFacturationFinale = String(payload?.statutFacturationFinale || '').trim();
  const expectedStatut = ATT_FACTURE_PAYMENT_MODES.has(modePaiement)
    ? 'edition_fin_travaux'
    : (modePaiement === 'Bon de commande' ? 'bon_commande' : 'facture');

  // La présence du seul libellé de mode ne suffit pas : l'action Facturation
  // inscrit aussi le statut, la date et l'auteur de la validation.
  if (statutFacturation !== expectedStatut) return '';
  if (!String(payload?.dateValidationFacturation || '').trim()) return '';
  if (!String(payload?.facturationValideePar || '').trim()) return '';
  if (ATT_FACTURE_PAYMENT_MODES.has(modePaiement)) {
    if (!['non_facture', 'facture'].includes(statutFacturationFinale)) return '';
  } else if (statutFacturationFinale !== 'facture') {
    return '';
  }
  return modePaiement;
}

// Horloge métier commune : l'heure affichée ne dépend pas du fuseau réglé sur
// le PC ou le téléphone de l'utilisateur.
function workshopDateTime() {
  const values = new Intl.DateTimeFormat('en-GB', {
    timeZone: WORKSHOP_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).reduce((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
  const time = `${values.hour}:${values.minute}:${values.second}`;
  return { dateTime: `${values.day}/${values.month}/${values.year} ${time}`, time };
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
  let customPermissions = {};
  if (row.custom_permissions) {
    if (typeof row.custom_permissions === 'string') {
      try { customPermissions = JSON.parse(row.custom_permissions); } catch {}
    } else if (typeof row.custom_permissions === 'object') {
      customPermissions = row.custom_permissions;
    }
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    assignedTeam: row.assigned_team || undefined,
    customPermissions: customPermissions && Object.keys(customPermissions).length > 0 ? customPermissions : undefined,
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

function sanitizeSingleTeam(teamVal, fallback = 'Daily1') {
  if (!teamVal || typeof teamVal !== 'string') return fallback;
  const clean = teamVal.trim();
  if (!clean || clean === '-' || clean === 'NA') return fallback;
  if (!clean.includes(',')) return clean;
  const parts = clean.split(',').map((t) => t.trim()).filter(Boolean);
  return parts[0] || fallback;
}

function getVehicleColumns(record) {
  let teamVal = record?.equipe ?? record?.atelier ?? null;
  if (teamVal && typeof teamVal === 'string' && teamVal.includes(',')) {
    teamVal = sanitizeSingleTeam(teamVal);
  }
  return [
    record?.noOr ?? record?.no ?? record?.numeroOR ?? record?.or ?? record?.ordre ?? null,
    record?.chassis ?? record?.vin ?? null,
    teamVal,
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
    'SELECT id, name, email, role, assigned_team, custom_permissions FROM accounts WHERE id = $1',
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
  if (record && typeof record === 'object') {
    if (typeof record.equipe === 'string' && record.equipe.includes(',')) {
      record.equipe = sanitizeSingleTeam(record.equipe);
    }
  }
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
  const origNo = String(query.get('origNo') || '').trim();
  const origChassis = String(query.get('origChassis') || '').trim();
  const targetId = String(query.get('id') || '').trim();
  const params = [noOr, chassis, rowNumber, recordKey, origNo, origChassis, targetId];
  const accessFilters = [];
  if (preferredType) {
    params.push(preferredType);
    accessFilters.push(`record_type = $${params.length}`);
  }
  if (allowedTeam) {
    const rawTeams = allowedTeam.split(',').map((t) => t.trim()).filter(Boolean);
    const teamClauses = [];
    for (const t of rawTeams) {
      const norm = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (norm.includes('DAILY')) {
        teamClauses.push(`UPPER(COALESCE(team, '')) IN ('DAILY', 'DAILY1', 'DAILY2')`);
      } else if (norm.includes('RAPIDE') || norm.includes('SERV')) {
        teamClauses.push(`(UPPER(COALESCE(team, '')) LIKE '%RAPIDE%' OR UPPER(COALESCE(team, '')) LIKE '%SERV%')`);
      } else if (norm.includes('LOURD')) {
        teamClauses.push(`UPPER(COALESCE(team, '')) LIKE '%LOURD%'`);
      } else if (norm.includes('CARROSS')) {
        teamClauses.push(`UPPER(COALESCE(team, '')) LIKE '%CARROSS%'`);
      } else if (norm.includes('ELECT') || norm.includes('ELICT')) {
        teamClauses.push(`(UPPER(COALESCE(team, '')) LIKE '%ELECT%' OR UPPER(COALESCE(team, '')) LIKE '%ELICT%')`);
      } else if (norm.includes('CHANGAN')) {
        teamClauses.push(`UPPER(COALESCE(team, '')) LIKE '%CHANGAN%'`);
      } else {
        params.push(t);
        teamClauses.push(`UPPER(COALESCE(team, '')) = UPPER($${params.length})`);
      }
    }
    if (teamClauses.length > 0) {
      accessFilters.push(`(${teamClauses.join(' OR ')})`);
    }
  }
  const accessClause = accessFilters.length ? `AND ${accessFilters.join(' AND ')}` : '';
  let found = await pool.query(
    `SELECT id, record_type, record_key, team, status, location, payload FROM vehicles
     WHERE (
       ($1 <> '' AND (no_or = $1 OR UPPER(TRIM(no_or)) = UPPER(TRIM($1)) OR record_key = $1 OR payload->>'numeroOR' = $1 OR payload->>'noOr' = $1 OR payload->>'no' = $1 OR payload->>'or' = $1 OR UPPER(TRIM(payload->>'or')) = UPPER(TRIM($1)) OR UPPER(TRIM(payload->>'noOr')) = UPPER(TRIM($1))))
       OR ($5 <> '' AND (no_or = $5 OR UPPER(TRIM(no_or)) = UPPER(TRIM($5)) OR record_key = $5 OR payload->>'noOr' = $5 OR payload->>'numeroOR' = $5 OR payload->>'no' = $5 OR payload->>'or' = $5))
       OR ($4 <> '' AND (record_key = $4 OR payload->>'id' = $4 OR id::text = $4 OR payload->>'recordKey' = $4))
       OR ($7 <> '' AND (id::text = $7 OR payload->>'id' = $7 OR record_key = $7))
       OR ($3 <> '' AND (payload->>'sheetRowNumber' = $3 OR payload->>'rowNumber' = $3))
       -- Le châssis seul ne sert de filtre QUE si aucun N° OR ni identifiant précis n'est spécifié
       OR ($1 = '' AND $4 = '' AND $5 = '' AND $7 = '' AND $2 <> '' AND (chassis = $2 OR UPPER(chassis) = UPPER($2) OR UPPER(payload->>'vin') = UPPER($2) OR UPPER(payload->>'chassis') = UPPER($2) OR REPLACE(UPPER(COALESCE(chassis,'')), ' ', '') = REPLACE(UPPER($2), ' ', '') OR REPLACE(UPPER(COALESCE(payload->>'vin','')), ' ', '') = REPLACE(UPPER($2), ' ', '')))
       OR ($1 = '' AND $4 = '' AND $5 = '' AND $7 = '' AND $6 <> '' AND (chassis = $6 OR UPPER(chassis) = UPPER($6) OR UPPER(payload->>'vin') = UPPER($6) OR UPPER(payload->>'chassis') = UPPER($6) OR REPLACE(UPPER(COALESCE(chassis,'')), ' ', '') = REPLACE(UPPER($6), ' ', '') OR REPLACE(UPPER(COALESCE(payload->>'vin','')), ' ', '') = REPLACE(UPPER($6), ' ', '')))
     )
     ${accessClause}
     ORDER BY updated_at DESC, id DESC`,
    params,
  );
  // Quand un OR est connu, il est l'identifiant strict du dossier. Un châssis peut
  // légitimement apparaître dans plusieurs OR (retour ultérieur ou nouvelle entrée).
  // La mise à jour doit mettre à jour les enregistrements (flux et réception) liés à cet OR.
  const effectiveOr = noOr || origNo;
  if (effectiveOr) {
    const normalizedOr = effectiveOr.toUpperCase();
    const rows = found.rows.filter((row) => {
      const rowOr = String(
        row.no_or || row.payload?.noOr || row.payload?.numeroOR || row.payload?.no || row.payload?.or || ''
      ).trim().toUpperCase();
      return rowOr === normalizedOr;
    });
    if (rows.length > 0) {
      if (recordKey || targetId) {
        const exactKey = recordKey || targetId;
        const sub = rows.filter((row) => {
          const rKey = String(row.record_key || '');
          const pKey = String(row.payload?.recordKey || '');
          const pId = String(row.payload?.id || '');
          const rowId = String(row.id || '');
          return rKey === exactKey || pKey === exactKey || pId === exactKey || rowId === exactKey
            || (exactKey && (rKey.endsWith(`_${exactKey}`) || pKey.endsWith(`_${exactKey}`)))
            || (exactKey.includes('_') && (rKey === exactKey.split('_').slice(1).join('_') || pId === exactKey.split('_').slice(1).join('_')));
        });
        found = { ...found, rows: sub.length > 0 ? sub : rows, rowCount: sub.length > 0 ? sub.length : rows.length };
      } else {
        found = { ...found, rows, rowCount: rows.length };
      }
    }
  } else if (recordKey || targetId) {
    const exactKey = recordKey || targetId;
    const rows = found.rows.filter((row) => {
      const rKey = String(row.record_key || '');
      const pKey = String(row.payload?.recordKey || '');
      const pId = String(row.payload?.id || '');
      const rowId = String(row.id || '');
      return rKey === exactKey || pKey === exactKey || pId === exactKey || rowId === exactKey
        || (exactKey && (rKey.endsWith(`_${exactKey}`) || pKey.endsWith(`_${exactKey}`)));
    });
    found = { ...found, rows, rowCount: rows.length };
  }
  if (!found.rowCount) return false;

  // Contrôle de non-chevauchement des emplacements atelier
  if (updates.emplacement !== undefined && isExclusiveWorkshopLocation(updates.emplacement)) {
    const locationKey = String(updates.emplacement).trim().toUpperCase().replace(/\s+/g, '');
    const targetIds = found.rows.map((row) => row.id);
    const occupied = await pool.query(
      `SELECT no_or, chassis FROM vehicles
       WHERE UPPER(REGEXP_REPLACE(COALESCE(NULLIF(location, ''), payload->>'emplacement', ''), '\\s+', '', 'g')) = $1
         AND NOT (id = ANY($2::bigint[]))
         -- Flux et Réception sont deux lignes du même véhicule : elles ne
         -- doivent jamais déclencher un faux conflit d'emplacement.
         AND NOT (
           ($3 <> '' AND (no_or = $3 OR payload->>'noOr' = $3 OR payload->>'numeroOR' = $3 OR payload->>'no' = $3))
           OR ($4 <> '' AND (UPPER(chassis) = UPPER($4) OR UPPER(payload->>'vin') = UPPER($4) OR UPPER(payload->>'chassis') = UPPER($4)))
           OR ($5 <> '' AND (no_or = $5 OR payload->>'noOr' = $5 OR payload->>'numeroOR' = $5 OR payload->>'no' = $5))
           OR ($6 <> '' AND (UPPER(chassis) = UPPER($6) OR UPPER(payload->>'vin') = UPPER($6) OR UPPER(payload->>'chassis') = UPPER($6)))
         )
         AND LOWER(COALESCE(status, payload->>'etatIntervention', payload->>'etat', '')) NOT LIKE '%livr%'
       LIMIT 1`,
      [locationKey, targetIds, noOr, chassis, origNo, origChassis],
    );
    if (occupied.rowCount) {
      const isAttente = String(updates.etat || updates.etatIntervention || '').toLowerCase().includes('attente')
        || locationKey.startsWith('P');
      const isStartingWork =
        String(updates.etat || updates.etatIntervention || '').toLowerCase().includes('en cours') ||
        String(updates.avancement || '').toLowerCase().startsWith('en cours');
      if (isAttente || isStartingWork) {
        // Lors d'une prise en charge, ne jamais bloquer le véhicule sur une
        // ancienne place occupée : choisir la prochaine place libre de son
        // équipe, puis un emplacement de parking en dernier recours.
        const allOccupied = await pool.query(
          `SELECT DISTINCT UPPER(REGEXP_REPLACE(COALESCE(NULLIF(location, ''), payload->>'emplacement', ''), '\\s+', '', 'g')) AS loc
           FROM vehicles
           WHERE location IS NOT NULL AND location <> ''
             AND LOWER(COALESCE(status, payload->>'etatIntervention', payload->>'etat', '')) NOT LIKE '%livr%'`
        );
        const occupiedSet = new Set(allOccupied.rows.map((r) => r.loc));
        let freePlace = 'Place complet';
        const team = String(
          updates.equipe || found.rows[0]?.team || found.rows[0]?.payload?.equipe || ''
        ).toLowerCase();
        const teamPlaces = team.includes('lourd')
          ? ['T1', 'T2', 'T3', 'T4', 'T11', 'T12', 'T21', 'T22', 'T31', 'T32', 'T41', 'T42', 'M11', 'M21', 'M12']
          : team.includes('rapide') || team.includes('serv')
            ? ['S21', 'S11', 'S22']
            : team.includes('carross')
              ? ['C1', 'C2', 'C3']
              : team.includes('elect') || team.includes('elict')
                ? ['E1', 'E2', 'E11', 'E12', 'E21', 'E22']
                : team.includes('changan')
                  ? ['J11', 'J12', 'J21', 'J22', 'J31', 'J32', 'J41', 'J42', 'J51', 'J52', 'J61', 'J62']
                  : ['D510', 'D520', 'D610', 'D620', 'D710', 'D720', 'D810', 'D820', 'D511', 'D512', 'D521', 'D522', 'D611', 'D612', 'D621', 'D622', 'D711', 'D712', 'D721', 'D722', 'D811', 'D812', 'D821', 'D822'];
        if (isStartingWork) {
          freePlace = teamPlaces.find((place) => !occupiedSet.has(place)) || freePlace;
        }
        if (freePlace === 'Place complet') {
          for (let i = 1; i <= 76; i++) {
            const p = `P${i}`;
            if (!occupiedSet.has(p)) {
              freePlace = p;
              break;
            }
          }
        }
        updates.emplacement = freePlace;
      } else {
        const vehicle = occupied.rows[0];
        const error = new Error(`L'emplacement ${updates.emplacement} est déjà occupé par le véhicule ${vehicle.no_or || vehicle.chassis || ''}.`);
        error.statusCode = 409;
        throw error;
      }
    }
  }
  for (const current of found.rows) {
    const payload = { ...current.payload, ...updates };
    const workState = String(updates.etat || updates.etatIntervention || updates.statut || updates.avancement || '').toLowerCase();
    const startsWork = workState.includes('en cours') || /\d+\s*%/.test(workState);
    const existingWorkStart = String(
      current.payload?.dateDebutTravail || current.payload?.dateDebutRep || ''
    ).trim();

    // Le premier passage « En cours » définit le départ de la chronométrie.
    // Les changements 20 %, 30 %… doivent garder cette référence, même si le
    // navigateur ou une autre session transmet une nouvelle date.
    if (startsWork && existingWorkStart) {
      payload.dateDebutRep = current.payload?.dateDebutRep || existingWorkStart;
      payload.dateDebutTravail = current.payload?.dateDebutTravail || existingWorkStart;
      payload.heureDebutTravail = current.payload?.heureDebutTravail || String(existingWorkStart.split(' ')[1] || '');
    }
    if (updates.etat !== undefined) {
      payload.etat = updates.etat;
      payload.etatIntervention = updates.etat;
      payload.statut = updates.etat;
    }
    if (updates.etatIntervention !== undefined) {
      payload.etat = updates.etatIntervention;
      payload.etatIntervention = updates.etatIntervention;
      payload.statut = updates.etatIntervention;
    }
    if (updates.emplacement !== undefined) payload.emplacement = updates.emplacement;
    if (updates.technicien !== undefined) payload.technicien = updates.technicien;
    if (updates.nomTechnicien !== undefined) payload.nomTechnicien = updates.nomTechnicien;
    if (updates.equipe !== undefined) payload.equipe = sanitizeSingleTeam(updates.equipe, current.payload?.equipe || current.team || 'Daily1');
    if (updates.avancement !== undefined) payload.avancement = updates.avancement;
    await saveVehicleRecord(pool, current.record_type, payload, current.record_key);
  }
  return true;
}

function isTeamMatch(vehicleTeam, targetTeam) {
  if (!targetTeam) return true;
  const cleanTarget = String(targetTeam).trim();
  if (cleanTarget.toLowerCase() === 'toutes' || cleanTarget.toLowerCase() === 'all') return true;
  if (cleanTarget.includes(',')) {
    return cleanTarget.split(',').map((t) => t.trim()).filter(Boolean).some((t) => isTeamMatch(vehicleTeam, t));
  }
  const vNorm = String(vehicleTeam || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const tNorm = cleanTarget.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!vNorm || vNorm === '-' || vNorm === 'na') return true;
  if (vNorm.includes('daily')) return tNorm.includes('daily');
  if (vNorm.includes('rapide') || vNorm.includes('serv')) return tNorm.includes('rapide') || tNorm.includes('serv');
  if (vNorm.includes('lourd')) return tNorm.includes('lourd');
  if (vNorm.includes('carross')) return tNorm.includes('carross');
  if (vNorm.includes('elect') || vNorm.includes('elict')) return tNorm.includes('elect') || tNorm.includes('elict');
  if (vNorm.includes('changan')) return tNorm.includes('changan');
  return vNorm === tNorm;
}

async function enrichVehiclesWithInventory(records) {
  if (!records || !records.length) return records;
  const vinSet = new Set();
  const regSet = new Set();
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    const vin = String(r.chassis || r.vin || '').toUpperCase().replace(/\s+/g, '');
    if (vin) vinSet.add(vin);
    const reg = String(r.immatriculation || r.serie || '').toUpperCase().replace(/\s+/g, '');
    if (reg && reg !== '-') regSet.add(reg);
  }
  const vinList = Array.from(vinSet);
  const regList = Array.from(regSet);
  if (!vinList.length && !regList.length) return records;

  try {
    const invRes = await pool.query(
      `SELECT vin_key, customer_name, registration, brand_code, model_code, model_description, raw_data
       FROM vehicle_inventory
       WHERE (vin_key = ANY($1) OR UPPER(BTRIM(vin)) = ANY($1))
          OR (registration IS NOT NULL AND BTRIM(registration) <> '' AND UPPER(REPLACE(registration, ' ', '')) = ANY($2))`,
      [vinList, regList]
    );

    const invByVin = new Map();
    const invByReg = new Map();
    for (const inv of invRes.rows) {
      if (inv.vin_key) invByVin.set(inv.vin_key, inv);
      if (inv.registration) {
        const cleanReg = String(inv.registration).toUpperCase().replace(/\s+/g, '');
        if (cleanReg) invByReg.set(cleanReg, inv);
      }
    }

    for (const r of records) {
      if (!r || typeof r !== 'object') continue;
      const cleanVin = String(r.chassis || r.vin || '').toUpperCase().replace(/\s+/g, '');
      const cleanReg = String(r.immatriculation || r.serie || '').toUpperCase().replace(/\s+/g, '');
      const inv = invByVin.get(cleanVin) || (cleanReg ? invByReg.get(cleanReg) : null);
      if (inv) {
        const invClient = String(inv.customer_name || inv.raw_data?.['Nom du client'] || inv.raw_data?.['Nom client'] || '').trim();
        const currentClient = String(r.client || r.nomClient || '').trim();
        const isClientMissing = !currentClient || currentClient === '-' || currentClient.toLowerCase().includes('non renseign') || currentClient.toLowerCase().includes('non spécifi');
        if (invClient && isClientMissing) {
          r.client = invClient;
          r.nomClient = invClient;
        }
        if (inv.registration && (!r.immatriculation || r.immatriculation === '-')) {
          r.immatriculation = inv.registration;
        }
        if (inv.brand_code && (!r.marque || r.marque === '-')) {
          r.marque = inv.brand_code;
        }
        const modelVal = inv.model_code || inv.model_description || inv.raw_data?.['Code modèle'];
        if (modelVal && (!r.modele || r.modele === '-')) {
          r.modele = modelVal;
        }
      }
    }
  } catch (err) {
    console.warn("Erreur enrichVehiclesWithInventory:", err);
  }

  return records;
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
  const receptionRoles = new Set([...managementRoles, 'reception', 'garantie']);
  const workshopRoles = new Set([...managementRoles, 'chef_equipe']);
  const facturationRoles = new Set([...managementRoles, 'facturation']);
  const managementActions = new Set(['getComptes', 'sauvegarderEquipes', 'updateMoyennesPeriode']);
  const receptionActions = new Set(['ajouterEntree', 'updateStatutDevis', 'livrerVehicule', 'traiterRetourReouvert', 'updateStatutGarantie', 'supprimerDossierGarantie']);
  const workshopActions = new Set(['updateEmplacement', 'updateEtat', 'updateTechnicien', 'updateAvancement', 'synchroniserEntrees', 'repararValidations', 'accepterEntreeChefEquipe']);
  const facturationActions = new Set(['validerFacturation', 'marquerFacture']);
  const managementOnlyActions = new Set(['ajouterVin', 'modifierVin', 'ajouterEntreeHistorique', 'updateStatutAchat', 'modifierEntree', 'supprimerEntree']);
  // La réouverture d'un OR livré ou d'une facture est volontairement plus restrictive que les
  // autres actions de direction : seule l'Administration peut la déclencher.
  const administrationOnlyActions = new Set(['reouvrirOR', 'reouvrirFacturation']);

  const customPermissions = typeof account.custom_permissions === 'object' && account.custom_permissions !== null
    ? account.custom_permissions
    : (typeof account.custom_permissions === 'string' ? (JSON.parse(account.custom_permissions || '{}')) : {});

  const hasReceptionPerm = Boolean(customPermissions.canAddEntree || customPermissions.canViewDevis);
  const hasWorkshopPerm = Boolean(customPermissions.canEditAvancement || customPermissions.canEditEtat || customPermissions.canEditEmplacement || customPermissions.canEditChargement);
  const hasFacturationPerm = Boolean(customPermissions.canViewFacturation);
  const hasAchatPerm = Boolean(customPermissions.canViewAttenteAchat);

  if (managementActions.has(action) && !managementRoles.has(account.role)) {
    if (action === 'sauvegarderEquipes' && customPermissions.canManageEquipes) {
      // Autorisé grâce aux droits de gestion d'équipe
    } else {
      return sendActionResult(res, { ok: false, error: 'Action réservée à la direction atelier.' });
    }
  }
  if (receptionActions.has(action) && !receptionRoles.has(account.role) && !hasReceptionPerm) {
    return sendActionResult(res, { ok: false, error: 'Action réservée à la réception et à la direction atelier.' });
  }
  if (workshopActions.has(action) && !workshopRoles.has(account.role) && !hasWorkshopPerm) {
    if (action === 'updateEtat' && (account.role === 'reception' || account.role === 'garantie' || hasReceptionPerm)) {
      const targetEtat = String(query.get('etat') || query.get('etatIntervention') || '');
      if (targetEtat === 'Livré' || targetEtat === 'Attente Réparation' || targetEtat === 'Attente Client') {
        // Autorisé pour la réception afin de livrer le véhicule ou appliquer une transition devis
      } else {
        return sendActionResult(res, { ok: false, error: 'Action réservée aux équipes atelier.' });
      }
    } else if (action === 'updateAvancement' && (account.role === 'reception' || account.role === 'garantie' || hasReceptionPerm)) {
      const targetAv = String(query.get('avancement') || query.get('nouveauStatut') || '');
      const targetNorm = targetAv.toLowerCase().trim();
      if (
        targetNorm === 'accepter accord' ||
        targetNorm === 'accord accepté' ||
        targetNorm === 'accord accepte' ||
        targetNorm === 'terminer' ||
        targetNorm.includes('accord') ||
        targetNorm.includes('devis')
      ) {
        // Autorisé pour la réception lors de la décision devis (accord client ou refus)
      } else {
        return sendActionResult(res, { ok: false, error: 'Action réservée aux équipes atelier.' });
      }
    } else if (action === 'updateTechnicien' && (account.role === 'reception' || account.role === 'garantie' || hasReceptionPerm)) {
      // Autorisé pour la réception pour réaffecter ou confirmer le technicien lors de l'accord devis
    } else {
      return sendActionResult(res, { ok: false, error: 'Action réservée aux équipes atelier.' });
    }
  }
  if (facturationActions.has(action) && !facturationRoles.has(account.role) && !hasFacturationPerm) {
    return sendActionResult(res, { ok: false, error: 'Action réservée au service Facturation et à la direction.' });
  }
  if (managementOnlyActions.has(action) && !managementRoles.has(account.role)) {
    if (action === 'updateStatutAchat' && hasAchatPerm) {
      // Autorisé grâce aux droits PDR
    } else {
      return sendActionResult(res, { ok: false, error: 'Action réservée à la direction atelier.' });
    }
  }
  if (administrationOnlyActions.has(action) && account.role !== 'administration') {
    return sendActionResult(res, { ok: false, error: 'La réouverture d’un OR est réservée à l’Administration.' });
  }
  const allowedTeam = ['chef_equipe', 'chef_atelier'].includes(account.role)
    && workshopActions.has(action)
    ? await resolveAccountTeam(account)
    : '';
  if (account.role === 'chef_equipe' && workshopActions.has(action) && !allowedTeam) {
    return sendActionResult(res, { ok: false, error: 'Aucune équipe n’est affectée à ce compte.' });
  }

  if (action === 'getComptes') {
    const rows = await pool.query('SELECT id, name, email, role, assigned_team, custom_permissions FROM accounts ORDER BY name');
    return sendActionResult(res, { ok: true, comptes: rows.rows.map(cleanAccount) });
  }
  if (action === 'synchroniserEntrees' || action === 'repararValidations') {
    return sendActionResult(res, { ok: true, message: 'Synchronisation SQL terminée.' });
  }
  // ══ reouvrirOR : archive l'intervention livrée et crée un nouveau cycle à la Réception.
  // Les lignes originales ne sont jamais modifiées : elles restent l'historique de l'intervention 1.
  if (action === 'reouvrirOR') {
    const noOr = text('noOr', text('no'));
    const chassis = text('chassis').toUpperCase();
    if (!noOr && !chassis) return sendActionResult(res, { ok: false, error: 'OR ou châssis requis pour réouvrir le dossier.' });
    const sourceResult = await pool.query(
      `SELECT record_key, payload FROM vehicles
       WHERE (($1 <> '' AND (no_or = $1 OR payload->>'noOr' = $1 OR payload->>'numeroOR' = $1))
          OR ($2 <> '' AND (UPPER(chassis) = $2 OR UPPER(payload->>'chassis') = $2 OR UPPER(payload->>'vin') = $2)))
         AND (LOWER(COALESCE(status, payload->>'etat', payload->>'etatIntervention', '')) LIKE '%livr%'
           OR LOWER(COALESCE(advancement, payload->>'avancement', '')) LIKE '%livr%')
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [noOr, chassis],
    );
    if (!sourceResult.rowCount) return sendActionResult(res, { ok: false, error: 'Seul un OR déjà livré ou clôturé peut être réouvert.' });

    const source = sourceResult.rows[0].payload || {};
    const countResult = await pool.query(
      `SELECT COALESCE(MAX(CASE
         WHEN COALESCE(payload->>'interventionNumero', '') ~ '^\\d+$'
         THEN (payload->>'interventionNumero')::int
         ELSE 1 END), 1)::int AS maximum FROM vehicles
       WHERE payload->>'orOrigine' = $1 OR payload->>'noOr' = $1 OR no_or = $1`,
      [noOr || String(source.noOr || source.numeroOR || '')],
    );
    const interventionNumero = Math.max(2, Number(countResult.rows[0]?.maximum || 1) + 1);
    const now = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const returnKey = `retour-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const effectiveOr = noOr || String(source.noOr || source.numeroOR || source.no || '');
    const effectiveChassis = chassis || String(source.chassis || source.vin || '').toUpperCase();
    const reopened = {
      ...source,
      id: returnKey,
      recordKey: returnKey,
      noOr: effectiveOr,
      no: effectiveOr,
      numeroOR: effectiveOr,
      chassis: effectiveChassis,
      vin: effectiveChassis,
      orOrigine: effectiveOr,
      interventionId: `${effectiveOr || effectiveChassis}-I${interventionNumero}`,
      interventionNumero,
      interventionPrecedente: source.interventionId || source.recordKey || sourceResult.rows[0].record_key,
      retourVehicule: true,
      statutRetour: 'a_receptionner',
      etat: 'Retour véhicule – À réceptionner',
      etatIntervention: 'Retour véhicule – À réceptionner',
      statut: 'Retour véhicule – À réceptionner',
      avancement: 'En attente réception',
      equipe: '-',
      technicien: '-',
      nomTechnicien: '',
      emplacement: 'NA',
      dateRetour: now,
      dateEntree: now,
      dateEntreeHeure: now,
      reouvertLe: now,
      reouvertPar: account.name || account.email || 'Administration',
      descriptionRetour: '',
      dateLivraisonClient: '',
      livrePar: '',
      modePaiement: '',
      statutFacturation: '',
      statutFacturationFinale: '',
    };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await saveVehicleRecord(client, 'reception', reopened, returnKey);
      await saveVehicleRecord(client, 'flux', reopened, returnKey);
      await client.query(
        `INSERT INTO app_records (collection, record_key, vehicle_key, payload)
         VALUES ('intervention_history', $1, $2, $3::jsonb)
         ON CONFLICT (collection, record_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [returnKey, effectiveOr || effectiveChassis, JSON.stringify({
          type: 'reouverture', noOr: effectiveOr, chassis: effectiveChassis, interventionId: reopened.interventionId,
          interventionNumero, dateRetour: now, reouvertPar: reopened.reouvertPar, interventionPrecedente: reopened.interventionPrecedente,
        })],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return sendActionResult(res, { ok: true, recordKey: returnKey, message: `OR ${effectiveOr} réouvert : intervention ${interventionNumero} envoyée à la Réception.` });
  }

  // ══ reouvrirFacturation : réservé exclusivement à l'Administration
  // Permet de réouvrir une facture (remettre en attente de paiement) ou de modifier le mode de paiement (Facture / BC / Att Facture)
  if (action === 'reouvrirFacturation') {
    const actionType = text('actionType', 'reopen'); // 'reopen' | 'modify'
    const noOr = text('noOr', text('or', text('no')));
    const chassis = text('chassis', text('vin')).toUpperCase();
    const modifiePar = text('modifiePar', account.name || account.email || 'Administration');
    const nowFr = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    if (actionType === 'reopen') {
      const updateObj = {
        modePaiement: null,
        statutFacturation: 'en_attente',
        statutFacturationFinale: 'non_facture',
        dateValidationFacturation: null,
        facturationValideePar: null,
        numeroFacture: null,
        numeroBC: null,
        numeroEdition: null,
        attFactureOption: null,
        nomGarant: null,
        engagementReglement: null,
        commentaireFacturation: `Facture réouverte par ${modifiePar} le ${nowFr}`,
      };

      await updateVehicleBySelectors(query, updateObj);

      // Mettre à jour app_records (facturation_notifications)
      const notifs = await pool.query(
        `SELECT collection, record_key, payload FROM app_records
         WHERE collection = 'facturation_notifications'
           AND (($1 <> '' AND (record_key LIKE '%' || $1 || '%' OR payload->>'noOr' = $1 OR payload->>'or' = $1))
            OR ($1 = '' AND $2 <> '' AND (record_key LIKE '%' || $2 || '%' OR payload->>'chassis' = $2 OR payload->>'vin' = $2)))`,
        [noOr, chassis]
      );
      for (const row of notifs.rows) {
        const updatedNotif = {
          ...row.payload,
          statutPaiement: 'en_attente',
          modePaiement: undefined,
          statutFacturationFinale: 'non_facture',
          numeroFacture: undefined,
          numeroBC: undefined,
          numeroEdition: undefined,
          attFactureOption: undefined,
          nomGarant: undefined,
          engagementReglement: undefined,
          dateDecision: undefined,
          decisionPar: undefined,
          dateReouverture: nowFr,
          reouvertPar: modifiePar,
        };
        await pool.query(
          `UPDATE app_records SET payload = $1::jsonb, updated_at = NOW() WHERE collection = $2 AND record_key = $3`,
          [JSON.stringify(updatedNotif), row.collection, row.record_key]
        );
      }

      return sendActionResult(res, {
        ok: true,
        message: `Facture du dossier ${noOr || chassis} réouverte avec succès par l'Administration (remise en attente de paiement).`
      });
    }

    if (actionType === 'modify') {
      const modePaiement = text('modePaiement');
      if (!FACTURATION_PAYMENT_MODES.has(modePaiement)) {
        return sendActionResult(res, { ok: false, error: 'Mode de paiement invalide.' });
      }
      const isAttFacture = ATT_FACTURE_PAYMENT_MODES.has(modePaiement);
      const attFactureOption = text('attFactureOption', 'standard') || 'standard';
      const nomGarant = text('nomGarant');
      const engagementReglement = text('engagementReglement');
      const numeroFacture = text('numeroFacture');
      const numeroBC = text('numeroBC');
      const numeroEdition = text('numeroEdition');
      const commentaire = text('commentaire');

      if (isAttFacture && !ATT_FACTURE_OPTIONS.has(attFactureOption)) {
        return sendActionResult(res, { ok: false, error: 'Option Att Facture invalide.' });
      }
      if (isAttFacture && attFactureOption === 'garant') {
        if (!nomGarant || !engagementReglement) {
          return sendActionResult(res, { ok: false, error: 'Le nom du garant et son engagement de règlement sont requis.' });
        }
      }

      const statutFacturation = isAttFacture
        ? 'edition_fin_travaux'
        : (modePaiement === 'Bon de commande' ? 'bon_commande' : 'facture');
      const statutFacturationFinale = isAttFacture ? 'non_facture' : 'facture';

      const updateObj = {
        modePaiement,
        statutFacturation,
        statutFacturationFinale,
        dateValidationFacturation: nowFr,
        facturationValideePar: modifiePar,
        numeroFacture: numeroFacture || null,
        numeroBC: numeroBC || null,
        numeroEdition: numeroEdition || null,
        attFactureOption: isAttFacture ? attFactureOption : null,
        nomGarant: isAttFacture && attFactureOption === 'garant' ? nomGarant : null,
        engagementReglement: isAttFacture && attFactureOption === 'garant' ? engagementReglement : null,
        ...(commentaire ? { commentaireFacturation: commentaire } : {}),
      };

      await updateVehicleBySelectors(query, updateObj);

      // Mettre à jour app_records
      const notifs = await pool.query(
        `SELECT collection, record_key, payload FROM app_records
         WHERE collection = 'facturation_notifications'
           AND (($1 <> '' AND (record_key LIKE '%' || $1 || '%' OR payload->>'noOr' = $1 OR payload->>'or' = $1))
            OR ($1 = '' AND $2 <> '' AND (record_key LIKE '%' || $2 || '%' OR payload->>'chassis' = $2 OR payload->>'vin' = $2)))`,
        [noOr, chassis]
      );
      for (const row of notifs.rows) {
        const updatedNotif = {
          ...row.payload,
          statutPaiement: statutFacturation,
          modePaiement,
          statutFacturationFinale,
          dateDecision: nowFr,
          decisionPar: modifiePar,
          numeroFacture: numeroFacture || undefined,
          numeroBC: numeroBC || undefined,
          numeroEdition: numeroEdition || undefined,
          attFactureOption: isAttFacture ? attFactureOption : undefined,
          nomGarant: isAttFacture && attFactureOption === 'garant' ? nomGarant : undefined,
          engagementReglement: isAttFacture && attFactureOption === 'garant' ? engagementReglement : undefined,
          ...(commentaire ? { commentaireFacturation: commentaire } : {}),
        };
        await pool.query(
          `UPDATE app_records SET payload = $1::jsonb, updated_at = NOW() WHERE collection = $2 AND record_key = $3`,
          [JSON.stringify(updatedNotif), row.collection, row.record_key]
        );
      }

      return sendActionResult(res, {
        ok: true,
        message: `Mode de paiement du dossier ${noOr || chassis} modifié vers [${modePaiement}] par l'Administration.`
      });
    }

    return sendActionResult(res, { ok: false, error: 'Type d’action invalide.' });
  }

  // ══ traiterRetourReouvert : la Réception décrit le retour puis l'envoie à l'équipe.
  if (action === 'traiterRetourReouvert') {
    const recordKey = text('recordKey');
    const descriptionRetour = text('descriptionRetour');
    const equipe = text('equipe');
    if (!recordKey || !descriptionRetour || !equipe) {
      return sendActionResult(res, { ok: false, error: 'La description du retour et l’équipe sont obligatoires.' });
    }
    const now = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const updates = {
      equipe,
      etat: 'Attente réparation',
      etatIntervention: 'Attente réparation',
      statut: 'Attente réparation',
      avancement: 'Attente réparation',
      statutRetour: 'envoye_equipe',
      descriptionRetour,
      dateEnvoiEquipe: now,
      receptionRetourPar: account.name || account.email || 'Réception',
      emplacement: 'NA',
    };
    const updatedReception = await updateVehicleBySelectors(query, updates, 'reception', '');
    const updatedFlux = await updateVehicleBySelectors(query, updates, 'flux', '');
    if (!updatedReception && !updatedFlux) return sendActionResult(res, { ok: false, error: 'Intervention réouverte introuvable.' });
    return sendActionResult(res, { ok: true, message: `Retour envoyé à l’équipe ${equipe}.` });
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
  if (action === 'ajouterEntree' || action === 'ajouterEntreeHistorique') {
    const isHistoricalEntry = action === 'ajouterEntreeHistorique';
    const noOr = text('noOr', text('no', text('numeroOR', text('or'))));
    const chassis = text('chassis', text('vin')).toUpperCase();
    const immatriculation = text('immatriculation', text('immat', '-'));
    const isReceptionOrGarantie = account.role === 'reception' || account.role === 'garantie';
    const assignedReceptionCs = isReceptionOrGarantie ? String(account.assigned_team || (account.role === 'garantie' ? 'R10' : '')).trim().toUpperCase() : '';
    if (isReceptionOrGarantie && !/^R\d+$/.test(assignedReceptionCs)) {
      return sendActionResult(res, { ok: false, error: 'Votre compte doit être lié à un Centre Service (ex. R10) avant de créer une entrée.' });
    }

    if (!noOr || noOr === '-') {
      return sendActionResult(res, { ok: false, error: 'Le N° OR est obligatoire.' });
    }
    if (!chassis || chassis === '-') {
      return sendActionResult(res, { ok: false, error: 'Le N° de Châssis (VIN) est obligatoire.' });
    }

    // 1. Contrôle d'unicité du N° OR : aucun autre dossier ne peut avoir ce même N° OR
    const duplicateOr = await pool.query(
      `SELECT id, no_or FROM vehicles
       WHERE (no_or = $1 OR payload->>'noOr' = $1 OR payload->>'numeroOR' = $1 OR payload->>'no' = $1)
       LIMIT 1`,
      [noOr],
    );
    if (duplicateOr.rowCount) {
      const error = new Error(`Le N° OR « ${noOr} » existe déjà. Un nouvel Ordre de Réparation doit obligatoirement avoir un numéro unique.`);
      error.statusCode = 409;
      throw error;
    }

    // 2. Châssis existant : chercher d'abord dans vehicle_inventory (Parc véhicules & engins), puis dans vehicles
    const invRes = await pool.query(
      `SELECT customer_name, customer_code, registration, brand_code, model_code, model_description, raw_data
       FROM vehicle_inventory
       WHERE vin_key = UPPER(REPLACE($1, ' ', '')) OR UPPER(vin) = UPPER($1)
       LIMIT 1`,
      [chassis],
    );
    const invRow = invRes.rows[0];
    const invData = invRow?.raw_data || {};
    const invClient = invRow?.customer_name || invData['Nom du client'] || invData['Nom client'] || '';
    const invReg = invRow?.registration || invData['N° Immatriculation'] || '';
    const invBrand = invRow?.brand_code || invData['Code marque'] || '';
    const invModel = invRow?.model_code || invRow?.model_description || invData['Code modèle'] || '';

    const knownVehicle = await pool.query(
      `SELECT payload FROM vehicles WHERE (record_type = 'vin' OR record_type = 'reception') AND UPPER(chassis) = UPPER($1) ORDER BY id DESC LIMIT 1`,
      [chassis],
    );
    const fallbackData = knownVehicle.rows[0]?.payload || {};

    const newId = Date.now();
    const newRecordKey = `${noOr}_${newId}`;

    // 3. Emplacement automatique pour Attente Réparation
    let emplacement = text('emplacement');
    const occupiedRows = await pool.query(
      `SELECT DISTINCT UPPER(REGEXP_REPLACE(COALESCE(NULLIF(location, ''), payload->>'emplacement', ''), '\\s+', '', 'g')) AS loc
       FROM vehicles
       WHERE location IS NOT NULL AND location <> ''
         AND LOWER(COALESCE(status, payload->>'etatIntervention', payload->>'etat', '')) NOT LIKE '%livr%'`
    );
    const occupiedSet = new Set(occupiedRows.rows.map((r) => r.loc));

    const isEmpTaken = Boolean(emplacement && occupiedSet.has(emplacement.trim().toUpperCase().replace(/\s+/g, '')));
    if (!emplacement || emplacement === '-' || emplacement === 'NA' || isEmpTaken) {
      emplacement = 'Place complet';
      for (let i = 1; i <= 76; i++) {
        const candidate = `P${i}`;
        if (!occupiedSet.has(candidate)) {
          emplacement = candidate;
          break;
        }
      }
    }

    const defaultClient = invClient || fallbackData.nomClient || fallbackData.client || 'Client non renseigné';
    const formClient = text('nomClient', text('client'));
    const resolvedClient = formClient && formClient !== 'Client non renseigné' ? formClient : defaultClient;

    const resolvedEquipe = sanitizeSingleTeam(text('equipe', fallbackData.equipe || 'Daily'), 'Daily1');
    const resolvedImmat = immatriculation !== '-' ? immatriculation : (invReg || fallbackData.immatriculation || fallbackData.serie || '-');
    const resolvedMarque = isHistoricalEntry ? text('marque', invBrand || fallbackData.marque || 'IVECO') : (invBrand || fallbackData.marque || 'IVECO');
    const resolvedModele = isHistoricalEntry ? text('modele', invModel || fallbackData.modele || '-') : (invModel || fallbackData.modele || '-');
    const resolvedCategorie = isHistoricalEntry ? text('categorie', fallbackData.categorie || '-') : (fallbackData.categorie || '-');
    const resolvedDate = isHistoricalEntry && text('dateEntreeHeure') ? text('dateEntreeHeure') : new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const resolvedCodeClient = isHistoricalEntry ? text('codeClient', invRow?.customer_code || fallbackData.codeClient || '') : (invRow?.customer_code || fallbackData.codeClient || '');

    const reception = {
      id: newId,
      recordKey: newRecordKey,
      noOr,
      no: noOr,
      numeroOR: noOr,
      or: noOr,
      ordre: noOr,
      cs: assignedReceptionCs || text('cs', fallbackData.cs || 'R18'),
      chassis,
      vin: chassis,
      immatriculation: resolvedImmat,
      serie: resolvedImmat,
      codeClient: resolvedCodeClient,
      nomClient: resolvedClient,
      client: resolvedClient,
      dateEntreeHeure: resolvedDate,
      dateEntree: resolvedDate.split(' ')[0] || '',
      marque: resolvedMarque,
      modele: resolvedModele,
      modelePowerBI: resolvedModele,
      categorie: resolvedCategorie,
      equipe: resolvedEquipe,
      etat: 'Attente Réparation',
      statut: 'Attente Réparation',
      etatIntervention: 'Attente Réparation',
      avancement: 'Attente Réparation',
      emplacement,
      technicien: '-',
      nomTechnicien: '-',
      poste: '-',
      bloc: 1,
      statutAcceptation: 'en_attente',
      dateAcceptation: '',
      dateMiseEnAttente: '',
      dateDebutRep: '',
      dateDebutTravail: '',
      heureDebutTravail: '',
      dateFin: '',
      dateFinRep: '',
      dateLivraisonClient: '',
      livrePar: '',
      modePaiement: '',
      statutFacturation: '',
      statutFacturationFinale: '',
      facturationValideePar: '',
      dateValidationFacturation: '',
      numeroFacture: '',
      numeroBC: '',
      numeroEdition: '',
    };
    await saveVehicleRecord(pool, 'reception', reception, newRecordKey);

    const flux = {
      id: newId,
      recordKey: newRecordKey,
      ordre: noOr,
      no: noOr,
      numeroOR: noOr,
      or: noOr,
      chassis,
      vin: chassis,
      cs: reception.cs,
      date: reception.dateEntreeHeure.split(' ')[0] || '',
      dateEntree: reception.dateEntreeHeure.split(' ')[0] || '',
      dateEntreeHeure: reception.dateEntreeHeure,
      immatriculation: reception.immatriculation,
      serie: reception.immatriculation,
      marque: reception.marque,
      modele: reception.modele,
      modelePowerBI: reception.modele,
      categorie: reception.categorie,
      atelier: reception.categorie,
      operation: 'Entrée atelier',
      statut: 'Attente Réparation',
      etat: 'Attente Réparation',
      etatIntervention: 'Attente Réparation',
      montant: 0,
      temps: 0,
      nbIntervention: 1,
      client: reception.nomClient,
      nomClient: reception.nomClient,
      codeClient: reception.codeClient,
      equipe: reception.equipe,
      avancement: 'Attente Réparation',
      emplacement: reception.emplacement || '-',
      technicien: '-',
      nomTechnicien: '-',
      poste: '-',
      bloc: 1,
      statutAcceptation: 'en_attente',
      dateAcceptation: '',
      dateMiseEnAttente: '',
      dateDebutRep: '',
      dateDebutTravail: '',
      heureDebutTravail: '',
      dateFin: '',
      dateFinRep: '',
      dateLivraisonClient: '',
      livrePar: '',
      modePaiement: '',
      statutFacturation: '',
      statutFacturationFinale: '',
    };
    await saveVehicleRecord(pool, 'flux', flux, newRecordKey);
    return sendActionResult(res, { ok: true, message: 'Entrée enregistrée dans PostgreSQL.', recordKey: newRecordKey });
  }
  if (action === 'modifierEntree') {
    const noOr = text('noOr', text('no', text('numeroOR', text('or'))));
    const chassis = text('chassis', text('vin')).toUpperCase();
    const origNo = text('origNo', noOr);
    const origChassis = text('origChassis', chassis).toUpperCase();
    const newTeam = text('equipe');
    const newEtat = text('etat', 'Attente Réparation');
    const newEmplacement = text('emplacement');
    const newClient = text('nomClient', text('client', 'Client non renseigné'));
    const newCodeClient = text('codeClient');
    const newCs = text('cs');
    const newMarque = text('marque', 'IVECO');
    const newModele = text('modele', '-');
    const newCategorie = text('categorie', '-');
    const newDateEntreeHeure = text('dateEntreeHeure');
    const newImmat = text('immatriculation', text('immat', '-'));
    const targetId = text('id');
    const recordKey = text('recordKey');

    if (!noOr || noOr === '-') {
      return sendActionResult(res, { ok: false, error: 'Le N° OR est obligatoire. Un dossier ne peut pas être enregistré sans OR.' });
    }
    if (!chassis || chassis === '-') {
      return sendActionResult(res, { ok: false, error: 'Le N° de Châssis (VIN) est obligatoire.' });
    }

    // 1. Si le N° OR a été modifié, vérifier qu'il n'entre pas en conflit avec un AUTRE véhicule
    if (noOr && origNo && noOr.toUpperCase() !== origNo.toUpperCase()) {
      const duplicateOr = await pool.query(
        `SELECT id, no_or FROM vehicles
         WHERE (no_or = $1 OR UPPER(TRIM(no_or)) = UPPER(TRIM($1)) OR payload->>'noOr' = $1 OR payload->>'numeroOR' = $1 OR payload->>'no' = $1)
           AND NOT (no_or = $2 OR UPPER(TRIM(no_or)) = UPPER(TRIM($2)) OR payload->>'noOr' = $2 OR payload->>'numeroOR' = $2 OR payload->>'no' = $2)
         LIMIT 1`,
        [noOr, origNo],
      );
      if (duplicateOr.rowCount) {
        const error = new Error(`Le N° OR « ${noOr} » est déjà utilisé par un autre dossier.`);
        error.statusCode = 409;
        throw error;
      }
    }

    // 2. Récupérer toutes les lignes (reception ET flux) associées à ce véhicule
    const searchParams = [origNo, noOr, origChassis, chassis, recordKey, targetId];
    const found = await pool.query(
      `SELECT id, record_type, record_key, team, status, location, payload FROM vehicles
       WHERE (($1 <> '' AND (no_or = $1 OR UPPER(TRIM(no_or)) = UPPER(TRIM($1)) OR record_key = $1 OR payload->>'numeroOR' = $1 OR payload->>'noOr' = $1 OR payload->>'no' = $1 OR payload->>'or' = $1))
          OR ($2 <> '' AND (no_or = $2 OR UPPER(TRIM(no_or)) = UPPER(TRIM($2)) OR record_key = $2 OR payload->>'numeroOR' = $2 OR payload->>'noOr' = $2 OR payload->>'no' = $2 OR payload->>'or' = $2))
          OR ($3 <> '' AND (chassis = $3 OR UPPER(chassis) = UPPER($3) OR UPPER(payload->>'vin') = UPPER($3) OR UPPER(payload->>'chassis') = UPPER($3) OR REPLACE(UPPER(COALESCE(chassis,'')), ' ', '') = REPLACE(UPPER($3), ' ', '')))
          OR ($4 <> '' AND (chassis = $4 OR UPPER(chassis) = UPPER($4) OR UPPER(payload->>'vin') = UPPER($4) OR UPPER(payload->>'chassis') = UPPER($4) OR REPLACE(UPPER(COALESCE(chassis,'')), ' ', '') = REPLACE(UPPER($4), ' ', '')))
          OR ($5 <> '' AND (record_key = $5 OR payload->>'id' = $5 OR id::text = $5))
          OR ($6 <> '' AND (id::text = $6 OR payload->>'id' = $6 OR record_key = $6)))
       ORDER BY id`,
      searchParams,
    );

    let targetRows = found.rows;
    if (origNo || noOr) {
      const matchOr = (origNo || noOr).toUpperCase();
      const filtered = targetRows.filter((r) => {
        const rowOr = String(
          r.no_or || r.payload?.noOr || r.payload?.numeroOR || r.payload?.no || r.payload?.or || ''
        ).trim().toUpperCase();
        return rowOr === matchOr;
      });
      if (filtered.length > 0) targetRows = filtered;
    }

    if (!targetRows.length) {
      return sendActionResult(res, { ok: false, error: 'Dossier introuvable dans PostgreSQL.' });
    }

    // Détecter si l'équipe de destination a été modifiée
    const teamChanged = targetRows.some((r) => {
      const currentTeam = String(r.payload?.equipe || r.team || '').trim();
      return currentTeam && newTeam && currentTeam.toLowerCase() !== newTeam.toLowerCase();
    });

    let effectiveEmplacement = newEmplacement;
    if (effectiveEmplacement && isExclusiveWorkshopLocation(effectiveEmplacement)) {
      const locationKey = String(effectiveEmplacement).trim().toUpperCase().replace(/\s+/g, '');
      const targetIds = targetRows.map((r) => r.id);
      const occupied = await pool.query(
        `SELECT no_or, chassis FROM vehicles
         WHERE UPPER(REGEXP_REPLACE(COALESCE(NULLIF(location, ''), payload->>'emplacement', ''), '\\s+', '', 'g')) = $1
           AND NOT (id = ANY($2::bigint[]))
           AND LOWER(COALESCE(status, payload->>'etatIntervention', payload->>'etat', '')) NOT LIKE '%livr%'
         LIMIT 1`,
        [locationKey, targetIds],
      );
      if (occupied.rowCount) {
        const allOccupied = await pool.query(
          `SELECT DISTINCT UPPER(REGEXP_REPLACE(COALESCE(NULLIF(location, ''), payload->>'emplacement', ''), '\\s+', '', 'g')) AS loc
           FROM vehicles
           WHERE location IS NOT NULL AND location <> ''
             AND LOWER(COALESCE(status, payload->>'etatIntervention', payload->>'etat', '')) NOT LIKE '%livr%'`
        );
        const occupiedSet = new Set(allOccupied.rows.map((r) => r.loc));
        let freePlace = 'Place complet';
        for (let i = 1; i <= 76; i++) {
          const p = `P${i}`;
          if (!occupiedSet.has(p)) {
            freePlace = p;
            break;
          }
        }
        effectiveEmplacement = freePlace;
      }
    }

    for (const current of targetRows) {
      const currentPayload = current.payload || {};
      const updatedPayload = {
        ...currentPayload,
        noOr,
        no: noOr,
        numeroOR: noOr,
        or: noOr,
        ordre: noOr,
        chassis,
        vin: chassis,
        equipe: newTeam,
        atelier: newTeam,
        etat: newEtat,
        statut: newEtat,
        etatIntervention: newEtat,
        emplacement: effectiveEmplacement,
        client: newClient,
        nomClient: newClient,
        ...(newCodeClient ? { codeClient: newCodeClient } : {}),
        ...(newCs ? { cs: newCs } : {}),
        ...(newMarque ? { marque: newMarque } : {}),
        ...(newModele ? { modele: newModele, modelePowerBI: newModele } : {}),
        ...(newCategorie ? { categorie: newCategorie } : {}),
        ...(newDateEntreeHeure ? { dateEntreeHeure: newDateEntreeHeure, dateEntree: newDateEntreeHeure.split(' ')[0] || newDateEntreeHeure } : {}),
        ...(newImmat ? { immatriculation: newImmat, serie: newImmat } : {}),
      };

      // Si l'équipe a changé ou si l'état repasse en attente réparation :
      // On réinitialise complètement l'affectation pour que la nouvelle équipe puisse le prendre en charge
      if (teamChanged || newEtat.toLowerCase().includes('attente')) {
        updatedPayload.technicien = '';
        updatedPayload.nomTechnicien = '';
        updatedPayload.avancement = 'Attente Réparation';
        updatedPayload.statutAcceptation = 'en_attente';
        updatedPayload.dateAcceptation = '';
        updatedPayload.dateMiseEnAttente = '';
        updatedPayload.misEnAttentePar = '';
        updatedPayload.dateDebutRep = '';
        updatedPayload.dateDebutTravail = '';
        updatedPayload.heureDebutTravail = '';
        updatedPayload.dateFinRep = '';
        updatedPayload.dateFin = '';
        updatedPayload.bloc = 1;
        updatedPayload.equipe1 = newTeam;
        delete updatedPayload.equipe2;
        delete updatedPayload.equipe3;
        delete updatedPayload.avancement1;
        delete updatedPayload.avancement2;
        delete updatedPayload.dateTransfert;
      }

      await pool.query(
        `UPDATE vehicles
         SET no_or = $1, chassis = $2, team = $3, status = $4,
             advancement = $5, location = $6, payload = $7::jsonb, updated_at = NOW()
         WHERE id = $8`,
        [
          noOr,
          chassis,
          newTeam,
          newEtat,
          updatedPayload.avancement || null,
          effectiveEmplacement,
          JSON.stringify(updatedPayload),
          current.id,
        ],
      );
    }

    // Si une des collections (flux ou reception) manquait en base, l'insérer maintenant
    const hasFlux = targetRows.some((r) => r.record_type === 'flux');
    const hasReception = targetRows.some((r) => r.record_type === 'reception');
    const samplePayload = targetRows[0]?.payload || {};

    if (!hasFlux) {
      const fluxKey = recordKey || String(Date.now());
      await saveVehicleRecord(pool, 'flux', { ...samplePayload, recordKey: fluxKey }, fluxKey);
    }
    if (!hasReception) {
      const recKey = `${noOr}_${Date.now()}`;
      await saveVehicleRecord(pool, 'reception', { ...samplePayload, recordKey: recKey }, recKey);
    }

    // Si le dossier repasse en attente réparation ou change d'équipe :
    // Nettoyer les anciennes alertes de facturation et de transferts
    if (teamChanged || newEtat.toLowerCase().includes('attente')) {
      await pool.query(
        `DELETE FROM app_records
         WHERE collection = 'facturation_notifications'
           AND (($1 <> '' AND (record_key LIKE '%' || $1 || '%' OR payload->>'noOr' = $1 OR payload->>'or' = $1))
             OR ($1 = '' AND $2 <> '' AND (record_key LIKE '%' || $2 || '%' OR payload->>'chassis' = $2 OR payload->>'vin' = $2)))`,
        [noOr, chassis],
      );
      await pool.query(
        `DELETE FROM app_records
         WHERE collection = 'transfers'
           AND (($1 <> '' AND (record_key LIKE '%' || $1 || '%' OR payload->>'or' = $1))
             OR ($1 = '' AND $2 <> '' AND (payload->>'chassis' = $2)))`,
        [noOr, chassis],
      );
    } else {
      // Synchroniser notifications Facturation si existantes
      await pool.query(
        `UPDATE app_records
         SET payload = payload || jsonb_build_object('equipe', $1::text, 'client', $2::text, 'nomClient', $2::text, 'or', $3::text, 'noOr', $3::text, 'chassis', $4::text),
             updated_at = NOW()
         WHERE collection = 'facturation_notifications'
           AND (($3 <> '' AND (record_key LIKE '%' || $3 || '%' OR payload->>'noOr' = $3 OR payload->>'or' = $3))
             OR ($3 = '' AND $4 <> '' AND (record_key LIKE '%' || $4 || '%' OR payload->>'chassis' = $4 OR payload->>'vin' = $4)))`,
        [newTeam, newClient, noOr, chassis],
      );
    }

    // Synchroniser notifications Entrée si existantes
    await pool.query(
      `UPDATE app_records
       SET payload = payload || jsonb_build_object('equipe', $1::text, 'nomClient', $2::text, 'noOr', $3::text, 'chassis', $4::text),
           updated_at = NOW()
       WHERE collection = 'entree_notifications'
         AND (($3 <> '' AND (record_key LIKE '%' || $3 || '%' OR payload->>'noOr' = $3 OR payload->>'or' = $3))
           OR ($3 = '' AND $4 <> '' AND (record_key LIKE '%' || $4 || '%' OR payload->>'chassis' = $4 OR payload->>'vin' = $4)))`,
      [newTeam, newClient, noOr, chassis],
    );

    // Synchroniser vehicle_times si existant
    await pool.query(
      `UPDATE app_records
       SET payload = payload || jsonb_build_object('equipe', $1::text, 'client', $2::text, 'noOr', $3::text, 'chassis', $4::text),
           updated_at = NOW()
       WHERE collection = 'vehicle_times'
         AND (($3 <> '' AND (record_key LIKE '%' || $3 || '%' OR payload->>'noOr' = $3))
           OR ($3 = '' AND $4 <> '' AND (record_key LIKE '%' || $4 || '%' OR payload->>'chassis' = $4)))`,
      [newTeam, newClient, noOr, chassis],
    );

    return sendActionResult(res, { ok: true, message: 'Dossier modifié dans PostgreSQL.' });
  }
  if (action === 'supprimerEntree' || action === 'supprimerDossierGarantie') {
    const noOr = text('noOr', text('no', text('numeroOR', text('or'))));
    const chassis = text('chassis', text('vin')).toUpperCase();
    const id = text('id');
    const recordKey = text('recordKey');
    const immat = text('immatriculation', text('immat'));
    const warrantyOnly = action === 'supprimerDossierGarantie';
    const result = await pool.query(
      `DELETE FROM vehicles WHERE record_type IN ('flux', 'reception')
       AND (
         ($1 <> '' AND (no_or = $1 OR record_key = $1 OR payload->>'numeroOR' = $1 OR payload->>'noOr' = $1 OR payload->>'no' = $1 OR payload->>'or' = $1))
         OR ($1 = '' AND $3 <> '' AND (record_key = $3 OR payload->>'id' = $3 OR id::text = $3))
         OR ($1 = '' AND $4 <> '' AND (record_key = $4 OR payload->>'recordKey' = $4))
         OR ($1 = '' AND $3 = '' AND $4 = '' AND $2 <> '' AND (UPPER(chassis) = $2 OR UPPER(payload->>'vin') = $2))
         OR ($1 = '' AND $3 = '' AND $4 = '' AND $2 = '' AND $5 <> '' AND (payload->>'immatriculation' = $5 OR UPPER(payload->>'immat') = UPPER($5)))
       )
       AND ($6 = false OR UPPER(COALESCE(payload->>'cs', payload->>'centreService', '')) = 'R10'
         OR LOWER(COALESCE(payload->>'typeDossier', '')) LIKE '%garantie%'
         OR LOWER(COALESCE(payload->>'isGarantie', 'false')) = 'true')`,
      [noOr, chassis, id, recordKey, immat, warrantyOnly],
    );

    if (result.rowCount > 0) {
      await pool.query(
        `DELETE FROM app_records
         WHERE collection IN ('facturation_notifications', 'entree_notifications', 'devis_notifications')
           AND (
             ($1 <> '' AND (record_key LIKE '%' || $1 || '%' OR payload->>'noOr' = $1 OR payload->>'or' = $1))
             OR ($1 = '' AND $2 <> '' AND (record_key LIKE '%' || $2 || '%' OR payload->>'chassis' = $2 OR payload->>'vin' = $2))
           )`,
        [noOr, chassis],
      );
    }

    return sendActionResult(res, { ok: true, message: `${result.rowCount} enregistrement(s) supprimé(s).` });
  }
  if (action === 'accepterEntreeChefEquipe') {
    const decision = text('decision', 'accepte');
    const nowFr = workshopDateTime();
    // Le serveur est l'autorité pour l'horodatage de prise en charge.
    const dateDecision = nowFr.dateTime;
    const decisionPar = text('decisionPar', account.name || account.email);
    const updateObj = decision === 'accepte'
      ? {
          statutAcceptation: 'accepte',
          dateAcceptation: dateDecision,
          acceptePar: decisionPar,
          dateDebutRep: dateDecision,
          dateDebutTravail: dateDecision,
          heureDebutTravail: nowFr.time,
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
    const requestedModePaiement = text('modePaiement');
    if (requestedModePaiement && !FACTURATION_PAYMENT_MODES.has(requestedModePaiement)) {
      return sendActionResult(res, { ok: false, error: 'Mode de paiement invalide.' });
    }
    const noOr = text('noOr', text('no'));
    const chassis = text('chassis', text('vin')).toUpperCase();
    if (!noOr && !chassis) {
      return sendActionResult(res, { ok: false, error: 'N° OR ou châssis requis pour livrer le véhicule.' });
    }

    // Ne jamais autoriser la sortie sur la seule valeur envoyée par le
    // navigateur : retrouver l'autorisation Facturation réellement enregistrée
    // sur le véhicule ciblé. Quand l'OR est fourni, il reste l'identifiant
    // strict, même si le châssis a été utilisé dans une intervention antérieure.
    const persistedVehicles = await pool.query(
      `SELECT id, record_type, record_key, no_or, chassis, payload
       FROM vehicles
       WHERE (
         ($1 <> '' AND (
           no_or = $1 OR UPPER(TRIM(no_or)) = UPPER(TRIM($1))
           OR payload->>'numeroOR' = $1 OR payload->>'noOr' = $1
           OR payload->>'no' = $1 OR payload->>'or' = $1
           OR UPPER(TRIM(payload->>'noOr')) = UPPER(TRIM($1))
           OR UPPER(TRIM(payload->>'or')) = UPPER(TRIM($1))
         ))
         OR ($1 = '' AND $2 <> '' AND (
           UPPER(chassis) = UPPER($2) OR UPPER(payload->>'vin') = UPPER($2)
           OR UPPER(payload->>'chassis') = UPPER($2)
           OR REPLACE(UPPER(COALESCE(chassis, '')), ' ', '') = REPLACE(UPPER($2), ' ', '')
           OR REPLACE(UPPER(COALESCE(payload->>'vin', '')), ' ', '') = REPLACE(UPPER($2), ' ', '')
         ))
       )
       ORDER BY updated_at DESC, id DESC`,
      [noOr, chassis],
    );
    if (!persistedVehicles.rowCount) {
      return sendActionResult(res, { ok: false, error: 'Véhicule introuvable dans PostgreSQL.' });
    }

    // Le premier enregistrement est le dossier courant. Ne pas rechercher une
    // validation plus ancienne avec le même OR : un OR réouvert conserve son
    // numéro mais doit repasser par la Facturation pour sa nouvelle intervention.
    const persistedModePaiement = getPersistedFacturationPaymentMode(persistedVehicles.rows[0].payload);

    // Le modal de livraison directe est déjà utilisé par la Direction. Cette
    // dérogation reste limitée à Administration/Chef d'Atelier, exige un mode
    // explicite connu, et est inscrite dans l'historique du véhicule.
    const isDirectionOverride = !persistedModePaiement && managementRoles.has(account.role);
    if (!persistedModePaiement && !isDirectionOverride) {
      return sendActionResult(res, {
        ok: false,
        error: 'La livraison nécessite une validation Facturation enregistrée.',
      });
    }
    if (isDirectionOverride && !requestedModePaiement) {
      return sendActionResult(res, {
        ok: false,
        error: 'La dérogation Direction exige de choisir un mode de paiement valide.',
      });
    }

    const modePaiement = persistedModePaiement || requestedModePaiement;
    const authenticatedActor = String(account.name || account.email || account.id || 'Direction').trim();
    const livrePar = text('livrePar', authenticatedActor);
    const updateObj = {
      etat: 'Livré',
      etatIntervention: 'Livré',
      statut: 'Livré',
      avancement: 'Livré',
      emplacement: 'Livraison au client',
      dateLivraisonClient: nowFr,
      livrePar,
      modePaiement,
      ...(isDirectionOverride ? {
        livraisonOverrideFacturation: true,
        livraisonOverrideFacturationPar: authenticatedActor,
        livraisonOverrideFacturationRole: account.role,
        dateLivraisonOverrideFacturation: nowFr,
        modePaiementOverrideFacturation: modePaiement,
        motifLivraisonOverrideFacturation: 'Dérogation Direction : aucune validation Facturation persistée au moment de la livraison.',
      } : {}),
    };
    const updated = await updateVehicleBySelectors(query, updateObj, undefined, '');
    if (!updated) return sendActionResult(res, { ok: false, error: 'Véhicule introuvable dans PostgreSQL.' });
    // La livraison clôture le travail : la notification opérationnelle est
    // supprimée. Le dossier véhicule livré reste disponible dans l'archive
    // réservée à l'administration.
    await pool.query(
      `DELETE FROM app_records WHERE collection = 'facturation_notifications'
       AND (($1 <> '' AND (payload->>'noOr' = $1 OR payload->>'or' = $1))
         OR ($1 = '' AND $2 <> '' AND (UPPER(payload->>'chassis') = $2 OR UPPER(payload->>'vin') = $2)))`,
      [noOr, chassis],
    );
    return sendActionResult(res, {
      ok: true,
      message: isDirectionOverride
        ? `Véhicule livré par dérogation Direction (${modePaiement}) et journalisé dans PostgreSQL.`
        : `Véhicule livré (${modePaiement}) après validation Facturation.`,
    });
  }

  // ══ validerFacturation : action dédiée facturation pour valider le mode de paiement (Facture / Bon de commande / Édition fin de travaux)
  if (action === 'validerFacturation') {
    const nowFr = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const modePaiement = text('modePaiement');
    const numeroFacture = text('numeroFacture');
    const numeroBC = text('numeroBC');
    const numeroEdition = text('numeroEdition');
    const commentaire = text('commentaire');
    const validePar = text('validePar', account.name || account.email || '');
    const isRegularisation = text('regularisation') === 'true';

    if (!FACTURATION_PAYMENT_MODES.has(modePaiement)) {
      return sendActionResult(res, { ok: false, error: 'Mode de paiement invalide.' });
    }

    const isAttFacture = ATT_FACTURE_PAYMENT_MODES.has(modePaiement);
    // Les appels et dossiers créés avant ce champ restent des attestations
    // standard. Seul le choix "garant" nécessite un engagement explicite.
    const attFactureOption = text('attFactureOption', 'standard') || 'standard';
    const nomGarant = text('nomGarant');
    const engagementReglement = text('engagementReglement');
    if (isAttFacture && !ATT_FACTURE_OPTIONS.has(attFactureOption)) {
      return sendActionResult(res, { ok: false, error: 'Option Att Facture invalide.' });
    }
    if (isAttFacture && attFactureOption === 'garant') {
      if (!nomGarant || !engagementReglement) {
        return sendActionResult(res, { ok: false, error: 'Le nom du garant et son engagement de règlement sont requis.' });
      }
      if (nomGarant.length > 160 || engagementReglement.length > 1500) {
        return sendActionResult(res, { ok: false, error: 'Les informations du garant sont trop longues.' });
      }
    }
    const statutFacturation = isAttFacture
      ? 'edition_fin_travaux'
      : (modePaiement === 'Bon de commande' ? 'bon_commande' : 'facture');
    const statutPaiement = statutFacturation;
    const statutFacturationFinale = isAttFacture ? 'non_facture' : 'facture';

    const updateObj = {
      modePaiement,
      statutFacturation,
      statutFacturationFinale,
      dateValidationFacturation: nowFr,
      facturationValideePar: validePar,
      ...(isAttFacture ? {
        attFactureOption,
        nomGarant: attFactureOption === 'garant' ? nomGarant : '',
        engagementReglement: attFactureOption === 'garant' ? engagementReglement : '',
      } : {}),
      // Att Facture autorise la sortie du véhicule : le dossier reste dans la
      // liste Facturation jusqu'au règlement de fin de mois.
      // Une régularisation ne doit jamais ramener un véhicule livré à Réception.
      ...(!isRegularisation ? {
        etat: 'Attente Client',
        statut: 'Attente Client',
        etatIntervention: 'Attente Client',
        avancement: 'Terminer',
      } : {}),
    };
    if (numeroFacture) updateObj.numeroFacture = numeroFacture;
    if (numeroBC) updateObj.numeroBC = numeroBC;
    if (numeroEdition) updateObj.numeroEdition = numeroEdition;
    if (commentaire) updateObj.commentaireFacturation = commentaire;

    // L'emplacement client est attribué au moment du transfert à la réception.
    if (!isRegularisation) try {
      const allOccupied = await pool.query(
        `SELECT DISTINCT UPPER(REGEXP_REPLACE(COALESCE(NULLIF(location, ''), payload->>'emplacement', ''), '\\s+', '', 'g')) AS loc
         FROM vehicles
         WHERE location IS NOT NULL AND location <> ''
           AND LOWER(COALESCE(status, payload->>'etatIntervention', payload->>'etat', '')) NOT LIKE '%livr%'`
      );
      const occupiedSet = new Set(allOccupied.rows.map((r) => r.loc));
      let freePlace = '';
      for (let i = 1; i <= 8; i++) {
        const l = `L${i}`;
        if (!occupiedSet.has(l)) { freePlace = l; break; }
      }
      if (!freePlace) {
        for (let i = 1; i <= 76; i++) {
          const p = `P${i}`;
          if (!occupiedSet.has(p)) { freePlace = p; break; }
        }
      }
      if (freePlace) {
        updateObj.emplacement = freePlace;
      }
    } catch (e) {
      console.warn("Attribution emplacement Zone L ignorée:", e);
    }

    let updated = await updateVehicleBySelectors(query, updateObj, undefined, '');

    // Synchroniser / mettre à jour dans app_records (facturation_notifications)
    const noOrVal = text('noOr', text('or', text('no')));
    const chassisVal = text('chassis', text('vin'));

    const notifs = await pool.query(
      `SELECT collection, record_key, payload FROM app_records
       WHERE collection = 'facturation_notifications'
         AND (($1 <> '' AND (record_key LIKE '%' || $1 || '%' OR payload->>'noOr' = $1 OR payload->>'or' = $1))
          OR ($1 = '' AND $2 <> '' AND (record_key LIKE '%' || $2 || '%' OR payload->>'chassis' = $2 OR payload->>'vin' = $2)))`,
      [noOrVal, chassisVal]
    );

    const passedEquipe = text('equipe');
    const passedClient = text('client', text('nomClient'));

    for (const row of notifs.rows) {
      const updatedNotif = {
        ...row.payload,
        statutPaiement,
        modePaiement,
        statutFacturationFinale,
        dateDecision: nowFr,
        decisionPar: validePar,
        ...(passedEquipe && (!row.payload.equipe || row.payload.equipe === '-') ? { equipe: passedEquipe } : {}),
        ...(passedClient && (!row.payload.client || row.payload.client.toLowerCase().includes('non renseign')) ? { client: passedClient, nomClient: passedClient } : {}),
        ...(numeroFacture ? { numeroFacture } : {}),
        ...(numeroBC ? { numeroBC } : {}),
        ...(numeroEdition ? { numeroEdition } : {}),
        ...(isAttFacture ? {
          attFactureOption,
          nomGarant: attFactureOption === 'garant' ? nomGarant : '',
          engagementReglement: attFactureOption === 'garant' ? engagementReglement : '',
        } : {}),
        ...(commentaire ? { commentaireFacturation: commentaire } : {}),
      };
      await pool.query(
        `UPDATE app_records SET payload = $1::jsonb, updated_at = NOW() WHERE collection = $2 AND record_key = $3`,
        [JSON.stringify(updatedNotif), row.collection, row.record_key]
      );
    }

    if (notifs.rowCount === 0) {
      const vehQuery = await pool.query(
        `SELECT id, payload FROM vehicles
         WHERE (no_or = $1 OR payload->>'noOr' = $1 OR payload->>'numeroOR' = $1 OR payload->>'no' = $1)
            OR (chassis = $2 OR payload->>'chassis' = $2 OR payload->>'vin' = $2)
         ORDER BY id DESC LIMIT 1`,
        [noOrVal, chassisVal]
      );
      const vehRow = vehQuery.rows[0];
      const vPayload = vehRow?.payload || {};
      const newKey = `facturation_${noOrVal || 'sans_or'}_${chassisVal || Date.now()}`;

      let notifClient = passedClient || vPayload.client || vPayload.nomClient || '';
      if (!notifClient || notifClient === '-' || notifClient.toLowerCase().includes('non renseign')) {
        const invQ = await pool.query(
          `SELECT customer_name, raw_data FROM vehicle_inventory WHERE vin_key = UPPER(REPLACE($1, ' ', '')) OR UPPER(vin) = UPPER($1) LIMIT 1`,
          [chassisVal || vPayload.chassis || '']
        );
        const invC = invQ.rows[0]?.customer_name || invQ.rows[0]?.raw_data?.['Nom du client'];
        if (invC) notifClient = invC;
      }

      const notifEquipe = passedEquipe || vPayload.equipe || '';

      const newNotif = {
        id: newKey,
        vehicleId: vehRow?.id || Date.now(),
        noOr: noOrVal || vPayload.noOr || vPayload.no || '',
        or: noOrVal || vPayload.noOr || vPayload.no || '',
        chassis: chassisVal || vPayload.chassis || '',
        immatriculation: vPayload.immatriculation || vPayload.serie || '',
        marque: vPayload.marque || '',
        modele: vPayload.modele || '',
        client: notifClient || 'Client non renseigné',
        nomClient: notifClient || 'Client non renseigné',
        equipe: notifEquipe || '',
        technicien: vPayload.nomTechnicien || vPayload.technicien || '',
        nomTechnicien: vPayload.nomTechnicien || vPayload.technicien || '',
        dateFinTravaux: vPayload.dateFinRep || nowFr,
        dateEntree: vPayload.dateEntree || vPayload.dateEntreeHeure?.split(' ')[0] || '',
        dateEntreeHeure: vPayload.dateEntreeHeure || vPayload.dateEntree || '',
        statutFin: 'Terminé',
        statutPaiement,
        modePaiement,
        statutFacturationFinale,
        dateDecision: nowFr,
        decisionPar: validePar,
        ...(numeroFacture ? { numeroFacture } : {}),
        ...(numeroBC ? { numeroBC } : {}),
        ...(numeroEdition ? { numeroEdition } : {}),
        ...(isAttFacture ? {
          attFactureOption,
          nomGarant: attFactureOption === 'garant' ? nomGarant : '',
          engagementReglement: attFactureOption === 'garant' ? engagementReglement : '',
        } : {}),
        ...(commentaire ? { commentaireFacturation: commentaire } : {}),
        createdAt: Date.now(),
      };
      await pool.query(
        `INSERT INTO app_records (collection, record_key, payload) VALUES ('facturation_notifications', $1, $2::jsonb)
         ON CONFLICT (collection, record_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [newKey, JSON.stringify(newNotif)]
      );
    }

    // Si le véhicule n'a pas été mis à jour par les sélecteurs stricts, chercher dans PostgreSQL sans restriction d'équipe
    if (!updated) {
      const searchOr = noOrVal;
      const searchChassis = chassisVal;
      const existingRows = await pool.query(
        `SELECT id, record_type, record_key, payload FROM vehicles
         WHERE ($1 <> '' AND (no_or = $1 OR payload->>'noOr' = $1 OR payload->>'numeroOR' = $1 OR payload->>'or' = $1))
            OR ($2 <> '' AND (chassis = $2 OR UPPER(chassis) = UPPER($2) OR UPPER(payload->>'chassis') = UPPER($2) OR UPPER(payload->>'vin') = UPPER($2)))
         ORDER BY id ASC`,
        [searchOr, searchChassis]
      );
      if (existingRows.rowCount > 0) {
        for (const row of existingRows.rows) {
          const currentPayload = row.payload || {};
          const mergedPayload = { ...currentPayload, ...updateObj };
          await saveVehicleRecord(pool, row.record_type, mergedPayload, row.record_key);
        }
        updated = true;
      }
    }

    // Dernier recours : si le véhicule n'existe vraiment pas dans la table vehicles, mais qu'il existe dans la notification
    if (!updated && notifs.rowCount > 0) {
      const notifRow = notifs.rows[0];
      const notifPayload = notifRow?.payload || {};
      const newVehicleId = Number(notifPayload.vehicleId) || Date.now();
      const genuineDateEntree = notifPayload.dateEntree || notifPayload.dateEntreeHeure?.split(' ')[0] || new Date().toLocaleDateString('fr-FR');
      const genuineDateEntreeHeure = notifPayload.dateEntreeHeure || notifPayload.dateEntree || (notifPayload.dateFinTravaux ? '' : nowFr);
      const baseVehicle = {
        id: newVehicleId,
        noOr: notifPayload.noOr || notifPayload.or || noOrVal || 'OR-' + newVehicleId,
        or: notifPayload.noOr || notifPayload.or || noOrVal || 'OR-' + newVehicleId,
        chassis: notifPayload.chassis || notifPayload.vin || chassisVal || 'VIN-' + newVehicleId,
        immatriculation: notifPayload.immatriculation || notifPayload.serie || '-',
        marque: notifPayload.marque || 'IVECO',
        modele: notifPayload.modele || '-',
        client: notifPayload.client || notifPayload.nomClient || 'Client atelier',
        nomClient: notifPayload.nomClient || notifPayload.client || 'Client atelier',
        equipe: notifPayload.equipe || 'Atelier',
        technicien: notifPayload.technicien || notifPayload.nomTechnicien || '-',
        nomTechnicien: notifPayload.nomTechnicien || notifPayload.technicien || '-',
        dateEntree: genuineDateEntree,
        dateEntreeHeure: genuineDateEntreeHeure,
        dateFinRep: notifPayload.dateFinTravaux || '',
        ...updateObj,
      };
      const recordKeyRec = `${baseVehicle.noOr}_${newVehicleId}`;
      await saveVehicleRecord(pool, 'flux', baseVehicle, recordKeyRec);
      await saveVehicleRecord(pool, 'reception', baseVehicle, recordKeyRec);
      updated = true;
    }

    if (!updated) return sendActionResult(res, { ok: false, error: 'Véhicule introuvable dans PostgreSQL.' });
    return sendActionResult(res, {
      ok: true,
      message: isRegularisation
        ? `Règlement final (${modePaiement}) enregistré.`
        : isAttFacture
          ? 'Att Facture validé : véhicule transféré à la réception pour livraison, dossier conservé en Facturation jusqu’au règlement final.'
          : `Règlement facturation (${modePaiement}) validé et transféré à la réception.`,
    });
  }

  // ══ marquerFacture : pour régulariser les dossiers sortis sur "Édition fin de travaux"
  if (action === 'marquerFacture') {
    const nowFr = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const numeroFacture = text('numeroFacture');
    const commentaire = text('commentaire');
    const facturePar = text('facturePar', account.name || account.email || '');

    const updateObj = {
      statutFacturationFinale: 'facture',
      dateFacturationFinale: nowFr,
      facturePar,
    };
    if (numeroFacture) updateObj.numeroFacture = numeroFacture;
    if (commentaire) updateObj.commentaireFacturationFinale = commentaire;

    let updated = await updateVehicleBySelectors(query, updateObj, undefined, '');

    // Synchroniser / mettre à jour dans app_records (facturation_notifications)
    const noOrVal = text('noOr', text('or', text('no')));
    const chassisVal = text('chassis', text('vin'));

    const notifs = await pool.query(
      `SELECT collection, record_key, payload FROM app_records
       WHERE collection = 'facturation_notifications'
         AND (($1 <> '' AND (record_key LIKE '%' || $1 || '%' OR payload->>'noOr' = $1 OR payload->>'or' = $1))
          OR ($1 = '' AND $2 <> '' AND (record_key LIKE '%' || $2 || '%' OR payload->>'chassis' = $2 OR payload->>'vin' = $2)))`,
      [noOrVal, chassisVal]
    );

    for (const row of notifs.rows) {
      const updatedNotif = {
        ...row.payload,
        statutFacturationFinale: 'facture',
        dateFacturationFinale: nowFr,
        facturePar,
        ...(numeroFacture ? { numeroFacture } : {}),
        ...(commentaire ? { commentaireFacturationFinale: commentaire } : {}),
      };
      await pool.query(
        `UPDATE app_records SET payload = $1::jsonb, updated_at = NOW() WHERE collection = $2 AND record_key = $3`,
        [JSON.stringify(updatedNotif), row.collection, row.record_key]
      );
    }

    if (!updated && notifs.rowCount > 0) {
      updated = true;
    }

    if (!updated) return sendActionResult(res, { ok: false, error: 'Véhicule introuvable dans PostgreSQL.' });
    return sendActionResult(res, { ok: true, message: `Dossier marqué comme facturé (Facture ${numeroFacture || 'établie'}).` });
  }


  const updateFields = {};
  for (const [key, value] of query.entries()) {
    if (!['action', 'token', 'no', 'noOr', 'chassis', 'cs', 'rowNumber', 'rowSuivi'].includes(key)) {
      updateFields[key] = value;
    }
  }
  if (action === 'updateStatutAchat') updateFields.statutAchat = text('statutAchat', text('statut'));
  if (action === 'updateStatutDevis') {
    const sDevis = text('statutDevis', text('statut'));
    updateFields.statutDevis = sDevis;
    const sDevisNorm = sDevis.toLowerCase().trim();
    if (sDevisNorm === 'accepté' || sDevisNorm === 'accepte' || sDevisNorm === 'accord accepté' || sDevisNorm === 'accord accepte') {
      updateFields.avancement = 'Accepter accord';
      updateFields.etat = 'Attente Réparation';
      updateFields.etatIntervention = 'Attente Réparation';
      updateFields.statut = 'Attente Réparation';
      if (text('technicien') && text('technicien') !== '-') updateFields.technicien = text('technicien');
      if (text('nomTechnicien') && text('nomTechnicien') !== '-') updateFields.nomTechnicien = text('nomTechnicien');
      if (text('equipe')) updateFields.equipe = sanitizeSingleTeam(text('equipe'));
    } else if (sDevisNorm === 'refusé' || sDevisNorm === 'refuse') {
      updateFields.avancement = 'Terminer';
      updateFields.etat = 'Attente Client';
      updateFields.etatIntervention = 'Attente Client';
      updateFields.statut = 'Attente Client';
      const now = workshopDateTime();
      updateFields.dateFin = now.dateTime;
      updateFields.dateFinRep = now.dateTime;
    }
  }
  if (action === 'updateAvancement') {
    const avNorm = String(updateFields.avancement || '').toLowerCase().trim();
    if (avNorm === 'accepter accord' || avNorm === 'accord accepté' || avNorm === 'accord accepte') {
      updateFields.statutDevis = 'Accepté';
      updateFields.etat = 'Attente Réparation';
      updateFields.etatIntervention = 'Attente Réparation';
      updateFields.statut = 'Attente Réparation';
    }
  }
  if (
    ['updateTechnicien', 'updateAvancement'].includes(action) &&
    String(updateFields.etat || updateFields.etatIntervention || updateFields.statut || updateFields.avancement || '').toLowerCase().includes('en cours')
  ) {
    const now = workshopDateTime();
    // Ne laisser ni le téléphone ni le PC envoyer une heure décalée pour le
    // passage initial « En cours ».
    updateFields.dateDebutRep = now.dateTime;
    updateFields.dateDebutTravail = now.dateTime;
    updateFields.heureDebutTravail = now.time;
  }
  if (['updateEmplacement', 'updateEtat', 'updateTechnicien', 'updateAvancement', 'updateStatutAchat', 'updateStatutDevis', 'updateStatutGarantie'].includes(action)) {
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

  // Vérifier et créer un compte Facturation par défaut s'il n'en existe pas
  const facturationCount = await pool.query("SELECT COUNT(*)::int AS count FROM accounts WHERE role = 'facturation'");
  if (facturationCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO accounts (id, name, email, password_hash, role)
       VALUES ($1, $2, LOWER($3), $4, 'facturation')
       ON CONFLICT (email) DO NOTHING`,
      ['acc_facturation', 'Service Facturation', 'facturation@italcar.com', passwordHash('facturation123')],
    );
    console.log('Compte facturation initial créé : facturation@italcar.com (mot de passe: facturation123)');
  }

  // Vérifier et créer un compte Garantie par défaut s'il n'en existe pas
  const garantieCount = await pool.query("SELECT COUNT(*)::int AS count FROM accounts WHERE role = 'garantie' OR email = 'garantie@italcar.com'");
  if (garantieCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO accounts (id, name, email, password_hash, role, assigned_team)
       VALUES ($1, $2, LOWER($3), $4, 'garantie', 'R10')
       ON CONFLICT (email) DO NOTHING`,
      ['acc_garantie', 'Service Garantie', 'garantie@italcar.com', passwordHash('garantie123')],
    );
    console.log('Compte garantie initial créé : garantie@italcar.com (mot de passe: garantie123, CS: R10)');
  }

  // Enrichir les véhicules et dossiers dont le client n'est pas renseigné avec le Parc véhicules & engins
  try {
    await pool.query(`
      UPDATE vehicles v
      SET payload = v.payload || jsonb_build_object(
        'client', COALESCE(NULLIF(inv.customer_name, ''), inv.raw_data->>'Nom du client', v.payload->>'client'),
        'nomClient', COALESCE(NULLIF(inv.customer_name, ''), inv.raw_data->>'Nom du client', v.payload->>'nomClient'),
        'immatriculation', CASE WHEN v.payload->>'immatriculation' IS NULL OR v.payload->>'immatriculation' = '-' OR v.payload->>'immatriculation' = ''
                                THEN COALESCE(NULLIF(inv.registration, ''), inv.raw_data->>'N° Immatriculation', v.payload->>'immatriculation')
                                ELSE v.payload->>'immatriculation' END,
        'marque', CASE WHEN v.payload->>'marque' IS NULL OR v.payload->>'marque' = '-' OR v.payload->>'marque' = ''
                       THEN COALESCE(NULLIF(inv.brand_code, ''), inv.raw_data->>'Code marque', v.payload->>'marque')
                       ELSE v.payload->>'marque' END,
        'modele', CASE WHEN v.payload->>'modele' IS NULL OR v.payload->>'modele' = '-' OR v.payload->>'modele' = ''
                       THEN COALESCE(NULLIF(inv.model_code, ''), NULLIF(inv.model_description, ''), inv.raw_data->>'Code modèle', v.payload->>'modele')
                       ELSE v.payload->>'modele' END
      )
      FROM vehicle_inventory inv
      WHERE (
        inv.vin_key = UPPER(REPLACE(COALESCE(v.chassis, v.payload->>'chassis', v.payload->>'vin', ''), ' ', ''))
        OR UPPER(BTRIM(inv.vin)) = UPPER(BTRIM(COALESCE(v.chassis, v.payload->>'chassis', v.payload->>'vin', '')))
      )
      AND (
        v.payload->>'client' IS NULL
        OR v.payload->>'client' = '-'
        OR v.payload->>'client' = ''
        OR LOWER(v.payload->>'client') LIKE '%non renseign%'
        OR LOWER(v.payload->>'client') LIKE '%non spécifi%'
      )
      AND (inv.customer_name IS NOT NULL AND BTRIM(inv.customer_name) <> '')
    `);

    await pool.query(`
      UPDATE app_records a
      SET payload = a.payload || jsonb_build_object(
        'client', COALESCE(NULLIF(inv.customer_name, ''), inv.raw_data->>'Nom du client', a.payload->>'client'),
        'nomClient', COALESCE(NULLIF(inv.customer_name, ''), inv.raw_data->>'Nom du client', a.payload->>'nomClient')
      )
      FROM vehicle_inventory inv
      WHERE a.collection = 'facturation_notifications'
      AND (
        inv.vin_key = UPPER(REPLACE(COALESCE(a.payload->>'chassis', a.payload->>'vin', ''), ' ', ''))
        OR UPPER(BTRIM(inv.vin)) = UPPER(BTRIM(COALESCE(a.payload->>'chassis', a.payload->>'vin', '')))
      )
      AND (
        a.payload->>'client' IS NULL
        OR a.payload->>'client' = '-'
        OR a.payload->>'client' = ''
        OR LOWER(a.payload->>'client') LIKE '%non renseign%'
        OR LOWER(a.payload->>'client') LIKE '%non spécifi%'
      )
      AND (inv.customer_name IS NOT NULL AND BTRIM(inv.customer_name) <> '')
    `);
  } catch (err) {
    console.warn('Enrichissement initial du parc véhicules ignoré:', err);
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
    // Cette route sert au démarrage de l'interface : ne pas signaler comme
    // une erreur réseau l'absence attendue de session avant la connexion.
    const id = verifySession(req);
    if (!id) return send(res, 200, { ok: true, user: null });
    const result = await pool.query(
      'SELECT id, name, email, role, assigned_team, custom_permissions FROM accounts WHERE id = $1',
      [id],
    );
    const account = result.rows[0];
    if (!account) return send(res, 200, { ok: true, user: null });
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
      const result = await pool.query('SELECT id, name, email, role, assigned_team, custom_permissions FROM accounts ORDER BY name');
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
      const customPermissions = body.customPermissions && typeof body.customPermissions === 'object'
        ? JSON.stringify(body.customPermissions)
        : '{}';
      const id = String(body.id || randomUUID());
      const result = await pool.query(
        `INSERT INTO accounts (id, name, email, password_hash, role, assigned_team, custom_permissions)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, name, email, role, assigned_team, custom_permissions`,
        [id, name, email, passwordHash(password), role, body.assignedTeam || null, customPermissions],
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
      const email = String(body.email ?? old.email).trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return send(res, 400, { ok: false, error: 'Une adresse e-mail valide est obligatoire.' });
      }
      const existingEmail = await pool.query(
        'SELECT id FROM accounts WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1',
        [email, parts[2]],
      );
      if (existingEmail.rowCount) {
        return send(res, 409, { ok: false, error: `L’adresse e-mail « ${email} » est déjà utilisée par un autre compte.` });
      }
      const customPermissions = body.customPermissions !== undefined
        ? (typeof body.customPermissions === 'object' ? JSON.stringify(body.customPermissions) : '{}')
        : (old.custom_permissions ? (typeof old.custom_permissions === 'string' ? old.custom_permissions : JSON.stringify(old.custom_permissions)) : '{}');
      const result = await pool.query(
        `UPDATE accounts SET name = $2, email = LOWER($3), role = $4, assigned_team = $5,
           password_hash = $6, custom_permissions = $7::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING id, name, email, role, assigned_team, custom_permissions`,
        [
          parts[2], String(body.name ?? old.name).trim(), email,
          body.role || old.role, body.assignedTeam ?? old.assigned_team,
          password ? passwordHash(password) : old.password_hash,
          customPermissions,
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
      if (!['administration', 'chef_atelier', 'reception', 'garantie'].includes(account.role)) {
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
      // Une équipe peut créer un devis depuis l'atelier ; la réception le
      // traite ensuite. Les deux doivent donc pouvoir le synchroniser.
      quotes: ['administration', 'chef_atelier', 'reception', 'chef_equipe', 'garantie'],
      essai_controls: ['administration', 'chef_atelier', 'chef_equipe'],
      // Les chefs d'équipe enregistrent les bascules horodatées (PDR, devis,
      // réaffectation, essai) : ils doivent pouvoir lire et écrire leur chronométrie.
      vehicle_times: ['administration', 'chef_atelier', 'chef_equipe', 'garantie'],
      transfers: ['administration', 'chef_atelier', 'chef_equipe'],
      reassignments: ['administration', 'chef_atelier', 'chef_equipe'],
      essais: ['administration', 'chef_atelier', 'chef_equipe'],
      // La réception crée la notification, puis le chef d'équipe concerné la lit
      // et l'accepte : les deux rôles doivent pouvoir la synchroniser/supprimer.
      devis_notifications: ['administration', 'chef_atelier', 'reception', 'chef_equipe', 'garantie'],
      entree_notifications: ['administration', 'chef_atelier', 'reception', 'chef_equipe', 'garantie'],
      facturation_notifications: ['administration', 'chef_atelier', 'facturation', 'reception', 'chef_equipe'],
    };
    // Une fiche de contrôle contient le résultat final et les remarques d'un
    // essai. Elle est écrite par l'atelier au moment de la validation, et
    // consultable par l'atelier et l'administration.
    // Pour les autres rôles (réception, facturation), on renvoie un tableau vide
    // sans erreur 403 pour éviter de polluer la console réseau.
    if (req.method === 'GET' && collection === 'essai_controls') {
      if (!['administration', 'chef_atelier', 'chef_equipe'].includes(account.role)) {
        return send(res, 200, []);
      }
    }
    if (req.method !== 'GET' && vehicleCollection && !['administration', 'chef_atelier'].includes(account.role)) {
      return send(res, 403, { ok: false, error: 'Modification des véhicules réservée à la direction atelier.' });
    }
    if (req.method !== 'GET' && collectionRoles[collection] && !collectionRoles[collection].includes(account.role)) {
      return send(res, 403, { ok: false, error: 'Accès à cette collection non autorisé pour ce rôle.' });
    }

    if (parts.length === 3 && req.method === 'GET') {
      // Les rôles sans accès au chronométrage ne doivent pas générer de 403
      // lors de l'hydratation automatique du navigateur.
      if (collection === 'vehicle_times' && !['administration', 'chef_atelier', 'chef_equipe', 'garantie'].includes(account.role)) {
        return send(res, 200, []);
      }
      if (vehicleCollection) {
        let result;
        if ((account.role === 'reception' || account.role === 'garantie') && collection !== 'vin') {
          const cs = String(account.assigned_team || (account.role === 'garantie' ? 'R10' : '')).trim().toUpperCase();
          if (!/^R\d+$/.test(cs)) return send(res, 403, { ok: false, error: 'Aucun Centre Service n’est affecté à ce compte.' });
          result = await pool.query(
            `SELECT payload FROM vehicles WHERE record_type = $1
             AND UPPER(COALESCE(payload->>'cs', '')) = $2 ORDER BY id`, [collection, cs],
          );
        } else if (
          ['chef_equipe', 'chef_atelier', 'facturation'].includes(account.role) &&
          account.assigned_team &&
          !['toutes', 'all'].includes(String(account.assigned_team).trim().toLowerCase()) &&
          collection !== 'vin'
        ) {
          const team = await resolveAccountTeam(account);
          if (!team) return send(res, 403, { ok: false, error: 'Aucune équipe n’est affectée à ce compte.' });
          const rawTeams = team.split(',').map((t) => t.trim()).filter(Boolean);
          const teamClauses = [];
          const queryParams = [collection];
          for (const t of rawTeams) {
            const normTeam = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (normTeam.includes('DAILY')) {
              teamClauses.push(`(UPPER(COALESCE(team, '')) IN ('DAILY', 'DAILY1', 'DAILY2') OR UPPER(COALESCE(payload->>'equipe', '')) IN ('DAILY', 'DAILY1', 'DAILY2'))`);
            } else if (normTeam.includes('RAPIDE') || normTeam.includes('SERV')) {
              teamClauses.push(`(UPPER(COALESCE(team, '')) LIKE '%RAPIDE%' OR UPPER(COALESCE(team, '')) LIKE '%SERV%' OR UPPER(COALESCE(payload->>'equipe', '')) LIKE '%RAPIDE%' OR UPPER(COALESCE(payload->>'equipe', '')) LIKE '%SERV%')`);
            } else if (normTeam.includes('LOURD')) {
              teamClauses.push(`(UPPER(COALESCE(team, '')) LIKE '%LOURD%' OR UPPER(COALESCE(payload->>'equipe', '')) LIKE '%LOURD%')`);
            } else if (normTeam.includes('CARROSS')) {
              teamClauses.push(`(UPPER(COALESCE(team, '')) LIKE '%CARROSS%' OR UPPER(COALESCE(payload->>'equipe', '')) LIKE '%CARROSS%')`);
            } else if (normTeam.includes('ELECT') || normTeam.includes('ELICT')) {
              teamClauses.push(`(UPPER(COALESCE(team, '')) LIKE '%ELECT%' OR UPPER(COALESCE(team, '')) LIKE '%ELICT%' OR UPPER(COALESCE(payload->>'equipe', '')) LIKE '%ELECT%' OR UPPER(COALESCE(payload->>'equipe', '')) LIKE '%ELICT%')`);
            } else if (normTeam.includes('CHANGAN')) {
              teamClauses.push(`(UPPER(COALESCE(team, '')) LIKE '%CHANGAN%' OR UPPER(COALESCE(payload->>'equipe', '')) LIKE '%CHANGAN%')`);
            } else {
              queryParams.push(t);
              const pIdx = queryParams.length;
              teamClauses.push(`(UPPER(COALESCE(team, '')) = UPPER($${pIdx}) OR UPPER(COALESCE(payload->>'equipe', '')) = UPPER($${pIdx}))`);
            }
          }
          const whereTeam = teamClauses.length ? `AND (${teamClauses.join(' OR ')})` : '';
          result = await pool.query(
            `SELECT payload FROM vehicles WHERE record_type = $1 ${whereTeam} ORDER BY id`,
            queryParams,
          );
        } else {
          result = await pool.query(
            'SELECT payload FROM vehicles WHERE record_type = $1 ORDER BY id', [collection],
          );
        }
        const records = result.rows.map((row) => row.payload);
        if (collection === 'flux' || collection === 'reception') {
          await enrichVehiclesWithInventory(records);
        }
        // Les véhicules livrés sont un historique réservé à l'Administration,
        // y compris lorsqu'un autre profil appelle directement l'API.
        const visibleRecords = account.role === 'administration'
          ? records
          : records.filter((record) => {
              const state = String(record.etatIntervention || record.etat || record.statut || '').toLowerCase();
              const advancement = String(record.avancement || '').toLowerCase();
              return !state.includes('livr') && !advancement.includes('livr') && !advancement.includes('sorti');
            });
        return send(res, 200, visibleRecords);
      }
      if (account.role === 'administration' && ['devis_notifications', 'entree_notifications', 'facturation_notifications'].includes(collection)) {
        // L'administration gère les archives, pas les alertes opérationnelles.
        return send(res, 200, []);
      }
      const result = await pool.query(
        'SELECT payload FROM app_records WHERE collection = $1 ORDER BY updated_at DESC', [collection],
      );
      let records = result.rows.map((row) => row.payload);
      if (collection === 'facturation_notifications') {
        await enrichVehiclesWithInventory(records);
      }
      // La Réception ne consulte que les devis et alertes devis de son propre Centre Service (ex: R18)
      if ((collection === 'quotes' || collection === 'devis_notifications') && account.role === 'reception' && account.assigned_team) {
        const userCs = String(account.assigned_team).trim().toUpperCase();
        if (userCs && userCs !== 'TOUTES' && userCs !== 'ALL') {
          records = records.filter((record) => {
            const rCs = String(record.cs || '').trim().toUpperCase();
            return !rCs || rCs === userCs;
          });
        }
      }
      // Un agent Facturation ou Chef d'Équipe ne voit que les dossiers de ses
      // équipes affectées. L'Administration, le Chef d'Atelier et « Toutes »
      // conservent une vue globale.
      const customPermissions = typeof account.custom_permissions === 'object' && account.custom_permissions !== null
        ? account.custom_permissions
        : (typeof account.custom_permissions === 'string' ? JSON.parse(account.custom_permissions || '{}') : {});
      const canViewAllFacturation = Boolean(customPermissions.canViewAllFacturation);
      if (
        ['facturation', 'chef_equipe'].includes(account.role) &&
        account.assigned_team &&
        !['toutes', 'all'].includes(String(account.assigned_team).trim().toLowerCase()) &&
        !canViewAllFacturation &&
        collection === 'facturation_notifications'
      ) {
        const rawTeams = String(account.assigned_team).split(',').map((team) => team.trim()).filter(Boolean);
        records = records.filter((record) => {
          const recTeam = String(record.equipe || '').trim();
          return rawTeams.some((t) => isTeamMatch(recTeam, t));
        });
      }
      // Les dossiers clôturés ne constituent pas un historique utilisateur :
      // seul l'administrateur peut encore les consulter dans les archives.
      if (collection === 'facturation_notifications' && account.role !== 'administration') {
        return send(res, 200, records.filter((record) =>
          !['facture', 'bon_commande'].includes(String(record.statutPaiement || ''))
          && !(record.statutFacturationFinale === 'facture'),
        ));
      }
      return send(res, 200, records);
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
