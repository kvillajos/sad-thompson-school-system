import { escapeHtml } from './html.js'
import { generalAverage, letterGrade } from './grades.js'

const SEMESTERS = [
  { key: 'first', label: '1st Semester', quarters: ['first_sem_q1', 'first_sem_q2'] },
  { key: 'second', label: '2nd Semester', quarters: ['second_sem_q1', 'second_sem_q2'] }
]

export function semesterRows(rows = []) {
  return rows.flatMap(row => SEMESTERS.map(semester => ({
    ...row,
    semester: semester.key,
    semesterLabel: semester.label,
    semesterGrade: generalAverage(semester.quarters.map(field => ({ grade: row[field] })))
  })))
}

export function semesterGroups(rows = []) {
  const groups = new Map()
  rows.forEach(row => {
    const year = String(row.school_year || '')
    if (!groups.has(year)) groups.set(year, { schoolYear: year, semesters: new Map() })
    const group = groups.get(year)
    semesterRows([row]).forEach(item => {
      if (!group.semesters.has(item.semester)) group.semesters.set(item.semester, [])
      group.semesters.get(item.semester).push(item)
    })
  })
  return [...groups.values()].sort((a, b) => b.schoolYear.localeCompare(a.schoolYear))
}

export function buildSemesterTable(rows = []) {
  const body = semesterRows(rows).map(row => `<tr><td>${escapeHtml(row.school_year)}</td><td>${row.semesterLabel}</td><td>${escapeHtml(row.subject)}</td><td>${row.first_sem_q1 ?? ''}</td><td>${row.first_sem_q2 ?? ''}</td><td>${row.second_sem_q1 ?? ''}</td><td>${row.second_sem_q2 ?? ''}</td><td>${row.semesterGrade ?? row.grade ?? ''}</td><td>${escapeHtml(row.letter_grade || letterGrade(row.semesterGrade ?? row.grade)?.letter || '')}</td><td>${escapeHtml(row.remarks || '')}</td></tr>`).join('')
  return `<table><thead><tr><th>School Year</th><th>Semester</th><th>Subject</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Grade</th><th>Letter</th><th>Remarks</th></tr></thead><tbody>${body || '<tr><td colspan="10" class="empty-state">No academic records yet.</td></tr>'}</tbody></table>`
}
