'use strict'
/** Desktop app settings (visual settings center storage), JSON at $DSH_HOME/dsh-desktop. */
const fs = require('node:fs')
const { files, ensureDesktopDir } = require('./paths')

const DEFAULTS = {
  /** Web service origin the window loads. */
  origin: 'http://127.0.0.1:3080',
  /** auto tries bundled → source → global → npx in order; other values pin one source. */
  serviceMode: 'auto',
  /** Local source checkout of deepseek-harness; empty = auto-detect. */
  sourceRepoPath: '',
  /** Start the managed service automatically when the app launches. */
  autoStartService: true,
  /** Stop the managed service when the app exits. */
  stopServiceOnQuit: true,
  /** Close button hides to tray instead of quitting. */
  closeToTray: true,
  /** Launch the desktop app at system login. */
  launchOnLogin: false,
  /** Optional workspace whose project skill roots appear in the Skill loader. */
  workspacePath: '',
  /** Desktop-app update feed (JSON: { "version", "url", "notes" }). Bound to the
   * official mirror subsite by default; alternates are tried only when this
   * address is unreachable (see updater.DESKTOP_FEED_FALLBACKS). */
  updateFeedUrl: 'http://199.7.140.33:8010/feed.json',
  /** Optional engine mirror base URL (加速更新镜像子站); serves latest.json + pre-built engine bundles. */
  engineMirrorUrl: 'http://199.7.140.33:8010',
  /** Chat background wallpaper (absolute path); empty = feature off. */
  backgroundImage: '',
  /** Show the wallpaper layer behind the official UI. */
  backgroundEnabled: false,
  /** Wallpaper blur in px. */
  backgroundBlur: 0,
  /** Dark mask opacity over the wallpaper, 0-100 (readability). */
  backgroundDim: 55,
  lastUpdateCheck: null,
}

let state = { ...DEFAULTS }
const listeners = new Set()

function load() {
  try {
    const raw = fs.readFileSync(files.desktopSettings, 'utf8')
    const parsed = JSON.parse(raw)
    state = { ...DEFAULTS, ...parsed }
  } catch {
    state = { ...DEFAULTS }
  }
  return state
}

function save() {
  ensureDesktopDir()
  fs.writeFileSync(files.desktopSettings, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  for (const listener of listeners) listener(state)
}

/** Deep-merge a patch into the settings and persist. */
function update(patch) {
  const next = { ...state }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof next[key] === 'object' && next[key] !== null && !Array.isArray(next[key])) {
      next[key] = { ...next[key], ...value }
    } else {
      next[key] = value
    }
  }
  state = next
  save()
}

function get() {
  return state
}

function onChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

module.exports = { load, save, update, get, onChange, DEFAULTS }
