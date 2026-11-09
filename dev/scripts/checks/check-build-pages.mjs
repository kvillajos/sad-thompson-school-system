// Regression guard for two bugs that passed the build but broke production:
// 1. a role page missing from the `pages` map in vite.config.js is left out of the Vercel build (404);
// 2. a missing comma between two array rows (`]` newline `[`) turns the second row into an index lookup,
//    so the list gets an `undefined` entry (this crashed every admin page through the admin nav).
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '../../..')
const read = name => readFileSync(resolve(root, name), 'utf8')

const vite = read('vite.config.js')
const pages = globSync('{*.html,role-*/*.html}', { cwd: root }).map(name => name.replaceAll('\\', '/'))
const missing = pages.filter(page => !vite.includes(`'${page}'`))
assert.deepEqual(missing, [], `add these pages to the pages map in vite.config.js: ${missing.join(', ')}`)

const sources = globSync('{auth,role-admin,role-registrar,role-student,role-faculty,shared/*}/*.js', { cwd: root })
const commaBugs = sources.filter(name => /\]\s*\n\s*\[\s*['"`]/.test(read(name)))
assert.deepEqual(commaBugs, [], `missing comma between array rows in: ${commaBugs.join(', ')}`)

console.log('build page checks passed')
