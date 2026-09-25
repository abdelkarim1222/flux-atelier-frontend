const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const gid = '737549566';

async function test(v) {
  const q = encodeURIComponent(`select C, D, E, G, AD, AF where upper(C) = '${v.toUpperCase()}' limit 1`);
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&tq=${q}`;
  const t = await fetch(url).then(r => r.text());
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  const json = JSON.parse(t.substring(s, e + 1));
  if (json.table.rows.length > 0) {
    const c = json.table.rows[0].c;
    console.log('Found:', v, {
      marque: c[1] ? (c[1].f || c[1].v) : '',
      modele: c[2] ? (c[2].f || c[2].v) : '',
      categorie: c[3] ? (c[3].f || c[3].v) : '',
      codeClient: c[4] ? (c[4].f || c[4].v) : '',
      nomClient: c[5] ? (c[5].f || c[5].v) : ''
    });
  } else {
    console.log('Not found in VIN sheet:', v);
  }
}

async function run() {
  await test('ZCFCA50AXT5737139');
  await test('AXFC35A81BS869745');
  await test('ZCFAD1LG602683195');
}

run().catch(console.error);
