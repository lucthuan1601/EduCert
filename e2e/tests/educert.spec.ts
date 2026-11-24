import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { Contract, JsonRpcProvider } from 'ethers';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { decodePdfQrCodes, readPdfText } from '../../backend/test/helpers/pdf-inspect.js';
import { evidenceDir, readState, tempDir, urls, type StackState } from '../stack.js';
import { installWallet, wallet } from '../wallet.js';
import { demo, tamper } from '../demo.js';

// E2E-01 → E2E-12 (Bảng 25, Phụ lục A). The tests share one chain and run in order:
// grant role → issue → download → verify → tamper → report → revoke → dashboard.
test.describe.configure({ mode: 'serial' });

const sha256 = (bytes: Uint8Array) => '0x' + createHash('sha256').update(bytes).digest('hex');
const evidence = (name: string) => join(evidenceDir, name);
const shot = (page: Page, name: string) => page.screenshot({ path: join(evidenceDir, 'screenshots', `${name}.png`), fullPage: true });

let stack: StackState;
let provider: JsonRpcProvider;
let registry: Contract;
const run: { certificateId?: string; fileHash?: string; uploadCertificateId?: string; reports: Record<string, unknown>; startedAt: string } = { reports: {}, startedAt: new Date().toISOString() };

async function asRole(browser: Browser, account: string | null, options: { chainId?: number } = {}) {
  const context = await browser.newContext();
  if (account) await installWallet(context, { account, chainId: options.chainId });
  const page = await context.newPage();
  return { context, page };
}

async function signIn(page: Page, path: string) {
  await page.goto(path);
  const gate = page.locator('section.gate');
  await gate.getByRole('button', { name: 'Kết nối ví' }).click();
  await gate.getByRole('button', { name: 'Ký đăng nhập' }).click();
  await expect(gate).toHaveCount(0);
}

async function chainRecord(id: string) {
  const data = await registry.getFunction('getCertificate')(id);
  return { exists: data.exists as boolean, revoked: data.revoked as boolean, fileHash: (data.fileHash as string).toLowerCase() };
}

async function download(page: Page, button: ReturnType<Page['getByRole']>, name: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const path = evidence(name);
  await file.saveAs(path);
  return readFileSync(path);
}

async function reportSummary(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const [page] = await readPdfText(bytes);
  return { summary: JSON.parse(doc.getSubject() ?? '{}'), text: page.text.replace(/\s+/g, ' '), compact: page.text.replace(/\s+/g, '') };
}

test.beforeAll(() => {
  stack = readState();
  provider = new JsonRpcProvider(urls.rpc, 31337, { staticNetwork: true, cacheTimeout: -1 });
  const abi = JSON.parse(readFileSync(join(tempDir, 'contract-config.json'), 'utf8')).abi;
  registry = new Contract(stack.contractAddress, abi, provider);
});

test.afterAll(async () => {
  const events = await (await fetch(`${urls.backend}/api/v1/events?limit=100`)).json();
  writeFileSync(evidence('run-summary.json'), JSON.stringify({
    ...run, finishedAt: new Date().toISOString(), chainId: stack.chainId, contractAddress: stack.contractAddress,
    wallets: stack.wallets, events: events.data?.items ?? [],
  }, null, 2) + '\n');
  provider?.destroy();
});

