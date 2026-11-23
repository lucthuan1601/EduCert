import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const target = new URL('../.env', import.meta.url);
if (existsSync(target)) {
  console.log('backend/.env already exists; kept existing configuration.');
} else {
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  writeFileSync(target, example.replace('replace-with-a-random-secret-at-least-32-characters', randomBytes(32).toString('hex')), { mode: 0o600, flag: 'wx' });
  console.log('Created backend/.env with a random session secret. Configure PUBLIC_APP_URL for your frontend.');
}
