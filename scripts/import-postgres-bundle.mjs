import { readFile } from 'node:fs/promises';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const inputPath = process.argv[2];
if (!process.env.DATABASE_URL || !inputPath) {
  console.error('Usage: DATABASE_URL=... node scripts/import-postgres-bundle.mjs <export.json>');
  process.exit(1);
}

const bundle = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const vehicleCollections = ['flux', 'reception', 'vin'];
const recordCollections = [
  'teams', 'averages', 'purchases', 'quotes', 'essai_controls', 'vehicle_times',
  'transfers', 'reassignments', 'essais', 'devis_notifications',
];

function stableKey(record, collection, index) {
  return String(
    record.recordKey ?? record.id ?? record.sheetRowNumber ?? record.rowNumber ??
    record.noOr ?? record.no ?? record.or ?? record.ordre ?? record.chassis ?? `${collection}-${index + 1}`,
  );
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(String(password), salt, 64).toString('hex')}`;
}

function vehicleColumns(record) {
  return [
    record.noOr ?? record.no ?? record.ordre ?? null,
    record.chassis ?? null,
    record.equipe ?? record.atelier ?? null,
    record.etatIntervention ?? record.etat ?? record.statut ?? null,
    record.avancement ?? null,
    record.emplacement ?? null,
  ];
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  let imported = 0;
  for (const collection of vehicleCollections) {
    const rows = Array.isArray(bundle[collection]) ? bundle[collection] : [];
    for (const [index, record] of rows.entries()) {
      const [noOr, chassis, team, status, advancement, location] = vehicleColumns(record);
      await client.query(
        `INSERT INTO vehicles (record_type, record_key, no_or, chassis, team, status, advancement, location, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (record_type, record_key) DO UPDATE SET
           no_or = EXCLUDED.no_or, chassis = EXCLUDED.chassis, team = EXCLUDED.team,
           status = EXCLUDED.status, advancement = EXCLUDED.advancement, location = EXCLUDED.location,
           payload = EXCLUDED.payload, updated_at = NOW()`,
        [collection, stableKey(record, collection, index), noOr, chassis, team, status, advancement, location, JSON.stringify(record)],
      );
      imported += 1;
    }
  }

  for (const collection of recordCollections) {
    const rows = Array.isArray(bundle[collection]) ? bundle[collection] : [];
    for (const [index, record] of rows.entries()) {
      const key = stableKey(record, collection, index);
      const vehicleKey = String(record.vehicleId ?? record.noOr ?? record.or ?? record.chassis ?? '') || null;
      await client.query(
        `INSERT INTO app_records (collection, record_key, vehicle_key, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (collection, record_key) DO UPDATE SET
           vehicle_key = EXCLUDED.vehicle_key, payload = EXCLUDED.payload, updated_at = NOW()`,
        [collection, key, vehicleKey, JSON.stringify(record)],
      );
      imported += 1;
    }
  }

  const accounts = Array.isArray(bundle.accounts) ? bundle.accounts : [];
  for (const account of accounts) {
    if (!account.email || !account.password || !['administration', 'chef_atelier', 'reception', 'chef_equipe'].includes(account.role)) continue;
    await client.query(
      `INSERT INTO accounts (id, name, email, password_hash, role, assigned_team)
       VALUES ($1, $2, LOWER($3), $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role, assigned_team = EXCLUDED.assigned_team, updated_at = NOW()`,
      [account.id || randomUUID(), account.name || account.email, account.email, hashPassword(account.password), account.role, account.assignedTeam || null],
    );
    imported += 1;
  }

  await client.query('COMMIT');
  console.log(`${imported} enregistrement(s) importé(s) dans PostgreSQL.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
