'use strict'
/**
 * Chat-flow bridge: integrates the desktop's Skill/MCP quick-insert palette
 * and conversation-view enhancements directly into the OFFICIAL conversation
 * composer, without modifying any official file.
 *
 *  - A quick-insert trigger beside the official command button opens a palette
 *    of installed Skills and MCP tools; choosing one inserts its invocation
 *    token into the draft at the caret.
 *  - The official image lightbox gains wheel zoom, drag panning, double-click
 *    reset, and a download button.
 *  - Plugin names inside the official settings dialog get inline Chinese
 *    annotations.
 *
 * Since 1.4.0 the official engine handles multimodal input natively (the
 * official "模型" section declares per-model input modalities, and the
 * composer accepts images for every model that declares them), so the former
 * desktop-side "多模态 / 纯文本" chip and upload gating are gone — the model
 * selector's own capabilities are authoritative now.
 *
 * @module dsh-desktop/chat-enhance
 */

const CSS = `
.dshdc-quick { position: relative; }
.dshdc-quick-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)); background: transparent; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer; font-family: inherit; }
.dshdc-quick-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); color: var(--dsw-alias-label-primary, #ddd); }
.dshdc-panel { position: absolute; bottom: 36px; left: 0; z-index: 1150; width: 320px; max-height: 320px; display: flex; flex-direction: column; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)); background: var(--dsw-alias-bg-layer-2, #1b1f27); box-shadow: 0 12px 32px rgba(0,0,0,.35); overflow: hidden; font-family: inherit; }
.dshdc-panel input { margin: 8px; height: 30px; padding: 3px 10px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary, #ddd); font-size: 13px; font-family: inherit; }
.dshdc-panel input:focus { outline: none; border-color: var(--dsw-alias-border-activated, #4d7cfe); }
.dshdc-list { overflow: auto; padding: 0 4px 8px; }
.dshdc-group { padding: 6px 10px 2px; font-size: 11px; color: var(--dsw-alias-label-quaternary, #777); }
.dshdc-item { display: flex; flex-direction: column; gap: 1px; width: 100%; text-align: left; border: none; background: transparent; padding: 6px 10px; border-radius: 8px; cursor: pointer; color: var(--dsw-alias-label-primary, #ddd); font-size: 13px; font-family: inherit; }
.dshdc-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.dshdc-item small { color: var(--dsw-alias-label-tertiary, #888); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshdc-empty { padding: 14px; text-align: center; color: var(--dsw-alias-label-quaternary, #777); font-size: 12px; }
.dshdc-plugnote { display: block; margin-top: 2px; font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-quaternary, #8a8f9c); font-family: inherit; }
`

