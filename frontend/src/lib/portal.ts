import { createContext, useContext } from 'react'
import type { BackendConfig, Session } from './api'

interface PortalState {
  config: BackendConfig | null
  configError: string
  configLoading: boolean
  reloadConfig: () => void
  address: string | null
  chainId: number | null
  wrongNetwork: boolean
  session: Session | null
  restoring: boolean
  working: boolean
  walletError: string
  connect: () => Promise<void>
  signIn: () => Promise<void>
  switchNetwork: () => Promise<void>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

export const Portal = createContext<PortalState | null>(null)

export function usePortal() {
  const portal = useContext(Portal)
  if (!portal) throw new Error('Missing EduCert portal')
  return portal
}
