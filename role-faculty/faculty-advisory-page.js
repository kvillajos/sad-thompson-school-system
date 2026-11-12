// My Advisory: the class adviser's whole section on one page (every subject's grades, attendance, the
// students' requests and discipline records). Read access comes from the v60 adviser policies.
import { supabase } from '../shared/lib/auth-client.js'
import { loadFacultyContext, escapeHtml, lastFirst } from './faculty-common.js'
import { byLastName, errorRow, formatDate, gradeLabel } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { toast } from '../shared/ui/ui-theme.js'
import { mountSanctions } from '../shared/ui/sanctions.js'

const context = await loadFacultyContext('advisory')
const $ = id => document.getElementById(id)
let sections = []
let current = null // { section, students, subjects, grades }

const REQUEST_LABELS = {
  student_profile: 'Profile edit',
  student_portal_request: 'Portal request'
}

function showTab(name) {
  document.querySelectorAll('[data-advisory-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.advisoryTab === name))
  document
    .querySelectorAll('[data-advisory-panel]')
    .forEach(panel => panel.classList.toggle('hidden', panel.dataset.advisoryPanel !== name))
}
document.querySelectorAll('[data-advisory-tab]').forEach(tab => (tab.onclick = () => showTab(tab.dataset.advisoryTab)))

function renderGrades() {
  const field = $('advisory-grade-field').value
  const { students, subjects, grades } = current
  const gradeOf = new Map(grades.map(row => [`${row.student_id}|${row.subject}`, row]))
  const head = `<thead><tr><th>Student</th>${subjects.map(s => `<th>${escapeHtml(s)}</th>`).join('')}<th>Average</th></tr></thead>`
  const body = students
    .map(student => {
      const values = subjects.map(subject => gradeOf.get(`${student.student_id}|${subject}`)?.[field])
      const numbers = values.filter(value => value != null).map(Number)
      const average = numbers.length ? (numbers.reduce((sum, n) => sum + n, 0) / numbers.length).toFixed(2) : '-'
      return `<tr><td data-label="Student">${escapeHtml(lastFirst(student))}</td>${values
        .map((value, i) => `<td data-label="${escapeHtml(subjects[i])}">${value == null ? '-' : escapeHtml(value)}</td>`)
        .join('')}<td data-label="Average"><strong>${average}</strong></td></tr>`
    })
    .join('')
  $('advisory-grades').innerHTML =
    head + `<tbody>${body || `<tr><td colspan="${subjects.length + 2}">No students in this section.</td></tr>`}</tbody>`
}

async function renderAttendance(section, students) {
  const { data, error } = await fetchAll(() =>
    supabase
      .from('attendance')
      .select('attendance_id,student_id,status')
      .eq('section_id', section.section_id)
      .neq('status', 'Present')
      .order('attendance_id')
  )
  if (error) return ($('advisory-attendance').innerHTML = errorRow(4, error, 'Load attendance'))
  const counts = new Map()
  ;(data || []).forEach(row => {
    const item = counts.get(row.student_id) || { Absent: 0, Late: 0, Excused: 0 }
    item[row.status] = (item[row.status] || 0) + 1
    counts.set(row.student_id, item)
  })
  const rows = students
    .map(student => ({ student, ...(counts.get(student.student_id) || { Absent: 0, Late: 0, Excused: 0 }) }))
    .sort((a, b) => b.Absent - a.Absent || byLastName(a.student, b.student))
  $('advisory-attendance').innerHTML = `<thead><tr><th>Student</th><th>Absences</th><th>Lates</th><th>Excused</th></tr></thead><tbody>${
    rows
      .map(
        row =>
          `<tr><td data-label="Student">${escapeHtml(lastFirst(row.student))}</td><td data-label="Absences">${row.Absent ? `<strong>${row.Absent}</strong>` : 0}</td><td data-label="Lates">${row.Late}</td><td data-label="Excused">${row.Excused}</td></tr>`
      )
      .join('') || '<tr><td colspan="4">No students in this section.</td></tr>'
  }</tbody>`
}

async function renderRequests(students) {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('id,request_type,summary,reason,requester_name,status,created_at')
    .in('request_type', Object.keys(REQUEST_LABELS))
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return ($('advisory-requests').innerHTML = errorRow(5, error, 'Load requests'))
  $('advisory-requests').innerHTML =
    `<thead><tr><th>Date</th><th>Type</th><th>Request</th><th>From</th><th>Status</th></tr></thead><tbody>${
      (data || [])
        .map(
          row => `<tr>
          <td data-label="Date">${escapeHtml(formatDate(row.created_at))}</td>
          <td data-label="Type">${escapeHtml(REQUEST_LABELS[row.request_type] || row.request_type)}</td>
          <td data-label="Request">${escapeHtml(row.summary || '')}${row.reason ? `<br><small>${escapeHtml(row.reason)}</small>` : ''}</td>
          <td data-label="From">${escapeHtml(row.requester_name || '')}</td>
          <td data-label="Status"><span class="badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
        </tr>`
        )
        .join('') || `<tr><td colspan="5">No requests from the ${students.length} student(s) in this section.</td></tr>`
    }</tbody>`
}

async function loadSection() {
  const section = sections.find(item => String(item.section_id) === $('advisory-section').value)
  if (!section) return
  const [roster, schedules] = await Promise.all([
    supabase
      .from('enrollments')
      .select('student_id,status,students(student_id,first_name,last_name,lrn_number)')
      .eq('section_id', section.section_id)
      .in('status', ['active', 'completed']),
    supabase.from('subject_schedules').select('subject_id,subjects(subject_name)').eq('section_id', section.section_id)
  ])
  if (roster.error) return toast(describeError(roster.error, 'Load advisory roster'), 'error')
  const students = (roster.data || [])
    .map(row => row.students)
    .filter(Boolean)
    .sort(byLastName)
  const grades = students.length
    ? await fetchAll(() =>
        supabase
          .from('academic_history')
          .select('id,student_id,subject,first_sem_q1,first_sem_q2,second_sem_q1,second_sem_q2,final')
          .eq('school_year', section.academic_year)
          .in(
            'student_id',
            students.map(s => s.student_id)
          )
          .order('id')
      )
    : { data: [] }
  if (grades.error) toast(describeError(grades.error, 'Load grades'), 'error')
  // Timetable subjects plus every subject graded that year: a past year (or a finished semester) has no timetable rows.
  const subjects = [
    ...new Set([...(schedules.data || []).map(row => row.subjects?.subject_name), ...(grades.data || []).map(row => row.subject)].filter(Boolean))
  ].sort()
  current = { section, students, subjects, grades: grades.data || [] }
  $('advisory-summary').innerHTML =
    `<span><strong>${escapeHtml(section.section_name)}</strong> · ${escapeHtml(gradeLabel(section.grade_level))}${
      section.strand ? ` ${escapeHtml(section.strand)}` : ''
    }${section.semester ? ` · ${escapeHtml(section.semester)}` : ''}</span><span>${escapeHtml(section.academic_year)}</span><span>${students.length} student(s), ${subjects.length} subject(s)</span>`
  renderGrades()
  await Promise.all([
    renderAttendance(section, students),
    renderRequests(students),
    mountSanctions($('advisory-discipline'), { students, schoolYear: section.academic_year })
  ])
}

if (context) {
  const { data, error } = await supabase
    .from('sections')
    .select('section_id,section_name,grade_level,strand,semester,academic_year,faculty_assigned')
    .eq('academic_year', context.schoolYear)
    .ilike('faculty_assigned', context.facultyName)
    .order('section_name')
  if (error) toast(describeError(error, 'Load advisory sections'), 'error')
  sections = data || []
  if (!sections.length) {
    document
      .querySelector('main')
      .insertAdjacentHTML(
        'beforeend',
        `<p class="admin-note">You are not the adviser of any section in ${escapeHtml(context.schoolYear)}. The admin assigns advisers on Manage Sections.</p>`
      )
    document.querySelectorAll('[data-advisory-panel], .admin-filterbar, .subtabs').forEach(node => node.classList.add('hidden'))
  } else {
    $('advisory-section').innerHTML = sections
      .map(s => `<option value="${s.section_id}">${escapeHtml(s.section_name)}${s.semester ? ` (${escapeHtml(s.semester)})` : ''}</option>`)
      .join('')
    $('advisory-section').onchange = () => loadSection().catch(error => toast(describeError(error, 'Load advisory'), 'error'))
    $('advisory-grade-field').onchange = renderGrades
    await loadSection().catch(error => toast(describeError(error, 'Load advisory'), 'error'))
  }
}
