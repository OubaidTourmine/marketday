import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!existsSync(root + 'front-end/node_modules/vite/bin/vite.js')) {
  console.error('First run: npm --prefix front-end install'); process.exit(1);
}
const env = { ...process.env, HOST: '127.0.0.1', SEED_DEMO: process.env.SEED_DEMO || 'true',
  USER_SERVICE_URL: 'http://127.0.0.1:3001', LISTING_SERVICE_URL: 'http://127.0.0.1:3002', MESSAGING_SERVICE_URL: 'http://127.0.0.1:3003' };
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const [service, port, database] of [['user-service', 3001, 'users'], ['listing-service', 3002, 'listings'], ['messaging-service', 3003, 'messages'], ['api-gateway', 8081, null]]) {
  const child = spawn(process.execPath, [service + '/server.js'], { cwd: root, stdio: 'inherit', env: { ...env, PORT: String(port), DATA_FILE: root + `data/${database}.sqlite` } });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}
const front = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { cwd: root + 'front-end', stdio: 'inherit', env });
children.push(front);
front.on('error', error => { console.error(error.message); stop(1); });
front.on('exit', code => { if (!stopping) stop(code || 1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