/** Initialize the chat-flow bridge. @param ipcRenderer - Electron ipcRenderer. */
function init(ipcRenderer) {
  const stylesheet = new CSSStyleSheet()
  stylesheet.replaceSync(CSS)
  const call = (channel, payload) => ipcRenderer.invoke(channel, payload)

  /** Debounced toast reuse of the desktop panel's channel. */
  function toast(message) {
    let node = document.querySelector('.dshdx-toast')
    if (!node) {
      node = document.createElement('div')
      node.className = 'dshdx-toast'
      node.style.cssText = 'position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:1300;background:var(--dsw-alias-bg-inverse,#222);color:var(--dsw-alias-label-inverse,#eee);padding:10px 18px;border-radius:10px;font-size:13px;max-width:70vw;'
      document.documentElement.appendChild(node)
    }
    node.textContent = message
    node.classList.remove('dshdx-hidden')
    clearTimeout(toast.timer)
    toast.timer = setTimeout(() => { node.style.display = 'none' }, 3400)
    node.style.display = ''
  }

  /* ---------- official plugin list: inline Chinese annotations ---------- */
  let pluginNotes = { at: 0, map: new Map() }
  async function pluginNoteMap() {
    if (pluginNotes.map.size > 0 && Date.now() - pluginNotes.at < 120_000) return pluginNotes.map
    const data = await call('plugins:catalog').catch(() => null)
    if (data?.items) {
      pluginNotes = { at: Date.now(), map: new Map() }
      for (const item of data.items) {
        if (item.curated && item.summary) {
          const name = item.name.toLowerCase()
          pluginNotes.map.set(name, item.summary)
          pluginNotes.map.set(`@deepseek-ai/${name}`, item.summary)
          // The official inventory strips well-known prefixes: dsh-agent → agent,
          // cordis-plugin-timer → timer. Register the display forms too.
          for (const prefix of ['dsh-', 'cordis-plugin-']) {
            if (name.startsWith(prefix)) pluginNotes.map.set(name.slice(prefix.length), item.summary)
          }
        }
      }
    }
    return pluginNotes.map
  }

  /** Annotate plugin names inside the OFFICIAL settings dialog in place. */
  async function annotatePluginList() {
    if (pluginNotes.map.size === 0) await pluginNoteMap()
    if (pluginNotes.map.size === 0) return
    for (const dialog of document.querySelectorAll('[role="dialog"][aria-modal="true"]')) {
      if (!dialog.querySelector('nav')) continue
      const nodes = dialog.querySelectorAll('span, div, p, a, code, strong, b, h1, h2, h3, h4, h5, li, button')
      for (const node of nodes) {
        if (node.dataset.dshdcNoted !== undefined) continue
        if (node.closest('.dshdx-section')) continue
        // Only leaf-ish nodes whose own text is exactly a plugin name.
        const ownText = [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent).join('').trim()
        if (ownText === '' || ownText.length > 44) continue
        const summary = pluginNotes.map.get(ownText.toLowerCase())
        if (!summary) continue
        node.dataset.dshdcNoted = '1'
        const note = document.createElement('span')
        note.className = 'dshdc-plugnote'
        note.textContent = summary
        node.appendChild(note)
      }
    }
  }

  /* ---------- Skill / MCP quick-insert palette ---------- */
  let quickCache = { at: 0, skills: [], mcp: [] }
  async function quickData() {
    if (Date.now() - quickCache.at < 20_000) return quickCache
    const [skills, mcp] = await Promise.all([
      call('skills:list').catch(() => ({ items: [] })),
      call('mcp:state').catch(() => ({ servers: [] })),
    ])
    quickCache = {
      at: Date.now(),
      skills: (skills.items ?? []).filter((item) => !item.shadowedBy),
      mcp: (mcp.servers ?? []).filter((server) => server.enabled),
    }
    return quickCache
  }

  function insertIntoDraft(card, text) {
    const textarea = card.querySelector('textarea')
    if (!textarea) return
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? start
    const next = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`
    if (setter) setter.call(textarea, next)
    else textarea.value = next
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    const caret = start + text.length
    requestAnimationFrame(() => {
      textarea.focus()
      try { textarea.setSelectionRange(caret, caret) } catch { /* detached */ }
    })
  }

  function closePanel() {
    const panel = composerState.quick?.querySelector('.dshdc-panel')
    if (panel) panel.remove()
    document.removeEventListener('mousedown', outsideClose, true)
  }
  function outsideClose(event) {
    if (composerState.quick && !composerState.quick.contains(event.target)) closePanel()
  }

  async function openPanel(card) {
    closePanel()
    const host = composerState.quick
    if (!host) return
    const panel = document.createElement('div')
    panel.className = 'dshdc-panel'
    const search = document.createElement('input')
    search.type = 'search'
    search.placeholder = '搜索 Skill 或 MCP 工具…'
    const list = document.createElement('div')
    list.className = 'dshdc-list'
    panel.append(search, list)
    host.appendChild(panel)
    document.addEventListener('mousedown', outsideClose, true)
    search.focus()

    const { skills, mcp } = await quickData()
    const render = () => {
      const needle = search.value.trim().toLowerCase()
      list.replaceChildren()
      const hit = (text) => needle === '' || String(text ?? '').toLowerCase().includes(needle)
      const addGroup = (label) => {
        const g = document.createElement('div')
        g.className = 'dshdc-group'
        g.textContent = label
        list.appendChild(g)
      }
      const addItem = (title, sub, onPick) => {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'dshdc-item'
        const strong = document.createElement('span')
        strong.textContent = title
        item.appendChild(strong)
        if (sub) {
          const small = document.createElement('small')
          small.textContent = sub
          item.appendChild(small)
        }
        item.addEventListener('click', () => { onPick(); closePanel() })
        list.appendChild(item)
      }
      const skillHits = skills.filter((item) => hit(item.name) || hit(item.description))
      const mcpHits = mcp.filter((server) => hit(server.name))
      if (skillHits.length > 0) {
        addGroup('Skills（插入 / 调用）')
        for (const item of skillHits.slice(0, 12)) {
          addItem(`/${item.name}`, item.description || item.rootLabel, () => insertIntoDraft(card, `/${item.name} `))
        }
      }
      if (mcpHits.length > 0) {
        addGroup('MCP 服务器（插入工具调用提示）')
        for (const server of mcpHits.slice(0, 12)) {
          addItem(server.name, server.transport === 'stdio' ? server.command : server.url, () => insertIntoDraft(card, `请使用 MCP 服务器 ${server.name}（工具命名空间 mcp__${server.name}__*）：`))
        }
      }
      if (skillHits.length === 0 && mcpHits.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'dshdc-empty'
        empty.textContent = '无匹配项。可在设置 → Skill 加载器 / MCP 插件中添加。'
        list.appendChild(empty)
      }
    }
    search.addEventListener('input', render)
    search.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanel() })
    render()
  }

  /* ---------- composer augmentation ---------- */
  const composerState = { card: null, quick: null }

  function findComposer() {
    return document.querySelector('[data-composer-card]')
  }

  function augment(card) {
    if (composerState.card === card && card.contains(composerState.quick ?? null)) return
    composerState.card = card

    // Quick-insert palette beside the official command ("+") button.
    const commands = card.querySelector('button[aria-haspopup="listbox"]')
    if (commands) {
      const quick = document.createElement('span')
      quick.className = 'dshdc-quick'
      const qbtn = document.createElement('button')
      qbtn.type = 'button'
      qbtn.className = 'dshdc-quick-btn'
      qbtn.title = 'Skill / MCP 速查插入'
      qbtn.textContent = '#'
      qbtn.setAttribute('aria-label', 'Skill 与 MCP 速查')
      qbtn.addEventListener('mousedown', (event) => event.preventDefault())
      qbtn.addEventListener('click', () => openPanel(card))
      quick.appendChild(qbtn)
      commands.parentElement.insertBefore(quick, commands.nextSibling)
      composerState.quick = quick
    }
  }

  /* ---------- lightbox fix: zoom / pan / download ----------
   * The official ImageLightbox renders the original image at fit-to-viewport
   * size with no zoom and no download (documented upstream limitation). This
   * bridge augments any mounted lightbox in place: wheel zoom around the
   * cursor, drag panning while zoomed, double-click reset, and a download
   * button beside the close control. */
  const lightboxState = { root: null, scale: 1, tx: 0, ty: 0 }

  function findLightbox() {
    for (const el of document.body.children) {
      if (!(el instanceof HTMLElement)) continue
      if (el.getAttribute('role') !== 'dialog' || el.getAttribute('aria-modal') !== 'true') continue
      if (el.querySelector('nav')) continue // the settings dialog is not a lightbox
      const img = el.querySelector('img')
      if (img && el.querySelector('button')) return { root: el, img }
    }
    return null
  }

  function applyLightboxTransform(img) {
    img.style.transform = `translate(${lightboxState.tx}px, ${lightboxState.ty}px) scale(${lightboxState.scale})`
    img.style.transition = 'transform .08s ease-out'
    img.style.maxWidth = 'none'
    img.style.cursor = lightboxState.scale > 1 ? 'grab' : 'zoom-in'
  }

  function resetLightbox(img) {
    lightboxState.scale = 1
    lightboxState.tx = 0
    lightboxState.ty = 0
    applyLightboxTransform(img)
    const meter = lightboxState.root?.querySelector('.dshdc-zoom-meter')
    if (meter) meter.textContent = '100%'
  }

  function augmentLightbox(root, img) {
    if (root.dataset.dshdcLightbox === '1') return
    root.dataset.dshdcLightbox = '1'
    lightboxState.root = root
    resetLightbox(img)

    const toolbar = document.createElement('div')
    toolbar.style.cssText = 'position:absolute;bottom:22px;left:50%;transform:translateX(-50%);z-index:5;display:flex;gap:8px;align-items:center;padding:6px 12px;border-radius:16px;background:var(--dsw-alias-bg-layer-2,rgba(20,24,32,.85));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));backdrop-filter:blur(8px);font-family:inherit;'
    const meter = document.createElement('span')
    meter.className = 'dshdc-zoom-meter'
    meter.style.cssText = 'font-size:12px;color:var(--dsw-alias-label-secondary,#bbb);min-width:40px;text-align:center;'
    meter.textContent = '100%'
    const mkBtn = (label, title, onClick) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.title = title
      b.style.cssText = 'border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));background:transparent;color:var(--dsw-alias-label-primary,#eee);border-radius:12px;height:24px;padding:0 10px;font-size:12px;cursor:pointer;font-family:inherit;'
      b.addEventListener('click', (event) => { event.stopPropagation(); onClick() })
      return b
    }
    toolbar.append(
      mkBtn('−', '缩小', () => { lightboxState.scale = Math.max(0.2, lightboxState.scale / 1.2); applyLightboxTransform(img); meter.textContent = `${Math.round(lightboxState.scale * 100)}%` }),
      meter,
      mkBtn('+', '放大', () => { lightboxState.scale = Math.min(8, lightboxState.scale * 1.2); applyLightboxTransform(img); meter.textContent = `${Math.round(lightboxState.scale * 100)}%` }),
      mkBtn('重置', '恢复原尺寸（双击图片同效）', () => { resetLightbox(img) }),
      mkBtn('下载', '下载原图', async () => {
        try {
          const response = await fetch(img.src)
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = img.alt || 'image.png'
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 5000)
        } catch { toast('下载失败：无法读取图片数据') }
      }),
    )
    root.appendChild(toolbar)

    root.addEventListener('wheel', (event) => {
      event.preventDefault()
      const delta = event.deltaY < 0 ? 1.12 : 1 / 1.12
      lightboxState.scale = Math.min(8, Math.max(0.2, lightboxState.scale * delta))
      applyLightboxTransform(img)
      meter.textContent = `${Math.round(lightboxState.scale * 100)}%`
    }, { passive: false })
    img.addEventListener('dblclick', (event) => { event.stopPropagation(); resetLightbox(img) })

    let dragging = false
    let last = { x: 0, y: 0 }
    img.addEventListener('mousedown', (event) => {
      if (lightboxState.scale <= 1) return
      dragging = true
      last = { x: event.clientX, y: event.clientY }
      img.style.cursor = 'grabbing'
      event.preventDefault()
      event.stopPropagation()
    })
    window.addEventListener('mousemove', (event) => {
      if (!dragging) return
      lightboxState.tx += event.clientX - last.x
      lightboxState.ty += event.clientY - last.y
      last = { x: event.clientX, y: event.clientY }
      applyLightboxTransform(img)
    })
    window.addEventListener('mouseup', () => {
      if (!dragging) return
      dragging = false
      img.style.cursor = lightboxState.scale > 1 ? 'grab' : 'zoom-in'
    })
    // The official backdrop closes on mousedown; while zoomed, image drags
    // must not reach it (handled above), and backdrop clicks still close.
  }

  /* ---------- observation loop ---------- */
  let scanTimer = null
  function scan() {
    if (!document.adoptedStyleSheets.includes(stylesheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, stylesheet]
    }
    const card = findComposer()
    if (card) {
      if (card !== composerState.card || !composerState.quick || !card.contains(composerState.quick)) augment(card)
    }
    const lightbox = findLightbox()
    if (lightbox) augmentLightbox(lightbox.root, lightbox.img)
    else lightboxState.root = null
    annotatePluginList()
  }
  const throttledScan = () => {
    if (scanTimer) return
    scanTimer = setTimeout(() => { scanTimer = null; scan() }, 250)
  }
  const observer = new MutationObserver(throttledScan)
  const startObserving = () => {
    if (!document.documentElement) return false
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    scan()
    return true
  }
  // Preloads run at document creation; documentElement may not exist yet.
  if (!startObserving()) {
    document.addEventListener('DOMContentLoaded', startObserving, { once: true })
  }
}

module.exports = { init }
