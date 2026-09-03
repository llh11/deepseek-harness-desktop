'use strict'
/**
 * Featured community plugins, installed through the OFFICIAL profile
 * mechanism: the packages land in $DSH_HOME/profiles/web via the bundled
 * npm (no pnpm required on the user machine) and are registered in the
 * profile's dsh.profile.bundles so `dsh web` mounts them on next start.
 *
 * Curation deliberately EXCLUDES anything duplicating the official base or
 * this desktop shell (desktop launchers, skill managers, vision bridges for
 * the natively multimodal engine, terminal UIs) — see FEATURED notes.
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { dshHome } = require('./paths')
const runtime = require('./runtime')

/** Curated plugins, hottest first (GitHub stars as of 2026-08). `leftovers`
 * lists $DSH_HOME-relative paths each plugin persists (agent presets, skins,
 * pets, boards, market data) — removed on uninstall so every module the
 * plugin influenced (Agent 预设 included) is fully restored. */
const FEATURED = [
  {
    id: 'dshmarket',
    package: 'dshmarket',
    name: 'DSH 插件市场（dsh-market）',
    stars: '2.6k+',
    url: 'https://github.com/dsh-market/dsh-market',
    summary: '内置可视化插件市场：浏览 / 搜索 1500+ 生态插件，一键安装、热启停、主题切换与配置备份。装好后入口在官方「设置 → Plugin Market」。',
    leftovers: ['profiles/web/.dsh-market'],
  },
  {
    id: 'dsh-web-all',
    package: '@linxin666/dsh-web-all',
    name: 'dsh-web 全家桶（Web UI 增强）',
    stars: '6.2k+',
    url: 'https://github.com/zhu1090093659/dsh-web',
    summary: '任务看板（cron 定时真实执行）、SSH 运维面板、移动端远程、Git 图谱、皮肤工坊。与桌面端/官方重复的子项（桌面启动器、Skill 中心、图像理解）装后可在官方「插件配置」中关闭。',
    // task-board/.agent-presets/liangshen/skin-center/pet.json: data dirs and
    // the 梁神模式 agent preset the bundle's plugins write into $DSH_HOME.
    leftovers: ['task-board', '.agent-presets/liangshen', 'skin-center', 'skin-center-active.json', 'pet.json', 'profiles/web/package.json.bak'],
  },
]

function profileDir() {
  return path.join(dshHome, 'profiles', 'web')
}

/** The web profile must exist (created on first `dsh web` boot). */
function ensureProfile() {
  const dir = profileDir()
  const manifest = path.join(dir, 'package.json')
  if (!fs.existsSync(manifest)) {
    throw new Error('未找到 web profile（请先启动一次服务），无法安装插件')
  }
  return dir
}

/** Register a bundle in the profile manifest (idempotent). */
function registerBundle(dir, packageName) {
  const file = path.join(dir, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  manifest.dsh = manifest.dsh ?? { profile: {} }
  manifest.dsh.profile = manifest.dsh.profile ?? {}
  const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : []
  if (!bundles.includes(packageName)) bundles.push(packageName)
  manifest.dsh.profile.bundles = bundles
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** Remove a bundle from the profile manifest (idempotent). */
function unregisterBundle(dir, packageName) {
  const file = path.join(dir, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  const bundles = manifest?.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) return
  manifest.dsh.profile.bundles = bundles.filter((name) => name !== packageName)
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** Already present in bundles (=> installed)? */
function isInstalled(packageName) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(profileDir(), 'package.json'), 'utf8'))
    return Array.isArray(manifest?.dsh?.profile?.bundles) && manifest.dsh.profile.bundles.includes(packageName)
  } catch {
    return false
  }
}

/** Run one bundled-npm command inside the profile dir, streaming progress.
 * --legacy-peer-deps is mandatory for the community plugin ecosystem: peer
 * ranges against @deepseek-ai/* frequently trail the installed engine
 * (e.g. ^0.1.0-rc.8 vs 0.1.1-rc.2) and strict npm would ERESOLVE-fail the
 * whole install over harmless engine-version drift. */
