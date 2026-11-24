import { inflateSync } from 'node:zlib';
import jsQR from 'jsqr';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

// Test-only helpers shared by backend PDF tests and the Playwright E2E suite.
// They read the PDF exactly as stored, without rendering, so a decoded QR or
// extracted string proves what is inside the hashed bytes.

/** Decode every QR code found in RGB image XObjects of a PDF. */
export async function decodePdfQrCodes(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const codes: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    if (dict.get(PDFName.of('Subtype'))?.toString() !== '/Image' || dict.get(PDFName.of('ColorSpace'))?.toString() !== '/DeviceRGB') continue;
    const width = (dict.get(PDFName.of('Width')) as PDFNumber).asNumber();
    const height = (dict.get(PDFName.of('Height')) as PDFNumber).asNumber();
    if ((dict.get(PDFName.of('BitsPerComponent')) as PDFNumber | undefined)?.asNumber() !== 8) continue;
    const filter = dict.get(PDFName.of('Filter'))?.toString();
    if (filter && filter !== '/FlateDecode') continue;
    const rgbBytes = filter ? inflateSync(object.contents) : Buffer.from(object.contents);
    if (rgbBytes.length < width * height * 3) continue;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) {
      rgba[pixel * 4] = rgbBytes[pixel * 3];
      rgba[pixel * 4 + 1] = rgbBytes[pixel * 3 + 1];
      rgba[pixel * 4 + 2] = rgbBytes[pixel * 3 + 2];
      rgba[pixel * 4 + 3] = 255;
    }
    const code = jsQR(rgba, width, height);
    if (code) codes.push(code.data);
  }
  return codes;
}

export interface PdfTextItem { text: string; x: number; y: number; width: number; height: number }
export interface PdfTextPage { width: number; height: number; text: string; items: PdfTextItem[] }

/** Extract the Unicode text of each page using pdf.js (validates ToUnicode maps for Vietnamese). */
export async function readPdfText(bytes: Uint8Array): Promise<PdfTextPage[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  const pdf = await task.promise;
  try {
    const pages: PdfTextPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.flatMap(item => 'str' in item && item.str ? [{
        text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height,
      }] : []);
      pages.push({ width: viewport.width, height: viewport.height, items, text: items.map(item => item.text).join('\n').normalize('NFC') });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
