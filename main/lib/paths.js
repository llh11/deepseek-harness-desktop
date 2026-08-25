'use strict'
/** Shared path resolution: DSH home, desktop-managed dirs, skill roots. */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/** Resolve the Harness home exactly like dsh-home-paths: $DSH_HOME, else ~/.dsh. */
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return path.resolve(fromEnv)
  return path.join(os.homedir(), '.dsh')
}

const dshHome = resolveDshHome()
/** Desktop-managed state lives under $DSH_HOME/dsh-desktop and never touches user files elsewhere. */
const desktopDir = path.join(dshHome, 'dsh-desktop')

const files = {
  dshSettings: path.join(dshHome, 'settings.yaml'),
  dshEnv: path.join(dshHome, '.env'),
  /** Official credential store written by the official "模型" settings page. */
  dshCredentials: path.join(dshHome, '.credentials.yaml'),
  desktopSettings: path.join(desktopDir, 'desktop-settings.json'),
  mcpStore: path.join(desktopDir, 'mcp-servers.json'),
  /** Overlay passed to `dsh web --patch` so MCP servers load without editing profile files. */
  mcpOverlay: path.join(desktopDir, 'mcp.patch.yml'),
  providerStore: path.join(desktopDir, 'providers.json'),
  skillStore: path.join(desktopDir, 'skill-sources.json'),
}

function ensureDesktopDir() {
  fs.mkdirSync(desktopDir, { recursive: true })
  return desktopDir
}

/** Skill discovery roots mirroring dsh-skill-filesystem ranks (project roots need a workspace). */
function skillRoots(workspacePath) {
  const home = os.homedir()
  const roots = [
    { id: 'user-dsh', rank: 400, label: '用户（~/.dsh/skills）', path: path.join(dshHome, 'skills') },
    { id: 'user-agents', rank: 500, label: '用户（~/.agents/skills）', path: path.join(home, '.agents', 'skills') },
  ]
  if (typeof workspacePath === 'string' && workspacePath.trim() !== '') {
    const ws = path.resolve(workspacePath)
    roots.unshift(
      { id: 'project-dsh', rank: 100, label: `项目（${path.join(ws, '.dsh/skills')}）`, path: path.join(ws, '.dsh', 'skills') },
      { id: 'project-agents', rank: 200, label: `项目（${path.join(ws, '.agents/skills')}）`, path: path.join(ws, '.agents', 'skills') },
    )
  }
  return roots.map((root) => ({ ...root, exists: fs.existsSync(root.path) }))
}

module.exports = { dshHome, desktopDir, files, ensureDesktopDir, skillRoots, resolveDshHome }
