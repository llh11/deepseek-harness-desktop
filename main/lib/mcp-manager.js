'use strict'
/**
 * Visual MCP customization. Server definitions live in
 * $DSH_HOME/dsh-desktop/mcp-servers.json and project into a patch-list overlay
 * (`mcp.patch.yml`) that the service manager passes to `dsh web --patch`, so
 * MCP servers mount through the official `@deepseek-ai/dsh-mcp-client`
 * plugin without hand-editing any profile file.
 */
const fs = require('node:fs')
const crypto = require('node:crypto')
const { files, ensureDesktopDir } = require('./paths')
const yaml = require('./yaml')

const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
let appliedAt = null

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(files.mcpStore, 'utf8'))
  } catch {
    return { servers: [] }
  }
}

function saveStore(store) {
  ensureDesktopDir()
  fs.writeFileSync(files.mcpStore, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
  }
  return []
}

function toRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [key, entry] of Object.entries(value)) out[key] = String(entry)
  return out
}

/** Validate + normalize one server definition. */
function normalizeServer(input) {
  const name = String(input.name ?? '').trim()
  if (!NAME_PATTERN.test(name)) throw new Error('服务器名称只能包含字母、数字、下划线、连字符（1-32 位）')
  const transport = input.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
  const server = {
    id: typeof input.id === 'string' && input.id !== '' ? input.id : crypto.randomUUID(),
    name,
    transport,
    enabled: input.enabled !== false,
    toolCallTimeoutMs: Number.isFinite(Number(input.toolCallTimeoutMs)) && input.toolCallTimeoutMs > 0 ? Number(input.toolCallTimeoutMs) : 60000,
    failOnStartupError: input.failOnStartupError === true,
    reconnect: {
      enabled: input.reconnect?.enabled !== false,
      initialDelayMs: Number.isFinite(Number(input.reconnect?.initialDelayMs)) && input.reconnect?.initialDelayMs > 0 ? Number(input.reconnect.initialDelayMs) : 500,
      maxDelayMs: Number.isFinite(Number(input.reconnect?.maxDelayMs)) && input.reconnect?.maxDelayMs > 0 ? Number(input.reconnect.maxDelayMs) : 30000,
      maxAttempts: Number.isFinite(Number(input.reconnect?.maxAttempts)) && input.reconnect?.maxAttempts > 0 ? Number(input.reconnect.maxAttempts) : 10,
    },
  }
  if (transport === 'stdio') {
    if (typeof input.command !== 'string' || input.command.trim() === '') throw new Error('stdio 传输需要可执行命令')
    server.command = input.command.trim()
    server.args = toStringArray(input.args)
    server.env = toRecord(input.env)
    if (typeof input.cwd === 'string' && input.cwd.trim() !== '') server.cwd = input.cwd.trim()
  } else {
    if (typeof input.url !== 'string' || !/^https?:\/\//.test(input.url.trim())) throw new Error('streamable-http 传输需要以 http(s):// 开头的 URL')
    server.url = input.url.trim()
    server.headers = toRecord(input.headers)
  }
  return server
}

/** Build the mcp-client plugin config for one server. */
function toPluginConfig(server) {
  const config = {
    serverName: server.name,
    transport: server.transport,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: server.failOnStartupError,
    reconnect: server.reconnect,
  }
  if (server.transport === 'stdio') {
    config.command = server.command
    config.args = server.args
    config.env = server.env
    if (server.cwd) config.cwd = server.cwd
  } else {
    config.url = server.url
    config.headers = server.headers
  }
  return config
}

/** Write the overlay with every enabled server; `[]` disables the layer. */
function apply() {
  const store = loadStore()
  const enabled = store.servers.filter((server) => server.enabled)
  const overlay = enabled.length === 0
    ? []
    : [{
        insert: enabled.map((server) => ({
          id: `dsh-desktop-mcp-${server.name}`,
          name: '@deepseek-ai/dsh-mcp-client',
          config: toPluginConfig(server),
        })),
      }]
  ensureDesktopDir()
  fs.writeFileSync(files.mcpOverlay, `# 由 DeepSeek Harness Desktop 管理，通过 dsh web --patch 注入；直接修改会被覆盖。\n${yaml.dump(overlay)}`, 'utf8')
  appliedAt = Date.now()
  return state()
}

function state() {
  const store = loadStore()
  return {
    servers: store.servers,
    overlayPath: files.mcpOverlay,
    appliedAt,
  }
}

/** Create or update a server and re-project the overlay. */
function save(input) {
  const normalized = normalizeServer(input)
  const store = loadStore()
  const existing = store.servers.find((server) => server.id === normalized.id)
  const duplicate = store.servers.find((server) => server.name === normalized.name && server.id !== normalized.id)
  if (duplicate) throw new Error(`服务器名称 "${normalized.name}" 已被其它条目使用`)
  if (existing) Object.assign(existing, normalized)
  else store.servers.push(normalized)
  saveStore(store)
  return apply()
}

/** Enable/disable without opening the editor. */
function toggle(id, enabled) {
  const store = loadStore()
  const server = store.servers.find((item) => item.id === id)
  if (!server) throw new Error(`未找到 MCP 服务器：${id}`)
  server.enabled = Boolean(enabled)
  saveStore(store)
  return apply()
}

function remove(id) {
  const store = loadStore()
  const before = store.servers.length
  store.servers = store.servers.filter((server) => server.id !== id)
  if (store.servers.length === before) throw new Error(`未找到 MCP 服务器：${id}`)
  saveStore(store)
  return apply()
}

function overlayExists() {
  return fs.existsSync(files.mcpOverlay)
}

/* ---------- connection test ---------- */

const { spawn } = require('node:child_process')

const MCP_PROTOCOL_VERSION = '2025-06-18'
const CLIENT_INFO = { name: 'dsh-desktop-probe', version: '1.3.0' }

/** JSON-RPC frames for one probe round. */
function rpcFrame(id, method, params) {
  return `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`
}

/** Probe a stdio server: spawn, initialize, list tools, exit. */
function testStdio(server, timeoutMs) {
  return new Promise((resolve) => {
    const done = (result) => { try { proc.kill() } catch { /* gone */ } ; resolve(result) }
    let proc
    try {
      proc = spawn(server.command, server.args ?? [], {
        env: { ...process.env, ...(server.env ?? {}) },
        cwd: server.cwd || undefined,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      resolve({ ok: false, error: `无法启动进程：${error.message}` })
      return
    }
    const timer = setTimeout(() => done({ ok: false, error: `连接超时（${timeoutMs / 1000} 秒无响应）` }), timeoutMs)
    let buffer = ''
    let phase = 'initialize'
    proc.on('error', (error) => { clearTimeout(timer); done({ ok: false, error: `进程启动失败：${error.message}` }) })
    proc.on('exit', (code) => { clearTimeout(timer); done({ ok: false, error: `进程提前退出（退出码 ${code}）` }) })
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '' || !trimmed.startsWith('{')) continue
        let message
        try { message = JSON.parse(trimmed) } catch { continue }
        if (phase === 'initialize' && message.id === 1) {
          if (message.error) { clearTimeout(timer); done({ ok: false, error: `initialize 被拒绝：${message.error.message}` }); return }
          const serverInfo = message.result?.serverInfo
          proc.stdin.write(rpcFrame(null, 'notifications/initialized', {}))
          proc.stdin.write(rpcFrame(2, 'tools/list', {}))
          phase = 'tools'
          var info = serverInfo
        } else if (phase === 'tools' && message.id === 2) {
          clearTimeout(timer)
          if (message.error) { done({ ok: true, tools: null, serverInfo: info ?? null, note: '服务器在线，但 tools/list 被拒' }); return }
          const tools = Array.isArray(message.result?.tools) ? message.result.tools : []
          done({ ok: true, tools: tools.length, toolNames: tools.slice(0, 8).map((tool) => tool.name), serverInfo: info ?? null })
          return
        }
      }
    })
    proc.stdin.write(rpcFrame(1, 'initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    }))
  })
}

/** Probe a streamable-http server with the MCP initialize handshake. */
async function testHttp(server, timeoutMs) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...(server.headers ?? {}),
  }
  const post = async (payload, sessionId) => {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: sessionId ? { ...headers, 'mcp-session-id': sessionId } : headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    // SSE framing: data: {...} lines; plain JSON otherwise.
    const dataLines = text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim())
    const raw = dataLines.length > 0 ? dataLines[dataLines.length - 1] : text
    return { message: raw === '' ? null : JSON.parse(raw), sessionId: response.headers.get('mcp-session-id') ?? sessionId }
  }
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } })
  if (init.message?.error) throw new Error(`initialize 被拒绝：${init.message.error.message}`)
  const serverInfo = init.message?.result?.serverInfo ?? null
  const sessionId = init.sessionId ?? undefined
  await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId).catch(() => {})
  const listed = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId)
  const tools = Array.isArray(listed.message?.result?.tools) ? listed.message.result.tools : []
  return { ok: true, tools: tools.length, toolNames: tools.slice(0, 8).map((tool) => tool.name), serverInfo }
}

/** Test one saved server's reachability and tool list. */
async function test(id) {
  const server = loadStore().servers.find((item) => item.id === id)
  if (!server) throw new Error(`未找到 MCP 服务器：${id}`)
  const timeoutMs = Math.min(Math.max(server.toolCallTimeoutMs ?? 60000, 3000), 15000)
  try {
    if (server.transport === 'stdio') return await testStdio(server, timeoutMs)
    return await testHttp(server, timeoutMs)
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

module.exports = { state, save, toggle, remove, apply, overlayExists, test }
