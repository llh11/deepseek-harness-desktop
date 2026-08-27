'use strict'
/**
 * Manages the local `dsh web` service: probe first (wake an already-running
 * service), then spawn through the best available source — bundled install
 * (no Node.js required), local source checkout, global dsh, or npx
 * auto-install. Emits status changes consumed by tray, window, and IPC.
 */
const { EventEmitter } = require('node:events')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const settings = require('./settings-store')
const runtime = require('./runtime')
const { desktopDir, files } = require('./paths')
const { compareVersions } = require('./version')

const LOG_LIMIT = 500
const events = new EventEmitter()

const state = {
  status: 'stopped', // stopped|starting|running-managed|running-external|stopping|error
  detail: '',
  source: null, // resolved candidate label
  pid: null,
  startedAt: null,
  lastError: null,
}

let child = null
let ring = []

function emit() {
  events.emit('status', describe())
}

function describe() {
  return { ...state, logsTail: ring.slice(-40) }
}

/** True when any HTTP response comes back from the origin. */
async function probe(origin, timeoutMs = 1500) {
  try {
    const response = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    return response.status > 0
  } catch {
    return false
  }
}

/** Keep a bounded ring of service output lines for the log viewer. */
function pushLog(line) {
  ring.push(line)
  if (ring.length > LOG_LIMIT) ring = ring.slice(-LOG_LIMIT)
}

function which(command) {
  const probe = process.platform === 'win32' ? spawnSync('where', [command]) : spawnSync('which', [command])
  if (probe.status !== 0) return null
  const first = probe.stdout.toString().split(/\r?\n/).find((line) => line.trim() !== '')
  return first ?? null
}

/** Windows cannot exec .cmd shims directly; route them through cmd.exe as one
 * quoted command string so paths with spaces survive. */
function commandLine(command, args) {
  const quote = (value) => /[\s"^&|<>()]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  if (process.platform === 'win32' && !/\.exe$/i.test(command)) {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', [command, ...args].map(quote).join(' ')] }
  }
  return { command, args }
}

function readVersion(pkgDir) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : null
  } catch {
    return null
  }
}

/** Arguments for `dsh web`, including the desktop MCP overlay patch. */
function webArgs() {
  const args = ['web']
  if (fs.existsSync(files.mcpOverlay)) args.push('--patch', files.mcpOverlay)
  let port = 3080
  try {
    port = new URL(settings.get().origin).port || 3080
    if (port !== 3080) args.push('--port', String(port))
  } catch { /* default origin already matches */ }
  return args
}

/** Since 0.1.0-rc.8 `dsh web` opens the default browser unless --no-open is
 * passed; the desktop window replaces the browser, so managed services opt
 * out whenever the resolved engine understands the flag. */
function supportsNoOpen(version) {
  return typeof version === 'string' && compareVersions(version, '0.1.0-rc.8') >= 0
}

function noOpenArgs(version) {
  return supportsNoOpen(version) ? ['--no-open'] : []
}

/** The global dsh shim does not advertise its version; ask its --help once. */
let globalNoOpen = null
function probeGlobalNoOpen(command) {
  if (globalNoOpen !== null) return globalNoOpen
  try {
    const wrapped = commandLine(command, ['web', '--help'])
    const probe = spawnSync(wrapped.command, wrapped.args, { windowsHide: true, timeout: 15_000 })
    globalNoOpen = probe.status === 0 && `${probe.stdout ?? ''}${probe.stderr ?? ''}`.includes('--no-open')
  } catch {
    globalNoOpen = false
  }
  return globalNoOpen
}

function autoDetectRepo() {
  const roots = [path.resolve(app.getAppPath(), '..'), path.join(require('node:os').homedir())]
  const names = ['deepseek-harness-master', 'deepseek-harness']
  for (const root of roots) {
    for (const name of names) {
      const candidate = path.join(root, name)
      if (fs.existsSync(path.join(candidate, 'apps', 'cli', 'package.json'))) return candidate
    }
  }
  return null
}

/**
 * Ordered spawn candidates. Each entry describes how to run `dsh web` and how
 * to read the installed version. `mode` pins one source; auto walks the list.
 */
