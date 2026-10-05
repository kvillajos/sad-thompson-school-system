import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const read = file => readFileSync(join(root, file), 'utf8')
const registrar = ['registrar.js', 'registrar-admissions.js', 'registrar-sectioning.js', 'registrar-academic.js', 'registrar-shifting.js'].map(n => 'role-registrar/' + n).map(read).join('\n')
const faculty = read('role-faculty/faculty-grades-page.js') + read('role-faculty/faculty-attendance-page.js')
const student = read('role-student/student-dashboard-page.js')
assert.match(registrar, /review_admission_application|shift_student/)
assert.match(faculty, /save_faculty_grades|save_attendance/)
assert.match(student, /academic_history|attendance_totals/)
assert.match(registrar, /buildTranscript/)
assert.match(student, /buildTranscript/)
console.log('role workflow wiring checks passed')
