import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PDFDocument, rgb, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import type { ChainCertificate } from './chain.js';
import { wrapText } from './pdf-template.js';

// QA-02 / EXT-04: technical verification report rendered from one on-chain read.
export const REPORT_DISCLAIMER = 'Đây là báo cáo kỹ thuật tại thời điểm xác minh, không thay thế xác nhận pháp lý của cơ sở giáo dục.';
export const revokeReasonLabels: Record<number, string> = { 1: 'Sai thông tin chứng chỉ', 2: 'Gian lận', 3: 'Sai thẩm quyền', 4: 'Lý do khác' };

export type RecordStatus = 'REGISTERED_ACTIVE' | 'REVOKED';
export type FileResult = 'NOT_CHECKED' | 'MATCH' | 'FILE_HASH_MISMATCH';

export interface ReportInput {
  certificateId: string; chainId: number; contractAddress: string; verifyUrl: string;
  certificate: ChainCertificate & { blockNumber: number }; candidateHash?: string; checkedAt: Date;
}

export interface ReportSummary {
  certificateId: string; chainId: number; contractAddress: string; blockNumber: number; checkedAt: string;
  issuer: string; student: string; fileHash: string; issuedAt: string | null;
  status: RecordStatus; revokedAt: string | null; revokeReasonCode: number;
  fileResult: FileResult; candidateHash: string | null; verifyCode: number;
}

/** Mirror CertificateRegistry.verifyCertificate codes: 1 VALID, 2 REVOKED, 3 FILE_HASH_MISMATCH (0 is handled as 404 before rendering). */
export function summarize(input: ReportInput): ReportSummary {
  const { certificate } = input;
  const status: RecordStatus = certificate.revoked ? 'REVOKED' : 'REGISTERED_ACTIVE';
  const fileResult: FileResult = !input.candidateHash ? 'NOT_CHECKED' : input.candidateHash === certificate.fileHash ? 'MATCH' : 'FILE_HASH_MISMATCH';
  const verifyCode = certificate.revoked ? 2 : fileResult === 'FILE_HASH_MISMATCH' ? 3 : 1;
  return {
    certificateId: input.certificateId, chainId: input.chainId, contractAddress: input.contractAddress, blockNumber: certificate.blockNumber,
    checkedAt: input.checkedAt.toISOString(), issuer: certificate.issuer, student: certificate.student, fileHash: certificate.fileHash,
    issuedAt: certificate.issuedAt, status, revokedAt: certificate.revokedAt, revokeReasonCode: certificate.revokeReasonCode,
    fileResult, candidateHash: input.candidateHash ?? null, verifyCode,
  };
}

const vietnamTime = (iso: string | null) => iso ? new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date(iso)) + ' (UTC+7)' : '—';

function conclusion(summary: ReportSummary): { tone: 'ok' | 'warn' | 'error'; lines: string[] } {
  const lines: string[] = [];
  if (summary.status === 'REVOKED') lines.push(`Bản ghi đã bị THU HỒI (${revokeReasonLabels[summary.revokeReasonCode] ?? `mã ${summary.revokeReasonCode}`}).`);
  else lines.push('Bản ghi đã đăng ký và đang hiệu lực trên hợp đồng.');
  if (summary.fileResult === 'MATCH') lines.push('SHA-256 của tệp PDF được đối chiếu TRÙNG KHỚP với mã băm tham chiếu.');
  else if (summary.fileResult === 'FILE_HASH_MISMATCH') lines.push('SHA-256 của tệp PDF được đối chiếu KHÔNG KHỚP (FILE_HASH_MISMATCH).');
  else lines.push('Chưa đối chiếu tệp PDF: biên bản chỉ xác nhận trạng thái bản ghi, không kết luận về một tệp cụ thể.');
  const tone = summary.status === 'REVOKED' || summary.fileResult === 'FILE_HASH_MISMATCH' ? 'error' : summary.fileResult === 'MATCH' ? 'ok' : 'warn';
  return { tone, lines };
}

const colors = { ink: rgb(0.11, 0.16, 0.23), muted: rgb(0.36, 0.42, 0.49), teal: rgb(0.05, 0.37, 0.4), line: rgb(0.85, 0.87, 0.89) };
const tones: Record<'ok' | 'warn' | 'error', { fill: RGB; border: RGB }> = {
  ok: { fill: rgb(0.9, 0.97, 0.93), border: rgb(0.13, 0.55, 0.33) },
  warn: { fill: rgb(0.99, 0.96, 0.88), border: rgb(0.75, 0.55, 0.1) },
  error: { fill: rgb(0.99, 0.91, 0.9), border: rgb(0.75, 0.2, 0.18) },
};

export class VerificationReportRenderer {
  private readonly fontBytes = readFile(new URL('../../assets/NotoSans-Regular.ttf', import.meta.url));

