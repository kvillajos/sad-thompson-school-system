// Runnable check for the schedule day-tab helpers: npm run check:daytabs
import assert from 'node:assert/strict'
import { todayDay, visibleDays, initialDay } from '../day-tabs.js'

assert.equal(todayDay(new Date(2026, 8, 21)), 1, 'Monday -> 1')
assert.equal(todayDay(new Date(2026, 8, 27)), 7, 'Sunday -> 7, not 0')
assert.deepEqual(visibleDays([]), [1, 2, 3, 4, 5], 'weekdays always shown')
assert.deepEqual(visibleDays([{ day_of_week: 6 }, { day_of_week: '2' }]), [1, 2, 3, 4, 5, 6], 'Saturday appears only when used')
assert.equal(initialDay([1, 2, 3, 4, 5], 3), 3, 'opens today')
assert.equal(initialDay([1, 2, 3, 4, 5], 7), 1, 'weekend with no classes falls back to Monday')
console.log('day tab checks passed')
