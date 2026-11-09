// DepEd School Forms as sheet descriptions (pure; tested by dev/scripts/checks/check-deped-forms.mjs).
// xlsx-writer.js turns a description into a real .xlsx. Layouts follow the DepEd forms' columns as far as the
// data TCSMS keeps allows (one address field, no mother tongue / IP / religion columns).
//   SF1  School Register                         one sheet per section
//   SF2  Daily Attendance Report of Learners     one sheet per section and month
//   SF5  Report on Promotion and Proficiency     one sheet per section
//   SF10 Learner's Permanent Academic Record     one sheet per learner
import { byLastName } from '../lib/html.js'
import { ACADEMIC_LABELS, DEFAULT_GRADING_SCALE, PASSING_GRADE, SCORE_FIELDS, generalAverage, letterGrade } from '../lib/grades.js'

// The transcript header uses the same names. School ID / district are not stored yet, so they print blank.
export const SCHOOL = {
  name: 'THOMPSON CHRISTIAN SCHOOL, INC.',
  region: 'Region XI',
  division: 'Division of Davao City',
  district: '',
  schoolId: ''
}

const MONTHS = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
const WEEKDAY = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa']

export const sexOf = person =>
  /^f/i.test(person?.gender || person?.sex || '') ? 'F' : /^m/i.test(person?.gender || person?.sex || '') ? 'M' : ''
// DepEd lists male learners first, then female, each A-Z by last name.
export function bySex(students = []) {
  const sorted = [...students].sort(byLastName)
  return { males: sorted.filter(s => sexOf(s) === 'M'), females: sorted.filter(s => sexOf(s) !== 'M') }
}
const fullName = s => `${s.last_name || ''}, ${s.first_name || ''}${s.middle_name ? ` ${s.middle_name}` : ''}`.trim()
const mdy = iso => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '')

// Age in whole years on a date ('YYYY-MM-DD'). DepEd counts age as of 31 October of the school year.
export function ageOn(birth, on) {
  if (!birth || !on) return ''
  const [by, bm, bd] = birth.slice(0, 10).split('-').map(Number)
  const [y, m, d] = on.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}
const october31 = schoolYear => `${String(schoolYear).slice(0, 4)}-10-31`

// Title block shared by every form; `fields` are [label, value] pairs printed two per row.
function headerRows(title, subtitle, fields, width) {
  const rows = [[title], [subtitle], [`${SCHOOL.name}  ·  ${SCHOOL.region}  ·  ${SCHOOL.division}`], []]
  for (let i = 0; i < fields.length; i += 2) rows.push([...fields[i], ...(fields[i + 1] || [])])
  rows.push([])
  return { rows, merges: [0, 1, 2].map(r => [r, 0, r, width - 1]) }
}
const sectionFields = section => [
  ['School ID', SCHOOL.schoolId],
  ['School Year', section.academic_year],
  ['Grade Level', section.grade_level],
  ['Section', section.section_name],
  ...(section.strand ? [['Strand', section.strand]] : []),
  ['Adviser', section.faculty_assigned || '']
]

// ---- SF1 School Register --------------------------------------------------------------------------------------
export function sf1Sheet({ section, students }) {
  const columns = [
    'No.',
    'LRN / Student No.',
    'Name (Last, First, Middle)',
    'Sex',
    'Birth Date',
    'Age (31 Oct)',
    'Address',
    'Parent / Guardian',
    'Relationship',
    'Contact No.',
    'Remarks'
  ]
  const head = headerRows('School Form 1 (SF 1) School Register', 'List of enrolled learners', sectionFields(section), columns.length)
  const rows = [...head.rows, columns]
  const headerRow = rows.length - 1
  const on = october31(section.academic_year)
  const { males, females } = bySex(students)
  const learner = (s, n) => [
    n,
    s.lrn_number || '',
    fullName(s),
    sexOf(s),
    mdy(s.date_of_birth),
    ageOn(s.date_of_birth, on),
    s.address || '',
    s.guardian_name || '',
    s.guardian_relationship || '',
    s.guardian_phone || s.contact_number || '',
    s.enrollment_status && s.enrollment_status !== 'Enrolled' ? s.enrollment_status : ''
  ]
  const bold = []
  males.forEach((s, i) => rows.push(learner(s, i + 1)))
  bold.push(rows.push(['', '', `TOTAL MALE: ${males.length}`]) - 1)
  females.forEach((s, i) => rows.push(learner(s, i + 1)))
  bold.push(rows.push(['', '', `TOTAL FEMALE: ${females.length}`]) - 1)
  bold.push(rows.push(['', '', `COMBINED: ${males.length + females.length}`]) - 1)
  return { name: 'SF1', rows, merges: head.merges, headerRow, bold, widths: [5, 18, 32, 5, 12, 8, 36, 26, 13, 15, 14] }
}

