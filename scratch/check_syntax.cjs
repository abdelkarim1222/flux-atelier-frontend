const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('google-apps-script/Code.gs', 'utf8');
try {
  new vm.Script(code);
  console.log('Code.gs syntax is VALID! Total lines:', code.split('\n').length);
} catch (e) {
  console.error('Syntax error in Code.gs:', e.message);
  process.exit(1);
}
