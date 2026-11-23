import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toQuantity } from 'ethers'
import { api, ApiError } from './api'
import type { BackendConfig, Session } from './api'
import { sameAddress, signerFor } from './chain'
import { Portal } from './portal'
import { message, useResource } from './ui'

export function PortalProvider({ children }: { children: ReactNode }) {
  const config = useResource(api.config)
  const [walletProvider, setWalletProvider] = useState(() => window.ethereum)
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [restored, setRestored] = useState<{ address: string; config: BackendConfig } | null>(null)
  const [working, setWorking] = useState(false)
  const [walletError, setWalletError] = useState('')
  const addressRef = useRef<string | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const logoutPending = useRef<Promise<unknown>>(Promise.resolve())

  function updateSession(value: Session | null) {
    sessionRef.current = value
    setSession(value)
  }

  function updateAddress(next: string | null) {
    const previous = addressRef.current
    const previousSession = sessionRef.current
    addressRef.current = next
    setAddress(next)
    if (previous && !sameAddress(previous, next)) {
      updateSession(null)
      setWalletError('')
      if (previousSession) {
        logoutPending.current = api.logout(previousSession.csrfToken).catch(() => undefined)
      }
    }
  }

  useEffect(() => {
    const handleInjected = () => setWalletProvider(window.ethereum)
    window.addEventListener('ethereum#initialized', handleInjected)
    return () => window.removeEventListener('ethereum#initialized', handleInjected)
  }, [])

  useEffect(() => {
    const ethereum = walletProvider
    if (!ethereum) return
    let alive = true
    let accountEvent = false
    let networkEvent = false
    const onAccounts = (value: unknown) => {
      accountEvent = true
      if (Array.isArray(value)) updateAddress(typeof value[0] === 'string' ? value[0] : null)
    }
    const onChain = (value: unknown) => {
      networkEvent = true
      if (typeof value === 'string') setChainId(Number(value))
    }
    const onDisconnect = () => {
      updateAddress(null)
      setChainId(null)
    }
    ethereum.on?.('accountsChanged', onAccounts)
    ethereum.on?.('chainChanged', onChain)
    ethereum.on?.('disconnect', onDisconnect)
    void ethereum.request({ method: 'eth_accounts' }).then((value: unknown) => {
      if (alive && !accountEvent) onAccounts(value)
    }).catch(() => undefined)
    void ethereum.request({ method: 'eth_chainId' }).then((value: unknown) => {
      if (alive && !networkEvent) onChain(value)
    }).catch(() => undefined)
    return () => {
      alive = false
      ethereum.removeListener?.('accountsChanged', onAccounts)
      ethereum.removeListener?.('chainChanged', onChain)
      ethereum.removeListener?.('disconnect', onDisconnect)
    }
  }, [walletProvider])

  const target = config.data
  const wrongNetwork = Boolean(address && target && chainId !== target.chainId)
  const restoring = Boolean(address && target && !wrongNetwork && (restored?.address !== address || restored.config !== target))

  useEffect(() => {
    if (!address || !target || wrongNetwork) return
    let alive = true
    void logoutPending.current.then(() => api.me()).then(value => {
      if (alive && sameAddress(value.wallet, addressRef.current)) updateSession(value)
    }).catch((error: unknown) => {
      if (alive && !(error instanceof ApiError && error.status === 401)) setWalletError(message(error))
    }).finally(() => { if (alive) setRestored({ address, config: target }) })
    return () => { alive = false }
  }, [address, target, wrongNetwork])

  useEffect(() => {
    if (!session) return
    const timeout = window.setTimeout(() => {
      if (sessionRef.current === session) updateSession(null)
    }, Math.max(0, Date.parse(session.expiresAt) - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [session])

  async function action(task: () => Promise<void>) {
    setWalletError('')
    setWorking(true)
    try { await task() }
    catch (error) { setWalletError(message(error)) }
    finally { setWorking(false) }
  }

  async function connect() {
    await action(async () => {
      const ethereum = window.ethereum
      if (!ethereum) throw new Error('Không tìm thấy MetaMask. Hãy mở trang trong trình duyệt đã cài tiện ích ví.')
      setWalletProvider(ethereum)
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      updateAddress(accounts[0] ?? null)
      setChainId(Number(await ethereum.request({ method: 'eth_chainId' })))
    })
  }

  async function signIn() {
    const current = addressRef.current
    const target = config.data
    await action(async () => {
      if (!current || !target) throw new Error('Cần kết nối ví và tải cấu hình trước khi đăng nhập.')
      await logoutPending.current
      const signer = await signerFor(target, current)
      const challenge = await api.nonce(current)
      const signature = await signer.signMessage(challenge.message)
      await signerFor(target, current)
      const authenticated = await api.verify(current, challenge.nonce, signature)
      if (!sameAddress(current, addressRef.current)) {
        await api.logout(authenticated.csrfToken).catch(() => undefined)
        throw new Error('Tài khoản ví đã thay đổi trong lúc ký.')
      }
      const fresh = await api.me()
      if (sameAddress(fresh.wallet, addressRef.current)) updateSession(fresh)
    })
  }

  async function switchNetwork() {
    const target = config.data
    await action(async () => {
      const ethereum = window.ethereum
      if (!ethereum || !target) throw new Error('Chưa có cấu hình mạng EduCert.')
      const id = toQuantity(target.chainId)
      try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: id }] })
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 4902 || target.chainId !== 31337) {
          throw error
        }
        await ethereum.request({ method: 'wallet_addEthereumChain', params: [{
          chainId: id,
          chainName: 'Hardhat Local',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [import.meta.env.VITE_WALLET_RPC_URL || 'http://127.0.0.1:8545'],
        }] })
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: id }] })
      }
      setChainId(Number(await ethereum.request({ method: 'eth_chainId' })))
    })
  }

  async function signOut() {
    await action(async () => {
      const old = sessionRef.current
      if (old) {
        try { await api.logout(old.csrfToken) }
        catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error }
      }
      updateSession(null)
    })
  }

  async function refreshSession() {
    await action(async () => {
      try {
        const fresh = await api.me()
        updateSession(sameAddress(fresh.wallet, addressRef.current) ? fresh : null)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) updateSession(null)
        throw error
      }
    })
  }

  const current = session && sameAddress(session.wallet, address) && !wrongNetwork ? session : null
  return (
    <Portal.Provider value={{
      config: config.data, configError: config.error, configLoading: config.loading, reloadConfig: config.retry,
      address, chainId, wrongNetwork, session: current, restoring, working, walletError,
      connect, signIn, switchNetwork, signOut, refreshSession,
    }}>
      {children}
    </Portal.Provider>
  )
}
