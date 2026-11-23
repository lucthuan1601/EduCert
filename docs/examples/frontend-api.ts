import { BrowserProvider, Contract, type Eip1193Provider, type InterfaceAbi } from 'ethers';

export interface BackendConfig { chainId: number; contractAddress: string; abi: InterfaceAbi; publicAppUrl: string; maxPdfBytes: number }
export interface Session { wallet: string; csrfToken: string; expiresAt: string; roles?: { admin: boolean; issuer: boolean } }
export interface DraftInput { studentWallet: string; studentName: string; courseName: string; issuerName?: string; issuedDate?: string }
export interface CertificateMetadata {
  certificateId: string; studentWallet: string; issuerWallet: string; studentName: string; courseName: string;
  fileHash: string; fileSize: number; txHash: string | null; chainId: number; contractAddress: string;
  syncState: 'DRAFT' | 'PENDING_CHAIN' | 'ISSUED' | 'FAILED' | 'REVOKED';
  errorCode: string | null; createdAt: string; updatedAt: string;
}
export interface Draft extends CertificateMetadata { verifyUrl: string; previewUrl: string }
export interface PublicCertificate {
  certificateId: string; chainId: number; contractAddress: string; fileHash: string; issuer: string; student: string;
  issuedAt: string; revokedAt: string | null; revokeReasonCode: number; exists: true; revoked: boolean;
  status: 'REGISTERED_ACTIVE' | 'REVOKED';
}
export interface Page<T> { items: T[]; total: number; offset: number; limit: number }
export interface CertificateItem extends CertificateMetadata { issuedAt: string; revokedAt: string | null; revokeReasonCode: number; downloadUrl: string }
export interface ChainEvent { type: 'ISSUED' | 'REVOKED'; certificateId: string; txHash: string; blockNumber: number; blockHash: string; logIndex: number; issuer?: string; student?: string; fileHash?: string; issuedAt?: string; revokedBy?: string; revokeReasonCode?: number; revokedAt?: string }
export interface EventPage extends Page<ChainEvent> { chainId: number; contractAddress: string; fromBlock: number; toBlock: number; previousToBlock: number | null; nextFromBlock: number | null }

export class BackendError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Copy into frontend/src/lib after installing ethers v6. Keep one instance per tab. */
export class EduCertApi {
  private csrfToken?: string;
  private readonly origin: string;
  constructor(backendOrigin = 'http://localhost:3001') { this.origin = new URL(backendOrigin).origin; }
  private url(path: string) {
    const url = new URL(path.startsWith('/api/v1/') ? path : `/api/v1${path}`, this.origin);
    if (url.origin !== this.origin) throw new Error('API path must belong to the configured Backend');
    return url;
  }
  private async response(path: string, init: RequestInit = {}) {
    try { return await fetch(this.url(path), { ...init, credentials: 'include' }); }
    catch { throw new BackendError(0, 'NETWORK_ERROR', 'Cannot connect to Backend'); }
  }
  private async json<T>(path: string, body?: unknown, authenticatedWrite = false): Promise<T> {
    if (authenticatedWrite && !this.csrfToken) await this.restoreSession();
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers: Record<string, string> = {};
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
    if (authenticatedWrite) headers['X-CSRF-Token'] = this.csrfToken!;
    const response = await this.response(path, { method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
    const envelope = await response.json();
    if (!response.ok || !envelope.success) {
      if (response.status === 401) this.csrfToken = undefined;
      throw new BackendError(response.status, envelope.error?.code ?? 'API_ERROR', envelope.error?.message ?? 'Backend request failed');
    }
    return envelope.data as T; // 202 is successful; inspect syncState and retry the same transaction.
  }
  private async pdf(path: string): Promise<Blob> {
    const response = await this.response(path);
    if (!response.ok) {
      const error = await response.json();
      throw new BackendError(response.status, error.error.code, error.error.message);
    }
    return response.blob();
  }
  config() { return this.json<BackendConfig>('/config'); }
  nonce(wallet: string) { return this.json<{ wallet: string; nonce: string; message: string; expiresAt: string }>('/auth/nonce', { wallet }); }
  async verify(wallet: string, nonce: string, signature: string) {
    const session = await this.json<Session>('/auth/verify', { wallet, nonce, signature });
    this.csrfToken = session.csrfToken; return session;
  }
  async signIn(ethereum: Eip1193Provider) {
    const provider = new BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    const wallet = await signer.getAddress();
    const challenge = await this.nonce(wallet);
    return this.verify(wallet, challenge.nonce, await signer.signMessage(challenge.message));
  }
  async restoreSession() {
    const session = await this.json<Session>('/auth/me');
    this.csrfToken = session.csrfToken; return session;
  }
  async logout() { await this.json('/auth/logout', {}, true); this.csrfToken = undefined; }
  generateDraft(input: DraftInput) { return this.json<Draft>('/drafts/generate', input, true); }
  uploadDraft(input: DraftInput, file: File) {
    const form = new FormData();
    for (const [key, value] of Object.entries(input)) if (value !== undefined) form.set(key, value);
    form.set('file', file); return this.json<Draft>('/drafts/upload', form, true);
  }
  draft(id: string) { return this.json<Draft>(`/drafts/${encodeURIComponent(id)}`); }
  preview(id: string) { return this.pdf(`/drafts/${encodeURIComponent(id)}/preview`); }
  finalize(id: string, txHash: string) { return this.json<CertificateMetadata>(`/certificates/${encodeURIComponent(id)}/finalize`, { txHash }, true); }
  publicCertificate(id: string) { return this.json<PublicCertificate>(`/certificates/${encodeURIComponent(id)}/public`); }
  download(id: string) { return this.pdf(`/certificates/${encodeURIComponent(id)}/download`); }
  myCertificates(offset = 0, limit = 20) { return this.json<Page<CertificateItem>>(`/me/certificates?offset=${offset}&limit=${limit}`); }
  stats() { return this.json<{ chainId: number; contractAddress: string; issued: number; revoked: number; active: number }>('/stats'); }
  events(options: { offset?: number; limit?: number; type?: 'ALL' | 'ISSUED' | 'REVOKED'; fromBlock?: number; toBlock?: number } = {}) {
    const query = new URLSearchParams(Object.entries(options).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    return this.json<EventPage>(`/events?${query}`);
  }
}

export async function pdfHash(pdf: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await pdf.arrayBuffer());
  return `0x${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** onSubmitted should persist only ID/txHash so RPC errors or page reload do not trigger another issuance. */
export async function publishDraft(api: EduCertApi, ethereum: Eip1193Provider, draft: Draft, onSubmitted: (id: string, txHash: string) => void) {
  const config = await api.config();
  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  if (Number((await provider.getNetwork()).chainId) !== config.chainId || draft.chainId !== config.chainId || draft.contractAddress !== config.contractAddress) throw new Error('Wrong network or contract');
  if (await signer.getAddress() !== draft.issuerWallet) throw new Error('Wallet does not own this draft');
  if (await pdfHash(await api.preview(draft.certificateId)) !== draft.fileHash) throw new Error('Preview hash does not match draft');
  const contract = new Contract(config.contractAddress, config.abi, signer);
  const tx = await contract.getFunction('issueCertificate')(draft.certificateId, draft.fileHash, draft.studentWallet);
  onSubmitted(draft.certificateId, tx.hash);
  await tx.wait();
  return api.finalize(draft.certificateId, tx.hash);
}
