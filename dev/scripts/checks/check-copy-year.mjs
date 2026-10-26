// Regression checks for copying sections and schedules between school years.
import assert from 'node:assert/strict'
import { nextSchoolYear, planYearCopy, sectionYearKey } from '../../../shared/lib/year-copy.js'

assert.equal(nextSchoolYear('2026-2027'), '2027-2028')
assert.throws(() => nextSchoolYear('2026-2028'), /Invalid school year/)

const sourceSections = [
  { section_id: 1, section_name: 'Hope', grade_level: 7, semester: '1st Semester', capacity: 35, faculty_assigned: 'Adviser A', room: 'Room 1' },
  { section_id: 2, section_name: 'Faith', grade_level: 7, semester: '1st Semester', capacity: 35, faculty_assigned: 'Adviser B', room: 'Room 2' }
]
const targetSections = [
  { section_id: 11, section_name: 'Hope', grade_level: 7, semester: '1st Semester' }
]
const sourceSchedules = [
  { schedule_id: 101, section_id: 1, subject_id: 4, faculty_name: 'Teacher A', room: 'Room 1', day_of_week: 1, start_time: '08:00:00', end_time: '09:00:00' },
  { schedule_id: 102, section_id: 1, subject_id: 5, faculty_name: 'Teacher B', room: 'Room 1', day_of_week: 2, start_time: '09:00:00', end_time: '10:00:00' },
  { schedule_id: 103, section_id: 2, subject_id: 4, faculty_name: 'Teacher A', room: 'Room 2', day_of_week: 1, start_time: '08:00:00', end_time: '09:00:00' }
]
const targetSchedules = [
  { schedule_id: 201, section_id: 11, subject_id: 4, faculty_name: 'Teacher A', room: 'Room 1', day_of_week: 1, start_time: '08:00', end_time: '09:00' }
]
const plan = planYearCopy({ sourceSections, targetSections, sourceSchedules, targetSchedules })
assert.deepEqual(plan.sectionsToCreate.map(({ key }) => key), [sectionYearKey(sourceSections[1])])
assert.deepEqual(plan.sectionsToSkip.map(({ section }) => section.section_name), ['Hope'])
assert.deepEqual(plan.schedulesToCreate.map(({ schedule }) => schedule.schedule_id), [102, 103])
assert.deepEqual(plan.schedulesToSkip.map(({ schedule }) => schedule.schedule_id), [101])

const rerun = planYearCopy({
  sourceSections,
  targetSections: [
    ...targetSections,
    { section_id: 12, section_name: 'Faith', grade_level: 7, semester: '1st Semester' }
  ],
  sourceSchedules,
  targetSchedules: [
    ...targetSchedules,
    { schedule_id: 202, section_id: 11, subject_id: 5, faculty_name: 'Teacher B', room: 'Room 1', day_of_week: 2, start_time: '09:00', end_time: '10:00' },
    { schedule_id: 203, section_id: 12, subject_id: 4, faculty_name: 'Teacher A', room: 'Room 2', day_of_week: 1, start_time: '08:00', end_time: '09:00' }
  ]
})
assert.equal(rerun.sectionsToCreate.length, 0, 'rerunning must not create duplicate sections')
assert.equal(rerun.schedulesToCreate.length, 0, 'rerunning must not create duplicate schedules')
assert.equal(rerun.sectionsToSkip.length, 2)
assert.equal(rerun.schedulesToSkip.length, 3)
console.log('copy year checks passed')
