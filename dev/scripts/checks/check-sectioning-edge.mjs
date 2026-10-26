
import assert from 'node:assert/strict'
import { planBalancedAssignments } from '../../../shared/lib/sectioning.js'

const seeded = seed => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const makeStudents = count =>
  Array.from({ length: count }, (_, i) => ({
    student_id: 7000 + i,
    grade_level: 7,
    gender: i % 2 === 0 ? 'Male' : 'Female'
  }))

const section = (capacity, enrolled = 0) => [{
  section_id: 1,
  section_name: 'Section A',
  grade_level: 7,
  capacity,
  enrolled
}]

// Case 1: More students than available seats.
const overflow = planBalancedAssignments({
  students: makeStudents(5),
  sections: section(3),
  random: seeded(1)
})
assert.equal(overflow.assignments.length, 3)
assert.equal(overflow.unplaced.length, 2)

// Case 2: One section can receive students up to its capacity.
const oneSection = planBalancedAssignments({
  students: makeStudents(3),
  sections: section(3),
  random: seeded(2)
})
assert.equal(oneSection.assignments.length, 3)
assert.equal(new Set(oneSection.assignments.map(x => x.student_id)).size, 3)

// Case 3: Excluded students are not assigned.
const excluded = planBalancedAssignments({
  students: makeStudents(4),
  sections: section(4),
  excludedStudentIds: new Set([7000, 7002]),
  random: seeded(3)
})
assert.equal(excluded.assignments.length, 2)
assert.ok(excluded.assignments.every(x => ![7000, 7002].includes(x.student_id)))

// Case 4: A grade with no matching sections leaves students unplaced.
const noSections = planBalancedAssignments({
  students: makeStudents(3),
  sections: [],
  random: seeded(4)
})
assert.equal(noSections.assignments.length, 0)
assert.equal(noSections.unplaced.length, 3)

// Case 5: A second run skips students already assigned in the first run.
const students = makeStudents(4)
const sections = section(4)

const firstRun = planBalancedAssignments({
  students,
  sections,
  random: seeded(5)
})
const enrolled = new Map(firstRun.assignments.map(x => [x.student_id, x.section_id]))

const secondRun = planBalancedAssignments({
  students,
  sections,
  enrolledByStudent: enrolled,
  random: seeded(6)
})

assert.equal(firstRun.assignments.length, 4)
assert.equal(secondRun.assignments.length, 0)

console.log('sectioning edge checks passed')