test('E2E-01: Admin → Issuer → Student → Verifier completes the whole flow with the right roles', async ({ browser }) => {
  // Admin grants ISSUER_ROLE to a fresh wallet through /admin.
  const admin = await asRole(browser, stack.wallets.admin);
  await signIn(admin.page, '/admin');
  await admin.page.getByLabel('Địa chỉ ví').fill(stack.wallets.newIssuer);
  await admin.page.getByRole('button', { name: 'Cấp quyền' }).click();
  await expect(admin.page.getByText('Đã cấp quyền phát hành.')).toBeVisible();
  await expect(admin.page.getByText('Có quyền phát hành', { exact: true })).toBeVisible();
  await shot(admin.page, '01-admin-grant-issuer');
  await admin.context.close();

  // The new issuer creates a template draft, checks the hash and signs issueCertificate.
  const issuer = await asRole(browser, stack.wallets.newIssuer);
  await signIn(issuer.page, '/issue');
  const form = issuer.page;
  await form.getByLabel('Tên sinh viên').fill(demo.studentName);
  await form.getByLabel('Ví sinh viên').fill(stack.wallets.student);
  await form.getByLabel('Khóa học').fill(demo.courseName);
  await form.getByLabel('Đơn vị cấp').fill(demo.issuerName);
  await form.getByLabel('Ngày cấp trên PDF').fill(demo.issuedDate);
  await form.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(form.getByText('SHA-256 khớp với bản nháp.')).toBeVisible();
  await shot(form, '02-issuer-draft-preview');
  await form.getByRole('button', { name: 'Ký phát hành' }).click();
  await expect(form.getByText('Backend đã đối soát giao dịch phát hành.')).toBeVisible();
  await expect(form.getByText('Đã phát hành', { exact: true })).toBeVisible();
  const href = await form.getByRole('link', { name: 'Mở trang xác minh' }).getAttribute('href');
  run.certificateId = href!.split('/').pop()!;
  const record = await chainRecord(run.certificateId);
  expect(record).toMatchObject({ exists: true, revoked: false });
  run.fileHash = record.fileHash;
  await shot(form, '03-issuer-issued');
  await issuer.context.close();

  // The student signs in and downloads exactly the registered PDF.
  const student = await asRole(browser, stack.wallets.student);
  await signIn(student.page, '/student');
  await expect(student.page.getByText(demo.courseName)).toBeVisible();
  const pdf = await download(student.page, student.page.getByRole('button', { name: 'Tải PDF' }), 'certificate-valid.pdf');
  expect(sha256(pdf)).toBe(run.fileHash);
  await shot(student.page, '04-student-list');
  await student.context.close();

  // A verifier without any wallet checks the record and the file.
  const verifier = await asRole(browser, null);
  await verifier.page.goto(`/verify/${run.certificateId}`);
  await expect(verifier.page.getByText('Bản ghi đã đăng ký và đang hiệu lực.')).toBeVisible();
  await verifier.page.getByLabel('PDF cần đối chiếu').setInputFiles(evidence('certificate-valid.pdf'));
  await expect(verifier.page.getByText('Mã băm trùng khớp.')).toBeVisible();
  await verifier.context.close();
});

test('E2E-02: public lookup works without a wallet and reads the on-chain record', async ({ browser }) => {
  const { context, page } = await asRole(browser, null);
  await page.goto('/verify');
  expect(await page.evaluate(() => 'ethereum' in window)).toBe(false);
  await page.getByPlaceholder('0x… hoặc liên kết /verify/…').fill(run.certificateId!);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page).toHaveURL(new RegExp(`/verify/${run.certificateId}$`));
  await expect(page.locator('[data-status="REGISTERED_ACTIVE"]')).toBeVisible();
  await expect(page.locator(`code[title="${stack.wallets.newIssuer}"]`)).toBeVisible();
  await shot(page, '05-verifier-lookup-no-wallet');
  await context.close();
});

test('E2E-03: the QR inside the issued PDF opens /verify/{certificateId}', async ({ browser }) => {
  const codes = await decodePdfQrCodes(readFileSync(evidence('certificate-valid.pdf')));
  expect(codes).toEqual([`${urls.app}/verify/${run.certificateId}`]);
  const { context, page } = await asRole(browser, null);
  await page.goto(codes[0]);
  await expect(page.locator('[data-status="REGISTERED_ACTIVE"]')).toBeVisible();
  await context.close();
});

test('E2E-04: the original PDF matches the registered hash and is not revoked', async ({ browser }) => {
  const { context, page } = await asRole(browser, null);
  await page.goto(`/verify/${run.certificateId}`);
  await page.getByLabel('PDF cần đối chiếu').setInputFiles(evidence('certificate-valid.pdf'));
  await expect(page.getByText('Mã băm trùng khớp.')).toBeVisible();
  await expect(page.getByText('Bản ghi đã đăng ký và đang hiệu lực.')).toBeVisible();
  await expect(page.getByText(run.fileHash!.slice(0, 9)).first()).toBeVisible();
  await shot(page, '06-verifier-valid-pdf');
  await context.close();
});

