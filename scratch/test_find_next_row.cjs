const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const gidSuivi = '748226721';
const gidChargement = '294141427';

async function testSheet(name, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url);
  const text = await res.text();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  const json = JSON.parse(text.substring(s, e + 1));

  const rows = json.table.rows;
  console.log(`\n=== ${name} (total rows in gviz: ${rows.length}) ===`);

  // Scan backwards to find the last row with a real N° OR (col 0 / Col A)
  let lastRealRow = 0;
  let lastVal = '';

  for (let i = rows.length - 1; i >= 0; i--) {
    const cell = rows[i].c && rows[i].c[0];
    const val = cell ? String(cell.f || cell.v || '').trim() : '';
    if (val !== '' && val !== '-' && !val.startsWith('#')) {
      lastRealRow = i + 2; // 1 for header row, 1 for 0-index
      lastVal = val;
      break;
    }
  }

  console.log(`Dernière ligne avec N° OR réel : Ligne ${lastRealRow} (Valeur: "${lastVal}")`);
  console.log(`Nouvelle entrée sera écrite à la Ligne : ${lastRealRow + 1}`);
}

async function run() {
  await testSheet('Suivi des entrées', gidSuivi);
  await testSheet('Tableaux de chargement', gidChargement);
}

run().catch(console.error);
