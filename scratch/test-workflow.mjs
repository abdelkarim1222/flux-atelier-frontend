import http from 'http';

function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = data ? JSON.stringify(data) : null;
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || (data ? 'POST' : 'GET'),
      headers: {
        ...(postData ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ data: JSON.parse(body), headers: res.headers, statusCode: res.statusCode });
        } catch (e) {
          resolve({ raw: body, headers: res.headers, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('0. Authentification admin...');
  const loginRes = await request('http://localhost:3001/api/auth/login', {}, {
    identifier: 'admin@flux-atelier.local',
    password: 'ezzar123'
  });
  console.log('Login status:', loginRes.statusCode, loginRes.data?.user?.email);
  const cookieHeader = loginRes.headers['set-cookie'];
  const cookie = Array.isArray(cookieHeader) ? cookieHeader[0].split(';')[0] : (cookieHeader ? cookieHeader.split(';')[0] : '');

  const authHeaders = { Cookie: cookie };

  const testOr = 'TEST-WF-001';
  const testVin = 'VF1TESTWORKFLOW01';

  console.log('\n1. Ajout nouvelle entrée par réception...');
  const addRes = await request('http://localhost:3001/api/actions', {
    method: 'POST',
    headers: authHeaders,
  }, {
    action: 'ajouterEntree',
    noOr: testOr,
    chassis: testVin,
    nomClient: 'Client Test Workflow',
    marque: 'IVECO',
    modele: 'Daily 35S',
    equipe: 'Daily',
    etat: 'Attente Réparation',
    emplacement: 'P12',
    dateEntreeHeure: '29/09/2026 10:15:00',
  });
  console.log('Ajout réponse:', addRes.data);

  console.log('\n2. Vérification statut initial après entrée...');
  const fluxRes1 = await request('http://localhost:3001/api/data/flux', { headers: authHeaders });
  const fluxList1 = Array.isArray(fluxRes1.data) ? fluxRes1.data : [];
  const found1 = fluxList1.find(v => v.no === testOr || v.ordre === testOr || v.chassis === testVin);
  console.log('Véhicule en base initial:', {
    no: found1?.no,
    statut: found1?.statut,
    etatIntervention: found1?.etatIntervention,
    avancement: found1?.avancement,
    emplacement: found1?.emplacement,
    statutAcceptation: found1?.statutAcceptation,
  });

  console.log('\n3. Acceptation par le chef d\'équipe Daily avec mécanicien sélectionné...');
  const acceptRes = await request('http://localhost:3001/api/actions', {
    method: 'POST',
    headers: authHeaders,
  }, {
    action: 'accepterEntreeChefEquipe',
    noOr: testOr,
    chassis: testVin,
    decision: 'accepte',
    equipe: 'Daily',
    decisionPar: 'Chef Daily',
    statut: 'En cours',
    etat: 'En cours',
    etatIntervention: 'En cours',
    avancement: 'En cours - 10%',
    emplacement: 'D03',
    technicien: 'T99',
    nomTechnicien: 'Momo Tech',
    dateDebutRep: '29/09/2026 10:20:00',
    dateDebutTravail: '29/09/2026 10:20:00',
    heureDebutTravail: '10:20:00',
  });
  console.log('Acceptation réponse:', acceptRes.data);

  console.log('\n4. Vérification statut après acceptation...');
  const fluxRes2 = await request('http://localhost:3001/api/data/flux', { headers: authHeaders });
  const fluxList2 = Array.isArray(fluxRes2.data) ? fluxRes2.data : [];
  const found2 = fluxList2.find(v => v.no === testOr || v.ordre === testOr || v.chassis === testVin);
  console.log('Véhicule en base après acceptation:', {
    no: found2?.no,
    statut: found2?.statut,
    etatIntervention: found2?.etatIntervention,
    avancement: found2?.avancement,
    emplacement: found2?.emplacement,
    technicien: found2?.technicien,
    nomTechnicien: found2?.nomTechnicien,
    dateDebutRep: found2?.dateDebutRep,
    dateDebutTravail: found2?.dateDebutTravail,
    heureDebutTravail: found2?.heureDebutTravail,
    dateAcceptation: found2?.dateAcceptation,
    acceptePar: found2?.acceptePar,
  });

  console.log('\n5. Nettoyage du véhicule de test...');
  await request('http://localhost:3001/api/actions', {
    method: 'POST',
    headers: authHeaders,
  }, {
    action: 'supprimerEntree',
    noOr: testOr,
    chassis: testVin,
  });
  console.log('Nettoyage terminé avec succès !');
}

run().catch(console.error);