// ---- SF2 Daily Attendance ---------------------------------------------------------------------------------------
// School days of a month: Monday-Friday inside [start, end] that are not holidays, as 'YYYY-MM-DD'.
export function schoolDatesInMonth(year, month, { start = '', end = '9999', holidays = [] } = {}) {
  const off = new Set(holidays)
  const dates = []
  for (let day = 1; day <= 31; day++) {
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCMonth() !== month - 1) break
    const iso = date.toISOString().slice(0, 10)
    const weekday = date.getUTCDay()
    if (weekday > 0 && weekday < 6 && iso >= start && iso <= end && !off.has(iso)) dates.push(iso)
  }
  return dates
}

// attendance: [{ student_id, attendance_date, status }] (only non-Present rows are needed). A date with any
// Absent class is an absent day ("x"); otherwise any Late class marks it tardy ("T"). Present stays blank.
export function sf2Sheet({ section, students, year, month, attendance = [], holidays = [], span = {} }) {
  const dates = schoolDatesInMonth(year, month, { ...span, holidays })
  const mark = new Map()
  for (const row of attendance) {
    const key = `${row.student_id}|${row.attendance_date}`
    if (row.status === 'Absent') mark.set(key, 'x')
    else if (row.status === 'Late' && mark.get(key) !== 'x') mark.set(key, 'T')
  }
  const columns = [
    'No.',
    'Name (Last, First, Middle)',
    ...dates.map(d => `${Number(d.slice(8))} ${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}`),
    'Absent',
    'Tardy',
    'Remarks'
  ]
  const head = headerRows(
    'School Form 2 (SF2) Daily Attendance Report of Learners',
    `Month of ${MONTHS[month]} ${year}  ·  x = absent, T = tardy, blank = present`,
    [...sectionFields(section), ['School days this month', dates.length]],
    columns.length
  )
  const rows = [...head.rows, columns]
  const headerRow = rows.length - 1
  const { males, females } = bySex(students)
  const bold = []
  const dayTotals = sex => dates.map(d => sex.filter(s => mark.get(`${s.student_id}|${d}`) !== 'x').length)
  const learner = (s, n) => {
    const marks = dates.map(d => mark.get(`${s.student_id}|${d}`) || '')
    return [n, fullName(s), ...marks, marks.filter(m => m === 'x').length, marks.filter(m => m === 'T').length, '']
  }
  males.forEach((s, i) => rows.push(learner(s, i + 1)))
  bold.push(rows.push(['', `MALE | TOTAL Per Day (present)`, ...dayTotals(males), '', '', '']) - 1)
  females.forEach((s, i) => rows.push(learner(s, i + 1)))
  bold.push(rows.push(['', `FEMALE | TOTAL Per Day (present)`, ...dayTotals(females), '', '', '']) - 1)
  bold.push(rows.push(['', 'COMBINED TOTAL Per Day (present)', ...dayTotals([...males, ...females]), '', '', '']) - 1)
  return {
    name: `SF2 ${MONTHS[month].slice(0, 3)}`,
    rows,
    merges: head.merges,
    headerRow,
    bold,
    widths: [5, 32, ...dates.map(() => 5), 8, 8, 14]
  }
}

