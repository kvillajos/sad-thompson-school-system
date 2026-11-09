// School calendar: school days per month, quarter validation and lookups.
import assert from 'node:assert/strict'
import { classSpan, currentGradingQuarter, quarterOn, quarterProblems, schoolDaysByMonth } from '../../../shared/lib/calendar.js'

// June 2026: the 1st is a Monday; June has 22 weekdays. One holiday (Fri 12 June) leaves 21.
assert.deepEqual(schoolDaysByMonth({ start: '2026-06-01', end: '2026-06-30' }), { 6: 22 })
assert.deepEqual(schoolDaysByMonth({ start: '2026-06-01', end: '2026-06-30', holidays: ['2026-06-12'] }), { 6: 21 })
// Holidays as table rows, a weekend holiday changes nothing, and the span crosses into July.
assert.deepEqual(
  schoolDaysByMonth({
    start: '2026-06-29',
    end: '2026-07-03',
    holidays: [{ holiday_date: '2026-07-01' }, { holiday_date: '2026-07-04' }]
  }),
  { 6: 2, 7: 2 }
)
assert.deepEqual(schoolDaysByMonth({ start: '2026-07-01', end: '2026-06-01' }), {})

const year = { label: '2026-2027', start_date: '2026-06-01', end_date: '2027-05-31' }
const quarters = [
  { quarter: 1, start_date: '2026-06-08', end_date: '2026-08-14', grade_deadline: '2026-08-21' },
  { quarter: 2, start_date: '2026-08-17', end_date: '2026-10-23', grade_deadline: '2026-10-30' },
  { quarter: 3, start_date: '2026-11-02', end_date: '2027-01-22', grade_deadline: '2027-01-29' },
  { quarter: 4, start_date: '2027-01-25', end_date: '2027-03-31', grade_deadline: '2027-04-07' }
]
assert.deepEqual(quarterProblems(quarters, year), [])
assert.deepEqual(classSpan(quarters, year), { start: '2026-06-08', end: '2027-03-31' })
assert.deepEqual(classSpan([], year), { start: '2026-06-01', end: '2027-05-31' })
assert.equal(quarterOn(quarters, '2026-09-01'), 2)
assert.equal(quarterOn(quarters, '2026-10-26'), null)
assert.equal(currentGradingQuarter(quarters, '2026-08-22').quarter, 2)
assert.equal(currentGradingQuarter(quarters, '2027-05-01').quarter, 4)

const bad = quarterProblems(
  [
    { quarter: 1, start_date: '2026-05-20', end_date: '2026-08-14' },
    { quarter: 2, start_date: '2026-08-10', end_date: '2026-08-01', grade_deadline: '2026-07-01' },
    { quarter: 3, start_date: '', end_date: '2027-01-22' }
  ],
  year
)
assert.equal(bad.length, 5, bad.join('\n'))
assert.ok(bad.some(p => p.startsWith('Q1: dates must fall inside')))
assert.ok(bad.some(p => p.startsWith('Q2: the end date')))
assert.ok(bad.some(p => p.startsWith('Q2: the grade deadline')))
assert.ok(bad.some(p => p.startsWith('Q3: enter both')))
assert.ok(bad.includes('Q2 must start after Q1 ends.'))

console.log('calendar checks passed')
