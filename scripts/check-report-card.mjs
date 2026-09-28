// Runnable checks for the report card builder: npm run check:report-card
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildReportCard } from '../report-card.js'

const html = buildReportCard({
  student: { first_name: 'Ana', last_name: 'Santos', lrn_number: 'TCS-26-00001' },
  gradeLevel: 'Grade 5',
  schoolYear: '2026-2027',
  sectionName: 'St. Mark',
  academicRows: [
    { subject: 'Mathematics', grade: 88, letter_grade: null, final: 88, first_sem_q1: 86, first_sem_q2: 87, second_sem_q1: 89, second_sem_q2: 90 },
    { subject: 'Science', grade: 92, letter_grade: 'A' }
  ],
  attendance: { present: 45, late: 2, absent: 1, excused: 0, total: 48 },
  remarks: 'Keep up the good work'
})

assert.ok(html.includes('Ana Santos'), 'student name must appear')
assert.ok(html.includes('Grade 5'), 'grade level must appear')
assert.ok(html.includes('St. Mark'), 'section name must appear')
assert.ok(html.includes('Mathematics') && html.includes('Science'), 'every subject row must appear')
assert.ok(html.includes('90'), 'general average (88+92)/2=90 must appear')
assert.ok(['86', '87', '89'].every(q => html.includes(`>${q}<`)), 'quarter grades (stored as first_sem_q1..second_sem_q2) must fill the Quarter 1-4 columns')
assert.ok(html.includes('45/48 present'), 'attendance summary must appear')
assert.ok(html.includes('Keep up the good work'), 'remarks must appear')
assert.ok(html.includes('Class Adviser') && html.includes('Parent / Guardian') && html.includes('School Principal'), 'signature block must appear')

// MATATAG renamed EsP: GMRC (Grades 1-6) and Values Education (Grades 7-10) fill the same row under their own name.
const matatag = buildReportCard({ student: { first_name: 'Ana', last_name: 'Santos' }, gradeLevel: 'Grade 4', schoolYear: '2025-2026', academicRows: [{ subject: 'Good Manners and Right Conduct (GMRC)', grade: 91 }] })
assert.ok(matatag.includes('Good Manners and Right Conduct (GMRC)') && matatag.includes('91'), 'a GMRC grade must appear on the values row')

const empty = buildReportCard({ student: { first_name: 'No', last_name: 'Grades' }, gradeLevel: 'Grade 1', schoolYear: '2026-2027', academicRows: [] })
assert.ok(empty.includes('Learning Areas'), 'the full DepEd subject grid is shown even with no grades yet')
assert.ok(empty.includes('>-<'), 'no average is shown when there are no grades')

// --- the registrar wiring --------------------------------------------------
// The registrar's Academic History modal has one Record Card button (not a second,
// near-duplicate "Report Card" button producing the same PDF).
const root = resolve(import.meta.dirname, '..')
const js = readFileSync(join(root, 'registrar-academic.js'), 'utf8')
assert.ok(js.includes("from './report-card.js'"), 'registrar-academic.js must reuse the report card builder')
assert.ok(js.includes('printing-card'), 'printing must use the record-card print CSS class')
assert.ok(!js.includes('printReportCard'), 'the duplicate Report Card printer must not come back')
const registrarHtml = readFileSync(join(root, 'student-records.html'), 'utf8')
assert.ok(registrarHtml.includes('id="print-academic-card"'), 'a Record Card button must be present')
assert.ok(registrarHtml.includes('id="academic-print-card"'), 'a hidden print container must be present')
assert.ok(!registrarHtml.includes('id="print-report-card"'), 'the duplicate Report Card button must not come back')
const theme = readFileSync(join(root, 'ui-theme.js'), 'utf8')
assert.ok(theme.includes('printing-card'), 'ui-theme.js must style the record-card print class')

// faculty-reports-page.js prints its own preview under the same 'printing-report-card' class name;
// that one is unrelated to the registrar and must keep working.
const facultyJs = readFileSync(join(root, 'faculty', 'faculty-reports-page.js'), 'utf8')
assert.ok(facultyJs.includes('printing-report-card'), 'the faculty report preview must still use its print CSS class')
assert.ok(theme.includes('printing-report-card'), 'ui-theme.js must still style the faculty report-card print class')

console.log('report card checks passed')
