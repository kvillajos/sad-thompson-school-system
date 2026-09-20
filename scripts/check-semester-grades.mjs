import assert from 'node:assert/strict'
import { buildSemesterTable, semesterGroups, semesterRows } from '../semester-grades.js'

const rows = [
  { school_year: '2025-2026', subject: 'Math', first_sem_q1: 80, first_sem_q2: 90, second_sem_q1: 88, second_sem_q2: 92, grade: 88 },
  { school_year: '2026-2027', subject: 'Science', first_sem_q1: 95, first_sem_q2: 85, grade: 90 }
]
const expanded = semesterRows(rows)
assert.equal(expanded.length, 4)
assert.equal(expanded[0].semesterGrade, 85)
assert.equal(expanded[1].semesterGrade, 90)
assert.equal(semesterGroups(rows)[0].schoolYear, '2026-2027')
assert.match(buildSemesterTable(rows), /1st Semester/)
assert.match(buildSemesterTable(rows), /Science/)
console.log('semester grade checks passed')
