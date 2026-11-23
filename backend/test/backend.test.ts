import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile, access, mkdir, rmdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, webcrypto } from 'node:crypto';
import { once } from 'node:events';
import request from 'supertest';
import { Contract, ContractFactory, JsonRpcProvider, Wallet, ZeroAddress, ZeroHash, id as roleId, parseEther } from 'ethers';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/app.js';
import { type AppConfig, MAX_PDF_BYTES } from '../src/config.js';
import { findCertificate } from '../src/database.js';
import { ApiError } from '../src/errors.js';
import { PrivateStorage, sha256 } from '../src/services/storage.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = 'http://localhost:5173';
const randomHash = () => `0x${randomBytes(32).toString('hex')}`;
let child: ChildProcess;
let provider: JsonRpcProvider;
let rpcUrl: string;
let artifact: any;
let ctx: ReturnType<typeof createApp> & { config: AppConfig; temp: string; registry: Contract; issuer: any; student: any; otherStudent: any; stranger: any; adminUser: any; deployer: any };

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
before(async () => {
  const port = await freePort();
  rpcUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [join(root, 'node_modules/hardhat/internal/cli/cli.js'), 'node', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  // Hardhat prints development account keys; drain output without logging it.
  child.stdout!.on('data', () => undefined);
  child.stderr!.on('data', () => undefined);
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const response = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(1000) });
      ready = (await response.json()).result === '0x7a69';
      if (ready) break;
    } catch { /* node is still starting */ }
    if (child.exitCode !== null) break;
    await pause(100);
  }
  assert.ok(ready, 'Hardhat test node must become ready');
  provider = new JsonRpcProvider(rpcUrl, 31337, { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 1 });
  provider.pollingInterval = 50;
  artifact = JSON.parse(await readFile(join(root, 'artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json'), 'utf8'));
}, { timeout: 30000 });

after(async () => {
  provider?.destroy();
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit'), pause(5000)]);
  }
});

beforeEach(async () => {
  const deployer = await provider.getSigner(0);
  const deployed = await new ContractFactory(artifact.abi, artifact.bytecode, deployer).deploy();
  await deployed.waitForDeployment();
  const registry = new Contract(await deployed.getAddress(), artifact.abi, deployer);
  const issuer = Wallet.createRandom().connect(provider);
  const student = Wallet.createRandom();
  const otherStudent = Wallet.createRandom();
  const stranger = Wallet.createRandom();
  const adminUser = Wallet.createRandom();
  await (await deployer.sendTransaction({ to: issuer.address, value: parseEther('1') })).wait();
  await (await registry.getFunction('grantRole')(roleId('ISSUER_ROLE'), issuer.address)).wait();
  await (await registry.getFunction('grantRole')(ZeroHash, adminUser.address)).wait();
  const temp = await mkdtemp(join(tmpdir(), 'educert-backend-'));
  const config: AppConfig = { host: '127.0.0.1', port: 3001, publicAppUrl: origin, allowedOrigins: [origin], rpcUrl,
    chainId: 31337, contractAddress: await registry.getAddress(), abi: artifact.abi,
    databasePath: join(temp, 'educert.sqlite'), storageDir: join(temp, 'private-pdfs'), sessionSecret: randomBytes(32).toString('hex'),
    sessionTtlSeconds: 28800, nonceTtlSeconds: 300, cookieSecure: false };
  ctx = { ...createApp(config), config, temp, registry, issuer, student, otherStudent, stranger, adminUser, deployer };
});

afterEach(async () => {
  if (!ctx) return;
  ctx.chain.close();
  ctx.db.close();
  const checked = relative(tmpdir(), resolve(ctx.temp));
  assert.ok(checked.startsWith('educert-backend-') && !checked.includes('..'), 'Only remove the generated test directory');
  await rm(ctx.temp, { recursive: true, force: true });
});

