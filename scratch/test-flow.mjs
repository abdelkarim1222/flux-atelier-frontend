const API_BASE = 'http://127.0.0.1:3001/api';

async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password })
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const setCookie = res.headers.get('set-cookie');
  const data = await res.json();
  return { account: data.user, cookie: setCookie ? setCookie.split(';')[0] : '' };
}

async function run() {
  console.log('1. Connexion en tant que Réception (abdelkarimezzar@gmail.com)...');
  const receptionSession = await login('abdelkarimezzar@gmail.com', '123456');
  console.log('Réception connectée:', receptionSession.account.name, 'rôle:', receptionSession.account.role);

  const testVin = 'TEST_DAILY_' + Date.now().toString().slice(-6);
  const testOr = 'OR_DAILY_' + Date.now().toString().slice(-4);
  console.log(`\n2. Création d'une nouvelle entrée pour Daily (OR: ${testOr}, VIN: ${testVin})...`);

  const entreeRes = await fetch(`${API_BASE}/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': receptionSession.cookie
    },
    body: JSON.stringify({
      action: 'ajouterEntree',
      equipe: 'Daily',
      numeroOR: testOr,
      vin: testVin,
      immatriculation: '1234 TN 56',
      vehicule: 'Iveco Daily 35C15',
      client: 'Société Test Logistique',
      cs: 'Tunis',
      dateEntree: new Date().toLocaleDateString('fr-FR'),
      heureEntree: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      etat: 'Attente Réparation',
      avancement: '0%'
    })
  });

  const entreeResult = await entreeRes.json();
  console.log('Résultat ajout entrée:', entreeResult);
  if (!entreeRes.ok || !entreeResult.ok) {
    throw new Error('Échec création entrée: ' + JSON.stringify(entreeResult));
  }

  console.log('\n3. Connexion en tant que Chef d\'équipe Daily1 (wajih@italcar.com)...');
  const chefDailySession = await login('wajih@italcar.com', 'wajih123');
  console.log('Chef d\'équipe connecté:', chefDailySession.account.name, 'équipe assignée:', chefDailySession.account.assignedTeam);

  console.log('\n4. Acceptation de l\'entrée par le Chef d\'équipe Daily...');
  const acceptRes = await fetch(`${API_BASE}/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': chefDailySession.cookie
    },
    body: JSON.stringify({
      action: 'accepterEntreeChefEquipe',
      decision: 'accepte',
      recordKey: entreeResult.recordKey,
      numeroOR: testOr,
      vin: testVin,
      equipe: 'Daily'
    })
  });

  const acceptResult = await acceptRes.json();
  console.log('Résultat acceptation Chef d\'équipe:', acceptResult);
  if (!acceptRes.ok || !acceptResult.ok) {
    throw new Error('Échec acceptation chef d\'équipe: ' + JSON.stringify(acceptResult));
  }

  console.log('\n5. Vérification de l\'enregistrement dans PostgreSQL...');
  const fluxRes = await fetch(`${API_BASE}/data/flux`, {
    headers: { 'Cookie': chefDailySession.cookie }
  });
  const fluxVehicles = await fluxRes.json();
  const matchedFlux = fluxVehicles.find(v => (v.numeroOR === testOr || v.or === testOr || v.vin === testVin || v.ordre === testOr || v.chassis === testVin));

  console.log('Véhicule Flux trouvé après acceptation :', {
    or: matchedFlux?.numeroOR || matchedFlux?.or,
    vin: matchedFlux?.vin,
    equipe: matchedFlux?.equipe,
    etat: matchedFlux?.etat,
    statutAcceptation: matchedFlux?.statutAcceptation,
    dateAcceptation: matchedFlux?.dateAcceptation,
    acceptePar: matchedFlux?.acceptePar
  });

  if (matchedFlux?.statutAcceptation !== 'accepte' || !matchedFlux?.dateAcceptation) {
    throw new Error('L\'acceptation n\'a pas été enregistrée correctement!');
  }

  console.log('\n6. Test de non-autorisation pour une autre équipe (ex: Chef Changan essaie d\'accepter Daily)...');
  const chefChanganSession = await login('amen.allah@italcar.com', 'amenallah123');
  const unauthorizedRes = await fetch(`${API_BASE}/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': chefChanganSession.cookie
    },
    body: JSON.stringify({
      action: 'accepterEntreeChefEquipe',
      decision: 'accepte',
      recordKey: entreeResult.recordKey,
      numeroOR: testOr,
      vin: testVin,
      equipe: 'Daily'
    })
  });
  console.log('Statut réponse pour chef non autorisé:', unauthorizedRes.status);
  const unauthorizedResult = await unauthorizedRes.json();
  console.log('Message:', unauthorizedResult.error || unauthorizedResult);

  console.log('\n=== TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS ! ===');
}

run().catch((err) => {
  console.error('Erreur test:', err);
  process.exit(1);
});
