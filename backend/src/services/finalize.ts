import type Database from 'better-sqlite3';
import type { AppConfig } from '../config.js';
import { findCertificate } from '../database.js';
import { ApiError, invariant } from '../errors.js';
import type { ChainService } from './chain.js';
import type { PrivateStorage } from './storage.js';
import { assertChainMatches, privateMetadata, syncCertificate } from './certificates.js';

const rejectedIssuanceErrors = new Set(['TX_MISMATCH', 'EVENT_MISMATCH', 'TX_FAILED', 'CHAIN_STATE_MISMATCH']);

export async function finalizeCertificate(config: AppConfig, db: Database.Database, chain: ChainService, storage: PrivateStorage, id: string, wallet: string, txHash: string) {
  const original = findCertificate(db, id);
  invariant(original, 404, 'NOT_FOUND', 'Draft not found');
  invariant(original.issuer_wallet === wallet, 403, 'FORBIDDEN', 'Only the draft issuer can finalize it');
  invariant(original.chain_id === config.chainId && original.contract_address === config.contractAddress, 409, 'CHAIN_STATE_MISMATCH', 'Draft belongs to a different contract configuration');
  await storage.read(original);
  db.transaction(() => {
    const current = findCertificate(db, id)!;
    invariant(!current.tx_hash || current.tx_hash === txHash || current.sync_state === 'FAILED', 409, 'TX_ALREADY_BOUND', 'Draft is already bound to a different transaction');
    // Recover rejected claims persisted by older versions, without releasing uncertain or confirmed transactions.
    db.prepare(`UPDATE CertificateFile SET tx_hash = NULL, updated_at = ? WHERE tx_hash = ? AND sync_state = 'FAILED'
      AND error_code IN (${[...rejectedIssuanceErrors].map(() => '?').join(', ')})`)
      .run(new Date().toISOString(), txHash, ...rejectedIssuanceErrors);
    const used = db.prepare('SELECT certificate_id FROM CertificateFile WHERE tx_hash = ? AND certificate_id <> ?').get(txHash, id);
    invariant(!used, 409, 'TX_ALREADY_USED', 'Transaction is already bound to a different draft');
    if (current.sync_state !== 'ISSUED' && current.sync_state !== 'REVOKED') {
      db.prepare("UPDATE CertificateFile SET tx_hash = ?, sync_state = 'PENDING_CHAIN', error_code = NULL, updated_at = ? WHERE certificate_id = ?").run(txHash, new Date().toISOString(), id);
    }
  })();
  try {
    const cert = await chain.issuance(txHash, { certificateId: id, fileHash: original.file_hash, issuer: original.issuer_wallet, student: original.student_wallet });
    if (!cert) return { status: 202, data: privateMetadata(findCertificate(db, id)!) };
    assertChainMatches(original, cert, config);
    invariant(findCertificate(db, id)?.tx_hash === txHash, 409, 'TX_ALREADY_BOUND', 'Draft transaction changed during reconciliation');
    syncCertificate(db, original, cert);
    return { status: 200, data: privateMetadata(findCertificate(db, id)!) };
  } catch (error) {
    if (error instanceof ApiError) {
      db.prepare("UPDATE CertificateFile SET tx_hash = ?, sync_state = ?, error_code = ?, updated_at = ? WHERE certificate_id = ? AND tx_hash = ? AND sync_state NOT IN ('ISSUED','REVOKED')")
        .run(rejectedIssuanceErrors.has(error.code) ? null : txHash, error.code === 'RPC_ERROR' ? 'PENDING_CHAIN' : 'FAILED', error.code, new Date().toISOString(), id, txHash);
    }
    throw error;
  }
}