async function challenge(wallet: any, agent = request.agent(ctx.app)) {
  const response = await agent.post('/api/v1/auth/nonce').send({ wallet: wallet.address }).expect(201);
  return { agent, data: response.body.data, payload: { wallet: wallet.address, nonce: response.body.data.nonce, signature: await wallet.signMessage(response.body.data.message) } };
}
async function login(wallet = ctx.issuer) {
  const value = await challenge(wallet);
  const response = await value.agent.post('/api/v1/auth/verify').send(value.payload).expect(200);
  return { agent: value.agent, csrf: response.body.data.csrfToken, response, wallet };
}
async function draft(actor: Awaited<ReturnType<typeof login>>, overrides: Record<string, unknown> = {}) {
  const response = await actor.agent.post('/api/v1/drafts/generate').set('X-CSRF-Token', actor.csrf)
    .send({ studentWallet: ctx.student.address, studentName: 'Nguyễn Văn A', courseName: 'Blockchain Fundamentals', issuerName: 'Demo University', ...overrides }).expect(201);
  return response.body.data;
}
async function issue(value: any, overrides: { hash?: string; student?: string; contract?: Contract; signer?: any } = {}) {
  const contract = (overrides.contract ?? ctx.registry).connect(overrides.signer ?? ctx.issuer) as Contract;
  const tx = await contract.getFunction('issueCertificate')(value.certificateId, overrides.hash ?? value.fileHash, overrides.student ?? ctx.student.address);
  await tx.wait();
  return tx.hash as string;
}
function finalize(actor: Awaited<ReturnType<typeof login>>, value: any, txHash: string) {
  return actor.agent.post(`/api/v1/certificates/${value.certificateId}/finalize`).set('X-CSRF-Token', actor.csrf).send({ txHash });
}
async function issued() {
  const actor = await login();
  const value = await draft(actor);
  const txHash = await issue(value);
  await finalize(actor, value, txHash).expect(200);
  return { actor, value, txHash };
}
function binary(response: any, callback: (error: Error | null, data?: Buffer) => void) {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', callback);
}
async function pdfSource() {
  const doc = await PDFDocument.create(); doc.addPage(); return Buffer.from(await doc.save());
}

test('BE-01: nonce expiry and replay are rejected', async () => {
  const expired = await challenge(ctx.issuer);
  ctx.db.prepare('UPDATE AuthNonce SET expires_at = 0').run();
  await expired.agent.post('/api/v1/auth/verify').send(expired.payload).expect(401);
  const fresh = await challenge(ctx.issuer);
  await fresh.agent.post('/api/v1/auth/verify').send(fresh.payload).expect(200);
  await fresh.agent.post('/api/v1/auth/verify').send(fresh.payload).expect(401);
});

test('BE-02: a signature from the wrong wallet returns 401', async () => {
  const value = await challenge(ctx.issuer);
  value.payload.signature = await ctx.stranger.signMessage(value.data.message);
  const response = await value.agent.post('/api/v1/auth/verify').send(value.payload).expect(401);
  assert.equal(response.body.error.code, 'SIGNATURE_INVALID');
});

test('BE-03: issuer role is checked on-chain after login', async () => {
  const actor = await login();
  await (await ctx.registry.getFunction('revokeRole')(roleId('ISSUER_ROLE'), ctx.issuer.address)).wait();
  const response = await actor.agent.post('/api/v1/drafts/generate').set('X-CSRF-Token', actor.csrf).send({}).expect(403);
  assert.equal(response.body.error.code, 'ISSUER_REQUIRED');
});

test('BE-04: uploads larger than 5 MiB return 413', async () => {
  const actor = await login();
  const bytes = Buffer.alloc(MAX_PDF_BYTES + 1); bytes.write('%PDF-1.7');
  const response = await actor.agent.post('/api/v1/drafts/upload').set('X-CSRF-Token', actor.csrf)
    .attach('file', bytes, { filename: 'large.pdf', contentType: 'application/pdf' }).expect(413);
  assert.equal(response.body.error.code, 'FILE_TOO_LARGE');
});

test('BE-05: student B cannot download student A certificate', async () => {
  const { value } = await issued();
  const actor = await login(ctx.otherStudent);
  await actor.agent.get(`/api/v1/certificates/${value.certificateId}/download`).expect(403);
});

