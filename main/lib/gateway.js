'use strict'
/**
 * Multimodal translation gateway. dsh speaks OpenAI-compatible
 * `openai-completions`; the gateway lets any provider sit behind that contract:
 *
 * - `openai` upstreams pass through with auth injection and endpoint joining,
 *   so quirky gateways get clean, spec-shaped requests.
 * - `anthropic` upstreams get a full translation layer: messages (including
 *   multimodal image parts), tools, tool calls, usage, and SSE streaming are
 *   converted between the Anthropic and OpenAI wire formats.
 *
 * Loopback-only, no auth; upstream credentials resolve from $DSH_HOME/.env.
 */
const http = require('node:http')
const providerManager = require('./provider-manager')
const usageTracker = require('./usage-tracker')

let server = null
let running = false

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function openAiError(res, status, message) {
  json(res, status, { error: { message, type: 'gateway_error', code: status } })
}

function upstreamHeaders(kind, key) {
  return kind === 'anthropic'
    ? { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    : { 'content-type': 'application/json', authorization: `Bearer ${key}` }
}

function upstreamBase(provider) {
  const base = provider.upstreamBaseURL.replace(/\/+$/, '')
  if (provider.upstreamKind === 'anthropic' && !/\/v\d+$/.test(base)) return `${base}/v1`
  return base
}

function safeParse(text) {
  try { return JSON.parse(text) } catch { return {} }
}

/** Convert an OpenAI content part to an Anthropic content block. */
function partToAnthropic(part) {
  if (part?.type === 'text' && typeof part.text === 'string') return { type: 'text', text: part.text }
  if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
    const url = part.image_url.url
    const dataMatch = url.match(/^data:([^;,]+);base64,(.*)$/s)
    if (dataMatch) return { type: 'image', source: { type: 'base64', media_type: dataMatch[1], data: dataMatch[2] } }
    return { type: 'image', source: { type: 'url', url } }
  }
  return { type: 'text', text: typeof part?.text === 'string' ? part.text : JSON.stringify(part ?? '') }
}

/** OpenAI messages → Anthropic messages + system, merging consecutive tool results. */
function convertMessages(messages) {
  const systemParts = []
  const converted = []
  for (const message of messages) {
    if (message.role === 'system' || message.role === 'developer') {
      const text = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
      systemParts.push(text)
      continue
    }
    if (message.role === 'tool') {
      const text = typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '')
      const last = converted[converted.length - 1]
      const block = { type: 'tool_result', tool_use_id: String(message.tool_call_id ?? ''), content: [{ type: 'text', text }] }
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
        last.content.push(block)
      } else {
        converted.push({ role: 'user', content: [block] })
      }
      continue
    }
    if (message.role === 'assistant') {
      const blocks = []
      if (typeof message.content === 'string' && message.content !== '') blocks.push({ type: 'text', text: message.content })
      else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          const block = partToAnthropic(part)
          if (block.type === 'image') continue // images cannot come back from the assistant side
          blocks.push(block)
        }
      }
      for (const call of message.tool_calls ?? []) {
        blocks.push({ type: 'tool_use', tool_use_id: String(call.id ?? ''), name: String(call.function?.name ?? ''), input: safeParse(String(call.function?.arguments ?? '{}')) })
      }
      converted.push({ role: 'assistant', content: blocks.length > 0 ? blocks : [{ type: 'text', text: '' }] })
      continue
    }
    // user
    if (typeof message.content === 'string') converted.push({ role: 'user', content: message.content })
    else if (Array.isArray(message.content)) converted.push({ role: 'user', content: message.content.map(partToAnthropic) })
    else converted.push({ role: 'user', content: [{ type: 'text', text: JSON.stringify(message.content ?? '') }] })
  }
  return { system: systemParts.join('\n\n'), messages: converted }
}

function mapStopReason(reason) {
  if (reason === 'tool_use') return 'tool_calls'
  if (reason === 'max_tokens') return 'length'
  if (reason === 'refusal') return 'content_filter'
  return 'stop'
}

