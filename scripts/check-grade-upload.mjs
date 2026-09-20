// Runnable checks for the grade CSV bulk upload: npm run check:grades-upload
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { derivedGrade, parseGradeCsv } from '../grades.js'

const csv = [
  'student_id,first_sem_q1,first_sem_q2,second_sem_q1,second_sem_q2,midterm,final,letter_grade,remarks',
  '11,80,90,70,80,,,,',
  '12,,,,,,90,A,Great work',
  'abc,80,80,80,80,,,,',
  '13,,,,,,,,'
].join('\n')

const rows = parseGradeCsv(csv)
assert.equal(rows.length, 4)
assert.deepEqual(rows[0].errors, [], 'a full quarter set with no other errors is clean')
assert.equal(derivedGrade(rows[0].record), 80)
assert.equal(rows[1].record.final, 90)
assert.deepEqual(rows[2].errors, ['student_id is required and must be a number'])
assert.deepEqual(rows[3].errors, ['no scores were provided'])
assert.equal(parseGradeCsv('').length, 0, 'an empty file parses to no rows')
assert.equal(parseGradeCsv('student_id,final').length, 0, 'a header-only file parses to no rows')

// --- the faculty page bulk upload wiring ----------------------------------
const root = resolve(import.meta.dirname, '..')
const html = readFileSync(join(root, 'faculty', 'faculty-upload.html'), 'utf8')
const script = readFileSync(join(root, 'faculty', 'faculty-upload-page.js'), 'utf8')
assert.ok(html.includes('id="upload-file"') && html.includes('accept=".csv"'), 'a CSV file input must be present')
assert.ok(html.includes('id="save-upload"') && html.includes('disabled'), 'bulk save must start disabled until a clean file is loaded')
assert.ok(script.includes('parseGradeCsv'), 'the page must reuse the CSV parser')
assert.ok(script.includes('!row.errors.length'), 'save must filter to error-free rows only')

console.log('grade upload checks passed')