test('BE-06: anonymous download returns 401', async () => {
  const { value } = await issued();
  await request(ctx.app).get(`/api/v1/certificates/${value.certificateId}/download`).expect(401);
});

test('BE-07: fake txHash never marks the draft ISSUED', async () => {
  const actor = await login(); const value = await draft(actor); const txHash = randomHash();
  const response = await finalize(actor, value, txHash).expect(400);
  assert.equal(response.body.error.code, 'TX_NOT_FOUND');
  assert.equal(findCertificate(ctx.db, value.certificateId)?.sync_state, 'FAILED');
  assert.equal(findCertificate(ctx.db, value.certificateId)?.tx_hash, txHash);
  const second = await draft(actor);
  assert.equal((await finalize(actor, second, txHash).expect(409)).body.error.code, 'TX_ALREADY_USED');
});

test('BE-08: RPC interruption persists pending tx and retry survives restart', async () => {
  let actor = await login(); const value = await draft(actor); const second = await draft(actor); const txHash = await issue(value);
  ctx.chain.issuance = async () => { throw new ApiError(503, 'RPC_ERROR', 'Simulated interruption'); };
  await finalize(actor, value, txHash).expect(503);
  assert.equal(findCertificate(ctx.db, value.certificateId)?.sync_state, 'PENDING_CHAIN');
  assert.equal(findCertificate(ctx.db, value.certificateId)?.tx_hash, txHash);
  assert.equal((await finalize(actor, second, txHash).expect(409)).body.error.code, 'TX_ALREADY_USED');
  assert.equal(findCertificate(ctx.db, second.certificateId)?.tx_hash, null);
  ctx.chain.close(); ctx.db.close();
  Object.assign(ctx, createApp(ctx.config));
  actor = await login();
  const restored = await finalize(actor, value, txHash).expect(200);
  assert.equal(restored.body.data.syncState, 'ISSUED');
  await finalize(actor, value, txHash).expect(200);
  assert.equal((await request(ctx.app).get('/api/v1/stats').expect(200)).body.data.issued, 1);
});

test('BE-09: downloaded final PDF matches SHA-256 and Web Crypto digest', async () => {
  const { actor, value } = await issued();
  const preview = await actor.agent.get(value.previewUrl).buffer(true).parse(binary).expect(200);
  const student = await login(ctx.student);
  const downloaded = await student.agent.get(`/api/v1/certificates/${value.certificateId}/download`).buffer(true).parse(binary).expect(200);
  assert.deepEqual(downloaded.body, preview.body);
  assert.equal(sha256(downloaded.body), value.fileHash);
  const digest = await webcrypto.subtle.digest('SHA-256', new Uint8Array(downloaded.body));
  assert.equal(`0x${Buffer.from(digest).toString('hex')}`, value.fileHash);
  assert.equal(downloaded.headers['x-file-hash'], value.fileHash);
  assert.equal((await PDFDocument.load(downloaded.body)).getPageCount(), 1);
});

test('BE-10: upload filenames and invalid storage keys cannot traverse paths', async () => {
  const actor = await login(); const source = await pdfSource();
  const response = await actor.agent.post('/api/v1/drafts/upload').set('X-CSRF-Token', actor.csrf)
    .field('studentWallet', ctx.student.address).field('studentName', 'Nguyễn Văn A').field('courseName', 'Blockchain Fundamentals')
    .attach('file', source, { filename: '../../outside.pdf', contentType: 'application/pdf' }).expect(201);
  const row = findCertificate(ctx.db, response.body.data.certificateId)!;
  assert.match(row.storage_key, /^[a-f0-9]{64}\.pdf$/);
  assert.equal((await PDFDocument.load(await ctx.storage.read(row))).getPageCount(), 2);
  await assert.rejects(access(join(ctx.temp, 'outside.pdf')));
  await assert.rejects(ctx.storage.read({ ...row, storage_key: '../../outside.pdf' }), (error: any) => error.code === 'INVALID_STORAGE_KEY');
});

