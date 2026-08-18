'use strict'
/**
 * DeepSeek Harness Desktop entry point: creates the web-UI window and the
 * control center, owns the tray, wires IPC, and keeps the managed service +
 * gateway lifecycles in sync with the visual settings.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('node:path')
const settings = require('./lib/settings-store')
const icons = require('./lib/icons')
const service = require('./lib/service-manager')
const tray = require('./lib/tray')
const skills = require('./lib/skill-manager')
const mcp = require('./lib/mcp-manager')
const providers = require('./lib/provider-manager')
const gateway = require('./lib/gateway')
const updater = require('./lib/updater')
const plugins = require('./lib/plugin-explainer')
const { ensureDesktopDir } = require('./lib/paths')

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
    icon: icons.windowIcon(),
    // sandbox:false lets the preload require the injected desktop settings UI.
    webPreferences: { preload: PRELOAD, sandbox: false },
  })
  mainWindow.removeMenu()
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'loading.html'))
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (!quitting && settings.get().closeToTray) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => { mainWindow = null })
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
  mainWindow.loadURL(origin).catch(() => { originLoaded = false })
}

function onServiceStatus(status) {
  tray.setTrayStatus(status.status)
  sendToWindows('service:status', service.describe())
  if (status.status === 'running-managed' || status.status === 'running-external') ensureOriginLoaded()
  if (status.status === 'stopped' || status.status === 'error') originLoaded = false
}

/** Keep the loopback gateway aligned with settings and provider routing. */
function syncGateway() {
  const { gateway: gatewaySettings } = settings.get()
  const needed = gatewaySettings.enabled
    || providers.list().some((provider) => provider.viaGateway)
  if (needed && !gateway.isRunning()) gateway.start(gatewaySettings.port)
  if (!needed && gateway.isRunning()) gateway.stop()
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
    if (after.gateway.enabled !== before.gateway.enabled || after.gateway.port !== before.gateway.port) {
      syncGateway()
      // Gateway baseURLs are baked into settings.yaml; re-project after a port change.
      if (after.gateway.port !== before.gateway.port && providers.list().some((provider) => provider.viaGateway)) {
        providers.projectToSettings()
      }
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
  ipcMain.handle('skills:install', (_event, payload) => skills.install(payload))
  ipcMain.handle('skills:installPaths', (_event, payload) => skills.installPaths(payload))
  ipcMain.handle('skills:searchGitHub', (_event, payload) => skills.searchGitHub(payload))
  ipcMain.handle('skills:remove', (_event, payload) => skills.remove(payload))
  ipcMain.handle('skills:toggle', (_event, { path: skillPath, enabled }) => skills.toggleModelInvocation(skillPath, enabled))
  ipcMain.handle('skills:refresh', () => { skills.watchRoots(); return skills.list() })

  ipcMain.handle('mcp:state', () => mcp.state())
  ipcMain.handle('mcp:save', (_event, server) => mcp.save(server))
  ipcMain.handle('mcp:remove', (_event, id) => mcp.remove(id))
  ipcMain.handle('mcp:toggle', (_event, { id, enabled }) => mcp.toggle(id, enabled))
  ipcMain.handle('mcp:apply', () => mcp.apply())
  ipcMain.handle('mcp:test', (_event, id) => mcp.test(id))

  ipcMain.handle('plugins:catalog', () => plugins.catalog())

  ipcMain.handle('providers:list', () => providers.list())
  ipcMain.handle('providers:save', (_event, provider) => { const result = providers.save(provider); syncGateway(); return result })
  ipcMain.handle('providers:remove', (_event, id) => { const result = providers.remove(id); syncGateway(); return result })
  ipcMain.handle('providers:fetchModels', (_event, payload) => providers.fetchModels(payload))
  ipcMain.handle('providers:suggestInput', (_event, modelId) => providers.suggestInput(modelId))

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
    await icons.init()

    service.events.on('status', onServiceStatus)
    skills.events.on('changed', () => sendToWindows('skills:changed', { at: Date.now() }))
    skills.watchRoots()

    createMainWindow()

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

    registerIpc()
    syncGateway()
    if (settings.get().autoStartService) service.start()

    app.on('activate', () => showMainWindow())
  })

  app.on('before-quit', async (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    try { await gateway.stop() } catch { /* already stopped */ }
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
