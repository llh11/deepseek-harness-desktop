'use strict'
/**
 * Packaging icon generator — renders the official assets/dsh.svg (the official
 * DeepSeek Harness favicon, byte-identical) into build/icon.png (512) and
 * build/icon.ico (16/24/32/48/64/128/256 PNG frames) for electron-builder.
 * Run: npm run gen:icons
 */
const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const SVG_PATH = path.join(__dirname, '..', 'assets', 'dsh.svg')
const BUILD_DIR = path.join(__dirname, '..', 'build')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Assemble a classic Windows ICO whose frames are PNG blobs. */
function buildIco(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  const entries = []
  const blobs = []
  let offset = 6 + frames.length * 16
  for (const frame of frames) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 0)
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(frame.buffer.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += frame.buffer.length
    entries.push(entry)
    blobs.push(frame.buffer)
  }
  return Buffer.concat([header, ...entries, ...blobs])
}

async function main() {
  const svgText = fs.readFileSync(SVG_PATH, 'utf8').replace(/<style>[\s\S]*?<\/style>/, '')
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('about:blank')
  const code = `
    (async () => {
      const svg = ${JSON.stringify(svgText)};
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      const out = {};
      for (const size of [...${JSON.stringify(ICO_SIZES)}, 512]) {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        canvas.getContext('2d').drawImage(img, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/png');
        out[size] = dataUrl.slice(dataUrl.indexOf(',') + 1);
      }
      URL.revokeObjectURL(url);
      return out;
    })()`
  const pngs = await win.webContents.executeJavaScript(code, true)
  win.destroy()

  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), Buffer.from(pngs[512], 'base64'))
  const frames = ICO_SIZES.map((size) => ({ size, buffer: Buffer.from(pngs[size], 'base64') }))
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), buildIco(frames))
  console.log(`已生成：${path.join(BUILD_DIR, 'icon.ico')}（${ICO_SIZES.join('/')}）与 icon.png（512）`)
  app.quit()
}

app.whenReady().then(main).catch((error) => { console.error(error); app.exit(1) })
