const https = require('https');

const webAppUrl = 'https://script.google.com/macros/s/AKfycbwlK0_p7pnaievs5VyymU78QhPYtI2ohlfEUSZkEe5lSZmOxDhNSW0QTM0-EeX31xt2/exec';

function testCall(params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const fullUrl = `${webAppUrl}?${query}`;
    https.get(fullUrl, (res) => {
      if (res.statusCode === 302 && res.headers.location) {
        https.get(res.headers.location, (res2) => {
          let body = '';
          res2.on('data', chunk => body += chunk);
          res2.on('end', () => resolve(body));
        }).on('error', reject);
      } else {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      }
    }).on('error', reject);
  });
}

async function run() {
  console.log('Testing live Apps Script with an action to see response structure:');
  const res = await testCall({
    action: 'nonExistentAction',
    callback: 'testCb'
  });
  console.log('Response for invalid action:', res);
}

run().catch(console.error);
