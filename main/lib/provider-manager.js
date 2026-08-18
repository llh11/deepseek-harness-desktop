'use strict'
/**
 * Visual provider manager — the robust fix for third-party / multimodal
 * models. dsh refuses to send images to hand-entered models until the route
 * declares `input: [text, image]`, which officially requires hand-editing
 * $DSH_HOME/settings.yaml. This manager owns that projection: providers are
 * edited visually, keys land in $DSH_HOME/.env, and modalities are declared
 * per model (with smart vision detection) — no YAML editing by hand.
 */
const fs = require('node:fs')
const path = require('node:path')
const { files, ensureDesktopDir } = require('./paths')
const yaml = require('./yaml')
const settings = require('./settings-store')

/** Vision-model heuristics; matched case-insensitively against model ids. */
const VISION_PATTERNS = [
  /gpt-4o/, /gpt-4\.1/, /gpt-4-turbo/, /gpt-5/, /\bo4\b/, /omni/,
  /-vl\b|vl-|vision/, /^glm-4v/, /^qvq/, /^gemini/, /claude-3/, /claude-sonnet/, /claude-opus/,
  /multimodal/, /llava/, /internvl/, /minicpm-v/, /o3/, /step-1v/, /step-3/, /doubao.*vision/,
]

/** Suggest input modalities for a model id. */
function suggestInput(modelId) {
  return VISION_PATTERNS.some((pattern) => pattern.test(modelId.toLowerCase()))
    ? ['text', 'image']
    : ['text']
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(files.providerStore, 'utf8'))
  } catch {
    return { providers: [] }
  }
}

