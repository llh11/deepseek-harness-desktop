'use strict'
/**
 * Browser-boot self-heal for community plugins that brick the Web UI.
 *
 * When a plugin installed into the web profile waits on a service the running
 * engine does not provide (e.g. `@nanmicoder/dsh-agent-teams` injects
 * `uiConversation`, a name only the 0.1.2-alpha engine exposes — while the
 * stable engine calls it `conversation`), the official browser boot audit
 * fails loud and the whole UI stays on the "Failed to load plugins" page:
 * even the desktop settings panel (injected into the official UI) is
 * unreachable, so the user has no way out.
 *
 * The heal uses the SAME durable mechanism the plugin market uses: `- id: X`
 * + `disabled: true` rows appended to the profile's user patch layer
 * (`$DSH_HOME/profiles/web/cordis.patch.yml`). The engine watches that file
 * and re-composes within ~1s — disabled entries leave the browser boot graph
 * (client-modules keeps only rows whose fiber exists and is not disabled), so
 * a page refresh finishes the recovery. The plugin stays installed and the
 * market lists it as disabled, ready to re-enable once the engine catches up.
 *
 * Fallbacks: when the plugin's own rows cannot be resolved (broken install)
 * or the hot re-compose does not land in time, the plugin is unregistered from
 * `dsh.profile.bundles` and its patch rows removed, then the caller restarts
 * the service — the profile manifest is only read at boot.
 */
const fs = require('node:fs')
const path = require('node:path')
const { dshHome } = require('./paths')
const yaml = require('./yaml')
const featuredPlugins = require('./featured-plugins')

/** Names that look like npm package ids (the browser audit reports package names). */
const NAME_RE = /^[\w@][\w@/.-]*$/
/** Row ids the patch layer accepts: plain unquoted YAML scalars (market dialect). */
const ROW_ID_RE = /^[A-Za-z0-9_.-]+$/
/** Official infrastructure must never be disabled from the desktop shell. */
const PROTECTED_RE = /^(@deepseek-ai\/|@cordisjs\/|cordis:)/
/** Session loop guard: after three attempts a name only gets manual guidance. */
const MAX_ATTEMPTS = 3

/** attempts per package name within this app session. */
const attempts = new Map()
let lastHealInfo = null

function profileDir() {
  return path.join(dshHome, 'profiles', 'web')
}

function userPatchFile() {
  return path.join(profileDir(), 'cordis.patch.yml')
}

/** Only healable, package-shaped, non-official names make it through. */
function sanitizeFailures(failures) {
  const out = []
  const seen = new Set()
  for (const failure of Array.isArray(failures) ? failures.slice(0, 10) : []) {
    if (failure === null || typeof failure !== 'object') continue
    const name = String(failure.name ?? '').trim()
    const reason = String(failure.reason ?? '').trim().slice(0, 200)
    if (name === '' || name.length > 200 || !NAME_RE.test(name) || seen.has(name)) continue
    seen.add(name)
    out.push({ name, reason })
  }
  return out
}

/** Line-wise scan of insert-row ids a patch text declares (market parser shape).
 * Only ids nested under an `insert:` block count: those are the loader
 * entries the package itself brings in — a bundle patch may also reconfigure
 * foreign rows, and disabling those would take down neighbours. */
function collectInsertIds(text, out) {
  let insertIndent = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '')
    if (line.trim() === '') continue
    const indent = line.length - line.trimStart().length
    if (insertIndent !== null && indent <= insertIndent && !/^\s*-?\s*(id|name|config):/.test(line)) insertIndent = null
    if (/^\s*-?\s*insert:\s*$/.test(line)) { insertIndent = indent; continue }
    const id = /^\s*-?\s*id:\s*['"]?([^'"\s]+)/.exec(line)
    if (id !== null && insertIndent !== null && indent > insertIndent) out.add(id[1])
  }
}

/** Insert rows the profile's own patch layer mounts for one package (written
 * by the market or by hand): ids whose row carries the package name. */
