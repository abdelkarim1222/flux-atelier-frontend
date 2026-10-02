import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://flux_app:flux_app@127.0.0.1:5432/flux_atelier_app'
});

async function main() {
  console.log("=== Repairing vehicle dates in PostgreSQL ===");

  // 1. Repair CS26-021109 (STE OUANNES DE TRANSPORT SOT)
  // Delete duplicate flux row 1454
  const del1454 = await pool.query("DELETE FROM vehicles WHERE id = 1454");
  console.log("Deleted duplicate row 1454:", del1454.rowCount);

  // Update reception row 1366 with true entry date and repair dates
  const rep1366 = await pool.query(`
    UPDATE vehicles
    SET payload = payload || jsonb_build_object(
      'dateEntreeHeure', '02/10/2026 08:22:29',
      'dateEntree', '02/10/2026',
      'dateDebutRep', '02/10/2026 08:33:43',
      'dateDebutTravail', '02/10/2026 08:33:43',
      'dateFinRep', '02/10/2026 10:18',
      'dateFin', '02/10/2026 10:18'
    ),
    updated_at = NOW()
    WHERE id = 1366
  `);
  console.log("Updated reception row 1366:", rep1366.rowCount);

  // Update flux row 1367 with facturation validation fields
  const rep1367 = await pool.query(`
    UPDATE vehicles
    SET payload = payload || jsonb_build_object(
      'modePaiement', 'Att Facture',
      'statutFacturation', 'edition_fin_travaux',
      'statutFacturationFinale', 'non_facture',
      'dateValidationFacturation', '02/10/2026 10:33:09',
      'facturationValideePar', 'AYMEN BEN ALI',
      'attFactureOption', 'standard',
      'dateEntreeHeure', '02/10/2026 08:22:29',
      'dateDebutRep', '02/10/2026 08:33:43',
      'dateFinRep', '02/10/2026 10:18'
    ),
    updated_at = NOW()
    WHERE id = 1367
  `);
  console.log("Updated flux row 1367:", rep1367.rowCount);

  // 2. Repair CS26-018064
  // Delete duplicate reception row 1445
  const del1445 = await pool.query("DELETE FROM vehicles WHERE id = 1445");
  console.log("Deleted duplicate row 1445:", del1445.rowCount);

  // Update flux row 671 with true entry date
  const rep671 = await pool.query(`
    UPDATE vehicles
    SET payload = payload || jsonb_build_object(
      'dateEntreeHeure', '01/10/2026 08:36:42',
      'dateEntree', '01/10/2026'
    ),
    updated_at = NOW()
    WHERE id = 671
  `);
  console.log("Updated flux row 671:", rep671.rowCount);

  // Update reception row 670 with facturation info if needed
  const rep670 = await pool.query(`
    UPDATE vehicles
    SET payload = payload || jsonb_build_object(
      'dateEntreeHeure', '01/10/2026 08:36:42',
      'dateEntree', '01/10/2026'
    ),
    updated_at = NOW()
    WHERE id = 670
  `);
  console.log("Updated reception row 670:", rep670.rowCount);

  console.log("=== Verification of CS26-021109 rows ===");
  const verify = await pool.query(`
    SELECT id, record_type, record_key, payload->>'dateEntreeHeure' as entree, payload->>'dateDebutRep' as debut, payload->>'dateFinRep' as fin, payload->>'modePaiement' as mode
    FROM vehicles
    WHERE no_or = 'CS26-021109'
  `);
  console.table(verify.rows);

  await pool.end();
}

main().catch(err => {
  console.error("Error repairing:", err);
  process.exit(1);
});
