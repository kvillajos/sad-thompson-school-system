import assert from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
// Every browser-bundled file, not a hand-maintained list, so a new page can't slip past
// this scan the way admin-dashboard.html did once its inline script moved to its own file.
const sourceFiles = ['*.html', '*.js', 'faculty/*.js'].flatMap(pattern => globSync(pattern, { cwd: root }))
const browserSource = sourceFiles.map(file => readFileSync(join(root, file), 'utf8')).join('\n')
assert.match(browserSource, /VITE_SUPABASE_ANON_KEY/, 'browser auth must use the public anon key variable')
assert.doesNotMatch(browserSource, /SERVICE_ROLE_KEY|service_role|SUPABASE_SERVICE_ROLE_KEY/i, 'service-role keys must not appear in browser source')
assert.doesNotMatch(browserSource, /VITE_SUPABASE_SERVICE|VITE_SERVICE_ROLE/i, 'service-role keys must not use Vite-exposed variables')
assert.match(readFileSync(join(root, 'supabase', 'functions', 'provision-account', 'index.ts'), 'utf8'), /SUPABASE_SERVICE_ROLE_KEY/)
console.log('frontend/server key boundary checks passed')