function collectInsertIdsForName(text, packageName, out) {
  let insertIndent = null
  let pendingId = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '')
    if (line.trim() === '') continue
    const indent = line.length - line.trimStart().length
    if (insertIndent !== null && indent <= insertIndent && !/^\s*-?\s*(id|name|config):/.test(line)) { insertIndent = null; pendingId = null }
    if (/^\s*-?\s*insert:\s*$/.test(line)) { insertIndent = indent; pendingId = null; continue }
    const id = /^\s*-?\s*id:\s*['"]?([^'"\s]+)/.exec(line)
    if (id !== null && insertIndent !== null && indent > insertIndent) pendingId = id[1]
    const name = /^\s*-?\s*name:\s*['"]?([^'"\s]+)/.exec(line)
    if (name !== null && insertIndent !== null && indent > insertIndent && name[1] === packageName && pendingId) {
      out.add(pendingId)
    }
  }
}

/** Loader row ids one failing package owns: its own bundle patch (declared
 * `dsh.bundle.patch`), the conventional root patch, and the rows the
 * profile's user patch layer mounts for it. @returns {string[]} */
function rowIdsForPackage(packageName) {
  const ids = new Set()
  const packageDirs = [
    path.join(profileDir(), 'node_modules', ...packageName.split('/')),
    path.join(dshHome, 'profiles', 'node_modules', ...packageName.split('/')),
  ]
  for (const packageDir of packageDirs) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
      const declared = manifest?.dsh?.bundle?.patch
      if (typeof declared === 'string' && declared !== '') {
        collectInsertIds(fs.readFileSync(path.join(packageDir, declared), 'utf8'), ids)
      }
    } catch { /* package not installed at this anchor */ }
    try { collectInsertIds(fs.readFileSync(path.join(packageDir, 'cordis.patch.yml'), 'utf8'), ids) } catch { /* none */ }
  }
  try { collectInsertIdsForName(fs.readFileSync(userPatchFile(), 'utf8'), packageName, ids) } catch { /* no user patch yet */ }
  return [...ids]
}

/** `- id: X` + `disabled: true` rows already present (line-wise, market dialect). */
function readDisableRowIds(patchFile) {
  let text = ''
  try { text = fs.readFileSync(patchFile, 'utf8') } catch { return [] }
  const disables = []
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^- id: ([A-Za-z0-9_.-]+)\s*$/.exec(lines[index] ?? '')
    if (match === null) continue
    if (/^ {2}disabled: true\s*$/.test(lines[index + 1] ?? '')) disables.push(match[1])
  }
  return disables
}

/** Append one disable row, refusing anything that could deepen a broken file:
 * a top-level flow structure, or text that is not a YAML entry list. Appending
 * to a malformed layer would brick the HOST boot (fail-loud patch parsing),
 * which is strictly worse than the browser boot failure being healed. */