test('E2E-05: an edited PDF is reported as FILE_HASH_MISMATCH', async ({ browser }) => {
  const tampered = await tamper(readFileSync(evidence('certificate-valid.pdf')));
  writeFileSync(evidence('certificate-tampered.pdf'), tampered);
  expect(sha256(tampered)).not.toBe(run.fileHash);
  expect(await registry.getFunction('verifyCertificate')(run.certificateId, sha256(tampered))).toBe(3n);
  const { context, page } = await asRole(browser, null);
  await page.goto(`/verify/${run.certificateId}`);
  await page.getByLabel('PDF cần đối chiếu').setInputFiles(evidence('certificate-tampered.pdf'));
  await expect(page.getByText('Mã băm PDF không khớp.')).toBeVisible();
  await expect(page.getByText('Mã băm trùng khớp.')).toHaveCount(0);
  await shot(page, '07-verifier-tampered-pdf');
  await context.close();
});

test('E2E-07: looking up only the ID never claims that a PDF was verified', async ({ browser }) => {
  const { context, page } = await asRole(browser, null);
  await page.goto(`/verify/${run.certificateId}`);
  await expect(page.getByText('Chưa đối chiếu tệp PDF.')).toBeVisible();
  await expect(page.getByText(/PDF đã xác minh|Mã băm trùng khớp/)).toHaveCount(0);
  const { summary, text } = await reportSummary(await download(page, page.getByRole('button', { name: 'Tải biên bản PDF' }), 'verification-report-id-only.pdf'));
  expect(summary.fileResult).toBe('NOT_CHECKED');
  expect(text).toContain('Chưa đối chiếu tệp PDF');
  await context.close();
});

test('E2E-08: the exported report has time, chainId, ID and status', async ({ browser }) => {
  const { context, page } = await asRole(browser, null);
  await page.goto(`/verify/${run.certificateId}`);
  await page.getByLabel('PDF cần đối chiếu').setInputFiles(evidence('certificate-valid.pdf'));
  await expect(page.getByText('Mã băm trùng khớp.')).toBeVisible();
  const before = Date.now();
  const { summary, text, compact } = await reportSummary(await download(page, page.getByRole('button', { name: 'Tải biên bản PDF' }), 'verification-report-valid.pdf'));
  expect(summary).toMatchObject({ certificateId: run.certificateId, chainId: 31337, contractAddress: stack.contractAddress, status: 'REGISTERED_ACTIVE', fileResult: 'MATCH', verifyCode: 1, fileHash: run.fileHash, issuer: stack.wallets.newIssuer });
  expect(Math.abs(Date.parse(summary.checkedAt) - before)).toBeLessThan(60_000);
  for (const value of [run.certificateId!, stack.contractAddress, summary.checkedAt]) expect(compact).toContain(value);
  expect(text).toContain('Chain ID 31337');
  expect(text).toContain('REGISTERED_ACTIVE');
  expect(text).toContain('không thay thế xác nhận pháp lý của cơ sở giáo dục');
  run.reports.valid = summary;
  await shot(page, '08-verifier-report-button');
  await context.close();
});

test('E2E-01b: upload mode issues a second certificate after a rejected signature', async ({ browser }) => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage([595, 842]).drawText('Demo University - transcript (synthetic, no personal data)', { x: 60, y: 760, size: 14, font });
  writeFileSync(evidence('upload-source.pdf'), await source.save());

  const issuer = await asRole(browser, stack.wallets.issuer);
  await signIn(issuer.page, '/issue');
  const page = issuer.page;
  await page.getByRole('button', { name: 'Tải PDF có sẵn' }).click();
  await page.getByLabel('Tên sinh viên').fill(demo.studentName);
  await page.getByLabel('Ví sinh viên').fill(stack.wallets.student);
  await page.getByLabel('Khóa học').fill('Smart Contract Security');
  await page.getByLabel('PDF nguồn').setInputFiles(evidence('upload-source.pdf'));
  await page.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(page.getByText('SHA-256 khớp với bản nháp.')).toBeVisible();

  await wallet.rejectNext(page, 'eth_sendTransaction');
  await page.getByRole('button', { name: 'Ký phát hành' }).click();
  await expect(page.getByText('Bạn đã từ chối yêu cầu trong ví.')).toBeVisible();
  await shot(page, '09-issuer-user-rejected-tx');
  await page.getByRole('button', { name: 'Ký phát hành' }).click();
  await expect(page.getByText('Backend đã đối soát giao dịch phát hành.')).toBeVisible();
  run.uploadCertificateId = (await page.getByRole('link', { name: 'Mở trang xác minh' }).getAttribute('href'))!.split('/').pop();
  await issuer.context.close();

  const student = await asRole(browser, stack.wallets.student);
  await signIn(student.page, '/student');
  const row = student.page.getByRole('row', { name: /Smart Contract Security/ });
  const pdf = await download(student.page, row.getByRole('button', { name: 'Tải PDF' }), 'certificate-upload-mode.pdf');
  expect(sha256(pdf)).toBe((await chainRecord(run.uploadCertificateId!)).fileHash);
  expect(await PDFDocument.load(pdf).then(doc => doc.getPageCount())).toBe(2);
  expect(await decodePdfQrCodes(pdf)).toEqual([`${urls.app}/verify/${run.uploadCertificateId}`]);
  await student.context.close();
});

