import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = file => readFileSync(join(root, file), 'utf8')
const registrar = read('registrar.js')
const faculty = read('faculty/faculty-grades-page.js') + read('faculty/faculty-attendance-page.js')
const student = read('student-dashboard.html')
assert.match(registrar, /review_admission_application|shift_student/)
assert.match(faculty, /save_faculty_grades|save_attendance/)
assert.match(student, /academic_history|attendance_totals/)
assert.match(registrar, /buildTranscript/)
assert.match(student, /buildTranscript/)
console.log('role workflow wiring checks passed')
