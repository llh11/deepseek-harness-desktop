'use strict'
/** System tray built on the official icon; menu reflects live service status. */
const { Menu, Tray, dialog, app } = require('electron')
const icons = require('./icons')

const TRAY_DESCRIPTION = '把官方 DeepSeek Harness 的本地 Web UI 带到原生桌面。应用自动启动和管理本地 Harness 服务，集成系统托盘与桌面窗口，无需安装 Node.js 或执行命令。'

let tray = null
let actions = null

const STATUS_TEXT = {
  stopped: '服务已停止',
  starting: '服务启动中…',
  'running-managed': '服务运行中（托管）',
  'running-external': '服务运行中（外部）',
  stopping: '服务停止中…',
  error: '服务异常',
}

function buildMenu(status) {
  const running = status === 'running-managed' || status === 'running-external'
  return Menu.buildFromTemplate([
    { label: `状态：${STATUS_TEXT[status] ?? status}`, enabled: false },
    { type: 'separator' },
    { label: '显示主窗口', click: () => actions.showMain() },
    { label: '设置', click: () => actions.openControl() },
    { label: '在浏览器中打开', click: () => actions.openBrowser() },
    { type: 'separator' },
    { label: '启动服务', enabled: !running, click: () => actions.serviceStart() },
    { label: '停止服务', enabled: status === 'running-managed', click: () => actions.serviceStop() },
    { label: '重启服务', enabled: running, click: () => actions.serviceRestart() },
    { type: 'separator' },
    { label: '检查更新', click: () => actions.checkUpdates() },
    { label: '关于 DeepSeek Harness Desktop', click: () => showAbout() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
}

function showAbout() {
  dialog.showMessageBox({
    type: 'info',
    title: '关于 DeepSeek Harness Desktop',
    message: 'DeepSeek Harness Desktop',
    detail: `${TRAY_DESCRIPTION}\n\n版本 ${app.getVersion()}`,
    buttons: ['好的'],
  })
}

/** Create the tray; call setTrayStatus on every service status change. */
function create(trayActions) {
  actions = trayActions
  tray = new Tray(icons.trayIcon())
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(buildMenu('stopped'))
  tray.on('click', () => actions.showMain())
  return tray
}

/** Refresh the menu (and tooltip) for a new service status. */
function setTrayStatus(status) {
  if (!tray) return
  const running = status === 'running-managed' || status === 'running-external'
  tray.setToolTip(`DeepSeek Harness — ${running ? '运行中' : '已停止'}`)
  tray.setContextMenu(buildMenu(status))
}

function destroy() {
  if (tray) { tray.destroy(); tray = null }
}

module.exports = { create, setTrayStatus, destroy, TRAY_DESCRIPTION }
