const https = require('https');

const scriptUrl = 'https://script.google.com/macros/s/AKfycbwlK0_p7pnaievs5VyymU78QhPYtI2ohlfEUSZkEe5lSZmOxDhNSW0QTM0-EeX31xt2/exec';

function testAjouterVin() {
  const params = new URLSearchParams({
    action: 'ajouterVin',
    chassis: 'TESTVIN999999999',
    codeMarque: 'IVECO',
    codeModele: 'DAILY 50C15',
    numModeleVersion: 'IV-50C15-0004',
    descriptionSection: 'DAILY 50C15 E4 EMP 3750',
    dateMiseCirculation: '18/09/2026',
    immatriculation: '9999TU999',
    dateVente: '18/09/2026',
    codeClient: 'C999999',
    nomClient: 'CLIENT TEST AUTO',
  });

  const url = scriptUrl + '?' + params.toString();
  console.log('Calling URL:', url);

  function getFollow(urlToGet) {
    https.get(urlToGet, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log('Redirecting to:', res.headers.location);
        getFollow(res.headers.location);
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('Response statusCode:', res.statusCode);
        console.log('Response body:', body);
      });
    }).on('error', err => {
      console.error('Request error:', err);
    });
  }

  getFollow(url);
}

testAjouterVin();
