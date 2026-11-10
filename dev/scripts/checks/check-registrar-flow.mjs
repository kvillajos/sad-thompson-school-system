// Full registrar workflow smoke test: runs the REAL registrar.js in headless Chrome/Edge with
// only the Supabase client stubbed. Verifies the auto-assign flow (plan -> confirm ->
// RPC payload) and the Grade -> Section -> student filtering, without touching live data.
import { globSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { browserPath } from './browser-path.mjs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '../../..')
const read = name => readFileSync(join(root, name), 'utf8')
const html = read('role-registrar/student-records.html')
const folder = mkdtempSync(join(tmpdir(), 'registrar-flow-'))
const testCurrentStartYear = new Date().getMonth() + 1 >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
const testCurrentSchoolYear = `${testCurrentStartYear}-${testCurrentStartYear + 1}`

const stubAuth = `const STUDENTS = [
  { student_id: 11, lrn_number: 'TCS-1', first_name: 'Amistoso', last_name: 'Amistoso', grade_level: 10, gender: 'Male', enrollment_status: 'Enrolled' },
  { student_id: 12, lrn_number: 'TCS-2', first_name: 'Bautista', last_name: 'Bautista', grade_level: 9, gender: 'Female', enrollment_status: 'Enrolled' },
  { student_id: 21, lrn_number: 'TCS-3', first_name: 'Cortez', last_name: 'Cortez', grade_level: 9, gender: 'Male', enrollment_status: 'Enrolled' }
]
const ENROLLMENTS = [
  { id: 5, student_id: 11, school_year: '${testCurrentSchoolYear}', enrolled_at: '2025-06-01', status: 'active', section_id: 3, sections: { section_name: 'St. Mark', academic_year: '${testCurrentSchoolYear}' } }
]
const SECTIONS = [
  { section_id: 1, section_name: 'St. Lucy', grade_level: 9, capacity: 2 },
  { section_id: 2, section_name: 'St. Monica', grade_level: 9, capacity: 2 },
  { section_id: 3, section_name: 'St. Mark', grade_level: 10, capacity: 2 }
]
const DATA = {
  students: STUDENTS,
  enrollments: ENROLLMENTS,
  sections: SECTIONS,
  student_school_years: [
    { student_id: 11, school_year: '${testCurrentSchoolYear}', grade_level: 10, section_id: 3 },
    { student_id: 12, school_year: '${testCurrentStartYear - 1}-${testCurrentStartYear}', grade_level: 8, section_id: null },
    { student_id: 21, school_year: '${testCurrentStartYear - 3}-${testCurrentStartYear - 2}', grade_level: 7, section_id: null },
    { student_id: 21, school_year: '${testCurrentStartYear - 2}-${testCurrentStartYear - 1}', grade_level: 8, section_id: null }
  ],
  admission_applications: [],
  academic_history: [
    { id: 1, student_id: 11, school_year: '${testCurrentSchoolYear}', subject: 'Mathematics', grade: 80 },
    { id: 2, student_id: 11, school_year: '${testCurrentSchoolYear}', subject: 'English', grade: 70 },
    { id: 3, student_id: 11, school_year: '${testCurrentSchoolYear}', subject: 'Science', grade: null },
    { id: 4, student_id: 13, school_year: '${testCurrentSchoolYear}', subject: 'Mathematics', grade: 88 },
    { id: 5, student_id: 13, school_year: '${testCurrentSchoolYear}', subject: 'English', grade: 78 },
    { id: 6, student_id: 13, school_year: '${testCurrentSchoolYear}', subject: 'Science', grade: 95 }
  ],
  promotion_logs: [
    { id: 1, student_id: 11, from_grade: 9, to_grade: 10, school_year: '${testCurrentStartYear - 1}-${testCurrentStartYear}', result: 'retained', reason: 'Prior subject requirements incomplete', created_at: '2025-05-01' }
  ],
  subject_schedules: [
    { schedule_id: 1, section_id: 3, subject_id: 1, subjects: { subject_name: 'Mathematics', is_active: true } },
    { schedule_id: 2, section_id: 3, subject_id: 2, subjects: { subject_name: 'English', is_active: true } },
    { schedule_id: 3, section_id: 3, subject_id: 3, subjects: { subject_name: 'Science', is_active: true } }
  ],
  drafts: []
}
window.__registrarTestData = DATA
function query(table) {
  const filters = []
  const orders = []
  let page = null
  let rowLimit = null
  let single = false
  const proxy = new Proxy({}, { get(_t, prop) {
    if (prop === 'then') return (onFulfilled, onRejected) => {
      let data = (DATA[table] || []).filter(row =>
        filters.every(([column, value]) => {
          const actual = column.split('.').reduce((item, key) => item?.[key], row)
          return String(actual) === String(value)
        })
      )
      for (const [column, ascending] of [...orders].reverse()) data = data.slice().sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (ascending ? 1 : -1))
      if (page) data = data.slice(page[0], page[1] + 1)
      if (rowLimit != null) data = data.slice(0, rowLimit)
      const result = { data: single ? data[0] || null : data, error: null }
      return Promise.resolve(result).then(onFulfilled, onRejected)
    }
    if (prop === 'eq') return (column, value) => { filters.push([column, value]); return proxy }
    if (prop === 'order') return (column, options = {}) => { orders.push([column, options.ascending !== false]); return proxy }
    if (prop === 'limit') return count => { rowLimit = count; return proxy }
    if (prop === 'single' || prop === 'maybeSingle') return () => { single = true; return proxy }
    if (prop === 'range') return (from, to) => { window.__calls.range.push(table); page = [from, to]; return proxy }
    if (prop === 'upsert') return (payload, options) => {
      window.__calls.upsert.push({ table, payload, options })
      return Promise.resolve({ error: null })
    }
    return () => proxy
  } })
  return proxy
}
window.__calls = { rpc: [], upsert: [], from: [], range: [] }
export const supabase = {
  rpc(name, args) { window.__calls.rpc.push({ name, args }); const data = name === 'apply_section_assignments' ? { placed: (args.p_assignments || []).length } : null; return Promise.resolve({ data, error: null }) },
  from(table) { window.__calls.from.push(table); return query(table) }
}
export async function requireRole() { return { username: 'registrar', role_id: 2 } }
export async function signOut() {}
`
const stubTheme = `export const applyUiTheme = () => {}
export const installTableSort = () => {}
export const toast = () => {}
`
const stubShell = `export const mountProfile = () => {}
export function mountSidebar(items) {
  const nav = document.createElement('nav')
  nav.innerHTML = items.flatMap(i => i.items || [i]).map(i => '<button data-tab="' + i.tab + '">' + i.label + '</button>').join('')
  document.body.prepend(nav)
}
export const withBusy = async (button, label, action) => action()
export const confirmPassword = async () => true
`
const stubLoading = 'export const hideLoadingScreen = () => {}\n'

// In-browser driver: waits for the app to boot, then drives the auto-assign flow
// (plan -> confirm -> RPC payload) and the Grade -> Section -> students filtering.
const driverSource = `import { state } from './role-registrar/registrar-state.js'
import { loadPromotionCandidates } from './role-registrar/registrar-promotion.js'
const wait = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, label, tries = 50) { for (let i = 0; i < tries; i += 1) { try { const v = fn(); if (v) return v } catch {} await wait(100) } throw new Error('timeout: ' + label) }
const out = {}
try {
  await waitFor(() => document.querySelector('#enrollment-table tr'), 'enrollment rows')
  await waitFor(() => document.querySelector('#student-directory-table tr'), 'active directory rows')
  out.activeDirectoryTabVisible = !!document.querySelector('[data-tab="directory"]')
  out.initialAcademicHistoryFetches = window.__calls.from.filter(table => table === 'academic_history').length
  out.initialAcademicHistoryPages = window.__calls.range.filter(table => table === 'academic_history').length
  out.initialAcademicHistoryDomRows = document.querySelectorAll('#academic-table tr').length
  out.initialSchoolYearRecordFetches = window.__calls.from.filter(table => table === 'student_school_years').length
  document.querySelector('[data-tab="directory"]').click()
  out.activeDirectoryPanelVisible = !document.querySelector('#directory').classList.contains('hidden')
  document.querySelector('#student-directory-table tr').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  out.directoryDoubleClickOpensQuickviewImmediately = !document.querySelector('#student-quickview-modal').classList.contains('hidden')
  await waitFor(() => document.querySelector('#quickview-gpa').textContent === '75.00', 'quick-view GPA')
  out.quickviewEnrollmentStatus = document.querySelector('#quickview-status').textContent.trim()
  out.quickviewGpa = document.querySelector('#quickview-gpa').textContent.trim()
  out.quickviewFlagHistory = document.querySelector('#quickview-flags').textContent.trim()
  document.querySelector('#close-student-quickview').click()
const promotionGrade = document.querySelector('#promotion-grade')
document.querySelector('[data-tab="promotion"]').click()
promotionGrade.value = 'Grade 10'
promotionGrade.dispatchEvent(new Event('change', { bubbles: true }))
const promotionYear = document.querySelector('#promotion-year')
promotionYear.value = '${testCurrentStartYear + 1}-${testCurrentStartYear + 2}'
promotionYear.dispatchEvent(new Event('input', { bubbles: true }))
await waitFor(
  () => document.querySelector('#promotion-exclude-list').textContent.includes('Unattempted:Science'),
  'promotion subject breakdown'
)
out.promotionStatus = document.querySelector('#promotion-exclude-list .promotion-status').textContent.trim()
out.promotionBreakdown = document.querySelector('#promotion-exclude-list').textContent.trim()
document.querySelector('#promotion-exclude-list .promotion-candidate').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
out.promotionDoubleClickOpensQuickview = !document.querySelector('#student-quickview-modal').classList.contains('hidden')
out.promotionTabRemainsActive = !document.querySelector('#promotion').classList.contains('hidden')
document.querySelector('#close-student-quickview').click()
const passingStudent = { student_id: 13, lrn_number: 'TCS-4', first_name: 'Dela Cruz', last_name: 'Dela Cruz', grade_level: 10 }
state.students.push(passingStudent)
window.__registrarTestData.enrollments.push({
  id: 6,
  student_id: 13,
  school_year: '${testCurrentSchoolYear}',
  status: 'active',
  section_id: 3,
  sections: { academic_year: '${testCurrentSchoolYear}' }
})
await loadPromotionCandidates()
const passingStatus = document.querySelector('#promotion-exclude-list input[value="13"]')
  .closest('.promotion-candidate')
  .querySelector('.promotion-status')
out.promotionPassingStatus = passingStatus.textContent.trim()
state.students.splice(state.students.indexOf(passingStudent), 1)
window.__registrarTestData.enrollments.pop()
await loadPromotionCandidates()
  out.enrollmentRows = document.querySelectorAll('#enrollment-table tr').length
  out.defaultDirectoryIds = [...document.querySelectorAll('#student-directory-table tr')].map(row => row.cells[0]?.textContent.trim())
  document.querySelector('[data-student-view="not-reenrolled"]').click()
  await waitFor(
    () => document.querySelectorAll('#student-directory-table [data-reenroll-student]').length === 2,
    'historical directory rows'
  )
  out.schoolYearRecordFetchesAfterHistoryView = window.__calls.from.filter(table => table === 'student_school_years').length
  out.notReenrolledRows = [...document.querySelectorAll('#student-directory-table tr')].map(row => ({
    id: row.cells[0]?.textContent.trim(),
    grade: row.cells[4]?.textContent.trim(),
    lastYear: row.cells[5]?.textContent.trim(),
    action: row.cells[8]?.textContent.replace(/\\s+/g, ' ').trim()
  }))
  document.querySelector('[data-reenroll-student="21"]').click()
  await waitFor(() => window.__calls.upsert.length > 0, 're-enrollment upsert')
  out.reEnrollUpsert = window.__calls.upsert[0]
  document.querySelector('[data-student-view="all"]').click()
  const directorySearch = document.querySelector('#student-directory-search')
  directorySearch.value = 'Bautista'
  directorySearch.dispatchEvent(new Event('input', { bubbles: true }))
  out.directoryRows = document.querySelectorAll('#student-directory-table tr').length
  URL.createObjectURL = blob => { window.__csvBlob = blob; return 'blob:csv-test' }
  URL.revokeObjectURL = () => {}
  HTMLAnchorElement.prototype.click = function () { window.__downloadName = this.download }
  document.querySelector('#export-student-directory').click()
  out.directoryCsv = (await window.__csvBlob.text()).replace(/^\uFEFF/, '')
  out.exportFilename = window.__downloadName
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
  excludeBox.dispatchEvent(new Event('change', { bubbles: true }))
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
  await waitFor(
    () => window.__calls.rpc.filter(call => call.name === 'apply_section_assignments').length >= 2,
    'place RPC'
  )
  out.rpc2 = window.__calls.rpc.filter(call => call.name === 'apply_section_assignments')[1].args.p_assignments
  const academicPagesBeforeTab = window.__calls.range.filter(table => table === 'academic_history').length
  document.querySelector('[data-tab="academic"]').click()
  await waitFor(() => document.querySelector('#academic-table tr'), 'academic rows')
  out.academicRows = document.querySelectorAll('#academic-table tr').length
  out.academicHistoryPages = window.__calls.range.filter(table => table === 'academic_history').length - academicPagesBeforeTab
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
  document.querySelector('#result').textContent = JSON.stringify({
    failure: error.message,
    errors: window.__errors,
    promotionGrade: document.querySelector('#promotion-grade')?.value,
    promotionYear: document.querySelector('#promotion-year')?.value,
    promotionCandidates: document.querySelector('#promotion-exclude-list')?.innerText
  })
}
`

try {
  const fixtureHtml = html
    .replace(/<script type="module">[\s\S]*?<\/script>/, '')
    .replace(
      '</head>',
      `<script>window.__errors=[];window.addEventListener('error',e=>window.__errors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason?.stack||e.reason)));</script><style>[data-panel].hidden,[hidden]{display:none!important}</style></head>`
    )
    .replace(
      '</body>',
      '<pre id="result"></pre><script type="module" src="./role-registrar/registrar.js"></script><script type="module" src="./driver.js"></script></body>'
    )
  writeFileSync(join(folder, 'fixture.html'), fixtureHtml)
  // mirror the repo layout so the modules' relative imports resolve unchanged
  const put = (path, content) => {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), content)
  }
  // Every registrar and shared module (new ones included); the stubs below then replace auth, theme, shell, loader.
  for (const name of globSync('{role-registrar,shared/lib,shared/ui,shared/documents}/*.js', { cwd: root })) put(name, read(name))
  put('shared/lib/auth-client.js', stubAuth)
  put('shared/ui/ui-theme.js', stubTheme)
  put('shared/ui/shell.js', stubShell)
  put('shared/ui/loading-screen.js', stubLoading)
  writeFileSync(join(folder, 'driver.js'), driverSource)

  const edge = browserPath()
  const result = spawnSync(
    edge,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      '--allow-file-access-from-files',
      `--user-data-dir=${join(folder, 'profile')}`,
      '--virtual-time-budget=9000',
      '--dump-dom',
      pathToFileURL(join(folder, 'fixture.html')).href
    ],
    { encoding: 'utf8', timeout: 40000, maxBuffer: 6e6 }
  )
  if (result.error) throw result.error
  const match = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  assert.ok(
    match?.[1],
    `Browser produced no result. stderr: ${String(result.stderr).slice(-600)} dom: ${String(result.stdout).slice(-600)}`
  )
  const data = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&#39;', "'"))
  console.log(data)
  assert.equal(data.failure, undefined)
  assert.deepEqual(data.errors, [])
  assert.equal(data.activeDirectoryTabVisible, true)
  assert.equal(data.activeDirectoryPanelVisible, true)
  assert.equal(data.initialAcademicHistoryFetches, 0, 'academic history should not load during startup')
  assert.equal(data.initialAcademicHistoryPages, 0, 'school-wide academic history pages should be deferred')
  assert.equal(data.initialAcademicHistoryDomRows, 0, 'academic history students should not be rendered at startup')
  assert.equal(data.initialSchoolYearRecordFetches, 1, 'startup should fetch only current-year directory records')
  assert.equal(data.schoolYearRecordFetchesAfterHistoryView, 2, 'historical enrollment years should load only when requested')
  assert.equal(data.directoryDoubleClickOpensQuickviewImmediately, true, 'double-click should open the quick-view immediately')
  assert.equal(data.quickviewEnrollmentStatus, 'active')
  assert.equal(data.quickviewGpa, '75.00', 'GPA should use the current enrollment year')
  assert.match(data.quickviewFlagHistory, /retained/)
  assert.match(data.quickviewFlagHistory, /Prior subject requirements incomplete/)
  assert.equal(data.promotionDoubleClickOpensQuickview, true, 'promotion candidates should open the quick-view on double-click')
  assert.equal(data.promotionTabRemainsActive, true, 'the quick-view must not navigate away from Promotion')
  assert.equal(data.promotionStatus, 'No')
  assert.match(data.promotionBreakdown, /Failed:English/)
  assert.match(data.promotionBreakdown, /Unattempted:Science/)
  assert.equal(data.promotionPassingStatus, 'Yes')
  assert.equal(data.enrollmentRows, 3, 'all directory students should list in Manage Enrollment')
  assert.deepEqual(data.defaultDirectoryIds, ['TCS-1'], 'Current SY is the default directory view')
  assert.equal(data.notReenrolledRows.length, 2, 'include previous-year students and students who skipped a year')
  assert.deepEqual(
    data.notReenrolledRows[1],
    {
      id: 'TCS-3',
      grade: 'Grade 8',
      lastYear: `${testCurrentStartYear - 2}-${testCurrentStartYear - 1}`,
      action: `View Enroll for ${testCurrentSchoolYear}`
    },
    'use the latest recorded school year for a returning student who skipped a year'
  )
  assert.deepEqual(
    data.reEnrollUpsert,
    {
      table: 'student_school_years',
      payload: {
        student_id: '21',
        school_year: testCurrentSchoolYear,
        grade_level: 8,
        section_id: null
      },
      options: { onConflict: 'student_id,school_year' }
    },
    're-enrollment creates the current-year row using the latest enrolled grade'
  )
  assert.equal(data.directoryRows, 1, 'directory CSV uses the currently filtered row')
  assert.match(data.directoryCsv, /"Student ID","Name","Birth Date","Gender","Grade","Last Enrolled Year","Section","Enrollment Status"/)
  assert.match(data.directoryCsv, /"TCS-2","Bautista Bautista"/)
  assert.doesNotMatch(data.directoryCsv, /Actions|View|Amistoso|Cortez/)
  assert.match(data.exportFilename, /^student-directory-\d{4}-\d{2}-\d{2}\.csv$/)
  assert.equal(data.autoCount, '2', 'auto-assign should plan the 2 section-less students')
  assert.ok(data.summaryShown)
  assert.ok(data.rpc1.length >= 2, 'both section-less students should be assigned')
  assert.equal(data.autoGradeBoxes, 2, 'every grade level with a section must be offered')
  assert.equal(data.autoExcludeChoices, 2, 'only the section-less students auto-assign would place are listed to exclude')
  assert.equal(data.autoCountGradeTenOnly, '0', 'unchecking a grade level must shrink the preview')
  assert.equal(data.autoCountAfterExclude, '1', 'excluding a student must remove them from the preview')
  assert.equal(data.cancelClosed, true, 'auto-assign Cancel must close the modal')
  assert.deepEqual(data.grade10, [], 'students already in the selected section must be excluded')
  assert.deepEqual(data.grade9, ['12', '21'])
  assert.deepEqual(data.rpc2, [{ student_id: 12, section_id: 2 }])
  assert.equal(data.academicRows, 3, 'every grade 1-12 student must list in Academic History')
  assert.equal(data.academicHistoryPages, 1, 'the academic history list should load when its tab is opened')
  assert.equal(data.academicSearch, true, 'the student list must be searchable')
  assert.equal(data.academicForm, false, 'the registrar must not get a grade entry form')
  assert.equal(data.academicModalOpen, true, 'View History must open the record')
  assert.ok(data.academicModalTitle.includes('Amistoso'), 'the modal must name the student')
  assert.equal(data.academicModalTables, 1, 'the modal must show the academic history table')
  console.log('registrar flow checks passed')
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
