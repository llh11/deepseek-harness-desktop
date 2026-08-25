'use strict'
/**
 * One-time migration OFF the desktop provider manager (removed in 1.4.0).
 *
 * Before 1.4.0 the desktop shipped its own "模型与多模态" panel: providers
 * lived in $DSH_HOME/dsh-desktop/providers.json, keys in $DSH_HOME/.env
 * (DSH_DESKTOP_KEY_*), and Anthropic-native upstreams were routed through the
 * local translation gateway (127.0.0.1:3081). The official engine now covers
 * all of it natively — the official "模型" page edits llm-pi-ai routes, and
 * llm-pi-ai speaks anthropic-messages directly since 0.1.1.
 *
 * This migration rewrites every desktop-managed route in settings.yaml to
 * point straight at its upstream (gateway prefix removed, correct `api`
 * protocol named), keeps the existing apiKeyEnv reference — which still
 * resolves, because $DSH_HOME/.env is the official credentials fallback
 * layer — and then archives providers.json so it never migrates twice.
 */
const fs = require('node:fs')
const { files, ensureDesktopDir } = require('./paths')
const yaml = require('./yaml')

/** Marker file written next to the archived store so the migration is idempotent. */
function migratedMarker() {
  return `${files.providerStore}.migrated`
}

function envName(providerId) {
  return `DSH_DESKTOP_KEY_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
}

/** Read the legacy desktop provider store; [] when none ever existed. */
function readLegacyStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(files.providerStore, 'utf8'))
    return Array.isArray(parsed?.providers) ? parsed.providers : []
  } catch {
    return []
  }
}

/**
 * Run the migration once. Safe to call on every boot: after the first run the
 * archived store is gone and the marker exists, so later calls are no-ops.
 * @returns {{migrated: number, skipped: boolean, details: string[]}}
 */
function migrate() {
  if (fs.existsSync(migratedMarker())) return { migrated: 0, skipped: true, details: [] }
  const providers = readLegacyStore()
  if (providers.length === 0) {
    // Nothing to carry over — still mark the migration done so a leftover
    // providers.json created by a 1.3.x install is never re-read.
    try {
      ensureDesktopDir()
      fs.writeFileSync(migratedMarker(), new Date().toISOString(), 'utf8')
    } catch { /* best effort */ }
    return { migrated: 0, skipped: false, details: [] }
  }

  let root = {}
  try {
    root = yaml.load(fs.readFileSync(files.dshSettings, 'utf8')) ?? {}
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // settings.yaml exists but cannot be parsed: refuse to touch it and keep
      // the store unarchived so a later boot can retry.
      return { migrated: 0, skipped: false, details: [`settings.yaml 解析失败，迁移未执行：${error.message}`] }
    }
    // A missing settings.yaml is simply an empty document.
  }
  const llm = root['llm-pi-ai'] ?? {}
  const routes = { ...(llm.providers ?? {}) }
  const details = []
  let migrated = 0

  for (const provider of providers) {
    const id = String(provider?.id ?? '')
    if (id === '') continue
    const existing = routes[id] && typeof routes[id] === 'object' ? routes[id] : {}
    const models = (Array.isArray(provider.models) ? provider.models : [])
      .filter((model) => typeof model?.id === 'string' && model.id.trim() !== '')
      .map((model) => (model.input ? { id: model.id.trim(), input: model.input } : { id: model.id.trim() }))
    const entry = {
      ...existing,
      displayName: provider.displayName || existing.displayName || id,
      // Direct upstream connection: anthropic-messages is native to llm-pi-ai
      // since 0.1.1, so the desktop translation gateway is no longer involved.
      api: provider.upstreamKind === 'anthropic' ? 'anthropic-messages' : 'openai-completions',
      baseURL: String(provider.upstreamBaseURL ?? existing.baseURL ?? '').replace(/\/+$/, ''),
      apiKeyEnv: existing.apiKeyEnv ?? envName(id),
    }
    if (Array.isArray(provider.defaultInput) && provider.defaultInput.length > 0
      && JSON.stringify(provider.defaultInput) !== '["text"]') {
      entry.defaultInput = provider.defaultInput
    }
    if (models.length > 0) entry.models = models
    routes[id] = entry
    migrated += 1
    details.push(`${id} → 直连 ${entry.baseURL}（${entry.api}）`)
  }

  llm.providers = routes
  root['llm-pi-ai'] = llm
  try {
    fs.writeFileSync(files.dshSettings, `${yaml.dump(root)}\n`, 'utf8')
  } catch (error) {
    return { migrated: 0, skipped: false, details: [`settings.yaml 写入失败，迁移未完成：${error.message}`] }
  }

  // Archive the legacy store (keep on disk for inspection) and mark done.
  try {
    fs.renameSync(files.providerStore, `${files.providerStore}.bak`)
  } catch { /* renaming an absent file is fine */ }
  try {
    ensureDesktopDir()
    fs.writeFileSync(migratedMarker(), new Date().toISOString(), 'utf8')
  } catch { /* best effort */ }
  return { migrated, skipped: false, details }
}

module.exports = { migrate }
