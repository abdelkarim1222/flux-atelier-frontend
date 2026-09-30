import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://flux_app:flux_app@127.0.0.1:5432/flux_atelier_app' });

async function run() {
  const res = await pool.query(`
    SELECT id, record_type, record_key, no_or, chassis, payload->>'immatriculation' AS immat, payload->>'cs' AS cs, payload->>'dateEntreeHeure' AS date_entree
    FROM vehicles
    ORDER BY id DESC LIMIT 15
  `);
  console.log(res.rows);
  await pool.end();
}

run().catch(console.error);