/** Anthropic non-stream response → OpenAI chat.completion. */
function anthropicToOpenAi(payload) {
  const blocks = Array.isArray(payload.content) ? payload.content : []
  const text = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
  const toolCalls = blocks.filter((block) => block.type === 'tool_use').map((block, index) => ({
    index,
    id: block.id,
    type: 'function',
    function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
  }))
  const promptTokens = payload.usage?.input_tokens ?? 0
  const completionTokens = payload.usage?.output_tokens ?? 0
  return {
    id: payload.id ?? `chatcmpl-gateway-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: payload.model ?? 'gateway',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text !== '' ? text : null, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) },
      finish_reason: mapStopReason(payload.stop_reason),
    }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
  }
}

/** Translate one Anthropic SSE event into OpenAI chunk objects (0..n). */
function anthropicEventToChunks(event, model, chunkId, toolIndexMap) {
  const base = { id: chunkId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model }
  const chunks = []
  const push = (delta, finishReason = null) => chunks.push({ ...base, choices: [{ index: 0, delta, finish_reason: finishReason }] })

  if (event.type === 'message_start') push({ role: 'assistant', content: '' })
  if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
    const openaiIndex = toolIndexMap.size
    toolIndexMap.set(event.index, openaiIndex)
    push({ tool_calls: [{ index: openaiIndex, id: event.content_block.id, type: 'function', function: { name: event.content_block.name, arguments: '' } }] })
  }
  if (event.type === 'content_block_delta') {
    if (event.delta?.type === 'text_delta') push({ content: event.delta.text })
    if (event.delta?.type === 'input_json_delta') {
      const openaiIndex = toolIndexMap.get(event.index) ?? 0
      push({ tool_calls: [{ index: openaiIndex, function: { arguments: event.delta.partial_json ?? '' } }] })
    }
  }
  if (event.type === 'message_delta') {
    const finishReason = mapStopReason(event.delta?.stop_reason)
    const usage = event.usage
    chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }], ...(usage ? { usage: { prompt_tokens: usage.input_tokens ?? 0, completion_tokens: usage.output_tokens ?? 0 } } : {}) })
  }
  return chunks
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/** Forward to an OpenAI-compatible upstream verbatim (auth + URL joining only),
 * recording token usage for statistics along the way. */
async function forwardOpenAi(res, provider, key, pathSuffix, bodyText, model) {
  const response = await fetch(`${upstreamBase(provider)}${pathSuffix}`, {
    method: bodyText === null ? 'GET' : 'POST',
    headers: upstreamHeaders('openai', key),
    body: bodyText ?? undefined,
  })
  const contentType = response.headers.get('content-type') ?? 'application/json'
  const isStream = contentType.includes('event-stream')
  res.writeHead(response.status, {
    'content-type': contentType,
    ...(isStream ? { 'cache-control': 'no-cache', connection: 'keep-alive' } : {}),
  })
  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let usage = null
    const plainChunks = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (isStream) {
        res.write(Buffer.from(value))
        sseBuffer += decoder.decode(value, { stream: true })
        let idx
        while ((idx = sseBuffer.indexOf('\n')) >= 0) {
          const line = sseBuffer.slice(0, idx).trim()
          sseBuffer = sseBuffer.slice(idx + 1)
          if (line.startsWith('data:') && line.includes('"usage"')) {
            try {
              const found = JSON.parse(line.slice(5))?.usage
              if (found && typeof found === 'object') usage = found
            } catch { /* partial line */ }
          }
        }
      } else {
        plainChunks.push(Buffer.from(value))
      }
    }
    if (!isStream) {
      const whole = Buffer.concat(plainChunks)
      res.write(whole)
      try {
        const found = JSON.parse(whole.toString('utf8'))?.usage
        if (found && typeof found === 'object') usage = found
      } catch { /* non-JSON body */ }
    }
    if (usage) {
      usageTracker.record({
        providerId: provider.id, model,
        promptTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      })
    }
  }
  res.end()
}

/** Translate an Anthropic chat request/response pair, including SSE streams. */
async function forwardAnthropic(res, provider, key, body) {
  const { system, messages } = convertMessages(body.messages ?? [])
  const payload = {
    model: body.model,
    max_tokens: typeof body.max_tokens === 'number' && body.max_tokens > 0 ? body.max_tokens : 8192,
    messages,
    ...(system !== '' ? { system } : {}),
    ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
    ...(typeof body.top_p === 'number' ? { top_p: body.top_p } : {}),
    ...(Array.isArray(body.tools) && body.tools.length > 0 ? {
      tools: body.tools.map((tool) => ({
        name: tool.function?.name ?? String(tool),
        ...(tool.function?.description ? { description: tool.function.description } : {}),
        input_schema: tool.function?.parameters ?? { type: 'object' },
      })),
    } : {}),
    ...(body.tool_choice !== undefined && body.tool_choice !== null ? {
      tool_choice: typeof body.tool_choice === 'string'
        ? { type: body.tool_choice === 'none' ? 'none' : body.tool_choice === 'required' ? 'any' : 'auto' }
        : { type: 'tool', name: body.tool_choice?.function?.name ?? '' },
    } : {}),
    ...(Array.isArray(body.stop) ? { stop_sequences: body.stop } : typeof body.stop === 'string' ? { stop_sequences: [body.stop] } : {}),
    stream: body.stream === true,
  }

  const response = await fetch(`${upstreamBase(provider)}/messages`, {
    method: 'POST',
    headers: upstreamHeaders('anthropic', key),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    let message = text
    try { message = JSON.parse(text)?.error?.message ?? text } catch { /* raw text */ }
    openAiError(res, response.status, `Anthropic 端点错误：${message}`)
    return
  }

  if (payload.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    const chunkId = `chatcmpl-gateway-${Date.now()}`
    const toolIndexMap = new Map()
    let inputTokens = 0
    let outputTokens = 0
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '') continue
        let event
        try { event = JSON.parse(data) } catch { continue }
        if (event.type === 'message_start' && event.message?.usage) inputTokens = event.message.usage.input_tokens ?? inputTokens
        if (event.type === 'message_delta' && event.usage) outputTokens = event.usage.output_tokens ?? outputTokens
        if (event.type === 'message_stop') {
          res.write('data: [DONE]\n\n')
          continue
        }
        if (event.type === 'error') {
          send({ error: { message: event.error?.message ?? 'upstream stream error', type: 'gateway_error' } })
          continue
        }
        for (const chunk of anthropicEventToChunks(event, payload.model, chunkId, toolIndexMap)) send(chunk)
      }
    }
    if (inputTokens > 0 || outputTokens > 0) {
      usageTracker.record({ providerId: provider.id, model: payload.model, promptTokens: inputTokens, completionTokens: outputTokens })
    }
    res.end()
    return
  }

  const payloadJson = await response.json()
  if (payloadJson?.usage) {
    usageTracker.record({
      providerId: provider.id, model: payload.model,
      promptTokens: payloadJson.usage.input_tokens ?? 0,
      completionTokens: payloadJson.usage.output_tokens ?? 0,
    })
  }
  json(res, 200, anthropicToOpenAi(payloadJson))
}

async function handleChat(res, provider, bodyText) {
  const key = providerManager.resolveKey(provider.id)
  if (key === '') return openAiError(res, 401, `未配置 Provider "${provider.id}" 的 API Key，请在“模型与多模态”中保存密钥`)
  let body
  try { body = JSON.parse(bodyText) } catch { return openAiError(res, 400, '请求体不是有效的 JSON') }
  try {
    if (provider.upstreamKind === 'anthropic') await forwardAnthropic(res, provider, key, body)
    else await forwardOpenAi(res, provider, key, '/chat/completions', JSON.stringify(body), body.model)
  } catch (error) {
    openAiError(res, 502, `上游请求失败：${error.message}`)
  }
}

async function handleModels(res, provider) {
  const key = providerManager.resolveKey(provider.id)
  try {
    const response = await fetch(`${upstreamBase(provider)}/models`, { headers: upstreamHeaders(provider.upstreamKind, key), signal: AbortSignal.timeout(20_000) })
    const body = await response.json().catch(() => ({}))
    const rows = Array.isArray(body?.data) ? body.data : []
    json(res, 200, { object: 'list', data: rows.map((row) => ({ id: String(row?.id ?? ''), object: 'model', owned_by: provider.id })).filter((row) => row.id !== '') })
  } catch (error) {
    openAiError(res, 502, `模型列表获取失败：${error.message}`)
  }
}

async function handler(request, response) {
  const url = new URL(request.url, 'http://127.0.0.1')
  const match = url.pathname.match(/^\/v1\/p\/([a-z0-9-]+)\/(models|chat\/completions)$/)
  if (!match) return openAiError(response, 404, `网关未知路径：${url.pathname}`)
  const provider = providerManager.getProvider(match[1])
  if (!provider || !provider.viaGateway) return openAiError(response, 404, `网关未接管 Provider：${match[1]}`)
  if (match[2] === 'models') return handleModels(response, provider)
  if (request.method !== 'POST') return openAiError(response, 405, '只接受 POST')
  return handleChat(response, provider, await readBody(request))
}

/** Start the loopback gateway; safe to call repeatedly. */
function start(port) {
  if (running) return true
  server = http.createServer(handler)
  server.on('clientError', (_error, socket) => socket.destroy())
  server.listen(port, '127.0.0.1')
  running = true
  return true
}

async function stop() {
  if (!running) return
  await new Promise((resolve) => server.close(resolve))
  running = false
}

function isRunning() {
  return running
}

module.exports = { start, stop, isRunning }
