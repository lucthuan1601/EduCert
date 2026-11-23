import { useEffect, useState } from 'react'
import {
  BadgeCheck, ChevronDown, CircleMinus, FilePlus2, GraduationCap, History, House, LayoutDashboard,
  LogOut, Menu, Network, ScanLine, ShieldCheck, ShieldUser, Wallet, X,
} from 'lucide-react'
import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { CopyValue, Empty, Notice, Pill } from './components/ui'
import { PortalProvider } from './lib/PortalProvider'
import { usePortal } from './lib/portal'
import { short } from './lib/ui'
import { DashboardPage, HistoryPage, HomePage, StudentPage } from './pages/overview'
import { IssuePage } from './pages/issue'
import { VerifyPage } from './pages/verify'
import { AdminPage, RevokePage } from './pages/manage'
import './App.css'

const sections = [
  { label: 'KHÔNG GIAN LÀM VIỆC', links: [
    { path: '/', label: 'Tổng quan', icon: House },
    { path: '/verify', label: 'Xác minh', icon: ScanLine },
    { path: '/issue', label: 'Phát hành', icon: FilePlus2 },
    { path: '/student', label: 'Cổng sinh viên', icon: GraduationCap },
  ] },
  { label: 'QUẢN LÝ', links: [
    { path: '/dashboard', label: 'Thống kê', icon: LayoutDashboard },
    { path: '/history', label: 'Lịch sử', icon: History },
    { path: '/revoke', label: 'Thu hồi', icon: CircleMinus },
    { path: '/admin', label: 'Phân quyền', icon: ShieldUser },
  ] },
]

function WalletMenu() {
  const portal = usePortal()
  const [open, setOpen] = useState(false)
  const busy = portal.working
  return (
    <div className="wallet-menu" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button className={'button wallet-button ' + (portal.address ? 'secondary' : 'primary')} type="button"
        aria-expanded={open} aria-controls="wallet-panel" onClick={() => {
          setOpen(!open)
          if (!open && !portal.address && !busy) void portal.connect()
        }}>
        <Wallet size={17} />
        {portal.address ? short(portal.address, 6, 4) : busy ? 'Đang kết nối…' : 'Kết nối ví'}
        {portal.address && <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="wallet-panel panel" id="wallet-panel">
          <h2>Ví EduCert</h2>
          {portal.address ? <>
            <CopyValue value={portal.address} label="Sao chép địa chỉ ví" compact />
            <div className="wallet-details">
              <span>Mạng ví</span><strong>{portal.chainId ?? '—'}</strong>
              <span>Phiên EduCert</span><strong>{portal.session ? 'Đã đăng nhập' : 'Chưa đăng nhập'}</strong>
            </div>
            {portal.session && <div className="button-row">
              {portal.session.roles.admin && <Pill tone="success">Quản trị</Pill>}
              {portal.session.roles.issuer && <Pill tone="success">Phát hành</Pill>}
            </div>}
            {portal.wrongNetwork && <button className="button secondary" disabled={busy} onClick={portal.switchNetwork}>Chuyển mạng</button>}
            {portal.session ? <button className="button secondary" disabled={busy} onClick={portal.signOut}><LogOut size={16} /> Đăng xuất</button>
              : !portal.wrongNetwork && <button className="button primary" disabled={busy || !portal.config || portal.restoring} onClick={portal.signIn}>Ký đăng nhập</button>}
          </> : <button className="button primary" disabled={busy} onClick={portal.connect}>{busy ? 'Đang chờ ví…' : 'Kết nối MetaMask'}</button>}
          {portal.walletError && <Notice tone="error">{portal.walletError}</Notice>}
        </div>
      )}
    </div>
  )
}

function Shell() {
  const { pathname } = useLocation()
  const [drawerPath, setDrawerPath] = useState<string | null>(null)
  const menuOpen = drawerPath === pathname
  const closeMenu = () => setDrawerPath(null)
  const portal = usePortal()
  const path = '/' + (pathname.split('/')[1] ?? '')
  const label = sections.flatMap(section => section.links).find(link => link.path === path)?.label ?? 'Trang không tồn tại'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerPath(null) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  return (
    <div className="portal-shell">
      <a className="skip-link" href="#main">Đến nội dung</a>
      {menuOpen && <button className="nav-backdrop" aria-label="Đóng điều hướng" onClick={closeMenu} />}
      <aside className={'sidebar' + (menuOpen ? ' is-open' : '')} id="portal-nav">
        <div className="brand-row">
          <Link className="brand" to="/" onClick={closeMenu}>
            <span className="brand-mark"><ShieldCheck size={22} /></span>
            <span>EduCert<small>Cổng chứng chỉ số</small></span>
          </Link>
          <button type="button" className="icon-button nav-close" aria-label="Đóng điều hướng" onClick={closeMenu}><X size={21} /></button>
        </div>
        <nav aria-label="Điều hướng chính">
          {sections.map(section => <div className="nav-section" key={section.label}>
            <span className="nav-caption">{section.label}</span>
            {section.links.map(({ path, label, icon: Icon }) => (
              <NavLink className="nav-link" key={path} to={path} end={path === '/'} onClick={closeMenu}>
                <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
              </NavLink>
            ))}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-network-icon"><Network size={18} /></span>
          <span><strong>{portal.config?.chainId === 31337 ? 'Hardhat Local' : 'Mạng EduCert'}</strong>
            <small>{portal.config ? 'Chain ID ' + portal.config.chainId : 'Chưa tải cấu hình'}</small></span>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-path">
            <button className="icon-button nav-toggle" type="button" aria-label="Mở điều hướng" aria-expanded={menuOpen} aria-controls="portal-nav" onClick={() => setDrawerPath(menuOpen ? null : pathname)}><Menu size={22} /></button>
            <span>EduCert</span><span className="crumb-divider">/</span><strong>{label}</strong>
          </div>
          <div className="button-row topbar-actions">
            {portal.config && <span className={'network-tag' + (portal.wrongNetwork ? ' warning' : '')} title={'Hợp đồng ' + portal.config.contractAddress}>
              <i />{portal.wrongNetwork ? 'Ví sai mạng' : portal.config.chainId === 31337 ? 'Hardhat Local' : 'Chain ' + portal.config.chainId}
            </span>}
            <WalletMenu />
          </div>
        </header>
        <main className="main-content" id="main" tabIndex={-1}><Outlet /></main>
        <footer className="portal-footer"><BadgeCheck size={16} /><span>EduCert · Nhóm 11</span></footer>
      </div>
    </div>
  )
}

function MissingPage() {
  return <section className="panel"><Empty title="Trang không tồn tại" action={<Link className="button primary" to="/">Về tổng quan</Link>} /></section>
}

export default function App() {
  return (
    <PortalProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="/verify/:id?" element={<VerifyPage />} />
          <Route path="/issue" element={<IssuePage />} />
          <Route path="/student" element={<StudentPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/revoke" element={<RevokePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<MissingPage />} />
        </Route>
      </Routes>
    </PortalProvider>
  )
}
