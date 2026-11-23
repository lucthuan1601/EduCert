import { useCallback, useState } from 'react'
import { BadgeCheck, Ban, ChartNoAxesCombined, CircleCheck, Clock3, Download, FilePlus2, Files, Hash, History, ScanLine, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { Busy, CopyValue, Empty, Notice, PageHeading, Pagination, PanelHeading, Pill, ResourceError, WalletGate } from '../components/ui'
import { api, ApiError } from '../lib/api'
import type { ChainEvent, EventType, Stats } from '../lib/api'
import { usePortal } from '../lib/portal'
import { dateTime, message, number, short, useResource } from '../lib/ui'

function StatsCards({ stats }: { stats: Stats | null }) {
  const cards = [
    { label: 'Tổng đã cấp', value: stats?.issued, icon: Files, style: 'mint' },
    { label: 'Đang hiệu lực', value: stats?.active, icon: CircleCheck, style: 'leaf' },
    { label: 'Đã thu hồi', value: stats?.revoked, icon: Ban, style: 'sand' },
  ]
  return <div className="stat-grid">{cards.map(({ label, value, icon: Icon, style }) => (
    <article className="stat-card" key={label}>
      <span className={'tile ' + style}><Icon size={22} strokeWidth={1.9} /></span>
      <div><p>{label}</p><strong>{value === undefined ? '—' : number(value)}</strong></div>
    </article>
  ))}</div>
}

function CertificateArt() {
  return <div className="certificate-art" aria-hidden="true">
    <div className="art-grid" />
    <div className="art-orbit art-orbit-one" /><div className="art-orbit art-orbit-two" />
    <div className="specimen-back" />
    <div className="specimen">
      <div className="specimen-top"><span><GraduationMark /> EduCert</span><span className="specimen-label">MẪU</span></div>
      <div className="specimen-title">CHỨNG CHỈ<br />ĐIỆN TỬ</div>
      <div className="specimen-rule" /><div className="specimen-lines"><i /><i /></div>
      <div className="specimen-seal"><BadgeCheck size={40} strokeWidth={1.15} /></div>
    </div>
    <div className="art-chip"><ShieldCheck size={20} /><span>SHA-256</span></div>
  </div>
}

function GraduationMark() {
  return <span className="specimen-mark"><ShieldCheck size={15} /></span>
}

function EventsTable({ items, compact = false }: { items: ChainEvent[]; compact?: boolean }) {
  if (!items.length) return <Empty icon={History} title="Chưa có sự kiện" detail="Các giao dịch phát hành và thu hồi sẽ xuất hiện tại đây." />
  return <div className="table-scroll">
    <table className={compact ? 'events-compact' : undefined}>
      <thead><tr><th>Sự kiện</th><th>Mã chứng chỉ</th>{!compact && <th>Mã giao dịch</th>}<th>Khối</th><th>Thời gian</th></tr></thead>
      <tbody>{items.map(event => (
        <tr key={event.txHash + ':' + event.logIndex}>
          <td><Pill tone={event.type === 'ISSUED' ? 'success' : 'error'}>{event.type === 'ISSUED' ? 'Phát hành' : 'Thu hồi'}</Pill></td>
          <td><Link className="mono-link" title={event.certificateId} to={'/verify/' + event.certificateId}>{compact ? short(event.certificateId, 8, 4) : short(event.certificateId)}</Link></td>
          {!compact && <td><CopyValue value={event.txHash} label="Sao chép mã giao dịch" compact /></td>}
          <td className="muted">{number(event.blockNumber)}</td>
          <td className="muted">{dateTime(event.issuedAt ?? event.revokedAt)}</td>
        </tr>
      ))}</tbody>
    </table>
  </div>
}

const recentEvents = () => api.events({ offset: 0, limit: 5 })

export function HomePage() {
  const stats = useResource(api.stats)
  const recent = useResource(recentEvents)
  return <div className="page-stack">
    <section className="hero">
      <div className="hero-content">
        <h1>Chứng chỉ số.<br /><em>Xác minh tức thì.</em></h1>
        <p>Tra cứu chứng chỉ và đối chiếu tệp PDF với bản ghi trên blockchain.</p>
        <div className="button-row hero-buttons">
          <Link className="button primary" to="/verify"><ScanLine size={19} /> Xác minh chứng chỉ</Link>
          <Link className="button secondary" to="/issue"><FilePlus2 size={18} /> Phát hành</Link>
        </div>
      </div>
      <CertificateArt />
    </section>
    <section className="section-stack">
      <PanelHeading title="Tổng quan chứng chỉ" description="Số liệu từ smart contract EduCert." action={<Link className="button secondary small" to="/dashboard"><ChartNoAxesCombined size={17} /> Thống kê</Link>} />
      <StatsCards stats={stats.data} />
      {stats.error && <ResourceError error={stats.error} retry={stats.retry} />}
    </section>
    <section className="panel">
      <PanelHeading title="Hoạt động gần đây" action={<Link className="button secondary small" to="/history"><History size={16} /> Lịch sử</Link>} />
      {recent.loading ? <Busy /> : recent.error ? <ResourceError error={recent.error} retry={recent.retry} /> : <EventsTable items={recent.data?.items ?? []} compact />}
    </section>
  </div>
}

export function DashboardPage() {
  const stats = useResource(api.stats)
  const data = stats.data
  const activeShare = data?.issued ? (data.active / data.issued) * 100 : 0
  return <div className="page-stack">
    <PageHeading title="Thống kê" description="Theo dõi tổng số chứng chỉ và trạng thái trên blockchain." action={<button className="button secondary" type="button" onClick={stats.retry} disabled={stats.loading}>Làm mới</button>} />
    <StatsCards stats={data} />
    {stats.loading ? <Busy /> : stats.error ? <ResourceError error={stats.error} retry={stats.retry} /> : data && <div className="dashboard-grid">
      <section className="panel">
        <PanelHeading title="Tỷ lệ hiệu lực" />
        {data.issued ? <>
          <strong className="percentage">{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(activeShare)}%</strong>
          <div className="progress" role="progressbar" aria-label="Tỷ lệ chứng chỉ đang hiệu lực" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(activeShare)}>
            <span style={{ width: activeShare + '%' }} />
          </div>
          <div className="legend"><span><i />{number(data.active)} đang hiệu lực</span><span><i />{number(data.revoked)} đã thu hồi</span></div>
        </> : <Empty icon={Files} title="Chưa có chứng chỉ" detail="Tỷ lệ sẽ xuất hiện sau khi có chứng chỉ được phát hành." />}
      </section>
      <section className="panel">
        <PanelHeading title="Hợp đồng đang đọc" />
        <dl className="facts">
          <div><dt>Chain ID</dt><dd>{data.chainId}</dd></div>
          <div><dt>Địa chỉ hợp đồng</dt><dd><CopyValue value={data.contractAddress} label="Sao chép địa chỉ hợp đồng" compact /></dd></div>
          <div><dt>Đối soát tổng</dt><dd>{number(data.active)} + {number(data.revoked)} = {number(data.issued)}</dd></div>
        </dl>
      </section>
    </div>}
  </div>
}

