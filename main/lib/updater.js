'use strict'
/**
 * Update checks: the official dsh npm package (registry dist-tags vs the
 * locally resolved install) and the desktop app itself against an optional
 * JSON feed ({ version, url, notes }) configured in the settings center.
 */
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const settings = require('./settings-store')
const service = require('./service-manager')
const runtime = require('./runtime')
const { desktopDir, ensureDesktopDir } = require('./paths')
const { compareVersions } = require('./version')

const REGISTRIES = ['https://registry.npmjs.org', 'https://registry.npmmirror.com']

/** The desktop update service is bound to the official mirror subsite. Only
 * when this address is unreachable do the alternates below open up. */
const DEFAULT_UPDATE_ORIGIN = 'http://199.7.140.33:8010'
const DESKTOP_FEED_FALLBACKS = [`${DEFAULT_UPDATE_ORIGIN}/feed.json`]
const ENGINE_MIRROR_FALLBACKS = [DEFAULT_UPDATE_ORIGIN]

/** Ordered unique candidate list: configured address first, then fallbacks. */
function withFallbacks(configured, fallbacks) {
  const list = []
  for (const url of [configured, ...fallbacks]) {
    if (typeof url !== 'string' || url.trim() === '') continue
    const normalized = url.trim()
    if (!list.includes(normalized)) list.push(normalized)
  }
  return list
}

async function fetchJson(url, timeoutMs = 10_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/** Latest official dsh version from the first reachable registry. */
async function officialLatest() {
  const errors = []
  for (const registry of REGISTRIES) {
    try {
      const manifest = await fetchJson(`${registry}/@deepseek-ai/dsh`)
      const latest = manifest?.['dist-tags']?.latest
      if (typeof latest === 'string') return { latest, registry }
    } catch (error) {
      errors.push(`${registry}: ${error.message}`)
    }
  }
  throw new Error(errors.join('；'))
}

/** Desktop-app feed check with fallback addresses. The configured address
 * (the 8010 mirror by default) is tried first; alternates open up only when
 * every earlier address failed. Returns the feed plus the source used. */
async function desktopFeed(feedUrl) {
  const candidates = withFallbacks(feedUrl, DESKTOP_FEED_FALLBACKS)
  if (candidates.length === 0) return null
  const errors = []
  for (const candidate of candidates) {
    try {
      const payload = await fetchJson(candidate, 12_000)
      if (typeof payload?.version !== 'string') throw new Error('更新源响应缺少 version 字段')
      return {
        latest: payload.version,
        url: typeof payload.url === 'string' ? payload.url : null,
        notes: typeof payload.notes === 'string' ? payload.notes : null,
        sha256: typeof payload.sha256 === 'string' && payload.sha256.trim() !== '' ? payload.sha256.trim().toLowerCase() : null,
        source: candidate,
      }
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`)
    }
  }
  throw new Error(errors.join('；'))
}

/** Engine mirror (加速更新镜像子站) check. The mirror serves a dynamic
 * `latest.php` (which also self-syncs the mirror against the upstream
 * registry when stale) plus the static `latest.json` snapshot; both carry
 * { version, bundle, notes }. */
async function mirrorLatest(mirrorUrl) {
  if (typeof mirrorUrl !== 'string' || mirrorUrl.trim() === '') return null
  const base = mirrorUrl.trim().replace(/\/+$/, '')
  const errors = []
  for (const manifest of ['latest.php', 'latest.json']) {
    try {
      const payload = await fetchJson(`${base}/${manifest}`, 12_000)
      if (typeof payload?.version !== 'string') throw new Error('镜像版本清单缺少 version 字段')
      return {
        base,
        latest: payload.version,
        bundle: typeof payload.bundle === 'string' && payload.bundle.trim() !== '' ? payload.bundle : null,
        notes: typeof payload.notes === 'string' ? payload.notes : null,
        sha256: typeof payload.sha256 === 'string' && payload.sha256.trim() !== '' ? payload.sha256.trim().toLowerCase() : null,
        pendingBuild: payload.pendingBuild === true,
      }
    } catch (error) {
      errors.push(`${manifest}: ${error.message}`)
    }
  }
  throw new Error(errors.join('；'))
}

/** Mirror check across the bound mirror and its fallbacks (same rule as the
 * desktop feed: the 8010 default is primary, alternates only on failure). */
async function mirrorLatestWithFallback(mirrorUrl) {
  const candidates = withFallbacks(mirrorUrl, ENGINE_MIRROR_FALLBACKS)
  if (candidates.length === 0) return null
  const errors = []
  for (const candidate of candidates) {
    try {
      return await mirrorLatest(candidate)
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`)
    }
  }
  throw new Error(errors.join('；'))
}