// ---- SF5 Promotion and Level of Proficiency ---------------------------------------------------------------------
const ACTION = { promoted: 'PROMOTED', retained: 'RETAINED', incomplete: 'INCOMPLETE' }
// promotions: Map(student_id -> promotion_logs.result). Without a logged result the action is worked out from the
// final grades (all passed -> PROMOTED, any below passing -> RETAINED), marked "(provisional)".
export function sf5Sheet({ section, students, grades = [], promotions = new Map(), scale = DEFAULT_GRADING_SCALE }) {
  const columns = [
    'No.',
    'LRN / Student No.',
    'Name (Last, First, Middle)',
    'Sex',
    'General Average',
    'Action Taken',
    'Subjects below passing',
    'Proficiency'
  ]
  const head = headerRows(
    'School Form 5 (SF 5) Report on Promotion and Level of Proficiency',
    'End of school year',
    sectionFields(section),
    columns.length
  )
  const rows = [...head.rows, columns]
  const headerRow = rows.length - 1
  const { males, females } = bySex(students)
  const summary = {}
  const bold = []
  const learner = (s, n) => {
    const mine = grades.filter(g => g.student_id === s.student_id && g.grade != null)
    const average = generalAverage(mine)
    const failed = mine.filter(g => Number(g.grade) < PASSING_GRADE).map(g => g.subject)
    const logged = ACTION[promotions.get(s.student_id)]
    const action =
      logged || (average == null ? 'INCOMPLETE (provisional)' : failed.length ? 'RETAINED (provisional)' : 'PROMOTED (provisional)')
    const proficiency = average == null ? '' : letterGrade(average, scale)?.descriptor || ''
    const key = `${action.split(' ')[0]}|${sexOf(s) || 'F'}`
    summary[key] = (summary[key] || 0) + 1
    if (proficiency) summary[`${proficiency}|${sexOf(s) || 'F'}`] = (summary[`${proficiency}|${sexOf(s) || 'F'}`] || 0) + 1
    return [n, s.lrn_number || '', fullName(s), sexOf(s), average ?? '', action, failed.join(', '), proficiency]
  }
  males.forEach((s, i) => rows.push(learner(s, i + 1)))
  females.forEach((s, i) => rows.push(learner(s, i + 1)))
  rows.push([])
  bold.push(rows.push(['', '', 'SUMMARY', 'Male', 'Female', 'Total']) - 1)
  const count = (label, sex) => summary[`${label}|${sex}`] || 0
  const proficiencyLabels = [...new Set(scale.map(band => band.descriptor))]
  for (const label of ['PROMOTED', 'RETAINED', 'INCOMPLETE', ...proficiencyLabels]) {
    const m = count(label, 'M')
    const f = count(label, 'F')
    rows.push(['', '', label, m, f, m + f])
  }
  return { name: 'SF5', rows, merges: head.merges, headerRow, bold, widths: [5, 18, 32, 6, 10, 26, 32, 26] }
}

// ---- SF10 Learner's Permanent Academic Record --------------------------------------------------------------------
// history: every academic_history row of the learner; enrollments: [{ school_year, grade_level, sections: { section_name } }]
export function sf10Sheet({ student, history = [], enrollments = [] }) {
  const quarters = SCORE_FIELDS.filter(field => field !== 'midterm' && field !== 'final')
  const columns = ['Learning Area', ...quarters.map(field => ACADEMIC_LABELS[field]), 'Final Rating', 'Remarks']
  const head = headerRows(
    "School Form 10 (SF10) Learner's Permanent Academic Record",
    'Formerly Form 137',
    [
      ['Name', fullName(student)],
      ['LRN / Student No.', student.lrn_number || ''],
      ['Sex', sexOf(student)],
      ['Birth Date', mdy(student.date_of_birth)],
      ['Address', student.address || ''],
      ['Parent / Guardian', student.guardian_name || ''],
      ['Status', student.enrollment_status || '']
    ],
    columns.length
  )
  const rows = [...head.rows]
  const merges = [...head.merges]
  const bold = []
  const tableHeaders = []
  const years = [...new Set(history.map(row => row.school_year).filter(Boolean))].sort()
  for (const year of years) {
    const enrollment = enrollments.find(row => row.school_year === year)
    const yearRows = history.filter(row => row.school_year === year).sort((a, b) => String(a.subject).localeCompare(String(b.subject)))
    const title = `School Year ${year}  ·  Grade ${enrollment?.grade_level ?? ''}  ·  Section ${enrollment?.sections?.section_name || ''}`
    merges.push([rows.length, 0, rows.length, columns.length - 1])
    bold.push(rows.push([title]) - 1)
    tableHeaders.push(rows.push(columns) - 1)
    for (const row of yearRows) {
      const final = row.grade ?? row.final ?? ''
      rows.push([
        row.subject,
        ...quarters.map(field => row[field] ?? ''),
        final,
        row.remarks || (final === '' ? '' : Number(final) >= PASSING_GRADE ? 'Passed' : 'Failed')
      ])
    }
    const average = generalAverage(yearRows)
    bold.push(
      rows.push([
        'General Average',
        ...quarters.map(() => ''),
        average ?? '',
        average == null ? '' : average >= PASSING_GRADE ? 'Promoted' : 'Retained'
      ]) - 1
    )
    rows.push([])
  }
  if (!years.length) rows.push(['No academic records yet.'])
  const name = `${student.last_name || 'Learner'} ${student.first_name || ''}`
    .replace(/[\\/?*[\]:]/g, '')
    .trim()
    .slice(0, 28)
  return { name, rows, merges, headerRow: tableHeaders[0] ?? null, tableHeaders, bold, widths: [34, 8, 8, 8, 8, 12, 14] }
}

// Excel sheet names must be unique and at most 31 characters.
export function uniqueSheetNames(specs) {
  const used = new Set()
  return specs.map(spec => {
    let name = spec.name.slice(0, 31) || 'Sheet'
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${spec.name.slice(0, 31 - String(n).length - 1)} ${n}`
    used.add(name.toLowerCase())
    return { ...spec, name }
  })
}
