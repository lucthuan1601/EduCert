import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyMessage } from 'ethers';
import type { Router, RequestHandler, Request } from 'express';
import type Database from 'better-sqlite3';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import type { ChainService } from './services/chain.js';
import { ApiError, invariant } from './errors.js';
import { walletSchema } from './validation.js';

interface AuthIdentity { wallet: string; csrfToken: string; expiresAt: number; tokenHash: string }
declare module 'express-serve-static-core' { interface Request { auth?: AuthIdentity } }
interface NonceRow { wallet: string; message: string; expires_at: number; used: number }
interface SessionRow { wallet: string; csrf_token: string; expires_at: number }
const COOKIE = 'educert_session';
const nonceSchema = z.object({ wallet: walletSchema }).strict();
const signatureSchema = z.object({ wallet: walletSchema, nonce: z.string().regex(/^[a-f0-9]{64}$/), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) }).strict();

export function authIdentity(req: Request): AuthIdentity {
  invariant(req.auth, 401, 'UNAUTHENTICATED', 'Sign in with your wallet first');
  return req.auth;
}

export function createAuth(config: AppConfig, db: Database.Database, chain: ChainService) {
  const digest = (value: string) => createHmac('sha256', config.sessionSecret).update(value).digest('hex');
  const cookieOptions = { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax' as const, path: '/api/v1' };
  const requireSession: RequestHandler = (req, _res, next) => {
    const token: unknown = req.cookies?.[COOKIE];
    invariant(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 401, 'UNAUTHENTICATED', 'Sign in with your wallet first');
    const tokenHash = digest(token);
    const session = db.prepare('SELECT * FROM AuthSession WHERE token_hash = ?').get(tokenHash) as SessionRow | undefined;
    invariant(session && session.expires_at > Date.now(), 401, 'SESSION_EXPIRED', 'Session is missing or expired');
    req.auth = { wallet: session.wallet, csrfToken: session.csrf_token, expiresAt: session.expires_at, tokenHash };
    next();
  };
  const requireCsrf: RequestHandler = (req, _res, next) => {
    const supplied = req.get('X-CSRF-Token');
    const session = authIdentity(req);
    invariant(supplied && /^[a-f0-9]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(session.csrfToken, 'hex')), 403, 'CSRF_INVALID', 'Missing or invalid CSRF token');
    next();
  };
  const requireIssuer: RequestHandler = async (req, _res, next) => {
    const roles = await chain.roles(authIdentity(req).wallet);
    invariant(roles.issuer, 403, 'ISSUER_REQUIRED', 'Current wallet does not have ISSUER_ROLE');
    next();
  };
  const limiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts' } }); },
  });

  function mount(router: Router) {
    router.post('/auth/nonce', limiter, (req, res) => {
      const { wallet } = nonceSchema.parse(req.body);
      const nonce = randomBytes(32).toString('hex');
      const now = Date.now();
      const expiresAt = now + config.nonceTtlSeconds * 1000;
      const message = `${new URL(config.publicAppUrl).host} wants you to sign in to EduCert.\n\nWallet: ${wallet}\nURI: ${config.publicAppUrl}\nChain ID: ${config.chainId}\nNonce: ${nonce}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${new Date(expiresAt).toISOString()}\n\nThis signature signs in to EduCert and does not authorize a blockchain transaction.`;
      db.prepare('DELETE FROM AuthNonce WHERE expires_at <= ?').run(now);
      db.prepare('DELETE FROM AuthSession WHERE expires_at <= ?').run(now);
      db.prepare('INSERT INTO AuthNonce(nonce_hash, wallet, message, expires_at) VALUES (?, ?, ?, ?)').run(digest(nonce), wallet, message, expiresAt);
      res.status(201).json({ success: true, data: { wallet, nonce, message, expiresAt: new Date(expiresAt).toISOString() } });
    });
    router.post('/auth/verify', limiter, (req, res) => {
      const { wallet, nonce, signature } = signatureSchema.parse(req.body);
      const nonceHash = digest(nonce);
      const challenge = db.prepare('SELECT * FROM AuthNonce WHERE nonce_hash = ?').get(nonceHash) as NonceRow | undefined;
      invariant(challenge && challenge.wallet === wallet && !challenge.used && challenge.expires_at > Date.now(), 401, 'NONCE_INVALID', 'Nonce is expired, already used or does not match this wallet');
      let recovered: string;
      try { recovered = verifyMessage(challenge.message, signature); }
      catch { throw new ApiError(401, 'SIGNATURE_INVALID', 'Wallet signature is invalid'); }
      invariant(recovered === wallet, 401, 'SIGNATURE_INVALID', 'Wallet signature does not match the requested wallet');
      const token = randomBytes(32).toString('hex');
      const csrfToken = randomBytes(32).toString('hex');
      const expiresAt = Date.now() + config.sessionTtlSeconds * 1000;
      db.transaction(() => {
        const consumed = db.prepare('UPDATE AuthNonce SET used = 1 WHERE nonce_hash = ? AND used = 0 AND expires_at > ?').run(nonceHash, Date.now());
        invariant(consumed.changes === 1, 401, 'NONCE_INVALID', 'Nonce can only be used once');
        const previous = req.cookies?.[COOKIE];
        if (typeof previous === 'string') db.prepare('DELETE FROM AuthSession WHERE token_hash = ?').run(digest(previous));
        db.prepare('INSERT INTO AuthSession(token_hash, wallet, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(digest(token), wallet, csrfToken, expiresAt);
      })();
      res.cookie(COOKIE, token, { ...cookieOptions, maxAge: config.sessionTtlSeconds * 1000 });
      res.json({ success: true, data: { wallet, csrfToken, expiresAt: new Date(expiresAt).toISOString() } });
    });
    router.get('/auth/me', requireSession, async (req, res) => {
      const session = authIdentity(req);
      res.json({ success: true, data: { wallet: session.wallet, csrfToken: session.csrfToken, expiresAt: new Date(session.expiresAt).toISOString(), roles: await chain.roles(session.wallet) } });
    });
    router.post('/auth/logout', requireSession, requireCsrf, (req, res) => {
      db.prepare('DELETE FROM AuthSession WHERE token_hash = ?').run(authIdentity(req).tokenHash);
      res.clearCookie(COOKIE, cookieOptions);
      res.json({ success: true, data: { loggedOut: true } });
    });
  }
  return { mount, requireSession, requireCsrf, requireIssuer };
}