export function HistoryPage() {
  const [query, setQuery] = useState<{ offset: number; limit: number; type: EventType; toBlock?: number }>({ offset: 0, limit: 10, type: 'ALL' })
  const load = useCallback(() => api.events(query), [query])
  const events = useResource(load)
  const page = events.data
  return <div className="page-stack">
    <PageHeading title="Lịch sử sự kiện" description="Xem giao dịch phát hành và thu hồi của hợp đồng EduCert." action={<button type="button" className="button secondary" onClick={() => setQuery({ ...query, offset: 0, toBlock: undefined })}>Xem khối mới nhất</button>} />
    <section className="panel">
      <div className="history-toolbar">
        <div className="segmented" role="group" aria-label="Lọc sự kiện">
          {([['ALL', 'Tất cả'], ['ISSUED', 'Phát hành'], ['REVOKED', 'Thu hồi']] as const).map(([type, label]) => (
            <button key={type} type="button" aria-pressed={query.type === type} onClick={() => setQuery({ ...query, type, offset: 0, toBlock: page?.toBlock ?? query.toBlock })}>{label}</button>
          ))}
        </div>
        {page && <span className="muted with-icon"><Hash size={17} /> Khối {number(page.fromBlock)}–{number(page.toBlock)}</span>}
      </div>
      {events.loading ? <Busy /> : events.error ? <ResourceError error={events.error} retry={events.retry} /> : page && <>
        <EventsTable items={page.items} />
        <Pagination {...page} go={offset => setQuery({ ...query, offset, toBlock: page.toBlock })} />
        {page.previousToBlock !== null && <button type="button" className="button secondary small" onClick={() => setQuery({ ...query, offset: 0, toBlock: page.previousToBlock ?? undefined })}><Clock3 size={16} /> Xem dải khối cũ hơn</button>}
      </>}
    </section>
  </div>
}

