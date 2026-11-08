// Pure helpers for the editable grade upload grid (role-faculty/faculty-grades-upload.js).
// Same contract as grades.js: no app imports, so dev/scripts/checks/check-grade-grid.mjs can assert it in Node.
// A grid row is validated exactly like a CSV row (same messages as parseGradeCsv) plus a per-field map, so the
// grid can highlight the one cell that is wrong instead of only listing the problem at the end of the row.
import { SCORE_FIELDS, derivedGrade, gradeRecord, letterGrade, scaleFor } from './grades.js'

// Columns the teacher can edit. Midterm stays out of the grid (the template has no midterm column), but a value
// that arrives in the CSV is still validated and saved untouched.
export const GRID_SCORE_FIELDS = ['first_sem_q1', 'first_sem_q2', 'second_sem_q1', 'second_sem_q2', 'final']

const isBlank = value => value === undefined || value === null || String(value).trim() === ''

// Letters the school year's grading scale allows (A-F by default).
export function scaleLetters(schoolYear) {
  const bands = Array.isArray(schoolYear) ? schoolYear : scaleFor(schoolYear)
  return bands.map(band => band.letter)
}

// Raw cell text for one student -> { record, errors, fieldErrors, grade, letter }.
//   errors      same strings parseGradeCsv produces, in the same order, for the "Errors" column
//   fieldErrors { first_sem_q1: 'Whole number 0-100', letter_grade: '...' } for highlighting single cells
//   record      the save_faculty_grades() payload entry, or null while the row is not saveable
export function validateGridRow(studentId, values = {}, schoolYear) {
  const errors = []
  const fieldErrors = {}
  SCORE_FIELDS.forEach(field => {
    if (isBlank(values[field])) return
    const number = Number(String(values[field]).trim())
    if (!Number.isInteger(number) || number < 0 || number > 100) {
      errors.push(`${field} must be a whole number from 0 to 100`)
      fieldErrors[field] = 'Whole number from 0 to 100'
    }
  })

  const letters = scaleLetters(schoolYear)
  const typedLetter = String(values.letter_grade ?? '')
    .trim()
    .toUpperCase()
  if (typedLetter && !letters.includes(typedLetter)) {
    errors.push(`letter_grade must be one of ${letters.join(', ')}`)
    fieldErrors.letter_grade = `Use ${letters.join(', ')}`
  }

  const clean = { ...values, letter_grade: letters.includes(typedLetter) ? typedLetter : '' }
  // A bad score must not silently become a blank one (gradeRecord drops unreadable text), so build the record
  // only from the cells that passed validation.
  SCORE_FIELDS.forEach(field => {
    if (fieldErrors[field]) clean[field] = ''
  })
  let record = gradeRecord(studentId, clean)
  const hasBadScore = SCORE_FIELDS.some(field => fieldErrors[field])
  if (!record && !hasBadScore) errors.push('no scores were provided')
  let grade = null
  let letter = null
  if (record) {
    grade = derivedGrade(record)
    if (grade == null && !hasBadScore) errors.push('needs at least one score')
    letter = record.letter_grade || letterGrade(grade, schoolYear)?.letter || null
    if (!record.letter_grade) record.letter_grade = letter
  }
  // Letter grades are derived from the scores, so a row with no usable score has no letter yet.
  if (!letter && !fieldErrors.letter_grade && (record || !hasBadScore)) fieldErrors.letter_grade = 'No letter grade yet: enter a score'
  if (hasBadScore || errors.length) record = null
  return { record, errors, fieldErrors, grade, letter }
}
