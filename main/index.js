'use strict'
/**
 * DeepSeek Harness Desktop entry point: creates the web-UI window and the
 * control center, owns the tray, wires IPC, and keeps the managed service
 * lifecycle in sync with the visual settings.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const settings = require('./lib/settings-store')
const icons = require('./lib/icons')
const service = require('./lib/service-manager')
const tray = require('./lib/tray')
const skills = require('./lib/skill-manager')
const mcp = require('./lib/mcp-manager')
const balances = require('./lib/balances')
const updater = require('./lib/updater')
const plugins = require('./lib/plugin-explainer')
const featuredPlugins = require('./lib/featured-plugins')
const bootHeal = require('./lib/boot-heal')
const officialUsage = require('./lib/official-usage')
const { ensureDesktopDir } = require('./lib/paths')

// Windows 上窗口最小化/隐藏时，Chromium 会降级渲染进程并在内存压力下丢弃
// 页面（tab discard），从托盘/任务栏恢复窗口时就会整页重新加载。以下开关
// 禁用后台降级与遮挡判定，保证本地 Web UI 始终驻留内存。
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

let mainWindow = null
let quitting = false
let originLoaded = false

const PRELOAD = path.join(__dirname, '..', 'preload.js')

function sendToWindows(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 980,
    minHeight: 620,
    show: false,
    title: 'DeepSeek Harness',
    // 打包后任务栏/窗口自动使用 exe 内置图标；不再等待 SVG 光栅化，
    // 让首窗更早出现（托盘图标仍在 icons.init() 完成后创建）。
    // sandbox:false lets the preload require the injected desktop settings UI.
    // backgroundThrottling:false keeps the minimized/hidden window fully live.
    webPreferences: { preload: PRELOAD, sandbox: false, backgroundThrottling: false },
  })
  mainWindow.removeMenu()
  // 新窗口从 loading 页开始；originLoaded 标志必须随窗口重置，否则窗口
  // 重建后跳转被旧标志挡住，页面永远停留在 loading（状态却显示运行中）。
  originLoaded = false
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'loading.html'))
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // 窗口（重新）创建时服务若已就绪，直接进入官方 UI：此时不会再有新的
    // service:status 事件来驱动跳转。
    const { status } = service.describe()
    if (status === 'running-managed' || status === 'running-external') ensureOriginLoaded()
  })
  mainWindow.on('close', (event) => {
    if (!quitting && settings.get().closeToTray) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  // 兜底：渲染进程被系统回收时恢复页面而不是停在白屏/加载页。
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (quitting || !mainWindow || mainWindow.isDestroyed()) return
    const url = mainWindow.webContents.getURL()
    console.error('[desktop] 渲染进程退出（%s），正在恢复页面…', details.reason)
    if (url.startsWith('http')) {
      mainWindow.webContents.reloadIgnoringCache().catch(() => {})
    } else {
      originLoaded = false
      ensureOriginLoaded()
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    if (originLoaded && url.startsWith('http')) originLoaded = false
    sendToWindows('service:status', { ...service.describe(), loadError: `${code} ${description}` })
  })
}

function showMainWindow() {
  if (!mainWindow) createMainWindow()
  mainWindow.show()
  mainWindow.focus()
}

/** The desktop settings panel lives inside the official UI (preload-injected);
 * opening it shows the main window and toggles the overlay in the page. */
function openControl() {
  showMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:toggle-control', true)
}

/** Load (or reload) the web UI once the service answers. */
function ensureOriginLoaded() {
  if (!mainWindow || originLoaded) return
  const { origin } = settings.get()
  originLoaded = true
  // 服务 listen 后插件管线（profile 挂载、bundle 生成）仍需短暂预热；
  // 立即进入官方 UI 会偶发 "Failed to load plugins"。宽限一拍再加载。
  setTimeout(() => {
    mainWindow?.loadURL(origin).catch(() => { originLoaded = false })
  }, 600)
}

