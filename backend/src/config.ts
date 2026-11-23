import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAddress, type InterfaceAbi } from 'ethers';
import { config as dotenv } from 'dotenv';
import { z } from 'zod';

export const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export interface AppConfig {
  host: string; port: number; publicAppUrl: string; allowedOrigins: string[];
  rpcUrl: string; chainId: number; contractAddress: string; abi: InterfaceAbi;
  databasePath: string; storageDir: string; sessionSecret: string;
  sessionTtlSeconds: number; nonceTtlSeconds: number; cookieSecure: boolean;
}

export function loadConfig(): AppConfig {
  dotenv({ path: resolve(backendRoot, '.env'), quiet: true });
  const env = z.object({
    HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    PUBLIC_APP_URL: z.url().default('http://localhost:5173'), RPC_URL: z.url().default('http://127.0.0.1:8545'),
    CONTRACT_CONFIG_PATH: z.string().default('../config/contract-config.json'),
    DATABASE_PATH: z.string().default('./storage/educert.sqlite'), STORAGE_DIR: z.string().default('./storage/pdfs'),
    SESSION_SECRET: z.string().min(32).refine(value => !value.startsWith('replace-with-'), 'Run npm run setup:env first'),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(28800),
    NONCE_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(300),
    COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  }).parse(process.env);
  const url = new URL(env.PUBLIC_APP_URL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PUBLIC_APP_URL must be an http(s) origin without path, credentials or query');
  }
  if (env.NODE_ENV === 'production' && (env.COOKIE_SECURE !== 'true' || url.protocol !== 'https:')) {
    throw new Error('Production requires HTTPS PUBLIC_APP_URL and COOKIE_SECURE=true');
  }
  const contract = z.object({ chainId: z.number().int().positive(), contractAddress: z.string(), abi: z.array(z.unknown()) })
    .parse(JSON.parse(readFileSync(resolve(backendRoot, env.CONTRACT_CONFIG_PATH), 'utf8')));
  return {
    host: env.HOST, port: env.PORT, publicAppUrl: url.origin, allowedOrigins: [url.origin], rpcUrl: env.RPC_URL,
    chainId: contract.chainId, contractAddress: getAddress(contract.contractAddress), abi: contract.abi as InterfaceAbi,
    databasePath: resolve(backendRoot, env.DATABASE_PATH), storageDir: resolve(backendRoot, env.STORAGE_DIR),
    sessionSecret: env.SESSION_SECRET, sessionTtlSeconds: env.SESSION_TTL_SECONDS,
    nonceTtlSeconds: env.NONCE_TTL_SECONDS, cookieSecure: env.COOKIE_SECURE === 'true',
  };
}
