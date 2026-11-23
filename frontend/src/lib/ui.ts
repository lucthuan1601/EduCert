import { useEffect, useState } from 'react'
import { isError } from 'ethers'
import { ApiError } from './api'

const notifications: Record<string, string> = {
  NETWORK_ERROR: 'Không kết nối được máy chủ EduCert. Hãy kiểm tra backend và thử lại.',
  RPC_ERROR: 'Không đọc được blockchain. Kiểm tra mạng, node RPC và địa chỉ hợp đồng rồi thử lại.',
  API_ERROR: 'Máy chủ EduCert chưa trả về kết quả hợp lệ.',
  VALIDATION_ERROR: 'Một số thông tin chưa đúng định dạng. Hãy kiểm tra lại biểu mẫu.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại bằng ví.',
  UNAUTHENTICATED: 'Hãy đăng nhập bằng ví để tiếp tục.',
  NONCE_INVALID: 'Yêu cầu ký đã hết hạn. Hãy đăng nhập lại.',
  SIGNATURE_INVALID: 'Chữ ký không khớp với ví đã chọn.',
  FORBIDDEN: 'Ví hiện tại không có quyền thực hiện thao tác này.',
  ISSUER_REQUIRED: 'Ví hiện tại chưa được cấp quyền nhà phát hành.',
  CSRF_INVALID: 'Phiên đã thay đổi. Hãy đăng xuất và kết nối lại bằng ví.',
  ORIGIN_NOT_ALLOWED: 'Địa chỉ giao diện chưa được khai báo trong PUBLIC_APP_URL của backend.',
  FILE_INTEGRITY_ERROR: 'PDF lưu trữ không khớp mã băm tham chiếu.',
  INVALID_PDF: 'Chọn tệp PDF hợp lệ, có thể mở và không bị mã hóa.',
  FILE_REQUIRED: 'Hãy chọn tệp PDF.',
  FILE_TOO_LARGE: 'Tệp PDF vượt quá giới hạn dung lượng cho phép.',
  SIGNED_PDF_UNSUPPORTED: 'Tệp PDF đã có chữ ký số và không thể chèn QR.',
  PDF_RENDER_ERROR: 'Backend không tạo được PDF từ thông tin đã nhập.',
  TX_NOT_FOUND: 'Node chưa tìm thấy giao dịch. Hãy thử đối soát lại với cùng mã giao dịch.',
  TX_ALREADY_USED: 'Giao dịch đã gắn với một bản nháp khác.',
  TX_ALREADY_BOUND: 'Bản nháp đã gắn với một giao dịch khác.',
  TX_FAILED: 'Giao dịch thất bại trên blockchain.',
  TX_MISMATCH: 'Giao dịch không khớp với ví, mạng hoặc hợp đồng của bản nháp.',
  EVENT_MISMATCH: 'Giao dịch không chứa sự kiện phát hành khớp với bản nháp.',
  CHAIN_STATE_MISMATCH: 'Bản ghi blockchain không khớp với dữ liệu bản nháp.',
  NOT_FOUND: 'Không tìm thấy bản ghi này.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Hãy đợi một lúc rồi thử lại.',
}

export function message(error: unknown) {
  if (error instanceof ApiError) return notifications[error.code] ?? notifications.API_ERROR
  if (isError(error, 'ACTION_REJECTED') || (typeof error === 'object' && error && 'code' in error && error.code === 4001)) {
    return 'Bạn đã từ chối yêu cầu trong ví.'
  }
  if (isError(error, 'INSUFFICIENT_FUNDS')) return 'Ví không đủ ETH thử nghiệm cho phí giao dịch.'
  if (isError(error, 'TRANSACTION_REPLACED') && error.cancelled) return 'Giao dịch đã bị hủy trong ví.'
  if (isError(error, 'TIMEOUT')) return 'Chưa nhận được xác nhận. Kiểm tra ví hoặc đối soát giao dịch sau.'
  if (isError(error, 'CALL_EXCEPTION')) return 'Hợp đồng từ chối giao dịch. Hãy kiểm tra quyền và trạng thái chứng chỉ.'
  if (isError(error, 'NETWORK_ERROR')) return notifications.RPC_ERROR
  return error instanceof Error ? error.message : 'Có lỗi xảy ra. Hãy thử lại.'
}

export function short(value: string, start = 9, end = 5) {
  return value.length > start + end + 1 ? value.slice(0, start) + '…' + value.slice(-end) : value
}

export function dateTime(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}

export function number(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value)
}

export function useResource<T>(load: () => Promise<T>) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ load: () => Promise<T>; revision: number; data: T | null; error: string } | null>(null)
  useEffect(() => {
    let current = true
    load().then(data => {
      if (current) setState({ load, revision, data, error: '' })
    }).catch(error => {
      if (current) setState({ load, revision, data: null, error: message(error) })
    })
    return () => { current = false }
  }, [load, revision])
  const result = state?.load === load && state.revision === revision ? state : null
  return { data: result?.data ?? null, error: result?.error ?? '', loading: !result, retry: () => setRevision(value => value + 1) }
}
