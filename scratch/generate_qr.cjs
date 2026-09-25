const QRCode = require('qrcode');
const path = 'C:/Users/abdelkarime/.gemini/antigravity-ide/brain/4ea31d4a-5a09-46a7-8027-994af3bd5015/mobile_http_qr.png';
const url = 'http://172.16.6.100:5174/';

QRCode.toFile(path, url, { width: 340, margin: 2 }, function (err) {
  if (err) {
    console.error('Error generating QR:', err);
    process.exit(1);
  }
  console.log('QR Code generated successfully at', path);
});