test('API: signed PDFs are rejected even when signature dictionaries are compressed', async () => {
  const actor = await login(); const doc = await PDFDocument.create(); doc.addPage();
  doc.context.register(doc.context.obj({ Type: 'Sig', ByteRange: [0, 1, 2, 3] }));
  const response = await actor.agent.post('/api/v1/drafts/upload').set('X-CSRF-Token', actor.csrf)
    .field('studentWallet', ctx.student.address).field('studentName', 'Demo').field('courseName', 'Demo')
    .attach('file', Buffer.from(await doc.save()), { filename: 'signed.pdf', contentType: 'application/pdf' }).expect(400);
  assert.equal(response.body.error.code, 'SIGNED_PDF_UNSUPPORTED');
});

test('API: CSRF and cross-origin protections reject unauthorized writes', async () => {
  const actor = await login();
  await actor.agent.post('/api/v1/drafts/generate').send({}).expect(403);
  await actor.agent.post('/api/v1/drafts/generate').set('X-CSRF-Token', actor.csrf).set('Origin', 'https://untrusted.example').send({}).expect(403);
  const response = await request(ctx.app).options('/api/v1/drafts/generate').set('Origin', origin).set('Access-Control-Request-Method', 'POST').expect(204);
  assert.equal(response.headers['access-control-allow-origin'], origin);
  assert.equal(response.headers['access-control-allow-credentials'], 'true');
});

test('API: expired sessions are rejected', async () => {
  const actor = await login(); ctx.db.prepare('UPDATE AuthSession SET expires_at = 0').run();
  await actor.agent.get('/api/v1/auth/me').expect(401);
});

test('API: draft metadata and preview are restricted to original issuer', async () => {
  const actor = await login(); const value = await draft(actor); const student = await login(ctx.student);
  await student.agent.get(`/api/v1/drafts/${value.certificateId}`).expect(403);
  await student.agent.get(value.previewUrl).expect(403);
  await request(ctx.app).get(value.previewUrl).expect(401);
  await student.agent.post('/api/v1/drafts/generate').set('X-CSRF-Token', student.csrf).send({}).expect(403);
  await actor.agent.get(`/api/v1/certificates/${value.certificateId}/download`).expect(409);
});

test('API: receipt with wrong file hash is rejected', async () => {
  const actor = await login(); const value = await draft(actor); const txHash = await issue(value, { hash: randomHash() });
  const response = await finalize(actor, value, txHash).expect(409);
  assert.equal(response.body.error.code, 'EVENT_MISMATCH');
});

test('API: receipt with wrong student is rejected', async () => {
  const actor = await login(); const value = await draft(actor); const txHash = await issue(value, { student: ctx.otherStudent.address });
  assert.equal((await finalize(actor, value, txHash).expect(409)).body.error.code, 'EVENT_MISMATCH');
});

test('API: a transaction sent to another contract is rejected', async () => {
  const actor = await login(); const value = await draft(actor);
  const other = await new ContractFactory(artifact.abi, artifact.bytecode, ctx.deployer).deploy(); await other.waitForDeployment();
  const registry = new Contract(await other.getAddress(), artifact.abi, ctx.deployer);
  await (await registry.getFunction('grantRole')(roleId('ISSUER_ROLE'), ctx.issuer.address)).wait();
  const txHash = await issue(value, { contract: registry });
  assert.equal((await finalize(actor, value, txHash).expect(409)).body.error.code, 'TX_MISMATCH');
  assert.equal(findCertificate(ctx.db, value.certificateId)?.tx_hash, null);
});

test('API: transaction sender must match draft issuer', async () => {
  const actor = await login(); const value = await draft(actor);
  await (await ctx.registry.getFunction('grantRole')(roleId('ISSUER_ROLE'), await ctx.deployer.getAddress())).wait();
  const txHash = await issue(value, { signer: ctx.deployer });
  assert.equal((await finalize(actor, value, txHash).expect(409)).body.error.code, 'TX_MISMATCH');
});

