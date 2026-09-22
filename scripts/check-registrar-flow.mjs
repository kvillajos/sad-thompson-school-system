// Full registrar workflow smoke test: runs the REAL registrar.js in headless Edge with
// only the Supabase client stubbed. Verifies the auto-assign flow (plan -> confirm ->
// RPC payload) and the Grade -> Section -> student filtering, without touching live data.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const read = name => readFileSync(join(root, name), 'utf8')
const html = read('student-records.html')
const folder = mkdtempSync(join(tmpdir(), 'registrar-flow-'))

const stubAuth = `const STUDENTS = [
  { student_id: 11, lrn_number: 'TCS-1', first_name: 'Amistoso', last_name: 'Amistoso', grade_level: 10, gender: 'Male', enrollment_status: 'Enrolled' },
  { student_id: 12, lrn_number: 'TCS-2', first_name: 'Bautista', last_name: 'Bautista', grade_level: 9, gender: 'Female', enrollment_status: 'Enrolled' },
  { student_id: 21, lrn_number: 'TCS-3', first_name: 'Cortez', last_name: 'Cortez', grade_level: 9, gender: 'Male', enrollment_status: 'Enrolled' }
]
const ENROLLMENTS = [
  { id: 5, student_id: 11, school_year: '2025-2026', enrolled_at: '2025-06-01', status: 'active', section_id: 3, sections: { section_name: 'St. Mark' } }
]
const SECTIONS = [
  { section_id: 1, section_name: 'St. Lucy', grade_level: 9, capacity: 2 },
  { section_id: 2, section_name: 'St. Monica', grade_level: 9, capacity: 2 },
  { section_id: 3, section_name: 'St. Mark', grade_level: 10, capacity: 2 }
]
const DATA = { students: STUDENTS, enrollments: ENROLLMENTS, sections: SECTIONS, admission_applications: [], academic_history: [], drafts: [] }
function query(table) {
  const result = { data: DATA[table] || [], error: null }
  const proxy = new Proxy({}, { get(_t, prop) {
    if (prop === 'then') return (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected)
    return () => proxy
  } })
  return proxy
}
window.__calls = { rpc: [] }
export const supabase = {
  rpc(name, args) { window.__calls.rpc.push({ name, args }); const data = name === 'apply_section_assignments' ? { placed: (args.p_assignments || []).length } : null; return Promise.resolve({ data, error: null }) },
  from(table) { return query(table) }
}
export async function requireRole() { return { username: 'registrar', role_id: 2 } }
export async function signOut() {}
`
const stubTheme = `export const applyUiTheme = () => {}
export const mountProfile = () => {}
export function mountSidebar(items) {
  const nav = document.createElement('nav')
  nav.innerHTML = items.map(i => '<button data-tab="' + i.tab + '">' + i.label + '</button>').join('')
  document.body.prepend(nav)
}
export const withBusy = async (button, label, action) => action()
export const installTableSort = () => {}
`
const stubLoading = 'export const hideLoadingScreen = () => {}\n'

// In-browser driver: waits for the app to boot, then drives the auto-assign flow
// (plan -> confirm -> RPC payload) and the Grade -> Section -> students filtering.
const driverSource = `const wait = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, label, tries = 50) { for (let i = 0; i < tries; i += 1) { try { const v = fn(); if (v) return v } catch {} await wait(100) } throw new Error('timeout: ' + label) }
const out = {}
try {
  await waitFor(() => document.querySelector('#enrollment-table tr'), 'enrollment rows')
  out.enrollmentRows = document.querySelectorAll('#enrollment-table tr').length
  document.querySelector('#auto-assign-sections').click()
  await waitFor(() => !document.querySelector('#auto-assign-modal').classList.contains('hidden'), 'auto-assign modal')
  out.autoCount = document.querySelector('#auto-assign-count').textContent
  out.summaryShown = document.querySelector('#auto-assign-summary').textContent.length > 0
  document.querySelector('#confirm-auto-assign').click()
  await waitFor(() => window.__calls.rpc.some(r => r.name === 'apply_section_assignments'), 'apply rpc')
  out.rpc1 = window.__calls.rpc.filter(r => r.name === 'apply_section_assignments')[0].args.p_assignments
  document.querySelector('#auto-assign-sections').click()
  await waitFor(() => document.querySelector('#auto-assign-grades input'), 'auto-assign grade list')
  out.autoGradeBoxes = document.querySelectorAll('#auto-assign-grades input:checked').length
  out.autoExcludeChoices = document.querySelectorAll('#auto-assign-exclude-list input').length
  const gradeBox = [...document.querySelectorAll('#auto-assign-grades input')].find(box => box.value === '9')
  gradeBox.checked = false
  document.querySelector('#auto-assign-grades').dispatchEvent(new Event('change', { bubbles: true }))
  out.autoCountGradeTenOnly = document.querySelector('#auto-assign-count').textContent
  gradeBox.checked = true
  document.querySelector('#auto-assign-grades').dispatchEvent(new Event('change', { bubbles: true }))
  const excludeBox = [...document.querySelectorAll('#auto-assign-exclude-list input')].find(box => box.value === '12')
  excludeBox.checked = true
  document.querySelector('#auto-assign-exclude-list').dispatchEvent(new Event('change', { bubbles: true }))
  out.autoCountAfterExclude = document.querySelector('#auto-assign-count').textContent
  document.querySelector('#close-auto-assign-2').click()
  out.cancelClosed = document.querySelector('#auto-assign-modal').classList.contains('hidden')
  document.querySelector('#open-placement').click()
  await waitFor(() => document.querySelectorAll('#placement-students input').length > 0, 'placement list')
  const picked = () => [...document.querySelectorAll('#placement-students input')].map(i => i.value)
  document.querySelector('#placement-grade').value = '10'
  document.querySelector('#placement-grade').dispatchEvent(new Event('change'))
  out.grade10 = picked()
  document.querySelector('#placement-grade').value = '9'
  document.querySelector('#placement-grade').dispatchEvent(new Event('change'))
  document.querySelector('#placement-section').value = '2'
  document.querySelector('#placement-section').dispatchEvent(new Event('change'))
  out.grade9 = picked()
  out.selectedSection = document.querySelector('#placement-section').value
  console.log('Placement section before submit:', out.selectedSection)
  document.querySelector('#placement-students input').checked = true
  document.querySelector('#place-selected').click()
  await waitFor(() => window.__calls.rpc.length >= 2, 'place RPC')
  out.rpc2 = window.__calls.rpc[1].args.p_assignments
  document.querySelector('[data-tab="academic"]').click()
  await waitFor(() => document.querySelector('#academic-table tr'), 'academic rows')
  out.academicRows = document.querySelectorAll('#academic-table tr').length
  out.academicSearch = !!document.querySelector('#academic-search')
  out.academicForm = !!document.querySelector('#academic-form')
  document.querySelector('[data-view-academic]').click()
  await waitFor(() => !document.querySelector('#academic-history-modal').classList.contains('hidden'), 'academic history modal')
  out.academicModalOpen = !document.querySelector('#academic-history-modal').classList.contains('hidden')
  out.academicModalTitle = document.querySelector('#academic-history-title').textContent
  out.academicModalTables = document.querySelectorAll('#academic-history-body table').length
  out.errors = window.__errors
  document.querySelector('#result').textContent = JSON.stringify(out)
} catch (error) {
  document.querySelector('#result').textContent = JSON.stringify({ failure: error.message, errors: window.__errors })
}
`

