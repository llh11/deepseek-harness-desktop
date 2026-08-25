'use strict'
/**
 * Official-engine usage aggregation. The engine records every request's
 * TokenUsage (input/output/cache/reasoning) into per-session event logs under
 * $DSH_HOME/sessions — possibly zstd-compressed. Since Electron's embedded
 * Node lacks zstd, the scan runs in the bundled Node runtime via
 * official-usage-scan.js (incremental: unchanged files are cached by mtime).
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { dshHome, desktopDir, ensureDesktopDir } = require('./paths')
const runtime = require('./runtime')
const { callRpc } = require('./service-rpc')

const SCANNER = path.join(__dirname, 'official-usage-scan.js')

/**
 * The scanner must be executable by the EXTERNAL bundled Node process. Inside
 * a packaged app the script sits in app.asar, which plain Node cannot read —
 * so on first use the script is copied out to $DSH_HOME/dsh-desktop and the
 * copy is executed. (This is why "官方用量读取失败" appeared in packaged
 * builds while dev runs worked.)
 */
function scannerScript() {
  if (!SCANNER.includes('app.asar')) return SCANNER
  const deployed = path.join(desktopDir, 'official-usage-scan.js')
  try {
    const current = fs.existsSync(deployed) ? fs.readFileSync(deployed, 'utf8') : ''
    const source = fs.readFileSync(SCANNER, 'utf8')
    if (current !== source) {
      ensureDesktopDir()
      fs.writeFileSync(deployed, source, 'utf8')
    }
    return deployed
  } catch {
    return SCANNER
  }
}

let lastResult = null
let running = null

function sessionsRoot() {
  return path.join(dshHome, 'sessions')
}

function cacheFile() {
  ensureDesktopDir()
  return path.join(desktopDir, 'official-usage-cache.json')
}

/** Run the scanner once; concurrent callers share the in-flight run. */
function scan() {
  if (running) return running
  const node = runtime.nodeExe()
  if (!node) return Promise.reject(new Error('未找到随包 Node 运行时，无法解析官方会话日志'))
  running = new Promise((resolve, reject) => {
    const proc = spawn(node, [scannerScript(), sessionsRoot(), cacheFile()], { windowsHide: true })
    let out = ''
    let err = ''
    proc.stdout.on('data', (chunk) => { out += chunk.toString() })
    proc.stderr.on('data', (chunk) => { err = `${err}${chunk}`.slice(-2000) })
    proc.on('error', (error) => { running = null; reject(error) })
    proc.on('close', (code) => {
      running = null
      if (code !== 0) {
        reject(new Error(`会话日志扫描失败（退出码 ${code}）：${err.trim() || '无输出'}`))
        return
      }
      try {
        const parsed = JSON.parse(out.trim().split('\n').pop())
        lastResult = parsed
        resolve(parsed)
      } catch (error) {
        reject(new Error(`扫描结果解析失败：${error.message}`))
      }
    })
  })
  return running
}

function sum(rows) {
  const total = { requests: rows.length, input: 0, output: 0, cacheRead: 0, reasoning: 0 }
  for (const row of rows) {
    total.input += row.inputTokens
    total.output += row.outputTokens
    total.cacheRead += row.cacheReadTokens ?? 0
    total.reasoning += row.reasoningTokens ?? 0
  }
  return total
}

/** Official model catalog (llm.models RPC — the same groups the settings
 * surface's model picker shows). Null when the service is offline. */
async function modelCatalog() {
  try {
    const value = await callRpc('llm.models', {})
    return {
      groups: (value?.groups ?? []).map((group) => ({
        provider: String(group?.id ?? ''),
        providerName: String(group?.name ?? group?.id ?? ''),
        models: (group?.models ?? []).map((model) => ({ id: String(model?.id ?? ''), name: String(model?.name ?? model?.id ?? '') })),
      })).filter((group) => group.provider !== ''),
      failures: (value?.failures ?? []).map((failure) => String(failure?.message ?? failure?.name ?? '目录加载失败')),
    }
  } catch {
    return null
  }
}

/** Aggregated statistics for the settings UI, joined with the official model
 * catalog so every selectable model shows its usage (zero when unused). */
async function stats() {
  const result = await scan()
  const rows = result.records.filter((row) => row.ts > 0)
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const weekStart = Date.now() - 7 * 86_400_000
  const byModel = new Map()
  for (const row of rows) {
    const key = row.model || '(未标注模型)'
    if (!byModel.has(key)) byModel.set(key, [])
    byModel.get(key).push(row)
  }
  const catalog = await modelCatalog()
  const knownIds = new Set()
  const catalogGroups = catalog === null ? [] : catalog.groups.map((group) => ({
    ...group,
    models: group.models.map((model) => {
      knownIds.add(model.id)
      return { ...model, usage: sum(byModel.get(model.id) ?? []) }
    }),
  }))
  return {
    scannedFiles: result.files,
    rescannedFiles: result.scanned,
    today: sum(rows.filter((row) => row.ts >= dayStart)),
    week: sum(rows.filter((row) => row.ts >= weekStart)),
    total: sum(rows),
    models: [...byModel.entries()]
      .map(([model, items]) => ({ model, inCatalog: knownIds.has(model), ...sum(items) }))
      .sort((a, b) => (b.input + b.output) - (a.input + a.output))
      .slice(0, 12),
    catalog: catalog === null ? null : { groups: catalogGroups, failures: catalog.failures },
    recent: rows.slice(-20).reverse(),
  }
}

module.exports = { stats }
