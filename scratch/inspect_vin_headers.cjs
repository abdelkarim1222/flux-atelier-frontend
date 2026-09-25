const https = require('https');

const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const vinGid = '737549566';

function fetchVinRows() {
  return new Promise((resolve, reject) => {
    // We fetch with headers=0 so row 1 is not treated as headers
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${vinGid}&headers=0&tq=` + encodeURIComponent('select * limit 5');
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
  const rows = await fetchVinRows();
  rows.forEach((r, rowIdx) => {
    console.log(`\n=== Row ${rowIdx + 1} ===`);
    r.c.forEach((cell, colIdx) => {
      if (cell && (cell.v !== null || cell.f !== null)) {
        console.log(`  Col ${colIdx} (${String.fromCharCode(65 + (colIdx % 26))}): ${cell.f || cell.v}`);
      }
    });
  });
}

run().catch(console.error);
