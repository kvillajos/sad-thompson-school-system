// Grade submission tracker (pure; tested by dev/scripts/checks/check-grade-tracker.mjs).
// One row per class (section + subject) taught in a quarter: how many of its students have that quarter's
// grade entered, how many rows are locked (submitted), and whether the class is late.
import { QUARTER_FIELDS } from './calendar.js'

// Whole-year subjects (semester null) run every quarter; Senior High semester subjects only in their two.
export const taughtInQuarter = (semester, quarter) => !semester || Number(semester) === (quarter <= 2 ? 1 : 2)

// schedules: [{ section_id, subject_id, faculty_name, sections: { section_name, grade_level }, subjects: { subject_name, semester } }]
// enrollments: [{ student_id, section_id }]   grades: [{ student_id, subject, <quarter fields>, locked }]
export function trackClasses({ schedules = [], enrollments = [], grades = [], quarter, deadline = null, today = '' }) {
  const field = QUARTER_FIELDS[quarter]
  const rosters = new Map()
  enrollments.forEach(row => (rosters.get(row.section_id) || rosters.set(row.section_id, []).get(row.section_id)).push(row.student_id))
  const gradeOf = new Map(grades.map(row => [`${row.student_id}|${row.subject}`, row]))
  const classes = new Map()
  for (const s of schedules) {
    const key = `${s.section_id}:${s.subject_id}`
    if (classes.has(key) || !taughtInQuarter(s.subjects?.semester, quarter)) continue
    const subject = s.subjects?.subject_name || ''
    const roster = rosters.get(s.section_id) || []
    const rows = roster.map(id => gradeOf.get(`${id}|${subject}`))
    const entered = rows.filter(row => row?.[field] != null && row[field] !== '').length
    const locked = rows.filter(row => row?.locked).length
    const total = roster.length
    const complete = total > 0 && entered === total
    const status = !total ? 'No students' : complete ? 'Complete' : entered ? 'In progress' : 'Not started'
    classes.set(key, {
      key,
      faculty: s.faculty_name || 'Unassigned',
      section: s.sections?.section_name || '',
      grade_level: s.sections?.grade_level,
      subject,
      entered,
      locked,
      total,
      status,
      late: Boolean(deadline && today > deadline && total && !complete)
    })
  }
  return [...classes.values()].sort(
    (a, b) =>
      a.faculty.localeCompare(b.faculty) ||
      (a.grade_level ?? 0) - (b.grade_level ?? 0) ||
      a.section.localeCompare(b.section) ||
      a.subject.localeCompare(b.subject)
  )
}

// Per-faculty totals for the summary line: classes complete out of classes with students.
export function facultySummary(rows) {
  const byFaculty = new Map()
  rows
    .filter(row => row.total)
    .forEach(row => {
      const item = byFaculty.get(row.faculty) || { faculty: row.faculty, classes: 0, complete: 0, late: 0 }
      item.classes++
      if (row.status === 'Complete') item.complete++
      if (row.late) item.late++
      byFaculty.set(row.faculty, item)
    })
  return [...byFaculty.values()].sort(
    (a, b) => b.late - a.late || a.complete / a.classes - b.complete / b.classes || a.faculty.localeCompare(b.faculty)
  )
}
