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
  const tdc = await fetchSheet('294141427');
  console.log("=== Compare row numbers ===");
  // Print rows 965 to 975 in TDC
  for (let r = 965; r <= 975; r++) {
    const c = tdc.rows[r - 2]?.c || [];
    console.log(`TDC Row ${r}: OR=${c[0]?.v} | CS=${c[1]?.v} | VIN=${c[2]?.v}`);
  }
}

run().catch(console.error);
