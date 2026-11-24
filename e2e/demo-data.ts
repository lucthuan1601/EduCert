import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Contract, JsonRpcProvider, type JsonRpcSigner } from 'ethers';
import { demo, tamper } from './demo.js';

// QA-03 demo data: against an already running local stack (hardhat node, deploy:local,
// setup-demo, dev:backend) this issues one demo certificate through the real API and
// contract, then saves the issued PDF and an edited copy for the verification demo.
//   npm --prefix e2e run demo-data [-- --out <folder>]
const env = {
  rpc: process.env.RPC_URL ?? 'http://127.0.0.1:8545',
  api: (process.env.API_URL ?? 'http://127.0.0.1:3001/api/v1').replace(/\/+$/, ''),
};
const outIndex = process.argv.indexOf('--out');
const outDir = resolve(outIndex > 0 ? process.argv[outIndex + 1] : join(import.meta.dirname, '.tmp', 'demo'));
const sha256 = (bytes: Uint8Array) => '0x' + createHash('sha256').update(bytes).digest('hex');

async function call<T>(path: string, init: RequestInit & { cookie?: string; csrf?: string; origin?: string }): Promise<{ data: T; cookie?: string; bytes?: Buffer }> {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set('Origin', init.origin);
  if (init.cookie) headers.set('Cookie', init.cookie);
  if (init.csrf) headers.set('X-CSRF-Token', init.csrf);
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const response = await fetch(env.api + path, { ...init, headers });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (response.headers.get('content-type')?.includes('application/pdf')) return { data: undefined as T, bytes: Buffer.from(await response.arrayBuffer()) };
  const body = await response.json();
  if (!body.success) throw new Error(`${path}: ${response.status} ${body.error?.code} ${body.error?.message}`);
  return { data: body.data, cookie };
}

async function login(signer: JsonRpcSigner, origin: string) {
  const wallet = await signer.getAddress();
  const challenge = await call<{ nonce: string; message: string }>('/auth/nonce', { method: 'POST', body: JSON.stringify({ wallet }), origin });
  const signature = await signer.signMessage(challenge.data.message);
  const session = await call<{ csrfToken: string }>('/auth/verify', { method: 'POST', body: JSON.stringify({ wallet, nonce: challenge.data.nonce, signature }), origin });
  return { cookie: session.cookie!, csrf: session.data.csrfToken, origin };
}

const config = (await call<{ chainId: number; contractAddress: string; abi: any[]; publicAppUrl: string }>('/config', {})).data;
const origin = config.publicAppUrl;
const provider = new JsonRpcProvider(env.rpc, config.chainId, { staticNetwork: true, cacheTimeout: -1 });
provider.pollingInterval = 200;
if (Number((await provider.getNetwork()).chainId) !== 31337) throw new Error('demo-data only runs on the Hardhat local network (chainId 31337)');
// Same accounts as scripts/setup-demo.js: #1 issuer (ISSUER_ROLE), #2 student.
const issuer = await provider.getSigner(1);
const student = await provider.getSigner(2);
const registry = new Contract(config.contractAddress, config.abi, issuer);
if (!await registry.getFunction('hasRole')(await registry.getFunction('ISSUER_ROLE')(), issuer.address)) throw new Error('Run npm run setup-demo first: account #1 has no ISSUER_ROLE');

const issuerSession = await login(issuer, origin);
const draft = (await call<{ certificateId: string; fileHash: string; verifyUrl: string }>('/drafts/generate', {
  method: 'POST', body: JSON.stringify({ studentWallet: student.address, ...demo }), ...issuerSession,
})).data;
const tx = await registry.getFunction('issueCertificate')(draft.certificateId, draft.fileHash, student.address);
const receipt = await tx.wait();
const finalized = (await call<{ syncState: string }>(`/certificates/${draft.certificateId}/finalize`, { method: 'POST', body: JSON.stringify({ txHash: tx.hash }), ...issuerSession })).data;

const studentSession = await login(student, origin);
const pdf = (await call(`/certificates/${draft.certificateId}/download`, { ...studentSession })).bytes!;
if (sha256(pdf) !== draft.fileHash) throw new Error('Downloaded PDF does not match the registered hash');
const edited = await tamper(pdf);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'demo-certificate-valid.pdf'), pdf);
writeFileSync(join(outDir, 'demo-certificate-tampered.pdf'), edited);
const summary = {
  createdAt: new Date().toISOString(), chainId: config.chainId, contractAddress: config.contractAddress,
  certificateId: draft.certificateId, verifyUrl: draft.verifyUrl, txHash: tx.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(),
  syncState: finalized.syncState, issuer: issuer.address, student: student.address,
  files: { valid: { name: 'demo-certificate-valid.pdf', sha256: sha256(pdf) }, tampered: { name: 'demo-certificate-tampered.pdf', sha256: sha256(edited) } },
};
writeFileSync(join(outDir, 'demo-data.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.log(`\nSaved to ${outDir}. Open ${draft.verifyUrl} and compare both PDFs.`);
provider.destroy();
