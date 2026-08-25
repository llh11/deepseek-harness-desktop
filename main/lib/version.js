'use strict'
/** Shared semver-ish comparison (rc-aware): 0.1.0-rc.8 > 0.1.0-rc.7, 0.1.1 > 0.1.0. */
function compareVersions(left, right) {
  const normalize = (value) => String(value ?? '').replace(/^v/, '').split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part))
  const a = normalize(left)
  const b = normalize(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const partA = a[index]
    const partB = b[index]
    if (partA === undefined) return -1
    if (partB === undefined) return 1
    if (partA === partB) continue
    if (typeof partA === 'number' && typeof partB === 'number') return partA < partB ? -1 : 1
    return String(partA) < String(partB) ? -1 : 1
  }
  return 0
}

module.exports = { compareVersions }
