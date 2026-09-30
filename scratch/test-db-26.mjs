import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://flux_app:flux_app@127.0.0.1:5432/flux_atelier_app' });
const res = await pool.query("SELECT id, record_type, payload->>'technicien' as tech, payload->>'nomTechnicien' as nom FROM vehicles WHERE id IN (25, 26)");
console.log(res.rows);
await pool.end();
