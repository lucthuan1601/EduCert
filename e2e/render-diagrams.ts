import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { root } from './stack.js';

// QA-04: render the Mermaid blocks of docs/DIAGRAMS.md to SVG and PNG for the report.
// Each block is named after the "## Hình N." heading above it.
const source = readFileSync(join(root, 'docs/DIAGRAMS.md'), 'utf8').replace(/\r\n/g, '\n');
const outDir = join(root, 'docs/diagrams');
mkdirSync(outDir, { recursive: true });
const blocks = [...source.matchAll(/^## Hình (\d+)[^\n]*\n[\s\S]*?```mermaid\n([\s\S]*?)```/gm)].map(match => ({ name: `hinh-${match[1]}`, code: match[2] }));
const mermaidPath = createRequire(import.meta.url).resolve('mermaid/dist/mermaid.min.js');

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
try {
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 1000 } });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:"Segoe UI",Arial,sans-serif}#out{display:inline-block;padding:16px}</style></head><body><div id="out"></div></body></html>');
  await page.addScriptTag({ path: mermaidPath });
  await page.evaluate(() => (window as any).mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'Segoe UI, Arial, sans-serif', flowchart: { htmlLabels: true } }));
  for (const block of blocks) {
    const svg = await page.evaluate(async ({ name, code }) => {
      const { svg } = await (window as any).mermaid.render(name, code);
      document.getElementById('out')!.innerHTML = svg;
      return svg as string;
    }, block);
    writeFileSync(join(outDir, `${block.name}.svg`), svg);
    await page.locator('#out').screenshot({ path: join(outDir, `${block.name}.png`) });
    console.log(`rendered ${block.name}`);
  }
} finally {
  await browser.close();
}
