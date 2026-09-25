const https = require('https');

const SHEET_ID = "1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const html = await fetchUrl(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
  
  // Look for bootstrap data or sheet info
  const matches = [...html.matchAll(/\[\d+,\d+,"([^"]+)",(?:null|\d+),(?:null|\d+),(?:null|\d+),(?:null|"[^"]*"),\d+,(\d+)\]/g)];
  console.log('Found sheet tabs via regex:');
  matches.forEach(m => {
    console.log(`- Name: "${m[1]}", GID: ${m[2]}`);
  });

  // Alternative pattern: search for any occurrence of "VIN"
  let pos = 0;
  while ((pos = html.indexOf('VIN', pos)) !== -1) {
    const snippet = html.substring(Math.max(0, pos - 80), Math.min(html.length, pos + 120)).replace(/\s+/g, ' ');
    console.log(`VIN snippet at ${pos}: ${snippet}`);
    pos += 3;
    if (pos > 1000000) break;
  }
}

main().catch(console.error);
