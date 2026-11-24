import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { Contract, JsonRpcProvider, id as roleId } from 'ethers';
import { readState, root, tempDir, urls } from '../stack.js';

// QA-05 / Bảng 18: browser SHA-256 time, chain read time and receipt gas on the local stack.
// Numbers describe this machine and a Hardhat automine node, not a public network.
const RUNS = Number(process.env.MEASURE_RUNS ?? 50);
const RPC_RUNS = Number(process.env.MEASURE_RPC_RUNS ?? 200);
const sizes = [100 * 1024, 512 * 1024, 1024 * 1024, 2 * 1024 * 1024, 5 * 1024 * 1024];

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const sd = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1));
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { runs: samples.length, meanMs: round(mean), medianMs: round((sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2), p95Ms: round(at(0.95)), sdMs: round(sd), minMs: round(sorted[0]), maxMs: round(sorted[sorted.length - 1]) };
}

test('QA-05: measure PDF hashing in the browser, chain reads and gas', async ({ page, browser }) => {
  test.setTimeout(600_000);
  const state = readState();
  const abi = JSON.parse(readFileSync(join(tempDir, 'contract-config.json'), 'utf8')).abi;
  const provider = new JsonRpcProvider(urls.rpc, 31337, { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 1 });
  provider.pollingInterval = 50;
  const admin = await provider.getSigner(0);
  const issuer = await provider.getSigner(1);
  const registry = new Contract(state.contractAddress, abi, issuer);

  // Gas from receipts on this run (cross-check of scripts/measure-gas.js).
  const grant = await (await (registry.connect(admin) as Contract).getFunction('grantRole')(roleId('ISSUER_ROLE'), state.wallets.newIssuer)).wait();
  const certificateId = '0x' + randomBytes(32).toString('hex');
  const sent = performance.now();
  const issueTx = await registry.getFunction('issueCertificate')(certificateId, '0x' + randomBytes(32).toString('hex'), state.wallets.student);
  const issue = await issueTx.wait();
  const confirmMs = performance.now() - sent;
  const otherId = '0x' + randomBytes(32).toString('hex');
  await (await registry.getFunction('issueCertificate')(otherId, '0x' + randomBytes(32).toString('hex'), state.wallets.student)).wait();
  const revoke = await (await registry.getFunction('revokeCertificate')(otherId, 4)).wait();
  const gas = {
    grantRole: Number(grant.gasUsed), issueCertificate: Number(issue.gasUsed), revokeCertificate: Number(revoke.gasUsed),
    effectiveGasPriceWei: issue.gasPrice.toString(), issueConfirmMsAutomine: Math.round(confirmMs * 10) / 10,
  };

  // Browser: SHA-256 of random buffers, digest alone and Blob → arrayBuffer → digest like pdfHash().
  await page.goto('/verify');
  const hashing: Record<string, unknown>[] = [];
  for (const size of sizes) {
    const samples = await page.evaluate(async ({ size, runs }) => {
      const bytes = new Uint8Array(size);
      for (let offset = 0; offset < size; offset += 65536) crypto.getRandomValues(bytes.subarray(offset, Math.min(size, offset + 65536)));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      for (let i = 0; i < 5; i++) await crypto.subtle.digest('SHA-256', bytes);
      const digest: number[] = [];
      const pipeline: number[] = [];
      for (let i = 0; i < runs; i++) {
        let start = performance.now();
        await crypto.subtle.digest('SHA-256', bytes);
        digest.push(performance.now() - start);
        start = performance.now();
        await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        pipeline.push(performance.now() - start);
      }
      return { digest, pipeline };
    }, { size, runs: RUNS });
    hashing.push({ bytes: size, label: size >= 1048576 ? `${size / 1048576} MiB` : `${size / 1024} KiB`, digest: stats(samples.digest), blobToDigest: stats(samples.pipeline) });
  }

  // Chain reads: Node → RPC (eth_call), browser → Vite /rpc proxy → RPC, and backend public API.
  const getCertificate = registry.getFunction('getCertificate');
  for (let i = 0; i < 20; i++) await getCertificate(certificateId);
  const direct: number[] = [];
  for (let i = 0; i < RPC_RUNS; i++) { const start = performance.now(); await getCertificate(certificateId); direct.push(performance.now() - start); }
  const callData = registry.interface.encodeFunctionData('getCertificate', [certificateId]);
  const viaProxy = await page.evaluate(async ({ to, data, runs }) => {
    const call = () => fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) }).then(r => r.json());
    for (let i = 0; i < 10; i++) await call();
    const samples: number[] = [];
    for (let i = 0; i < runs; i++) { const start = performance.now(); const body = await call(); samples.push(performance.now() - start); if (!body.result) throw new Error('eth_call failed'); }
    return samples;
  }, { to: state.contractAddress, data: callData, runs: Math.min(RPC_RUNS, 100) });
  const viaApi = await page.evaluate(async ({ id, runs }) => {
    for (let i = 0; i < 10; i++) await fetch(`/api/v1/certificates/${id}/public`);
    const samples: number[] = [];
    for (let i = 0; i < runs; i++) { const start = performance.now(); const response = await fetch(`/api/v1/certificates/${id}/public`); await response.json(); samples.push(performance.now() - start); }
    return samples;
  }, { id: certificateId, runs: Math.min(RPC_RUNS, 100) });

  const git = (...args: string[]) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; } };
  const hardhatVersion = JSON.parse(readFileSync(join(root, 'node_modules/hardhat/package.json'), 'utf8')).version;
  const result = {
    measuredAt: new Date().toISOString(),
    environment: {
      os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cpuCount: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30),
      node: process.version, browser: `${browser.browserType().name()} ${browser.version()}`, hardhat: hardhatVersion,
      solidity: '0.8.20', optimizer: { enabled: true, runs: 200 }, chainId: state.chainId, network: 'Hardhat node (automine), localhost',
      commit: git('rev-parse', 'HEAD'), branch: git('rev-parse', '--abbrev-ref', 'HEAD'), dirty: Boolean(git('status', '--porcelain')),
    },
    method: {
      hashing: `${RUNS} lần/kích thước sau 5 lần khởi động; performance.now() trước/sau crypto.subtle.digest('SHA-256'); dữ liệu ngẫu nhiên tạo trong trang`,
      chainRead: `getCertificate(id) qua eth_call: Node→RPC ${RPC_RUNS} lần sau 20 lần khởi động; trình duyệt→/rpc và trình duyệt→/api/v1/certificates/:id/public mỗi loại ${Math.min(RPC_RUNS, 100)} lần sau 10 lần khởi động`,
      gas: 'receipt.gasUsed của giao dịch thật trong lần chạy; effectiveGasPrice của Hardhat local chỉ để tham khảo, không quy đổi phí mạng công khai',
    },
    gas,
    hashing,
    chainRead: { nodeToRpcEthCall: stats(direct), browserToViteRpcProxy: stats(viaProxy), browserToBackendPublicApi: stats(viaApi) },
  };
  writeFileSync(join(root, 'docs/evidence/measurements.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ gas, hashing: hashing.map((h: any) => [h.label, h.digest.medianMs, h.blobToDigest.medianMs]), rpc: result.chainRead }, null, 2));
  expect(gas.issueCertificate).toBeGreaterThan(0);
  provider.destroy();
});
