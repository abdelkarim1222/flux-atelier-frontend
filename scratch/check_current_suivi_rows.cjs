const https = require('https');

const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';

function fetchSheet(gid) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonText = data.substring(data.indexOf('{'), data.lastIndexOf('}') + 1);
          const parsed = JSON.parse(jsonText);
          resolve({ cols: parsed.table.cols, rows: parsed.table.rows });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const { rows } = await fetchSheet('294141427');
  console.log(`Total rows returned in tableaux de chargement (gid 294141427): ${rows.length}`);
  for (let i = Math.max(0, rows.length - 35); i < rows.length; i++) {
    const sheetRowNumber = i + 2;
    const c = rows[i]?.c || [];
    const orVal = c[0] ? (c[0].f || c[0].v || '') : '';
    const csVal = c[1] ? (c[1].f || c[1].v || '') : '';
    const vinVal = c[2] ? (c[2].f || c[2].v || '') : '';
    const marqueVal = c[3] ? (c[3].f || c[3].v || '') : '';
    const etatVal = c[5] ? (c[5].f || c[5].v || '') : '';
    console.log(`Row ${sheetRowNumber}: OR="${orVal}" | CS="${csVal}" | VIN="${vinVal}" | Marque="${marqueVal}" | Etat="${etatVal}"`);
  }
}

run().catch(console.error);
