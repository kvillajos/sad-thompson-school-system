// Regression guard: fails if any page re-declares its own escapeHtml/escape helper
// instead of importing the shared one from html.js. Plain grep, no parser needed.
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const files = ['*.html', '*.js', 'faculty/*.js'].flatMap(pattern => globSync(pattern, { cwd: root }))
  .filter(name => name !== 'html.js')

const redeclarePattern = /(?:function\s+escapeHtml\s*\(|const\s+escapeHtml\s*=|const\s+escape\s*=\s*value\s*=>\s*String)/

const offenders = files.filter(name => redeclarePattern.test(readFileSync(resolve(root, name), 'utf8')))

assert.deepEqual(offenders, [], `these files re-declare escapeHtml instead of importing it from html.js: ${offenders.join(', ')}`)
console.log('shared helper checks passed')
