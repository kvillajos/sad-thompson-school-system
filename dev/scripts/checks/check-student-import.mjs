// Bulk student import: CSV parsing, header mapping and row validation.
import assert from 'node:assert/strict'
import { headerKey, importTemplateCsv, isoDate, parseCsv, tableToRecords, validateImportRows } from '../../../shared/lib/student-import.js'

// Quoted commas, escaped quotes, CRLF and a blank line.
assert.deepEqual(parseCsv('a,b\r\n"1, Rizal St.","say ""hi"""\r\n\r\nx,\n'), [
  ['a', 'b'],
  ['1, Rizal St.', 'say "hi"'],
  ['x', '']
])
assert.equal(headerKey('Last Name'), 'last_name')
assert.equal(headerKey('DOB'), 'birth_date')
assert.equal(headerKey('gender'), 'sex')
assert.equal(headerKey('favourite colour'), null)

assert.equal(isoDate('2013-4-5'), '2013-04-05')
assert.equal(isoDate('04/15/2013'), '2013-04-15')
assert.equal(isoDate('02/30/2013'), null)
assert.equal(isoDate(new Date(Date.UTC(2013, 3, 15))), '2013-04-15')

// The template parses back cleanly.
const template = tableToRecords(parseCsv(importTemplateCsv()))
assert.deepEqual(template.missingHeaders, [])
assert.deepEqual(template.unknownHeaders, [])
const context = {
  offeredGrades: [7, 8, 9, 10, 11, 12],
  strands: ['STEM', 'ABM'],
  existingKeys: new Set(['reyes|ana|2012-01-02']),
  existingNumbers: new Set(['tcs-26-00001'])
}
const [ok] = validateImportRows(template.rows, context)
assert.deepEqual(ok.errors, [])
assert.equal(ok.values.address, '123 Rizal St., Brgy. Uno, Quezon City')
assert.equal(ok.values.grade_level, 7)

const table = [
  ['Last Name', 'First Name', 'Birth Date', 'Sex', 'Grade Level', 'Strand', 'Student No', 'Color'],
  ['Reyes', 'Ana', '2012-01-02', 'F', '8', '', '', 'red'],
  ['Cruz', 'Ben', '2009-13-01', 'X', 'Grade 11', '', 'TCS-26-00001', ''],
  ['Lim', 'Cy', '2008-05-05', 'Male', '12', 'stem', 'A-1', ''],
  ['Lim', 'Cy', '2008-05-05', 'Male', '9', 'STEM', 'a-1', ''],
  ['', '', '', '', '6', '', '', '']
]
const parsed = tableToRecords(table)
assert.deepEqual(parsed.unknownHeaders, ['Color'])
const result = validateImportRows(parsed.rows, context)
assert.deepEqual(result[0].errors, ['A student with this name and birth date already exists (use Re-enroll instead)'])
assert.equal(result[0].values.sex, 'Female')
assert.deepEqual(result[1].errors.sort(), [
  'Birth Date must be a real date (YYYY-MM-DD or MM/DD/YYYY)',
  'Sex must be Male or Female',
  'Strand is required for Grades 11-12',
  'Student No is already used by another student'
])
assert.deepEqual(result[2].errors, [])
assert.equal(result[2].values.strand, 'STEM')
assert.deepEqual(result[3].errors.sort(), ['Same student as row 4', 'Strand is only for Grades 11-12', 'Student No repeats row 4'])
// Four required fields missing, plus a grade the school does not offer.
assert.equal(result[4].errors.length, 5, result[4].errors.join('\n'))
assert.ok(result[4].errors.at(-1).startsWith('Grade Level must be one the school offers'))

console.log('student import checks passed')
