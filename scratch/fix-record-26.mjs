import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://flux_app:flux_app@127.0.0.1:5432/flux_atelier_app' });

const r = await pool.query("SELECT payload FROM vehicles WHERE id = 26");
if (r.rows[0]) {
  const p = r.rows[0].payload;
  p.technicien = '1214';
  p.nomTechnicien = 'Montassar Bjaoui1';
  p.poste = 'MECANICIEN';
  await pool.query("UPDATE vehicles SET payload = $1::jsonb WHERE id = 26", [JSON.stringify(p)]);
  console.log('Vehicle 26 updated successfully!');
}

await pool.end();
