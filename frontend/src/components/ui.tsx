import { useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, FileSearch, Info, LoaderCircle, LockKeyhole, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePortal } from '../lib/portal'
import { number, short } from '../lib/ui'

export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

export function PanelHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' | 'warning' }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle
  return <div className={'notice ' + tone} role={tone === 'error' ? 'alert' : 'status'}><Icon size={19} /><div>{children}</div></div>
}

export function Busy({ children = 'Đang tải…' }: { children?: ReactNode }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={20} />{children}</div>
}

export function Empty({ title, detail, icon: Icon = FileSearch, action }: { title: string; detail?: string; icon?: LucideIcon; action?: ReactNode }) {
  return <div className="empty"><span className="tile"><Icon size={24} /></span><div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>{action}</div>
}

export function ResourceError({ error, retry }: { error: string; retry: () => void }) {
  return <div className="resource-error"><Notice tone="error">{error}</Notice><button type="button" className="button secondary small" onClick={retry}>Thử lại</button></div>
}

export function CopyValue({ value, label = 'Sao chép', compact = false }: { value: string; label?: string; compact?: boolean }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'unavailable'>('idle')
  return (
    <span className="copy-value">
      {compact && <code title={value}>{short(value)}</code>}
      <button type="button" className={compact ? 'icon-button compact' : 'button secondary small'} title={label} aria-label={label} onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopyState('copied') }
        catch { setCopyState('unavailable') }
      }}>
        {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
        {!compact && (copyState === 'copied' ? 'Đã sao chép' : label)}
      </button>
      {copyState === 'unavailable' && <input className="copy-fallback" readOnly value={value} aria-label={label} onFocus={event => event.target.select()} />}
      <span className="sr-only" aria-live="polite">{copyState === 'copied' ? 'Đã sao chép' : ''}</span>
    </span>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'error' }) {
  return <span className={'pill ' + tone}>{children}</span>
}

export function Pagination({ offset, limit, total, go }: { offset: number; limit: number; total: number; go: (offset: number) => void }) {
  if (total === 0) return null
  return (
    <div className="pagination">
      <span>Hiển thị {number(offset + 1)}–{number(Math.min(total, offset + limit))} / {number(total)}</span>
      <div className="button-row">
        <button type="button" className="icon-button" aria-label="Trang trước" disabled={offset === 0} onClick={() => go(Math.max(0, offset - limit))}><ChevronLeft size={18} /></button>
        <button type="button" className="icon-button" aria-label="Trang sau" disabled={offset + limit >= total} onClick={() => go(offset + limit)}><ChevronRight size={18} /></button>
      </div>
    </div>
  )
}

export function WalletGate({ children, access }: { children: ReactNode; access?: 'admin' | 'revoke' }) {
  const portal = usePortal()
  let content: ReactNode
  if (portal.configLoading || portal.restoring) content = <Busy />
  else if (!portal.config) content = <ResourceError error={portal.configError} retry={portal.reloadConfig} />
  else if (!portal.address) content = <Empty icon={Wallet} title="Kết nối ví của bạn" detail="Sử dụng MetaMask để chọn tài khoản EduCert." action={<button className="button primary" disabled={portal.working} onClick={portal.connect}>Kết nối ví</button>} />
  else if (portal.wrongNetwork) content = <Empty icon={AlertCircle} title="Ví đang ở sai mạng" detail={'Hãy chuyển sang mạng có Chain ID ' + portal.config.chainId + '.'} action={<button className="button primary" disabled={portal.working} onClick={portal.switchNetwork}>Chuyển mạng</button>} />
  else if (!portal.session) content = <Empty icon={LockKeyhole} title="Đăng nhập bằng ví" detail="Xác nhận chữ ký đăng nhập trong MetaMask để mở chức năng này." action={<button className="button primary" disabled={portal.working} onClick={portal.signIn}>{portal.working ? 'Đang chờ ví…' : 'Ký đăng nhập'}</button>} />
  else if ((access === 'admin' && !portal.session.roles.admin) || (access === 'revoke' && !portal.session.roles.admin && !portal.session.roles.issuer)) {
    content = <Empty icon={LockKeyhole} title="Ví chưa có quyền truy cập" detail={access === 'admin' ? 'Trang này dành cho quản trị viên.' : 'Trang này dành cho nhà phát hành hoặc quản trị viên.'} action={<button className="button secondary" disabled={portal.working} onClick={portal.refreshSession}>Kiểm tra lại quyền</button>} />
  } else return children
  return <section className="panel gate">{content}{portal.walletError && <Notice tone="error">{portal.walletError}</Notice>}</section>
}

export type TransactionState = { status: 'signing' | 'pending' | 'confirmed' | 'error'; hash?: string; detail?: string }

export function TransactionNotice({ tx }: { tx: TransactionState | null }) {
  if (!tx) return null
  const title = { signing: 'Đang chờ xác nhận trong ví', pending: 'Đang chờ xác nhận giao dịch', confirmed: 'Giao dịch đã được xác nhận', error: 'Giao dịch chưa hoàn tất' }[tx.status]
  return (
    <Notice tone={tx.status === 'error' ? 'error' : tx.status === 'confirmed' ? 'success' : 'info'}>
      <strong>{title}</strong>
      {tx.detail && <p>{tx.detail}</p>}
      {tx.hash && <div className="transaction-hash"><CopyValue value={tx.hash} label="Sao chép mã giao dịch" compact /></div>}
    </Notice>
  )
}
