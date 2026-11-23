import type { Router } from 'express';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../config.js';
import { authIdentity, type createAuth } from '../auth.js';
import { findCertificate } from '../database.js';
import { invariant } from '../errors.js';
import { bytes32Schema } from '../validation.js';
import type { ChainService } from '../services/chain.js';
import type { PrivateStorage } from '../services/storage.js';
import { assertChainMatches, syncCertificate } from '../services/certificates.js';

export function mountFiles(router: Router, config: AppConfig, db: Database.Database, auth: ReturnType<typeof createAuth>, chain: ChainService, storage: PrivateStorage) {
  router.get('/certificates/:id/download', auth.requireSession, async (req, res) => {
    const id = bytes32Schema.parse(req.params.id);
    const row = findCertificate(db, id);
    invariant(row, 404, 'NOT_FOUND', 'Certificate not found');
    const wallet = authIdentity(req).wallet;
    const owner = wallet === row.student_wallet || wallet === row.issuer_wallet;
    invariant(owner || (await chain.roles(wallet)).admin, 403, 'FORBIDDEN', 'This wallet cannot download this certificate');
    invariant(row.sync_state === 'ISSUED' || row.sync_state === 'REVOKED', 409, 'NOT_ISSUED', 'Certificate has not been finalized');
    const cert = await chain.certificate(id);
    assertChainMatches(row, cert, config);
    syncCertificate(db, row, cert);
    const bytes = await storage.read(row);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="educert-${id.slice(2)}.pdf"`, 'X-File-Hash': row.file_hash });
    res.send(bytes);
  });
}
