import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, JsonRpcProvider, id as roleId } from 'ethers';

// Boots an isolated EduCert stack for the E2E run: Hardhat node, backend and Vite
// on their own ports, with a fresh contract, SQLite file and private PDF folder.
export const root = fileURLToPath(new URL('../', import.meta.url));
export const e2eDir = fileURLToPath(new URL('./', import.meta.url));
export const tempDir = join(e2eDir, '.tmp');
export const evidenceDir = join(root, 'docs', 'evidence', 'e2e');
export const ports = {
  rpc: Number(process.env.E2E_RPC_PORT ?? 8546),
  backend: Number(process.env.E2E_BACKEND_PORT ?? 3101),
  frontend: Number(process.env.E2E_FRONTEND_PORT ?? 5175),
};
export const urls = {
  rpc: `http://127.0.0.1:${ports.rpc}`,
  backend: `http://127.0.0.1:${ports.backend}`,
  app: `http://localhost:${ports.frontend}`,
};

// Hardhat's default development accounts (public, test-only). Index → role in the E2E story.
export const accounts = {
  admin: 0, // deployer, DEFAULT_ADMIN_ROLE
  issuer: 1, // granted ISSUER_ROLE by setup
  student: 2,
  otherStudent: 3,
  newIssuer: 4, // granted ISSUER_ROLE through the /admin page in E2E-01
} as const;

export interface StackState { contractAddress: string; chainId: number; wallets: Record<keyof typeof accounts, string>; pids: number[]; startedAt: string }

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(name: string, check: () => Promise<boolean>, child: ChildProcess, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${name} exited early with code ${child.exitCode}; see e2e/.tmp/${name}.log`);
    try { if (await check()) return; } catch { /* still starting */ }
    await pause(250);
  }
  throw new Error(`${name} did not become ready in ${timeoutMs} ms; see e2e/.tmp/${name}.log`);
}

function start(name: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env, FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  // Hardhat prints development keys; keep output in an ignored log file instead of the console.
  const log = createWriteStream(join(tempDir, `${name}.log`));
  child.stdout!.pipe(log);
  child.stderr!.pipe(log);
  return child;
}

const ok = async (url: string, init?: RequestInit) => (await fetch(url, { ...init, signal: AbortSignal.timeout(2000) })).ok;

export async function startStack(): Promise<StackState> {
  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  mkdirSync(join(evidenceDir, 'screenshots'), { recursive: true });

  const artifactPath = join(root, 'artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json');
  if (!existsSync(artifactPath)) {
    const compile = start('compile', [join(root, 'node_modules/hardhat/internal/cli/cli.js'), 'compile'], root);
    await new Promise(resolve => compile.on('exit', resolve));
  }
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

  const hardhat = start('hardhat', [join(root, 'node_modules/hardhat/internal/cli/cli.js'), 'node', '--hostname', '127.0.0.1', '--port', String(ports.rpc)], root);
  await waitFor('hardhat', async () => {
    const response = await fetch(urls.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(1000) });
    return (await response.json()).result === '0x7a69';
  }, hardhat);

  const provider = new JsonRpcProvider(urls.rpc, 31337, { staticNetwork: true, cacheTimeout: -1 });
  provider.pollingInterval = 100;
  const signers = await Promise.all(Object.values(accounts).map(index => provider.getSigner(index)));
  const wallets = Object.fromEntries(Object.keys(accounts).map((role, i) => [role, signers[i].address])) as StackState['wallets'];
  const deployed = await new ContractFactory(artifact.abi, artifact.bytecode, signers[accounts.admin]).deploy();
  await deployed.waitForDeployment();
  const contractAddress = await deployed.getAddress();
  await (await (deployed.connect(signers[accounts.admin]) as any).grantRole(roleId('ISSUER_ROLE'), wallets.issuer)).wait();
  provider.destroy();

  const configPath = join(tempDir, 'contract-config.json');
  writeFileSync(configPath, JSON.stringify({ chainId: 31337, contractAddress, abi: artifact.abi }, null, 2));

  const backend = start('backend', [join(root, 'backend/node_modules/tsx/dist/cli.mjs'), 'src/server.ts'], join(root, 'backend'), {
    HOST: '127.0.0.1', PORT: String(ports.backend), PUBLIC_APP_URL: urls.app, RPC_URL: urls.rpc,
    CONTRACT_CONFIG_PATH: configPath, DATABASE_PATH: join(tempDir, 'educert.sqlite'), STORAGE_DIR: join(tempDir, 'private-pdfs'),
    SESSION_SECRET: randomBytes(32).toString('hex'), COOKIE_SECURE: 'false', NODE_ENV: 'test',
  });
  await waitFor('backend', () => ok(`${urls.backend}/api/v1/health`), backend);

  const frontend = start('frontend', [join(root, 'frontend/node_modules/vite/bin/vite.js'), '--port', String(ports.frontend), '--strictPort'], join(root, 'frontend'), {
    EDUCERT_BACKEND_URL: urls.backend, EDUCERT_RPC_URL: urls.rpc, VITE_WALLET_RPC_URL: urls.rpc,
  });
  await waitFor('frontend', async () => await ok(`${urls.app}/`) && await ok(`${urls.app}/api/v1/config`), frontend);

  const state: StackState = { contractAddress, chainId: 31337, wallets, pids: [frontend.pid!, backend.pid!, hardhat.pid!], startedAt: new Date().toISOString() };
  writeFileSync(join(tempDir, 'state.json'), JSON.stringify(state, null, 2));
  return state;
}

export function readState(): StackState {
  return JSON.parse(readFileSync(join(tempDir, 'state.json'), 'utf8'));
}

export async function stopStack(state: StackState | undefined = existsSync(join(tempDir, 'state.json')) ? readState() : undefined) {
  for (const pid of state?.pids ?? []) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else process.kill(pid, 'SIGTERM');
    } catch { /* already stopped */ }
  }
  await pause(500);
}
