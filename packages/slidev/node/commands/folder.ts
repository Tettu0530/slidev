import type { Buffer } from 'node:buffer'
/**
 * Folder mode: serve every `<dir>/<id>/slides.md` on one port.
 *
 *   /                      deck browser
 *   /d/<id>/...            the deck, served by its own Slidev dev server (base `/d/<id>/`)
 *   /__folder/api/...      JSON API used by the browser (list, stop, export, create)
 *
 * Each deck runs in a child process (Slidev keeps per-process state such as the
 * resolved roots), started on first request and stopped after it has been idle.
 * HTTP and the HMR WebSocket are forwarded by path prefix.
 */
import type { ChildProcess } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { getPort } from 'get-port-please'
import path from 'pathe'
import { parser } from '../parser'
import { folderPage } from './folderPage'

export interface FolderOptions {
  dir: string
  port: number
  host?: string
  template?: string
  idleMinutes: number
  log: (msg: string) => void
}

interface DeckProcess {
  child: ChildProcess
  port: number
  ready: Promise<boolean>
  lastSeen: number
  sockets: number
  log: string[]
}

interface ExportJob {
  state: 'running' | 'done' | 'failed'
  log: string[]
  started: number
  finished?: number
}

const RE_ID = /^[a-z0-9][\w.-]*$/i
const RE_ANSI = /\x1B\[[0-9;]*m/g // eslint-disable-line no-control-regex
const RE_DECK_PATH = /^\/d\/([^/?#]+)(\/.*)?$/
const BIN = path.resolve(fileURLToPath(import.meta.url), '../../bin/slidev.mjs')

export async function startFolderServer(options: FolderOptions) {
  const dir = path.resolve(options.dir)
  if (!existsSync(dir) || !statSync(dir).isDirectory())
    throw new Error(`[slidev] folder "${dir}" does not exist`)

  const decks = new Map<string, DeckProcess>()
  const jobs = new Map<string, ExportJob>()
  const starting = new Map<string, Promise<DeckProcess>>()

  const entryOf = (id: string) => path.join(dir, id, 'slides.md')
  const isDeck = (id: string) => RE_ID.test(id) && existsSync(entryOf(id))

  // ---- decks on disk ----

  async function listDecks() {
    const ids = readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory() && isDeck(d.name))
      .map(d => d.name)
      .sort((a, b) => b.localeCompare(a))
    return Promise.all(ids.map(async (id) => {
      const entry = entryOf(id)
      const md = await parser.parse(await fs.readFile(entry, 'utf-8'), entry)
      const headmatter = md.slides[0]?.frontmatter ?? {}
      const updated = statSync(entry).mtimeMs
      const pdfPath = path.join(dir, id, `${id}.pdf`)
      const pdf = existsSync(pdfPath) ? statSync(pdfPath) : null
      const proc = decks.get(id)
      const job = jobs.get(id)
      return {
        id,
        title: String(headmatter.title ?? md.slides[0]?.title ?? id),
        slides: md.slides.length,
        updated,
        pdf: pdf ? { size: pdf.size, mtime: pdf.mtimeMs, stale: pdf.mtimeMs < updated } : null,
        thumb: existsSync(path.join(dir, id, '.thumb', '1.png')),
        running: !!proc,
        url: `/d/${id}/`,
        job: job ? { state: job.state, last: job.log.at(-1) ?? '', finished: job.finished } : null,
      }
    }))
  }

  async function createDeck(id: string, title: string) {
    if (!RE_ID.test(id))
      throw new Error('id は英数字・ハイフン・ドット・アンダースコアで、英数字から始めてください')
    const deckDir = path.join(dir, id)
    if (existsSync(deckDir))
      throw new Error(`${id} はすでにあります`)
    const template = options.template
      ? await fs.readFile(path.resolve(options.template), 'utf-8')
      : `---\ntitle: {{title}}\n---\n\n# {{title}}\n`
    await fs.mkdir(path.join(deckDir, 'public'), { recursive: true })
    await fs.writeFile(path.join(deckDir, 'public', '.gitkeep'), '')
    await fs.writeFile(entryOf(id), template.replaceAll('{{id}}', id).replaceAll('{{title}}', title || id))
  }

  // ---- child Slidev servers ----

  function run(args: string[], onLine?: (line: string) => void) {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    const feed = (buf: Buffer) => buf.toString().split('\n').forEach(l => l.trim() && onLine?.(l.replace(RE_ANSI, '')))
    child.stdout!.on('data', feed)
    child.stderr!.on('data', feed)
    return child
  }

  function exited(child: ChildProcess) {
    return new Promise<number>(resolve => child.on('exit', code => resolve(code ?? 1)))
  }

  async function waitForHttp(url: string, child: ChildProcess, ms = 90_000) {
    const state = { alive: true }
    child.once('exit', () => state.alive = false)
    const end = Date.now() + ms
    while (state.alive && Date.now() < end) {
      try {
        if ((await fetch(url)).ok)
          return true
      }
      catch {}
      await new Promise(r => setTimeout(r, 300))
    }
    return false
  }

  function startDeck(id: string): Promise<DeckProcess> {
    const existing = decks.get(id)
    if (existing)
      return Promise.resolve(existing)
    if (!starting.has(id)) {
      starting.set(id, (async () => {
        const port = await getPort({ port: 0, host: 'localhost' })
        const proc: DeckProcess = { port, lastSeen: Date.now(), sockets: 0, log: [], child: undefined!, ready: undefined! }
        proc.child = run([entryOf(id), '--port', String(port), '--base', `/d/${id}/`], (l) => {
          proc.log.push(l)
          if (proc.log.length > 200)
            proc.log.shift()
        })
        proc.child.on('exit', () => {
          if (decks.get(id) === proc)
            decks.delete(id)
        })
        // The child listens on `localhost`, which may be IPv6 only; always connect by that name
        proc.ready = waitForHttp(`http://localhost:${port}/d/${id}/`, proc.child)
        decks.set(id, proc)
        options.log(`started ${id} (internal port ${port})`)
        if (!await proc.ready) {
          proc.child.kill()
          decks.delete(id)
          throw new Error(`${id} を起動できませんでした: ${proc.log.slice(-3).join(' / ')}`)
        }
        return proc
      })().finally(() => starting.delete(id)))
    }
    return starting.get(id)!
  }

  function stopDeck(id: string) {
    const proc = decks.get(id)
    if (!proc)
      return
    proc.child.kill()
    decks.delete(id)
    options.log(`stopped ${id}`)
  }

  function startExport(id: string) {
    const current = jobs.get(id)
    if (current?.state === 'running')
      return
    const job: ExportJob = { state: 'running', log: [], started: Date.now() }
    jobs.set(id, job)
    const deckDir = path.join(dir, id)
    const push = (l: string) => job.log.push(l)
    ;(async () => {
      let code = await exited(run(['export', entryOf(id), '--output', path.join(deckDir, `${id}.pdf`), '--wait', '1500'], push))
      if (code === 0)
        code = await exited(run(['export', entryOf(id), '--format', 'png', '--range', '1', '--scale', '0.5', '--output', path.join(deckDir, '.thumb'), '--wait', '1500'], push))
      job.state = code === 0 ? 'done' : 'failed'
      job.finished = Date.now()
      options.log(`export ${id}: ${job.state}`)
    })()
  }

  // ---- HTTP ----

  // Geist for the browser page: the nearest node_modules/geist above the folder (its exports hide package.json)
  const geistDir = (() => {
    for (let d = dir; ; d = path.dirname(d)) {
      const candidate = path.join(d, 'node_modules/geist/dist/fonts')
      if (existsSync(candidate))
        return candidate
      if (path.dirname(d) === d)
        return null
    }
  })()

  function send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  function sendFile(res: ServerResponse, file: string | null, type: string) {
    if (!file || !existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  }

  async function readBody(req: IncomingMessage) {
    let body = ''
    for await (const chunk of req)
      body += chunk
    return body ? JSON.parse(body) : {}
  }

  function proxy(req: IncomingMessage, res: ServerResponse, proc: DeckProcess) {
    proc.lastSeen = Date.now()
    const upstream = http.request({
      host: 'localhost',
      port: proc.port,
      method: req.method,
      path: req.url,
      headers: req.headers,
    }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    })
    upstream.on('error', () => res.headersSent ? res.end() : res.writeHead(502).end())
    req.pipe(upstream)
  }

  async function api(req: IncomingMessage, res: ServerResponse, parts: string[]) {
    if (req.method === 'GET' && parts.length === 1)
      return send(res, 200, await listDecks())
    if (req.method === 'POST' && parts.length === 1) {
      const { id, title } = await readBody(req)
      await createDeck(String(id ?? ''), String(title ?? ''))
      return send(res, 201, {})
    }
    const id = parts[1]
    if (!id || !isDeck(id))
      return send(res, 404, { error: `デッキ "${id}" が見つかりません` })
    const action = parts[2]
    if (req.method === 'GET' && action === 'pdf')
      return sendFile(res, path.join(dir, id, `${id}.pdf`), 'application/pdf')
    if (req.method === 'GET' && action === 'thumb')
      return sendFile(res, path.join(dir, id, '.thumb', '1.png'), 'image/png')
    if (req.method === 'GET' && action === 'log')
      return send(res, 200, { dev: decks.get(id)?.log.slice(-40) ?? [], export: jobs.get(id)?.log.slice(-40) ?? [] })
    if (req.method === 'POST' && action === 'stop') {
      stopDeck(id)
      return send(res, 200, {})
    }
    if (req.method === 'POST' && action === 'export') {
      startExport(id)
      return send(res, 202, {})
    }
    return send(res, 404, { error: 'not found' })
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      const deck = url.pathname.match(RE_DECK_PATH)
      if (deck) {
        const id = decodeURIComponent(deck[1])
        if (!isDeck(id))
          return res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`デッキ "${id}" が見つかりません`)
        if (!deck[2]) // `/d/<id>` → `/d/<id>/`
          return res.writeHead(302, { location: `/d/${id}/${url.search}` }).end()
        return proxy(req, res, await startDeck(id))
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        return res.end(folderPage({ folder: path.basename(dir) }))
      }
      if (url.pathname.startsWith('/__folder/fonts/')) {
        const name = url.pathname.slice('/__folder/fonts/'.length)
        const files: Record<string, string> = { 'geist.woff2': 'geist-sans/Geist-Variable.woff2', 'geist-mono.woff2': 'geist-mono/GeistMono-Regular.woff2' }
        return sendFile(res, geistDir && files[name] ? path.join(geistDir, files[name]) : null, 'font/woff2')
      }
      if (url.pathname.startsWith('/__folder/api/decks'))
        return await api(req, res, url.pathname.slice('/__folder/api/'.length).split('/').filter(Boolean))
      res.writeHead(404).end()
    }
    catch (e) {
      if (!res.headersSent)
        send(res, 400, { error: (e as Error).message })
    }
  })

  // HMR WebSocket: forward the raw upgrade to the deck's server
  server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const deck = (req.url ?? '').match(RE_DECK_PATH)
    const id = deck ? decodeURIComponent(deck[1]) : ''
    if (!deck || !isDeck(id))
      return socket.destroy()
    let proc: DeckProcess
    try {
      proc = await startDeck(id)
    }
    catch {
      return socket.destroy()
    }
    const upstream = net.connect(proc.port, 'localhost', () => {
      const headers = []
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`)
      if (head.length)
        upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    proc.sockets++
    const close = () => {
      upstream.destroy()
      socket.destroy()
    }
    upstream.on('error', close)
    socket.on('error', close)
    socket.once('close', () => {
      proc.sockets--
      proc.lastSeen = Date.now()
    })
  })

  // Stop decks that have no open connection and no request for a while
  const idleTimer = setInterval(() => {
    for (const [id, proc] of decks) {
      if (proc.sockets <= 0 && Date.now() - proc.lastSeen > options.idleMinutes * 60_000)
        stopDeck(id)
    }
  }, 60_000)
  idleTimer.unref()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => resolve())
  })

  const shutdown = () => {
    for (const proc of decks.values())
      proc.child.kill()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  return {
    server,
    dir,
    close: async () => {
      clearInterval(idleTimer)
      for (const proc of decks.values())
        proc.child.kill()
      await new Promise(r => server.close(r))
    },
  }
}
