import { atelierMapSvg } from '../src/components/atelierMapMarkup.ts';
import { ALL_EMPLACEMENTS } from '../src/services/emplacementService.ts';

const mapZoneIds = new Set(
  Array.from(atelierMapSvg.matchAll(/\bid="([^"]+)"/g), (match) =>
    match[1].toUpperCase()
  )
);

console.log('Total mapZoneIds:', mapZoneIds.size);
const missingInMap = ALL_EMPLACEMENTS.filter(emp => !mapZoneIds.has(emp.toUpperCase()));
console.log('Missing in map:', missingInMap);
