import assert from 'node:assert/strict'
import { historicalSchoolYears, renderHistoricalRecords } from '../../../role-student/student-history-view.js'

const enrollments = [
  {
    school_year: '2024-2025',
    grade_level: 8,
    status: 'completed',
    sections: { section_name: 'Hope', academic_year: '2024-2025' }
  },
  {
    school_year: '2023-2024',
    grade_level: 7,
    status: 'completed',
    sections: { section_name: '<img src=x>', academic_year: '2023-2024' }
  }
]
const gradeRows = [
  {
    school_year: '2024-2025',
    subject: 'Mathematics',
    grade: 91,
    first_sem_q1: 90,
    first_sem_q2: 92
  },
  { school_year: '2022-2023', subject: 'Science', grade: 88 }
]

assert.deepEqual(
  historicalSchoolYears(enrollments, gradeRows, '2025-2026'),
  ['2024-2025', '2023-2024', '2022-2023'],
  'historical years combine placement and grade records, remove the current year, and sort newest first'
)

const records = renderHistoricalRecords({ schoolYear: '2024-2025', enrollments, gradeRows })
assert.match(records.placementHtml, /Grade 8 · Hope/)
assert.match(records.firstSemesterHtml, /Mathematics/)
assert.doesNotMatch(records.firstSemesterHtml, /Science/)

const escaped = renderHistoricalRecords({ schoolYear: '2023-2024', enrollments, gradeRows })
assert.match(escaped.placementHtml, /&lt;img src=x&gt;/, 'section names are HTML-escaped')

console.log('student portal checks passed')
