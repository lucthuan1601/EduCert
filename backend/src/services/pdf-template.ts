import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFName, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { ApiError, invariant } from '../errors.js';
import { checkPdfInput } from './storage.js';
import type { PdfAdapter, PdfFields } from './pdf.js';

// QA-01: certificate template and QR stamping. The QR is always drawn before
// doc.save(), so the bytes returned here are the final bytes the caller hashes.
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const ink = rgb(0.11, 0.16, 0.23);
const muted = rgb(0.36, 0.42, 0.49);
const teal = rgb(0.05, 0.37, 0.4);
const gold = rgb(0.72, 0.56, 0.24);
const paper = rgb(0.99, 0.98, 0.95);
export const DEMO_NOTICE = 'BẢN DEMO — dữ liệu giả lập, không phải văn bằng có giá trị pháp lý.';

interface TextStyle { size: number; color?: RGB; maxWidth: number; lineGap?: number }

/** Split text into lines no wider than maxWidth, breaking on spaces and inside words that are too long. */
export function wrapText(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  const fits = (candidate: string) => font.widthOfTextAtSize(candidate, size) <= maxWidth;
  for (const word of value.trim().split(/\s+/)) {
    const joined = line ? `${line} ${word}` : word;
    if (fits(joined)) { line = joined; continue; }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (line && !fits(line + char)) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrink text to one line when possible; otherwise wrap at the minimum size. */
export function fitSize(font: PDFFont, value: string, size: number, minSize: number, maxWidth: number) {
  let current = size;
  while (current > minSize && font.widthOfTextAtSize(value, current) > maxWidth) current -= 1;
  return current;
}

export function displayDate(isoDate?: string) {
  const [year, month, day] = (isoDate ?? new Date().toISOString().slice(0, 10)).split('-');
  return `${day}/${month}/${year}`;
}

export class TemplatePdfAdapter implements PdfAdapter {
  private readonly fontBytes = readFile(new URL('../../assets/NotoSans-Regular.ttf', import.meta.url));

  private async font(doc: PDFDocument) {
    doc.registerFontkit(fontkit);
    return doc.embedFont(await this.fontBytes, { subset: true });
  }

  /** Draw wrapped lines centred on centerX from baseline y downwards; returns the baseline below the block. */
  private centered(page: PDFPage, font: PDFFont, value: string, centerX: number, y: number, style: TextStyle) {
    const step = style.size * (style.lineGap ?? 1.3);
    let baseline = y;
    for (const line of wrapText(font, value, style.size, style.maxWidth)) {
      const width = font.widthOfTextAtSize(line, style.size);
      page.drawText(line, { x: centerX - width / 2, y: baseline, size: style.size, font, color: style.color ?? ink });
      baseline -= step;
    }
    return baseline;
  }

  private left(page: PDFPage, font: PDFFont, value: string, x: number, y: number, style: TextStyle) {
    const step = style.size * (style.lineGap ?? 1.4);
    let baseline = y;
    for (const line of wrapText(font, value, style.size, style.maxWidth)) {
      page.drawText(line, { x, y: baseline, size: style.size, font, color: style.color ?? ink });
      baseline -= step;
    }
    return baseline;
  }

  private async qrImage(doc: PDFDocument, verifyUrl: string) {
    return doc.embedPng(await QRCode.toBuffer(verifyUrl, { type: 'png', width: 480, margin: 2, errorCorrectionLevel: 'M' }));
  }

  private setMetadata(doc: PDFDocument, title: string) {
    doc.setTitle(title);
    doc.setAuthor('EduCert demo');
    doc.setSubject('EduCert demo certificate. Verify the whole file with SHA-256 at the QR link.');
    doc.setCreator('EduCert backend (pdf-template)');
    doc.setProducer('EduCert · pdf-lib');
  }

  async generate(id: string, verifyUrl: string, fields: PdfFields): Promise<Buffer> {
    try {
      const doc = await PDFDocument.create();
      const font = await this.font(doc);
      this.setMetadata(doc, 'EduCert — Chứng chỉ học tập demo');
      const page = doc.addPage(A4_LANDSCAPE);
      const [width, height] = A4_LANDSCAPE;
      const center = width / 2;

      page.drawRectangle({ x: 0, y: 0, width, height, color: paper });
      page.drawRectangle({ x: 22, y: 22, width: width - 44, height: height - 44, borderColor: teal, borderWidth: 3 });
      page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: gold, borderWidth: 0.8 });

      this.centered(page, font, 'E D U C E R T', center, height - 78, { size: 11, color: teal, maxWidth: 300 });
      this.centered(page, font, fields.issuerName, center, height - 104, { size: fitSize(font, fields.issuerName, 16, 11, 560), color: muted, maxWidth: 560 });
      this.centered(page, font, 'CHỨNG CHỈ HOÀN THÀNH KHÓA HỌC', center, height - 152, { size: 28, color: teal, maxWidth: 680 });
      page.drawLine({ start: { x: center - 70, y: height - 168 }, end: { x: center + 70, y: height - 168 }, thickness: 1.2, color: gold });

      this.centered(page, font, 'Chứng nhận', center, height - 205, { size: 13, color: muted, maxWidth: 600 });
      const nameSize = fitSize(font, fields.studentName, 32, 18, 620);
      let y = this.centered(page, font, fields.studentName, center, height - 248, { size: nameSize, maxWidth: 620, lineGap: 1.15 });
      y = this.centered(page, font, 'đã hoàn thành khóa học', center, y - 6, { size: 13, color: muted, maxWidth: 600 });
      const courseSize = fitSize(font, fields.courseName, 22, 14, 600);
      this.centered(page, font, fields.courseName, center, y - 10, { size: courseSize, color: teal, maxWidth: 600, lineGap: 1.2 });

      // Footer band: issue date and issuer on the left, QR and identifiers on the right.
      const footerTop = 186;
      page.drawLine({ start: { x: 70, y: footerTop }, end: { x: width - 70, y: footerTop }, thickness: 0.5, color: gold });
      this.left(page, font, `Ngày cấp: ${displayDate(fields.issuedDate)}`, 72, footerTop - 32, { size: 12, maxWidth: 300 });
      page.drawLine({ start: { x: 72, y: 96 }, end: { x: 292, y: 96 }, thickness: 0.7, color: muted });
      this.left(page, font, 'Đại diện đơn vị cấp', 72, 80, { size: 10, color: muted, maxWidth: 260 });
      this.left(page, font, fields.issuerName, 72, 64, { size: 10, maxWidth: 260 });

      const qrSize = 118;
      const qrX = width - 70 - qrSize;
      page.drawImage(await this.qrImage(doc, verifyUrl), { x: qrX, y: 52, width: qrSize, height: qrSize });
      const infoX = qrX - 250;
      this.left(page, font, 'Quét QR để tra cứu bản ghi blockchain.', infoX, footerTop - 32, { size: 9.5, color: teal, maxWidth: 236 });
      this.left(page, font, 'Mã chứng chỉ', infoX, footerTop - 56, { size: 8.5, color: muted, maxWidth: 236 });
      const afterId = this.left(page, font, id, infoX, footerTop - 70, { size: 7.5, maxWidth: 236, lineGap: 1.3 });
      this.left(page, font, verifyUrl, infoX, afterId - 6, { size: 6.5, color: muted, maxWidth: 236, lineGap: 1.3 });

      this.centered(page, font, DEMO_NOTICE, center, 38, { size: 8, color: muted, maxWidth: 700 });

      const bytes = Buffer.from(await doc.save());
      checkPdfInput(bytes);
      return bytes;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, 'PDF_RENDER_ERROR', 'Unable to render PDF with the supplied text');
    }
  }

  async stamp(source: Buffer, id: string, verifyUrl: string): Promise<Buffer> {
    checkPdfInput(source);
    let doc: PDFDocument;
    try { doc = await PDFDocument.load(source); }
    catch { throw new ApiError(400, 'INVALID_PDF', 'PDF must be readable and must not be encrypted'); }
    const sourcePages = doc.getPageCount();
    invariant(sourcePages > 0, 400, 'INVALID_PDF', 'PDF must contain at least one page');
    const signatureMarker = /\/ByteRange\b|\/Type\s*\/Sig\b|\/FT\s*\/Sig\b/.test(source.toString('latin1'));
    const signatureObject = doc.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFDict && (
      object.has(PDFName.of('ByteRange')) || object.get(PDFName.of('Type'))?.toString() === '/Sig' || object.get(PDFName.of('FT'))?.toString() === '/Sig'
    ));
    invariant(!signatureMarker && !signatureObject, 400, 'SIGNED_PDF_UNSUPPORTED', 'PDF with an existing digital signature is not supported in v1');

    // BE-D05: append a verification page instead of drawing over the source content.
    const font = await this.font(doc);
    const page = doc.addPage(A4_PORTRAIT);
    const [width, height] = A4_PORTRAIT;
    const center = width / 2;
    page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: teal, borderWidth: 2 });
    this.centered(page, font, 'E D U C E R T', center, height - 80, { size: 11, color: teal, maxWidth: 300 });
    this.centered(page, font, 'TRANG THÔNG TIN XÁC MINH', center, height - 118, { size: 22, color: teal, maxWidth: 480 });
    page.drawLine({ start: { x: center - 60, y: height - 134 }, end: { x: center + 60, y: height - 134 }, thickness: 1, color: gold });
    let y = this.centered(page, font, `Trang này được thêm sau ${sourcePages} trang của tài liệu nguồn. Nội dung các trang nguồn không bị chỉnh sửa.`, center, height - 172, { size: 11, color: muted, maxWidth: 440 });
    y = this.centered(page, font, 'Mã băm SHA-256 được tính trên toàn bộ tệp này, bao gồm trang xác minh.', center, y - 4, { size: 11, color: muted, maxWidth: 440 });

    const qrSize = 210;
    page.drawImage(await this.qrImage(doc, verifyUrl), { x: center - qrSize / 2, y: y - 24 - qrSize, width: qrSize, height: qrSize });
    y -= 24 + qrSize + 30;
    y = this.centered(page, font, 'Quét QR hoặc mở liên kết để tra cứu bản ghi blockchain, sau đó chọn tệp PDF này để kiểm tra toàn vẹn.', center, y, { size: 11, color: teal, maxWidth: 440 });
    y = this.centered(page, font, 'Mã chứng chỉ', center, y - 10, { size: 9, color: muted, maxWidth: 440 });
    y = this.centered(page, font, id, center, y, { size: 9, maxWidth: 440 });
    this.centered(page, font, verifyUrl, center, y - 6, { size: 7.5, color: muted, maxWidth: 440 });
    this.centered(page, font, DEMO_NOTICE, center, 48, { size: 8, color: muted, maxWidth: 480 });

    const bytes = Buffer.from(await doc.save());
    checkPdfInput(bytes);
    return bytes;
  }
}
