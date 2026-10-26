// Runnable checks for the auto-schedule planner: node dev/scripts/checks/check-schedule-plan.mjs
import assert from 'node:assert/strict'
import { daySlots, planSection, planSections } from '../../../shared/lib/schedule-plan.js'

const settings = { break_start: '09:45', break_end: '10:00', lunch_start: '11:00', lunch_end: '12:00' }
const slots = daySlots(settings)
const starts = slots.map(slot => slot.start_time)
// Lunch and break are skipped: 9:30-10:30 would touch the break, 11:00-12:00 is lunch.
assert.deepEqual(starts, ['07:30', '08:30', '10:00', '12:00', '13:00', '14:00', '15:00', '16:00'])
assert.ok(
  slots.every(slot => slot.end_time <= '11:00' || slot.start_time >= '12:00'),
  'no slot overlaps lunch'
)

const section = { section_id: 1, room: 'Room 101' }
const math = { subject_id: 10 }
const science = { subject_id: 20 }
const teachers = new Map([
  [10, [{ profile_id: 100, name: 'Ana Cruz' }]],
  [20, [{ profile_id: 200, name: 'Ben Reyes' }]]
])

// Teacher conflict: Ana already teaches another section at 7:30 every day, so math goes elsewhere.
const busyAna = [1, 2, 3, 4, 5].map(day => ({
  section_id: 9,
  faculty_profile_id: 100,
  faculty_name: 'Ana Cruz',
  room: 'Room 109',
  day_of_week: day,
  start_time: '07:30',
  end_time: '08:30'
}))
const teacherPlan = planSection({ section, subjects: [math], teachers, existing: busyAna, slots })
assert.equal(teacherPlan.placed.length, 1)
assert.notEqual(teacherPlan.placed[0].start_time, '07:30', 'Ana is busy at 7:30')

// Section and room: two subjects in one section never share a slot.
const both = planSection({ section, subjects: [math, science], teachers, slots })
assert.equal(new Set(both.placed.map(row => row.start_time)).size, 2)

// A subject that cannot fit: every slot of the section is taken, and a subject with no teacher.
const fullDay = slots.flatMap(slot => [1, 2, 3, 4, 5].map(day => ({ section_id: 1, room: 'Room 101', day_of_week: day, ...slot })))
const full = planSection({ section, subjects: [math], teachers, existing: fullDay, slots })
assert.equal(full.placed.length, 0)
assert.match(full.unplaced[0].reason, /no free time slot/)
const noTeacher = planSection({ section, subjects: [{ subject_id: 99 }], teachers, slots })
assert.match(noTeacher.unplaced[0].reason, /No teacher/)

// Several sections: the one math teacher is never double-booked across them.
const many = planSections({
  sections: [1, 2, 3].map(id => ({ section_id: id, room: `Room ${id}` })),
  subjectsFor: () => [math],
  teachers,
  slots
})
const anaSlots = many.flatMap(result => result.placed.map(row => row.start_time))
assert.equal(new Set(anaSlots).size, 3, 'Ana teaches the three sections at three different times')
console.log('schedule plan checks passed')
