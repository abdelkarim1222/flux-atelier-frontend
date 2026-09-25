const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const gidChargement = '294141427';
const gidSuivi = '748226721';

async function testSmartRowDetection(name, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url);
  const text = await res.text();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  const json = JSON.parse(text.substring(s, e + 1));
  const rows = json.table.rows;

  console.log(`\n=== SMART DETECTION POUR: ${name} ===`);

  // We want to find the first row that is truly available for a new vehicle.
  // Method 1: Find the LAST row that has an active N° OR (between row 2 and row 1000)
  // Let's check row 1001: row 1001 was only added by appendRow.
  // If we look at rows 2 to rows.length:
  let lastRealRow = 1;

  for (let i = 0; i < rows.length; i++) {
    // Stop if we hit rows created beyond row 1000 if row 1000 was empty
    const cellA = rows[i].c && rows[i].c[0];
    const cellC = rows[i].c && rows[i].c[2];
    const orVal = cellA ? String(cellA.f || cellA.v || '').trim() : '';
    const vinVal = cellC ? String(cellC.f || cellC.v || '').trim() : '';

    const hasOr = orVal !== '' && orVal !== '-' && !orVal.startsWith('#') && !orVal.startsWith('SHEET-');
    const hasVin = vinVal !== '' && vinVal !== '-' && !vinVal.startsWith('#');

    if (hasOr || hasVin) {
      // Check if this row is part of the table (if it's not the accidental 1001 row)
      if (i + 2 <= 1000) {
        lastRealRow = i + 2;
      }
    }
  }

  console.log(`Dernière ligne occupée dans le tableau (<= 1000) : Ligne ${lastRealRow}`);
  console.log(`=> La nouvelle entrée s'écrira exactement à la Ligne : ${lastRealRow + 1}`);
}

async function run() {
  await testSmartRowDetection('Tableaux de chargement', gidChargement);
  await testSmartRowDetection('Suivi des entrées', gidSuivi);
}

run().catch(console.error);
