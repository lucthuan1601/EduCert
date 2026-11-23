import type Database from 'better-sqlite3';
import type { AppConfig } from '../config.js';
import type { CertificateRow } from '../database.js';
import type { ChainCertificate } from './chain.js';
import { invariant } from '../errors.js';

export function assertChainMatches(row: CertificateRow, cert: ChainCertificate, config: AppConfig) {
  invariant(row.chain_id === config.chainId && row.contract_address === config.contractAddress, 409, 'CHAIN_STATE_MISMATCH', 'Certificate belongs to a different contract configuration');
  invariant(cert.exists && cert.fileHash === row.file_hash && cert.issuer === row.issuer_wallet && cert.student === row.student_wallet, 409, 'CHAIN_STATE_MISMATCH', 'On-chain certificate does not match the stored draft');
}

export function syncCertificate(db: Database.Database, row: CertificateRow, cert: ChainCertificate) {
  const state = cert.revoked ? 'REVOKED' : 'ISSUED';
  db.prepare('UPDATE CertificateFile SET sync_state = ?, error_code = NULL, updated_at = ? WHERE certificate_id = ?').run(state, new Date().toISOString(), row.certificate_id);
  return state;
}

export function privateMetadata(row: CertificateRow) {
  return {
    certificateId: row.certificate_id, studentWallet: row.student_wallet, issuerWallet: row.issuer_wallet,
    studentName: row.student_name, courseName: row.course_name, fileHash: row.file_hash, fileSize: row.file_size,
    txHash: row.tx_hash, chainId: row.chain_id, contractAddress: row.contract_address,
    syncState: row.sync_state, errorCode: row.error_code, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
