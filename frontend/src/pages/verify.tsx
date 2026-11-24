import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { BadgeCheck, FileCheck2, FileDown, FileUp, Fingerprint, Printer, QrCode, ScanLine, Search, ShieldCheck } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { QrScanner, VerifyQr } from '../components/qr'
import { Busy, CopyValue, Empty, Notice, PageHeading, PanelHeading, Pill, ResourceError } from '../components/ui'
import { api } from '../lib/api'
import type { BackendConfig } from '../lib/api'
import { certificateId, pdfHash, readCertificate, reasonLabel, validatePdf } from '../lib/chain'
import type { ChainCertificate } from '../lib/chain'
import { usePortal } from '../lib/portal'
import { dateTime, message, useResource } from '../lib/ui'

interface Comparison { certificate: ChainCertificate; hash: string; checkedAt: string; name: string }

function VerifyDetails({ id, config }: { id: string; config: BackendConfig }) {
  const lookup = useCallback(async () => ({ certificate: await readCertificate(config, id), checkedAt: new Date().toISOString() }), [config, id])
  const result = useResource(lookup)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [checking, setChecking] = useState(false)
  const [fault, setFault] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportFault, setReportFault] = useState('')
  const cert = comparison?.certificate ?? result.data?.certificate
  const checkedAt = comparison?.checkedAt ?? result.data?.checkedAt
  const matches = comparison && comparison.hash === cert?.fileHash

  async function compare(file?: File) {
    if (!file) return
    setComparison(null)
    setChecking(true)
    setFault('')
    try {
      await validatePdf(file, config.maxPdfBytes)
      const [hash, record] = await Promise.all([pdfHash(file), readCertificate(config, id)])
      if (!record) { result.retry(); return }
      setComparison({ hash, certificate: record, checkedAt: new Date().toISOString(), name: file.name })
    } catch (error) { setFault(message(error)) }
    finally { setChecking(false) }
  }

  // The backend re-reads the chain when rendering; only the browser-computed hash is sent, never the PDF.
  async function downloadReport() {
    setReporting(true)
    setReportFault('')
    try {
      const blob = await api.report(id, comparison?.hash)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'educert-bien-ban-' + id.slice(2, 10) + '.pdf'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setReportFault(message(error)) }
    finally { setReporting(false) }
  }

  if (result.loading) return <section className="panel"><Busy>Đang đọc blockchain…</Busy></section>
  if (result.error) return <section className="panel" data-status="RPC_ERROR"><ResourceError error={result.error} retry={result.retry} /></section>
  if (!cert) return <section className="panel" data-status="NOT_FOUND"><Empty title="Không tìm thấy chứng chỉ" detail="Blockchain không có bản ghi tương ứng với mã này." action={<button type="button" className="button secondary" onClick={result.retry}>Tra cứu lại</button>} /></section>

  return <div className="workspace-grid verification-grid">
    <section className="panel section-stack" data-status={cert.revoked ? 'REVOKED' : 'REGISTERED_ACTIVE'}>
      <PanelHeading title="Bản ghi blockchain" action={<Pill tone={cert.revoked ? 'error' : 'success'}>{cert.revoked ? 'Đã thu hồi' : 'Đã đăng ký'}</Pill>} />
      {cert.revoked
        ? <Notice tone="error"><strong>Chứng chỉ đã bị thu hồi.</strong><p>{reasonLabel(cert.revokeReasonCode)} · {dateTime(cert.revokedAt)}</p></Notice>
        : <Notice tone="success">Bản ghi đã đăng ký và đang hiệu lực.</Notice>}
      <dl className="facts">
        <div><dt>Mã chứng chỉ</dt><dd><CopyValue value={cert.id} label="Sao chép mã chứng chỉ" compact /></dd></div>
        <div><dt>Ví phát hành</dt><dd><CopyValue value={cert.issuer} label="Sao chép ví phát hành" compact /></dd></div>
        <div><dt>Ví người nhận</dt><dd><CopyValue value={cert.student} label="Sao chép ví người nhận" compact /></dd></div>
        <div><dt>Thời gian cấp</dt><dd>{dateTime(cert.issuedAt)}</dd></div>
        <div><dt>SHA-256 tham chiếu</dt><dd><CopyValue value={cert.fileHash} label="Sao chép SHA-256 tham chiếu" compact /></dd></div>
      </dl>
      <div className="button-row">
        <CopyValue value={config.publicAppUrl + '/verify/' + id} label="Sao chép liên kết" />
        <button type="button" className="button secondary small" disabled={checking} onClick={() => { setComparison(null); setFault(''); result.retry() }}>Tra cứu lại</button>
      </div>
      <VerifyQr url={config.publicAppUrl + '/verify/' + id} />
    </section>
    <section className="panel section-stack">
      <PanelHeading title="Đối chiếu PDF" description="Chọn tệp để tính SHA-256 ngay trong trình duyệt." />
      <label className={'upload-box' + (checking ? ' disabled' : '')}><FileUp size={23} /><span><strong>Chọn PDF cần đối chiếu</strong><small>{comparison?.name || 'Tệp tối đa ' + config.maxPdfBytes / 1048576 + ' MiB'}</small></span>
        <input type="file" accept=".pdf,application/pdf" aria-label="PDF cần đối chiếu" disabled={checking} onChange={event => {
          void compare(event.target.files?.[0])
          event.currentTarget.value = ''
        }} />
      </label>
      {checking ? <Busy>Đang tính SHA-256…</Busy> : fault ? <Notice tone="error">{fault}</Notice> : comparison ? <>
        <Notice tone={matches ? 'success' : 'error'}>
          <strong>{matches ? 'Mã băm trùng khớp.' : 'Mã băm PDF không khớp.'}</strong>
          <p>{matches ? 'Tệp có cùng mã băm với bản ghi blockchain.' : 'Tệp đã chọn khác với bản PDF được dùng khi phát hành.'}</p>
        </Notice>
        <dl className="facts"><div><dt>SHA-256 của tệp</dt><dd><CopyValue value={comparison.hash} label="Sao chép SHA-256 của tệp" compact /></dd></div></dl>
      </> : <Notice><strong>Chưa đối chiếu tệp PDF.</strong><p>Tra cứu ID xác nhận trạng thái bản ghi. Hãy chọn PDF để kiểm tra tệp.</p></Notice>}
      <div className="button-row">
        <button type="button" className="button primary small" onClick={() => void downloadReport()} disabled={checking || reporting}><FileDown size={17} />{reporting ? 'Đang tạo biên bản…' : 'Tải biên bản PDF'}</button>
        <button type="button" className="button secondary small" onClick={() => window.print()} disabled={checking}><Printer size={17} /> In trang</button>
      </div>
      {reportFault && <Notice tone="error">{reportFault}</Notice>}
    </section>
    <article className="print-report">
      <p>EduCert</p><h1>Biên bản xác minh chứng chỉ</h1>
      <dl>
        <dt>Mã chứng chỉ</dt><dd>{cert.id}</dd>
        <dt>Chain ID</dt><dd>{config.chainId}</dd>
        <dt>Địa chỉ hợp đồng</dt><dd>{config.contractAddress}</dd>
        <dt>Ví phát hành</dt><dd>{cert.issuer}</dd>
        <dt>SHA-256 tham chiếu</dt><dd>{cert.fileHash}</dd>
        <dt>Trạng thái</dt><dd>{cert.revoked ? 'Đã thu hồi · ' + reasonLabel(cert.revokeReasonCode) : 'Đã đăng ký, đang hiệu lực'}</dd>
        <dt>Kết quả đối chiếu</dt><dd>{comparison ? matches ? 'SHA-256 của PDF trùng khớp' : 'SHA-256 của PDF không khớp' : 'Chưa đối chiếu tệp PDF'}</dd>
        {comparison && <><dt>SHA-256 của tệp</dt><dd>{comparison.hash}</dd></>}
        <dt>Thời điểm đọc (UTC)</dt><dd>{checkedAt}</dd>
      </dl>
      <p>Đây là biên bản kỹ thuật tại thời điểm xác minh, không thay thế xác nhận pháp lý của cơ sở giáo dục.</p>
    </article>
  </div>
}