  async render(input: ReportInput): Promise<{ bytes: Buffer; summary: ReportSummary; fingerprint: string }> {
    const summary = summarize(input);
    // The fingerprint lets a reader check that the printed fields match the embedded JSON metadata.
    const canonical = JSON.stringify(summary);
    const fingerprint = `0x${createHash('sha256').update(canonical).digest('hex')}`;
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(await this.fontBytes, { subset: true });
    doc.setTitle('EduCert — Biên bản xác minh chứng chỉ');
    doc.setAuthor('EduCert');
    doc.setSubject(canonical);
    doc.setKeywords(['educert', 'verification-report', summary.status, summary.fileResult]);
    doc.setCreator('EduCert backend (verification-report)');
    doc.setProducer('EduCert · pdf-lib');
    doc.setCreationDate(input.checkedAt);
    doc.setModificationDate(input.checkedAt);

    const page = doc.addPage([595.28, 841.89]);
    const left = 56;
    const width = 595.28 - left * 2;
    let y = 780;
    const draw = (value: string, x: number, size: number, color: RGB = colors.ink, maxWidth = width) => {
      for (const line of wrapText(font, value, size, maxWidth)) {
        page.drawText(line, { x, y, size, font, color });
        y -= size * 1.45;
      }
    };

    draw('E D U C E R T', left, 10, colors.teal);
    y -= 16;
    draw('BIÊN BẢN XÁC MINH CHỨNG CHỈ', left, 22, colors.teal);
    draw(`Thời điểm đọc blockchain: ${summary.checkedAt} (UTC) · ${vietnamTime(summary.checkedAt)}`, left, 9.5, colors.muted);
    y -= 8;

    const box = conclusion(summary);
    const boxLines = box.lines.flatMap(line => wrapText(font, line, 11, width - 28));
    const boxHeight = boxLines.length * 16 + 34;
    page.drawRectangle({ x: left, y: y - boxHeight + 12, width, height: boxHeight, color: tones[box.tone].fill, borderColor: tones[box.tone].border, borderWidth: 1 });
    y -= 8;
    draw('KẾT QUẢ', left + 14, 9, tones[box.tone].border);
    for (const line of boxLines) { page.drawText(line, { x: left + 14, y, size: 11, font, color: colors.ink }); y -= 16; }
    y -= 22;

    const rows: Array<[string, string]> = [
      ['Mã chứng chỉ', summary.certificateId],
      ['Chain ID', String(summary.chainId)],
      ['Địa chỉ hợp đồng', summary.contractAddress],
      ['Khối đọc dữ liệu', `#${summary.blockNumber}`],
      ['Ví phát hành (issuer)', summary.issuer],
      ['Ví người nhận', summary.student],
      ['Thời gian cấp on-chain', `${summary.issuedAt ?? '—'} (UTC)`],
      ['Trạng thái bản ghi', summary.status === 'REVOKED' ? `REVOKED — ${revokeReasonLabels[summary.revokeReasonCode] ?? summary.revokeReasonCode} — ${summary.revokedAt ?? '—'} (UTC)` : 'REGISTERED_ACTIVE'],
      ['SHA-256 tham chiếu', summary.fileHash],
      ['SHA-256 tệp đối chiếu', summary.candidateHash ?? 'Không cung cấp'],
      ['Kết quả đối chiếu tệp', summary.fileResult],
      ['Mã verifyCertificate', `${summary.verifyCode} (${['NOT_FOUND', 'VALID', 'REVOKED', 'FILE_HASH_MISMATCH'][summary.verifyCode]})`],
    ];
    const labelWidth = 150;
    for (const [label, value] of rows) {
      const top = y;
      page.drawText(label, { x: left, y, size: 9.5, font, color: colors.muted });
      const lines = wrapText(font, value, 9.5, width - labelWidth);
      for (const line of lines) { page.drawText(line, { x: left + labelWidth, y, size: 9.5, font, color: colors.ink }); y -= 14; }
      y = Math.min(y, top - 14) - 6;
      this.rule(page, left, y + 12, width);
    }

    y -= 14;
    const qrSize = 104;
    const qr = await doc.embedPng(await QRCode.toBuffer(input.verifyUrl, { type: 'png', width: 360, margin: 2, errorCorrectionLevel: 'M' }));
    page.drawImage(qr, { x: left, y: y - qrSize + 10, width: qrSize, height: qrSize });
    const textX = left + qrSize + 16;
    const textWidth = width - qrSize - 16;
    let textY = y;
    for (const [value, size, color] of [
      ['Tra cứu lại bản ghi tại liên kết:', 9.5, colors.muted], [input.verifyUrl, 8.5, colors.teal],
      ['Dấu vân tay biên bản (SHA-256 của dữ liệu JSON trong metadata Subject):', 9.5, colors.muted], [fingerprint, 8.5, colors.ink],
    ] as Array<[string, number, RGB]>) {
      for (const line of wrapText(font, value, size, textWidth)) { page.drawText(line, { x: textX, y: textY, size, font, color }); textY -= size * 1.45; }
      textY -= 4;
    }
    y = Math.min(y - qrSize, textY) - 18;

    for (const note of [
      REPORT_DISCLAIMER,
      'Biên bản chỉ phản ánh dữ liệu đọc từ hợp đồng trên mạng và khối nêu trên. Hash của tệp do người xác minh cung cấp từ trình duyệt; máy chủ không nhận nội dung PDF.',
      'Kết quả không chứng minh năng lực học tập thực tế của người nhận và không thay thế việc liên hệ đơn vị cấp.',
    ]) { draw(note, left, 8.5, colors.muted); y -= 2; }

    return { bytes: Buffer.from(await doc.save()), summary, fingerprint };
  }

  private rule(page: PDFPage, x: number, y: number, width: number) {
    page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.5, color: colors.line });
  }
}

