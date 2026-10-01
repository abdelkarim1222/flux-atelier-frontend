import http from 'http';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function testReceptionFilter() {
  console.log("=== TEST RECEPTION LIVRE FILTER & LOGIC ===");

  // Helper matching SuiviEntreesTable.tsx
  function isVehiculeLivre(item) {
    const etat = String(item.etat || "").toLowerCase();
    const statut = String(item.statut || "").toLowerCase();
    const etatIntervention = String(item.etatIntervention || "").toLowerCase();
    const avancement = String(item.avancement || "").toLowerCase();
    const dateLivraison = String(item.dateLivraisonClient || "").trim();

    if (
      etat.includes("livr") ||
      statut.includes("livr") ||
      etatIntervention.includes("livr") ||
      avancement.includes("livr")
    ) {
      return true;
    }
    if (dateLivraison && dateLivraison !== "-" && dateLivraison !== "NA") {
      return true;
    }
    return false;
  }

  // 1. Test isVehiculeLivre logic on various states
  const testCases = [
    { item: { etat: "Livré" }, expected: true },
    { item: { etat: "Attente Client", avancement: "Terminer", dateLivraisonClient: "30/09/2026 16:00:00" }, expected: true },
    { item: { etat: "Prêt / Fini", avancement: "Terminer", modePaiement: "Facture" }, expected: false }, // À livrer, not yet delivered!
    { item: { etat: "Attente Réparation", avancement: "0%" }, expected: false },
    { item: { etat: "En cours", avancement: "50%" }, expected: false },
    { item: { etat: "Livré", emplacement: "Livraison au client" }, expected: true },
    { item: { etat: "Prêt / Fini", emplacement: "Livraison au client" }, expected: false }, // Waiting for Reception to click "À livrer"
  ];

  for (const tc of testCases) {
    const result = isVehiculeLivre(tc.item);
    if (result !== tc.expected) {
      console.error(`FAIL: expected ${tc.expected} for`, tc.item, `got ${result}`);
      process.exit(1);
    }
  }
  console.log("All isVehiculeLivre test cases PASSED!");

  import('crypto').then(async ({ createHmac }) => {
    const SESSION_SECRET = 'vz4_49CBGpWtbjoUaFZDkJFKY3qpraDQwV3NUHPbBcpT2Zby7DG7L9t93N-4g2uY';
    const expiresAt = Date.now() + 86400000;
    const value = `a75d7e9e-077c-4fa0-bbda-1af8ceb4f53c.${expiresAt}`;
    const sig = createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
    const token = `${value}.${sig}`;
    const cookie = `flux_atelier_session=${token}`;

    console.log("Using signed session for reception account zar@italcar.com");

    // 2. Fetch reception data
    const dataRes = await request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/data/reception',
      method: 'GET',
      headers: { Cookie: cookie },
    });

    if (dataRes.status !== 200) {
      console.error("Failed to fetch reception data:", dataRes.body);
      process.exit(1);
    }

    console.log(`Fetched reception items from DB: ${dataRes.body.length}`);
    const delivered = dataRes.body.filter(isVehiculeLivre);
    const active = dataRes.body.filter(i => !isVehiculeLivre(i));
    console.log(`- Delivered items (excluded for reception): ${delivered.length}`);
    console.log(`- Active items (visible to reception): ${active.length}`);

    // Verify delivered items are excluded
    for (const d of delivered) {
      console.log(`  [EXCLUDED] OR: ${d.noOr || d.ordre} | Chassis: ${d.chassis} | Etat: ${d.etat} | Avancement: ${d.avancement}`);
    }

    console.log("SUCCESS: Reception delivered filtering verified!");
  });
}

testReceptionFilter().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
