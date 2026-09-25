const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const gidSuivi = '748226721';
const gidChargement = '294141427';

async function test(name, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url);
  const text = await res.text();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  const json = JSON.parse(text.substring(s, e + 1));
  const rows = json.table.rows;

  let derniereLigneRemplie = 1;
  for (let r = rows.length - 1; r >= 0; r--) {
    const noOr = rows[r].c && rows[r].c[0] ? String(rows[r].c[0].f || rows[r].c[0].v || '').trim() : '';
    const chassis = rows[r].c && rows[r].c[2] ? String(rows[r].c[2].f || rows[r].c[2].v || '').trim() : '';

    if ((noOr !== '' && noOr !== '-' && !noOr.startsWith('#') && !noOr.startsWith('SHEET-')) ||
        (chassis !== '' && chassis !== '-' && !chassis.startsWith('#'))) {
      derniereLigneRemplie = r + 2; // +1 pour 1-based, +1 pour ligne header
      console.log(`[${name}] Dernière ligne réelle trouvée: Ligne ${derniereLigneRemplie} (N° OR: "${noOr}", Châssis: "${chassis}")`);
      break;
    }
  }

  const ligneCible = derniereLigneRemplie + 1;
  console.log(`=> Prochaine entrée sera écrite à la Ligne : ${ligneCible}`);
  return ligneCible;
}

async function run() {
  await test('Suivi des entrées', gidSuivi);
  await test('Tableaux de chargement', gidChargement);
}

run().catch(console.error);
