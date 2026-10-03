import { supabase } from './auth-client.js'
import { toast } from './ui-theme.js'
import { $, state } from './registrar-state.js'
import { escapeHtml, gradeLabel, gradeLevelOptions, errorRow } from './html.js'
import { describeError } from './errors.js'
import { confirmDialog } from './dialog.js'
import { withBusy } from './shell.js'
import { currentSchoolYear } from './grades.js'
import { buildReportCard } from './report-card.js'
import { buildSemesterTable } from './semester-grades.js'
import { buildTranscript } from './transcript.js'
import { previewPdf, pdfName } from './pdf-preview.js'

$('academic-grade-filter').innerHTML = gradeLevelOptions({ includeAll: true, allLabel: 'All grades (1-12)', includeKindergarten: false })

// The rows are ... Latest School Year | Section | buttons, so Section goes before the page's own "Action" header.
document.querySelector('#academic-table')?.closest('table')?.querySelector('thead tr')?.lastElementChild?.insertAdjacentHTML('beforebegin', '<th>Section</th>')

function academicRowsFor(studentId) {
  return state.academic
    .filter(record => `${record.student_id}` === `${studentId}`)
    .sort((a,b)=>(a.school_year||'').localeCompare(b.school_year||'') || (a.subject||'').localeCompare(b.subject||''))
}
const academicTableHtml = (rows) => buildSemesterTable(rows, { flat: true })
// The panel lists students, not raw records: the counts and the latest school year come
// from the records already loaded, so no per-student query is needed.
export function renderAcademicStudents() {
  const search = $('academic-search').value.trim().toLowerCase()
  const grade = Number($('academic-grade-filter').value) || 0
  const summaries = new Map()
  state.academic.forEach(record => {
    const key = `${record.student_id}`
    const summary = summaries.get(key) || { count: 0, latest: '' }
    summary.count += 1
    const year = `${record.school_year || ''}`
    if (summary.latest.localeCompare(year) < 0) summary.latest = year
    summaries.set(key, summary)
  })
  const students = state.students.filter(student => {
    const level = Number(student.grade_level)
    if (level < 1 || level >= 13) return false
    if (grade && level !== grade) return false
    return !search || `${student.lrn_number||''} ${student.student_id} ${student.first_name||''} ${student.last_name||''}`.toLowerCase().includes(search)
  })
  $('academic-table').innerHTML = students.map(student => {
    const summary = summaries.get(`${student.student_id}`) || { count: 0, latest: '' }
    return `<tr><td>${escapeHtml(student.lrn_number || student.student_id)}</td><td>${escapeHtml(`${student.first_name||''} ${student.last_name||''}`)}</td><td>${escapeHtml(gradeLabel(student.grade_level))}</td><td>${summary.count}</td><td>${escapeHtml(summary.latest || '-')}</td><td>${escapeHtml(state.studentSections.get(String(student.student_id)) || 'No Section')}</td><td><button class="admin-view" data-view-academic="${student.student_id}">View History</button> <button class="admin-view" data-print-academic="${student.student_id}">Record Card</button> <button class="admin-view" data-transcript-academic="${student.student_id}">Transcript</button></td></tr>`
  }).join('') || '<tr><td colspan="7" class="empty-state">No students found.</td></tr>'
  // Each button disables itself with a spinner until its window opens, so a slow network can't be spam-clicked.
  document.querySelectorAll('[data-view-academic]').forEach(button => { button.onclick = () => withBusy(button, 'Opening…', () => openAcademicHistory(button.dataset.viewAcademic)) })
  document.querySelectorAll('[data-transcript-academic]').forEach(button => { button.onclick = () => withBusy(button, 'Preparing…', () => generateTranscript(button.dataset.transcriptAcademic)) })
  document.querySelectorAll('[data-print-academic]').forEach(button => { button.onclick = () => withBusy(button, 'Preparing…', () => printAcademicCard(button.dataset.printAcademic)) })
}
let academicLoadSequence = 0
export async function loadAcademic() {
  const sequence = ++academicLoadSequence
  const data = []
  state.academic = []
  $('academic-table').innerHTML = '<tr><td colspan="7">Loading academic history…</td></tr>'
  // Fetch every school year with stable pages, not a school-wide 1000-row cap.
  for (let start = 0; ; start += 500) {
    const { data: page, error } = await supabase.from('academic_history').select('*').order('school_year').order('subject').order('id').range(start, start + 499)
    if (sequence !== academicLoadSequence) return
    if (error) {
      $('academic-table').innerHTML = errorRow(7, error, 'Load academic history')
      return
    }
    data.push(...(page || []))
    if (!page || page.length < 500) break
  }
  state.academic = data
  renderAcademicStudents()
}
$('academic-search').oninput = renderAcademicStudents
$('academic-grade-filter').addEventListener('change', renderAcademicStudents)
$('refresh-academic').onclick = event => withBusy(event.currentTarget, 'Refreshing…', loadAcademic)

