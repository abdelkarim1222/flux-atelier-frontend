import path from 'node:path';
import pg from 'pg';
import XLSX from 'xlsx';

const { Pool } = pg;
const inputPath = process.argv.slice(2).find((argument) => argument && argument !== '--');

if (!process.env.DATABASE_URL || !inputPath) {
  console.error('Usage : npm run import:vehicle-inventory -- <chemin-vers-classeur.xlsx>');
  process.exit(1);
}

const source = path.resolve(inputPath);
console.log(`Lecture du classeur : ${source}...`);

const workbook = XLSX.readFile(source, { cellDates: true });
const sheetName = workbook.SheetNames[0];
if (!sheetName) {
  console.error('Le classeur ne contient aucune feuille.');
  process.exit(1);
}

const worksheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: null });
if (!rows.length) {
  console.error('La feuille Excel est vide.');
  process.exit(1);
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
  console.error('La feuille Excel doit obligatoirement contenir une colonne « VIN » (ou « Châssis »).');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
const batch = [];
let added = 0;
let updated = 0;
let unchanged = 0;
let duplicatesInFile = 0;
let missingVin = 0;
const seenInFile = new Set();

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

  const synchronized = await client.query(
    `INSERT INTO vehicle_inventory (${columns.join(', ')})
     VALUES ${valueGroups.join(', ')}
     ON CONFLICT (vin_key) WHERE vin_key IS NOT NULL DO UPDATE SET
       serial_no = EXCLUDED.serial_no,
       vin = EXCLUDED.vin,
       brand_code = EXCLUDED.brand_code,
       model_code = EXCLUDED.model_code,
       model_description = EXCLUDED.model_description,
       registration = EXCLUDED.registration,
       stock_status = EXCLUDED.stock_status,
       warehouse_code = EXCLUDED.warehouse_code,
       location_code = EXCLUDED.location_code,
       customer_code = EXCLUDED.customer_code,
       customer_name = EXCLUDED.customer_name,
       raw_data = EXCLUDED.raw_data
     WHERE (vehicle_inventory.serial_no, vehicle_inventory.vin, vehicle_inventory.brand_code,
            vehicle_inventory.model_code, vehicle_inventory.model_description, vehicle_inventory.registration,
            vehicle_inventory.stock_status, vehicle_inventory.warehouse_code, vehicle_inventory.location_code,
            vehicle_inventory.customer_code, vehicle_inventory.customer_name, vehicle_inventory.raw_data)
       IS DISTINCT FROM
           (EXCLUDED.serial_no, EXCLUDED.vin, EXCLUDED.brand_code, EXCLUDED.model_code,
            EXCLUDED.model_description, EXCLUDED.registration, EXCLUDED.stock_status, EXCLUDED.warehouse_code,
            EXCLUDED.location_code, EXCLUDED.customer_code, EXCLUDED.customer_name, EXCLUDED.raw_data)
     RETURNING (xmax = 0) AS inserted`,
    values,
  );
  const insertedRows = synchronized.rows.filter((row) => row.inserted).length;
  added += insertedRows;
  updated += synchronized.rowCount - insertedRows;
  unchanged += batch.length - synchronized.rowCount;
  batch.length = 0;
}

try {
  await client.query('BEGIN');
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
      missingVin += 1;
      continue;
    }

    const vinKey = rawVin.toUpperCase().replace(/\s+/g, '');
    if (seenInFile.has(vinKey)) {
      duplicatesInFile += 1;
      continue;
    }
    seenInFile.add(vinKey);

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

  const count = await client.query('SELECT COUNT(*)::int AS total FROM vehicle_inventory');
  console.log(`\nImportation terminée avec succès depuis ${path.basename(source)} :`);
  console.log(`- Nouveaux véhicules ajoutés : ${added.toLocaleString('fr-FR')}`);
  console.log(`- Véhicules mis à jour : ${updated.toLocaleString('fr-FR')}`);
  console.log(`- Véhicules déjà identiques : ${unchanged.toLocaleString('fr-FR')}`);
  console.log(`- Doublons VIN dans le fichier ignorés : ${duplicatesInFile.toLocaleString('fr-FR')}`);
  console.log(`- Lignes sans VIN ignorées : ${missingVin.toLocaleString('fr-FR')}`);
  console.log(`- Total des véhicules dans le parc : ${count.rows[0].total.toLocaleString('fr-FR')}\n`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