function resolveCandidates() {
  const mode = settings.get().serviceMode
  const list = []

  // Local engine installs: the one-click update dir (user-writable) and the
  // copy bundled with the installer. The NEWER version must win — stale
  // leftovers from an old one-click update must never shadow a newer bundled
  // engine (ties keep the updated copy, so a same-version local update still
  // takes precedence).
  const local = []

  const updatedPkgDir = path.join(desktopDir, 'dsh-service', 'node_modules', '@deepseek-ai', 'dsh')
  const updatedBin = path.join(updatedPkgDir, 'lib', 'bin.js')
  if (fs.existsSync(updatedBin)) {
    const node = runtime.nodeExe()
    local.push({
      kind: 'updated', label: `官方服务（本地更新版${readVersion(updatedPkgDir) ? ` ${readVersion(updatedPkgDir)}` : ''}）`,
      run: { command: node ?? 'node', args: [updatedBin, ...webArgs(), ...noOpenArgs(readVersion(updatedPkgDir))], env: {} },
      version: readVersion(updatedPkgDir),
    })
  }

  if (app.isPackaged || fs.existsSync(path.join(process.resourcesPath, 'dsh-service'))) {
    const pkgDir = path.join(process.resourcesPath, 'dsh-service', 'node_modules', '@deepseek-ai', 'dsh')
    const bin = path.join(pkgDir, 'lib', 'bin.js')
    if (fs.existsSync(bin)) {
      // Prefer the bundled standalone Node runtime: dsh requires Node >=22.19
      // (node:zlib zstd exports), which Electron's embedded Node may not provide.
      const node = runtime.nodeExe()
      local.push({
        kind: 'bundled', label: node ? `内置服务（随包 Node 运行时${readVersion(pkgDir) ? ` ${readVersion(pkgDir)}` : ''}）` : '内置服务（Electron Node，兼容模式）',
        run: {
          command: node ?? process.execPath,
          args: [bin, ...webArgs(), ...noOpenArgs(readVersion(pkgDir))],
          env: node ? {} : { ELECTRON_RUN_AS_NODE: '1' },
        },
        version: readVersion(pkgDir),
      })
    }
  }

  local.sort((a, b) => {
    if (a.version && b.version) return compareVersions(b.version, a.version)
    if (a.version) return -1
    if (b.version) return 1
    return 0 // stable sort keeps the updated copy first
  })
  list.push(...local)

  const repo = settings.get().sourceRepoPath.trim() !== '' ? path.resolve(settings.get().sourceRepoPath) : autoDetectRepo()
  if (repo && fs.existsSync(path.join(repo, 'apps', 'cli', 'package.json'))) {
    const pnpm = which('pnpm')
    if (pnpm) {
      list.push({
        kind: 'source', label: `源码运行（${repo}）`,
        run: { ...commandLine('pnpm', ['--dir', repo, 'dsh', ...webArgs(), ...noOpenArgs(readVersion(path.join(repo, 'apps', 'cli')))]), env: {} },
        version: readVersion(path.join(repo, 'apps', 'cli')),
      })
    }
  }

  const globalDsh = which('dsh')
  if (globalDsh) {
    list.push({
      kind: 'global', label: `全局安装（${globalDsh}）`,
      run: { ...commandLine('dsh', [...webArgs(), ...(probeGlobalNoOpen(globalDsh) ? ['--no-open'] : [])]), env: {} },
      version: null,
    })
  }

  const npx = which('npx')
  if (npx) {
    list.push({
      kind: 'npx', label: 'npx 自动安装（@deepseek-ai/dsh@latest）',
      run: { ...commandLine('npx', ['-y', '@deepseek-ai/dsh@latest', ...webArgs(), '--no-open']), env: {} },
      version: null,
    })
  }

  if (mode === 'auto') return list
  return list.filter((candidate) => candidate.kind === mode)
}

function spawnCandidate(candidate) {
  const cwd = settings.get().workspacePath.trim() !== '' ? path.resolve(settings.get().workspacePath) : desktopDir
  const env = { ...process.env, ...candidate.run.env }
  const proc = spawn(candidate.run.command, candidate.run.args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  proc.stdout.on('data', (chunk) => { for (const line of chunk.toString().split(/\r?\n/)) if (line.trim() !== '') pushLog(line) })
  proc.stderr.on('data', (chunk) => { for (const line of chunk.toString().split(/\r?\n/)) if (line.trim() !== '') pushLog(`[stderr] ${line}`) })
  // 进程退出（崩溃/被外部杀掉）必须同步状态：否则托盘与设置页永远停留在
  // “服务运行中”，用户点「重试启动」也会被 start() 的运行中短路直接忽略。
  proc.on('exit', (code, signal) => {
    if (child !== proc) return // 已被 stop()/start() 接管，状态由它们收尾
    child = null
    state.pid = null
    if (state.status === 'stopping') return
    state.status = 'error'
    state.detail = `服务进程已退出（${signal ?? `退出码 ${code ?? '?'}`}），请尝试重新启动。`
    state.lastError = state.detail
    pushLog(`[desktop] ${state.detail}`)
    emit()
  })
  return proc
}

function killTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'])
  } else {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
}