test('API: successful transaction without matching issuance event is rejected', async () => {
  const actor = await login(); const value = await draft(actor);
  await (await ctx.registry.getFunction('grantRole')(ZeroHash, ctx.issuer.address)).wait();
  const tx = await (ctx.registry.connect(ctx.issuer) as Contract).getFunction('grantRole')(roleId('ISSUER_ROLE'), ctx.stranger.address); await tx.wait();
  assert.equal((await finalize(actor, value, tx.hash).expect(409)).body.error.code, 'EVENT_MISMATCH');
});

test('API: pending receipt returns 202 and later finalizes the same transaction', async () => {
  const actor = await login(); const value = await draft(actor); const second = await draft(actor);
  await provider.send('evm_setAutomine', [false]);
  let tx: any;
  try {
    tx = await (ctx.registry.connect(ctx.issuer) as Contract).getFunction('issueCertificate')(value.certificateId, value.fileHash, ctx.student.address);
    const response = await finalize(actor, value, tx.hash).expect(202);
    assert.equal(response.body.data.syncState, 'PENDING_CHAIN');
    assert.equal(response.body.data.txHash, tx.hash);
    assert.equal((await finalize(actor, second, tx.hash).expect(409)).body.error.code, 'TX_ALREADY_USED');
    assert.equal(findCertificate(ctx.db, value.certificateId)?.tx_hash, tx.hash);
  } finally { await provider.send('evm_setAutomine', [true]); await provider.send('evm_mine', []); }
  await finalize(actor, value, tx.hash).expect(200);
});

test('API: reverted receipt cannot finalize a certificate', async () => {
  const actor = await login(); const value = await draft(actor);
  await provider.send('evm_setAutomine', [false]);
  let tx: any;
  try {
    tx = await (ctx.registry.connect(ctx.issuer) as Contract).getFunction('issueCertificate')(value.certificateId, value.fileHash, ZeroAddress, { gasLimit: 300000 });
    await provider.send('evm_mine', []);
  } finally { await provider.send('evm_setAutomine', [true]); }
  assert.equal((await finalize(actor, value, tx.hash).expect(409)).body.error.code, 'TX_FAILED');
  assert.equal(findCertificate(ctx.db, value.certificateId)?.tx_hash, null);
});

test('API: public lookup is chain-authoritative and does not expose PII', async () => {
  const { value } = await issued();
  const response = await request(ctx.app).get(`/api/v1/certificates/${value.certificateId}/public`).expect(200);
  assert.equal(response.body.data.status, 'REGISTERED_ACTIVE');
  for (const forbidden of ['studentName', 'courseName', 'storageKey', 'previewUrl', 'downloadUrl']) assert.equal(response.body.data[forbidden], undefined);
  assert.equal((await request(ctx.app).get(`/api/v1/certificates/${randomHash()}/public`).expect(404)).body.error.code, 'NOT_FOUND');
  await request(ctx.app).get('/api/v1/certificates/invalid/public').expect(400);
});

test('API: revocation refreshes student status and event pagination', async () => {
  const { value } = await issued();
  await (await ctx.registry.getFunction('revokeCertificate')(value.certificateId, 2)).wait();
  const student = await login(ctx.student);
  const list = await student.agent.get('/api/v1/me/certificates?offset=0&limit=1').expect(200);
  assert.equal(list.body.data.items[0].syncState, 'REVOKED');
  const stats = (await request(ctx.app).get('/api/v1/stats').expect(200)).body.data;
  assert.deepEqual([stats.issued, stats.revoked, stats.active], [1, 1, 0]);
  const events = (await request(ctx.app).get('/api/v1/events?offset=0&limit=1').expect(200)).body.data;
  assert.equal(events.total, 2); assert.equal(events.items[0].type, 'REVOKED');
  const next = await request(ctx.app).get(`/api/v1/events?offset=1&limit=1&toBlock=${events.toBlock}`).expect(200);
  assert.equal(next.body.data.items[0].type, 'ISSUED');
  assert.equal((await request(ctx.app).get('/api/v1/events?type=REVOKED').expect(200)).body.data.total, 1);
  await request(ctx.app).get('/api/v1/events?fromBlock=10&toBlock=1').expect(400);
  await request(ctx.app).get('/api/v1/events?limit=101').expect(400);
});