try {
  const fixtureHtml = html
    .replace(/<script type="module">[\s\S]*?<\/script>/, '')
    .replace('</head>', `<script>window.__errors=[];window.addEventListener('error',e=>window.__errors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason?.stack||e.reason)));</script><style>[data-panel].hidden,[hidden]{display:none!important}</style></head>`)
    .replace('</body>', '<pre id="result"></pre><script type="module" src="./registrar.js"></script><script type="module" src="./driver.js"></script></body>')
  writeFileSync(join(folder, 'fixture.html'), fixtureHtml)
  writeFileSync(join(folder, 'registrar.js'), read('registrar.js'))
  writeFileSync(join(folder, 'sectioning.js'), read('sectioning.js'))
  writeFileSync(join(folder, 'grades.js'), read('grades.js'))
  writeFileSync(join(folder, 'attendance.js'), read('attendance.js'))
  writeFileSync(join(folder, 'report-card.js'), read('report-card.js'))
  writeFileSync(join(folder, 'semester-grades.js'), read('semester-grades.js'))
  writeFileSync(join(folder, 'transcript.js'), read('transcript.js'))
  writeFileSync(join(folder, 'print.js'), read('print.js'))
  writeFileSync(join(folder, 'auth-client.js'), stubAuth)
  writeFileSync(join(folder, 'ui-theme.js'), stubTheme)
  writeFileSync(join(folder, 'loading-screen.js'), stubLoading)
  writeFileSync(join(folder, 'driver.js'), driverSource)

  const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  const result = spawnSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', '--allow-file-access-from-files', `--user-data-dir=${join(folder, 'profile')}`, '--virtual-time-budget=9000', '--dump-dom', pathToFileURL(join(folder, 'fixture.html')).href], { encoding: 'utf8', timeout: 40000, maxBuffer: 6e6 })
  if (result.error) throw result.error
  const match = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  assert.ok(match?.[1], `Browser produced no result. stderr: ${String(result.stderr).slice(-600)} dom: ${String(result.stdout).slice(-600)}`)
  const data = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&#39;', "'"))
  console.log(data)
  assert.equal(data.failure, undefined)
  assert.deepEqual(data.errors, [])
  assert.equal(data.enrollmentRows, 3, 'all directory students should list in Manage Enrollment')
  assert.equal(data.autoCount, '2', 'auto-assign should plan the 2 section-less students')
  assert.ok(data.summaryShown)
  assert.ok(data.rpc1.length >= 2, 'both section-less students should be assigned')
assert.equal(data.autoGradeBoxes, 2, 'every grade level with a section must be offered')
assert.equal(data.autoExcludeChoices, 3, 'students in the chosen grades must be excludable')
assert.equal(data.autoCountGradeTenOnly, '0', 'unchecking a grade level must shrink the preview')
assert.equal(data.autoCountAfterExclude, '1', 'excluding a student must remove them from the preview')
assert.equal(data.cancelClosed, true, 'auto-assign Cancel must close the modal')
  assert.deepEqual(data.grade10, [], 'students already in the selected section must be excluded')
  assert.deepEqual(data.grade9, ['12', '21'])
  assert.deepEqual(data.rpc2, [{ student_id: 12, section_id: 2 }])
assert.equal(data.academicRows, 3, 'every grade 1-12 student must list in Academic History')
assert.equal(data.academicSearch, true, 'the student list must be searchable')
assert.equal(data.academicForm, false, 'the registrar must not get a grade entry form')
assert.equal(data.academicModalOpen, true, 'View History must open the record')
assert.ok(data.academicModalTitle.includes('Amistoso'), 'the modal must name the student')
assert.equal(data.academicModalTables, 1, 'the modal must show the academic history table')
  console.log('registrar flow checks passed')
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
