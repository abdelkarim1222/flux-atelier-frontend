const https = require('https');

const SHEET_ID = "1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c";
const VIN_GID = "737549566";

const tq = encodeURIComponent("select * where C = 'TESTVIN999999999'");
const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${VIN_GID}&tq=${tq}`;

https.get(url, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const start = data.indexOf('{');
    const end = data.lastIndexOf('}');
    const json = JSON.parse(data.substring(start, end + 1));
    console.log("Matching rows:", json.table.rows ? json.table.rows.length : 0);
    if (json.table.rows) {
      json.table.rows.forEach(r => {
        r.c.forEach((c, idx) => {
          if (c && (c.v !== null || c.f !== null)) {
            console.log(`Col ${idx}: ${c.f || c.v}`);
          }
        });
      });
    }
  });
}).on('error', console.error);
