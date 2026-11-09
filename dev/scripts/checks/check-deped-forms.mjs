// DepEd School Forms: SF1/SF2/SF5/SF10 sheet contents, then a real .xlsx written and read back with exceljs.
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {
  ageOn,
  bySex,
  schoolDatesInMonth,
  sf10Sheet,
  sf1Sheet,
  sf2Sheet,
  sf5Sheet,
  uniqueSheetNames
} from '../../../shared/documents/deped-forms.js'
import { buildWorkbook } from '../../../shared/documents/xlsx-writer.js'

const section = { section_id: 1, section_name: 'Hope', grade_level: 7, academic_year: '2026-2027', faculty_assigned: 'Ana Reyes' }
const students = [
  { student_id: 1, lrn_number: 'TCS-1', last_name: 'Zamora', first_name: 'Ben', gender: 'Male', date_of_birth: '2013-11-02' },
  { student_id: 2, lrn_number: 'TCS-2', last_name: 'Abad', first_name: 'Cara', gender: 'Female', date_of_birth: '2013-10-31' },
  {
    student_id: 3,
    lrn_number: 'TCS-3',
    last_name: 'Bueno',
    first_name: 'Dan',
    gender: 'Male',
    date_of_birth: '2013-05-01',
    enrollment_status: 'Transferred'
  }
]
const tableRows = spec => spec.rows.slice(spec.headerRow + 1)

assert.equal(ageOn('2013-11-02', '2026-10-31'), 12)
assert.equal(ageOn('2013-10-31', '2026-10-31'), 13)
assert.deepEqual(
  Object.values(bySex(students)).map(list => list.map(s => s.last_name)),
  [['Bueno', 'Zamora'], ['Abad']]
)

// SF1: males first (A-Z), a total row per sex, then the combined total; status shows in Remarks.
const sf1 = tableRows(sf1Sheet({ section, students }))
assert.deepEqual(
  sf1.map(row => row[2]),
  ['Bueno, Dan', 'Zamora, Ben', 'TOTAL MALE: 2', 'Abad, Cara', 'TOTAL FEMALE: 1', 'COMBINED: 3']
)
assert.equal(sf1[0][10], 'Transferred')
assert.equal(sf1[3][5], 13)

// SF2: September 2026 has 22 weekdays; one holiday leaves 21. Absent beats Late on the same date.
assert.equal(schoolDatesInMonth(2026, 9).length, 22)
assert.equal(schoolDatesInMonth(2026, 9, { holidays: ['2026-09-21'] }).length, 21)
assert.deepEqual(schoolDatesInMonth(2026, 6, { start: '2026-06-08' }).slice(0, 2), ['2026-06-08', '2026-06-09'])
const sf2 = sf2Sheet({
  section,
  students,
  year: 2026,
  month: 9,
  holidays: ['2026-09-21'],
  attendance: [
    { student_id: 1, attendance_date: '2026-09-01', status: 'Late' },
    { student_id: 1, attendance_date: '2026-09-01', status: 'Absent' },
    { student_id: 1, attendance_date: '2026-09-02', status: 'Late' },
    { student_id: 2, attendance_date: '2026-09-03', status: 'Absent' }
  ]
})
const header = sf2.rows[sf2.headerRow]
assert.equal(header.length, 2 + 21 + 3)
assert.equal(header[2], '1 T')
const zamora = tableRows(sf2).find(row => row[1] === 'Zamora, Ben')
assert.deepEqual([zamora[2], zamora[3], zamora.at(-3), zamora.at(-2)], ['x', 'T', 1, 1])
const combined = tableRows(sf2).at(-1)
assert.deepEqual(combined.slice(2, 5), [2, 3, 2]) // present per day: 1 Sept (Ben absent), 2 Sept, 3 Sept (Cara absent)

// SF5: logged promotion wins; otherwise the action is provisional from the grades.
const grades = [
  { student_id: 1, subject: 'Math', grade: 90 },
  { student_id: 1, subject: 'English', grade: 92 },
  { student_id: 2, subject: 'Math', grade: 70 },
  { student_id: 2, subject: 'English', grade: 80 }
]
const sf5 = sf5Sheet({ section, students, grades, promotions: new Map([[1, 'promoted']]) })
const sf5rows = sf5.rows.slice(sf5.headerRow + 1)
assert.deepEqual(sf5rows[0].slice(2, 8), ['Bueno, Dan', 'M', '', 'INCOMPLETE (provisional)', '', ''])
assert.deepEqual(sf5rows[1].slice(2, 8), ['Zamora, Ben', 'M', 91, 'PROMOTED', '', 'Outstanding'])
assert.deepEqual(sf5rows[2].slice(2, 8), ['Abad, Cara', 'F', 75, 'RETAINED (provisional)', 'Math', 'Fairly Satisfactory'])
const summary = Object.fromEntries(sf5rows.filter(row => row[2] && row.length === 6).map(row => [row[2], row.slice(3)]))
assert.deepEqual(summary.PROMOTED, [1, 0, 1])
assert.deepEqual(summary.RETAINED, [0, 1, 1])
assert.deepEqual(summary.Outstanding, [1, 0, 1])

// SF10: one block per school year with a general average row.
const sf10 = sf10Sheet({
  student: students[0],
  history: [
    { school_year: '2025-2026', subject: 'Science', first_sem_q1: 88, grade: 89 },
    { school_year: '2026-2027', subject: 'Math', grade: 90 },
    { school_year: '2026-2027', subject: 'English', grade: 70, remarks: 'Remedial' }
  ],
  enrollments: [{ school_year: '2026-2027', grade_level: 7, sections: { section_name: 'Hope' } }]
})
const titles = sf10.rows.filter(row => String(row[0]).startsWith('School Year')).map(row => row[0])
assert.equal(titles.length, 2)
assert.ok(titles[1].includes('Grade 7') && titles[1].includes('Hope'))
const averages = sf10.rows.filter(row => row[0] === 'General Average').map(row => row.slice(-2))
assert.deepEqual(averages, [
  [89, 'Promoted'],
  [80, 'Promoted']
])
assert.ok(sf10.rows.some(row => row[0] === 'English' && row.at(-1) === 'Remedial'))

assert.deepEqual(
  uniqueSheetNames([{ name: 'Cruz Ana' }, { name: 'Cruz Ana' }, { name: 'x'.repeat(40) }]).map(spec => spec.name),
  ['Cruz Ana', 'Cruz Ana 2', 'x'.repeat(31)]
)

// A real workbook round-trip.
const workbook = await buildWorkbook([sf1Sheet({ section, students }), sf2, sf10], ExcelJS)
const reread = new ExcelJS.Workbook()
await reread.xlsx.load(await workbook.xlsx.writeBuffer())
assert.deepEqual(
  reread.worksheets.map(sheet => sheet.name),
  ['SF1', 'SF2 Sep', 'Zamora Ben']
)
assert.equal(reread.worksheets[0].getCell('A1').value, 'School Form 1 (SF 1) School Register')

console.log('DepEd forms checks passed')
