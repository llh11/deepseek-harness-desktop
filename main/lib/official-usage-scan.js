'use strict'
/**
 * Official-engine usage scanner. Runs as a child process under the bundled
 * Node runtime (>=22.19) because session logs may be .jsonl.zstd and only
 * recent Node ships zstd in node:zlib.
 *
 * Usage: node official-usage-scan.js <sessionsRoot> <cacheFile>
 * Stdout: one JSON line { scanned, files, records }
 * Cache file shape: { files: { [path]: { mtimeMs, size, records } } }
 * Unchanged files (same mtime+size) are served from cache; changed or new
 * files are rescanned, vanished files drop out.
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const sessionsRoot = process.argv[2]
const cacheFile = process.argv[3]

function readLog(file) {
  const raw = fs.readFileSync(file)
  if (file.endsWith('.zstd')) return zlib.zstdDecompressSync(raw).toString('utf8')
  return raw.toString('utf8')
}

function* walk(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.jsonl.zstd'))) yield full
  }
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Parse one log file into usage records. The header line carries session meta. */
function scanFile(file) {
  const records = []
  let text
  try { text = readLog(file) } catch { return records }
  let sessionModel = null
  let sessionProvider = null
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let event
    try { event = JSON.parse(trimmed) } catch { continue }
    if (event?.type === 'session') {
      sessionModel = typeof event.model === 'string' ? event.model : null
      sessionProvider = typeof event.provider === 'string' ? event.provider : null
      continue
    }
    if (event?.type !== 'assistant/message') continue
    const usage = event.data?.usage
    if (!usage || typeof usage !== 'object') continue
    const input = num(usage.inputTokens)
    const output = num(usage.outputTokens)
    if (input === 0 && output === 0) continue
    const source = event.data?.message?.source ?? {}
    records.push({
      ts: typeof event.time === 'number' ? event.time : 0,
      model: typeof source.model === 'string' ? source.model : sessionModel,
      provider: typeof source.provider === 'string' ? source.provider : sessionProvider,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: num(usage.cacheReadTokens),
      reasoningTokens: num(usage.reasoningTokens),
    })
  }
  return records
}

const prior = (() => {
  try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch { return { files: {} } }
})()
const priorFiles = prior.files && typeof prior.files === 'object' ? prior.files : {}

const nextFiles = {}
let scanned = 0
let fileCount = 0

for (const file of walk(sessionsRoot)) {
  fileCount += 1
  let stat
  try { stat = fs.statSync(file) } catch { continue }
  const cached = priorFiles[file]
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size && Array.isArray(cached.records)) {
    nextFiles[file] = cached
    continue
  }
  nextFiles[file] = { mtimeMs: stat.mtimeMs, size: stat.size, records: scanFile(file) }
  scanned += 1
}

const records = Object.values(nextFiles).flatMap((entry) => entry.records)
try { fs.writeFileSync(cacheFile, JSON.stringify({ files: nextFiles }), 'utf8') } catch { /* best effort */ }

process.stdout.write(JSON.stringify({ scanned, files: fileCount, records }) + '\n')
