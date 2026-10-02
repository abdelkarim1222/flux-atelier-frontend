import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/flux_atelier'
});

async function main() {
  const res = await pool.query("SELECT record_type, record_key, no_or, chassis, created_at, updated_at, payload FROM vehicles ORDER BY updated_at DESC LIMIT 5");
  console.log("Found rows:", res.rows.length);
  for (const r of res.rows) {
    console.log("=== OR:", r.no_or, "Chassis:", r.chassis, "Type:", r.record_type);
    console.log("Created at:", r.created_at);
    console.log("Payload:", JSON.stringify(r.payload, null, 2));
  }
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
