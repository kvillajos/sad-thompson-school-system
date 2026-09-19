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
    { subject: 'Mathematics', grade: 88, letter_grade: null, final: 88 },
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
assert.ok(html.includes('45/48 present'), 'attendance summary must appear')
assert.ok(html.includes('Keep up the good work'), 'remarks must appear')
assert.ok(html.includes('Class Adviser') && html.includes('Parent / Guardian') && html.includes('School Principal'), 'signature block must appear')

const empty = buildReportCard({ student: { first_name: 'No', last_name: 'Grades' }, gradeLevel: 'Grade 1', schoolYear: '2026-2027', academicRows: [] })
assert.ok(empty.includes('No academic records yet.'))
assert.ok(empty.includes('>-<'), 'no average is shown when there are no grades')

// --- the registrar wiring --------------------------------------------------
const root = resolve(import.meta.dirname, '..')
const js = readFileSync(join(root, 'registrar.js'), 'utf8')
assert.ok(js.includes("from './report-card.js'"), 'registrar.js must reuse the report card builder')
assert.ok(js.includes('printing-report-card'), 'printing must use the report-card print CSS class')
const registrarHtml = readFileSync(join(root, 'student-records.html'), 'utf8')
assert.ok(registrarHtml.includes('id="print-report-card"'), 'a Print Report Card button must be present')
assert.ok(registrarHtml.includes('id="report-print-card"'), 'a hidden print container must be present')
const theme = readFileSync(join(root, 'ui-theme.js'), 'utf8')
assert.ok(theme.includes('printing-report-card'), 'ui-theme.js must style the report-card print class')

console.log('report card checks passed')
