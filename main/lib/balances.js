'use strict'
/**
 * Account balances over the OFFICIAL configuration surface. The official
 * DeepSeek account's key lives wherever the official "模型" page put it
 * (credentials store / env), and every custom llm-pi-ai provider route in
 * settings.yaml names its key through `apiKeyEnv` — both resolve through the
 * same official credential layering, so this module never stores or writes
 * keys itself.
 */
const fs = require('node:fs')
const credentials = require('./official-credentials')
const { files } = require('./paths')
const yaml = require('./yaml')

/** Read llm-pi-ai provider routes from $DSH_HOME/settings.yaml; {} when absent. */
function readProviderRoutes() {
  let text
  try {
    text = fs.readFileSync(files.dshSettings, 'utf8')
  } catch {
    return {}
  }
  let root
  try {
    root = yaml.load(text) ?? {}
  } catch {
    return {}
  }
  const providers = root?.['llm-pi-ai']?.providers
  return providers && typeof providers === 'object' ? providers : {}
}

/** DeepSeek billing endpoint helper: GET {root}/user/balance. */
async function deepseekBalance(root, key) {
  const response = await fetch(`${root}/user/balance`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return { balance: null, note: `查询失败（HTTP ${response.status}）` }
  const body = await response.json()
  const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : []
  if (infos.length === 0) return { balance: null, note: '未返回余额信息' }
  return {
    balance: infos.map((info) => `${info.total_balance} ${info.currency === 'CNY' ? 'CNY' : (info.currency ?? '')}`.trim()).join(' / '),
    note: null,
  }
}

/**
 * Query balances for the official DeepSeek account plus every custom
 * llm-pi-ai provider route. Only DeepSeek billing endpoints report a number;
 * other providers show a graceful "not supported" note instead of failing.
 */
async function balances() {
  const rows = []
  const officialKey = credentials.resolve('DEEPSEEK_API_KEY')
  const officialRow = { id: 'deepseek-official', displayName: 'DeepSeek 官方（内置）', balance: null, note: null }
  if (officialKey === '') {
    rows.push({ ...officialRow, note: '未配置 DEEPSEEK_API_KEY（在官方「模型」板块填写密钥后自动保存）' })
  } else {
    try {
      rows.push({ ...officialRow, ...(await deepseekBalance('https://api.deepseek.com', officialKey)) })
    } catch (error) {
      rows.push({ ...officialRow, note: `查询失败：${error.message}` })
    }
  }

  for (const [id, route] of Object.entries(readProviderRoutes())) {
    if (!route || typeof route !== 'object') continue
    const baseRow = { id, displayName: route.displayName || id, balance: null, note: null }
    const key = typeof route.apiKeyEnv === 'string' && route.apiKeyEnv !== ''
      ? credentials.resolve(route.apiKeyEnv)
      : ''
    if (key === '') {
      rows.push({ ...baseRow, note: '该 Provider 未配置密钥（在官方「模型」板块维护）' })
      continue
    }
    const host = String(route.baseURL ?? '').toLowerCase()
    if (!host.includes('deepseek')) {
      rows.push({ ...baseRow, note: '该服务商暂不支持余额查询' })
      continue
    }
    try {
      const root = String(route.baseURL).replace(/\/+$/, '').replace(/\/v\d+$/, '')
      rows.push({ ...baseRow, ...(await deepseekBalance(root, key)) })
    } catch (error) {
      rows.push({ ...baseRow, note: `查询失败：${error.message}` })
    }
  }
  return rows
}

module.exports = { balances }
