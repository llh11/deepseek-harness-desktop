'use strict'
/**
 * Smart Skill loader backend. Scans the same roots and ranks as
 * dsh-skill-filesystem (project .dsh/skills → .agents/skills → user
 * ~/.dsh/skills → ~/.agents/skills), parses SKILL.md frontmatter, validates
 * identity/naming rules, flags shadowed duplicates across ranks, and installs
 * skills from a git repo, a local folder, or a single .md URL — normalizing
 * multi-skill repositories into discoverable direct-child bundles.
 *
 * When the managed service is running, `listMerged` also queries the official
 * skill registry (skill.list RPC) so plugin/preset-bundled skills (official
 * BUNDLED rank, outside the filesystem roots) show up as read-only entries —
 * keeping this panel consistent with the conversation page's `/` menu.
 */
const { EventEmitter } = require('node:events')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { skillRoots } = require('./paths')
const settings = require('./settings-store')
const { callRpc } = require('./service-rpc')

/** Official precedence rank for packaged/bundled skills (dsh-skill BUNDLED_SKILL_RANK). */
const BUNDLED_RANK = 600

const events = new EventEmitter()
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DESCRIPTION_MAX = 500

/** Minimal frontmatter parser for the flat key: value shape skills use. */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { data: {}, body: text, hasBlock: false }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!pair) continue
    const [, key, raw] = pair
    let value = raw.trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter((item) => item !== '')
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    } else if (value === 'true' || value === 'false') {
      value = value === 'true'
    }
    data[key] = value
  }
  return { data, body: text.slice(match[0].length), hasBlock: true }
}

function parseSkillFile(filePath, impliedName) {
  const text = fs.readFileSync(filePath, 'utf8')
  const { data, body, hasBlock } = parseFrontmatter(text)
  const name = typeof data.name === 'string' && data.name !== '' ? data.name : impliedName
  const description = typeof data.description === 'string' ? data.description : ''
  return {
    name,
    description,
    whenToUse: typeof data['when-to-use'] === 'string' ? data['when-to-use'] : '',
    modelInvocable: data['disable-model-invocation'] !== true,
    userInvocable: data['user-invocable'] !== false,
    body,
    hasBlock,
  }
}

function firstParagraph(body) {
  const line = body.split(/\r?\n/).map((item) => item.trim()).find((item) => item !== '' && !item.startsWith('#'))
  return (line ?? '').slice(0, 120)
}

