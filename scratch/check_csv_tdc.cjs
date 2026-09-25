const https = require('https');

const sheetId = '1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c';

// Let's fetch csv or export of rows to see if they are formulas
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=294141427`;

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log(`Total CSV lines in tableaux de chargement: ${lines.length}`);
    for (let i = 968; i <= Math.min(lines.length - 1, 976); i++) {
      console.log(`Line ${i + 1}: ${lines[i]}`);
    }
  });
});