function StudentCertificates() {
  const portal = usePortal()
  const [offset, setOffset] = useState(0)
  const [activeDownload, setActiveDownload] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const load = useCallback(() => api.student(offset, 10), [offset])
  const certificates = useResource(load)
  const page = certificates.data

  async function download(id: string) {
    setActiveDownload(id)
    setDownloadError('')
    try {
      const blob = await api.download(id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'educert-' + id.slice(2) + '.pdf'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setDownloadError(message(error))
      if (error instanceof ApiError && error.status === 401) void portal.refreshSession()
    } finally { setActiveDownload('') }
  }

  return <section className="panel">
    <PanelHeading title="Chứng chỉ của tôi" action={portal.address && <CopyValue value={portal.address} label="Sao chép địa chỉ ví" compact />} />
    {downloadError && <Notice tone="error">{downloadError}</Notice>}
    {certificates.loading ? <Busy /> : certificates.error ? <ResourceError error={certificates.error} retry={() => {
      void portal.refreshSession()
      certificates.retry()
    }} /> : page && (page.items.length ? <>
      <div className="table-scroll"><table>
        <thead><tr><th>Chứng chỉ</th><th>Ngày cấp</th><th>Trạng thái</th><th>PDF</th></tr></thead>
        <tbody>{page.items.map(item => <tr key={item.certificateId}>
          <td><strong>{item.courseName}</strong><div className="table-detail"><Link className="mono-link" to={'/verify/' + item.certificateId}>{short(item.certificateId)}</Link></div></td>
          <td>{dateTime(item.issuedAt)}</td>
          <td><Pill tone={item.syncState === 'REVOKED' ? 'error' : 'success'}>{item.syncState === 'REVOKED' ? 'Đã thu hồi' : 'Đang hiệu lực'}</Pill></td>
          <td><button type="button" className="button secondary small" disabled={Boolean(activeDownload)} onClick={() => void download(item.certificateId)}><Download size={17} />{activeDownload === item.certificateId ? 'Đang tải…' : 'Tải PDF'}</button></td>
        </tr>)}</tbody>
      </table></div><Pagination {...page} go={setOffset} />
    </> : <Empty icon={BadgeCheck} title="Ví này chưa có chứng chỉ" detail="Chứng chỉ sẽ xuất hiện khi nhà phát hành hoàn tất cấp cho địa chỉ ví của bạn." />)}
  </section>
}

export function StudentPage() {
  const portal = usePortal()
  return <div className="page-stack">
    <PageHeading title="Cổng sinh viên" description="Xem và tải chứng chỉ đã cấp cho địa chỉ ví của bạn." />
    <WalletGate><StudentCertificates key={portal.address} /></WalletGate>
  </div>
}
