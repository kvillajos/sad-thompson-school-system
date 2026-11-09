// Grade submission tracker: per-class progress for a quarter.
import assert from 'node:assert/strict'
import { facultySummary, taughtInQuarter, trackClasses } from '../../../shared/lib/grade-tracker.js'

assert.equal(taughtInQuarter(null, 3), true)
assert.equal(taughtInQuarter(1, 2), true)
assert.equal(taughtInQuarter(1, 3), false)
assert.equal(taughtInQuarter(2, 4), true)

const schedules = [
  // Same class on two weekdays counts once.
  {
    section_id: 1,
    subject_id: 10,
    faculty_name: 'Ana Reyes',
    sections: { section_name: 'Hope', grade_level: 7 },
    subjects: { subject_name: 'Math 7' }
  },
  {
    section_id: 1,
    subject_id: 10,
    faculty_name: 'Ana Reyes',
    sections: { section_name: 'Hope', grade_level: 7 },
    subjects: { subject_name: 'Math 7' }
  },
  {
    section_id: 1,
    subject_id: 11,
    faculty_name: 'Ben Cruz',
    sections: { section_name: 'Hope', grade_level: 7 },
    subjects: { subject_name: 'English 7' }
  },
  {
    section_id: 2,
    subject_id: 20,
    faculty_name: 'Ben Cruz',
    sections: { section_name: 'STEM A', grade_level: 11 },
    subjects: { subject_name: 'Gen Chem', semester: 2 }
  },
  {
    section_id: 3,
    subject_id: 10,
    faculty_name: 'Ana Reyes',
    sections: { section_name: 'Empty', grade_level: 7 },
    subjects: { subject_name: 'Math 7' }
  }
]
const enrollments = [
  { student_id: 101, section_id: 1 },
  { student_id: 102, section_id: 1 },
  { student_id: 201, section_id: 2 }
]
const grades = [
  { student_id: 101, subject: 'Math 7', first_sem_q1: 90, locked: true },
  { student_id: 102, subject: 'Math 7', first_sem_q1: 85, locked: true },
  { student_id: 101, subject: 'English 7', first_sem_q1: 88 },
  { student_id: 102, subject: 'English 7', first_sem_q1: null }
]

const q1 = trackClasses({ schedules, enrollments, grades, quarter: 1, deadline: '2026-08-21', today: '2026-08-25' })
assert.deepEqual(
  q1.map(row => [row.faculty, row.section, row.subject, row.entered, row.total, row.locked, row.status, row.late]),
  [
    ['Ana Reyes', 'Empty', 'Math 7', 0, 0, 0, 'No students', false],
    ['Ana Reyes', 'Hope', 'Math 7', 2, 2, 2, 'Complete', false],
    ['Ben Cruz', 'Hope', 'English 7', 1, 2, 0, 'In progress', true]
  ]
)
// The 2nd-semester Senior High class only shows from Q3, and is not late before its deadline.
const q3 = trackClasses({ schedules, enrollments, grades, quarter: 3, deadline: '2027-01-29', today: '2027-01-10' })
const chem = q3.find(row => row.subject === 'Gen Chem')
assert.equal(chem.status, 'Not started')
assert.equal(chem.late, false)

assert.deepEqual(facultySummary(q1), [
  { faculty: 'Ben Cruz', classes: 1, complete: 0, late: 1 },
  { faculty: 'Ana Reyes', classes: 1, complete: 1, late: 0 }
])

console.log('grade tracker checks passed')
