// Faculty grade sheet helpers: which classes a faculty member can grade, and how one row of
// scores becomes the academic_history payload. Pure on purpose (no app imports) so
// dev/scripts/checks/check-faculty-grades.mjs can assert it in Node.

export const SCORE_FIELDS = ['first_sem_q1', 'first_sem_q2', 'second_sem_q1', 'second_sem_q2', 'midterm', 'final']
export const ACADEMIC_LABELS = {
  first_sem_q1: 'Q1',
  first_sem_q2: 'Q2',
  second_sem_q1: 'Q3',
  second_sem_q2: 'Q4',
  midterm: 'Midterm',
  final: 'Final'
}
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
      semester: schedule.subjects?.semester ?? null,
      label: `${schedule.sections?.section_name || 'Section'} - ${schedule.subjects?.subject_name || 'Subject'}`
    })
  })
  return [...options.values()]
}

// DepEd bands, highest first; the last band starts at 0. 75 is the passing mark batch_promote_students()
// enforces. Admins set each school year's scale on Manage Subjects (table grading_scales, migration v44);
// a year with no saved scale uses this one. Same shape as grading_scales.bands.
export const DEFAULT_GRADING_SCALE = [
  { min: 90, letter: 'A', descriptor: 'Outstanding' },
  { min: 85, letter: 'B', descriptor: 'Very Satisfactory' },
  { min: 80, letter: 'C', descriptor: 'Satisfactory' },
  { min: 75, letter: 'D', descriptor: 'Fairly Satisfactory' },
  { min: 0, letter: 'F', descriptor: 'Did Not Meet Expectations' }
]
export const PASSING_GRADE = 75

// Saved scales by school year, filled once per page by loadGradingScales() (shared/lib/grading-scale.js).
const scales = new Map()
export function setGradingScales(rows = []) {
  scales.clear()
  rows.forEach(row => Array.isArray(row?.bands) && row.bands.length && scales.set(row.school_year, row.bands))
}
export const scaleFor = year => scales.get(String(year ?? '')) || DEFAULT_GRADING_SCALE

// The band a numeric score falls in, or null when there is no score to grade yet. The second argument is a
// school year (its saved scale) or a bands array; without it the default DepEd scale is used.
export function letterGrade(value, scaleOrYear) {
  const score = Number(value)
  if (value == null || value === '' || !Number.isFinite(score)) return null
  const bands = Array.isArray(scaleOrYear) ? scaleOrYear : scaleFor(scaleOrYear)
  return bands.find(band => score >= band.min) || bands[bands.length - 1] || null
}

// The single source of truth for Story 45: the mean of a student's stored subject grades
// for one school year. Matches student_general_average (dev/database/backupsqlmigration.sql).
export function generalAverage(records = []) {
  const grades = records.map(record => record.grade).filter(value => value != null && Number.isFinite(Number(value)))
  if (!grades.length) return null
  const average = grades.reduce((total, value) => total + Number(value), 0) / grades.length
  return Math.round(average * 100) / 100
}

const score = value => {
  const text = String(value ?? '').trim()
  if (text === '') return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

// The value promotion, transcripts and the registrar card read. Mirrors save_faculty_grades():
// final, else the average of all four quarters, else midterm, else the average of the quarters entered so far
// (so a teacher can save Q1 alone mid-year). The RPC stays the authority.
export function derivedGrade(record) {
  if (record.final != null) return record.final
  const quarters = [record.first_sem_q1, record.first_sem_q2, record.second_sem_q1, record.second_sem_q2]
  if (quarters.every(value => value != null)) {
    const average = quarters.reduce((total, value) => total + value, 0) / 4
    return Math.round(average * 100) / 100
  }
  if (record.midterm != null) return record.midterm
  const entered = quarters.filter(value => value != null)
  if (!entered.length) return null
  return Math.round((entered.reduce((total, value) => total + value, 0) / entered.length) * 100) / 100
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
export function parseGradeCsv(text, schoolYear) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '')
  if (!lines.length) return []
  const header = lines[0].split(',').map(cell => cell.trim().toLowerCase())
  return lines.slice(1).map((line, index) => {
    const cells = line.split(',')
    const values = {}
    header.forEach((key, position) => {
      values[key] = (cells[position] ?? '').trim()
    })
    const studentId = values.student_id
    const errors = []
    if (!studentId || !Number.isFinite(Number(studentId))) errors.push('student_id is required and must be a number')
    // gradeRecord() turns unreadable text into "blank", so a typo like "8O" would silently drop the score.
    SCORE_FIELDS.forEach(field => {
      if (values[field] === undefined || values[field] === '') return
      const number = Number(values[field])
      if (!Number.isInteger(number) || number < 0 || number > 100) errors.push(`${field} must be a whole number from 0 to 100`)
    })
    const record = studentId && Number.isFinite(Number(studentId)) ? gradeRecord(studentId, values) : null
    if (studentId && Number.isFinite(Number(studentId)) && !record) errors.push('no scores were provided')
    if (record && derivedGrade(record) == null) errors.push('needs at least one score')
    // Same default the grade sheet fills in, so uploaded and hand-entered grades both carry a letter.
    if (record && !record.letter_grade) record.letter_grade = letterGrade(derivedGrade(record), schoolYear)?.letter ?? null
    return { row: index + 2, student_id: studentId, name: values.student_name || '', record, errors }
  })
}
