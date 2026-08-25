'use strict'
/**
 * Preload bridge for pages loaded in the desktop window and the injection entry
 * for the desktop settings panel. The bridge stays available for page-world
 * scripts (loading page); the panel itself lives in renderer/desktop-ui.js
 * and talks to the main process through ipcRenderer directly.
 */
const { contextBridge, ipcRenderer } = require('electron')

const INVOKE_CHANNELS = new Set([
  'app:info', 'settings:get', 'settings:set', 'dialog:pickFolder',
  'service:status', 'service:start', 'service:stop', 'service:restart', 'service:logs', 'service:versions',
  'skills:list', 'skills:listMerged', 'skills:install', 'skills:installPaths', 'skills:searchGitHub', 'skills:remove', 'skills:toggle', 'skills:refresh',
  'mcp:state', 'mcp:save', 'mcp:remove', 'mcp:toggle', 'mcp:apply', 'mcp:test',
  'plugins:catalog',
  'balances:list', 'official-usage:stats', 'official:llmProviders',
  'updates:check', 'updates:applyOfficial', 'updates:downloadDesktop',
  'shell:openExternal', 'shell:openPath', 'ui:openControl', 'ui:openMain',
])

const EVENT_CHANNELS = new Set(['service:status', 'skills:changed'])

contextBridge.exposeInMainWorld('dshDesktop', {
  invoke: (channel, payload) => {
    if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error(`未知 IPC 通道：${channel}`))
    return ipcRenderer.invoke(channel, payload)
  },
  on: (channel, callback) => {
    if (!EVENT_CHANNELS.has(channel)) throw new Error(`未知事件通道：${channel}`)
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})

try {
  require('./renderer/desktop-ui.js').init(ipcRenderer)
} catch (error) {
  console.error('dsh-desktop: settings panel injection failed:', error)
}

try {
  require('./renderer/chat-enhance.js').init(ipcRenderer)
} catch (error) {
  console.error('dsh-desktop: chat-flow bridge injection failed:', error)
}
