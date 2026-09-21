import assert from 'node:assert/strict'
import { formatDays, groupScheduleRows, planDayChanges } from '../schedule-days.js'

assert.deepEqual(planDayChanges([1, 3], [1, 2, 5]), { add: [2, 5], remove: [3] })
assert.deepEqual(planDayChanges([], [7, 1, 1]), { add: [1, 7], remove: [] })

const groups = groupScheduleRows([
  { schedule_id: 1, section_id: 4, subject_id: 2, faculty_name: 'Ada', room: 'A', day_of_week: 3, start_time: '08:00', end_time: '09:00' },
  { schedule_id: 2, section_id: 4, subject_id: 2, faculty_name: 'Ada', room: 'A', day_of_week: 1, start_time: '08:00', end_time: '09:00' },
  { schedule_id: 3, section_id: 4, subject_id: 2, faculty_name: 'Ada', room: 'B', day_of_week: 5, start_time: '08:00', end_time: '09:00' }
])
assert.equal(groups.length, 2)
assert.deepEqual(groups[0].days, [1, 3])
assert.equal(formatDays(groups[0].days), 'Mon, Wed')
assert.equal(formatDays([7, 1, 5]), 'Mon, Fri, Sun')

console.log('schedule day checks passed')
