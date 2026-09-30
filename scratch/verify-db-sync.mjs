import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://flux_app:flux_app@127.0.0.1:5432/flux_atelier_app' });

// Check records 25 and 26
const res = await pool.query("SELECT id, record_type, no_or, chassis, payload->>'technicien' as tech, payload->>'nomTechnicien' as nom_tech, payload->>'avancement' as avancement, payload->>'emplacement' as emp FROM vehicles WHERE id IN (25, 26)");
console.log('Vehicles 25 & 26:', res.rows);

await pool.end();
