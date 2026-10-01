const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://flux_app:flux_app@127.0.0.1:5432/flux_atelier_app' });

async function run() {
  const res = await pool.query(
    "SELECT id, record_type, record_key, team, payload FROM vehicles WHERE no_or = 'CS26-020948'"
  );
  console.log('RECORDS FOR CS26-020948:');
  for (const r of res.rows) {
    console.log('--- DB ID:', r.id, 'TYPE:', r.record_type, 'RECORD_KEY:', r.record_key, 'TEAM:', r.team, '---');
    console.log(JSON.stringify(r.payload, null, 2));
  }
  const appRecs = await pool.query(
    "SELECT collection, record_key, payload FROM app_records WHERE payload::text LIKE '%020948%' OR record_key LIKE '%020948%'"
  );
  console.log('APP RECORDS:');
  for (const ar of appRecs.rows) {
    console.log(ar.collection, ar.record_key, JSON.stringify(ar.payload, null, 2));
  }
  await pool.end();
}

run().catch(console.error);