/** One combined check; each half degrades independently. */
async function checkAll() {
  const feedUrl = settings.get().updateFeedUrl
  const mirrorUrl = settings.get().engineMirrorUrl
  const result = {
    checkedAt: new Date().toISOString(),
    desktop: { current: app.getVersion(), latest: null, url: null, notes: null, error: null, source: null },
    official: { installed: null, sources: [], latest: null, registry: null, error: null },
    mirror: { url: mirrorUrl?.trim() !== '' ? mirrorUrl.trim() : null, latest: null, notes: null, error: null, activeUrl: null },
  }
  try {
    const feed = await desktopFeed(feedUrl)
    if (feed) Object.assign(result.desktop, feed)
  } catch (error) {
    result.desktop.error = error.message
  }
  try {
    const mirror = await mirrorLatestWithFallback(mirrorUrl)
    if (mirror) Object.assign(result.mirror, { latest: mirror.latest, notes: mirror.notes, activeUrl: mirror.base })
  } catch (error) {
    result.mirror.error = error.message
  }
  try {
    const versionInfo = service.versionInfo()
    result.official.installed = versionInfo.resolved
    result.official.sources = versionInfo.sources
    const registry = await officialLatest()
    result.official.latest = registry.latest
    result.official.registry = registry.registry
  } catch (error) {
    result.official.error = error.message
  }
  result.desktop.updateAvailable = result.desktop.latest !== null && compareVersions(result.desktop.latest, result.desktop.current) > 0
  result.official.updateAvailable = result.official.latest !== null
    && result.official.installed !== null
    && compareVersions(result.official.latest, result.official.installed) > 0
  settings.update({ lastUpdateCheck: result.checkedAt })
  return result
}

