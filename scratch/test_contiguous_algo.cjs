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

function trouverPremiereLigneLibreContigue(rows) {
  // We scan from row 2 (index 0) onwards to find the first empty row in the contiguous table
  // Or we find the last filled row before the empty gap
  let derniereLigneRemplie = 1;

  for (let i = 0; i < rows.length; i++) {
    const sheetRow = i + 2;
    // If we already saw a gap of empty rows (e.g. at row 975), we do NOT jump to row 1001
    const c = rows[i]?.c || [];
    const noOr = String(c[0]?.v || '').trim();
    const chassis = String(c[2]?.v || '').trim();

    const hasData = (noOr !== '' && noOr !== '-' && !noOr.startsWith('SHEET-')) ||
                    (chassis !== '' && chassis !== '-');

    if (hasData) {
      // If there was a gap of more than 2 empty rows, ignore accidental rows at the very end (like row 1001)
      if (sheetRow - derniereLigneRemplie > 3 && derniereLigneRemplie > 10) {
        console.log(`Ignoring isolated/orphan row ${sheetRow} (last valid contiguous row was ${derniereLigneRemplie})`);
        break;
      }
      derniereLigneRemplie = sheetRow;
    }
  }

  return derniereLigneRemplie + 1;
}

async function run() {
  const tdc = await fetchSheet('294141427');
  console.log('TDC ligne contiguë:', trouverPremiereLigneLibreContigue(tdc.rows));

  const suivi = await fetchSheet('748226721');
  console.log('Suivi ligne contiguë:', trouverPremiereLigneLibreContigue(suivi.rows));
}

run().catch(console.error);
