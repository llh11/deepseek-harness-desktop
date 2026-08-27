'use strict'
/**
 * Pre-build engine sync: make sure dsh-service/node_modules carries the
 * LATEST official @deepseek-ai/dsh before electron-builder packages the
 * installer. Source of truth is the mirror subsite (latest.json), which
 * tracks the upstream npm registry automatically.
 *
 *   node scripts/sync-engine.js
 *
 * Order: local downloads/dsh-engine-<version>.tgz (sha256-verified) first,
 * then the mirror bundle URL. Exits non-zero on failure so a stale engine
 * can never be packaged silently.
 */
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const SERVICE_DIR = path.join(ROOT, 'dsh-service')
const DOWNLOADS = path.resolve(ROOT, '..', 'downloads')
const MIRRORS = ['http://199.7.140.33:8010']

function readVersion(pkgDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version ?? null
  } catch {
    return null
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p))
  const pb = String(b).split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    return String(x) < String(y) ? -1 : 1
  }
  return 0
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function extractTgz(file, dest) {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', file, '-C', dest], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let tail = ''
    proc.stderr.on('data', (chunk) => { tail = `${tail}${chunk}`.slice(-1000) })
    proc.on('error', () => reject(new Error('未找到 tar 命令')))
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar 退出码 ${code}: ${tail.trim()}`))))
  })
}

async function downloadTo(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  return buf.length
}

async function main() {
  const pkgDir = path.join(SERVICE_DIR, 'node_modules', '@deepseek-ai', 'dsh')
  const current = readVersion(pkgDir)

  // Latest version from the mirror (latest.php self-syncs against upstream).
  let latest = null
  let bundle = null
  let expectSha = null
  let mirrorBase = null
  const errors = []
  for (const base of MIRRORS) {
    for (const manifest of ['latest.php', 'latest.json']) {
      try {
        const info = await fetchJson(`${base}/${manifest}`)
        if (typeof info?.version === 'string') {
          latest = info.version
          bundle = typeof info.bundle === 'string' && info.bundle !== '' ? info.bundle : null
          expectSha = typeof info.sha256 === 'string' && info.sha256 !== '' ? info.sha256.toLowerCase() : null
          mirrorBase = base
          break
        }
      } catch (error) {
        errors.push(`${base}/${manifest}: ${error.message}`)
      }
    }
    if (latest) break
  }
  if (!latest) {
    console.error(`[sync-engine] 无法获取镜像最新版本：${errors.join('；')}`)
    process.exit(1)
  }

  console.log(`[sync-engine] 镜像最新引擎：${latest}（来源 ${mirrorBase}）`)
  console.log(`[sync-engine] 当前打包内置：${current ?? '无'}`)
  if (current && compareVersions(latest, current) <= 0) {
    console.log('[sync-engine] 内置引擎已是最新，无需同步')
    return
  }

  // Resolve the bundle: local downloads first, then the mirror URL.
  const safeVersion = latest.replace(/[^0-9A-Za-z.-]/g, '')
  const localFile = path.join(DOWNLOADS, `dsh-engine-${safeVersion}.tgz`)
  let file = null
  if (fs.existsSync(localFile)) {
    const actual = sha256(localFile)
    if (!expectSha || actual === expectSha) {
      file = localFile
      console.log(`[sync-engine] 使用本地引擎包：${localFile}`)
    } else {
      console.log(`[sync-engine] 本地引擎包 sha256 不匹配，改从镜像下载`)
    }
  }
  if (!file) {
    if (!bundle) {
      console.error('[sync-engine] 镜像未提供 bundle 下载地址，无法同步')
      process.exit(1)
    }
    const url = bundle.startsWith('http') ? bundle : `${mirrorBase}/${bundle.replace(/^\/+/, '')}`
    console.log(`[sync-engine] 正在下载：${url}`)
    const tmp = path.join(SERVICE_DIR, `dsh-engine-${safeVersion}.tgz`)
    const size = await downloadTo(url, tmp)
    if (expectSha) {
      const actual = sha256(tmp)
      if (actual !== expectSha) {
        fs.rmSync(tmp, { force: true })
        console.error(`[sync-engine] 下载包 sha256 校验失败（期望 ${expectSha.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`)
        process.exit(1)
      }
    }
    file = tmp
    console.log(`[sync-engine] 下载完成：${(size / 1048576).toFixed(1)} MB`)
  }

  // Swap node_modules atomically enough for a build machine: extract aside,
  // verify the new package.json, then replace.
  console.log('[sync-engine] 正在替换 dsh-service/node_modules …')
  const aside = path.join(SERVICE_DIR, `node_modules.new-${Date.now()}`)
  fs.mkdirSync(aside, { recursive: true })
  try {
    await extractTgz(file, aside)
    const newPkg = path.join(aside, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    if (!fs.existsSync(newPkg)) throw new Error('解压结果缺少 @deepseek-ai/dsh，已中止替换')
    const old = path.join(SERVICE_DIR, 'node_modules.old')
    fs.rmSync(old, { recursive: true, force: true })
    if (fs.existsSync(path.join(SERVICE_DIR, 'node_modules'))) {
      fs.renameSync(path.join(SERVICE_DIR, 'node_modules'), old)
    }
    fs.renameSync(path.join(aside, 'node_modules'), path.join(SERVICE_DIR, 'node_modules'))
    fs.rmSync(old, { recursive: true, force: true })
  } finally {
    fs.rmSync(aside, { recursive: true, force: true })
    if (file !== localFile) fs.rmSync(file, { force: true })
  }

  const now = readVersion(pkgDir)
  if (now !== latest) {
    console.error(`[sync-engine] 同步后版本异常：期望 ${latest}，实际 ${now}`)
    process.exit(1)
  }
  console.log(`[sync-engine] 完成：打包将内置引擎 ${now}`)
}

main().catch((error) => {
  console.error(`[sync-engine] 同步失败：${error.message}`)
  process.exit(1)
})
