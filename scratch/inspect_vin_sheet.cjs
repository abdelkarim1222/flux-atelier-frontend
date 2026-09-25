const https = require('https');

const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';
const vinGid = '737549566';

function fetchSheetHeaders() {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${vinGid}&tq=` + encodeURIComponent('select * limit 3');
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonText = data.substring(data.indexOf('{'), data.lastIndexOf('}') + 1);
          const parsed = JSON.parse(jsonText);
          resolve(parsed.table);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const table = await fetchSheetHeaders();
  console.log(`Total cols: ${table.cols.length}`);
  table.cols.forEach((col, idx) => {
    const letter = getColLetter(idx);
    console.log(`Col ${idx} (${letter}): id="${col.id}", label="${col.label}"`);
  });
  console.log('\nSample row 1:');
  if (table.rows.length > 0) {
    table.rows[0].c.forEach((cell, idx) => {
      if (cell && (cell.v !== null || cell.f !== null)) {
        console.log(`  Col ${idx} (${getColLetter(idx)} - ${table.cols[idx]?.label}): ${cell.f || cell.v}`);
      }
    });
  }
}

function getColLetter(colIdx) {
  let temp = colIdx + 1;
  let letter = '';
  while (temp > 0) {
    let rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

run().catch(console.error);
