import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { isError } from 'ethers'
import { CheckCircle2, FilePlus2, FileText, FileUp, Link2, RotateCcw, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { VerifyQr } from '../components/qr'
import { Busy, CopyValue, Empty, Notice, PageHeading, PanelHeading, Pill, TransactionNotice, WalletGate } from '../components/ui'
import type { TransactionState } from '../components/ui'
import { api, ApiError } from '../lib/api'
import type { BackendConfig, Draft, DraftFields, Session } from '../lib/api'
import { certificateId, confirmTransaction, pdfHash, sameAddress, validatePdf, walletAddress, walletContract } from '../lib/chain'
import { usePortal } from '../lib/portal'
import { message } from '../lib/ui'

const definitive = new Set(['TX_MISMATCH', 'EVENT_MISMATCH', 'TX_FAILED', 'CHAIN_STATE_MISMATCH'])
const initialFields: DraftFields = { studentWallet: '', studentName: '', courseName: '', issuerName: 'Demo University', issuedDate: '' }
type SavedDraft = { id: string; txHash: string | null }

function storedDraft(key: string): SavedDraft | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null') as SavedDraft | null
    const id = saved && typeof saved.id === 'string' && certificateId(saved.id)
    if (id) return { id, txHash: typeof saved.txHash === 'string' ? certificateId(saved.txHash) : null }
  } catch {
    // An unavailable browser store does not prevent issuing in the current tab.
  }
  return null
}

function saveDraft(key: string, id: string, txHash: string | null) {
  try {
    const saved = JSON.stringify({ id, txHash })
    localStorage.setItem(key, saved)
    localStorage.setItem(key + ':' + id, saved)
  } catch { /* Browser storage is optional. */ }
}

