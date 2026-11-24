import type { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { invariant } from '../errors.js';
import { bytes32Schema } from '../validation.js';
import type { ChainService } from '../services/chain.js';
import { VerificationReportRenderer } from '../services/verification-report.js';

// Only the hash computed in the verifier's browser is sent; the PDF itself never leaves the device.
const reportQuery = z.object({ fileHash: bytes32Schema.optional() }).strict();

export function mountReports(router: Router, config: AppConfig, chain: ChainService) {
  const renderer = new VerificationReportRenderer();
  const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many report requests' } }); },
  });
  router.get('/certificates/:id/verification-report', limiter, async (req, res) => {
    const certificateId = bytes32Schema.parse(req.params.id);
    const { fileHash } = reportQuery.parse(req.query);
    const certificate = await chain.certificateSnapshot(certificateId);
    invariant(certificate.exists, 404, 'NOT_FOUND', 'Certificate is not registered on the configured blockchain');
    const checkedAt = new Date();
    const { bytes, summary, fingerprint } = await renderer.render({
      certificateId, chainId: config.chainId, contractAddress: config.contractAddress,
      verifyUrl: `${config.publicAppUrl}/verify/${certificateId}`, certificate, candidateHash: fileHash, checkedAt,
    });
    const stamp = summary.checkedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="educert-bien-ban-${certificateId.slice(2, 10)}-${stamp}.pdf"`,
      'X-Report-Fingerprint': fingerprint,
    });
    res.send(bytes);
  });
}
