'use strict'
/**
 * Official-icon pipeline: the app renders every icon from the repo's official
 * favicon.svg (byte-identical copy in assets/dsh.svg) so tray, window, and UI
 * icons always match the official DeepSeek Harness branding.
 *
 * Electron cannot rasterize SVG natively, so a hidden BrowserWindow draws the
 * SVG onto canvases and returns PNG data URLs, which become nativeImage icons.
 */
const fs = require('node:fs')
const path = require('node:path')
const { nativeImage, BrowserWindow } = require('electron')

const SVG_PATH = path.join(__dirname, '..', '..', 'assets', 'dsh.svg')
const RASTER_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Black variant (light surfaces) and white variant (dark surfaces), both without the media query. */
function variants(svgText) {
  const noStyle = svgText.replace(/<style>[\s\S]*?<\/style>/, '')
  return {
    dark: noStyle.replace(/fill="#000"/, 'fill="#000000"'),
    light: noStyle.replace(/fill="#000"/, 'fill="#ffffff"'),
  }
}

async function rasterizeIn(window, svgText) {
  const code = `
    (async () => {
      const svg = ${JSON.stringify(svgText)};
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const out = {};
      for (const size of ${JSON.stringify(RASTER_SIZES)}) {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        canvas.getContext('2d').drawImage(img, 0, 0, size, size);
        out[size] = canvas.toDataURL('image/png');
      }
      URL.revokeObjectURL(url);
      return out;
    })()`
  return window.webContents.executeJavaScript(code, true)
}

const cache = { dark: {}, light: {}, ready: false }

/** Rasterize both variants once per app session. */
async function init() {
  if (cache.ready) return
  const svgText = fs.readFileSync(SVG_PATH, 'utf8')
  const win = new BrowserWindow({ show: false, skipTaskbar: true, webPreferences: { offscreen: true } })
  try {
    await win.loadURL('about:blank')
    const sets = variants(svgText)
    cache.dark = await rasterizeIn(win, sets.dark)
    cache.light = await rasterizeIn(win, sets.light)
  } finally {
    win.destroy()
  }
  cache.ready = true
}

/** Smallest data URL ≥ wanted size from a rasterized variant. */
function dataUrl(variant, wanted) {
  const set = cache[variant] ?? {}
  const available = RASTER_SIZES.filter((size) => set[size]).sort((a, b) => a - b)
  const best = available.find((size) => size >= wanted) ?? available[available.length - 1]
  return set[best]
}

/** nativeImage for tray/window/UI use; falls back to empty image before init. */
function image(variant, wanted) {
  const url = dataUrl(variant, wanted)
  return url ? nativeImage.createFromDataURL(url) : nativeImage.createEmpty()
}

/** Tray icon (16/24px) tuned for the OS theme. */
function trayIcon() {
  return image('dark', process.platform === 'win32' ? 16 : 24)
}

/** Window/taskbar icon. */
function windowIcon() {
  return image('dark', 256)
}

/** Raw PNG data URL for renderer <img> tags. */
function png(variant, wanted) {
  return dataUrl(variant, wanted)
}

module.exports = { init, trayIcon, windowIcon, png, RASTER_SIZES }
