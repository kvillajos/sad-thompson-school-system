import { escapeHtml } from './html.js'
import { ACADEMIC_LABELS, SCORE_FIELDS, generalAverage, letterGrade } from './grades.js'

const SEMESTERS = [
  { key: 'first', label: '1st Semester', quarters: ['first_sem_q1', 'first_sem_q2'] },
  { key: 'second', label: '2nd Semester', quarters: ['second_sem_q1', 'second_sem_q2'] }
]

export function semesterRows(rows = []) {
  return rows.flatMap(row =>
    SEMESTERS.map(semester => ({
      ...row,
      semester: semester.key,
      semesterLabel: semester.label,
      semesterGrade: generalAverage(semester.quarters.map(field => ({ grade: row[field] })))
    }))
  )
}

export function semesterGroups(rows = []) {
  const groups = new Map()
  rows.forEach(row => {
    const year = String(row.school_year || '')
    if (!groups.has(year)) groups.set(year, { schoolYear: year, semesters: new Map() })
    const group = groups.get(year)
    // A semester with no quarter scores yet (the 2nd semester in October) is left out, so it cannot repeat the
    // 1st semester's grade; a record with no quarter scores at all (grade only) is listed once, under the 1st.
    const items = semesterRows([row])
    const scored = items.filter(item => item.semesterGrade != null)
    ;(scored.length ? scored : items.slice(0, 1)).forEach(item => {
      if (!group.semesters.has(item.semester)) group.semesters.set(item.semester, [])
      group.semesters.get(item.semester).push(item)
    })
  })
  return [...groups.values()].sort((a, b) => b.schoolYear.localeCompare(a.schoolYear))
}

// mode 'flat' shows the raw quarter/midterm/final fields in one row per subject-year (the
// official record card); the default 'semester' mode splits each subject-year into two rows,
// one per semester, showing that semester's own general average.
export function buildSemesterTable(rows = [], { flat = false, semester = '' } = {}) {
  if (flat) {
    const labels = ['School Year', 'Subject', ...SCORE_FIELDS.map(key => ACADEMIC_LABELS[key]), 'Grade', 'Letter Grade', 'Remarks']
    const head = `<tr>${labels.map(label => `<th>${label}</th>`).join('')}</tr>`
    const body = rows
      .map(
        record =>
          `<tr><td data-label="${labels[0]}">${escapeHtml(record.school_year)}</td><td data-label="${labels[1]}">${escapeHtml(record.subject)}</td>${SCORE_FIELDS.map((key, index) => `<td data-label="${labels[index + 2]}">${record[key] ?? ''}</td>`).join('')}<td data-label="Grade">${record.grade ?? ''}</td><td data-label="Letter Grade">${escapeHtml(record.letter_grade || '')}</td><td data-label="Remarks">${escapeHtml(record.remarks || '')}</td></tr>`
      )
      .join('')
    return `<table><thead>${head}</thead><tbody>${body || `<tr><td colspan="${SCORE_FIELDS.length + 5}" class="empty-state">No academic records yet.</td></tr>`}</tbody></table>`
  }
  const labels = ['School Year', 'Semester', 'Subject', 'Q1', 'Q2', 'Q3', 'Q4', 'Grade', 'Letter Grade', 'Remarks']
  const body = semesterRows(rows)
    .filter(row => !semester || row.semester === semester)
    .map(
      row =>
        `<tr><td data-label="${labels[0]}">${escapeHtml(row.school_year)}</td><td data-label="${labels[1]}">${row.semesterLabel}</td><td data-label="${labels[2]}">${escapeHtml(row.subject)}</td><td data-label="Q1">${row.first_sem_q1 ?? ''}</td><td data-label="Q2">${row.first_sem_q2 ?? ''}</td><td data-label="Q3">${row.second_sem_q1 ?? ''}</td><td data-label="Q4">${row.second_sem_q2 ?? ''}</td><td data-label="Grade">${row.semesterGrade ?? row.grade ?? ''}</td><td data-label="Letter Grade">${escapeHtml(row.letter_grade || letterGrade(row.semesterGrade ?? row.grade)?.letter || '')}</td><td data-label="Remarks">${escapeHtml(row.remarks || '')}</td></tr>`
    )
    .join('')
  return `<table><thead><tr>${labels.map(label => `<th>${label}</th>`).join('')}</tr></thead><tbody>${body || '<tr><td colspan="10" class="empty-state">No academic records yet.</td></tr>'}</tbody></table>`
}
