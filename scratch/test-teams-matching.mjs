import { isVehicleMatchingTeam } from '../src/config/teams.ts';

console.log('Test team matching rules:');
const tests = [
  { vehicle: 'Daily', user: 'Daily1', expected: true },
  { vehicle: 'Daily', user: 'Daily2', expected: true },
  { vehicle: 'Daily', user: 'Service Rapide', expected: false },
  { vehicle: 'Daily', user: 'Carrosserie', expected: false },
  { vehicle: 'Daily', user: 'Lourd', expected: false },
  { vehicle: 'Daily', user: 'Elictrique', expected: false },
  { vehicle: 'Daily', user: 'Changan', expected: false },
  { vehicle: 'Daily1', user: 'Daily1', expected: true },
  { vehicle: 'Daily2', user: 'Daily2', expected: true },
  { vehicle: 'Service Rapide', user: 'Service Rapide', expected: true },
  { vehicle: 'Service Rapide', user: 'Daily1', expected: false },
  { vehicle: 'Carrosserie', user: 'Carrosserie', expected: true },
  { vehicle: 'Carrosserie', user: 'Daily2', expected: false },
  { vehicle: 'Elictrique', user: 'Elictrique', expected: true },
  { vehicle: 'Elictrique', user: 'Daily1', expected: false },
  { vehicle: 'Lourd', user: 'Lourd', expected: true },
  { vehicle: 'Lourd', user: 'Daily1', expected: false },
];

let allPassed = true;
for (const t of tests) {
  const result = isVehicleMatchingTeam(t.vehicle, t.user);
  const ok = result === t.expected;
  if (!ok) allPassed = false;
  console.log(`${ok ? '✅' : '❌'} Vehicule: "${t.vehicle}" | User: "${t.user}" => ${result} (expected ${t.expected})`);
}

if (allPassed) {
  console.log('\n🎉 ALL MATCHING TESTS PASSED PERFECTLY!');
} else {
  console.error('\n⚠️ SOME TESTS FAILED');
  process.exit(1);
}
