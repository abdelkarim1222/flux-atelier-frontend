const https = require('https');

const baseUrl = "https://script.google.com/macros/s/AKfycbwlK0_p7pnaievs5VyymU78QhPYtI2ohlfEUSZkEe5lSZmOxDhNSW0QTM0-EeX31xt2/exec";
const testUrl = `${baseUrl}?action=modifierEntree&noOr=TEST99999&cs=R10&chassis=TESTCHASSIS999&callback=cb_mod_test`;

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

console.log("Calling Apps Script with action=modifierEntree...");
getRedirect(testUrl)
  .then(res => {
    console.log("Status:", res.status);
    console.log("Body:", res.data);
  })
  .catch(console.error);