function VerifyLookup({ routeId }: { routeId?: string }) {
  const portal = usePortal()
  const navigate = useNavigate()
  const id = routeId ? certificateId(routeId) : null
  const [value, setValue] = useState(routeId ?? '')
  const [fault, setFault] = useState(routeId && !id ? 'Mã chứng chỉ trong liên kết không hợp lệ.' : '')
  const [scan, setScan] = useState(false)
  const [revision, setRevision] = useState(0)
  const choose = useCallback((selected: string) => {
    setFault('')
    setScan(false)
    setValue(selected)
    if (id === selected) setRevision(count => count + 1)
    else void navigate('/verify/' + selected)
  }, [id, navigate])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = certificateId(value)
    if (parsed) choose(parsed)
    else setFault('Nhập mã hợp lệ gồm 0x và 64 ký tự hex hoặc dán liên kết xác minh.')
  }

  return <div className="page-stack">
    <PageHeading title="Xác minh chứng chỉ" description="Tra cứu công khai bằng mã chứng chỉ hoặc QR, không cần kết nối ví." />
    <section className="panel lookup-panel">
      <div className="lookup-header"><span className="tile mint"><ScanLine size={25} /></span><PanelHeading title="Tra cứu bản ghi" description="Dán mã chứng chỉ hoặc liên kết xác minh." /></div>
      <form className="form-stack" onSubmit={submit}>
        <label className="field">Mã chứng chỉ hoặc liên kết
          <div className="input-with-icon"><Fingerprint size={18} /><input className="mono" value={value} spellCheck={false} autoComplete="off" onChange={event => { setValue(event.target.value); setFault('') }} placeholder="0x… hoặc liên kết /verify/…" required /></div>
        </label>
        <div className="button-row">
          <button type="submit" className="button primary"><Search size={18} /> Tra cứu</button>
          <button type="button" className="button secondary" aria-expanded={scan} onClick={() => setScan(!scan)}><QrCode size={18} /> Quét QR</button>
        </div>
      </form>
      {fault && <Notice tone="error">{fault}</Notice>}
      {scan && <QrScanner onCode={choose} close={() => setScan(false)} />}
    </section>
    {id ? portal.configLoading ? <Busy /> : portal.config ? <VerifyDetails key={id + ':' + revision} id={id} config={portal.config} />
      : <ResourceError error={portal.configError} retry={portal.reloadConfig} /> : !fault && <div className="verify-hints">
      <div><FileCheck2 size={22} /><span><strong>Đọc bản ghi công khai</strong><small>Kiểm tra trạng thái cấp hoặc thu hồi theo mã chứng chỉ.</small></span></div>
      <div><ShieldCheck size={22} /><span><strong>Kiểm tra toàn vẹn</strong><small>PDF được băm tại thiết bị của bạn.</small></span></div>
      <div><BadgeCheck size={22} /><span><strong>Ghi nhận kết quả</strong><small>Tải biên bản PDF đọc trực tiếp từ blockchain.</small></span></div>
    </div>}
  </div>
}

export function VerifyPage() {
  const { id } = useParams()
  return <VerifyLookup key={id ?? ''} routeId={id} />
}