function appendDisableRow(patchFile, rowId) {
  const block = `- id: ${rowId}\n  disabled: true\n`
  let text = ''
  try { text = fs.readFileSync(patchFile, 'utf8') } catch { /* created below */ }
  const core = text.trim()
  if (core === '') {
    fs.writeFileSync(patchFile, block)
    return true
  }
  const withoutComments = text.replace(/^[ \t]*#.*$/gm, '').trim()
  if (withoutComments === '') {
    const next = text.endsWith('\n') ? text : `${text}\n`
    fs.writeFileSync(patchFile, `${next}${block}`)
    return true
  }
  // The profile template ships an empty `[]` placeholder: appending after it
  // would create two top-level documents. Comment it out, then append.
  if (withoutComments === '[]' || withoutComments === '[ ]') {
    const commented = text.replace(/^[ \t]*\[[ \t]*\][ \t]*(?:#.*)?(?:\r?\n|$)/m, '# []\n')
    const next = commented.endsWith('\n') ? commented : `${commented}\n`
    fs.writeFileSync(patchFile, `${next}${block}`)
    return true
  }
  const lastContentLine = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#')).pop() ?? ''
  if (/^[[{]/.test(lastContentLine)) return false
  let parsed
  try { parsed = yaml.load(text) } catch { return false }
  if (!Array.isArray(parsed)) return false
  const next = text.endsWith('\n') ? text : `${text}\n`
  fs.writeFileSync(patchFile, `${next}${block}`)
  return true
}

/** Make sure a disable row exists for every id (idempotent).
 * @returns {number} how many of the ids are now disabled. */
function ensureDisableRows(rowIds) {
  const patchFile = userPatchFile()
  const disables = readDisableRowIds(patchFile)
  let present = 0
  for (const rowId of rowIds) {
    if (!ROW_ID_RE.test(rowId)) continue
    if (disables.includes(rowId) || appendDisableRow(patchFile, rowId)) present += 1
  }
  return present
}

/** Poll the served index until the boot graph no longer references the names
 * (the host re-renders `window.__DSH_BOOT__` per request from live state). */
async function waitForGraphWithout(origin, names, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { redirect: 'manual', signal: AbortSignal.timeout(2500) })
      if (response.status > 0 && response.status < 500) {
        const html = await response.text()
        if (!names.some((name) => html.includes(name))) return true
      }
    } catch { /* service warming or gone — retry */ }
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
  return false
}

function manualMessage(names, failures) {
  if (names.length === 0) return ''
  const detail = names.map((name) => `${name}（${failures.find((failure) => failure.name === name)?.reason || '未能激活'}）`).join('、')
  return `无法自动停用：${detail}。请通过官方设置 → 插件市场卸载后重启服务；使用外部服务的请手动重启该服务。`
}

/**
 * Heal a browser boot failure caused by plugins that did not activate.
 *
 * Light path: append `disabled: true` rows for the plugin's own loader
 * entries to the profile user patch layer (hot-reloaded by the engine), then
 * verify the served boot graph dropped them — the caller reloads the page.
 * Heavy path (fallback): unregister the bundle and strip its patch rows,
 * then `restart()` — the profile manifest is only read at boot.
 *
 * @param {Array<{name: string, reason: string}>} failures - parsed from the
 *        official boot page ("@scope/pkg: pending (waiting for service: X)").
 * @param {{origin?: string, restart?: () => Promise<void>}} hooks
 * @returns {Promise<{action: string, reload: boolean, healed: string[], manual: string[], message: string}>}
 */
async function heal(failures, hooks = {}) {
  const { origin, restart } = hooks
  const incoming = sanitizeFailures(failures)
  if (incoming.length === 0) {
    return { action: 'none', reload: false, healed: [], manual: [], message: '' }
  }

  const manual = []
  const candidates = []
  for (const { name } of incoming) {
    if (PROTECTED_RE.test(name)) { manual.push(name); continue }
    if ((attempts.get(name) ?? 0) >= MAX_ATTEMPTS) { manual.push(name); continue }
    candidates.push(name)
    attempts.set(name, (attempts.get(name) ?? 0) + 1)
  }
  if (candidates.length === 0) {
    return { action: 'manual', reload: false, healed: [], manual, message: manualMessage(manual, incoming) }
  }

  const healed = []
  const escalated = []
  for (const name of candidates) {
    const rowIds = rowIdsForPackage(name)
    if (rowIds.length === 0) { escalated.push(name); continue }
    if (ensureDisableRows(rowIds) > 0) healed.push(name)
    else escalated.push(name)
  }

  if (healed.length > 0) {
    const verified = typeof origin === 'string' && /^https?:/.test(origin)
      ? await waitForGraphWithout(origin, healed)
      : true
    if (verified) {
      lastHealInfo = { healed: [...healed], manual: [...manual, ...escalated], at: Date.now() }
      return {
        action: 'disabled', reload: true, healed, manual: [...manual, ...escalated],
        message: `已自动停用未能激活的插件（${healed.join('、')}），页面即将刷新；引擎升级后可在插件市场重新启用。`,
      }
    }
    // Hot re-compose did not land — escalate every name to the heavy path.
    escalated.push(...healed)
    healed.length = 0
  }

  const heavyHealed = []
  for (const name of escalated) {
    if (featuredPlugins.disableCommunityBundle(name)) heavyHealed.push(name)
    else manual.push(name)
  }
  if (heavyHealed.length > 0) {
    if (typeof restart === 'function') {
      lastHealInfo = { healed: [...heavyHealed], manual: [...manual], at: Date.now() }
      await restart()
      return {
        action: 'restarting', reload: false, healed: heavyHealed, manual,
        message: `已停用插件（${heavyHealed.join('、')}），正在重启服务，完成后页面将自动恢复…`,
      }
    }
    lastHealInfo = { healed: [...heavyHealed], manual: [...manual], at: Date.now() }
    return {
      action: 'disabled', reload: true, healed: heavyHealed, manual,
      message: `已停用插件（${heavyHealed.join('、')}），请重启服务后生效。`,
    }
  }

  return { action: 'manual', reload: false, healed: [], manual, message: manualMessage(manual, incoming) }
}

/** Most recent successful heal (for the post-recovery toast). */
function lastHeal() {
  return lastHealInfo
}

module.exports = { heal, lastHeal, waitForGraphWithout }
