const https = require('https');

const SHEET_ID = "1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c";
const VIN_GID = "737549566";

// Fetch header and first few rows without filtering
const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${VIN_GID}&range=A1:AL5`;

https.get(url, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const start = data.indexOf('{');
    const end = data.lastIndexOf('}');
    const json = JSON.parse(data.substring(start, end + 1));
    console.log("Headers (row 0 or labels):");
    if (json.table.rows && json.table.rows.length > 0) {
      json.table.rows.forEach((r, rIdx) => {
        console.log(`\n--- ROW ${rIdx} ---`);
        r.c.forEach((c, cIdx) => {
          if (c && (c.v !== null || c.f !== null)) {
            console.log(`  Col ${cIdx} (${cIdx < 26 ? String.fromCharCode(65+cIdx) : 'A'+String.fromCharCode(65+cIdx-26)}): ${c.f || c.v}`);
          }
        });
      });
    }
  });
}).on('error', console.error);
