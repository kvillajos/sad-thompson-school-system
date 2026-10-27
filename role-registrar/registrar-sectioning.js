import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'
import { $, state } from './registrar-state.js'
import { escapeHtml, lastFirst, byLastName, formatDate, gradeLabel, errorRow } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { currentSchoolYear } from '../shared/lib/grades.js'
import { planBalancedAssignments, studentsForSection } from '../shared/lib/sectioning.js'
import { statusBadge, bindViewStudentButtons } from './registrar-admissions.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { downloadTableCsv } from '../shared/ui/table-copy.js'
import { mountFilterBar, gradeFilter, strandFilter } from '../shared/ui/filter-bar.js'

$('new-enrollment').onclick = () => document.querySelector('[data-tab="admission"]').click()

$('close-section-students').addEventListener('click', () => $('section-students-modal').classList.add('hidden'))

let sectionCounts = {}
// Rebuilding a <select> resets it, so the current choice is put back afterwards.
const refill = (select, html) => {
  const keep = select.value
  select.innerHTML = html
  if ([...select.options].some(option => option.value === keep)) select.value = keep
}
export async function loadSections() {
  // Past-year sections are history (report cards, attendance); only current and upcoming ones can take students.
  const { data, error } = await supabase
    .from('sections')
    .select('section_id,section_name,grade_level,strand,capacity,faculty_assigned')
    .gte('academic_year', currentSchoolYear())
    .order('grade_level')
    .order('section_name')
  if (error) {
    $('section-table').innerHTML = errorRow(5, error, 'Load sections')
    return
  }
  state.sections = data || []
  const { data: enrollmentRows, error: countError } = await fetchAll(() =>
    supabase.from('enrollments').select('section_id').eq('status', 'active').order('id')
  )
  if (countError) toast(describeError(countError, 'Load section counts'), 'error')
  sectionCounts = (enrollmentRows || []).reduce((result, row) => {
    result[row.section_id] = (result[row.section_id] || 0) + 1
    return result
  }, {})
  const grades = [...new Set(state.sections.map(s => s.grade_level))]
  refill($('placement-grade'), grades.map(g => `<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join(''))
  refill(
    $('section-grade-filter'),
    '<option value="">All Grades</option>' + grades.map(g => `<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join('')
  )
  refill(
    $('enrollment-section-filter'),
    '<option value="">All Sections</option>' +
      state.sections.map(s => `<option value="${s.section_id}">${escapeHtml(s.section_name)}</option>`).join('')
  )
  const shiftSections = [...new Set([...state.studentSections.values()].filter(Boolean))].sort()
  refill(
    $('shift-student-filter'),
    '<option value="">All sections</option>' + shiftSections.map(section => `<option>${escapeHtml(section)}</option>`).join('')
  )
  renderSections()
}
function renderSections() {
  const sectionSearch = ($('section-search')?.value || '').trim().toLowerCase()
  const sectionGrade = $('section-grade-filter')?.value || ''
  const visibleSections = state.sections.filter(
    section =>
      (!sectionGrade || String(section.grade_level) === sectionGrade) &&
      (!sectionSearch || section.section_name.toLowerCase().includes(sectionSearch))
  )
  $('section-table').innerHTML =
    visibleSections
      .map(
        s =>
          `<tr><td>${escapeHtml(s.section_name)}</td><td>${escapeHtml(gradeLabel(s.grade_level))}</td><td>${escapeHtml(s.faculty_assigned || '-')}</td><td>${sectionCounts[s.section_id] || 0}</td><td><button class="admin-view" data-view-section="${s.section_id}">View Students</button></td></tr>`
      )
      .join('') ||
    `<tr><td colspan="5">${state.sections.length ? 'No sections match this filter.' : 'No sections configured. Ask the administrator to add sections.'}</td></tr>`
  document.querySelectorAll('[data-place]').forEach(b => (b.onclick = () => openPlacement(Number(b.dataset.place))))
  document.querySelectorAll('[data-view-section]').forEach(b => (b.onclick = () => viewSectionStudents(Number(b.dataset.viewSection))))
}
document.querySelector('#section-search').oninput = renderSections
document.querySelector('#section-grade-filter').onchange = renderSections
async function viewSectionStudents(sectionId) {
  const section = state.sections.find(item => Number(item.section_id) === sectionId)
  if (!section) return
  $('section-students-title').textContent = `${section.section_name} - Students`
  $('section-students-body').innerHTML = '<p>Loading section students…</p>'
  $('section-students-modal').classList.remove('hidden')
  const { data, error } = await supabase
    .from('enrollments')
    .select('student_id,students(lrn_number,first_name,last_name,gender,grade_level,enrollment_status)')
    .eq('section_id', sectionId)
    .eq('status', 'active')
  if (error)
    return ($('section-students-body').innerHTML =
      `<p class="empty-state" role="alert">${escapeHtml(describeError(error, 'Load section students'))}</p>`)
  const rows = (data || []).sort((a, b) => byLastName(a.students, b.students))
  const sexLabel = value =>
    ({ m: 'Male', f: 'Female' })[
      String(value || '')
        .trim()
        .toLowerCase()
        .charAt(0)
    ] ||
    value ||
    '-'
  $('section-students-body').innerHTML =
    `<table><thead><tr><th>Student ID</th><th>Name</th><th>Sex</th><th>Grade</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
      rows
        .map(row => {
          const student = row.students || {}
          return `<tr><td>${escapeHtml(student.lrn_number || row.student_id)}</td><td>${escapeHtml(lastFirst(student))}</td><td>${escapeHtml(sexLabel(student.gender))}</td><td>${escapeHtml(student.grade_level == null ? '-' : gradeLabel(student.grade_level))}</td><td>${statusBadge(student.enrollment_status || 'Enrolled')}</td><td><button class="admin-view" data-view-student="${row.student_id}">View</button></td></tr>`
        })
        .join('') || '<tr><td colspan="6" class="empty-state">No active students in this section.</td></tr>'
    }</tbody></table>`
  bindViewStudentButtons($('section-students-body'))
}
export async function loadEnrollments() {
const [studentResult, enrollmentResult, schoolYearResult] = await Promise.all([
  fetchAll(() =>
    supabase
      .from('students')
      .select('*')
      .order('last_name')
      .order('student_id')
  ),

  fetchAll(() =>
    supabase
      .from('enrollments')
      .select('id,student_id,school_year,enrolled_at,status,section_id,sections(section_name)')
      .eq('status', 'active')
      .order('school_year', { ascending: false })
      .order('id')
  ),

  fetchAll(() =>
    supabase
      .from('student_school_years')
      .select('student_id,school_year,grade_level,section_id')
      .order('school_year', { ascending: false })
  )
])
  const loadError = studentResult.error || enrollmentResult.error
  if (loadError) {
    $('enrollment-table').innerHTML = errorRow(7, loadError, 'Load enrollments')
    return
  }
  if (schoolYearResult.error) {
  studentSchoolYearRows = []
  toast(
    describeError(schoolYearResult.error, 'Load student school years'),
    'error'
  )
} else {
  studentSchoolYearRows = schoolYearResult.data || []
}
  const enrollmentByStudent = new Map((enrollmentResult.data || []).map(row => [String(row.student_id), row]))
  // Keep the directory's Section column in step after placements and shifts.
  state.studentSections = new Map([...enrollmentByStudent].map(([id, row]) => [id, row.sections?.section_name || 'No Section']))
  renderStudentDirectory()
  enrollmentData = (studentResult.data || []).map(student => ({
    ...enrollmentByStudent.get(String(student.student_id)),
    student_id: student.student_id,
    students: student
  }))
  renderEnrollments()
}
let enrollmentData = []
let enrollmentSortKey = 'name'
let enrollmentSortAscending = true

function sortEnrollmentRows(rows) {
  const getValue = row => {
    const student = row.students || {}

    switch (enrollmentSortKey) {
      case 'name':
        return `${student.first_name || ''} ${student.last_name || ''}`.trim()
      case 'year':
        return row.school_year || ''
      case 'date':
        return row.enrolled_at || ''
      case 'section':
        return row.sections?.section_name || 'No Section'
      case 'status':
        return row.status || 'Not Enrolled'
      default:
        return ''
    }
  }

  return [...rows].sort((a, b) => {
    const first = getValue(a)
    const second = getValue(b)

    let result

    if (enrollmentSortKey === 'date') {
      result = new Date(first).getTime() - new Date(second).getTime()
    } else if (enrollmentSortKey === 'year') {
      result = String(first).localeCompare(String(second), undefined, {
        numeric: true
      })
    } else {
      result = String(first).localeCompare(String(second), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    }

    return enrollmentSortAscending ? result : -result
  })
}

function renderEnrollments() {
  const search = $('enrollment-search').value.trim().toLowerCase()
  const section = $('enrollment-section-filter').value
  const rows = enrollmentData.filter(row => {
    const student = row.students || {}
    return (
      (!section || String(row.section_id) === section) &&
      (!search || `${student.lrn_number} ${student.first_name} ${student.last_name}`.toLowerCase().includes(search))
    )
  })

  $('enrollment-table').innerHTML =
    sortEnrollmentRows(rows)
      .map(row => {
        const student = row.students || {}

        return `<tr class="enrollment-row">
      <td data-label="Student ID">
        <strong>${escapeHtml(student.lrn_number || row.student_id)}</strong>
      </td>
      <td data-label="Student Name">
        ${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`.trim())}
      </td>
      <td data-label="School Year">
        ${escapeHtml(row.school_year || '-')}
      </td>
      <td data-label="Registration Date">
        ${formatDate(row.enrolled_at)}
      </td>
      <td data-label="Section">
        ${escapeHtml(row.sections?.section_name || 'No Section')}
      </td>
      <td data-label="Status">
        ${statusBadge(row.status || 'Not Enrolled')}
      </td>
      <td data-label="Actions" class="enrollment-actions">
        <button class="admin-view" data-view-student="${row.student_id}">View</button>
        ${row.id ? `<button class="admin-remove" data-remove-enrollment="${row.id}">Remove</button>` : ''}
      </td>
    </tr>`
      })
      .join('') || '<tr><td colspan="7" class="empty-state">No enrollment records found.</td></tr>'

  bindViewStudentButtons($('enrollment-table'))
  document.querySelectorAll('[data-remove-enrollment]').forEach(
    button =>
      (button.onclick = () =>
        confirmRemoveEnrollment(
          button.dataset.removeEnrollment,
          rows.find(row => String(row.id) === button.dataset.removeEnrollment)
        ))
  )
}
let removeEnrollmentCountdown = null
function confirmRemoveEnrollment(id, row) {
  const student = row?.students || {}
  $('remove-enrollment-details').innerHTML =
    `You are about to remove <b>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`.trim() || row?.student_id || '')}</b> from <b>${escapeHtml(row?.sections?.section_name || 'their section')}</b>.`
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
  toast('Enrollment removed.')
  loadEnrollments()
}
$('enrollment-search').oninput = renderEnrollments
$('enrollment-section-filter').onchange = renderEnrollments

$('enrollment-table')
  .closest('table')
  ?.querySelectorAll('thead th[data-sort]')
  .forEach(header => {
    header.style.cursor = 'pointer'

    header.addEventListener('click', () => {
      const key = header.dataset.sort

      if (enrollmentSortKey === key) {
        enrollmentSortAscending = !enrollmentSortAscending
      } else {
        enrollmentSortKey = key
        enrollmentSortAscending = true
      }

      renderEnrollments()
    })
  })

async function openPlacement(sectionId = '') {
  const [studentResult, enrollmentResult] = await Promise.all([
    fetchAll(() => supabase.from('students').select('*').order('last_name').order('student_id')),
    fetchAll(() => supabase.from('enrollments').select('student_id,section_id,sections(section_name)').eq('status', 'active').order('id'))
  ])
  const placementError = studentResult.error || enrollmentResult.error
  if (placementError) return toast(describeError(placementError, 'Load placement students'), 'error')
  state.students = (studentResult.data || []).sort(byLastName)
  state.enrolledByStudent = new Map((enrollmentResult.data || []).map(row => [row.student_id, row.section_id]))
  // Approving an application creates an active enrollment with no section yet; those students are unassigned.
  state.enrolledSections = new Map(
    (enrollmentResult.data || [])
      .filter(row => row.section_id)
      .map(row => [String(row.student_id), row.sections?.section_name || 'Another section'])
  )
  if (!state.students.length) return toast('No students are available for placement. Check the students table and RLS policy.', 'error')
  const grades = [...new Set(state.sections.map(s => s.grade_level))].sort((a, b) => a - b)
  $('placement-grade').innerHTML = grades.map(g => `<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join('')
  $('placement-search').value = ''
  renderPlacementStudents()
  if (sectionId) $('placement-section').value = sectionId
  renderPlacementStudents()
  $('placement-modal').classList.remove('hidden')
}
// The grade's students render as a table with a title, a search box and a
// "without a section" filter, so the registrar can see who is being moved before placing.
function placementRows() {
  const grade = $('placement-grade').value
  const sections = state.sections
    .filter(section => Number(section.grade_level) === Number(grade))
    .sort((a, b) => (a.section_name || '').localeCompare(b.section_name || ''))
  const currentSection = $('placement-section').value
  $('placement-section').innerHTML = sections
    .map(
      s =>
        `<option value="${s.section_id}">${escapeHtml(s.section_name)}${s.strand ? ` · ${escapeHtml(s.strand)}` : ''} (${Math.max(0, s.capacity - (sectionCounts[s.section_id] || 0))} of ${s.capacity} seats left)</option>`
    )
    .join('')
  if (sections.some(section => String(section.section_id) === currentSection)) $('placement-section').value = currentSection
  const search = $('placement-search').value.trim().toLowerCase()
  const chosenSection = sections.find(section => String(section.section_id) === $('placement-section').value)
  return studentsForSection(state.students, {
    gradeLevel: grade,
    sectionId: $('placement-section').value,
    strand: chosenSection?.strand,
    enrolledByStudent: state.enrolledByStudent
  }).filter(
    student =>
      !search ||
      `${student.lrn_number || ''} ${student.student_id} ${student.first_name || ''} ${student.last_name || ''}`
        .toLowerCase()
        .includes(search)
  )
}
function renderPlacementStudents() {
  const rows = placementRows()
  const section = state.sections.find(item => String(item.section_id) === $('placement-section').value)
  $('placement-list-title').textContent =
    `${gradeLabel($('placement-grade').value)} students${section ? ` - ${section.section_name}` : ''} (${rows.length})`
  $('placement-students').innerHTML =
    rows
      .map(
        s =>
          `<tr><td><input type="checkbox" value="${s.student_id}" aria-label="Select ${escapeHtml(lastFirst(s))}"></td><td>${escapeHtml(s.lrn_number || s.student_id)}</td><td>${escapeHtml(lastFirst(s))}</td><td>${escapeHtml(gradeLabel(s.grade_level))}</td><td>${escapeHtml(state.enrolledSections.get(String(s.student_id)) || 'No Section')}</td></tr>`
      )
      .join('') || '<tr><td colspan="5" class="empty-state">No students match this filter.</td></tr>'
}
$('placement-grade').addEventListener('change', renderPlacementStudents)
$('placement-section').addEventListener('change', renderPlacementStudents)
$('placement-search').addEventListener('input', renderPlacementStudents)
$('placement-select-all').onclick = () => {
  const boxes = [...$('placement-students').querySelectorAll('input[type=checkbox]')]
  const select = boxes.some(box => !box.checked)
  boxes.forEach(box => {
    box.checked = select
  })
}
$('open-placement').onclick = () => openPlacement()
$('close-placement').onclick = () => $('placement-modal').classList.add('hidden')
$('close-placement-2').onclick = () => $('placement-modal').classList.add('hidden')
$('place-selected').onclick = async () => {
  const sectionId = $('placement-section').value
  const studentIds = [...$('placement-students').querySelectorAll('input:checked')].map(option => +option.value)
  if (!sectionId || !studentIds.length) return toast('Select a section and at least one student.', 'error')
  withBusy($('place-selected'), 'Placing…', async () => {
    const { data, error } = await supabase.rpc('apply_section_assignments', {
      p_assignments: studentIds.map(id => ({ student_id: id, section_id: Number(sectionId) }))
    })
    if (error) return toast(describeError(error, 'Place students'), 'error')
    $('placement-modal').classList.add('hidden')
    toast(`Placed ${data?.placed ?? studentIds.length} student(s).`)
    await Promise.all([loadSections(), loadEnrollments()])
  })
}
// Auto-assign: the registrar picks the grade levels to run and may exclude individual
// students. The plan is previewed on every change and written in one validated RPC call.
const autoAssignGrades = () => [...$('auto-assign-grades').querySelectorAll('input[type=checkbox]')]
const chosenGrades = () =>
  autoAssignGrades()
    .filter(box => box.checked)
    .map(box => +box.value)
// Exclusions live in a Set, not in the checkboxes: only one page of the list is drawn at a time, so ticks on other pages must survive paging.
const excludedIds = new Set()
const EXCLUDE_PAGE_SIZE = 10
let excludePage = 1
const autoAssignExclusions = () => excludedIds
function renderAutoAssignGrades() {
  const grades = [...new Set(state.sections.map(section => Number(section.grade_level)))].sort((a, b) => a - b)
  $('auto-assign-grades').innerHTML =
    grades
      .map(
        grade =>
          `<label class="grade-option"><input type="checkbox" value="${grade}" checked><span class="grade-check" aria-hidden="true"></span><span>${escapeHtml(gradeLabel(grade))}</span></label>`
      )
      .join('') || '<small>No sections are configured, so there is nothing to auto-assign.</small>'
}
function renderAutoAssignExclusions() {
  const search = $('auto-assign-exclude-search').value.trim().toLowerCase()
  const grades = new Set(chosenGrades())
  const students = state.students.filter(student => {
    if (!grades.has(Number(student.grade_level))) return false
    return (
      !search ||
      `${student.lrn_number || ''} ${student.student_id} ${student.first_name || ''} ${student.last_name || ''}`
        .toLowerCase()
        .includes(search)
    )
  })
  const pages = Math.max(1, Math.ceil(students.length / EXCLUDE_PAGE_SIZE))
  excludePage = Math.min(Math.max(1, excludePage), pages)
  const visible = students.slice((excludePage - 1) * EXCLUDE_PAGE_SIZE, excludePage * EXCLUDE_PAGE_SIZE)
  $('auto-assign-exclude-list').innerHTML =
    visible
      .map(
        student =>
          `<label><input type="checkbox" value="${student.student_id}"${excludedIds.has(student.student_id) ? ' checked' : ''}> ${escapeHtml(student.lrn_number || student.student_id)} - ${escapeHtml(lastFirst(student))}</label>`
      )
      .join('') || '<small>No students in the selected grade levels.</small>'
  $('auto-assign-exclude-page').textContent = students.length ? `Page ${excludePage} of ${pages} · ${students.length} students` : ''
  $('auto-assign-exclude-prev').disabled = excludePage <= 1
  $('auto-assign-exclude-next').disabled = excludePage >= pages
}
function planAutoAssign() {
  const grades = chosenGrades()
  if (!grades.length) return null
  return planBalancedAssignments({
    students: state.students,
    sections: state.sections.map(section => ({
      ...section,
      enrolled: [...state.enrolledByStudent.values()].filter(id => +id === Number(section.section_id)).length
    })),
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
    $('auto-assign-summary').innerHTML =
      '<p class="empty-state"><b id="auto-assign-count">0</b> - select at least one grade level to auto-assign.</p>'
    $('confirm-auto-assign').disabled = true
    return
  }
  $('confirm-auto-assign').disabled = false
  const chosen = new Set(chosenGrades())
  const excluded = state.students.filter(student => excludedIds.has(student.student_id) && chosen.has(Number(student.grade_level))).length
  const sections = plan.summary
    .filter(row => row.total)
    .map(row => `<small>${escapeHtml(row.section_name)} - ${row.boys} boy(s), ${row.girls} girl(s)</small>`)
    .join('<br>')
  const unplaced = plan.unplaced.length
    ? `<br><small class="empty-state">Unplaced: ${plan.unplaced.map(row => escapeHtml(row.student_id)).join(', ')}</small>`
    : ''
  $('auto-assign-summary').innerHTML =
    `<p><b id="auto-assign-count">${plan.assignments.length}</b> student(s) will be placed in ${escapeHtml(chosenGrades().map(gradeLabel).join(', '))}; <b>${plan.unplaced.length}</b> cannot be placed${excluded ? `; <b>${excluded}</b> excluded` : ''}.</p>${sections}${unplaced}`
}
$('auto-assign-sections').onclick = async () => {
  if (!state.students.length || !state.sections.length) return toast('Load students and sections first.', 'error')
  const { data: enrollments, error } = await fetchAll(() =>
    supabase.from('enrollments').select('student_id,section_id').eq('status', 'active').order('id')
  )
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
$('auto-assign-all-grades').onclick = () => {
  const boxes = autoAssignGrades()
  const select = boxes.some(box => !box.checked)
  boxes.forEach(box => {
    box.checked = select
  })
  excludePage = 1
  renderAutoAssignExclusions()
  previewAutoAssign()
}
$('auto-assign-exclude-search').oninput = () => {
  excludePage = 1
  renderAutoAssignExclusions()
}
$('auto-assign-grades').addEventListener('change', () => {
  excludePage = 1
  renderAutoAssignExclusions()
  previewAutoAssign()
})
$('auto-assign-exclude-list').addEventListener('change', event => {
  const box = event.target
  if (box.checked) excludedIds.add(+box.value)
  else excludedIds.delete(+box.value)
  previewAutoAssign()
})
$('auto-assign-exclude-prev').onclick = () => {
  excludePage--
  renderAutoAssignExclusions()
}
$('auto-assign-exclude-next').onclick = () => {
  excludePage++
  renderAutoAssignExclusions()
}
$('close-auto-assign').onclick = () => $('auto-assign-modal').classList.add('hidden')
document.querySelectorAll('[data-close]').forEach(button => {
  button.onclick = () => $(button.dataset.close).classList.add('hidden')
})
$('confirm-auto-assign').onclick = () => {
  const plan = state.autoAssignPlan
  if (!plan || !plan.assignments.length) return toast('Nothing to assign with the current grade levels and exclusions.', 'error')
  withBusy($('confirm-auto-assign'), 'Assigning…', async () => {
    const { data, error } = await supabase.rpc('apply_section_assignments', { p_assignments: plan.assignments })
    if (error) return toast(describeError(error, 'Auto-assign'), 'error')
    $('auto-assign-modal').classList.add('hidden')
    toast(`Auto-assigned ${data?.placed ?? plan.assignments.length} student(s).`)
    await Promise.all([loadSections(), loadEnrollments()])
  })
}

// Student Directory school-year filtering
let studentSchoolYearRows = []
let studentDirectoryView = 'current'

function getStudentSchoolYearRecord(studentId, schoolYear) {
  return studentSchoolYearRows.find(
    row =>
      String(row.student_id) === String(studentId) &&
      row.school_year === schoolYear
  )
}

function getLatestHistoricalSchoolYearRecord(studentId, schoolYear) {
  const currentStartYear = Number(String(schoolYear).split('-')[0])
  if (!Number.isInteger(currentStartYear)) return null

  return studentSchoolYearRows
    .filter(row => String(row.student_id) === String(studentId))
    .filter(row => {
      const match = /^(\d{4})-(\d{4})$/.exec(row.school_year)
      return match && Number(match[2]) === Number(match[1]) + 1 && Number(match[1]) < currentStartYear
    })
    .reduce((latest, row) => {
      if (!latest || Number(row.school_year.slice(0, 4)) > Number(latest.school_year.slice(0, 4))) {
        return row
      }
      return latest
    }, null)
}

// Update the selected filter button.
function updateStudentDirectoryFilterButtons() {
  document
    .querySelectorAll('#student-school-year-filters [data-student-view]')
    .forEach(button => {
      const isActive = button.dataset.studentView === studentDirectoryView

      button.classList.toggle('secondary', !isActive)
    })
}

// Grade, section and strand on top of the Current SY / Not re-enrolled / All views (Export CSV stays John's button).
const directoryFilters = mountFilterBar($('student-directory-filters'), {
  filters: [
    gradeFilter(row => row.student.grade_level),
    { key: 'section', all: 'All sections', get: row => state.studentSections.get(String(row.student.student_id)) },
    strandFilter(row => row.student.strand)
  ],
  onChange: () => renderStudentDirectory()
})
export function renderStudentDirectory() {
  const search = (
    $('student-directory-search')?.value || ''
  ).trim().toLowerCase()

  const schoolYear = currentSchoolYear()

  // Filter a separate list. Do not modify state.students because
  // other registrar features also depend on the complete student list.
  let rows = state.students.map(student => {
    const currentRecord = getStudentSchoolYearRecord(
      student.student_id,
      schoolYear
    )

    const lastEnrolledRecord = getLatestHistoricalSchoolYearRecord(
      student.student_id,
      schoolYear
    )

    return {
      student,
      currentRecord,
      lastEnrolledRecord
    }
  })

  if (studentDirectoryView === 'current') {
    rows = rows.filter(row => row.currentRecord)
  } else if (studentDirectoryView === 'not-reenrolled') {
    rows = rows.filter(
      row => row.lastEnrolledRecord && !row.currentRecord
    )
  }

  directoryFilters.update(rows)
  rows = directoryFilters.apply(rows)

  // Keep the existing search functionality.
  rows = rows.filter(({ student }) =>
    `${student.lrn_number || ''} ${student.student_id} ${
      student.first_name || ''
    } ${student.last_name || ''}`
      .toLowerCase()
      .includes(search)
  )

  $('student-directory-table').innerHTML =
    rows
      .map(({ student, lastEnrolledRecord }) => {
        const isNotReenrolled =
          studentDirectoryView === 'not-reenrolled'

        // Show returnees' grade from their most recent enrolled year.
        const displayedGrade = isNotReenrolled
          ? lastEnrolledRecord?.grade_level ?? student.grade_level
          : student.grade_level

        const grade = displayedGrade == null
          ? '-'
          : gradeLabel(displayedGrade)

        const section = state.studentSections.get(
          String(student.student_id)
        ) || 'No Section'

        const reEnrollButton = isNotReenrolled
          ? `<button
               type="button"
               class="admin-primary"
               data-reenroll-student="${escapeHtml(student.student_id)}"
             >Enroll for ${escapeHtml(schoolYear)}</button>`
          : ''

        return `
          <tr>
            <td>${escapeHtml(student.lrn_number || student.student_id)}</td>
            <td>${escapeHtml(
              `${student.first_name || ''} ${student.last_name || ''}`
            )}</td>
            <td>${escapeHtml(
              student.date_of_birth || student.birth_date || '-'
            )}</td>
            <td>${escapeHtml(student.gender || student.sex || '-')}</td>
            <td>${escapeHtml(grade)}</td>
            <td>${escapeHtml(isNotReenrolled ? lastEnrolledRecord?.school_year || '-' : '-')}</td>
            <td>${escapeHtml(section)}</td>
            <td>${statusBadge(
              isNotReenrolled
                ? 'Not Re-enrolled'
                : student.enrollment_status || 'Enrolled'
            )}</td>
            <td>
              <button
                type="button"
                class="admin-view"
                data-view-student="${escapeHtml(student.student_id)}"
              >View</button>
              ${reEnrollButton}
            </td>
          </tr>
        `
      })
      .join('') ||
    '<tr><td colspan="9" class="empty-state">No students found for this filter.</td></tr>'

  updateStudentDirectoryFilterButtons()

  bindViewStudentButtons($('student-directory-table'))

  // Attach the re-enrollment action to the visible rows.
  $('student-directory-table')
    .querySelectorAll('[data-reenroll-student]')
    .forEach(button => {
      button.onclick = () =>
        withBusy(button, 'Re-enrolling…', async () => {
          const studentId = button.dataset.reenrollStudent
          const schoolYear = currentSchoolYear()

          const existingRecord = getStudentSchoolYearRecord(
            studentId,
            schoolYear
          )

          if (existingRecord) {
            toast('This student is already enrolled for the current school year.')
            await loadEnrollments()
            return
          }

          const lastEnrolledRecord = getLatestHistoricalSchoolYearRecord(
            studentId,
            schoolYear
          )

          const student = state.students.find(
            item => String(item.student_id) === String(studentId)
          )

          const gradeLevel =
            lastEnrolledRecord?.grade_level ?? student?.grade_level

          if (gradeLevel == null) {
            toast('Cannot re-enroll: the student grade level is missing.', 'error')
            return
          }

          const { error } = await supabase
            .from('student_school_years')
            .upsert(
              {
                student_id: studentId,
                school_year: schoolYear,
                grade_level: gradeLevel,
                section_id: null
              },
              {
                onConflict: 'student_id,school_year'
              }
            )

          if (error) {
            toast(describeError(error, 'Re-enroll student'), 'error')
            return
          }

          toast(`Student re-enrolled for ${schoolYear}.`)

          // Reload the records so the student moves into Current SY.
          await loadEnrollments()
        })
    })
}

function exportStudentDirectory() {
  if (!downloadTableCsv($('student-directory-table').closest('table'), 'student-directory'))
    toast('Cannot export the student directory: table headers are missing.', 'error')
}

$('export-student-directory').addEventListener('click', exportStudentDirectory)

// Switch between the three school-year views.
document
  .querySelectorAll('#student-school-year-filters [data-student-view]')
  .forEach(button => {
    button.addEventListener('click', () => {
      studentDirectoryView = button.dataset.studentView
      renderStudentDirectory()
    })
  })

// Keep the existing search behavior.
$('student-directory-search').oninput = renderStudentDirectory

$('student-directory-search').oninput = renderStudentDirectory
