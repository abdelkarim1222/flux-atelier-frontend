const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const gidChargement = '294141427';
const gidSuivi = '748226721';

async function findFirstEmpty(name, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url);
  const text = await res.text();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  const json = JSON.parse(text.substring(s, e + 1));

  const rows = json.table.rows;
  console.log(`\n=== ${name} ===`);

  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i].c && rows[i].c[0];
    const val = cell ? String(cell.f || cell.v || '').trim() : '';
    if (val === '' || val === '-' || val.startsWith('#')) {
      console.log(`Première ligne vide/invalide : Ligne ${i + 2} (Index ${i}, Valeur: "${val}")`);
      return i + 2;
    }
  }
  console.log(`Aucune ligne vide trouvée avant la fin. Ligne suivante: ${rows.length + 2}`);
  return rows.length + 2;
}

async function run() {
  await findFirstEmpty('Tableaux de chargement', gidChargement);
  await findFirstEmpty('Suivi des entrées', gidSuivi);
}

run().catch(console.error);
