import { spawn } from 'node:child_process';
import http from 'node:http';

const processes = [];
let stopping = false;

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

function registerChild(child) {
  processes.push(child);
  child.on('error', (error) => {
    console.error('Impossible de lancer un processus de développement:', error);
    stopAll(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stopAll(code || 0);
  });
}

function waitForApi(timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get('http://127.0.0.1:3001/api/health', (res) => {
        if (res.statusCode === 200) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.end();
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(check, 150);
    };
    check();
  });
}

async function start() {
  const apiChild = spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit', env: process.env });
  registerChild(apiChild);

  await waitForApi();

  if (!stopping) {
    const viteChild = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env: process.env });
    registerChild(viteChild);
  }
}

start();

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