test('E2E-06: after revocation the verifier sees REVOKED, together with a hash mismatch when both apply', async ({ browser }) => {
  const issuer = await asRole(browser, stack.wallets.newIssuer);
  await signIn(issuer.page, '/revoke');
  await issuer.page.getByLabel('Mã chứng chỉ').fill(run.certificateId!);
  await issuer.page.getByLabel('Lý do thu hồi').selectOption('1');
  await issuer.page.getByRole('button', { name: 'Ký thu hồi' }).click();
  await expect(issuer.page.getByText('Chứng chỉ đã bị thu hồi trên blockchain.')).toBeVisible();
  await shot(issuer.page, '10-issuer-revoked');
  await issuer.context.close();
  expect((await chainRecord(run.certificateId!)).revoked).toBe(true);

  const { context, page } = await asRole(browser, null);
  await page.goto(`/verify/${run.certificateId}`);
  await expect(page.locator('[data-status="REVOKED"]')).toBeVisible();
  await expect(page.getByText('Chứng chỉ đã bị thu hồi.')).toBeVisible();
  await page.getByLabel('PDF cần đối chiếu').setInputFiles(evidence('certificate-tampered.pdf'));
  await expect(page.getByText('Mã băm PDF không khớp.')).toBeVisible();
  await expect(page.getByText('Chứng chỉ đã bị thu hồi.')).toBeVisible();
  await shot(page, '11-verifier-revoked-and-tampered');
  const { summary, text } = await reportSummary(await download(page, page.getByRole('button', { name: 'Tải biên bản PDF' }), 'verification-report-revoked-tampered.pdf'));
  expect(summary).toMatchObject({ status: 'REVOKED', fileResult: 'FILE_HASH_MISMATCH', verifyCode: 2, revokeReasonCode: 1 });
  expect(text).toContain('THU HỒI');
  expect(text).toContain('KHÔNG KHỚP');
  run.reports.revokedTampered = summary;
  await context.close();
});

test('E2E-09: dashboard counters satisfy issued = active + revoked and match the contract', async ({ browser }) => {
  const { context, page } = await asRole(browser, null);
  await page.goto('/dashboard');
  const value = async (label: string) => Number((await page.locator('.stat-card', { hasText: label }).locator('strong').innerText()).replace(/\D/g, ''));
  await expect(page.locator('.stat-card', { hasText: 'Tổng đã cấp' }).locator('strong')).not.toHaveText('—');
  const [issued, active, revoked] = [await value('Tổng đã cấp'), await value('Đang hiệu lực'), await value('Đã thu hồi')];
  const stats = await registry.getFunction('getStats')();
  expect([issued, revoked, active]).toEqual([Number(stats[0]), Number(stats[1]), Number(stats[2])]);
  expect(issued).toBe(active + revoked);
  expect([issued, active, revoked]).toEqual([2, 1, 1]);
  await expect(page.getByText(`${active} + ${revoked} = ${issued}`)).toBeVisible();
  await shot(page, '12-dashboard');
  await page.goto('/history');
  await expect(page.getByRole('row').filter({ hasText: 'Thu hồi' })).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: 'Phát hành' })).toHaveCount(2);
  await expect(page.getByText('Nguyễn Văn A')).toHaveCount(0);
  await shot(page, '13-history');
  await context.close();
});