async function openAcademicHistory(studentId) {
  const student = state.students.find(item => `${item.student_id}` === `${studentId}`) || {}
  const rows = academicRowsFor(studentId)
  state.academicStudentId = studentId
  $('academic-history-title').textContent = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'View History'
  const years = [...new Set(rows.map(row => row.school_year).filter(Boolean))].sort().reverse()
  const lockedYears = years.filter(year => rows.some(row => row.school_year === year && row.locked))
  const { data: enrollment } = await supabase.from('enrollments').select('school_year,sections(section_name)').eq('student_id', studentId).eq('status', 'active').maybeSingle()
  const photo = student.profile_picture_url
    ? `<img class="academic-profile-photo" src="${escapeHtml(student.profile_picture_url)}" alt="Profile picture of ${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`.trim())}">`
    : '<div class="academic-profile-photo photo-preview-empty" aria-hidden="true">No photo</div>'
  $('academic-history-body').innerHTML = `<div class="academic-profile-summary">${photo}<div class="review-grid"><div><small>Student No.</small><p>${escapeHtml(student.lrn_number || student.student_id || '')}</p></div><div><small>Grade Level</small><p>${escapeHtml(student.grade_level == null ? '-' : gradeLabel(student.grade_level))}</p></div><div><small>Section</small><p>${escapeHtml(enrollment?.sections?.section_name || 'No Section')}</p></div><div><small>School Year</small><p>${escapeHtml(enrollment?.school_year || '-')}</p></div><div><small>Academic Records</small><p>${rows.length}</p></div></div></div><label>School Year<select id="academic-term-filter"><option value="">All school years</option>${years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join('')}</select></label><div id="academic-history-table" class="academic-scroll">${buildSemesterTable(rows)}</div>${lockedYears.map(year => `<p class="note">&#128274; ${escapeHtml(year)} grades are locked by faculty. <button type="button" class="admin-view" data-unlock-year="${escapeHtml(year)}">Unlock</button></p>`).join('')}`
  document.querySelectorAll('[data-unlock-year]').forEach(button => button.onclick = async () => {
    const who = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'this student'
    if (!await confirmDialog(`Unlock ${button.dataset.unlockYear} grades for ${who}? Faculty will be able to change them again until they re-submit.`, { title: 'Unlock submitted grades', confirmText: 'Unlock grades', danger: true, warning: 'Final grades that were already shared (report cards, transcripts) may no longer match if they are edited.' })) return
    await withBusy(button, 'Unlocking…', async () => {
      const { error } = await supabase.rpc('set_academic_lock', { p_student_id: Number(studentId), p_school_year: button.dataset.unlockYear, p_locked: false })
      if (error) return toast(describeError(error, 'Unlock grades'), 'error')
      toast(`${button.dataset.unlockYear} grades unlocked.`)
      await loadAcademic()
      await openAcademicHistory(studentId)
    })
  })
  $('academic-term-filter').onchange = event => {
    const selected = event.target.value
    $('academic-history-table').innerHTML = buildSemesterTable(selected ? rows.filter(row => row.school_year === selected) : rows)
  }
  $('academic-history-modal').classList.remove('hidden')
}
$('close-academic-history').onclick = () => $('academic-history-modal').classList.add('hidden')
// Inside the history window the card follows the School Year filter, so past years can be printed too.
$('print-academic-card').onclick = event => withBusy(event.currentTarget, 'Preparing…', () => printAcademicCard(state.academicStudentId, $('academic-term-filter')?.value))
// The card prints from the page itself instead of a pop-up: the theme hides every other
// body child while body carries the printing-card class.
async function printAcademicCard(studentId, year = '') {
  const student = state.students.find(item => `${item.student_id}` === `${studentId}`)
  if (!student) return toast('Open a student record first.', 'error')
  const rows = academicRowsFor(studentId)
  if (!rows.length) return toast('No academic records to print for this student.', 'error')
  const schoolYear = year || rows[rows.length - 1].school_year
  const yearRows = rows.filter(row => row.school_year === schoolYear)
  const [enrollment, totals] = await Promise.all([
    supabase.from('enrollments').select('grade_level,sections(section_name)').eq('student_id', studentId).eq('school_year', schoolYear).maybeSingle(),
    supabase.rpc('attendance_totals', { p_student_id: studentId, p_school_year: schoolYear })
  ])
  if (totals.error) toast(describeError(totals.error, 'Load attendance'), 'error')

  // A past year's card shows the grade and section the student had that year, not today's.
  const isCurrentYear = schoolYear === currentSchoolYear()
  $('academic-print-card').innerHTML = buildReportCard({
    student,
    gradeLevel: gradeLabel(enrollment.data?.grade_level ?? student.grade_level),
    schoolYear,
    sectionName: enrollment.data?.sections?.section_name || (isCurrentYear ? state.studentSections.get(String(studentId)) : '') || '',
    academicRows: yearRows,
    attendance: totals.data,
    remarks: yearRows.map(row => row.remarks).filter(Boolean).join('; ')
  })

  previewPdf($('academic-print-card'), { title: `Report Card ${schoolYear}`, filename: pdfName(`Report Card ${schoolYear}`, student), printClass: 'printing-card' })
}
async function generateTranscript(studentId) {
  // Fresh reads (not the page cache): an official transcript must reflect grades changed since the page loaded.
  const [{ data: s, error: se }, { data: g, error: ge }, enrollment] = await Promise.all([
    supabase.from('students').select('*').eq('student_id', studentId).single(),
    supabase.from('academic_history').select('*').eq('student_id', studentId).order('school_year'),
    supabase.from('enrollments').select('sections(section_name)').eq('student_id', studentId).eq('status', 'active').maybeSingle()
  ])
  if (se) return toast(describeError(se, 'Load student'), 'error')
  if (ge) return toast(describeError(ge, 'Load grades'), 'error')
  $('transcript-print-card').innerHTML = buildTranscript({
    student: s,
    rows: g || [],
    mode: 'official',
    sectionName: enrollment.data?.sections?.section_name || ''
  })
  previewPdf($('transcript-print-card'), { title: 'Official Transcript', filename: pdfName('Transcript', s), printClass: 'printing-transcript' })
}