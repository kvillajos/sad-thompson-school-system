import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const print = readFileSync(join(root, 'print.js'), 'utf8')
const theme = readFileSync(join(root, 'ui-theme.js'), 'utf8')
assert.match(print, /export function printElement/)
assert.match(print, /finally/)
assert.match(theme, /@page\s*\{[^}]*size:\s*A4/s)
assert.match(theme, /printing-transcript/)
console.log('print checks passed')
