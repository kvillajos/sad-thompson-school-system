// Runnable checks for the sectioning allocator: npm run check:sectioning
import assert from 'node:assert/strict'
import { AUTO_ASSIGN_GRADES, planBalancedAssignments, studentsForSection } from '../../../shared/lib/sectioning.js'

// Deterministic RNG so "randomized" can still be asserted.
const seeded = seed => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const makeStudents = (grade, boys, girls) => [
  ...Array.from({ length: boys }, (_, i) => ({ student_id: grade * 1000 + i, grade_level: grade, gender: 'Male' })),
  ...Array.from({ length: girls }, (_, i) => ({ student_id: grade * 1000 + 500 + i, grade_level: grade, gender: 'Female' }))
]

const sections = [
  { section_id: 1, section_name: 'St. Luke', grade_level: 7, capacity: 10 },
  { section_id: 2, section_name: 'St. Mark', grade_level: 7, capacity: 10 },
  { section_id: 3, section_name: 'STEM A', grade_level: 11, capacity: 30 }
]

// The default run covers Grades 7-10; Senior High is assigned only when its grades are chosen.
const plan = planBalancedAssignments({
  students: [...makeStudents(7, 9, 9), ...makeStudents(11, 5, 5)],
  sections,
  random: seeded(42)
})
assert.equal(plan.assignments.length, 18)
assert.equal(plan.summary.filter(row => row.grade_level === 11).length, 0, 'grade 11 must not be auto-assigned')
assert.ok(!plan.assignments.some(row => row.section_id === 3), 'no grade 11 student may land in the grade 11 section')

// Boys and girls stay within one of each other per section.
plan.summary
  .filter(row => row.grade_level === 7)
  .forEach(row => {
    assert.ok(Math.abs(row.boys - row.girls) <= 1, `${row.section_name} is lopsided: ${row.boys} boys / ${row.girls} girls`)
  })

// Every grade 7 student was placed exactly once, and capacity was respected.
assert.equal(new Set(plan.assignments.map(row => row.student_id)).size, 18)
assert.equal(
  sections.filter(s => s.grade_level === 7).reduce((total, s) => total + s.capacity, 0),
  20
)

// Order is randomized: a different seed produces a different spread.
const otherPlan = planBalancedAssignments({
  students: [...makeStudents(7, 9, 9)],
  sections,
  random: seeded(7)
})
assert.notDeepEqual(
  plan.assignments.map(row => `${row.student_id}:${row.section_id}`),
  otherPlan.assignments.map(row => `${row.student_id}:${row.section_id}`)
)

// Overflow is reported, never silently dropped, and capacity is never exceeded.
const crowded = planBalancedAssignments({
  students: [...makeStudents(9, 12, 12)],
  sections: [{ section_id: 9, section_name: 'Only', grade_level: 9, capacity: 15 }],
  random: seeded(3)
})
assert.equal(crowded.assignments.length, 15)
assert.equal(crowded.unplaced.length, 9)
assert.ok(crowded.unplaced.every(row => row.reason.includes('full')))

// A grade with no section reports every student instead of placing them nowhere.
const noSection = planBalancedAssignments({ students: makeStudents(10, 2, 2), sections, random: seeded(1) })
assert.equal(noSection.assignments.length, 0)
assert.equal(noSection.unplaced.length, 4)

// Students who already have a section are left alone; free seats are respected.
const alreadyPlaced = new Map([[7000, 1]])
const partiallyFilled = planBalancedAssignments({
  students: makeStudents(7, 2, 2),
  sections: [{ section_id: 1, section_name: 'St. Luke', grade_level: 7, capacity: 10, enrolled: 9 }],
  enrolledByStudent: alreadyPlaced,
  random: seeded(11)
})
assert.equal(partiallyFilled.assignments.length, 1, 'only one free seat existed')
assert.ok(!partiallyFilled.assignments.some(row => row.student_id === 7000), 'already-placed student must be skipped')

// The manual placement list is grade-accurate and hides the current section.
const roster = studentsForSection([...makeStudents(9, 2, 2), ...makeStudents(10, 2, 2)], {
  gradeLevel: 10,
  sectionId: 20,
  enrolledByStudent: new Map([[10500, 20]])
})
assert.equal(roster.length, 3)
assert.ok(
  roster.every(student => student.student_id >= 10000 && student.student_id < 11000),
  'grade 9 students must not appear for grade 10'
)
assert.ok(!roster.some(student => student.student_id === 10500), 'students already in the section must be hidden')

assert.deepEqual(AUTO_ASSIGN_GRADES, [7, 8, 9, 10])

// Only the chosen grade levels run, and excluded students stay put.
const subset = planBalancedAssignments({
  students: [...makeStudents(7, 1, 1), ...makeStudents(8, 1, 1)],
  sections: [...sections, { section_id: 4, section_name: 'St. John', grade_level: 8, capacity: 10 }],
  grades: [8],
  random: seeded(2)
})
assert.equal(subset.assignments.length, 2)
assert.ok(
  subset.assignments.every(row => row.section_id === 4),
  'grades outside the chosen list must not be assigned'
)

const withExclusions = planBalancedAssignments({
  students: makeStudents(7, 2, 2),
  sections,
  excludedStudentIds: new Set([7000, 7500]),
  random: seeded(5)
})
assert.equal(withExclusions.assignments.length, 2)
assert.ok(
  !withExclusions.assignments.some(row => row.student_id === 7000 || row.student_id === 7500),
  'excluded students must stay unassigned'
)
// Students who left the school are never offered for placement.
const left = [
  { student_id: 1, grade_level: 7, enrollment_status: 'Withdrawn' },
  { student_id: 2, grade_level: 7, enrollment_status: null }
]
assert.deepEqual(
  studentsForSection(left, { gradeLevel: 7, sectionId: 1 }).map(s => s.student_id),
  [2]
)
assert.equal(
  planBalancedAssignments({ students: left, sections, grades: [7], random: seeded(1) }).assignments.some(row => row.student_id === 1),
  false
)

// Senior High: students only land in a section of their own strand; a student without a strand is reported.
const shsSections = [
  { section_id: 11, section_name: 'Matalino', grade_level: 11, strand: 'STEM', capacity: 5 },
  { section_id: 12, section_name: 'Masigasig', grade_level: 11, strand: 'ABM', capacity: 5 }
]
const shsStudents = [
  ...makeStudents(11, 2, 2).map(s => ({ ...s, strand: 'STEM' })),
  { student_id: 11900, grade_level: 11, gender: 'Female', strand: 'ABM' },
  { student_id: 11901, grade_level: 11, gender: 'Male', strand: 'HUMSS' },
  { student_id: 11902, grade_level: 11, gender: 'Male' }
]
const shsPlan = planBalancedAssignments({ students: shsStudents, sections: shsSections, grades: [11], random: seeded(3) })
const placedIn = new Map(shsPlan.assignments.map(row => [row.student_id, row.section_id]))
assert.ok(
  shsStudents.filter(s => s.strand === 'STEM').every(s => placedIn.get(s.student_id) === 11),
  'STEM students go to the STEM section'
)
assert.equal(placedIn.get(11900), 12, 'ABM student goes to the ABM section')
assert.match(shsPlan.unplaced.find(row => row.student_id === 11901).reason, /No HUMSS section/)
assert.match(shsPlan.unplaced.find(row => row.student_id === 11902).reason, /No strand chosen/)
assert.deepEqual(
  studentsForSection(shsStudents, { gradeLevel: 11, sectionId: 12, strand: 'ABM' }).map(s => s.student_id),
  [11900]
)
console.log('sectioning checks passed')
