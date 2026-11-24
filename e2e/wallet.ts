import type { BrowserContext, Page } from '@playwright/test';
import { urls } from './stack.js';

// A scripted EIP-1193 wallet standing in for MetaMask. Signing and transactions
// are forwarded to the Hardhat node, which holds the unlocked development
// accounts, so the app runs its real ethers BrowserProvider code paths.
// Tests can switch account/chain or make the next request fail with 4001.

export interface WalletOptions { account: string; chainId?: number; connected?: boolean }

export async function installWallet(context: BrowserContext, options: WalletOptions) {
  await context.exposeBinding('__educertWalletRpc', async (_source, method: string, params: unknown[]) => {
    const response = await fetch(urls.rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
    const body = await response.json();
    return body.error ? { error: { code: body.error.code ?? -32603, message: body.error.message, data: body.error.data } } : { result: body.result };
  });
  await context.addInitScript(({ account, chainId, connected }) => {
    type Listener = (value: unknown) => void;
    const stored = (key: string) => { try { return localStorage.getItem('__e2e_wallet_' + key); } catch { return null; } };
    const store = (key: string, value: string) => { try { localStorage.setItem('__e2e_wallet_' + key, value); } catch { /* opaque origin */ } };
    const realChainId = '0x7a69';
    const state = {
      account: stored('account') ?? account,
      chainId: stored('chainId') ?? '0x' + chainId.toString(16),
      connected: (stored('connected') ?? String(connected)) === 'true',
      reject: new Set<string>(),
    };
    const listeners = new Map<string, Set<Listener>>();
    const emit = (event: string, value: unknown) => listeners.get(event)?.forEach(listener => listener(value));
    const fail = (code: number, message: string) => Object.assign(new Error(message), { code });
    const rpc = (window as unknown as { __educertWalletRpc: (method: string, params: unknown[]) => Promise<{ result?: unknown; error?: { code: number; message: string; data?: unknown } }> }).__educertWalletRpc;

    const ethereum = {
      isMetaMask: true,
      async request({ method, params = [] }: { method: string; params?: unknown[] }) {
        if (state.reject.has(method)) { state.reject.delete(method); throw fail(4001, 'MetaMask Tx Signature: User denied transaction signature.'); }
        switch (method) {
          case 'eth_requestAccounts':
            state.connected = true; store('connected', 'true');
            return [state.account];
          case 'eth_accounts': return state.connected ? [state.account] : [];
          case 'eth_chainId': return state.chainId;
          case 'net_version': return String(parseInt(state.chainId, 16));
          case 'wallet_addEthereumChain': return null;
          case 'wallet_switchEthereumChain': {
            const requested = String((params[0] as { chainId: string }).chainId).toLowerCase();
            if (requested !== realChainId) throw fail(4902, 'Unrecognized chain ID');
            state.chainId = realChainId; store('chainId', realChainId);
            emit('chainChanged', realChainId);
            return null;
          }
        }
        if ((method === 'personal_sign' || method === 'eth_sendTransaction') && !state.connected) throw fail(4100, 'Unauthorized');
        const reply = await rpc(method, params);
        if (reply.error) throw Object.assign(new Error(reply.error.message), reply.error);
        return reply.result;
      },
      on(event: string, listener: Listener) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
      },
      removeListener(event: string, listener: Listener) { listeners.get(event)?.delete(listener); },
    };
    Object.assign(window, {
      ethereum,
      __educertWallet: {
        setAccount(next: string) { state.account = next; store('account', next); emit('accountsChanged', [next]); },
        setChain(next: string) { state.chainId = next; store('chainId', next); emit('chainChanged', next); },
        rejectNext(method: string) { state.reject.add(method); },
      },
    });
  }, { account: options.account, chainId: options.chainId ?? 31337, connected: options.connected ?? false });
}

export const wallet = {
  rejectNext: (page: Page, method: 'personal_sign' | 'eth_sendTransaction' | 'eth_requestAccounts') =>
    page.evaluate(name => (window as any).__educertWallet.rejectNext(name), method),
  setAccount: (page: Page, account: string) => page.evaluate(next => (window as any).__educertWallet.setAccount(next), account),
};