test('E2E-10: wrong network, lost RPC and rejected signatures show clear errors, never NOT_FOUND', async ({ browser }) => {
  // RPC unavailable: the public read path must report RPC_ERROR instead of "not found".
  const offline = await asRole(browser, null);
  await offline.page.route('**/rpc', route => route.abort('connectionrefused'));
  await offline.page.goto(`/verify/${run.certificateId}`);
  await expect(offline.page.locator('[data-status="RPC_ERROR"]')).toBeVisible();
  await expect(offline.page.getByText('Không đọc được blockchain.', { exact: false })).toBeVisible();
  await expect(offline.page.getByText('Không tìm thấy chứng chỉ')).toHaveCount(0);
  await shot(offline.page, '14-rpc-error');
  await offline.context.close();

  // Wallet on chain 1: gate blocks signing until the user switches to 31337.
  const wrong = await asRole(browser, stack.wallets.issuer, { chainId: 1 });
  await wrong.page.goto('/issue');
  await wrong.page.locator('section.gate').getByRole('button', { name: 'Kết nối ví' }).click();
  await expect(wrong.page.getByText('Ví đang ở sai mạng')).toBeVisible();
  await expect(wrong.page.getByText('Ví sai mạng')).toBeVisible();
  await shot(wrong.page, '15-wrong-network');
  await wrong.page.locator('section.gate').getByRole('button', { name: 'Chuyển mạng' }).click();
  await expect(wrong.page.getByText('Đăng nhập bằng ví')).toBeVisible();

  // User rejects the sign-in message.
  await wallet.rejectNext(wrong.page, 'personal_sign');
  await wrong.page.locator('section.gate').getByRole('button', { name: 'Ký đăng nhập' }).click();
  await expect(wrong.page.getByText('Bạn đã từ chối yêu cầu trong ví.')).toBeVisible();
  await wrong.context.close();

  // A wallet without roles cannot reach admin/issuer functions (backend 403 / on-chain role check).
  const stranger = await asRole(browser, stack.wallets.otherStudent);
  await signIn(stranger.page, '/issue');
  await expect(stranger.page.getByText('Ví hiện tại chưa có quyền tạo bản nháp.')).toBeVisible();
  const csrf = (await (await stranger.page.request.get('/api/v1/auth/me')).json()).data.csrfToken;
  const denied = await stranger.page.request.post('/api/v1/drafts/generate', { headers: { 'X-CSRF-Token': csrf }, data: { studentWallet: stack.wallets.otherStudent, ...demo } });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBe('ISSUER_REQUIRED');
  await stranger.page.goto('/admin');
  await expect(stranger.page.getByText('Ví chưa có quyền truy cập')).toBeVisible();
  await shot(stranger.page, '16-no-permission');
  await stranger.context.close();
});

test('E2E-11: another student wallet cannot list or download someone else\'s certificate', async ({ browser }) => {
  const other = await asRole(browser, stack.wallets.otherStudent);
  await signIn(other.page, '/student');
  await expect(other.page.getByText('Ví này chưa có chứng chỉ')).toBeVisible();
  const forbidden = await other.page.request.get(`/api/v1/certificates/${run.certificateId}/download`);
  expect(forbidden.status()).toBe(403);
  expect((await forbidden.json()).error.code).toBe('FORBIDDEN');
  await shot(other.page, '17-other-student-empty');
  await other.context.close();

  const anonymous = await asRole(browser, null);
  const unauthenticated = await anonymous.page.request.get(`${urls.app}/api/v1/certificates/${run.certificateId}/download`);
  expect(unauthenticated.status()).toBe(401);
  await anonymous.context.close();
});

test('E2E-12: downloading again keeps the registered hash byte-for-byte, also after revocation', async ({ browser }) => {
  const student = await asRole(browser, stack.wallets.student);
  await signIn(student.page, '/student');
  const row = student.page.getByRole('row', { name: new RegExp(demo.courseName) });
  await expect(row.getByText('Đã thu hồi')).toBeVisible();
  const again = await download(student.page, row.getByRole('button', { name: 'Tải PDF' }), 'certificate-redownload.pdf');
  expect(sha256(again)).toBe(run.fileHash);
  expect(again.equals(readFileSync(evidence('certificate-valid.pdf')))).toBe(true);
  // The browser-side digest used by /verify agrees with Node's SHA-256.
  const browserDigest = await student.page.evaluate(async bytes => {
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    return '0x' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }, [...again]);
  expect(browserDigest).toBe(run.fileHash);
  await shot(student.page, '18-student-after-revoke');
  await student.context.close();
});
