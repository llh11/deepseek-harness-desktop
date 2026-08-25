'use strict'
/**
 * Read-only view of the OFFICIAL credential store. Since 0.1.1 the official
 * "模型" (Models) settings page persists API keys through `credentials.set`
 * into $DSH_HOME/.credentials.yaml (layout: version + refs + records); the
 * resolver layering is  process env > .credentials.yaml > <cwd>/.env >
 * $DSH_HOME/.env. The desktop only ever READS here — every write stays on the
 * official Models page, which remains the single source of truth.
 */
const fs = require('node:fs')
const { files } = require('./paths')

/** Parse the refs mapping of $DSH_HOME/.credentials.yaml without js-yaml:
 * the document is a flat `refs: { NAME: value }` block (records hold richer
 * structures, but the desktop never needs them). Returns {} when absent. */
function readCredentialRefs() {
  let text
  try {
    text = fs.readFileSync(files.dshCredentials, 'utf8')
  } catch {
    return {}
  }
  const refs = {}
  let inRefs = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '')
    if (/^\s*#/.test(line) || line.trim() === '') continue
    if (/^refs:\s*$/.test(line)) { inRefs = true; continue }
    if (/^[A-Za-z_]/.test(line)) inRefs = false // a new top-level key ended the refs block
    if (!inRefs) continue
    const match = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.+?)\s*$/)
    if (!match) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    refs[match[1]] = value
  }
  return refs
}

/** Read one KEY=value from $DSH_HOME/.env (official lowest fallback layer). */
function readEnvFile() {
  let text
  try {
    text = fs.readFileSync(files.dshEnv, 'utf8')
  } catch {
    return {}
  }
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match) env[match[1]] = match[2].trim()
  }
  return env
}

/** Resolve one credential reference exactly like the official layering:
 * process env > $DSH_HOME/.credentials.yaml refs > $DSH_HOME/.env.
 * @returns {string} the value, or '' when unconfigured. */
function resolve(ref) {
  if (typeof ref !== 'string' || ref === '') return ''
  const fromProcess = process.env[ref]
  if (typeof fromProcess === 'string' && fromProcess.trim() !== '') return fromProcess.trim()
  const fromFile = readCredentialRefs()[ref]
  if (typeof fromFile === 'string' && fromFile !== '') return fromFile
  const fromEnvFile = readEnvFile()[ref]
  if (typeof fromEnvFile === 'string' && fromEnvFile.trim() !== '') return fromEnvFile.trim()
  return ''
}

module.exports = { resolve, readCredentialRefs }