function npmRun(npmArgs, send) {
  return new Promise((resolve, reject) => {
    const node = runtime.nodeExe()
    const npmCli = runtime.npmCli()
    if (!node || !npmCli) {
      reject(new Error('未找到随包 Node/npm 运行时，无法执行该操作'))
      return
    }
    const dir = ensureProfile()
    const proc = spawn(node, [npmCli, ...npmArgs, '--prefix', dir, '--legacy-peer-deps', '--registry', 'https://registry.npmmirror.com', '--no-audit', '--no-fund', '--loglevel', 'error'], {
      cwd: dir,
      env: { ...process.env, PATH: `${path.dirname(node)}${path.delimiter}${process.env.PATH ?? ''}` },
      windowsHide: true,
    })
    let tail = []
    const onLine = (line) => {
      const text = line.trim()
      if (text === '') return
      tail.push(text)
      if (tail.length > 30) tail = tail.slice(-30)
      send?.(text)
    }
    proc.stdout.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(onLine))
    proc.stderr.on('data', (chunk) => chunk.toString().split(/\r?\n/).forEach(onLine))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`npm 退出码 ${code}：\n${tail.slice(-6).join('\n')}`))
    })
  })
}

/** Install packages (@latest) into the web profile. */
function npmInstall(packages, send) {
  const list = Array.isArray(packages) ? packages : [packages]
  return npmRun(['install', ...list.map((name) => `${name}@latest`)], send)
}

/** Featured catalog with live installed flags. */
function catalog() {
  return FEATURED.map((item) => ({ ...item, installed: isInstalled(item.package) }))
}

/** Best-effort repair: install arbitrary packages into the web profile
 * (used by the service manager to heal profile bundles broken by a failed
 * or partial plugin install). @returns {Promise<boolean>} success. */
async function installPackagesIntoProfile(packages, send = () => {}) {
  if (!Array.isArray(packages) || packages.length === 0) return false
  try {
    ensureProfile()
    await npmInstall(packages, (line) => send(line))
    return true
  } catch {
    return false
  }
}

/**
 * Install one featured plugin: npm install into the web profile, register
 * the bundle, verify the package landed. Restart the service to mount it.
 */
async function install({ id }, send = () => {}) {
  const item = FEATURED.find((entry) => entry.id === id)
  if (!item) throw new Error('未知精选插件')
  if (isInstalled(item.package)) {
    return { ok: true, alreadyInstalled: true, message: '该插件已安装，重启服务后即可生效' }
  }
  const dir = ensureProfile()
  send(`正在安装 ${item.package}（随包 npm，无需 pnpm）…`)
  await npmInstall(item.package, send)
  const pkgDir = path.join(dir, 'node_modules', ...item.package.split('/'))
  if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
    throw new Error('安装后未找到插件包，请查看日志排查')
  }
  registerBundle(dir, item.package)
  send('已注册到 web profile（dsh.profile.bundles）')
  return { ok: true, message: '安装完成，重启服务后生效' }
}

/** Remove the plugin's own entries from the profile's cordis.patch.yml
 * (enable/disable rows written by the market or the plugin itself), so a
 * stale patch row never references a package that no longer exists.
 * Entries are top-level "- …" blocks: a block is dropped when any of its
 * lines mentions the package (full name or short name). */
