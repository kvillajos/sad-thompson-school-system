// Faculty grade sheet helpers: which classes a faculty member can grade, and how one row of
// scores becomes the academic_history payload. Pure on purpose (no app imports) so
// scripts/check-faculty-grades.mjs can assert it in Node.

export const SCORE_FIELDS = ['first_sem_q1', 'first_sem_q2', 'second_sem_q1', 'second_sem_q2', 'midterm', 'final']
export const ACADEMIC_LABELS = { first_sem_q1: 'Q1', first_sem_q2: 'Q2', second_sem_q1: 'Q3', second_sem_q2: 'Q4', midterm: 'Midterm', final: 'Final' }
const TEXT_FIELDS = ['letter_grade', 'remarks']

// The school year runs June to May, so January to May still belongs to the year that began
// the previous June.
export function currentSchoolYear(now = new Date()) {
  const year = now.getFullYear()
  return now.getMonth() + 1 >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

// One grade sheet per section + subject, even when the timetable repeats across weekdays.
export function classOptions(schedules = []) {
  const options = new Map()
  schedules.forEach(schedule => {
    const key = `${schedule.section_id}:${schedule.subject_id}`
    if (options.has(key)) return
    options.set(key, {
      key,
      section_id: Number(schedule.section_id),
      subject_id: Number(schedule.subject_id),
      subject_name: schedule.subjects?.subject_name || '',
      label: `${schedule.sections?.section_name || 'Section'} - ${schedule.subjects?.subject_name || 'Subject'}`
    })
  })
  return [...options.values()]
}

// DepEd-style letter bands, cross-checked against the 75 passing mark batch_promote_students()
// already enforces (database/backupsqlmigration.sql). One table so the grade sheet, the GPA
// engine and the report card can never disagree; change the bands here and every reader follows.
const LETTER_GRADE_SCALE = [
  { min: 97, letter: 'A+', descriptor: 'Outstanding' },
  { min: 92, letter: 'A', descriptor: 'Very Satisfactory' },
  { min: 87, letter: 'B+', descriptor: 'Satisfactory' },
  { min: 82, letter: 'B', descriptor: 'Satisfactory' },
  { min: 78, letter: 'C+', descriptor: 'Fairly Satisfactory' },
  { min: 75, letter: 'C', descriptor: 'Fairly Satisfactory' },
  { min: -Infinity, letter: 'F', descriptor: 'Did Not Meet Expectations' }
]

// The band a numeric score falls in, or null when there is no score to grade yet.
export function letterGrade(value) {
  const score = Number(value)
  if (value == null || !Number.isFinite(score)) return null
  return LETTER_GRADE_SCALE.find(band => score >= band.min) || null
}

// The single source of truth for Story 45: the mean of a student's stored subject grades
// for one school year. Matches student_general_average (database/backupsqlmigration.sql).
export function generalAverage(records = []) {
  const grades = records.map(record => record.grade).filter(value => value != null && Number.isFinite(Number(value)))
  if (!grades.length) return null
  const average = grades.reduce((total, value) => total + Number(value), 0) / grades.length
  return Math.round(average * 100) / 100
}

const score = (value) => {
  const text = String(value ?? '').trim()
  if (text === '') return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

// The value promotion, transcripts and the registrar card read. Mirrors save_faculty_grades():
// final, else the average of all four quarters, else midterm. The RPC stays the authority.
export function derivedGrade(record) {
  if (record.final != null) return record.final
  const quarters = [record.first_sem_q1, record.first_sem_q2, record.second_sem_q1, record.second_sem_q2]
  if (quarters.every(value => value != null)) {
    const average = quarters.reduce((total, value) => total + value, 0) / 4
    return Math.round(average * 100) / 100
  }
  return record.midterm ?? null
}

// One sheet row to one RPC record; null when the row was left untouched, so a class can be
// saved with only the students the faculty actually graded.
export function gradeRecord(studentId, values = {}) {
  const record = { student_id: Number(studentId) }
  let filled = false
  SCORE_FIELDS.forEach(field => {
    record[field] = score(values[field])
    if (record[field] != null) filled = true
  })
  TEXT_FIELDS.forEach(field => {
    const text = String(values[field] ?? '').trim()
    record[field] = text === '' ? null : text
    if (record[field] != null) filled = true
  })
  return filled ? record : null
}

// CSV bulk upload: one row per student, header names matching gradeRecord()'s fields
// (student_id, first_sem_q1, first_sem_q2, second_sem_q1, second_sem_q2, midterm, final,
// letter_grade, remarks). Reuses gradeRecord/derivedGrade so a CSV row is validated exactly
// like a hand-entered one; the preview table renders each row's errors, so Save stays
// blocked until every row is fixed instead of guessing at the bad ones.
export function parseGradeCsv(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(line => line !== '')
  if (!lines.length) return []
  const header = lines[0].split(',').map(cell => cell.trim().toLowerCase())
  return lines.slice(1).map((line, index) => {
    const cells = line.split(',')
    const values = {}
    header.forEach((key, position) => { values[key] = (cells[position] ?? '').trim() })
    const studentId = values.student_id
    const errors = []
    if (!studentId || !Number.isFinite(Number(studentId))) errors.push('student_id is required and must be a number')
    const record = studentId && Number.isFinite(Number(studentId)) ? gradeRecord(studentId, values) : null
    if (studentId && Number.isFinite(Number(studentId)) && !record) errors.push('no scores were provided')
    if (record && derivedGrade(record) == null) errors.push('needs a Final, a Midterm, or all four quarter scores')
    return { row: index + 2, student_id: studentId, record, errors }
  })
}