// Student dashboard overview: general average, attendance and today's classes as stat tiles, and this year's subject
// grades against the passing mark. Everything comes from what the dashboard already loaded; no extra queries.
import { generalAverage, letterGrade, PASSING_GRADE } from '../shared/lib/grades.js'
import { todayDay, time12 } from '../shared/ui/day-tabs.js'
import { statStrip, dotPlot } from '../shared/ui/charts.js'

export function mountStudentOverview(statsHost, chartHost, { gradeRows, scheduleRows, schoolYear, attendance }) {
  document.getElementById('dash-today').textContent = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  document.getElementById('dash-request-edit').onclick = () => document.getElementById('open-edit-request').click()

  // This school year's grades, or the latest year that has any (e.g. before the first quarter is graded).
  const years = [...new Set(gradeRows.map(row => row.school_year))].sort().reverse()
  const year = gradeRows.some(row => row.school_year === schoolYear && row.grade != null) ? schoolYear : years[0]
  const rows = gradeRows.filter(row => row.school_year === year && row.grade != null)
  const average = generalAverage(rows)
  const band = letterGrade(average, year)

  const clock = new Date().toTimeString().slice(0, 8)
  const today = scheduleRows.filter(item => Number(item.day_of_week) === todayDay())
  const next = today.find(item => item.start_time > clock)

  const absences = Number(attendance?.totals?.absent) || 0
  const schoolDays = attendance?.schoolDaysTotal
  statStrip(statsHost, [
    {
      label: 'General average',
      value: average == null ? '–' : String(average),
      note: average == null ? 'No grades yet' : `${band ? `${band.letter} · ${band.descriptor}` : ''}${year === schoolYear ? '' : ` · SY ${year}`}`
    },
    {
      label: 'Attendance',
      value: schoolDays ? `${schoolDays - absences} of ${schoolDays}` : attendance?.totals?.total ? `${absences}` : '–',
      note: schoolDays ? `Days present · ${absences} absent` : attendance?.totals?.total ? 'Absences this year' : 'Nothing recorded yet'
    },
    { label: 'Classes today', value: String(today.length), note: next ? `Next: ${next.subjects?.subject_name || ''} at ${time12(next.start_time)}` : today.length ? 'No more classes today' : 'No classes today' }
  ])

  chartHost.querySelector('h3').textContent = !year || year === schoolYear ? 'My grades this year' : 'My latest grades'
  chartHost.querySelector('.chart-sub').textContent = year
    ? `Final or running grade per subject, SY ${year.replace('-', '–')}. The line marks the passing grade (${PASSING_GRADE}).`
    : 'Your subject grades appear here once teachers enter them.'
  dotPlot(
    chartHost.querySelector('[data-chart]'),
    rows.map(row => ({ label: row.subject, value: Number(row.grade) })).sort((a, b) => b.value - a.value),
    { min: 60, max: 100, mark: PASSING_GRADE, markLabel: `Passing ${PASSING_GRADE}`, emptyText: 'No grades entered yet.' }
  )
}