async function waitReady(origin, timeoutMs, proc) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (proc.exitCode !== null) return false
    if (await probe(origin, 1200)) return true
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

/** Probe → wake an existing service, else spawn the first candidate that becomes ready. */
async function start() {
  if (['starting', 'stopping'].includes(state.status)) return describe()
  const { origin } = settings.get()

  // 宣称“运行中”时先验证：进程可能早已退出（状态未同步）、或端口不再响应。
  // 确实在运行 -> 直接返回；否则复位状态并重新走启动流程，保证「重试启动」
  // 永远能把死掉的服务拉起来，而不是被短路忽略。
  if (state.status === 'running-managed' || state.status === 'running-external') {
    const procAlive = state.status !== 'running-managed' || (child && child.exitCode === null)
    if (procAlive && await probe(origin)) return describe()
    pushLog('[desktop] 状态为运行中但服务无响应，重新启动服务')
    if (child) { killTree(child.pid ?? 0); child = null }
    state.pid = null
    state.status = 'stopped'
    state.detail = '检测到服务已停止，正在重新启动…'
  }

  state.status = 'starting'
  state.detail = '正在探测本地服务…'
  state.lastError = null
  emit()

  if (await probe(origin)) {
    state.status = 'running-external'
    state.detail = '已唤醒并复用正在运行的 DeepSeek Harness 服务'
    state.source = '外部服务'
    state.startedAt = Date.now()
    emit()
    return describe()
  }

  const candidates = resolveCandidates()
  if (candidates.length === 0) {
    state.status = 'error'
    state.detail = '未找到可用的 dsh 安装：请安装 Node.js（将自动通过 npx 安装 dsh），或在设置中配置源码仓库路径。'
    state.lastError = state.detail
    emit()
    return describe()
  }

  pushLog(`[desktop] 服务来源候选：${candidates.map((candidate) => candidate.label).join(' → ')}`)
  for (const candidate of candidates) {
    state.detail = `正在通过${candidate.label}启动…`
    emit()
    pushLog(`[desktop] 尝试${candidate.label}`)
    const proc = spawnCandidate(candidate)
    child = proc
    state.pid = proc.pid ?? null
    const timeoutMs = candidate.kind === 'npx' ? 300_000 : 90_000
    const ready = await waitReady(origin, timeoutMs, proc)
    if (ready) {
      state.status = 'running-managed'
      state.detail = `服务运行中（${candidate.label}）`
      state.source = candidate.label
      state.startedAt = Date.now()
      emit()
      return describe()
    }
    killTree(proc.pid ?? 0)
    if (child === proc) { child = null; state.pid = null }
    pushLog(`[desktop] ${candidate.label} 启动失败${proc.exitCode !== null ? `（退出码 ${proc.exitCode}）` : '（超时）'}`)
  }

  state.status = 'error'
  state.detail = '所有服务来源均启动失败，请查看日志排查。'
  state.lastError = state.detail
  emit()
  return describe()
}

/** Stop the managed child only; an external service stays untouched. */
async function stop() {
  if (state.status === 'running-external') {
    state.status = 'stopped'
    state.detail = '外部服务保持运行，桌面端仅断开管理'
    emit()
    return describe()
  }
  if (!child) {
    state.status = 'stopped'
    state.detail = ''
    emit()
    return describe()
  }
  state.status = 'stopping'
  state.detail = '正在停止托管服务…'
  emit()
  const proc = child
  await new Promise((resolve) => {
    proc.once('exit', resolve)
    killTree(proc.pid ?? 0)
    setTimeout(resolve, 5000)
  })
  child = null
  state.pid = null
  state.status = 'stopped'
  state.detail = ''
  emit()
  return describe()
}

async function restart() {
  await stop()
  return start()
}

/** Installed dsh version from the best resolvable source, plus each candidate's version. */
function versionInfo() {
  const candidates = resolveCandidates()
  return {
    resolved: candidates[0]?.version ?? null,
    sources: candidates.map((candidate) => ({ kind: candidate.kind, label: candidate.label, version: candidate.version })),
  }
}

function logs() {
  return [...ring]
}

module.exports = { events, start, stop, restart, probe, describe, versionInfo, logs, webArgs }
