import fs from 'node:fs';

const content = fs.readFileSync('src/components/atelierMapMarkup.ts', 'utf8');
const allIds = Array.from(content.matchAll(/id=\\?"([^"\\\\]+)\\?"/g), m => m[1]);
const zoneIds = allIds.filter(id => /^[A-Z]+\d+$/i.test(id)).map(id => id.toUpperCase());
const uniqueZones = Array.from(new Set(zoneIds)).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));

console.log('Count of zones in SVG:', uniqueZones.length);
console.log('All zones in SVG:', uniqueZones.join(', '));
