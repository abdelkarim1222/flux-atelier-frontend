const https = require('https');

const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const vinGid = '737549566';

function fetchBottomVinRows() {
  return new Promise((resolve, reject) => {
    // Query count and last rows
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${vinGid}&tq=` + encodeURIComponent('select A, B, C, D, E, G, AD, AF order by A desc limit 10');
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonText = data.substring(data.indexOf('{'), data.lastIndexOf('}') + 1);
          const parsed = JSON.parse(jsonText);
          resolve(parsed.table.rows);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const rows = await fetchBottomVinRows();
  console.log(`Top rows sorted by A desc: ${rows.length}`);
  rows.forEach((r, idx) => {
    const c = r.c.map(cell => cell ? (cell.f || cell.v) : null);
    console.log(`Row ${idx + 1}: VSN=${c[0]} | Date=${c[1]} | VIN=${c[2]} | Marque=${c[3]} | Modele=${c[4]} | Desc=${c[5]} | CodeClient=${c[6]} | Client=${c[7]}`);
  });
}

run().catch(console.error);
