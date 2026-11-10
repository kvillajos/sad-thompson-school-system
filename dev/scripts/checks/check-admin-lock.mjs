// Runs the real Admissions page (admin-admissions-page.js + admission-review.js) in headless Chrome/Edge with a
// stubbed Supabase to verify the registrar edit-lock surface: marker in the table, buttons stay disabled for a
// fresh lock, and unlock for a non-locked application only once the three checks are ticked. No credentials needed.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { browserPath } from './browser-path.mjs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '../../..')
const html = readFileSync(join(root, 'role-admin/admin-admissions.html'), 'utf8')
const theme = readFileSync(join(root, 'shared/ui/ui-theme.js'), 'utf8').match(/const sharedTheme = (?:\/\* css \*\/ )?`([\s\S]*?)`;?\s/)[1]
const review = readFileSync(join(root, 'role-admin/admission-review.js'), 'utf8')
const script = readFileSync(join(root, 'role-admin/admin-admissions-page.js'), 'utf8')
// Replace the module imports with an in-page supabase/auth stub.
const stub = `
  const rows = [
    { id: 1, first_name: 'Locked', last_name: 'Case', grade_level: 'Grade 3', status: 'under_review', created_at: new Date().toISOString(), editing_by: 'registrar01', editing_since: new Date().toISOString() },
    { id: 2, first_name: 'Open', last_name: 'Case', grade_level: 'Grade 4', status: 'submitted', created_at: new Date().toISOString(), editing_by: null, editing_since: null }
  ]
  const supabase = {
    from: (table) => table === 'announcements'
      ? { select: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: [] }) }), limit: async () => ({ data: [] }) }) }), insert: async () => ({ error: null }) }
      : table === 'audit_logs'
        ? { select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }
      : table === 'registrar_feedback'
        ? { select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }
      : table === 'profile_change_requests'
        ? { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
      : table === 'approval_requests'
        ? { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
      // Dashboard row counts (select(..., { head: true }), users filtered with .is(), faculty with .eq()); the rest is unused here.
      : ['students', 'staff_profiles', 'users'].includes(table)
        ? { select: (columns, options) => { const result = Promise.resolve({ count: 3, error: null }); result.is = () => result; result.eq = () => result; return options?.head ? result : { in: async () => ({ data: [] }) } } }
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
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))
  const formatDate = (value, includeTime) => value ? (includeTime ? new Date(value).toLocaleString() : new Date(value).toLocaleDateString()) : '-'
  const toast = () => {}
  const describeError = (error, context) => (context || 'Request') + ' failed: ' + (error?.message || error || 'an unexpected error occurred.')
  const mountAdminShell = async () => requireRole(1)
  const escapeHtml = escape
  const gradeLabel = value => String(value)
  const lastFirst = a => a.last_name + ', ' + a.first_name
  const errorRow = (span, error) => '<tr><td colspan="' + span + '">' + (error?.message || error) + '</td></tr>'
  const loadRequirementData = async () => {}
  const requirementBadge = () => ''
  const mountRequirementTypes = () => {}
  const confirmDialog = async () => true
  const noticeDialog = async () => {}
  const describeFunctionError = async error => String(error)
  window.addEventListener('error', event => { const el = document.getElementById('result'); if (el && !el.textContent) el.textContent = 'PAGE_ERROR: ' + (event.message || 'unknown') })`
const strip = source => source.replace(/^\s*import[^\n]*\n/gm, '').replace(/^export /gm, '')
const body = strip(review) + '\n' + strip(script)

const fixture = html
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace('</head>', `<style>${theme}</style></head>`)
  .replace(
    '</body>',
    `<pre id="result"></pre><script>(async () => {
  ${stub}
  ${body}
  try {
  const rowHtml = document.getElementById('admission-rejection-table').innerHTML
  const [lockedRow, openRow] = rowHtml.split('</tr>')
  const markerOnLocked = lockedRow.includes('data-review="1"') && lockedRow.includes('✏️')
  const noMarkerOnOpen = openRow.includes('data-review="2"') && !openRow.includes('✏️')
  const tickAll = () => document.querySelectorAll('[data-review-check]').forEach(box => { box.checked = true; box.onchange() })
  openReview(applications.find(a => a.id === 1))
  await new Promise(r => setTimeout(r, 3200))
  tickAll()
  const lockedDisabledAfterCountdown = document.getElementById('approve-application').disabled && document.getElementById('decline-application').disabled
  const lockNoticeShown = !document.getElementById('review-lock').classList.contains('hidden')
  document.getElementById('close-review').click()
  openReview(applications.find(a => a.id === 2))
  await new Promise(r => setTimeout(r, 3200))
  const openDisabledUntilChecked = document.getElementById('approve-application').disabled
  tickAll()
  const openEnabledAfterCountdown = openDisabledUntilChecked && !document.getElementById('approve-application').disabled && !document.getElementById('decline-application').disabled
  document.getElementById('result').textContent = JSON.stringify({ markerOnLocked, noMarkerOnOpen, lockedDisabledAfterCountdown, lockNoticeShown, openEnabledAfterCountdown })
  } catch (error) { document.getElementById('result').textContent = 'PAGE_ERROR: ' + (error && error.message || error) }
  })().catch(error => { document.getElementById('result').textContent = 'PAGE_ERROR: ' + (error && error.message || error) });</script></body>`
  )
const folder = mkdtempSync(join(tmpdir(), 'admin-lock-'))
try {
  const file = join(folder, 'fixture.html')
  writeFileSync(file, fixture)
  const edge = browserPath()
  const result = spawnSync(
    edge,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      `--user-data-dir=${join(folder, 'profile')}`,
      '--virtual-time-budget=12000',
      '--dump-dom',
      pathToFileURL(file).href
    ],
    { encoding: 'utf8', timeout: 40000, maxBuffer: 4e6 }
  )
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
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
