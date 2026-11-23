import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import os from 'node:os';

const backend = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const reports = join(backend, 'reports');
mkdirSync(reports, { recursive: true });
const checks = [
  { name: 'typecheck', cwd: backend, args: ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'] },
  { name: 'frontend-example', cwd: backend, args: ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.examples.json'] },
  { name: 'build', cwd: backend, args: ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'] },
  { name: 'contract-tests', cwd: root, args: ['node_modules/hardhat/internal/cli/cli.js', 'test'] },
  { name: 'backend-tests', cwd: backend, args: ['--import', 'tsx', '--test', '--test-concurrency=1', 'test/backend.test.ts'] },
];
const results = [];
for (const check of checks) {
  console.log(`\nRunning ${check.name}...`);
  const started = Date.now();
  const result = await new Promise(resolve => {
    let output = '';
    const child = spawn(process.execPath, check.args, { cwd: check.cwd, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0' } });
    child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk); });
    child.on('error', error => resolve({ exitCode: 1, output: output + error.message }));
    child.on('close', code => resolve({ exitCode: code ?? 1, output }));
  });
  writeFileSync(join(reports, `${check.name}.txt`), result.output);
  results.push({ name: check.name, exitCode: result.exitCode, durationMs: Date.now() - started });
  if (result.exitCode !== 0) { process.exitCode = 1; break; }
}
writeFileSync(join(reports, 'summary.json'), JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, platform: os.platform(), arch: os.arch(), results }, null, 2) + '\n');
console.log(`\nSaved verification reports to backend/reports (${process.exitCode ? 'FAIL' : 'PASS'}).`);
