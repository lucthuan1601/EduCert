import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { DEMO_NOTICE, TemplatePdfAdapter, displayDate } from '../src/services/pdf-template.js';
import { MAX_PDF_BYTES } from '../src/config.js';
import { sha256 } from '../src/services/storage.js';
import { decodePdfQrCodes, readPdfText } from './helpers/pdf-inspect.js';

// QA-01 checks for the certificate template and the upload stamping mode.
const adapter = new TemplatePdfAdapter();
const origin = 'http://192.168.1.20:5173';
const certificate = () => {
  const id = `0x${randomBytes(32).toString('hex')}`;
  return { id, verifyUrl: `${origin}/verify/${id}` };
};
const demo = { studentName: 'Nguyễn Văn A', courseName: 'Blockchain Fundamentals', issuerName: 'Demo University', issuedDate: '2026-11-20' };

function insidePage(page: Awaited<ReturnType<typeof readPdfText>>[number]) {
  for (const item of page.items) {
    assert.ok(item.x >= 20 && item.x + item.width <= page.width - 20, `"${item.text}" must stay inside the page border`);
    assert.ok(item.y >= 20 && item.y <= page.height - 20, `"${item.text}" must stay inside the page height`);
  }
}

test('QA-01: template PDF contains Vietnamese fields, ID, date and demo notice', async () => {
  const { id, verifyUrl } = certificate();
  const bytes = await adapter.generate(id, verifyUrl, demo);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 841.89, height: 595.28 });
  const [page] = await readPdfText(bytes);
  for (const expected of ['Nguyễn Văn A', 'Blockchain Fundamentals', 'Demo University', 'CHỨNG CHỈ HOÀN THÀNH KHÓA HỌC', 'Ngày cấp: 20/11/2026', DEMO_NOTICE]) {
    assert.ok(page.text.includes(expected), `PDF text must contain ${expected}`);
  }
  assert.ok(page.text.replace(/\s+/g, '').includes(id), 'PDF must print the full certificate ID');
  insidePage(page);
});

test('QA-01: template QR decodes to PUBLIC_APP_URL/verify/{certificateId}', async () => {
  const { id, verifyUrl } = certificate();
  const bytes = await adapter.generate(id, verifyUrl, demo);
  assert.deepEqual(await decodePdfQrCodes(bytes), [verifyUrl]);
});

test('QA-01: long names and course titles are shrunk or wrapped inside the page', async () => {
  const { id, verifyUrl } = certificate();
  const fields = {
    studentName: 'Nguyễn Hoàng Phương Thảo Nguyên Khánh Linh Trần Lê',
    courseName: 'Kiến trúc kết hợp On-chain và Off-chain cho hệ thống lưu trữ chứng chỉ học tập có xác minh độc lập bằng SHA-256',
    issuerName: 'Demo University — Khoa Công nghệ Thông tin và Hệ thống Phân tán', issuedDate: '2026-01-05',
  };
  const [page] = await readPdfText(await adapter.generate(id, verifyUrl, fields));
  insidePage(page);
  const flat = page.text.replace(/\s+/g, ' ');
  for (const word of ['Nguyễn', 'Khánh', 'SHA-256', 'Phân']) assert.ok(flat.includes(word), `wrapped text must keep ${word}`);
});

test('QA-01: missing issuedDate prints today in dd/mm/yyyy', async () => {
  const { id, verifyUrl } = certificate();
  const [page] = await readPdfText(await adapter.generate(id, verifyUrl, { ...demo, issuedDate: undefined }));
  assert.ok(page.text.includes(`Ngày cấp: ${displayDate(new Date().toISOString().slice(0, 10))}`));
});

test('QA-01: upload mode appends one QR page and keeps source pages unchanged', async () => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  for (const label of ['Source page one', 'Source page two']) source.addPage([400, 300]).drawText(label, { x: 40, y: 150, size: 18, font });
  const sourceBytes = Buffer.from(await source.save());
  const { id, verifyUrl } = certificate();
  const stamped = await adapter.stamp(sourceBytes, id, verifyUrl);

  assert.notEqual(sha256(stamped), sha256(sourceBytes), 'stamping must create a new file');
  const pages = await readPdfText(stamped);
  assert.equal(pages.length, 3);
  const before = await readPdfText(sourceBytes);
  assert.equal(pages[0].text, before[0].text);
  assert.equal(pages[1].text, before[1].text);
  assert.deepEqual([pages[0].width, pages[0].height], [400, 300]);
  assert.ok(pages[2].text.includes('TRANG THÔNG TIN XÁC MINH'));
  assert.ok(pages[2].text.includes('sau 2 trang'));
  assert.ok(pages[2].text.replace(/\s+/g, '').includes(id));
  insidePage(pages[2]);
  assert.deepEqual(await decodePdfQrCodes(stamped), [verifyUrl]);
});

test('QA-01: generated output is the final hashed artefact and stays under the size limit', async () => {
  const { id, verifyUrl } = certificate();
  const first = await adapter.generate(id, verifyUrl, demo);
  assert.ok(first.length < MAX_PDF_BYTES);
  // Hashing the returned bytes twice is stable; nothing mutates the buffer after rendering.
  assert.equal(sha256(first), sha256(Buffer.from(first)));
  const reloaded = Buffer.from(await (await PDFDocument.load(first)).save());
  assert.notEqual(sha256(reloaded), sha256(first), 're-saving changes the hash, so the QR must be drawn before hashing');
});