function DraftPreview({ draft, maxBytes, onHash }: { draft: Draft; maxBytes: number; onHash: (hash: string | null) => void }) {
  const [file, setFile] = useState<{ url: string; hash: string } | null>(null)
  const [fault, setFault] = useState('')
  const [version, setVersion] = useState(0)
  const id = draft.certificateId
  const expected = draft.fileHash.toLowerCase()
  useEffect(() => {
    let current = true
    let objectUrl: string | undefined
    void api.preview(id).then(async pdf => {
      await validatePdf(pdf, maxBytes)
      const hash = await pdfHash(pdf)
      if (!current) return
      objectUrl = URL.createObjectURL(pdf)
      setFile({ url: objectUrl, hash })
      if (hash === expected) onHash(hash)
    }).catch((error: unknown) => {
      if (current) setFault(message(error))
    })
    return () => { current = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [expected, id, maxBytes, onHash, version])

  if (fault) return <div className="resource-error"><Notice tone="error">{fault}</Notice><button type="button" className="button secondary small" onClick={() => {
    setFault('')
    setFile(null)
    onHash(null)
    setVersion(version + 1)
  }}>Tải lại PDF</button></div>
  if (!file) return <Busy>Đang tải và băm PDF…</Busy>
  return <>
    <Notice tone={file.hash === expected ? 'success' : 'error'}>{file.hash === expected ? 'SHA-256 khớp với bản nháp.' : 'Mã băm PDF không khớp. Giao dịch chưa thể được ký.'}</Notice>
    <div className="pdf-preview"><iframe title="Bản PDF chứng chỉ đã chèn QR" src={file.url} /></div>
    <div className="button-row">
      <a className="button secondary small" href={file.url} target="_blank" rel="noreferrer"><FileText size={17} /> Mở PDF</a>
      <CopyValue value={expected} label="Sao chép SHA-256" />
    </div>
  </>
}

function IssueForm({ config, session }: { config: BackendConfig; session: Session }) {
  const portal = usePortal()
  const storeKey = ['educert', 'draft', config.chainId, config.contractAddress.toLowerCase(), session.wallet.toLowerCase()].join(':')
  const [previous] = useState(() => storedDraft(storeKey))
  const [fields, setFields] = useState(initialFields)
  const [mode, setMode] = useState<'generate' | 'upload'>('generate')
  const [source, setSource] = useState<File | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [readyHash, setReadyHash] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [tx, setTx] = useState<TransactionState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(Boolean(previous))
  const [recoverOpen, setRecoverOpen] = useState(false)
  const [recoverId, setRecoverId] = useState('')
  const final = draft?.syncState === 'ISSUED' || draft?.syncState === 'REVOKED'

  useEffect(() => {
    if (!previous) return
    let current = true
    void api.draft(previous.id).then(data => {
      if (!current) return
      const hash = data.txHash ?? (data.errorCode && definitive.has(data.errorCode) ? null : previous.txHash)
      setDraft(data)
      setTxHash(hash)
      saveDraft(storeKey, data.certificateId, hash)
    }).catch((fault: unknown) => {
      if (current && !(fault instanceof ApiError && fault.status === 404)) setError(message(fault))
    }).finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [previous, storeKey])

  function change(field: keyof DraftFields, value: string) {
    setFields(current => ({ ...current, [field]: value }))
  }

  function choose(data: Draft, hash = data.txHash) {
    setDraft(data)
    setReadyHash(null)
    setTxHash(hash)
    saveDraft(storeKey, data.certificateId, hash)
  }

  function remember(data: Draft, hash: string | null) {
    setTxHash(hash)
    saveDraft(storeKey, data.certificateId, hash)
  }

  function fail(fault: unknown) {
    setError(message(fault))
    if (fault instanceof ApiError && fault.status === 401) void portal.refreshSession()
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setTx(null)
    setBusy(true)
    try {
      const file = mode === 'upload' ? source : null
      if (mode === 'upload' && !file) throw new ApiError(400, 'FILE_REQUIRED')
      if (file) await validatePdf(file, config.maxPdfBytes)
      const studentName = fields.studentName.trim()
      const courseName = fields.courseName.trim()
      if (!studentName || !courseName) throw new Error('Nhập tên sinh viên và tên khóa học.')
      const data = await api.createDraft({
        studentName, courseName, studentWallet: walletAddress(fields.studentWallet),
        issuerName: fields.issuerName?.trim() || 'Demo University', issuedDate: fields.issuedDate || undefined,
      }, file, session.csrfToken)
      choose(data)
    } catch (fault) { fail(fault) }
    finally { setBusy(false) }
  }

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = certificateId(recoverId)
    if (!id) { setError('Nhập mã bản nháp gồm 0x và 64 ký tự hex.'); return }
    setBusy(true)
    setError('')
    setTx(null)
    try {
      const data = await api.draft(id)
      const saved = storedDraft(storeKey + ':' + id)
      const savedHash = data.errorCode && definitive.has(data.errorCode) ? null : saved?.id === id ? saved.txHash : null
      choose(data, data.txHash ?? savedHash)
      setRecoverOpen(false)
    } catch (fault) { fail(fault) }
    finally { setBusy(false) }
  }

  async function reconcile(data: Draft, hash: string) {
    try {
      const result = await api.finalize(data.certificateId, hash, session.csrfToken)
      setDraft({ ...data, ...result })
      remember(data, result.txHash ?? hash)
      setTx(result.syncState === 'PENDING_CHAIN'
        ? { status: 'pending', hash, detail: 'Có thể thử đối soát lại với cùng mã giao dịch.' }
        : { status: 'confirmed', hash, detail: 'Backend đã đối soát giao dịch phát hành.' })
    } catch (fault) {
      if (fault instanceof ApiError && definitive.has(fault.code)) {
        remember(data, null)
        setDraft({ ...data, syncState: 'FAILED', txHash: null, errorCode: fault.code })
      }
      setTx({ status: 'error', hash, detail: message(fault) })
      if (fault instanceof ApiError && fault.status === 401) void portal.refreshSession()
    }
  }

  async function sign() {
    if (!draft || readyHash !== draft.fileHash.toLowerCase() || txHash || !session.roles.issuer) return
    const data = draft
    let sent: string | undefined
    setBusy(true)
    setError('')
    setTx({ status: 'signing' })
    try {
      if (data.chainId !== config.chainId || !sameAddress(data.contractAddress, config.contractAddress) || !sameAddress(data.issuerWallet, session.wallet)) {
        throw new Error('Bản nháp không thuộc ví, mạng hoặc hợp đồng đang sử dụng.')
      }
      const contract = await walletContract(config, session.wallet)
      const chainRecord = await contract.getFunction('getCertificate')(data.certificateId)
      if (chainRecord.exists) throw new Error('Chứng chỉ đã có trên blockchain. Hãy đối soát bằng mã giao dịch đã cấp.')
      const transaction = await contract.getFunction('issueCertificate')(data.certificateId, data.fileHash, data.studentWallet)
      const track = (hash: string) => {
        sent = hash
        remember(data, hash)
        setTx({ status: 'pending', hash })
      }
      track(transaction.hash)
      const confirmed = await confirmTransaction(transaction, track)
      await reconcile(data, confirmed)
    } catch (fault) {
      if (isError(fault, 'TRANSACTION_REPLACED') && fault.cancelled) remember(data, null)
      setTx({ status: 'error', hash: sent, detail: message(fault) })
    } finally { setBusy(false) }
  }

  async function retry(hash: string) {
    const clean = hash.trim().toLowerCase()
    if (!draft || !/^0x[0-9a-f]{64}$/.test(clean) || !certificateId(clean)) { setError('Nhập mã giao dịch hợp lệ để đối soát.'); return }
    setBusy(true)
    setError('')
    remember(draft, clean)
    setTx({ status: 'pending', hash: clean, detail: 'Đang đối soát với backend…' })
    try { await reconcile(draft, clean) }
    finally { setBusy(false) }
  }

  return <>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="workspace-grid">
      <section className="panel section-stack">
        <PanelHeading title="Thông tin chứng chỉ" description="Nhập dữ liệu sẽ hiển thị trong PDF và địa chỉ ví người nhận." />
        {session.roles.issuer ? <>
          <div className="segmented" role="group" aria-label="Nguồn tệp PDF">
            <button type="button" aria-pressed={mode === 'generate'} disabled={busy} onClick={() => setMode('generate')}><FilePlus2 size={17} /> Tạo từ mẫu</button>
            <button type="button" aria-pressed={mode === 'upload'} disabled={busy} onClick={() => setMode('upload')}><FileUp size={17} /> Tải PDF có sẵn</button>
          </div>
          <form className="form-stack" onSubmit={create}>
            <label className="field">Tên sinh viên<input required maxLength={120} autoComplete="off" value={fields.studentName} onChange={event => change('studentName', event.target.value)} placeholder="Nguyễn Văn A" /></label>
            <label className="field">Ví sinh viên<input className="mono" required autoComplete="off" spellCheck={false} value={fields.studentWallet} onChange={event => change('studentWallet', event.target.value)} placeholder="0x…" /></label>
            <label className="field">Khóa học<input required maxLength={200} value={fields.courseName} onChange={event => change('courseName', event.target.value)} placeholder="Blockchain Fundamentals" /></label>
            <div className="form-grid">
              <label className="field">Đơn vị cấp<input maxLength={120} value={fields.issuerName} onChange={event => change('issuerName', event.target.value)} /></label>
              <label className="field">Ngày cấp trên PDF<input type="date" value={fields.issuedDate} onChange={event => change('issuedDate', event.target.value)} /></label>
            </div>
            {mode === 'upload' && <label className="upload-box"><FileUp size={22} /><span><strong>{source?.name ?? 'Chọn tệp PDF'}</strong><small>Tối đa {config.maxPdfBytes / 1048576} MiB</small></span>
              <input type="file" required accept=".pdf,application/pdf" aria-label="PDF nguồn" onChange={event => setSource(event.target.files?.[0] ?? null)} />
            </label>}
            <button type="submit" className="button primary" disabled={busy || Boolean(txHash && !final)}><FileText size={18} />{busy && !draft ? 'Đang tạo bản nháp…' : 'Tạo bản nháp'}</button>
          </form>
        </> : <Notice tone="warning">Ví hiện tại chưa có quyền tạo bản nháp. Bạn vẫn có thể đối soát giao dịch đã ký.</Notice>}
        <button type="button" className="button secondary small" aria-expanded={recoverOpen} onClick={() => setRecoverOpen(!recoverOpen)}><RotateCcw size={16} /> Khôi phục bản nháp</button>
        {recoverOpen && <form className="form-stack recovery" onSubmit={recover}>
          <label className="field">Mã bản nháp<input className="mono" required value={recoverId} onChange={event => setRecoverId(event.target.value)} placeholder="0x…" /></label>
          <button className="button secondary small" type="submit" disabled={busy}>Mở bản nháp</button>
        </form>}
      </section>
      <section className="panel section-stack">
        <PanelHeading title="Xem trước và ký" description="Kiểm tra đúng tệp đã chèn QR trước khi gửi giao dịch." />
        {!draft ? busy ? <Busy /> : <Empty icon={FileText} title="Chưa có bản nháp" detail="Tạo hoặc mở bản nháp để xem trước PDF." /> : <>
          <div className="draft-meta"><strong>{draft.courseName}</strong><CopyValue value={draft.certificateId} label="Sao chép mã chứng chỉ" compact /></div>
          <DraftPreview key={draft.certificateId} draft={draft} maxBytes={config.maxPdfBytes} onHash={setReadyHash} />
          <TransactionNotice tx={tx} />
          {draft.errorCode && !tx && <Notice tone="warning">{message(new ApiError(409, draft.errorCode))}</Notice>}
          {final ? <div className="section-stack">
            <div className="button-row"><Pill tone={draft.syncState === 'ISSUED' ? 'success' : 'error'}><CheckCircle2 size={15} />{draft.syncState === 'ISSUED' ? 'Đã phát hành' : 'Đã thu hồi'}</Pill>
              <Link className="button primary small" to={'/verify/' + draft.certificateId}><Link2 size={16} /> Mở trang xác minh</Link>
              <CopyValue value={draft.verifyUrl} label="Sao chép liên kết" /></div>
            <VerifyQr url={draft.verifyUrl} />
          </div> : txHash ? <div className="button-row">
            <button className="button primary" type="button" disabled={busy} onClick={() => void retry(txHash)}><RotateCcw size={17} /> Đối soát giao dịch</button>
            <CopyValue value={txHash} label="Sao chép mã giao dịch" compact />
          </div> : <>
            <button className="button primary" type="button" disabled={busy || !readyHash || !session.roles.issuer} onClick={() => void sign()}><ShieldCheck size={19} /> Ký phát hành</button>
            <details className="reconcile-details"><summary>Đã có mã giao dịch?</summary>
              <form className="form-stack" onSubmit={event => {
                event.preventDefault()
                const hash = new FormData(event.currentTarget).get('hash')
                if (typeof hash === 'string') void retry(hash.trim())
              }}>
                <label className="field">Mã giao dịch<input className="mono" name="hash" required placeholder="0x…" /></label>
                <button type="submit" className="button secondary small" disabled={busy}>Đối soát giao dịch</button>
              </form>
            </details>
          </>}
        </>}
      </section>
    </div>
  </>
}

export function IssuePage() {
  const { config, session } = usePortal()
  return <div className="page-stack">
    <PageHeading title="Phát hành chứng chỉ" description="Tạo PDF, đối chiếu mã băm và ký giao dịch phát hành bằng MetaMask." />
    <WalletGate>{config && session && <IssueForm key={config.contractAddress + ':' + session.wallet} config={config} session={session} />}</WalletGate>
  </div>
}