function cleanPatchEntries(dir, packageName) {
  const patchFile = path.join(dir, 'cordis.patch.yml')
  let text
  try { text = fs.readFileSync(patchFile, 'utf8') } catch { return 0 }
  if (!text || !text.trim()) return 0
  const shortName = packageName.split('/').pop()
  const blocks = []
  let current = null
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*-\s/.test(line)) {
      if (current) blocks.push(current)
      current = [line]
    } else if (current && line.trim() !== '') {
      current.push(line)
    } else if (current) {
      blocks.push(current)
      current = null
    }
  }
  if (current) blocks.push(current)
  const keptBlocks = blocks.filter((block) => {
    const hit = block.some((line) => line.includes(packageName) || line.includes(shortName))
    if (hit) return false
    return true
  })
  const removed = blocks.length - keptBlocks.length
  if (removed > 0) {
    const out = keptBlocks.map((block) => block.join('\n')).join('\n')
    fs.writeFileSync(patchFile, out.endsWith('\n') ? out : `${out}\n`, 'utf8')
  }
  return removed
}

/** Delete the plugin's persisted leftovers under $DSH_HOME (agent presets,
 * skins, pets, boards, market data). @returns {string[]} removed paths. */
function removeLeftovers(item) {
  const removed = []
  for (const rel of item.leftovers ?? []) {
    const full = path.join(dshHome, ...rel.split('/'))
    try {
      if (fs.existsSync(full)) {
        fs.rmSync(full, { recursive: true, force: true })
        removed.push(rel)
      }
    } catch { /* best effort; report below */ }
  }
  return removed
}

/** Disable a community plugin that broke the browser boot (used by the boot
 * self-heal for ANY plugin registered in the web profile, not just featured
 * ones): drop its `dsh.profile.bundles` registration and every patch row
 * referencing it. The npm package and its data stay for a later reinstall.
 * @returns {boolean} true when the profile actually referenced the package. */
function disableCommunityBundle(packageName) {
  let touched = false
  try {
    const dir = ensureProfile()
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const bundles = manifest?.dsh?.profile?.bundles
    if (Array.isArray(bundles) && bundles.includes(packageName)) {
      unregisterBundle(dir, packageName)
      touched = true
    }
    if (cleanPatchEntries(dir, packageName) > 0) touched = true
  } catch { /* profile unreadable — nothing we can do here */ }
  return touched
}

/**
 * Uninstall one featured plugin: npm uninstall from the web profile, remove
 * the bundle registration, strip its cordis.patch.yml rows and delete every
 * module it influenced under $DSH_HOME (Agent 预设、任务看板、皮肤、宠物、
 * 市场数据) so the affected modules are fully restored. Orphaned transitive
 * dependencies (e.g. an aggregate bundle's children) are pruned afterwards.
 */
async function uninstall({ id }, send = () => {}) {
  const item = FEATURED.find((entry) => entry.id === id)
  if (!item) throw new Error('未知精选插件')
  if (!isInstalled(item.package)) {
    unregisterBundle(ensureProfile(), item.package)
    return { ok: true, message: '该插件未安装（已清理残留注册项）' }
  }
  const dir = ensureProfile()
  send(`正在卸载 ${item.package}…`)
  await npmRun(['uninstall', item.package], send)
  unregisterBundle(dir, item.package)
  const patchRows = cleanPatchEntries(dir, item.package)
  // 清理聚合包卸载后遗留的孤儿依赖（npm 不会自动移除）。
  try {
    await npmRun(['prune'], send)
  } catch { /* prune 失败不影响卸载结果 */ }
  const gone = !fs.existsSync(path.join(dir, 'node_modules', ...item.package.split('/')))
  send(gone ? '已从 web profile 移除' : '包目录仍在（将被引擎忽略），下次 npm 操作时清理')
  send('正在清理插件写入的数据（Agent 预设、任务看板、皮肤等）…')
  const removedLeftovers = removeLeftovers(item)
  const parts = ['卸载完成，重启服务后生效']
  if (removedLeftovers.length > 0) parts.push(`已复原模块：${removedLeftovers.join('、')}`)
  if (patchRows > 0) parts.push(`已清理 ${patchRows} 条 patch 残留`)
  return { ok: true, message: parts.join('；') }
}

module.exports = { catalog, install, uninstall, installPackagesIntoProfile, disableCommunityBundle, FEATURED }
