import { supabase } from './auth-client.js'
import { toast } from './ui-theme.js'
import { withBusy } from './shell.js'
import { $, state } from './registrar-state.js'
import { escapeHtml, formatDate, gradeLabel, errorRow } from './html.js'
import { describeError } from './errors.js'
import { currentSchoolYear } from './grades.js'
import { planBalancedAssignments, studentsForSection } from './sectioning.js'
import { statusBadge, bindViewStudentButtons } from './registrar-admissions.js'
import { fetchAll } from './fetch-all.js'

$('new-enrollment').onclick = () => document.querySelector('[data-tab="admission"]').click()

$('close-section-students').addEventListener('click', () => $('section-students-modal').classList.add('hidden'))

let sectionCounts = {}
// Rebuilding a <select> resets it, so the current choice is put back afterwards.
const refill = (select, html) => { const keep = select.value; select.innerHTML = html; if ([...select.options].some(option => option.value === keep)) select.value = keep }
export async function loadSections() {
  // Past-year sections are history (report cards, attendance); only current and upcoming ones can take students.
  const { data, error } = await supabase.from('sections').select('section_id,section_name,grade_level,capacity,faculty_assigned').gte('academic_year', currentSchoolYear()).order('grade_level').order('section_name')
  if (error) { $('section-table').innerHTML = errorRow(5, error, 'Load sections'); return }
  state.sections = data || []
  const { data: enrollmentRows, error: countError } = await fetchAll(() => supabase.from('enrollments').select('section_id').eq('status','active').order('id'))
  if (countError) toast(describeError(countError, 'Load section counts'), 'error')
  sectionCounts = (enrollmentRows || []).reduce((result, row) => { result[row.section_id] = (result[row.section_id] || 0) + 1; return result }, {})
  const grades=[...new Set(state.sections.map(s=>s.grade_level))]
  refill($('placement-grade'), grades.map(g=>`<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join(''))
  refill($('section-grade-filter'), '<option value="">All Grades</option>'+grades.map(g=>`<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join(''))
  refill($('enrollment-section-filter'), '<option value="">All Sections</option>' + state.sections.map(s=>`<option value="${s.section_id}">${escapeHtml(s.section_name)}</option>`).join(''))
  const shiftSections = [...new Set([...state.studentSections.values()].filter(Boolean))].sort()
  refill($('shift-student-filter'), '<option value="">All sections</option>' + shiftSections.map(section => `<option>${escapeHtml(section)}</option>`).join(''))
  renderSections()
}
function renderSections() {
  const sectionSearch = ($('section-search')?.value || '').trim().toLowerCase()
  const sectionGrade = $('section-grade-filter')?.value || ''
  const visibleSections = state.sections.filter(section => (!sectionGrade || String(section.grade_level) === sectionGrade) && (!sectionSearch || section.section_name.toLowerCase().includes(sectionSearch)))
  $('section-table').innerHTML = visibleSections.map(s => `<tr><td>${escapeHtml(s.section_name)}</td><td>${escapeHtml(gradeLabel(s.grade_level))}</td><td>${escapeHtml(s.faculty_assigned || '-')}</td><td>${sectionCounts[s.section_id] || 0}</td><td><button class="admin-view" data-view-section="${s.section_id}">View Students</button></td></tr>`).join('') || `<tr><td colspan="5">${state.sections.length ? 'No sections match this filter.' : 'No sections configured. Ask the administrator to add sections.'}</td></tr>`
  document.querySelectorAll('[data-place]').forEach(b => b.onclick=()=>openPlacement(Number(b.dataset.place)))
  document.querySelectorAll('[data-view-section]').forEach(b => b.onclick=()=>viewSectionStudents(Number(b.dataset.viewSection)))
}
document.querySelector('#section-search').oninput = renderSections
document.querySelector('#section-grade-filter').onchange = renderSections
async function viewSectionStudents(sectionId) {
  const section = state.sections.find(item => Number(item.section_id) === sectionId)
  if (!section) return
  $('section-students-title').textContent = `${section.section_name} — Students`
  $('section-students-body').innerHTML = '<p>Loading section students…</p>'
  $('section-students-modal').classList.remove('hidden')
  const { data, error } = await supabase.from('enrollments').select('student_id,students(lrn_number,first_name,last_name,gender,grade_level,enrollment_status)').eq('section_id', sectionId).eq('status', 'active')
  if (error) return $('section-students-body').innerHTML = `<p class="empty-state" role="alert">${escapeHtml(describeError(error, 'Load section students'))}</p>`
  const rows = data || []
  const sexLabel = value => ({ m: 'Male', f: 'Female' })[String(value || '').trim().toLowerCase().charAt(0)] || value || '-'
  $('section-students-body').innerHTML = `<table><thead><tr><th>Student ID</th><th>Name</th><th>Sex</th><th>Grade</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(row => { const student = row.students || {}; return `<tr><td>${escapeHtml(student.lrn_number || row.student_id)}</td><td>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`)}</td><td>${escapeHtml(sexLabel(student.gender))}</td><td>${escapeHtml(student.grade_level == null ? '-' : gradeLabel(student.grade_level))}</td><td>${statusBadge(student.enrollment_status || 'Enrolled')}</td><td><button class="admin-view" data-view-student="${row.student_id}">View</button></td></tr>` }).join('') || '<tr><td colspan="6" class="empty-state">No active students in this section.</td></tr>'}</tbody></table>`
  bindViewStudentButtons($('section-students-body'))
}
export async function loadEnrollments() {
  const [studentResult, enrollmentResult] = await Promise.all([
    fetchAll(() => supabase.from('students').select('*').order('last_name').order('student_id')),
    fetchAll(() => supabase.from('enrollments').select('id,student_id,school_year,enrolled_at,status,section_id,sections(section_name)').eq('status', 'active').order('school_year', { ascending: false }).order('id'))
  ])
  const loadError = studentResult.error || enrollmentResult.error
  if (loadError) { $('enrollment-table').innerHTML = errorRow(7, loadError, 'Load enrollments'); return }
  const enrollmentByStudent = new Map((enrollmentResult.data || []).map(row => [String(row.student_id), row]))
  // Keep the directory's Section column in step after placements and shifts.
  state.studentSections = new Map([...enrollmentByStudent].map(([id, row]) => [id, row.sections?.section_name || 'No Section']))
  renderStudentDirectory()
  enrollmentData = (studentResult.data || []).map(student => ({
    ...enrollmentByStudent.get(String(student.student_id)),
    student_id: student.student_id, students: student
  }))
  renderEnrollments()
}
let enrollmentData = []
function renderEnrollments() {
  const search = $('enrollment-search').value.trim().toLowerCase()
  const section = $('enrollment-section-filter').value
  const rows = enrollmentData.filter(row => {
    const student = row.students || {}
    return (!section || String(row.section_id) === section) && (!search || `${student.lrn_number} ${student.first_name} ${student.last_name}`.toLowerCase().includes(search))
  })
  $('enrollment-table').innerHTML = rows.map(row => { const student = row.students || {}; return `<tr><td>${escapeHtml(student.lrn_number || row.student_id)}</td><td>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`)}</td><td>${escapeHtml(row.school_year || '')}</td><td>${formatDate(row.enrolled_at)}</td><td>${escapeHtml(row.sections?.section_name || 'No Section')}</td><td>${statusBadge(row.status || 'Not Enrolled')}</td><td><button class="admin-view" data-view-student="${row.student_id}">View</button> ${row.id ? `<button class="admin-remove" data-remove-enrollment="${row.id}">Remove</button>` : ''}</td></tr>` }).join('') || '<tr><td colspan="7" class="empty-state">No enrollment records found.</td></tr>'
  bindViewStudentButtons($('enrollment-table'))
  document.querySelectorAll('[data-remove-enrollment]').forEach(button => button.onclick = () => confirmRemoveEnrollment(button.dataset.removeEnrollment, rows.find(row => String(row.id) === button.dataset.removeEnrollment)))
}
let removeEnrollmentCountdown = null
function confirmRemoveEnrollment(id, row) {
  const student = row?.students || {}
  $('remove-enrollment-details').innerHTML = `You are about to remove <b>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`.trim() || row?.student_id || '')}</b> from <b>${escapeHtml(row?.sections?.section_name || 'their section')}</b>.`
  const confirmBtn = $('confirm-remove-enrollment')
  const countdownEl = $('remove-enrollment-countdown')
  const secondsEl = $('remove-enrollment-seconds')
  confirmBtn.disabled = true
  countdownEl.classList.remove('hidden')
  let secondsLeft = 3
  secondsEl.textContent = secondsLeft
  clearInterval(removeEnrollmentCountdown)
  removeEnrollmentCountdown = setInterval(() => {
    secondsLeft -= 1
    if (secondsLeft <= 0) {
      clearInterval(removeEnrollmentCountdown)
      countdownEl.classList.add('hidden')
      confirmBtn.disabled = false
      return
    }
    secondsEl.textContent = secondsLeft
  }, 1000)
  $('remove-enrollment-modal').classList.remove('hidden')
  confirmBtn.onclick = () => withBusy(confirmBtn, 'Removing…', () => removeEnrollment(id))
}
function closeRemoveEnrollmentModal() {
  clearInterval(removeEnrollmentCountdown)
  $('remove-enrollment-modal').classList.add('hidden')
}
$('close-remove-enrollment').addEventListener('click', closeRemoveEnrollmentModal)
$('cancel-remove-enrollment').addEventListener('click', closeRemoveEnrollmentModal)
async function removeEnrollment(id) {
  const { error } = await supabase.from('enrollments').update({ status: 'inactive' }).eq('id', id)
  if (error) return toast(describeError(error, 'Remove enrollment'), 'error')
  closeRemoveEnrollmentModal()
  toast('Enrollment removed.'); loadEnrollments()
}
$('enrollment-search').oninput = renderEnrollments
$('enrollment-section-filter').onchange = renderEnrollments

async function openPlacement(sectionId='') {
  const [studentResult, enrollmentResult] = await Promise.all([
    fetchAll(() => supabase.from('students').select('*').order('last_name').order('student_id')),
    fetchAll(() => supabase.from('enrollments').select('student_id,section_id,sections(section_name)').eq('status','active').order('id'))
  ])
  const placementError = studentResult.error || enrollmentResult.error
  if (placementError) return toast(describeError(placementError, 'Load placement students'),'error')
  state.students = studentResult.data || []
  state.enrolledByStudent = new Map((enrollmentResult.data || []).map(row => [row.student_id, row.section_id]))
  // Approving an application creates an active enrollment with no section yet; those students are unassigned.
  state.enrolledSections = new Map((enrollmentResult.data || []).filter(row => row.section_id).map(row => [String(row.student_id), row.sections?.section_name || 'Another section']))
  if (!state.students.length) return toast('No students are available for placement. Check the students table and RLS policy.', 'error')
  const grades=[...new Set(state.sections.map(s=>s.grade_level))].sort((a,b)=>a-b)
  $('placement-grade').innerHTML=grades.map(g=>`<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join('')
  $('placement-search').value=''
  renderPlacementStudents()
  if (sectionId) $('placement-section').value=sectionId
  renderPlacementStudents()
  $('placement-modal').classList.remove('hidden')
}
// The grade's students render as a table with a title, a search box and a
// "without a section" filter, so the registrar can see who is being moved before placing.
function placementRows() {
  const grade = $('placement-grade').value
  const sections = state.sections.filter(section => Number(section.grade_level) === Number(grade)).sort((a,b)=>(a.section_name||'').localeCompare(b.section_name||''))
  const currentSection = $('placement-section').value
  $('placement-section').innerHTML = sections.map(s=>`<option value="${s.section_id}">${escapeHtml(s.section_name)} (${Math.max(0, s.capacity - (sectionCounts[s.section_id] || 0))} of ${s.capacity} seats left)</option>`).join('')
  if (sections.some(section => String(section.section_id) === currentSection)) $('placement-section').value = currentSection
  const search = $('placement-search').value.trim().toLowerCase()
  return studentsForSection(state.students, {
    gradeLevel: grade,
    sectionId: $('placement-section').value,
    enrolledByStudent: state.enrolledByStudent
  }).filter(student => !search || `${student.lrn_number||''} ${student.student_id} ${student.first_name||''} ${student.last_name||''}`.toLowerCase().includes(search))
}
function renderPlacementStudents() {
  const rows = placementRows()
  const section = state.sections.find(item => String(item.section_id) === $('placement-section').value)
  $('placement-list-title').textContent = `${gradeLabel($('placement-grade').value)} students${section ? ` - ${section.section_name}` : ''} (${rows.length})`
  $('placement-students').innerHTML = rows.map(s => `<tr><td><input type="checkbox" value="${s.student_id}" aria-label="Select ${escapeHtml(`${s.first_name||''} ${s.last_name||''}`)}"></td><td>${escapeHtml(s.lrn_number||s.student_id)}</td><td>${escapeHtml(`${s.first_name||''} ${s.last_name||''}`)}</td><td>${escapeHtml(gradeLabel(s.grade_level))}</td><td>${escapeHtml(state.enrolledSections.get(String(s.student_id)) || 'No Section')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-state">No students match this filter.</td></tr>'
}
$('placement-grade').addEventListener('change', renderPlacementStudents)
$('placement-section').addEventListener('change', renderPlacementStudents)
$('placement-search').addEventListener('input', renderPlacementStudents)
$('placement-select-all').onclick = () => {
  const boxes = [...$('placement-students').querySelectorAll('input[type=checkbox]')]
  const select = boxes.some(box => !box.checked)
  boxes.forEach(box => { box.checked = select })
}
$('open-placement').onclick=()=>openPlacement()
$('close-placement').onclick=()=>$('placement-modal').classList.add('hidden')
$('close-placement-2').onclick=()=>$('placement-modal').classList.add('hidden')
$('place-selected').onclick=async()=>{
  const sectionId=$('placement-section').value
  const studentIds=[...$('placement-students').querySelectorAll('input:checked')].map(option => +option.value)
  if(!sectionId||!studentIds.length)return toast('Select a section and at least one student.','error')
  withBusy($('place-selected'),'Placing…',async()=>{
    const { data, error }=await supabase.rpc('apply_section_assignments',{p_assignments:studentIds.map(id=>({student_id:id,section_id:Number(sectionId)}))})
    if(error)return toast(describeError(error,'Place students'),'error')
    $('placement-modal').classList.add('hidden')
    toast(`Placed ${data?.placed??studentIds.length} student(s).`); await Promise.all([loadSections(), loadEnrollments()])
  })
}
// Auto-assign: the registrar picks the grade levels to run and may exclude individual
// students. The plan is previewed on every change and written in one validated RPC call.
const autoAssignGrades = () => [...$('auto-assign-grades').querySelectorAll('input[type=checkbox]')]
const chosenGrades = () => autoAssignGrades().filter(box => box.checked).map(box => +box.value)
// Exclusions live in a Set, not in the checkboxes: only one page of the list is drawn at a time, so ticks on other pages must survive paging.
const excludedIds = new Set()
const EXCLUDE_PAGE_SIZE = 10
let excludePage = 1
const autoAssignExclusions = () => excludedIds
function renderAutoAssignGrades() {
  const grades = [...new Set(state.sections.map(section => Number(section.grade_level)))].sort((a,b)=>a-b)
  $('auto-assign-grades').innerHTML = grades.map(grade => `<label class="grade-option"><input type="checkbox" value="${grade}" checked><span class="grade-check" aria-hidden="true"></span><span>${escapeHtml(gradeLabel(grade))}</span></label>`).join('')
    || '<small>No sections are configured, so there is nothing to auto-assign.</small>'
}
function renderAutoAssignExclusions() {
  const search = $('auto-assign-exclude-search').value.trim().toLowerCase()
  const grades = new Set(chosenGrades())
  const students = state.students.filter(student => {
    if (!grades.has(Number(student.grade_level))) return false
    return !search || `${student.lrn_number||''} ${student.student_id} ${student.first_name||''} ${student.last_name||''}`.toLowerCase().includes(search)
  })
  const pages = Math.max(1, Math.ceil(students.length / EXCLUDE_PAGE_SIZE))
  excludePage = Math.min(Math.max(1, excludePage), pages)
  const visible = students.slice((excludePage - 1) * EXCLUDE_PAGE_SIZE, excludePage * EXCLUDE_PAGE_SIZE)
  $('auto-assign-exclude-list').innerHTML = visible.map(student => `<label><input type="checkbox" value="${student.student_id}"${excludedIds.has(student.student_id) ? ' checked' : ''}> ${escapeHtml(student.lrn_number||student.student_id)} — ${escapeHtml(`${student.first_name||''} ${student.last_name||''}`)}</label>`).join('')
    || '<small>No students in the selected grade levels.</small>'
  $('auto-assign-exclude-page').textContent = students.length ? `Page ${excludePage} of ${pages} · ${students.length} students` : ''
  $('auto-assign-exclude-prev').disabled = excludePage <= 1
  $('auto-assign-exclude-next').disabled = excludePage >= pages
}
function planAutoAssign() {
  const grades = chosenGrades()
  if (!grades.length) return null
  return planBalancedAssignments({
    students: state.students,
    sections: state.sections.map(section => ({ ...section, enrolled: [...state.enrolledByStudent.values()].filter(id => +id === Number(section.section_id)).length })),
    enrolledByStudent: state.enrolledByStudent,
    grades,
    excludedStudentIds: autoAssignExclusions()
  })
}
// The count lives in the summary (not the button) so withBusy can restyle the button freely.
function previewAutoAssign() {
  const plan = planAutoAssign()
  state.autoAssignPlan = plan
  const gradeCount = chosenGrades().length
  $('auto-assign-grade-count').textContent = `${gradeCount} grade${gradeCount === 1 ? '' : 's'} selected`
  if (!plan) {
    $('auto-assign-summary').innerHTML = '<p class="empty-state"><b id="auto-assign-count">0</b> — select at least one grade level to auto-assign.</p>'
    $('confirm-auto-assign').disabled = true
    return
  }
  $('confirm-auto-assign').disabled = false
  const chosen = new Set(chosenGrades())
  const excluded = state.students.filter(student => excludedIds.has(student.student_id) && chosen.has(Number(student.grade_level))).length
  const sections = plan.summary.filter(row=>row.total).map(row=> `<small>${escapeHtml(row.section_name)} — ${row.boys} boy(s), ${row.girls} girl(s)</small>`).join('<br>')
  const unplaced = plan.unplaced.length ? `<br><small class="empty-state">Unplaced: ${plan.unplaced.map(row=>escapeHtml(row.student_id)).join(', ')}</small>` : ''
  $('auto-assign-summary').innerHTML = `<p><b id="auto-assign-count">${plan.assignments.length}</b> student(s) will be placed in ${escapeHtml(chosenGrades().map(gradeLabel).join(', '))}; <b>${plan.unplaced.length}</b> cannot be placed${excluded ? `; <b>${excluded}</b> excluded` : ''}.</p>${sections}${unplaced}`
}
$('auto-assign-sections').onclick=async()=>{
  if(!state.students.length||!state.sections.length)return toast('Load students and sections first.','error')
  const { data: enrollments, error } = await fetchAll(() => supabase.from('enrollments').select('student_id,section_id').eq('status','active').order('id'))
  if (error) return toast(describeError(error, 'Load enrollments'), 'error')
  state.enrolledByStudent = new Map((enrollments || []).map(row => [row.student_id, row.section_id]))
  $('auto-assign-exclude-search').value = ''
  excludedIds.clear()
  excludePage = 1
  renderAutoAssignGrades()
  renderAutoAssignExclusions()
  previewAutoAssign()
  $('auto-assign-modal').classList.remove('hidden')
}
$('auto-assign-all-grades').onclick=()=>{
  const boxes = autoAssignGrades()
  const select = boxes.some(box => !box.checked)
  boxes.forEach(box => { box.checked = select })
  excludePage = 1
  renderAutoAssignExclusions()
  previewAutoAssign()
}
$('auto-assign-exclude-search').oninput = () => { excludePage = 1; renderAutoAssignExclusions() }
$('auto-assign-grades').addEventListener('change', () => { excludePage = 1; renderAutoAssignExclusions(); previewAutoAssign() })
$('auto-assign-exclude-list').addEventListener('change', event => {
  const box = event.target
  if (box.checked) excludedIds.add(+box.value); else excludedIds.delete(+box.value)
  previewAutoAssign()
})
$('auto-assign-exclude-prev').onclick = () => { excludePage--; renderAutoAssignExclusions() }
$('auto-assign-exclude-next').onclick = () => { excludePage++; renderAutoAssignExclusions() }
$('close-auto-assign').onclick=()=>$('auto-assign-modal').classList.add('hidden')
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).classList.add('hidden') })
$('confirm-auto-assign').onclick=()=>{
  const plan = state.autoAssignPlan
  if (!plan || !plan.assignments.length) return toast('Nothing to assign with the current grade levels and exclusions.', 'error')
  withBusy($('confirm-auto-assign'),'Assigning…',async()=>{
    const { data, error }=await supabase.rpc('apply_section_assignments',{p_assignments:plan.assignments})
    if(error)return toast(describeError(error,'Auto-assign'),'error')
    $('auto-assign-modal').classList.add('hidden')
    toast(`Auto-assigned ${data?.placed??plan.assignments.length} student(s).`); await Promise.all([loadSections(), loadEnrollments()])
  })
}

export function renderStudentDirectory(){const search=($('student-directory-search')?.value||'').trim().toLowerCase();const rows=state.students.filter(s=>`${s.lrn_number} ${s.student_id} ${s.first_name||''} ${s.last_name||''}`.toLowerCase().includes(search));$('student-directory-table').innerHTML=rows.map(s=>`<tr><td>${escapeHtml(s.lrn_number||s.student_id)}</td><td>${escapeHtml(`${s.first_name||''} ${s.last_name||''}`)}</td><td>${escapeHtml(s.date_of_birth||s.birth_date||'-')}</td><td>${escapeHtml(s.gender||s.sex||'-')}</td><td>${escapeHtml(s.grade_level == null ? '-' : gradeLabel(s.grade_level))}</td><td>${escapeHtml(state.studentSections.get(String(s.student_id)) || 'No Section')}</td><td>${statusBadge(s.enrollment_status||'Enrolled')}</td><td><button class="admin-view" data-view-student="${s.student_id}">View</button></td></tr>`).join('')||'<tr><td colspan="8" class="empty-state">No students found.</td></tr>';bindViewStudentButtons($('student-directory-table'))}

$('student-directory-search').oninput=renderStudentDirectory
