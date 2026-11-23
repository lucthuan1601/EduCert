import { useState } from 'react'
import type { FormEvent } from 'react'
import { Ban, Search, ShieldMinus, ShieldPlus } from 'lucide-react'
import { Link } from 'react-router'
import { CopyValue, Notice, PageHeading, PanelHeading, Pill, TransactionNotice, WalletGate } from '../components/ui'
import type { TransactionState } from '../components/ui'
import type { BackendConfig, Session } from '../lib/api'
import { certificateId, confirmTransaction, issuerRole, readCertificate, revokeReasons, sameAddress, walletAddress, walletContract } from '../lib/chain'
import type { ChainCertificate } from '../lib/chain'
import { usePortal } from '../lib/portal'
import { message } from '../lib/ui'

function AdminForm({ config, session }: { config: BackendConfig; session: Session }) {
  const portal = usePortal()
  const [input, setInput] = useState('')
  const [role, setRole] = useState<{ wallet: string; issuer: boolean } | null>(null)
  const [tx, setTx] = useState<TransactionState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function roleAction(kind: 'check' | 'grantRole' | 'revokeRole') {
    setBusy(true)
    setError('')
    setTx(null)
    let txHash: string | undefined
    try {
      const target = walletAddress(input)
      const contract = await walletContract(config, session.wallet)
      if (kind !== 'check') {
        setTx({ status: 'signing' })
        const transaction = await contract.getFunction(kind)(issuerRole, target)
        const pending = (hash: string) => { txHash = hash; setTx({ status: 'pending', hash }) }
        pending(transaction.hash)
        const hash = await confirmTransaction(transaction, pending)
        setTx({ status: 'confirmed', hash, detail: kind === 'grantRole' ? 'Đã cấp quyền phát hành.' : 'Đã thu hồi quyền phát hành.' })
      }
      const issuer = Boolean(await contract.getFunction('hasRole')(issuerRole, target))
      setRole({ wallet: target, issuer })
      if (kind !== 'check' && sameAddress(target, session.wallet)) void portal.refreshSession()
    } catch (fault) {
      if (txHash) setTx({ status: 'error', hash: txHash, detail: message(fault) })
      else { setTx(null); setError(message(fault)) }
    } finally { setBusy(false) }
  }

  return <section className="panel standard-panel section-stack">
    <PanelHeading title="Quyền nhà phát hành" description="Tra cứu và quản lý quyền ISSUER_ROLE của ví trên smart contract." />
    <form className="form-stack" onSubmit={event => { event.preventDefault(); void roleAction('check') }}>
      <label className="field">Địa chỉ ví<input className="mono" required autoComplete="off" spellCheck={false} placeholder="0x…" value={input} onChange={event => { setInput(event.target.value); setRole(null); setError('') }} /></label>
      <div className="button-row">
        <button type="submit" className="button secondary" disabled={busy}><Search size={17} /> Kiểm tra quyền</button>
        <button type="button" className="button primary" disabled={busy || !input.trim()} onClick={() => void roleAction('grantRole')}><ShieldPlus size={18} /> Cấp quyền</button>
        <button type="button" className="button danger-outline" disabled={busy || !input.trim()} onClick={() => void roleAction('revokeRole')}><ShieldMinus size={18} /> Tước quyền</button>
      </div>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    <TransactionNotice tx={tx} />
    {role && <div className="draft-meta">
      <CopyValue value={role.wallet} label="Sao chép địa chỉ ví" compact />
      <Pill tone={role.issuer ? 'success' : 'neutral'}>{role.issuer ? 'Có quyền phát hành' : 'Chưa có quyền phát hành'}</Pill>
    </div>}
  </section>
}

function RevokeForm({ config, session }: { config: BackendConfig; session: Session }) {
  const [input, setInput] = useState('')
  const [reason, setReason] = useState(0)
  const [record, setRecord] = useState<ChainCertificate | null>(null)
  const [tx, setTx] = useState<TransactionState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = certificateId(input)
    if (!id) { setError('Nhập mã chứng chỉ hợp lệ.'); return }
    if (!revokeReasons.some(item => item.code === reason)) { setError('Chọn lý do thu hồi.'); return }
    setBusy(true)
    setError('')
    setTx(null)
    let txHash: string | undefined
    try {
      const data = await readCertificate(config, id)
      if (!data) throw new Error('Không tìm thấy chứng chỉ.')
      setRecord(data)
      if (data.revoked) throw new Error('Chứng chỉ này đã bị thu hồi.')
      if (!session.roles.admin && !sameAddress(data.issuer, session.wallet)) {
        throw new Error('Chỉ ví cấp chứng chỉ hoặc quản trị viên có thể thu hồi.')
      }
      const contract = await walletContract(config, session.wallet)
      setTx({ status: 'signing' })
      const transaction = await contract.getFunction('revokeCertificate')(id, reason)
      const pending = (hash: string) => { txHash = hash; setTx({ status: 'pending', hash }) }
      pending(transaction.hash)
      const hash = await confirmTransaction(transaction, pending)
      setRecord({ ...data, revoked: true, revokeReasonCode: reason })
      setTx({ status: 'confirmed', hash, detail: 'Chứng chỉ đã bị thu hồi trên blockchain.' })
    } catch (fault) {
      if (txHash) setTx({ status: 'error', hash: txHash, detail: message(fault) })
      else { setTx(null); setError(message(fault)) }
    } finally { setBusy(false) }
  }

  return <section className="panel standard-panel section-stack">
    <PanelHeading title="Thông tin thu hồi" description="Giao dịch sẽ cập nhật trạng thái của chứng chỉ trên blockchain." />
    <form className="form-stack" onSubmit={submit}>
      <label className="field">Mã chứng chỉ<input className="mono" required autoComplete="off" spellCheck={false} placeholder="0x…" value={input} onChange={event => { setInput(event.target.value); setRecord(null); setError(''); setTx(null) }} /></label>
      <div className="field"><label htmlFor="revoke-reason">Lý do thu hồi</label>
        <select id="revoke-reason" required value={reason || ''} onChange={event => setReason(Number(event.target.value))}>
          <option value="" disabled>Chọn lý do</option>{revokeReasons.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </div>
      <Notice tone="warning">Thu hồi là thao tác vĩnh viễn trên hợp đồng. Hãy kiểm tra đúng mã chứng chỉ trước khi ký.</Notice>
      <button type="submit" className="button danger" disabled={busy || record?.revoked}><Ban size={18} /> Ký thu hồi</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    <TransactionNotice tx={tx} />
    {record?.revoked && <div className="button-row">
      <Pill tone="error">Đã thu hồi</Pill><Link className="button secondary small" to={'/verify/' + record.id}>Xem bản ghi công khai</Link>
    </div>}
  </section>
}

export function AdminPage() {
  const { config, session } = usePortal()
  return <div className="page-stack">
    <PageHeading title="Quản trị phân quyền" description="Quản trị viên cấp và tước quyền phát hành bằng giao dịch MetaMask." />
    <WalletGate access="admin">{config && session && <AdminForm key={session.wallet} config={config} session={session} />}</WalletGate>
  </div>
}

export function RevokePage() {
  const { config, session } = usePortal()
  return <div className="page-stack">
    <PageHeading title="Thu hồi chứng chỉ" description="Thu hồi một chứng chỉ đã cấp và ghi lý do trên smart contract." />
    <WalletGate access="revoke">{config && session && <RevokeForm key={session.wallet} config={config} session={session} />}</WalletGate>
  </div>
}
