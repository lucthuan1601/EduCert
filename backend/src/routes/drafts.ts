import { randomBytes } from 'node:crypto';
import type { Router, RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { type AppConfig, MAX_PDF_BYTES } from '../config.js';
import { authIdentity, type createAuth } from '../auth.js';
import { findCertificate } from '../database.js';
import { ApiError, invariant } from '../errors.js';
import { bytes32Schema, labelSchema, walletSchema } from '../validation.js';
import type { ChainService } from '../services/chain.js';
import type { PrivateStorage } from '../services/storage.js';
import { checkPdfInput } from '../services/storage.js';
import type { PdfAdapter } from '../services/pdf.js';
import { privateMetadata } from '../services/certificates.js';
import { finalizeCertificate } from '../services/finalize.js';

const draftSchema = z.object({
  studentWallet: walletSchema, studentName: labelSchema(120), courseName: labelSchema(200),
  issuerName: labelSchema(120).default('Demo University'),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date').optional(),
}).strict();
const finalizeSchema = z.object({ txHash: bytes32Schema }).strict();

export function mountDrafts(router: Router, config: AppConfig, db: Database.Database, auth: ReturnType<typeof createAuth>, chain: ChainService, storage: PrivateStorage, pdf: PdfAdapter) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 8, fieldSize: 4096, parts: 9 },
    fileFilter: (_req, file, callback) => file.mimetype === 'application/pdf' ? callback(null, true) : callback(new ApiError(400, 'INVALID_PDF', 'Expected application/pdf')),
  });
  const readUpload = upload.single('file');
  const parseUpload: RequestHandler = (req, res, next) => {
    readUpload(req, res, (error: unknown) => {
      if (!error || error instanceof ApiError || error instanceof multer.MulterError) next(error);
      else next(new ApiError(400, 'UPLOAD_ERROR', 'Malformed multipart upload'));
    });
  };
  const draftAccess = [auth.requireSession, auth.requireCsrf, auth.requireIssuer];

  async function createDraft(wallet: string, body: unknown, source?: Buffer) {
    const fields = draftSchema.parse(body);
    const id = `0x${randomBytes(32).toString('hex')}`;
    const verifyUrl = `${config.publicAppUrl}/verify/${id}`;
    const bytes = source ? await pdf.stamp(source, id, verifyUrl) : await pdf.generate(id, verifyUrl, fields);
    const stored = await storage.put(id, bytes);
    const now = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO CertificateFile(certificate_id, student_wallet, issuer_wallet, student_name, course_name,
        file_hash, storage_key, file_size, chain_id, contract_address, sync_state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`).run(id, fields.studentWallet, wallet, fields.studentName, fields.courseName,
        stored.fileHash, stored.key, stored.fileSize, config.chainId, config.contractAddress, now, now);
    } catch (error) { await storage.removeUncommitted(stored.key); throw error; }
    return { ...privateMetadata(findCertificate(db, id)!), verifyUrl, previewUrl: `/api/v1/drafts/${id}/preview` };
  }

  router.post('/drafts/generate', ...draftAccess, async (req, res) => {
    res.status(201).json({ success: true, data: await createDraft(authIdentity(req).wallet, req.body) });
  });
  router.post('/drafts/upload', ...draftAccess, parseUpload, async (req, res) => {
    invariant(req.file, 400, 'FILE_REQUIRED', 'Provide a PDF in the file field');
    checkPdfInput(req.file.buffer, req.file.mimetype);
    res.status(201).json({ success: true, data: await createDraft(authIdentity(req).wallet, req.body, req.file.buffer) });
  });
  router.get('/drafts/:id', auth.requireSession, async (req, res) => {
    const id = bytes32Schema.parse(req.params.id);
    const row = findCertificate(db, id);
    invariant(row, 404, 'NOT_FOUND', 'Draft not found');
    invariant(row.issuer_wallet === authIdentity(req).wallet, 403, 'FORBIDDEN', 'Only the draft issuer can read it');
    res.json({ success: true, data: { ...privateMetadata(row), verifyUrl: `${config.publicAppUrl}/verify/${id}`, previewUrl: `/api/v1/drafts/${id}/preview` } });
  });
  router.get('/drafts/:id/preview', auth.requireSession, async (req, res) => {
    const id = bytes32Schema.parse(req.params.id);
    const row = findCertificate(db, id);
    invariant(row, 404, 'NOT_FOUND', 'Draft not found');
    invariant(row.issuer_wallet === authIdentity(req).wallet, 403, 'FORBIDDEN', 'Only the draft issuer can preview it');
    const bytes = await storage.read(row);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="educert-${id.slice(2)}.pdf"`, 'X-File-Hash': row.file_hash });
    res.send(bytes);
  });
  router.post('/certificates/:id/finalize', auth.requireSession, auth.requireCsrf, async (req, res) => {
    const id = bytes32Schema.parse(req.params.id);
    const { txHash } = finalizeSchema.parse(req.body);
    const result = await finalizeCertificate(config, db, chain, storage, id, authIdentity(req).wallet, txHash);
    res.status(result.status).json({ success: true, data: result.data });
  });
}
