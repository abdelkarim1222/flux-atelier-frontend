import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://flux_app:flux_app@127.0.0.1:5432/flux_atelier_app' });
const res = await pool.query("SELECT id, record_type, record_key, no_or, chassis, team, status, advancement, location, payload FROM vehicles WHERE chassis LIKE '%182707%' OR payload->>'chassis' LIKE '%182707%'");
console.log(JSON.stringify(res.rows, null, 2));
await pool.end();