test('API: wrong RPC chain and undeployed contract return RPC_ERROR', async () => {
  for (const override of [{ chainId: 31338 }, { contractAddress: Wallet.createRandom().address }, { rpcUrl: `http://127.0.0.1:${await freePort()}` }]) {
    const backend = createApp({ ...ctx.config, ...override });
    try {
      const response = await request(backend.app).get(`/api/v1/certificates/${randomHash()}/public`).expect(503);
      assert.equal(response.body.error.code, 'RPC_ERROR');
    } finally { backend.chain.close(); backend.db.close(); }
  }
});

test('API: changing stored PDF bytes is detected on download', async () => {
  const { value } = await issued(); const row = findCertificate(ctx.db, value.certificateId)!;
  await writeFile(join(ctx.config.storageDir, row.storage_key), Buffer.from('%PDF-1.7\nTampered PDF'));
  const student = await login(ctx.student);
  const response = await student.agent.get(`/api/v1/certificates/${value.certificateId}/download`).expect(503);
  assert.equal(response.body.error.code, 'FILE_INTEGRITY_ERROR');
});

test('API: personal list filters by session wallet and validates pagination', async () => {
  await issued();
  const student = await login(ctx.student); const other = await login(ctx.otherStudent);
  assert.equal((await student.agent.get('/api/v1/me/certificates').expect(200)).body.data.total, 1);
  assert.equal((await other.agent.get('/api/v1/me/certificates').expect(200)).body.data.total, 0);
  await student.agent.get('/api/v1/me/certificates?wallet=someone-else').expect(400);
  await student.agent.get('/api/v1/me/certificates?offset=-1').expect(400);
});

test('API: session restore, hashed token storage and logout work', async () => {
  const actor = await login();
  const cookie = actor.response.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
  const token = cookie.split(';')[0].split('=')[1];
  const stored = ctx.db.prepare('SELECT token_hash FROM AuthSession').get() as { token_hash: string };
  assert.notEqual(stored.token_hash, token);
  const restored = await actor.agent.get('/api/v1/auth/me').expect(200);
  assert.equal(restored.body.data.csrfToken, actor.csrf); assert.equal(restored.body.data.roles.issuer, true);
  await actor.agent.post('/api/v1/auth/logout').set('X-CSRF-Token', actor.csrf).expect(200);
  await actor.agent.get('/api/v1/auth/me').expect(401);
});

test('API: receipt cannot be reused for another draft or replace a finalized tx', async () => {
  const { actor, value, txHash } = await issued(); const second = await draft(actor);
  assert.equal((await finalize(actor, second, txHash).expect(409)).body.error.code, 'TX_ALREADY_USED');
  assert.equal((await finalize(actor, value, randomHash()).expect(409)).body.error.code, 'TX_ALREADY_BOUND');
});

test('Finalize: rejected transaction is released so its correct draft can finalize', async () => {
  const actor = await login(); const correct = await draft(actor); const wrong = await draft(actor);
  const txHash = await issue(correct);
  assert.equal((await finalize(actor, wrong, txHash).expect(409)).body.error.code, 'EVENT_MISMATCH');
  const rejected = await actor.agent.get(`/api/v1/drafts/${wrong.certificateId}`).expect(200);
  assert.equal(rejected.body.data.syncState, 'FAILED');
  assert.equal(rejected.body.data.errorCode, 'EVENT_MISMATCH');
  const response = await finalize(actor, correct, txHash).expect(200);
  assert.equal(rejected.body.data.txHash, null);
  assert.equal(response.body.data.syncState, 'ISSUED');
  assert.equal(response.body.data.txHash, txHash);
  assert.equal(findCertificate(ctx.db, wrong.certificateId)?.tx_hash, null);
  const wrongTx = await issue(wrong);
  assert.equal((await finalize(actor, wrong, wrongTx).expect(200)).body.data.txHash, wrongTx);
  assert.equal((await request(ctx.app).get('/api/v1/stats').expect(200)).body.data.issued, 2);
});

