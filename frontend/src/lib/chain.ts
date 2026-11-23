import {
  BrowserProvider, Contract, FetchRequest, JsonRpcProvider, ZeroAddress, ZeroHash,
  getAddress, id, isAddress, isError,
} from 'ethers'
import type { Eip1193Provider, TransactionResponse } from 'ethers'
import { ApiError } from './api'
import type { BackendConfig } from './api'

export interface WalletProvider extends Eip1193Provider {
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

declare global {
  interface Window { ethereum?: WalletProvider }
}

export const issuerRole = id('ISSUER_ROLE')
export const revokeReasons = [
  { code: 1, label: 'Sai thông tin chứng chỉ' },
  { code: 2, label: 'Gian lận' },
  { code: 3, label: 'Sai thẩm quyền' },
  { code: 4, label: 'Lý do khác' },
]

export function reasonLabel(code: number) {
  return revokeReasons.find(reason => reason.code === code)?.label ?? 'Mã lý do ' + code
}

export function sameAddress(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase())
}

export function walletAddress(value: string) {
  const clean = value.trim()
  if (!isAddress(clean) || clean.toLowerCase() === ZeroAddress) {
    throw new Error('Nhập địa chỉ ví Ethereum hợp lệ.')
  }
  return getAddress(clean)
}

export function certificateId(value: string) {
  const clean = value.trim()
  const bytes32 = (candidate: string) => /^0x[0-9a-f]{64}$/i.test(candidate) && candidate.toLowerCase() !== ZeroHash
  if (bytes32(clean)) return clean.toLowerCase()
  try {
    const url = new URL(clean)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const match = url.pathname.match(/^\/verify\/(0x[0-9a-f]{64})\/?$/i)
      if (match && bytes32(match[1])) return match[1].toLowerCase()
    }
  } catch {
    // A plain ID is already checked above.
  }
  return null
}

export async function signerFor(config: BackendConfig, expected?: string) {
  const ethereum = window.ethereum
  if (!ethereum) throw new Error('Hãy cài và mở MetaMask để ký bằng ví.')
  const provider = new BrowserProvider(ethereum)
  const accounts = await provider.send('eth_accounts', []) as string[]
  if (expected && !sameAddress(accounts[0], expected)) throw new Error('Tài khoản ví đã thay đổi. Kết nối lại để tiếp tục.')
  if (Number((await provider.getNetwork()).chainId) !== config.chainId) {
    throw new Error('Sai mạng. Hãy chuyển MetaMask sang Chain ID ' + config.chainId + '.')
  }
  const signer = await provider.getSigner(expected)
  if (expected && !sameAddress(await signer.getAddress(), expected)) throw new Error('Tài khoản ký đã thay đổi.')
  return signer
}

export async function walletContract(config: BackendConfig, expected: string) {
  return new Contract(config.contractAddress, config.abi, await signerFor(config, expected))
}

export async function confirmTransaction(tx: TransactionResponse, onReplacement?: (hash: string) => void) {
  try {
    const receipt = await tx.wait(1, 90_000)
    if (!receipt || receipt.status !== 1) throw new Error('Giao dịch chưa được xác nhận.')
    return receipt.hash
  } catch (error) {
    if (isError(error, 'TRANSACTION_REPLACED')) {
      if (error.cancelled) throw error
      onReplacement?.(error.replacement.hash)
      if (error.receipt.status !== 1) throw new Error('Giao dịch thay thế không thành công.')
      return error.receipt.hash
    }
    throw error
  }
}

export interface ChainCertificate {
  id: string
  issuer: string
  student: string
  fileHash: string
  issuedAt: string
  revokedAt: string | null
  revoked: boolean
  revokeReasonCode: number
}

export async function readCertificate(config: BackendConfig, id: string): Promise<ChainCertificate | null> {
  const url = new URL(import.meta.env.VITE_RPC_URL || '/rpc', window.location.origin)
  const request = new FetchRequest(url.toString())
  request.timeout = 6000
  const provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 })
  try {
    const network = await provider.getNetwork()
    if (Number(network.chainId) !== config.chainId || await provider.getCode(config.contractAddress) === '0x') {
      throw new Error('RPC configuration mismatch')
    }
    const contract = new Contract(config.contractAddress, config.abi, provider)
    const data = await contract.getFunction('getCertificate')(id)
    if (!data.exists) return null
    return {
      id, issuer: data.issuer, student: data.student, fileHash: data.fileHash.toLowerCase(),
      issuedAt: new Date(Number(data.issuedAt) * 1000).toISOString(),
      revokedAt: data.revokedAt ? new Date(Number(data.revokedAt) * 1000).toISOString() : null,
      revoked: data.revoked, revokeReasonCode: Number(data.revokeReasonCode),
    }
  } catch {
    throw new ApiError(503, 'RPC_ERROR')
  } finally {
    provider.destroy()
  }
}

export async function pdfHash(blob: Blob) {
  if (!globalThis.crypto?.subtle) throw new Error('Cần HTTPS hoặc localhost để băm PDF trong trình duyệt.')
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return '0x' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function validatePdf(file: Blob, maxBytes: number) {
  if (file.size > maxBytes) throw new ApiError(413, 'FILE_TOO_LARGE')
  if (await file.slice(0, 5).text() !== '%PDF-') throw new ApiError(400, 'INVALID_PDF')
}
