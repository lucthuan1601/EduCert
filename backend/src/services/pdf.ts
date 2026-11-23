import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFName, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { ApiError, invariant } from '../errors.js';
import { checkPdfInput } from './storage.js';

export interface PdfFields { studentName: string; courseName: string; issuerName: string; issuedDate?: string }
export interface PdfAdapter {
  generate(id: string, verifyUrl: string, fields: PdfFields): Promise<Buffer>;
  stamp(source: Buffer, id: string, verifyUrl: string): Promise<Buffer>;
}

export class DefaultPdfAdapter implements PdfAdapter {
  private readonly fontBytes = readFile(new URL('../../assets/NotoSans-Regular.ttf', import.meta.url));
  private async font(doc: PDFDocument) {
    doc.registerFontkit(fontkit);
    return doc.embedFont(await this.fontBytes, { subset: true });
  }
  private text(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size = 12, width = 480) {
    let line = '';
    let position = y;
    // Wrap by Unicode code point, including words wider than the page.
    for (const char of value) {
      if (font.widthOfTextAtSize(line + char, size) > width && line) {
        page.drawText(line, { x, y: position, size, font, color: rgb(0.12, 0.18, 0.25) });
        line = '';
        position -= size * 1.5;
      }
      line += char;
    }
    if (line) page.drawText(line, { x, y: position, size, font, color: rgb(0.12, 0.18, 0.25) });
    return position - size * 1.5;
  }
  private async qr(doc: PDFDocument, page: PDFPage, font: PDFFont, id: string, verifyUrl: string) {
    const qr = await doc.embedPng(await QRCode.toBuffer(verifyUrl, { type: 'png', width: 400, margin: 2, errorCorrectionLevel: 'M' }));
    page.drawImage(qr, { x: 54, y: 85, width: 150, height: 150 });
    this.text(page, font, 'Mã chứng chỉ:', 224, 220, 11, 315);
    this.text(page, font, id, 224, 198, 9, 315);
    this.text(page, font, 'Quét QR để tra cứu. Chọn PDF để kiểm tra toàn vẹn.', 224, 148, 11, 315);
    this.text(page, font, verifyUrl, 224, 110, 8, 315);
    this.text(page, font, 'DỮ LIỆU DEMO — không phải văn bằng có giá trị pháp lý.', 54, 48, 9);
  }
  async generate(id: string, verifyUrl: string, fields: PdfFields): Promise<Buffer> {
    try {
      const doc = await PDFDocument.create();
      const font = await this.font(doc);
      const page = doc.addPage([595.28, 841.89]);
      doc.setTitle('EduCert — Chứng chỉ học tập demo');
      this.text(page, font, 'EDUCERT', 54, 770, 24);
      this.text(page, font, 'CHỨNG CHỈ HỌC TẬP — BẢN DEMO', 54, 720, 20);
      let y = this.text(page, font, fields.issuerName, 54, 665, 16);
      y = this.text(page, font, `Người nhận: ${fields.studentName}`, 54, y - 35, 15);
      y = this.text(page, font, `Khóa học: ${fields.courseName}`, 54, y - 35, 15);
      this.text(page, font, `Ngày cấp trên tài liệu: ${fields.issuedDate ?? new Date().toISOString().slice(0, 10)} (UTC)`, 54, y - 35, 12);
      await this.qr(doc, page, font, id, verifyUrl);
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
    invariant(doc.getPageCount() > 0, 400, 'INVALID_PDF', 'PDF must contain at least one page');
    const signatureMarker = /\/ByteRange\b|\/Type\s*\/Sig\b|\/FT\s*\/Sig\b/.test(source.toString('latin1'));
    const signatureObject = doc.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFDict && (
      object.has(PDFName.of('ByteRange')) || object.get(PDFName.of('Type'))?.toString() === '/Sig' || object.get(PDFName.of('FT'))?.toString() === '/Sig'
    ));
    invariant(!signatureMarker && !signatureObject, 400, 'SIGNED_PDF_UNSUPPORTED', 'PDF with an existing digital signature is not supported in v1');
    const font = await this.font(doc);
    const page = doc.addPage([595.28, 841.89]);
    this.text(page, font, 'EDUCERT — THÔNG TIN XÁC MINH DEMO', 54, 750, 20);
    this.text(page, font, 'Trang QR được thêm vào bản PDF mới trước khi tính SHA-256.', 54, 690, 12);
    this.text(page, font, 'Bản nguồn được giữ nguyên trong quá trình xử lý. Hãy sử dụng toàn bộ tệp này để đối chiếu hash.', 54, 650, 12);
    await this.qr(doc, page, font, id, verifyUrl);
    const bytes = Buffer.from(await doc.save());
    checkPdfInput(bytes);
    return bytes;
  }
}
