import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL est requis.');
  process.exit(1);
}

const sourcePath = fileURLToPath(new URL('../data/accounts.json', import.meta.url));
const accounts = JSON.parse(await readFile(sourcePath, 'utf8'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const client = await pool.connect();
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(String(password), salt, 64).toString('hex')}`;
}

try {
  await client.query('BEGIN');
  for (const account of accounts) {
    if (!account.email || !account.password || !['administration', 'chef_atelier', 'reception', 'chef_equipe'].includes(account.role)) continue;
    await client.query(
      `INSERT INTO accounts (id, name, email, password_hash, role, assigned_team)
       VALUES ($1, $2, LOWER($3), $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role, assigned_team = EXCLUDED.assigned_team, updated_at = NOW()`,
      [account.id || randomUUID(), account.name || account.email, account.email, hashPassword(account.password), account.role, account.assignedTeam || null],
    );
  }
  await client.query('COMMIT');
  console.log(`${accounts.length} compte(s) importé(s) avec des mots de passe hachés.`);
  if (process.argv.includes('--redact-source')) {
    await (await import('node:fs/promises')).writeFile(sourcePath, '[]\n', 'utf8');
    console.log('Le fichier local de comptes a été vidé après import.');
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