test('Finalize: legacy failed mismatch cannot block its correct draft after restart', async () => {
  let actor = await login(); const correct = await draft(actor); const wrong = await draft(actor);
  const txHash = await issue(correct);
  // Reproduce a FAILED binding persisted by the previous backend version.
  ctx.db.prepare("UPDATE CertificateFile SET tx_hash = ?, sync_state = 'FAILED', error_code = 'EVENT_MISMATCH' WHERE certificate_id = ?")
    .run(txHash, wrong.certificateId);
  ctx.chain.close(); ctx.db.close();
  Object.assign(ctx, createApp(ctx.config));
  actor = await login();
  const response = await finalize(actor, correct, txHash).expect(200);
  assert.equal(response.body.data.syncState, 'ISSUED');
  assert.equal(response.body.data.txHash, txHash);
  const rejected = findCertificate(ctx.db, wrong.certificateId)!;
  assert.equal(rejected.tx_hash, null);
  assert.equal(rejected.sync_state, 'FAILED');
  assert.equal(rejected.error_code, 'EVENT_MISMATCH');
});

test('API: valid historical issuance can reconcile after issuer role removal', async () => {
  const actor = await login(); const value = await draft(actor); const txHash = await issue(value);
  await (await ctx.registry.getFunction('revokeRole')(roleId('ISSUER_ROLE'), ctx.issuer.address)).wait();
  await finalize(actor, value, txHash).expect(200);
  assert.equal((await ctx.registry.getFunction('getCertificate')(value.certificateId)).revoked, false);
});

test('API: original issuer and admin can download a finalized certificate', async () => {
  const { actor, value } = await issued();
  await actor.agent.get(`/api/v1/certificates/${value.certificateId}/download`).expect(200);
  const admin = await login(ctx.adminUser);
  await admin.agent.get(`/api/v1/certificates/${value.certificateId}/download`).expect(200);
});

test('API: malformed PDF, wrong MIME, empty fields and issuer spoofing are rejected', async () => {
  const actor = await login();
  await actor.agent.post('/api/v1/drafts/upload').set('X-CSRF-Token', actor.csrf).attach('file', Buffer.from('%PDF-not-real'), { filename: 'fake.pdf', contentType: 'application/pdf' }).expect(400);
  await actor.agent.post('/api/v1/drafts/upload').set('X-CSRF-Token', actor.csrf).attach('file', Buffer.from('text'), { filename: 'fake.pdf', contentType: 'text/plain' }).expect(400);
  await actor.agent.post('/api/v1/drafts/upload').set('X-CSRF-Token', actor.csrf).send({}).expect(400);
  await actor.agent.post('/api/v1/drafts/generate').set('X-CSRF-Token', actor.csrf).send({ studentWallet: ctx.student.address, studentName: '', courseName: 'Demo' }).expect(400);
  await actor.agent.post('/api/v1/drafts/generate').set('X-CSRF-Token', actor.csrf).send({ studentWallet: ctx.student.address, studentName: 'Demo', courseName: 'Demo', issuerWallet: ctx.stranger.address }).expect(400);
});

test('API: malformed multipart upload returns a client error', async () => {
  const actor = await login();
  const response = await actor.agent.post('/api/v1/drafts/upload').set('X-CSRF-Token', actor.csrf)
    .set('Content-Type', 'multipart/form-data; boundary=broken-boundary')
    .send('--broken-boundary\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7').expect(400);
  assert.equal(response.body.error.code, 'UPLOAD_ERROR');
});