function onServiceStatus(status) {
  tray.setTrayStatus(status.status)
  sendToWindows('service:status', service.describe())
  if (status.status === 'running-managed' || status.status === 'running-external') ensureOriginLoaded()
  if (status.status === 'stopped' || status.status === 'error') originLoaded = false
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dshHome: require('./lib/paths').dshHome,
    description: tray.TRAY_DESCRIPTION,
  }))
  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:set', (_event, patch) => {
    const before = settings.get()
    settings.update(patch ?? {})
    const after = settings.get()
    if (after.launchOnLogin !== before.launchOnLogin) {
      app.setLoginItemSettings({ openAtLogin: after.launchOnLogin })
    }
    if (after.workspacePath !== before.workspacePath) skills.watchRoots()
    return after
  })
  ipcMain.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('service:status', () => service.describe())
  ipcMain.handle('service:start', () => service.start())
  ipcMain.handle('service:stop', () => service.stop())
  ipcMain.handle('service:restart', () => service.restart())
  ipcMain.handle('service:logs', () => service.logs())
  ipcMain.handle('service:versions', () => service.versionInfo())

  ipcMain.handle('skills:list', () => skills.list())
  ipcMain.handle('skills:listMerged', () => skills.listMerged())
  ipcMain.handle('skills:install', (_event, payload) => skills.install(payload))
  ipcMain.handle('skills:installPaths', (_event, payload) => skills.installPaths(payload))
  ipcMain.handle('skills:searchGitHub', (_event, payload) => skills.searchGitHub(payload))
  ipcMain.handle('skills:remove', (_event, payload) => skills.remove(payload))
  ipcMain.handle('skills:toggle', (_event, { path: skillPath, enabled }) => skills.toggleModelInvocation(skillPath, enabled))
  ipcMain.handle('skills:refresh', () => { skills.watchRoots(); return skills.listMerged() })

  ipcMain.handle('mcp:state', () => mcp.state())
  ipcMain.handle('mcp:save', (_event, server) => mcp.save(server))
  ipcMain.handle('mcp:remove', (_event, id) => mcp.remove(id))
  ipcMain.handle('mcp:toggle', (_event, { id, enabled }) => mcp.toggle(id, enabled))
  ipcMain.handle('mcp:apply', () => mcp.apply())
  ipcMain.handle('mcp:test', (_event, id) => mcp.test(id))

  ipcMain.handle('plugins:catalog', () => plugins.catalog())
  ipcMain.handle('plugins:featured', () => featuredPlugins.catalog())
  ipcMain.handle('plugins:installFeatured', (_event, payload) => featuredPlugins.install(payload ?? {}, (line) => sendToWindows('updates:progress', line)))
  ipcMain.handle('plugins:uninstallFeatured', (_event, payload) => featuredPlugins.uninstall(payload ?? {}, (line) => sendToWindows('updates:progress', line)))

  // Browser-boot self-heal: the renderer reports entries that did not
  // activate ("@scope/pkg: pending (waiting for service: X)"), the heal
  // disables those plugins through the profile's user patch layer (or
  // unregisters them and restarts the service as the fallback).
  ipcMain.handle('plugins:healBoot', async (_event, payload) => {
    const failures = Array.isArray(payload?.failures) ? payload.failures : []
    let result
    try {
      result = await bootHeal.heal(failures, {
        origin: settings.get().origin,
        restart: async () => { await service.restart() },
      })
    } catch (error) {
      result = { action: 'manual', reload: false, healed: [], manual: [], message: `自动修复失败：${error.message ?? error}` }
    }
    if (service.describe().status === 'running-external' && result.action === 'manual') {
      result.message += '（当前为外部服务，请手动重启该服务后重试）'
    }
    return result
  })
  ipcMain.handle('plugins:lastHeal', () => bootHeal.lastHeal())

  ipcMain.handle('balances:list', () => balances.balances())
  ipcMain.handle('official-usage:stats', () => officialUsage.stats())

  ipcMain.handle('dialog:pickImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })
  // Background images live on disk while the page origin is http://127.0.0.1,
  // so file:// URLs would be blocked; serve them to the renderer as data URLs.
  ipcMain.handle('background:dataUrl', (_event, imagePath) => {
    const resolved = path.resolve(String(imagePath ?? ''))
    if (!fs.existsSync(resolved)) return null
    const ext = path.extname(resolved).toLowerCase()
    const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' }
    const mime = mimes[ext]
    if (!mime) return null
    const buffer = fs.readFileSync(resolved)
    if (buffer.length > 20 * 1024 * 1024) return null
    return `data:${mime};base64,${buffer.toString('base64')}`
  })

  ipcMain.handle('updates:check', () => updater.checkAll())
  ipcMain.handle('updates:applyOfficial', () => updater.applyOfficialUpdate((line) => sendToWindows('updates:progress', line)))
  ipcMain.handle('updates:downloadDesktop', async () => {
    const result = await updater.downloadDesktopUpdate((line) => sendToWindows('updates:progress', line))
    shell.showItemInFolder(result.file)
    return result
  })

  ipcMain.handle('shell:openExternal', (_event, url) => shell.openExternal(String(url)))
  ipcMain.handle('shell:openPath', (_event, target) => shell.openPath(String(target)))
  ipcMain.handle('ui:openControl', () => { openControl(); return true })
  ipcMain.handle('ui:openMain', () => { showMainWindow(); return true })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(async () => {
    settings.load()
    ensureDesktopDir()

    // 启动提速：图标光栅化不再阻塞首窗（打包后窗口/任务栏直接用 exe 图标），
    // 托盘在图标就绪后创建；服务在窗口创建的同时就提前拉起。
    const iconsReady = icons.init().catch((error) => {
      console.error('[desktop] 图标初始化失败：', error)
    })

    service.events.on('status', onServiceStatus)
    skills.events.on('changed', () => sendToWindows('skills:changed', { at: Date.now() }))
    skills.watchRoots()

    createMainWindow()
    registerIpc()
    if (settings.get().autoStartService) service.start()

    // Smoke hook: open the OFFICIAL settings dialog and verify the desktop
    // rows were injected into its nav, then a desktop section renders.
    if (process.env.DSHD_SMOKE === '1') {
      const report = (text) => {
        try { require('node:fs').writeFileSync(process.env.DSHD_SMOKE_OUT ?? `${require('node:os').tmpdir()}/dshd-smoke.txt`, text, 'utf8') } catch { /* best effort */ }
      }
      const diag = (text) => {
        try { require('node:fs').appendFileSync(`${require('node:os').tmpdir()}/dshd-boot.log`, `${new Date().toISOString()} ${text}\n`) } catch { /* best effort */ }
      }
      process.on('uncaughtException', (error) => diag(`UNCAUGHT ${error.stack ?? error.message}`))
      const attempt = async () => {
        // executeJavaScript can hang forever when the page navigates mid-call;
        // race every call so polling always continues.
        const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))])
        try {
          const clicked = await withTimeout(mainWindow.webContents.executeJavaScript(`(() => {
            if (!location.href.startsWith('http')) return false
            const trigger = document.querySelector('button[aria-haspopup="dialog"]')
            if (trigger) trigger.click()
            return Boolean(trigger)
          })()`), 8000)
          if (clicked !== true) return { ok: false, stage: 'trigger' }
          await new Promise((resolve) => setTimeout(resolve, 1200))
          const raw = await withTimeout(mainWindow.webContents.executeJavaScript(`JSON.stringify({
            rows: document.querySelectorAll('[data-dshdx]').length,
            dialog: !!document.querySelector('[role="dialog"]'),
            styled: document.adoptedStyleSheets.some((sheet) => [...sheet.cssRules].some((rule) => rule.selectorText === '.dshdx-section')),
            section: !!document.querySelector('.dshdx-section'),
          })`), 8000)
          if (typeof raw !== 'string') return { ok: false, stage: 'inspect-hang' }
          return { ok: true, result: JSON.parse(raw) }
        } catch (error) {
          return { ok: false, stage: `error: ${error.message}` }
        }
      }
      const poll = async (deadline) => {
        const outcome = await attempt()
        diag(`attempt ${JSON.stringify(outcome)}`)
        if (outcome.ok && outcome.result.rows >= 5 && outcome.result.dialog && outcome.result.styled) {
          report(`DSHD_SMOKE_UI OK ${JSON.stringify(outcome.result)}`)
          app.exit(0)
          return
        }
        if (Date.now() > deadline) {
          report(`DSHD_SMOKE_UI FAIL ${JSON.stringify(outcome)}`)
          app.exit(2)
          return
        }
        setTimeout(() => poll(deadline), 4000)
      }
      diag('smoke armed, waiting 15s')
      setTimeout(() => poll(Date.now() + 120_000), 15_000)
    }

    // 托盘依赖光栅化图标；图标就绪后立即挂载（不阻塞主流程）。
    iconsReady.then(() => {
      tray.create({
        showMain: showMainWindow,
        openControl,
        openBrowser: () => shell.openExternal(settings.get().origin),
        serviceStart: () => service.start(),
        serviceStop: () => service.stop(),
        serviceRestart: () => service.restart(),
        checkUpdates: () => {
          updater.checkAll().then((result) => {
            const { desktop, official } = result
            const parts = []
            if (desktop.updateAvailable) parts.push(`桌面版 ${desktop.latest} 可更新`)
            else parts.push(`桌面版已是最新（${desktop.current}）`)
            if (official.updateAvailable) parts.push(`官方 dsh ${official.installed} → ${official.latest} 可更新`)
            else if (official.latest) parts.push(`官方 dsh ${official.installed ?? '未知'}（最新 ${official.latest}）`)
            else parts.push(`官方 dsh 版本查询失败：${official.error ?? '未知错误'}`)
            dialog.showMessageBox({ type: 'info', title: '检查更新', message: '更新检查完成', detail: parts.join('\n'), buttons: ['好的'] })
          })
        },
      })
    })

    app.on('activate', () => showMainWindow())
  })

  app.on('before-quit', async (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    if (settings.get().stopServiceOnQuit && service.describe().status === 'running-managed') {
      await service.stop()
    }
    tray.destroy()
    app.quit()
  })

  app.on('window-all-closed', () => {
    // Tray keeps the app alive; Quit exits through the tray or before-quit.
  })
}