function saveStore(store) {
  ensureDesktopDir()
  fs.writeFileSync(files.providerStore, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

/** Read $DSH_HOME/settings.yaml as an object; a missing file reads as {}. */
function readDshSettings() {
  let text
  try {
    text = fs.readFileSync(files.dshSettings, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
  try {
    return yaml.load(text) ?? {}
  } catch (error) {
    throw new Error(`无法解析 ${files.dshSettings}：${error.message}`)
  }
}

function writeDshSettings(root) {
  const text = yaml.dump(root)
  fs.writeFileSync(files.dshSettings, `${text}\n`, 'utf8')
}

/** Upsert KEY=value into $DSH_HOME/.env preserving unrelated lines. */
function upsertEnv(key, value) {
  const lines = fs.existsSync(files.dshEnv) ? fs.readFileSync(files.dshEnv, 'utf8').split(/\r?\n/) : []
  const kept = lines.filter((line) => line.trim() !== '' && !line.startsWith(`${key}=`))
  if (typeof value === 'string' && value !== '') kept.push(`${key}=${value}`)
  ensureDesktopDir()
  fs.writeFileSync(files.dshEnv, `${kept.join('\n').replace(/\n+$/, '')}\n`, 'utf8')
}

function envName(providerId) {
  return `DSH_DESKTOP_KEY_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
}

/** The baseURL dsh should use: gateway prefix when routed through it. */
function dshBaseURL(provider, gatewayPort) {
  if (provider.viaGateway) return `http://127.0.0.1:${gatewayPort}/v1/p/${provider.id}`
  return provider.upstreamBaseURL
}

/** Project every managed provider into settings.yaml without touching foreign keys. */
function projectToSettings() {
  const store = loadStore()
  const gatewayPort = settings.get().gateway.port
  const root = readDshSettings()
  const llm = root['llm-pi-ai'] ?? {}
  const providers = { ...(llm.providers ?? {}) }
  const managedIds = new Set(store.providers.map((provider) => provider.id))
  for (const provider of store.providers) {
    const models = provider.models.map((model) => (model.input ? { id: model.id, input: model.input } : { id: model.id }))
    const entry = {
      displayName: provider.displayName || provider.id,
      api: 'openai-completions',
      baseURL: dshBaseURL(provider, gatewayPort),
      apiKeyEnv: envName(provider.id),
    }
    if (provider.defaultInput && provider.defaultInput.length > 0 && JSON.stringify(provider.defaultInput) !== '["text"]') {
      entry.defaultInput = provider.defaultInput
    }
    entry.models = models
    providers[provider.id] = entry
  }
  // Remove providers that this manager created but the user deleted here.
  for (const key of Object.keys(providers)) {
    if (!managedIds.has(key) && typeof providers[key] === 'object' && providers[key] !== null
      && typeof providers[key].apiKeyEnv === 'string' && providers[key].apiKeyEnv.startsWith('DSH_DESKTOP_KEY_')) {
      delete providers[key]
    }
  }
  if (Object.keys(providers).length > 0) llm.providers = providers
  else delete llm.providers
  root['llm-pi-ai'] = llm
  writeDshSettings(root)
}

/** List managed providers with redacted keys. */
function list() {
  const store = loadStore()
  const envText = fs.existsSync(files.dshEnv) ? fs.readFileSync(files.dshEnv, 'utf8') : ''
  return store.providers.map((provider) => ({
    ...provider,
    hasKey: new RegExp(`^${envName(provider.id)}=.+`, 'm').test(envText),
  }))
}

/** Create or update a provider and project it into dsh settings. */
function save(input) {
  const id = String(input.id ?? '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Provider ID 只能包含小写字母、数字和连字符，且以字母或数字开头')
  if (typeof input.upstreamBaseURL !== 'string' || !/^https?:\/\//.test(input.upstreamBaseURL.trim())) {
    throw new Error('上游 Base URL 必须以 http:// 或 https:// 开头')
  }
  if (!Array.isArray(input.models) || input.models.length === 0) throw new Error('至少需要一个模型')
  for (const model of input.models) {
    if (typeof model.id !== 'string' || model.id.trim() === '') throw new Error('模型 ID 不能为空')
    if (model.input && (!Array.isArray(model.input) || model.input.length === 0)) throw new Error(`模型 ${model.id} 的输入模态列表不能为空`)
  }

  const store = loadStore()
  const existing = store.providers.find((provider) => provider.id === id)
  const provider = {
    id,
    displayName: String(input.displayName ?? id).trim() || id,
    upstreamKind: input.upstreamKind === 'anthropic' ? 'anthropic' : 'openai',
    upstreamBaseURL: input.upstreamBaseURL.trim().replace(/\/+$/, ''),
    viaGateway: Boolean(input.viaGateway),
    defaultInput: Array.isArray(input.defaultInput) && input.defaultInput.length > 0 ? input.defaultInput : ['text'],
    models: input.models.map((model) => ({
      id: model.id.trim(),
      ...(model.input ? { input: model.input } : {}),
    })),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  if (existing) Object.assign(existing, provider)
  else store.providers.push(provider)
  saveStore(store)
  if (typeof input.apiKey === 'string' && input.apiKey.trim() !== '') upsertEnv(envName(id), input.apiKey.trim())
  projectToSettings()
  return list()
}

/** Remove a managed provider everywhere (settings.yaml projection, .env, store). */
function remove(id) {
  const store = loadStore()
  const before = store.providers.length
  store.providers = store.providers.filter((provider) => provider.id !== id)
  if (store.providers.length === before) throw new Error(`未找到 Provider：${id}`)
  saveStore(store)
  upsertEnv(envName(id), null)
  projectToSettings()
  return list()
}

/** Resolve the actual key for gateway forwarding (from $DSH_HOME/.env). */
function resolveKey(id) {
  if (!fs.existsSync(files.dshEnv)) return ''
  const text = fs.readFileSync(files.dshEnv, 'utf8')
  const match = text.match(new RegExp(`^${envName(id)}=(.+)$`, 'm'))
  return match ? match[1].trim() : ''
}

/** Full provider record for the gateway. */
function getProvider(id) {
  return loadStore().providers.find((provider) => provider.id === id) ?? null
}

/** Fetch available models from an endpoint; doubles as a connection test. A blank
 * key with a providerId resolves the stored key from $DSH_HOME/.env. */
async function fetchModels({ baseURL, apiKey, upstreamKind, providerId }) {
  const base = String(baseURL ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) throw new Error('Base URL 必须以 http:// 或 https:// 开头')
  const key = typeof apiKey === 'string' && apiKey.trim() !== ''
    ? apiKey.trim()
    : typeof providerId === 'string' ? resolveKey(providerId) : ''
  const isAnthropic = upstreamKind === 'anthropic'
  const url = isAnthropic && !/\/v\d+$/.test(base) ? `${base}/v1/models` : `${base}/models`
  const headers = isAnthropic
    ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${key}` }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`端点返回 ${response.status} ${response.statusText}`)
  const body = await response.json()
  const rows = Array.isArray(body?.data) ? body.data : []
  return rows.map((row) => String(row?.id ?? '')).filter((id) => id !== '')
}

module.exports = { list, save, remove, fetchModels, suggestInput, getProvider, resolveKey, envName, dshBaseURL, projectToSettings }