test('Storage: a symlink into a public directory cannot become private storage', async () => {
  const publicRoot = join(root, 'public');
  const created = await mkdir(publicRoot, { recursive: true });
  try {
    const alias = join(ctx.temp, 'public-alias');
    await symlink(publicRoot, alias, 'junction');
    assert.throws(() => new PrivateStorage(alias), (error: any) => error.code === 'STORAGE_CONFIGURATION_ERROR');
    assert.throws(() => new PrivateStorage(join(publicRoot, '..private')), (error: any) => error.code === 'STORAGE_CONFIGURATION_ERROR');
  } finally {
    // Only remove the empty directory if this test created it; never delete existing user data.
    if (created === publicRoot) await rmdir(publicRoot);
  }
});

test('Auth: concurrent reuse of a nonce creates exactly one session', async () => {
  const value = await challenge(ctx.issuer);
  const responses = await Promise.all([request(ctx.app).post('/api/v1/auth/verify').send(value.payload), request(ctx.app).post('/api/v1/auth/verify').send(value.payload)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
  assert.equal((ctx.db.prepare('SELECT COUNT(*) AS count FROM AuthSession').get() as { count: number }).count, 1);
});

test('Finalize: concurrent requests confirm one issuance without duplicates', async () => {
  const actor = await login(); const value = await draft(actor); const txHash = await issue(value);
  const responses = await Promise.all([finalize(actor, value, txHash), finalize(actor, value, txHash), finalize(actor, value, txHash)]);
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200]);
  assert.ok(responses.every(response => response.body.data.syncState === 'ISSUED'));
  assert.equal((ctx.db.prepare('SELECT COUNT(*) AS count FROM CertificateFile').get() as { count: number }).count, 1);
  assert.equal((await request(ctx.app).get('/api/v1/stats').expect(200)).body.data.issued, 1);
});

test('Finalize: another wallet cannot bind a transaction to an issuer draft', async () => {
  const actor = await login(); const value = await draft(actor); const txHash = await issue(value);
  const student = await login(ctx.student);
  await finalize(student, value, txHash).expect(403);
  assert.equal(findCertificate(ctx.db, value.certificateId)?.tx_hash, null);
  await finalize(actor, value, txHash).expect(200);
});

test('Public: on-chain certificate remains queryable without a SQLite record', async () => {
  const value = { certificateId: randomHash(), fileHash: randomHash() };
  await issue(value);
  assert.equal(findCertificate(ctx.db, value.certificateId), undefined);
  const response = await request(ctx.app).get(`/api/v1/certificates/${value.certificateId}/public`).expect(200);
  assert.equal(response.body.data.fileHash, value.fileHash);
  assert.equal(response.body.data.status, 'REGISTERED_ACTIVE');
});

test('Finalize: certificate revoked before reconciliation returns REVOKED', async () => {
  const actor = await login(); const value = await draft(actor); const txHash = await issue(value);
  await (await ctx.registry.getFunction('revokeCertificate')(value.certificateId, 1)).wait();
  const response = await finalize(actor, value, txHash).expect(200);
  assert.equal(response.body.data.syncState, 'REVOKED');
  assert.equal(findCertificate(ctx.db, value.certificateId)?.sync_state, 'REVOKED');
});

test('Finalize: failed unknown transaction can be replaced by the actual issuance', async () => {
  const actor = await login(); const value = await draft(actor);
  await finalize(actor, value, randomHash()).expect(400);
  const txHash = await issue(value);
  const response = await finalize(actor, value, txHash).expect(200);
  assert.equal(response.body.data.txHash, txHash);
  assert.equal(response.body.data.syncState, 'ISSUED');
});

test('PDF: an actual encrypted PDF is rejected before storage', async () => {
  const actor = await login();
  const source = await readFile(new URL('./fixtures/encrypted-demo.pdf', import.meta.url));
  const response = await actor.agent.post('/api/v1/drafts/upload').set('X-CSRF-Token', actor.csrf)
    .field('studentWallet', ctx.student.address).field('studentName', 'Demo').field('courseName', 'Demo')
    .attach('file', source, { filename: 'encrypted.pdf', contentType: 'application/pdf' }).expect(400);
  assert.equal(response.body.error.code, 'INVALID_PDF');
  assert.equal((ctx.db.prepare('SELECT COUNT(*) AS count FROM CertificateFile').get() as { count: number }).count, 0);
});
