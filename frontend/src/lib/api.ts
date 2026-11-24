import type { InterfaceAbi } from 'ethers'

export interface BackendConfig {
  chainId: number
  contractAddress: string
  abi: InterfaceAbi
  publicAppUrl: string
  maxPdfBytes: number
}

export interface Session {
  wallet: string
  csrfToken: string
  expiresAt: string
  roles: { admin: boolean; issuer: boolean }
}

export interface DraftFields {
  studentWallet: string
  studentName: string
  courseName: string
  issuerName?: string
  issuedDate?: string
}

export interface CertificateMetadata {
  certificateId: string
  studentWallet: string
  issuerWallet: string
  studentName: string
  courseName: string
  fileHash: string
  fileSize: number
  txHash: string | null
  chainId: number
  contractAddress: string
  syncState: 'DRAFT' | 'PENDING_CHAIN' | 'ISSUED' | 'FAILED' | 'REVOKED'
  errorCode: string | null
  createdAt: string
  updatedAt: string
}

export interface Draft extends CertificateMetadata {
  verifyUrl: string
  previewUrl: string
}

export interface StudentCertificate extends CertificateMetadata {
  issuedAt: string
  revokedAt: string | null
}

interface Page<T> {
  items: T[]
  offset: number
  limit: number
  total: number
}

export interface Stats {
  chainId: number
  contractAddress: string
  issued: number
  revoked: number
  active: number
}

export type EventType = 'ALL' | 'ISSUED' | 'REVOKED'

export interface ChainEvent {
  type: Exclude<EventType, 'ALL'>
  certificateId: string
  txHash: string
  blockNumber: number
  logIndex: number
  issuedAt?: string
  revokedAt?: string
}

export interface EventPage extends Page<ChainEvent> {
  fromBlock: number
  toBlock: number
  previousToBlock: number | null
}

const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function response(path: string, options: RequestInit = {}) {
  try {
    return await fetch(base + path, { ...options, credentials: 'include', cache: 'no-store' })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR')
  }
}

async function failure(result: Response) {
  const body = await result.json().catch(() => null)
  return new ApiError(result.status, body?.error?.code ?? 'API_ERROR')
}

async function json<T>(path: string, body?: object, csrf?: string): Promise<T> {
  const multipart = body instanceof FormData
  const headers = new Headers()
  if (csrf) headers.set('X-CSRF-Token', csrf)
  if (body && !multipart) headers.set('Content-Type', 'application/json')
  const result = await response(path, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  })
  if (!result.ok) throw await failure(result)
  const payload = await result.json().catch(() => null)
  if (!payload?.success) throw new ApiError(result.status, payload?.error?.code ?? 'API_ERROR')
  return payload.data as T
}

async function pdf(path: string) {
  const result = await response(path)
  if (!result.ok) throw await failure(result)
  if (!result.headers.get('Content-Type')?.includes('application/pdf')) {
    throw new ApiError(result.status, 'INVALID_PDF')
  }
  return result.blob()
}

export const api = {
  config: () => json<BackendConfig>('/config'),
  nonce: (wallet: string) => json<{ nonce: string; message: string }>('/auth/nonce', { wallet }),
  verify: (wallet: string, nonce: string, signature: string) =>
    json<Omit<Session, 'roles'>>('/auth/verify', { wallet, nonce, signature }),
  me: () => json<Session>('/auth/me'),
  logout: (csrf: string) => json('/auth/logout', {}, csrf),
  draft: (id: string) => json<Draft>('/drafts/' + encodeURIComponent(id)),
  createDraft: (fields: DraftFields, file: File | null, csrf: string) => {
    if (!file) return json<Draft>('/drafts/generate', fields, csrf)
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      if (value) form.set(key, value)
    }
    form.set('file', new Blob([file], { type: 'application/pdf' }), file.name)
    return json<Draft>('/drafts/upload', form, csrf)
  },
  preview: (id: string) => pdf('/drafts/' + encodeURIComponent(id) + '/preview'),
  finalize: (id: string, txHash: string, csrf: string) =>
    json<CertificateMetadata>('/certificates/' + encodeURIComponent(id) + '/finalize', { txHash }, csrf),
  download: (id: string) => pdf('/certificates/' + encodeURIComponent(id) + '/download'),
  report: (id: string, fileHash?: string) =>
    pdf('/certificates/' + encodeURIComponent(id) + '/verification-report' + (fileHash ? '?fileHash=' + encodeURIComponent(fileHash) : '')),
  student: (offset: number, limit: number) =>
    json<Page<StudentCertificate>>('/me/certificates?offset=' + offset + '&limit=' + limit),
  stats: () => json<Stats>('/stats'),
  events: (options: { offset: number; limit: number; type?: EventType; toBlock?: number }) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) query.set(key, String(value))
    }
    return json<EventPage>('/events?' + query.toString())
  },
}
