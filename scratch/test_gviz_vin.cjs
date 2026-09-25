const https = require('https');

const SHEET_ID = "1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c";
const VIN_GID = "737549566";

// Let's test selecting the 10 columns from the VIN sheet
const q = encodeURIComponent(`select C, D, E, F, G, K, L, AD, AF, AH limit 5`);
const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${VIN_GID}&tq=${q}`;

https.get(url, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const start = data.indexOf('{');
    const end = data.lastIndexOf('}');
    try {
      const json = JSON.parse(data.substring(start, end + 1));
      console.log("Success! Columns returned:", json.table.cols.map(c => c.label || c.id));
      if (json.table.rows && json.table.rows.length > 0) {
        console.log("Sample Row 0:");
        json.table.rows[0].c.forEach((c, idx) => {
          console.log(`  Col ${idx}: ${c ? (c.f || c.v) : null}`);
        });
      }
    } catch (e) {
      console.error("Parse error:", e);
    }
  });
}).on('error', console.error);
