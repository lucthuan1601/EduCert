import type { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { authIdentity, type createAuth } from '../auth.js';
import { findCertificate, type CertificateRow } from '../database.js';
import { invariant } from '../errors.js';
import { bytes32Schema, paginationSchema } from '../validation.js';
import type { ChainService } from '../services/chain.js';
import { assertChainMatches, privateMetadata, syncCertificate } from '../services/certificates.js';

const eventSchema = paginationSchema.extend({
  fromBlock: z.coerce.number().int().min(0).optional(), toBlock: z.coerce.number().int().min(0).optional(),
  type: z.enum(['ALL', 'ISSUED', 'REVOKED']).default('ALL'),
}).strict();

export function mountQueries(router: Router, config: AppConfig, db: Database.Database, auth: ReturnType<typeof createAuth>, chain: ChainService) {
  const network = { chainId: config.chainId, contractAddress: config.contractAddress };
  router.get('/certificates/:id/public', async (req, res) => {
    const certificateId = bytes32Schema.parse(req.params.id);
    const cert = await chain.certificate(certificateId);
    invariant(cert.exists, 404, 'NOT_FOUND', 'Certificate is not registered on the configured blockchain');
    res.json({ success: true, data: { certificateId, ...network, ...cert, status: cert.revoked ? 'REVOKED' : 'REGISTERED_ACTIVE' } });
  });
  router.get('/me/certificates', auth.requireSession, async (req, res) => {
    const { offset, limit } = paginationSchema.strict().parse(req.query);
    const wallet = authIdentity(req).wallet;
    const conditions = "student_wallet = ? AND chain_id = ? AND contract_address = ? AND sync_state IN ('ISSUED','REVOKED')";
    const params = [wallet, config.chainId, config.contractAddress];
    const total = (db.prepare(`SELECT COUNT(*) AS count FROM CertificateFile WHERE ${conditions}`).get(...params) as { count: number }).count;
    const rows = db.prepare(`SELECT * FROM CertificateFile WHERE ${conditions} ORDER BY created_at DESC, certificate_id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as CertificateRow[];
    const items = await Promise.all(rows.map(async row => {
      const cert = await chain.certificate(row.certificate_id);
      assertChainMatches(row, cert, config);
      syncCertificate(db, row, cert);
      return { ...privateMetadata(findCertificate(db, row.certificate_id)!), issuedAt: cert.issuedAt, revokedAt: cert.revokedAt, revokeReasonCode: cert.revokeReasonCode,
        downloadUrl: `/api/v1/certificates/${row.certificate_id}/download` };
    }));
    res.json({ success: true, data: { items, total, offset, limit } });
  });
  router.get('/stats', async (_req, res) => res.json({ success: true, data: { ...network, ...await chain.stats() } }));
  router.get('/events', async (req, res) => res.json({ success: true, data: { ...network, ...await chain.events(eventSchema.parse(req.query)) } }));
}
