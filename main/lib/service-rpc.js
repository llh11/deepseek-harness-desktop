'use strict'
/**
 * Minimal unary-RPC client for the running dsh web service. The web server
 * mounts the API at POST {origin}/api/<method> with envelope
 * { type: 'client-request', rpcId, method, payload } and replies with
 * { rpcId, result: { ok, value | error } }.
 */
const crypto = require('node:crypto')
const settings = require('./settings-store')

async function callRpc(method, payload = {}, timeoutMs = 8000) {
  const origin = String(settings.get().origin ?? '').trim() || 'http://127.0.0.1:3080'
  const rpcId = crypto.randomUUID()
  const response = await fetch(`${origin.replace(/\/+$/, '')}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json()
  if (body?.rpcId !== rpcId) throw new Error('rpcId 校验不匹配')
  if (!body?.result?.ok) throw new Error(body?.result?.error?.message ?? 'RPC 调用失败')
  return body.result.value
}

module.exports = { callRpc }
