// Runnable checks for faculty grade entry: npm run check:faculty
// 1) the pure grade-sheet helpers, 2) the faculty page markup and inline script wiring.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SCORE_FIELDS, classOptions, currentSchoolYear, derivedGrade, generalAverage, gradeRecord, letterGrade } from '../grades.js'

// --- the grade sheet helpers ---------------------------------------------
assert.equal(currentSchoolYear(new Date(2026, 8, 18)), '2026-2027', 'September opens a school year')
assert.equal(currentSchoolYear(new Date(2027, 4, 31)), '2026-2027', 'May still belongs to the year that began in June')
assert.equal(currentSchoolYear(new Date(2026, 5, 1)), '2026-2027', 'June opens the new school year')

const schedules = [
  { section_id: 3, subject_id: 7, sections: { section_name: 'St. Mark' }, subjects: { subject_name: 'Mathematics' } },
  { section_id: 3, subject_id: 7, sections: { section_name: 'St. Mark' }, subjects: { subject_name: 'Mathematics' } },
  { section_id: 4, subject_id: 8, sections: { section_name: 'St. Luke' }, subjects: { subject_name: 'Science' } }
]
const options = classOptions(schedules)
assert.deepEqual(options.map(option => option.key), ['3:7', '4:8'], 'repeated weekday schedules collapse into one class')
assert.equal(options[0].subject_name, 'Mathematics')
assert.equal(options[1].label, 'St. Luke - Science')

assert.equal(gradeRecord(11, {}), null, 'an untouched row is not submitted')
assert.equal(gradeRecord(11, { first_sem_q1: '   ' }), null, 'blank scores are ignored')
assert.deepEqual(gradeRecord(11, { final: '88.5', remarks: ' Good progress ' }), {
  student_id: 11, first_sem_q1: null, first_sem_q2: null, second_sem_q1: null, second_sem_q2: null,
  midterm: null, final: 88.5, letter_grade: null, remarks: 'Good progress'
})
assert.deepEqual(gradeRecord(11, { midterm: 'abc' }), null, 'a row with only an unparseable score is treated as untouched')
assert.equal(gradeRecord(11, { final: '90', midterm: 'abc' }).midterm, null, 'unparseable scores are dropped instead of sent as NaN')

const quarters = { first_sem_q1: 80, first_sem_q2: 90, second_sem_q1: 70, second_sem_q2: 80 }
assert.equal(derivedGrade({ ...quarters, midterm: 99, final: 90 }), 90, 'Final wins')
assert.equal(derivedGrade({ ...quarters, midterm: 99, final: null }), 80, 'all four quarters average')
assert.equal(derivedGrade({ final: null, first_sem_q1: 80, midterm: 75 }), 75, 'Midterm is the last resort')
assert.equal(derivedGrade({ final: null, first_sem_q1: 80 }), null, 'an incomplete quarter set cannot produce a grade')
assert.deepEqual(SCORE_FIELDS, ['first_sem_q1', 'first_sem_q2', 'second_sem_q1', 'second_sem_q2', 'midterm', 'final'])

// --- the letter-grade scale and general average ---------------------------
assert.equal(letterGrade(97).letter, 'A+')
assert.equal(letterGrade(96).letter, 'A')
assert.equal(letterGrade(91).letter, 'B+')
assert.equal(letterGrade(82).letter, 'B')
assert.equal(letterGrade(78).letter, 'C+')
assert.equal(letterGrade(75).letter, 'C', '75 is the passing mark batch_promote_students() enforces')
assert.equal(letterGrade(74.9).letter, 'F')
assert.equal(letterGrade(null), null)
assert.equal(generalAverage([{ grade: 80 }, { grade: 90 }, { grade: null }]), 85)
assert.equal(generalAverage([]), null)

// --- the faculty page ----------------------------------------------------
const root = resolve(import.meta.dirname, '..')
const html = readFileSync(join(root, 'faculty-dashboard.html'), 'utf8')
const scriptStart = html.indexOf('<script type="module">') + '<script type="module">'.length
const script = html.slice(scriptStart, html.lastIndexOf('</script>'))
assert.ok(script.includes('save_faculty_grades'), 'grades must be saved through the validated RPC')
assert.ok(script.includes("from './grades.js'"), 'the page must reuse the grade helpers')
const ids = [...new Set([...script.matchAll(/\$\('([\w-]+)'\)/g)].map(match => match[1]))]
assert.ok(ids.length >= 8, 'the grade sheet must be wired to its elements')
const missing = ids.filter(id => !html.includes(`id="${id}"`))
assert.deepEqual(missing, [], `faculty-dashboard.html references missing element ids: ${missing.join(', ')}`)

// Tag balance catches a broken hand edit without a browser.
const tags = ['div', 'section', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'select', 'button', 'p', 'small']
tags.forEach(tag => {
  const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length
  const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length
  assert.equal(open, close, `unbalanced ${tag} in faculty-dashboard.html`)
})

const folder = mkdtempSync(join(tmpdir(), 'faculty-page-'))
try {
  const file = join(folder, 'faculty-page.mjs')
  writeFileSync(file, script)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  assert.equal(result.status, 0, `faculty-dashboard.html inline script has a syntax error: ${String(result.stderr).slice(-600)}`)
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

console.log('faculty grade checks passed')