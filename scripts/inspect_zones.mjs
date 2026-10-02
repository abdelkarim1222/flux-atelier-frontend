import fs from 'fs';

const c = fs.readFileSync('src/components/atelierMapMarkup.ts', 'utf8');
const idx = c.indexOf('Bay D1 -->');
console.log(JSON.stringify(c.substring(idx - 10, idx + 600)));
