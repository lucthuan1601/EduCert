import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'

const readMethods = new Set(['eth_chainId', 'eth_getCode', 'eth_call'])

function readonlyRpc(target: string): Plugin {
  async function forward(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Content-Type', 'application/json')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.statusCode = 405
      res.end()
      return
    }
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > 16_384) {
          res.statusCode = 413
          res.end()
          return
        }
        chunks.push(buffer)
      }
      const call = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (call?.jsonrpc !== '2.0' || !readMethods.has(call.method) || !Array.isArray(call.params)) {
        res.statusCode = 400
        res.end(JSON.stringify({ jsonrpc: '2.0', id: call?.id ?? null, error: { code: -32601, message: 'Only EduCert read calls are available' } }))
        return
      }
      const upstream = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: call.id, method: call.method, params: call.params }),
        redirect: 'error',
        signal: AbortSignal.timeout(5500),
      })
      res.statusCode = upstream.status
      res.end(await upstream.text())
    } catch {
      res.statusCode = 502
      res.end(JSON.stringify({ error: 'EduCert RPC unavailable' }))
    }
  }

  const middleware = (req: IncomingMessage, res: ServerResponse) => { void forward(req, res) }
  return {
    name: 'educert-readonly-rpc',
    configureServer(server) { server.middlewares.use('/rpc', middleware) },
    configurePreviewServer(server) { server.middlewares.use('/rpc', middleware) },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'EDUCERT_')
  const proxy = {
    '/api/v1': { target: env.EDUCERT_BACKEND_URL || 'http://127.0.0.1:3001' },
  }
  return {
    plugins: [react(), readonlyRpc(env.EDUCERT_RPC_URL || 'http://127.0.0.1:8545')],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: { groups: [{ name: 'ethers', test: /node_modules[\\/]ethers[\\/]/ }] },
        },
      },
    },
    server: { host: 'localhost', port: 5173, strictPort: true, proxy },
    preview: { host: 'localhost', port: 5173, strictPort: true, proxy },
  }
})
