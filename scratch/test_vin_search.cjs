const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const gid = '737549566';

async function searchVin(query) {
  const clean = query.trim().toUpperCase();
  if (clean.length < 5) return null;
  
  // Try exact match first, or like match
  const q = encodeURIComponent(`select C, D, E, G, AD, AF where upper(C) = '${clean}' or upper(C) like '%${clean}%' limit 1`);
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&tq=${q}`;
  
  const start = Date.now();
  const res = await fetch(url);
  const text = await res.text();
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  const json = JSON.parse(text.substring(s, e + 1));
  
  if (json.table && json.table.rows && json.table.rows.length > 0) {
    const c = json.table.rows[0].c;
    return {
      time: Date.now() - start,
      chassis: c[0] ? String(c[0].f || c[0].v || '').trim() : '',
      marque: c[1] ? String(c[1].f || c[1].v || '').trim() : '',
      modele: c[2] ? String(c[2].f || c[2].v || '').trim() : '',
      categorie: c[3] ? String(c[3].f || c[3].v || '').trim() : '',
      codeClient: c[4] ? String(c[4].f || c[4].v || '').trim() : '',
      nomClient: c[5] ? String(c[5].f || c[5].v || '').trim() : ''
    };
  }
  return null;
}

async function run() {
  console.log('Search by full chassis:', await searchVin('ZCFCA50AXT5737139'));
  console.log('Search by last 7 digits:', await searchVin('5737139'));
  console.log('Search by lowercase chassis:', await searchVin('axfc35a81bs869745'));
}

run().catch(console.error);
