'use strict'
/**
 * Usage tracker: records token consumption of model requests (observed at the
 * local translation gateway) into a JSONL log, and aggregates statistics for
 * the settings UI. Prices are per-million-token CNY estimates for cost
 * approximation; unknown models simply omit the cost.
 */
const fs = require('node:fs')
const path = require('node:path')
const { desktopDir } = require('./paths')

const LOG_NAME = 'usage-log.jsonl'

/** CNY per 1M tokens: [input, output]. Best-effort public list prices. */
const PRICES = {
  'deepseek-chat': [2, 3],
  'deepseek-reasoner': [4, 16],
  'deepseek-v3': [2, 3],
  'deepseek-v4': [2, 3],
}

function logPath() {
  return path.join(desktopDir, LOG_NAME)
}

function priceFor(model) {
  const key = String(model ?? '').toLowerCase()
  for (const [name, price] of Object.entries(PRICES)) {
    if (key.includes(name)) return price
  }
  return null
}

/** Append one record. Never throws — statistics must not break the proxy. */
function record(entry) {
  try {
    const line = JSON.stringify({
      ts: entry.ts ?? Date.now(),
      providerId: String(entry.providerId ?? ''),
      model: String(entry.model ?? ''),
      promptTokens: Math.max(0, entry.promptTokens | 0),
      completionTokens: Math.max(0, entry.completionTokens | 0),
      source: entry.source ?? 'gateway',
    })
    fs.appendFileSync(logPath(), line + '\n', 'utf8')
  } catch { /* best effort */ }
}

function readAll() {
  let text = ''
  try { text = fs.readFileSync(logPath(), 'utf8') } catch { return [] }
  const rows = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try { rows.push(JSON.parse(line)) } catch { /* skip corrupt line */ }
  }
  return rows
}

function withCost(row) {
  const price = priceFor(row.model)
  const cost = price ? (row.promptTokens * price[0] + row.completionTokens * price[1]) / 1_000_000 : null
  return { ...row, cost }
}

function aggregate(rows) {
  const sum = { requests: rows.length, prompt: 0, completion: 0, cost: null }
  let costTotal = 0
  let costSeen = false
  for (const row of rows) {
    sum.prompt += row.promptTokens
    sum.completion += row.completionTokens
    const price = priceFor(row.model)
    if (price) {
      costSeen = true
      costTotal += (row.promptTokens * price[0] + row.completionTokens * price[1]) / 1_000_000
    }
  }
  if (costSeen) sum.cost = costTotal
  return sum
}

/** Aggregated statistics for the settings UI. */
function stats() {
  const rows = readAll().map(withCost)
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const weekStart = now - 7 * 86_400_000
  const today = rows.filter((row) => row.ts >= dayStart)
  const week = rows.filter((row) => row.ts >= weekStart)
  const byModel = new Map()
  for (const row of rows) {
    const key = row.model || '(未知模型)'
    if (!byModel.has(key)) byModel.set(key, [])
    byModel.get(key).push(row)
  }
  return {
    today: aggregate(today),
    week: aggregate(week),
    total: aggregate(rows),
    models: [...byModel.entries()]
      .map(([model, items]) => ({ model, ...aggregate(items) }))
      .sort((a, b) => (b.prompt + b.completion) - (a.prompt + a.completion))
      .slice(0, 12),
    recent: rows.slice(-20).reverse(),
  }
}

function clear() {
  try { fs.writeFileSync(logPath(), '', 'utf8') } catch { /* best effort */ }
}

module.exports = { record, stats, clear }
