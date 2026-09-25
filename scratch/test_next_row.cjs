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

function simulerTrouverProchaineLigne(rows) {
  let derniereLigneReelle = 1;
  const limit = Math.min(1000, rows.length);
  for (let r = limit - 1; r >= 0; r--) {
    const c = rows[r]?.c || [];
    const noOr = String(c[0]?.v || '').trim();
    const chassis = String(c[2]?.v || '').trim();

    const hasOr = noOr !== '' && noOr !== '-' && !noOr.startsWith('SHEET-');
    const hasVin = chassis !== '' && chassis !== '-';

    if (hasOr || hasVin) {
      derniereLigneReelle = r + 2; // gviz rows[0] is sheet row 2
      break;
    }
  }
  return derniereLigneReelle + 1;
}

async function run() {
  const tdc = await fetchSheet('294141427');
  console.log('TDC prochaine ligne:', simulerTrouverProchaineLigne(tdc.rows));

  const suivi = await fetchSheet('748226721');
  console.log('Suivi prochaine ligne:', simulerTrouverProchaineLigne(suivi.rows));
}

run().catch(console.error);
