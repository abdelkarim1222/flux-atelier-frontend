const https = require('https');

const SHEET_ID = "1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c";
const VIN_GID = "737549566";

const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${VIN_GID}&tq=${encodeURIComponent("limit 3")}`;

https.get(url, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const start = data.indexOf('{');
    const end = data.lastIndexOf('}');
    if (start === -1 || end === -1) {
      console.log("Raw response:", data.slice(0, 300));
      return;
    }
    const json = JSON.parse(data.substring(start, end + 1));
    console.log("Cols count:", json.table.cols.length);
    json.table.cols.forEach((col, idx) => {
      console.log(`Col ${idx} (${String.fromCharCode(65 + (idx % 26))}${idx >= 26 ? '2' : ''}): id=${col.id}, label="${col.label}"`);
    });
    if (json.table.rows && json.table.rows.length > 0) {
      console.log("\nSample Row 0 values:");
      json.table.rows[0].c.forEach((cell, idx) => {
        if (cell && (cell.v !== null || cell.f !== null)) {
          console.log(`  Col ${idx}: v="${cell.v}", f="${cell.f}"`);
        }
      });
    }
  });
}).on('error', console.error);
