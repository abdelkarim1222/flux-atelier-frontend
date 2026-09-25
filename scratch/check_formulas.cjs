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
  console.log('=== tableaux de chargement (294141427) ===');
  const tdc = await fetchSheet('294141427');
  for (let r = 970; r <= 976; r++) {
    const row = tdc.rows[r - 2];
    console.log(`Row ${r}:`, JSON.stringify(row ? row.c.slice(0, 7) : null));
  }

  console.log('\n=== Suivi des entrées (748226721) ===');
  const suivi = await fetchSheet('748226721');
  console.log(`Suivi rows count: ${suivi.rows.length}`);
  for (let r = Math.max(1, suivi.rows.length - 10); r <= suivi.rows.length; r++) {
    const row = suivi.rows[r - 2];
    console.log(`Row ${r}:`, JSON.stringify(row ? row.c.slice(0, 7) : null));
  }
}

run().catch(console.error);
