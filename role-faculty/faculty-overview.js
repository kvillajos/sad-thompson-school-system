// Faculty dashboard overview: the stat strip (classes, students, today), the grade distribution of this school year's
// grades in the teacher's classes, and the class attendance rate over the last 30 days. Read-only; the same tables
// the Grades and Attendance pages read.
import { supabase } from '../shared/lib/auth-client.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { derivedGrade, letterGrade, scaleFor } from '../shared/lib/grades.js'
import { loadGradingScales } from '../shared/lib/grading-scale.js'
import { todayDay, time12 } from '../shared/ui/day-tabs.js'
import { statStrip, columnChart, lineChart } from '../shared/ui/charts.js'

const DAYS = 30
const dateValue = date => date.toISOString().slice(0, 10)
const shortDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

export async function mountFacultyOverview(host, context) {
  document.getElementById('dash-today').textContent = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  host.innerHTML = `<div data-stats></div>
    <div class="dash-grid">
      <section class="admin-table-wrap chart-card"><div class="admin-section-title"><div><h3>Grade distribution</h3><p class="chart-sub">Students per letter grade in your classes, SY ${context.schoolYear.replace('-', '–')}</p></div></div><div data-grade-chart></div></section>
      <section class="admin-table-wrap chart-card"><div class="admin-section-title"><div><h3>Class attendance</h3><p class="chart-sub">Share marked present or late, last ${DAYS} days</p></div></div><div data-attendance-chart></div></section>
    </div>`

  // Stats come straight from the context the dashboard already loaded.
  const now = new Date()
  const clock = now.toTimeString().slice(0, 8)
  const today = context.schedules.filter(item => Number(item.day_of_week) === todayDay(now))
  const next = today.find(item => item.start_time > clock)
  const students = new Set(context.enrollments.map(item => item.student_id)).size
  statStrip(host.querySelector('[data-stats]'), [
    { label: 'Classes', value: String(context.classes.length), note: `${new Set(context.schedules.map(item => item.section_id)).size} sections` },
    { label: 'Students', value: students.toLocaleString(), note: 'In your sections' },
    { label: 'Classes today', value: String(today.length), note: today.length ? `${time12(today[0].start_time)} to ${time12(today.at(-1).end_time)}` : 'No classes today' },
    {
      label: 'Next class',
      value: next ? time12(next.start_time) : '–',
      note: next ? `${next.subjects?.subject_name || ''} · ${next.sections?.section_name || ''}${next.room ? ` · ${next.room}` : ''}` : 'Nothing else today'
    }
  ])

  const gradeHost = host.querySelector('[data-grade-chart]')
  const attendanceHost = host.querySelector('[data-attendance-chart]')
  if (!context.classes.length) {
    gradeHost.textContent = attendanceHost.textContent = 'Charts appear once classes are assigned to you.'
    return
  }

  // Only grades and attendance for the classes this teacher has: (section, subject) pairs from the timetable.
  const studentSection = new Map(context.enrollments.map(item => [String(item.student_id), item.section_id]))
  const taught = new Set(context.classes.map(item => `${item.section_id}:${item.subject_name}`))
  const taughtIds = new Set(context.classes.map(item => `${item.section_id}:${item.subject_id}`))
  const since = new Date(now)
  since.setDate(since.getDate() - DAYS)
  const [, grades, attendance] = await Promise.all([
    loadGradingScales(),
    studentSection.size
      ? fetchAll(() =>
          supabase
            .from('academic_history')
            .select('id,student_id,subject,grade,final,midterm,first_sem_q1,first_sem_q2,second_sem_q1,second_sem_q2')
            .eq('school_year', context.schoolYear)
            .in('student_id', [...studentSection.keys()])
            .in('subject', [...new Set(context.classes.map(item => item.subject_name))])
            .order('id')
        )
      : { data: [] },
    fetchAll(() =>
      supabase
        .from('attendance')
        .select('attendance_id,attendance_date,status,section_id,subject_id')
        .in('section_id', [...new Set(context.classes.map(item => item.section_id))])
        .in('subject_id', [...new Set(context.classes.map(item => item.subject_id))])
        .gte('attendance_date', dateValue(since))
        .order('attendance_id')
    )
  ])

  if (grades.error) gradeHost.textContent = 'Could not load grades. Refresh to try again.'
  else {
    const counts = new Map(scaleFor(context.schoolYear).map(band => [band.letter, 0]))
    grades.data
      .filter(record => taught.has(`${studentSection.get(String(record.student_id))}:${record.subject}`))
      .forEach(record => {
        const letter = letterGrade(record.grade ?? derivedGrade(record), context.schoolYear)?.letter
        if (letter && counts.has(letter)) counts.set(letter, counts.get(letter) + 1)
      })
    columnChart(
      gradeHost,
      [...counts].map(([label, value]) => ({ label, value })),
      { emptyText: 'No grades entered for this school year yet.' }
    )
  }

  if (attendance.error) attendanceHost.textContent = 'Could not load attendance. Refresh to try again.'
  else {
    const days = new Map()
    attendance.data
      .filter(row => taughtIds.has(`${row.section_id}:${row.subject_id}`))
      .forEach(row => {
        const day = days.get(row.attendance_date) || { present: 0, total: 0 }
        day.total++
        if (row.status === 'Present' || row.status === 'Late') day.present++
        days.set(row.attendance_date, day)
      })
    const points = [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, day]) => ({ label: shortDate(date), value: Math.round((day.present / day.total) * 100) }))
    // Rates sit near 100%, so the scale starts a step below the lowest day instead of at zero (the axis says so).
    const min = Math.max(0, Math.floor((Math.min(...points.map(point => point.value), 100) - 10) / 10) * 10)
    lineChart(attendanceHost, points, {
      min,
      max: 100,
      ticks: [min, Math.round((min + 100) / 2), 100],
      format: value => `${value}%`,
      label: 'Class attendance rate',
      emptyText: `No attendance taken in the last ${DAYS} days.`
    })
  }
}
