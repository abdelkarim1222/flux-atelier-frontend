const https = require('https');

const SHEET_ID = "1VlIDgAkplPVlVqLp9QELhfRWJCyAO8Jf4rq_BVIdP8c";
const SUIVI_GID = "748226721";

const q = encodeURIComponent("select A, B, C, D, E, F where E like '%S.N.B.G%' or upper(E) like '%SNBG%'");
const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SUIVI_GID}&tq=${q}`;

https.get(url, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("Response:", data.slice(0, 500));
  });
}).on('error', console.error);
