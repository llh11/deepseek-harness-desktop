'use strict'
/** js-yaml wrapper that survives `!!js` tags present in dsh config files. */
const yaml = require('js-yaml')

const JS_MARKER = '__dsh_js_expr__'
// `!!js/function` etc. come from js-yaml's own ecosystem; the bare `!!js`
// prefix is dsh's expression dialect (`mode: !!js process.env.X`), used in
// cordis patch layers. All map to the same marker so loads round-trip.
const jsTagNames = ['!!js/function', '!!js/regexp', '!!js/undefined', '!js/function', '!js/regexp', '!js/undefined', '!!js']
const jsTypes = jsTagNames.map((tag) => new yaml.Type(tag, {
  kind: 'scalar',
  construct: (value) => `${JS_MARKER}${value}`,
  predicate: (value) => typeof value === 'string' && value.startsWith(JS_MARKER),
  represent: (value) => String(value).slice(JS_MARKER.length),
}))
const dshSchema = yaml.DEFAULT_SCHEMA.extend(jsTypes)

/** Parse YAML, mapping any !!js expression to a marked string so dumps round-trip. */
function load(text) {
  return yaml.load(text, { schema: dshSchema })
}

/** Serialize to YAML; !!js-marked strings become verbatim !!js/function expressions. */
function dump(value) {
  return yaml.dump(value, { schema: dshSchema, lineWidth: 120, noRefs: true })
}

module.exports = { load, dump, JS_MARKER }
