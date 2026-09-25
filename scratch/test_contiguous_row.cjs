const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const gidChargement = '294141427';
const gidSuivi = '748226721';

async function findNextContiguousRow(name, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const res = await fetch(url);
  const text = await res.text();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  const json = JSON.parse(text.substring(s, e + 1));
  const rows = json.table.rows;

  console.log(`\n=== DETECTION LIGNE CONTIGUË : ${name} ===`);

  // Scan downwards from row 2 (index 0)
  // We want to find the end of the continuous active block.
  // When we see an empty row (or #REF!) where the next 2 rows are also empty,
  // that row is the first empty slot at the end of the block!
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cellA = r.c && r.c[0];
    const cellC = r.c && r.c[2];
    const valA = cellA ? String(cellA.f || cellA.v || '').trim() : '';
    const valC = cellC ? String(cellC.f || cellC.v || '').trim() : '';

    const isEmpty = (valA === '' || valA === '-' || valA.startsWith('#')) &&
                    (valC === '' || valC === '-' || valC.startsWith('#'));

    if (isEmpty) {
      // Check if next row is also empty (to be sure it's not just an accidental isolated gap)
      const nextR = rows[i + 1];
      const nextValA = nextR && nextR.c && nextR.c[0] ? String(nextR.c[0].f || nextR.c[0].v || '').trim() : '';
      const nextIsEmpty = !nextR || nextValA === '' || nextValA === '-' || nextValA.startsWith('#');

      if (nextIsEmpty) {
        console.log(`=> Fin du bloc continu détectée à la Ligne : ${i + 2}`);
        return i + 2;
      }
    }
  }

  console.log(`=> Aucune ligne vide contiguë trouvée, ajouter à la fin : Ligne ${rows.length + 2}`);
  return rows.length + 2;
}

async function run() {
  await findNextContiguousRow('Tableaux de chargement', gidChargement);
  await findNextContiguousRow('Suivi des entrées', gidSuivi);
}

run().catch(console.error);