/** Scan every root and annotate issues + cross-root shadowing. */
function list() {
  const roots = skillRoots(settings.get().workspacePath)
  const items = []
  for (const root of roots) {
    if (!root.exists) continue
    let entries = []
    try { entries = fs.readdirSync(root.path, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      try {
        if (entry.isDirectory()) {
          const skillPath = path.join(root.path, entry.name, 'SKILL.md')
          if (!fs.existsSync(skillPath)) continue
          const parsed = parseSkillFile(skillPath, entry.name)
          items.push(buildItem(parsed, root, skillPath, entry.name, true))
        } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
          const skillPath = path.join(root.path, entry.name)
          const parsed = parseSkillFile(skillPath, entry.name.replace(/\.md$/, ''))
          items.push(buildItem(parsed, root, skillPath, entry.name.replace(/\.md$/, ''), false))
        }
      } catch (error) {
        items.push({
          name: entry.name, description: '', rootId: root.id, rootLabel: root.label, rank: root.rank,
          path: path.join(root.path, entry.name), isBundle: entry.isDirectory(),
          modelInvocable: true, userInvocable: true, issues: [`解析失败：${error.message}`], shadowedBy: null,
        })
      }
    }
  }

  const byName = new Map()
  for (const item of items) {
    const winner = byName.get(item.name)
    if (!winner || item.rank < winner.rank) byName.set(item.name, item)
  }
  for (const item of items) {
    const winner = byName.get(item.name)
    if (winner !== item) item.shadowedBy = `${winner.rootLabel}（rank ${winner.rank}）`
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  return { roots, items }
}

/**
 * Disk scan merged with the live official catalog (skill.list RPC, addressed
 * by the most recent session). Filesystem entries get `inOfficialCatalog`;
 * catalog entries with no filesystem match — engine/plugin-bundled skills at
 * the official BUNDLED rank 600, which the wire projection does not label —
 * are appended as read-only rows. When the service is offline the merge is
 * skipped and `official.available` reports false with the reason.
 */
async function listMerged() {
  const local = list()
  const official = { available: false, error: null }
  let catalog = null
  try {
    const sessions = await callRpc('session.list', {})
    const sessionId = sessions?.items?.[0]?.sessionId
    if (typeof sessionId !== 'string' || sessionId === '') {
      official.error = '还没有任何会话，启动一次对话后即可读取官方目录'
      return { ...local, official }
    }
    catalog = await callRpc('skill.list', { sessionId })
  } catch (error) {
    official.error = error.message
    return { ...local, official }
  }
  const officialSkills = Array.isArray(catalog?.skills) ? catalog.skills : []
  const catalogNames = new Set(officialSkills.map((skill) => skill.name))
  for (const item of local.items) item.inOfficialCatalog = catalogNames.has(item.name)
  const localNames = new Set(local.items.map((item) => item.name))
  for (const skill of officialSkills) {
    if (typeof skill?.name !== 'string' || localNames.has(skill.name)) continue
    local.items.push({
      name: skill.name,
      description: typeof skill.description === 'string' ? skill.description : '',
      whenToUse: typeof skill.whenToUse === 'string' ? skill.whenToUse : '',
      rootId: 'official-bundled',
      rootLabel: '官方目录（引擎/插件内置）',
      rank: BUNDLED_RANK,
      path: null,
      isBundle: true,
      modelInvocable: skill.modelInvocable !== false,
      userInvocable: true,
      issues: [],
      shadowedBy: null,
      impliedName: skill.name,
      readOnly: true,
      inOfficialCatalog: true,
    })
  }
  local.items.sort((a, b) => a.name.localeCompare(b.name))
  official.available = true
  return { ...local, official }
}

function buildItem(parsed, root, skillPath, impliedName, isBundle) {
  const issues = []
  if (!NAME_PATTERN.test(parsed.name)) issues.push(`名称 "${parsed.name}" 不符合 kebab-case 规则（^[a-z0-9]+(-[a-z0-9]+)*$），模型将无法通过 skill 工具调用`)
  if (parsed.description === '') issues.push('缺少 description，模型目录中无法展示该技能')
  else if (parsed.description.length > DESCRIPTION_MAX) issues.push(`描述长度 ${parsed.description.length} 超过目录上限 ${DESCRIPTION_MAX}`)
  return {
    name: parsed.name,
    description: parsed.description,
    whenToUse: parsed.whenToUse,
    rootId: root.id,
    rootLabel: root.label,
    rank: root.rank,
    path: skillPath,
    isBundle,
    modelInvocable: parsed.modelInvocable,
    userInvocable: parsed.userInvocable,
    issues,
    shadowedBy: null,
    impliedName,
  }
}

/** Rewrite (or create) the frontmatter's disable-model-invocation key. */
function toggleModelInvocation(skillPath, enabled) {
  const text = fs.readFileSync(skillPath, 'utf8')
  const { data, body, hasBlock } = parseFrontmatter(text)
  const flag = `disable-model-invocation: ${enabled ? 'false' : 'true'}`
  let next
  if (hasBlock) {
    if (/^disable-model-invocation:/m.test(text)) next = text.replace(/^disable-model-invocation:.*$/m, flag)
    else next = text.replace(/^---\r?\n/, `---\n${flag}\n`)
  } else {
    const name = path.basename(skillPath, '.md') === 'SKILL' ? path.basename(path.dirname(skillPath)) : path.basename(skillPath, '.md')
    const description = firstParagraph(body) || '(由桌面端补全)'
    next = `---\nname: ${name}\ndescription: ${description}\n${flag}\n---\n\n${text}`
  }
  fs.writeFileSync(skillPath, next, 'utf8')
  return list()
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Move a cloned/copied directory's inner skill bundles up to the root level. */
function normalizeRepoLayout(sourceDir, rootPath) {
  if (fs.existsSync(path.join(sourceDir, 'SKILL.md'))) {
    const parsed = parseSkillFile(path.join(sourceDir, 'SKILL.md'), path.basename(sourceDir))
    const desired = NAME_PATTERN.test(parsed.name) ? parsed.name : slugify(path.basename(sourceDir))
    const dest = path.join(rootPath, desired)
    if (fs.existsSync(dest)) throw new Error(`目标已存在：${dest}`)
    fs.renameSync(sourceDir, dest)
    return [desired]
  }
  const moved = []
  const searchDirs = [sourceDir, path.join(sourceDir, 'skills')]
  for (const searchDir of searchDirs) {
    if (!fs.existsSync(searchDir)) continue
    for (const entry of fs.readdirSync(searchDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const inner = path.join(searchDir, entry.name)
      if (!fs.existsSync(path.join(inner, 'SKILL.md'))) continue
      const parsed = parseSkillFile(path.join(inner, 'SKILL.md'), entry.name)
      const desired = NAME_PATTERN.test(parsed.name) ? parsed.name : slugify(entry.name)
      const dest = path.join(rootPath, desired)
      if (fs.existsSync(dest)) throw new Error(`目标已存在：${dest}`)
      fs.cpSync(inner, dest, { recursive: true })
      moved.push(desired)
    }
  }
  if (moved.length > 0) fs.rmSync(sourceDir, { recursive: true, force: true })
  return moved
}

/**
 * Install a skill: `git` clones a repository, `folder` copies a local
 * directory, `file` downloads one .md document. Multi-skill repositories are
 * flattened into direct-child bundles.
 */
function install({ kind, ref, rootId }) {
  const root = skillRoots(settings.get().workspacePath).find((item) => item.id === rootId)
    ?? skillRoots(settings.get().workspacePath).find((item) => item.exists)
  if (!root) throw new Error('没有可用的 Skill 根目录')
  fs.mkdirSync(root.path, { recursive: true })

  if (kind === 'git') {
    if (!/^https?:\/\/|git@/.test(String(ref))) throw new Error('Git 地址必须以 http(s):// 或 git@ 开头')
    const repoName = slugify(String(ref).replace(/\.git$/, '').split(/[/\\]/).pop() ?? 'skill')
    const temp = path.join(root.path, `.${repoName}-${Date.now()}.tmp`)
    const cloned = spawnSync('git', ['clone', '--depth', '1', String(ref), temp], { encoding: 'utf8' })
    if (cloned.status !== 0) throw new Error(`git clone 失败：${(cloned.stderr || '').trim().slice(0, 400)}`)
    const moved = normalizeRepoLayout(temp, root.path)
    if (moved.length === 0) {
      fs.rmSync(temp, { recursive: true, force: true })
      throw new Error('仓库中没有找到 SKILL.md（支持根目录单技能或 skills/<名称>/SKILL.md 布局）')
    }
    return { installed: moved, root: root.id }
  }

  if (kind === 'folder') {
    if (!fs.existsSync(path.join(String(ref), 'SKILL.md'))) throw new Error('所选文件夹根目录缺少 SKILL.md')
    const temp = path.join(root.path, `.folder-${Date.now()}.tmp`)
    fs.cpSync(String(ref), temp, { recursive: true })
    const moved = normalizeRepoLayout(temp, root.path)
    return { installed: moved, root: root.id }
  }

  if (kind === 'file') {
    const url = String(ref)
    const name = slugify((url.split('/').pop() ?? '').replace(/\.md$/, ''))
    if (name === '') throw new Error('无法从 URL 推断技能名（需要以 <name>.md 结尾）')
    return fetch(url, { signal: AbortSignal.timeout(20_000) })
      .then((response) => {
        if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
        return response.text()
      })
      .then((text) => {
        fs.writeFileSync(path.join(root.path, `${name}.md`), text, 'utf8')
        return { installed: [name], root: root.id }
      })
  }

  throw new Error(`未知安装类型：${kind}`)
}

/** Delete one skill bundle or flat file. */
function remove(skillPath) {
  const roots = skillRoots(settings.get().workspacePath).map((root) => path.resolve(root.path))
  const resolved = path.resolve(skillPath)
  if (!roots.some((rootPath) => resolved.startsWith(rootPath + path.sep))) throw new Error('拒绝删除 Skill 根目录之外的内容')
  fs.rmSync(resolved, { recursive: true, force: true })
  return list()
}

/**
 * Search GitHub for skill repositories. Two lanes run in parallel:
 * repositories whose name/description/README mention the keyword together
 * with skill conventions, and the curated `agent-skill` / `skill-file` topics.
 * No token is used (60 req/min shared per IP is plenty for interactive use).
 */
async function searchGitHub({ query }) {
  const keyword = String(query ?? '').trim()
  const clauses = keyword === '' ? ['SKILL.md'] : [`${keyword} SKILL.md`]
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(clauses[0])}&sort=updated&order=desc&per_page=20`
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-desktop' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const limited = response.status === 403 || response.status === 429
    throw new Error(limited ? 'GitHub API 触发限流，请稍后重试' : `GitHub 搜索失败：HTTP ${response.status}`)
  }
  const body = await response.json()
  const items = Array.isArray(body?.items) ? body.items : []
  return items.map((item) => ({
    fullName: item.full_name,
    description: typeof item.description === 'string' ? item.description : '',
    stars: item.stargazers_count ?? 0,
    updatedAt: item.updated_at ?? null,
    url: item.html_url,
    cloneUrl: item.clone_url ?? `${item.html_url}.git`,
  }))
}

/** Extract one dropped archive (.zip/.tgz/.tar.gz) into `dest` via bsdtar
 * (ships with Windows 10+; also handles zip). */
function extractArchive(file, dest) {
  fs.mkdirSync(dest, { recursive: true })
  const result = spawnSync('tar', ['-xf', file, '-C', dest], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`解压失败：${(result.stderr || '').trim().slice(0, 300)}`)
}

/**
 * Install skills from dropped / picked local paths (drag-drop and upload).
 * Each path may be a skill folder (rooted at SKILL.md), a repository folder
 * with skills/<name>/SKILL.md children, a single .md file, or a .zip/.tgz
 * archive of either layout.
 */
function installPaths({ paths: droppedPaths, rootId }) {
  if (!Array.isArray(droppedPaths) || droppedPaths.length === 0) throw new Error('没有收到要安装的文件')
  const root = skillRoots(settings.get().workspacePath).find((item) => item.id === rootId)
    ?? skillRoots(settings.get().workspacePath).find((item) => item.exists)
  if (!root) throw new Error('没有可用的 Skill 根目录')
  fs.mkdirSync(root.path, { recursive: true })

  const installed = []
  const errors = []
  for (const dropped of droppedPaths) {
    const target = String(dropped ?? '')
    if (target === '' || !fs.existsSync(target)) { errors.push(`路径不存在：${target}`); continue }
    try {
      const stat = fs.statSync(target)
      if (stat.isDirectory()) {
        const temp = path.join(root.path, `.drop-${Date.now()}.tmp`)
        fs.cpSync(target, temp, { recursive: true })
        installed.push(...normalizeRepoLayout(temp, root.path))
      } else if (/\.md$/i.test(target)) {
        const name = slugify(path.basename(target, path.extname(target)))
        if (name === '') throw new Error('无法推断技能名')
        fs.copyFileSync(target, path.join(root.path, `${name}.md`))
        installed.push(name)
      } else if (/\.(zip|tgz|tar\.gz)$/i.test(target)) {
        const temp = path.join(root.path, `.drop-${Date.now()}.tmp`)
        extractArchive(target, temp)
        installed.push(...normalizeRepoLayout(temp, root.path))
      } else {
        errors.push(`不支持的文件类型（仅接受文件夹、.md、.zip、.tgz）：${path.basename(target)}`)
      }
    } catch (error) {
      errors.push(`${path.basename(target)}：${error.message}`)
    }
  }
  if (installed.length === 0 && errors.length > 0) throw new Error(errors.join('\n'))
  return { installed, errors }
}

let watchers = []
/** Watch existing roots for changes; emits `changed` (debounced) to refresh the UI. */
function watchRoots() {
  for (const watcher of watchers) { try { watcher.close() } catch { /* closed */ } }
  watchers = []
  let timer = null
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => events.emit('changed'), 800)
  }
  for (const root of skillRoots(settings.get().workspacePath)) {
    if (!root.exists) continue
    try {
      watchers.push(fs.watch(root.path, { recursive: true }, schedule))
    } catch {
      try { watchers.push(fs.watch(root.path, schedule)) } catch { /* root vanished */ }
    }
  }
}

module.exports = { events, list, listMerged, install, installPaths, searchGitHub, remove, toggleModelInvocation, watchRoots, NAME_PATTERN }
