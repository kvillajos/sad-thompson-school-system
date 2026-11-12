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
// Last table row with the year's general average and its letter; `before` columns are merged under the label.
export function generalAverageRow(before, average, schoolYear, label = 'General Average') {
  return `<tr class="average-row" data-pin-bottom><td colspan="${before}" data-label="${label}"><strong>${label}</strong></td><td data-label="Grade"><strong>${average ?? '-'}</strong></td><td data-label="Letter Grade">${escapeHtml(letterGrade(average, schoolYear)?.letter || '-')}</td><td></td></tr>`
}

// Dashed navy guide lines framing the quarters: before Q1, between Q2 and Q3 (the semester break), after Q4.
const QUARTER_EDGE = [' class="q-line-start"', '', ' class="q-line-start sem-break"', ' class="q-line-end"']

// Letter grade as a pill coloured by band (A/B green, C blue, D amber, anything lower red); reuses .badge colours.
const LETTER_BADGE = { A: 'completed', B: 'completed', C: 'grade-c', D: 'pending' }
const letterBadge = letter =>
  letter ? `<span class="badge grade-letter ${LETTER_BADGE[String(letter)[0].toUpperCase()] || 'rejected'}">${escapeHtml(letter)}</span>` : ''

// average: when given (even null), a General Average row is added under the subject rows.
// Default layout: one row per subject and year, Q1-Q4 then the year grade; a thicker line between Q2 and Q3 marks
// the semester break (class sem-break). Senior High semester subjects simply leave the other semester blank.
// polished (student History): numbers centred, letter as a badge, a faint dash for quarters not graded yet, and
// the Remarks column only when some subject has a remark.
// teacherOf(row): first two columns become Subject and Teacher instead of School Year and Subject (student Grades).
// gradeLabel: header of the year grade column ('Final Grade' on the student Grades page).
export function buildSemesterTable(rows = [], { flat = false, average, schoolYear = '', polished = false, teacherOf = null, gradeLabel = 'Grade' } = {}) {
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
  const quarters = SEMESTERS.flatMap(item => item.quarters)
  const remarks = !polished || rows.some(row => String(row.remarks || '').trim())
  const columns = 8 + (remarks ? 1 : 0)
  const empty = polished ? '<span class="grade-empty">-</span>' : ''
  const letterOf = (grade, year, stored) => stored || letterGrade(grade, year)?.letter || ''
  const letterCell = letter => (polished ? letterBadge(letter) : escapeHtml(letter))
  const lead = teacherOf
    ? ['Subject', 'Teacher'].map(label => `<th>${label}</th>`).join('')
    : '<th>School Year</th><th>Subject</th>'
  const leadCells = row =>
    teacherOf
      ? `<td data-label="Subject">${escapeHtml(row.subject)}</td><td data-label="Teacher">${escapeHtml(teacherOf(row) || '-')}</td>`
      : `<td data-label="School Year">${escapeHtml(row.school_year)}</td><td data-label="Subject">${escapeHtml(row.subject)}</td>`
  const head = `<tr>${lead}${quarters.map((_, index) => `<th${QUARTER_EDGE[index]}>Q${index + 1}</th>`).join('')}<th>${gradeLabel}</th><th>Letter Grade</th>${remarks ? '<th>Remarks</th>' : ''}</tr>`
  const body = rows
    .map(
      row =>
        `<tr>${leadCells(row)}${quarters
          .map((field, index) => `<td data-label="Q${index + 1}"${QUARTER_EDGE[index]}>${row[field] ?? empty}</td>`)
          .join('')}<td data-label="Grade">${polished && row.grade != null ? `<strong>${row.grade}</strong>` : row.grade ?? empty}</td><td data-label="Letter Grade">${letterCell(letterOf(row.grade, row.school_year, row.letter_grade))}</td>${
          remarks ? `<td data-label="Remarks">${escapeHtml(row.remarks || '')}</td>` : ''
        }</tr>`
    )
    .join('')
  const averageFooter = polished
    ? `<tr class="average-row" data-pin-bottom><td colspan="2" data-label="General Average"><strong>General Average</strong></td>${quarters
        .map((field, index) => {
          // Each quarter's own average across the subjects graded in it; a dash while nothing is graded yet.
          const value = generalAverage(rows.map(row => ({ grade: row[field] })))
          return `<td data-label="Q${index + 1} Average"${QUARTER_EDGE[index]}>${value == null ? empty : `<strong>${value}</strong>`}</td>`
        })
        .join('')}<td data-label="Grade"><strong>${average ?? '-'}</strong></td><td data-label="Letter Grade">${letterBadge(letterGrade(average, schoolYear)?.letter) || '-'}</td>${remarks ? '<td></td>' : ''}</tr>`
    : generalAverageRow(6, average, schoolYear)
  const footer = body && average !== undefined ? averageFooter : ''
  return `<table${polished ? ' class="grade-history-table"' : ''}><thead>${head}</thead><tbody>${body ? body + footer : `<tr><td colspan="${columns}" class="empty-state">No academic records yet.</td></tr>`}</tbody></table>`
}
