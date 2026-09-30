import { spawn } from 'node:child_process';

const processes = [
  spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env: process.env }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

for (const child of processes) {
  child.on('error', (error) => {
    console.error('Impossible de lancer un processus de développement:', error);
    stopAll(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stopAll(code || 0);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

