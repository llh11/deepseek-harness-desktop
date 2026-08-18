'use strict'
const api = window.dshDesktop
const statusEl = document.getElementById('status')
const detailEl = document.getElementById('detail')
const spinnerEl = document.getElementById('spinner')

function render(status) {
  const running = status.status === 'running-managed' || status.status === 'running-external'
  statusEl.textContent = status.detail || status.status
  detailEl.textContent = status.loadError ? `页面加载失败：${status.loadError}` : ''
  spinnerEl.classList.toggle('done', running || status.status === 'error')
}

api.on('service:status', render)
api.invoke('service:status').then(render).catch((error) => { statusEl.textContent = `状态读取失败：${error.message}` })

document.getElementById('btn-retry').addEventListener('click', () => {
  statusEl.textContent = '正在重新启动服务…'
  api.invoke('service:start').then(render)
})
document.getElementById('btn-browser').addEventListener('click', async () => {
  const settings = await api.invoke('settings:get')
  api.invoke('shell:openExternal', settings.origin)
})