/** Run one bundled-npm command, streaming trimmed output lines to `send`. */
function runNpm(args, send) {
  return new Promise((resolve, reject) => {
    const node = runtime.nodeExe()
    const npmCli = runtime.npmCli()
    if (!node || !npmCli) {
      reject(new Error('未找到随包 Node/npm 运行时（node-runtime），无法执行一键更新'))
      return
    }
    const proc = spawn(node, [npmCli, ...args], {
      cwd: desktopDir,
      env: { ...process.env, PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH ?? ''}` },
      windowsHide: true,
    })
    let tail = []
    const onLine = (line) => {
      const text = line.trim()
      if (text === '') return
      tail.push(text)
      if (tail.length > 40) tail = tail.slice(-40)
      send(text)
    }
    proc.stdout.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(onLine))
    proc.stderr.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(onLine))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`npm 退出码 ${code}：\n${tail.slice(-8).join('\n')}`))
    })
  })
}

/** Download `url` to `dest`, reporting MB progress through `send`. */
async function downloadTo(url, dest, send) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length') ?? 0)
  const reader = response.body.getReader()
  const writer = fs.createWriteStream(dest)
  let received = 0
  let lastReport = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (!writer.write(Buffer.from(value))) await new Promise((resolve) => writer.once('drain', resolve))
      if (received - lastReport >= 8 * 1024 * 1024) {
        lastReport = received
        send(total > 0
          ? `已下载 ${(received / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`
          : `已下载 ${(received / 1048576).toFixed(1)} MB`)
      }
    }
  } finally {
    await new Promise((resolve) => writer.end(resolve))
  }
  return received
}

/** Stream one file through SHA-256; hex digest, lowercase. */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/** Verify a downloaded file against an expected sha256; deletes and throws on mismatch. */
async function verifySha256(file, expected) {
  if (typeof expected !== 'string' || expected.trim() === '') return
  const actual = await sha256File(file)
  if (actual !== expected.trim().toLowerCase()) {
    fs.rmSync(file, { force: true })
    throw new Error(`文件校验失败（sha256 不匹配，期望 ${expected.trim().toLowerCase().slice(0, 12)}…，实际 ${actual.slice(0, 12)}…），已删除损坏的下载`)
  }
}

/** Extract a .tgz into `dest` with the system tar (bsdtar on Windows 10+). */
function extractTgz(file, dest) {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', file, '-C', dest], { windowsHide: true })
    let tail = ''
    proc.stderr.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-2000) })
    proc.on('error', () => reject(new Error('未找到系统 tar 命令，无法解压镜像引擎包')))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`解压失败（tar 退出码 ${code}）：${tail.trim()}`))
    })
  })
}

/**
 * Mirror-accelerated engine update: fetch latest.json from the mirror subsite,
 * download the pre-built engine bundle (full node_modules tree, no npm registry
 * round-trips) and extract it into the dsh-service prefix.
 */
async function applyMirrorUpdate(mirrorUrl, send) {
  const info = await mirrorLatestWithFallback(mirrorUrl)
  if (!info) throw new Error('未配置加速镜像地址')
  if (!info.bundle) {
    throw new Error(info.pendingBuild
      ? `镜像已同步官方 ${info.latest}，但引擎包尚未构建完成（服务器缺少 Node 或构建未完成）`
      : '镜像 latest.json 缺少 bundle 字段')
  }
  const bundleUrl = info.bundle.startsWith('http') ? info.bundle : `${info.base}/${info.bundle.replace(/^\/+/, '')}`
  send(`镜像最新版本：${info.latest}，正在从镜像 ${info.base} 下载引擎包…`)
  const cacheDir = path.join(desktopDir, 'update-cache')
  ensureDesktopDir()
  fs.mkdirSync(cacheDir, { recursive: true })
  const file = path.join(cacheDir, `dsh-engine-${info.latest}.tgz`)
  await downloadTo(bundleUrl, file, send)
  if (info.sha256) {
    send('正在校验引擎包完整性（sha256）…')
    await verifySha256(file, info.sha256)
  }
  const prefix = path.join(desktopDir, 'dsh-service')
  send('正在解压引擎包到本地服务目录…')
  fs.rmSync(path.join(prefix, 'node_modules'), { recursive: true, force: true })
  fs.mkdirSync(prefix, { recursive: true })
  await extractTgz(file, prefix)
  fs.rmSync(file, { force: true })
  // The post-install version probe is best-effort: a probe failure must not
  // discard an otherwise successful mirror update.
  let installed = null
  try {
    installed = service.versionInfo().resolved
  } catch { /* probe failed; the extracted tree still stands */ }
  send(`镜像更新完成：本地引擎版本 ${installed ?? info.latest}`)
  return { latest: info.latest, installed, mirror: info.base }
}

/**
 * One-click official-engine update: install the latest @deepseek-ai/dsh into
 * $DSH_HOME/dsh-desktop/dsh-service (user-writable, survives app updates).
 * A configured engine mirror (加速更新镜像子站) is tried first; on any mirror
 * failure it falls back to the bundled-npm registry install.
 * @param send - progress callback receiving one output line at a time.
 */
async function applyOfficialUpdate(send = () => {}) {
  const mirrorUrl = settings.get().engineMirrorUrl
  try {
    return await applyMirrorUpdate(mirrorUrl, send)
  } catch (error) {
    send(`镜像更新失败（${error.message}），回退到官方 npm 源…`)
  }
  const { latest } = await officialLatest()
  const prefix = path.join(desktopDir, 'dsh-service')
  ensureDesktopDir()
  fs.mkdirSync(prefix, { recursive: true })
  send(`正在安装官方 @deepseek-ai/dsh@${latest}（npmmirror 镜像）…`)
  await runNpm([
    'install', '--prefix', prefix,
    '--registry', 'https://registry.npmmirror.com',
    '--no-audit', '--no-fund', '--loglevel', 'error',
    `@deepseek-ai/dsh@${latest}`,
  ], send)
  const installed = service.versionInfo().resolved
  send(`安装完成：本地引擎版本 ${installed ?? latest}`)
  return { latest, installed }
}

/**
 * Download the desktop installer announced by the update feed into
 * $DSH_HOME/dsh-desktop/update-cache and return its path. The feed URL may be
 * relative to the feed's own origin.
 */
async function downloadDesktopUpdate(send = () => {}) {
  const feedUrl = settings.get().updateFeedUrl
  const feed = await desktopFeed(feedUrl)
  if (!feed) throw new Error('未配置桌面版更新源')
  if (!feed.url) throw new Error('更新源未提供下载地址')
  const downloadUrl = feed.url.startsWith('http')
    ? feed.url
    : new URL(feed.url.replace(/^\/+/, ''), `${new URL(feed.source ?? feedUrl).origin}/`).toString()
  const parsed = new URL(downloadUrl)
  // Mirror downloads ride dl.php?f=<path>; plain paths carry the file name.
  const viaBridge = parsed.searchParams.get('f')
  const fileName = decodeURIComponent((viaBridge ?? parsed.pathname).split('/').filter(Boolean).pop() ?? '') || `dsh-desktop-${feed.latest}.exe`
  const cacheDir = path.join(desktopDir, 'update-cache')
  ensureDesktopDir()
  fs.mkdirSync(cacheDir, { recursive: true })
  const dest = path.join(cacheDir, fileName)
  send(`正在从 ${new URL(downloadUrl).origin} 下载桌面版 ${feed.latest}…`)
  await downloadTo(downloadUrl, dest, send)
  if (feed.sha256) {
    send('正在校验安装包完整性（sha256）…')
    await verifySha256(dest, feed.sha256)
  }
  send(`下载完成：${dest}`)
  return { file: dest, version: feed.latest }
}

module.exports = { checkAll, compareVersions, officialLatest, applyOfficialUpdate, mirrorLatest, applyMirrorUpdate, downloadDesktopUpdate, DEFAULT_UPDATE_ORIGIN, DESKTOP_FEED_FALLBACKS, ENGINE_MIRROR_FALLBACKS }
