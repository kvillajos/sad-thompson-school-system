import { supabase } from './auth-client.js'
import { toast } from './ui-theme.js'
import { $, state } from './registrar-state.js'
import { escapeHtml, gradeLabel, gradeLevelOptions } from './html.js'
import { buildReportCard } from './report-card.js'
import { buildSemesterTable } from './semester-grades.js'
import { buildTranscript } from './transcript.js'
import { previewPdf, pdfName } from './pdf-preview.js'

$('academic-grade-filter').innerHTML = gradeLevelOptions({ includeAll: true, allLabel: 'All grades (1-12)', includeKindergarten: false })

document.querySelector('#academic-table')?.closest('table')?.querySelector('thead tr')?.insertAdjacentHTML('beforeend', '<th>Section</th>')

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
  document.querySelectorAll('[data-view-academic]').forEach(button => { button.onclick = () => openAcademicHistory(button.dataset.viewAcademic) })
  document.querySelectorAll('[data-transcript-academic]').forEach(button => { button.onclick = () => generateTranscript(button.dataset.transcriptAcademic) })
  document.querySelectorAll('[data-print-academic]').forEach(button => { button.onclick = () => printAcademicCard(button.dataset.printAcademic) })
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
      $('academic-table').innerHTML = '<tr><td colspan="7">History could not be loaded.</td></tr>'
      return toast(error.message, 'error')
    }
    data.push(...(page || []))
    if (!page || page.length < 500) break
  }
  state.academic = data
  renderAcademicStudents()
}
$('academic-search').oninput = renderAcademicStudents
$('academic-grade-filter').addEventListener('change', renderAcademicStudents)
$('refresh-academic').onclick = loadAcademic

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
    if (!window.confirm(`Unlock ${button.dataset.unlockYear} grades so faculty can edit them again?`)) return
    const { error } = await supabase.rpc('set_academic_lock', { p_student_id: Number(studentId), p_school_year: button.dataset.unlockYear, p_locked: false })
    if (error) return toast(error.message, 'error')
    toast('Grades unlocked.')
    await loadAcademic()
    openAcademicHistory(studentId)
  })
  $('academic-term-filter').onchange = event => {
    const selected = event.target.value
    $('academic-history-table').innerHTML = buildSemesterTable(selected ? rows.filter(row => row.school_year === selected) : rows)
  }
  $('academic-history-modal').classList.remove('hidden')
}
$('close-academic-history').onclick = () => $('academic-history-modal').classList.add('hidden')
$('print-academic-card').onclick = () => printAcademicCard(state.academicStudentId)
// Report card = grades + attendance + remarks + general average, printed the same way
// (see printAcademicCard()): the theme hides every other body child while the body
// carries the printing-report-card class.
async function printReportCard(studentId) {
  const student = state.students.find(item => `${item.student_id}` === `${studentId}`)
  if (!student) return toast('Open a student record first.', 'error')
  const rows = academicRowsFor(studentId)
  if (!rows.length) return toast('No academic records to print for this student.', 'error')
  const schoolYear = rows[rows.length - 1].school_year
  const yearRows = rows.filter(row => row.school_year === schoolYear)
  const enrollment = await supabase.from('enrollments').select('sections(section_name)').eq('student_id', studentId).eq('school_year', schoolYear).maybeSingle()
  const totals = await supabase.rpc('attendance_totals', { p_student_id: studentId, p_school_year: schoolYear })
  $('report-print-card').innerHTML = buildReportCard({
    student, gradeLevel: gradeLabel(student.grade_level), schoolYear, sectionName: enrollment.data?.sections?.section_name,
    academicRows: yearRows, attendance: totals.data, remarks: yearRows.map(row => row.remarks).filter(Boolean).join('; ')
  })
  previewPdf($('report-print-card'), { title: 'Report Card', filename: pdfName('Report Card', student), printClass: 'printing-report-card' })
}
$('print-report-card').onclick = () => printReportCard(state.academicStudentId)
// The card prints from the page itself instead of a pop-up: the theme hides every other
// body child while body carries the printing-card class.
function printAcademicCard(studentId) {
  const student = state.students.find(item => `${item.student_id}` === `${studentId}`)
  if (!student) return toast('Open a student record first.', 'error')
  const rows = academicRowsFor(studentId)
  if (!rows.length) return toast('No academic records to print for this student.', 'error')
  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim()
  $('academic-print-card').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--ui-navy);padding-bottom:8px"><div><b>THOMPSON CHRISTIAN SCHOOL</b><div style="font-size:10px;letter-spacing:.18em;color:var(--ui-muted)">STUDENT ACADEMIC RECORD CARD</div></div><img src="/assets/logo.png" alt="" style="width:54px;height:54px;object-fit:contain"></div><div style="text-align:center;font-weight:700;letter-spacing:.14em;color:var(--ui-blue);margin:10px 0 8px">ACADEMIC RECORD — ${escapeHtml(gradeLabel(student.grade_level))}</div><div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;font-size:12px;margin-bottom:10px"><div><small>Student</small><p>${escapeHtml(name)}</p></div><div><small>Student No.</small><p>${escapeHtml(student.lrn_number || student.student_id || '')}</p></div><div><small>Records</small><p>${rows.length}</p></div></div>${academicTableHtml(rows)}<div style="display:flex;justify-content:space-between;gap:24px;margin-top:28px;font-size:11px"><div style="flex:1;border-top:1px solid #111;padding-top:4px;text-align:center">Registrar</div><div style="flex:1;border-top:1px solid #111;padding-top:4px;text-align:center">School Seal / Signature</div></div>`
  previewPdf($('academic-print-card'), { title: 'Academic Record Card', filename: pdfName('Academic Record', student), printClass: 'printing-card' })
}


async function generateTranscript(studentId){const {data:s,error:se}=await supabase.from('students').select('*').eq('student_id',studentId).single();if(se)return toast(se.message,'error');const {data:g,error:ge}=await supabase.from('academic_history').select('*').eq('student_id',studentId).order('school_year');if(ge)return toast(ge.message,'error');const enrollment=await supabase.from('enrollments').select('sections(section_name)').eq('student_id',studentId).eq('status','active').maybeSingle();$('transcript-print-card').innerHTML=buildTranscript({student:s,rows:g||[],mode:'official',sectionName:enrollment.data?.sections?.section_name||''});previewPdf($('transcript-print-card'),{title:'Official Transcript',filename:pdfName('Transcript',s),printClass:'printing-transcript'})}
