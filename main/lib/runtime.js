'use strict'
/** Shared resolution of the bundled standalone Node runtime and npm CLI.
 * dsh requires Node >=22.19 (node:zlib zstd), which Electron's embedded Node
 * may not provide; the packaged app ships node-runtime/ (node.exe + npm). */
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

/** Candidate directories that may hold the bundled runtime. */
function runtimeDirs() {
  const dirs = []
  if (typeof process.resourcesPath === 'string') dirs.push(path.join(process.resourcesPath, 'node-runtime'))
  dirs.push(path.join(app.getAppPath(), 'node-runtime'))
  return dirs
}

/** Absolute path of the bundled node executable, or null when absent. */
function nodeExe() {
  const name = process.platform === 'win32' ? 'node.exe' : 'node'
  for (const dir of runtimeDirs()) {
    const candidate = path.join(dir, name)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Absolute path of the bundled npm-cli.js, or null when absent. */
function npmCli() {
  for (const dir of runtimeDirs()) {
    const candidate = path.join(dir, 'npm', 'bin', 'npm-cli.js')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

module.exports = { nodeExe, npmCli }
