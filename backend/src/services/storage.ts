import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { lstat, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { backendRoot, MAX_PDF_BYTES } from '../config.js';
import type { CertificateRow } from '../database.js';
import { ApiError, invariant } from '../errors.js';

export const sha256 = (bytes: Uint8Array) => `0x${createHash('sha256').update(bytes).digest('hex')}`;
export function checkPdfInput(bytes: Buffer, mime = 'application/pdf') {
  invariant(bytes.length <= MAX_PDF_BYTES, 413, 'FILE_TOO_LARGE', 'PDF must not exceed 5 MiB');
  invariant(mime === 'application/pdf' && bytes.subarray(0, 5).toString('ascii') === '%PDF-', 400, 'INVALID_PDF', 'Expected a PDF file');
}

export class PrivateStorage {
  readonly root: string;
  constructor(path: string) {
    const resolved = resolve(path);
    const publicRoots = ['../frontend/public', '../frontend/dist', '../public', '../dist'].flatMap(value => {
      const logical = resolve(backendRoot, value);
      try { return [logical, realpathSync(logical)]; }
      catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return [logical];
        throw error;
      }
    });
    const assertPrivate = (candidate: string) => {
      for (const forbidden of publicRoots) {
        const child = relative(forbidden, candidate);
        const outside = child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child);
        invariant(outside, 500, 'STORAGE_CONFIGURATION_ERROR', 'PDF storage must be outside public directories');
      }
    };
    assertPrivate(resolved);
    mkdirSync(resolved, { recursive: true, mode: 0o700 });
    this.root = realpathSync(resolved);
    assertPrivate(this.root);
  }
  private path(key: string) {
    invariant(/^[a-f0-9]{64}\.pdf$/.test(key) && basename(key) === key, 400, 'INVALID_STORAGE_KEY', 'Invalid internal storage key');
    return resolve(this.root, key);
  }
  async put(certificateId: string, bytes: Buffer) {
    checkPdfInput(bytes);
    const key = `${certificateId.slice(2)}.pdf`;
    try { await writeFile(this.path(key), bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ApiError(409, 'FILE_ALREADY_EXISTS', 'Certificate PDF is immutable');
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Unable to save the certificate PDF');
    }
    return { key, fileHash: sha256(bytes), fileSize: bytes.length };
  }
  async read(row: Pick<CertificateRow, 'storage_key' | 'file_hash' | 'file_size'>): Promise<Buffer> {
    const path = this.path(row.storage_key);
    try {
      const stat = await lstat(path);
      invariant(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_PDF_BYTES, 503, 'FILE_INTEGRITY_ERROR', 'Stored PDF is not a regular certificate file');
      const bytes = await readFile(path);
      invariant(bytes.length === row.file_size && sha256(bytes) === row.file_hash, 503, 'FILE_INTEGRITY_ERROR', 'Stored PDF does not match its registered hash');
      return bytes;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Stored PDF is unavailable');
    }
  }
  async removeUncommitted(key: string) {
    await unlink(this.path(key)).catch(() => undefined);
  }
}
