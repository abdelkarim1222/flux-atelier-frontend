const https = require('https');

function testCallback(cbName) {
  const baseUrl = "https://script.google.com/macros/s/AKfycbwlK0_p7pnaievs5VyymU78QhPYtI2ohlfEUSZkEe5lSZmOxDhNSW0QTM0-EeX31xt2/exec";
  const url = `${baseUrl}?action=supprimerEntree&noOr=TEST99999&cs=R10&chassis=TESTCHASSIS999&callback=${cbName}`;

  function getRedirect(targetUrl, depth = 0) {
    if (depth > 5) return Promise.reject(new Error("Too many redirects"));
    return new Promise((resolve, reject) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getRedirect(res.headers.location, depth + 1).then(resolve).catch(reject);
        } else {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, data }));
        }
      }).on('error', reject);
    });
  }

  return getRedirect(url).then(res => {
    console.log(`[${cbName}] Status:`, res.status, "IsHTML:", res.data.includes("<html"), "Sample:", res.data.slice(0, 80));
  });
}

async function run() {
  await testCallback("cb_test");
  await testCallback("cb_del_12345678");
  await testCallback("__fluxAtelierDel_12345");
}

run().catch(console.error);
