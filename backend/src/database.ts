import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type SyncState = 'DRAFT' | 'PENDING_CHAIN' | 'ISSUED' | 'FAILED' | 'REVOKED';
export interface CertificateRow {
  certificate_id: string; student_wallet: string; issuer_wallet: string;
  student_name: string; course_name: string; file_hash: string; storage_key: string;
  file_size: number; tx_hash: string | null; chain_id: number; contract_address: string;
  sync_state: SyncState; error_code: string | null; created_at: string; updated_at: string;
}

export function openDatabase(path: string): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (Number(db.pragma('user_version', { simple: true })) > 1) {
    db.close();
    throw new Error('Database schema is newer than this backend supports');
  }
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS CertificateFile (
        certificate_id TEXT PRIMARY KEY,
        student_wallet TEXT NOT NULL, issuer_wallet TEXT NOT NULL,
        student_name TEXT NOT NULL, course_name TEXT NOT NULL,
        file_hash TEXT NOT NULL UNIQUE, storage_key TEXT NOT NULL UNIQUE,
        file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 5242880),
        tx_hash TEXT UNIQUE, chain_id INTEGER NOT NULL, contract_address TEXT NOT NULL,
        sync_state TEXT NOT NULL CHECK(sync_state IN ('DRAFT','PENDING_CHAIN','ISSUED','FAILED','REVOKED')),
        error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_certificate_student ON CertificateFile(student_wallet, created_at);
      CREATE INDEX IF NOT EXISTS idx_certificate_sync ON CertificateFile(sync_state);
      CREATE TABLE IF NOT EXISTS AuthNonce (
        nonce_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, message TEXT NOT NULL,
        expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0 CHECK(used IN (0,1))
      );
      CREATE TABLE IF NOT EXISTS AuthSession (
        token_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      PRAGMA user_version = 1;
    `);
  })();
  return db;
}

export function findCertificate(db: Database.Database, id: string): CertificateRow | undefined {
  return db.prepare('SELECT * FROM CertificateFile WHERE certificate_id = ?').get(id) as CertificateRow | undefined;
}
