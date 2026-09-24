// Runnable check for the schedule day-tab helpers: npm run check:daytabs
import assert from 'node:assert/strict'
import { todayDay, visibleDays, initialDay, withGaps, gapsFrom, overlapsLunch } from '../day-tabs.js'

assert.equal(todayDay(new Date(2026, 8, 21)), 1, 'Monday -> 1')
assert.equal(todayDay(new Date(2026, 8, 27)), 7, 'Sunday -> 7, not 0')
assert.deepEqual(visibleDays([]), [1, 2, 3, 4, 5], 'weekdays always shown')
assert.deepEqual(visibleDays([{ day_of_week: 6 }, { day_of_week: '2' }]), [1, 2, 3, 4, 5, 6], 'Saturday appears only when used')
assert.equal(initialDay([1, 2, 3, 4, 5], 3), 3, 'opens today')
assert.equal(initialDay([1, 2, 3, 4, 5], 7), 1, 'weekend with no classes falls back to Monday')

const classes = [{ start_time: '07:30:00', end_time: '09:00:00' }, { start_time: '12:00:00', end_time: '13:00:00' }]
const gaps = [{ label: 'Lunch break', start: '11:00', end: '12:00' }, { label: 'Break', start: '09:45', end: '10:00' }]
assert.deepEqual(withGaps(classes, gaps).map(item => item.type + '@' + item.start), ['class@07:30', 'gap@09:45', 'gap@11:00', 'class@12:00'], 'gaps sit between classes in time order')
assert.deepEqual(withGaps([{ start_time: '09:30:00', end_time: '11:00:00' }], gaps).map(item => item.type), ['class', 'gap'], 'a break inside a class is not drawn, lunch after it still is')
const settings = { lunch_start: '11:00:00', lunch_end: '12:00:00', break_start: '09:45:00', break_end: '10:00:00' }
assert.deepEqual(gapsFrom(settings), gaps)
assert.deepEqual(gapsFrom({ ...settings, break_start: null, break_end: null }), [gaps[0]], 'break is optional')
assert.equal(overlapsLunch(settings, '10:45', '11:30'), true)
assert.equal(overlapsLunch(settings, '12:00', '12:45'), false, 'touching the end of lunch is fine')
assert.equal(overlapsLunch(settings, '10:00', '11:00'), false, 'ending exactly when lunch starts is fine')
assert.equal(overlapsLunch(null, '11:00', '12:00'), false)
console.log('day tab checks passed')
