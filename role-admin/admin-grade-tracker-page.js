import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml, errorRow, gradeLabel, longDate } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { fillYearSelect, todayManila } from '../shared/lib/school-years.js'
import { currentGradingQuarter } from '../shared/lib/calendar.js'
import { facultySummary, trackClasses } from '../shared/lib/grade-tracker.js'
import { mountAdminShell } from './admin-page.js'

await mountAdminShell('grade-tracker')

const $ = id => document.getElementById(id)
let data = null // loaded rows for the chosen year
let quarters = []
let rows = []

const badge = row =>
  row.late
    ? '<span class="badge rejected">Late</span>'
    : `<span class="badge ${row.status === 'Complete' ? 'completed' : row.status === 'No students' ? '' : 'pending'}">${escapeHtml(row.status)}</span>`

async function loadYear() {
  const year = $('tracker-year').value
  $('tracker-classes').innerHTML = '<tr><td colspan="6">Loading…</td></tr>'
  const [schedules, enrollments, grades, quarterRows] = await Promise.all([
    fetchAll(() =>
      supabase
        .from('subject_schedules')
        .select(
          'schedule_id,section_id,subject_id,faculty_name,sections!inner(section_name,grade_level,academic_year),subjects(subject_name,semester)'
        )
        .eq('sections.academic_year', year)
        .order('schedule_id')
    ),
    fetchAll(() =>
      supabase
        .from('enrollments')
        .select('id,student_id,section_id')
        .eq('school_year', year)
        .in('status', ['active', 'completed'])
        .order('id')
    ),
    fetchAll(() =>
      supabase
        .from('academic_history')
        .select('id,student_id,subject,first_sem_q1,first_sem_q2,second_sem_q1,second_sem_q2,locked')
        .eq('school_year', year)
        .order('id')
    ),
    supabase.from('school_quarters').select('quarter,start_date,end_date,grade_deadline').eq('school_year', year).order('quarter')
  ])
  const failed = [schedules, enrollments, grades].find(result => result.error)
  if (failed) return ($('tracker-classes').innerHTML = errorRow(6, failed.error, 'Load grade progress'))
  data = { schedules: schedules.data, enrollments: enrollments.data, grades: grades.data }
  quarters = quarterRows.data || []
  const due = currentGradingQuarter(quarters, todayManila())
  if (due) $('tracker-quarter').value = String(due.quarter)
  render()
}

function render() {
  if (!data) return
  const quarter = Number($('tracker-quarter').value)
  const deadline = quarters.find(q => q.quarter === quarter)?.grade_deadline || null
  rows = trackClasses({ ...data, quarter, deadline, today: todayManila() })
  const withStudents = rows.filter(row => row.total)
  const complete = withStudents.filter(row => row.status === 'Complete').length
  const late = withStudents.filter(row => row.late).length
  $('tracker-summary').innerHTML = `<span>Q${quarter} deadline: <strong>${deadline ? escapeHtml(longDate(deadline)) : 'not set'}</strong>${
    deadline ? '' : ' (set it on <a href="/role-admin/admin-year-setup.html?tab=calendar">School Years → Calendar</a>)'
  }</span><span><strong>${complete}</strong> of ${withStudents.length} classes complete</span>${late ? `<span class="badge rejected">${late} late</span>` : ''}`

  $('tracker-faculty').innerHTML =
    facultySummary(rows)
      .map(
        item =>
          `<tr><td data-label="Faculty">${escapeHtml(item.faculty)}</td><td data-label="Classes complete">${item.complete} of ${item.classes}</td><td data-label="Late">${
            item.late ? `<span class="badge rejected">${item.late}</span>` : '0'
          }</td></tr>`
      )
      .join('') || '<tr><td colspan="3">No classes this quarter.</td></tr>'

  const show = $('tracker-show').value
  const search = $('tracker-search').value.trim().toLowerCase()
  const visible = rows
    .filter(row => show === 'all' || (show === 'late' ? row.late : row.total && row.status !== 'Complete'))
    .filter(row => !search || `${row.faculty} ${row.section} ${row.subject}`.toLowerCase().includes(search))
  $('tracker-classes').innerHTML =
    visible
      .map(
        row => `<tr>
          <td data-label="Faculty">${escapeHtml(row.faculty)}</td>
          <td data-label="Section">${escapeHtml(row.section)} <small>(${escapeHtml(gradeLabel(row.grade_level))})</small></td>
          <td data-label="Subject">${escapeHtml(row.subject)}</td>
          <td data-label="Grades entered" class="tracker-cell">${row.entered} / ${row.total}</td>
          <td data-label="Submitted (locked)" class="tracker-cell">${row.locked} / ${row.total}</td>
          <td data-label="Status">${badge(row)}</td>
        </tr>`
      )
      .join('') ||
    `<tr><td colspan="6">${show === 'all' ? 'No classes this quarter.' : 'Nothing outstanding. Every class is complete.'}</td></tr>`
}

$('tracker-year').onchange = () => loadYear().catch(error => toast(describeError(error, 'Load grade progress'), 'error'))
$('tracker-quarter').onchange = render
$('tracker-show').onchange = render
$('tracker-search').oninput = render
try {
  await fillYearSelect($('tracker-year'))
  await loadYear()
} catch (error) {
  toast(describeError(error, 'Load grade progress'), 'error')
}
hideLoadingScreen()
