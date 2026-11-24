import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Synthetic demo data from Phụ lục C — never real people, logos or seals.
export const demo = { studentName: 'Nguyễn Văn A', courseName: 'Blockchain Fundamentals', issuerName: 'Demo University', issuedDate: '2026-11-20' };

/** Edit visible content the way a forger would: add a line to the first page and save. */
export async function tamper(source: Uint8Array) {
  const doc = await PDFDocument.load(source);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.getPage(0).drawText('Final grade: A+ (edited after issuance)', { x: 300, y: 250, size: 14, font, color: rgb(0.7, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}
