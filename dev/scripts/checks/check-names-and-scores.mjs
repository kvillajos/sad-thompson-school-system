// Runnable check for "Last, First" names, last-name sorting and whole-number upload scores.
import assert from 'node:assert/strict'
import { byLastName, lastFirst } from '../../../shared/lib/html.js'
import { parseGradeCsv } from '../../../shared/lib/grades.js'

assert.equal(lastFirst({ first_name: 'Juan', last_name: 'Dela Cruz' }), 'Dela Cruz, Juan')
assert.equal(lastFirst({ first_name: 'Juan' }), 'Juan')
assert.equal(lastFirst(null), '')

const people = [
  { first_name: 'Ana', last_name: 'Reyes' },
  { first_name: 'Ben', last_name: 'cruz' },
  { first_name: 'Al', last_name: 'Cruz' },
  { first_name: 'Zed', last_name: 'Abad' }
]
assert.deepEqual(
  people.sort(byLastName).map(person => lastFirst(person)),
  ['Abad, Zed', 'Cruz, Al', 'cruz, Ben', 'Reyes, Ana'],
  'sorted by last name, then first name, ignoring case'
)

const rows = parseGradeCsv(
  ['student_id,first_sem_q1,student_name', '1,85,Cruz Juan', '2,85.5,Reyes Ana', '3,-5,Abad Zed'].join('\n'),
  '2026-2027'
)
assert.deepEqual(rows[0].errors, [])
assert.equal(rows[0].name, 'Cruz Juan')
assert.match(rows[1].errors[0], /whole number/)
assert.match(rows[2].errors[0], /whole number from 0 to 100/)

console.log('names and scores ok')
