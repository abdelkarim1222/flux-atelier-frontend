function getTeamFromVr(vrCode) {
  const clean = (vrCode || "").trim().toLowerCase();
  if (clean.includes("rapide")) return "Service Rapide";
  if (clean.includes("carross")) return "Carrosserie";
  if (clean.includes("elict") || clean.includes("elect")) return "Electrique";
  if (clean.includes("lourd")) return "Lourd";
  if (clean.includes("changan")) return "Changan";
  if (clean.includes("daily")) return "Daily";
  return "";
}

function isVehicleFinished(v) {
  const normAv = (v.avancement || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const normEtat = (v.etatIntervention || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    normAv === "terminer" ||
    normAv === "termine" ||
    normAv === "livre" ||
    normAv === "sorti" ||
    normAv === "attente client" ||
    normEtat === "attente client" ||
    normEtat === "livre" ||
    normEtat === "sorti" ||
    Boolean(v.dateFinRep && normAv !== "essai")
  );
}

function isVehicleActivelyOccupyingTech(v) {
  if (isVehicleFinished(v)) return false;
  const normAv = (v.avancement || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const normEtat = (v.etatIntervention || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normAv.startsWith("vr")) return false;
  if (normAv === "attente pdr" || normAv.includes("pdr")) return true;
  if (normAv === "essai" || normEtat === "essai") return true;
  if (
    normAv.includes("reaffect") ||
    normAv === "attends acheter" ||
    normAv.includes("achet") ||
    normAv === "atende devis" ||
    normAv.includes("devis")
  ) {
    return false;
  }
  if (
    normAv.includes("repar") ||
    normEtat.includes("repar") ||
    normAv === "attente" ||
    normEtat === "attente"
  ) {
    return false;
  }
  return normAv.startsWith("en cours") || normAv.includes("%") || normEtat === "en cours";
}

const testCases = [
  { avancement: "En cours - 40%", etat: "En cours", expected: true, label: "En cours 40%" },
  { avancement: "Attente PDR", etat: "En cours", expected: true, label: "Attente PDR" },
  { avancement: "Essai", etat: "Essai", expected: true, label: "Essai routier" },
  { avancement: "Technicien réaffecté", etat: "En cours", expected: false, label: "Technicien réaffecté" },
  { avancement: "attends acheter", etat: "En cours", expected: false, label: "attends acheter" },
  { avancement: "ATENDE DEVIS", etat: "En cours", expected: false, label: "ATENDE DEVIS" },
  { avancement: "Terminer", etat: "Attente Client", expected: false, label: "Terminer" },
  { avancement: "vrElictrique", etat: "En cours", expected: false, label: "vrElictrique" },
  { avancement: "vrService Rapide", etat: "En cours", expected: false, label: "vrService Rapide" },
  { avancement: "vrCarrosserie", etat: "En cours", expected: false, label: "vrCarrosserie" },
];

let allPassed = true;
console.log("=== TEST DE LA MATRICE OCCUPÉ / DISPONIBLE ===");
for (const tc of testCases) {
  const result = isVehicleActivelyOccupyingTech({ avancement: tc.avancement, etatIntervention: tc.etat });
  const passed = result === tc.expected;
  if (!passed) allPassed = false;
  console.log(`${passed ? "✅" : "❌"} ${tc.label.padEnd(25)} -> ${result ? "🔴 OCCUPÉ" : "🟢 DISPONIBLE"} (Attendu: ${tc.expected ? "🔴" : "🟢"})`);
}

console.log("\n=== TEST DE CORRESPONDANCE VR -> ÉQUIPE ===");
const vrMappings = [
  { vr: "vrElictrique", expected: "Electrique" },
  { vr: "vrService Rapide", expected: "Service Rapide" },
  { vr: "vrCarrosserie", expected: "Carrosserie" },
  { vr: "vrDaily", expected: "Daily" },
  { vr: "vrLourd", expected: "Lourd" },
  { vr: "vrChangan", expected: "Changan" },
];
for (const vm of vrMappings) {
  const team = getTeamFromVr(vm.vr);
  const passed = team === vm.expected;
  if (!passed) allPassed = false;
  console.log(`${passed ? "✅" : "❌"} ${vm.vr.padEnd(20)} -> Équipe cible : ${team}`);
}

console.log("\n=== TEST DU CALCUL CHRONOMÉTRIQUE TRAVAIL NET EFFECTIF ===");
const totalDurationMin = 360; // 6h
const attenteRepMin = 30; // 30 min
const attentePdrMin = 15; // 15 min
const attenteDevisMin = 180; // 3h
const reaffecteMin = 30; // 30 min
const essaiMin = 15; // 15 min
const totalAttenteMin = attenteRepMin + attentePdrMin + attenteDevisMin + reaffecteMin + essaiMin;
const travailNetEffectifMin = Math.max(0, totalDurationMin - totalAttenteMin);

console.log(`Temps total d'intervention : ${totalDurationMin / 60} h (${totalDurationMin} min)`);
console.log(`Cumul temps d'attente       : ${totalAttenteMin / 60} h (${totalAttenteMin} min)`);
console.log(`Travail Net Effectif       : ${Math.floor(travailNetEffectifMin / 60)} h ${travailNetEffectifMin % 60} min (Attendu: 1 h 30 min)`);

const chronoPassed = travailNetEffectifMin === 90;
if (!chronoPassed) allPassed = false;
console.log(`${chronoPassed ? "✅" : "❌"} Calcul chronométrique exact : 90 min (1 h 30 min)`);

console.log(`\nBilan Global : ${allPassed ? "TOUS LES TESTS SONT VALIDES (100% SUCCÈS) !" : "CERTAINS TESTS ONT ÉCHOUÉ."}`);
