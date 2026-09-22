// Runs the real admin-dashboard script in headless Edge with a stubbed Supabase to
// verify the registrar edit-lock surface: marker in the table, buttons stay disabled
// for a fresh lock, and unlock for a non-locked application. No credentials needed.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '..')
const html = readFileSync(join(root, 'admin-dashboard.html'), 'utf8')
const theme = readFileSync(join(root, 'ui-theme.js'), 'utf8').match(/const sharedTheme = `([\s\S]*?)`;/)[1]
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
// Replace the module imports with an in-page supabase/auth stub.
const stub = `
  const rows = [
    { id: 1, first_name: 'Locked', last_name: 'Case', grade_level: 'Grade 3', status: 'under_review', created_at: new Date().toISOString(), editing_by: 'registrar01', editing_since: new Date().toISOString() },
    { id: 2, first_name: 'Open', last_name: 'Case', grade_level: 'Grade 4', status: 'submitted', created_at: new Date().toISOString(), editing_by: null, editing_since: null }
  ]
  const supabase = {
    from: (table) => table === 'announcements'
      ? { select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }), insert: async () => ({ error: null }) }
      : table === 'audit_logs'
        ? { select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }
      : table === 'profile_change_requests'
        ? { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
      : { select: () => ({ in: () => ({ order: async () => ({ data: rows }) }) }) },
    rpc: async () => ({ data: null, error: null }),
    functions: { invoke: async () => ({ data: {}, error: null }) },
    auth: { getSession: async () => ({ data: { session: { user: { email: 'a@b.c' } } } }), signOut: async () => ({}) }
  }
  const requireRole = async () => ({ user_id: 1, username: 'admin' })
  const mountSidebar = () => {}
  const withBusy = async (button, label, action) => action()
  const signOut = async () => {}
  const applyUiTheme = () => {}
  const mountProfile = () => {}
  const hideLoadingScreen = () => {}
  const isEditLocked = (a) => Boolean(a.editing_by && a.editing_since && new Date(a.editing_since).getTime() > Date.now() - 600000)
  const editLockMessage = (a) => a.editing_by + ' is correcting this application right now.'
  window.addEventListener('error', event => { const el = document.getElementById('result'); if (el && !el.textContent) el.textContent = 'PAGE_ERROR: ' + (event.message || 'unknown') })`
const body = script
  .replace(/^\s*import[^\n]*\n/gm, '')

const fixture = html
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace('</head>', `<style>${theme}</style></head>`)
  .replace('</body>', `<pre id="result"></pre><script>(async () => {
  ${stub}
  ${body}
  try {
  await loadApplications()
  await new Promise(r => setTimeout(r, 3500))
  const rowHtml = document.getElementById('pending-table').innerHTML
  const markerOnLocked = rowHtml.includes('data-review="1"') && rowHtml.includes('✏️')
  const noMarkerOnOpen = !rowHtml.includes('data-review="2"') || !(rowHtml.split('data-review="2"')[0].endsWith('editing</b>'))
  openReview('1')
  await new Promise(r => setTimeout(r, 3200))
  const lockedDisabledAfterCountdown = document.getElementById('approve-application').disabled && document.getElementById('decline-application').disabled
  const lockNoticeShown = !document.getElementById('review-lock').classList.contains('hidden')
  closeReview()
  openReview('2')
  await new Promise(r => setTimeout(r, 3200))
  const openEnabledAfterCountdown = !document.getElementById('approve-application').disabled && !document.getElementById('decline-application').disabled
  document.getElementById('result').textContent = JSON.stringify({ markerOnLocked, noMarkerOnOpen, lockedDisabledAfterCountdown, lockNoticeShown, openEnabledAfterCountdown })
  } catch (error) { document.getElementById('result').textContent = 'PAGE_ERROR: ' + (error && error.message || error) }
  })().catch(error => { document.getElementById('result').textContent = 'PAGE_ERROR: ' + (error && error.message || error) });</script></body>`)
const folder = mkdtempSync(join(tmpdir(), 'admin-lock-'))
try {
  const file = join(folder, 'fixture.html')
  writeFileSync(file, fixture)
  const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  const result = spawnSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', `--user-data-dir=${join(folder, 'profile')}`, '--virtual-time-budget=12000', '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 40000, maxBuffer: 4e6 })
  if (result.error) throw result.error
  const match = result.stdout.match(/<pre id="result">(.*?)<\/pre>/)
  assert.ok(match?.[1], `Browser produced no result: ${result.stderr.slice(-1500)}`)
  const data = JSON.parse(match[1].replaceAll('&quot;', '"'))
  console.log(data)
  assert.equal(data.markerOnLocked, true)
  assert.equal(data.noMarkerOnOpen, true)
  assert.equal(data.lockedDisabledAfterCountdown, true)
  assert.equal(data.lockNoticeShown, true)
  assert.equal(data.openEnabledAfterCountdown, true)
  console.log('admin lock-surface checks passed')
} finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
