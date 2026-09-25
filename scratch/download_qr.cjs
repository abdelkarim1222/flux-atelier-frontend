const https = require('https');
const fs = require('fs');

const url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=http://172.16.6.100:5174/';
const dest = 'C:/Users/abdelkarime/.gemini/antigravity-ide/brain/4ea31d4a-5a09-46a7-8027-994af3bd5015/mobile_http_qr.png';

const file = fs.createWriteStream(dest);
https.get(url, function(response) {
  response.pipe(file);
  file.on('finish', function() {
    file.close();
    console.log('QR Code downloaded successfully to ' + dest);
  });
}).on('error', function(err) {
  fs.unlink(dest, () => {});
  console.error('Error downloading QR:', err.message);
});
