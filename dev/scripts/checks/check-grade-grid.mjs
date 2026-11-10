// Runnable checks for the editable grade upload grid: npm run check:grade-grid
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { GRID_SCORE_FIELDS, scaleLetters, validateGridRow } from '../../../shared/lib/grade-grid.js'
import { parseGradeCsv } from '../../../shared/lib/grades.js'

// --- the pure validation behind the grid ----------------------------------
assert.deepEqual(GRID_SCORE_FIELDS, ['first_sem_q1', 'first_sem_q2', 'second_sem_q1', 'second_sem_q2', 'final'])
assert.deepEqual(scaleLetters('2026-2027'), ['A', 'B', 'C', 'D', 'F'])

const clean = validateGridRow(11, { first_sem_q1: '80', first_sem_q2: '90', second_sem_q1: '70', second_sem_q2: '80' })
assert.deepEqual(clean.errors, [])
assert.deepEqual(clean.fieldErrors, {})
assert.equal(clean.grade, 80)
assert.equal(clean.letter, 'C')
assert.equal(clean.record.student_id, 11)
assert.equal(clean.record.letter_grade, 'C', 'a clean row carries the default letter, like the grade sheet')

const typo = validateGridRow(12, { first_sem_q1: '8O', final: '90' })
assert.deepEqual(typo.errors, ['first_sem_q1 must be a whole number from 0 to 100'])
assert.deepEqual(Object.keys(typo.fieldErrors), ['first_sem_q1'], 'only the bad cell is flagged')
assert.equal(typo.record, null, 'a row with a bad cell is not saveable')

const tooHigh = validateGridRow(13, { final: '150' })
assert.ok(tooHigh.fieldErrors.final && tooHigh.record === null)
assert.ok(validateGridRow(13, { first_sem_q1: '-5' }).fieldErrors.first_sem_q1, 'negative scores are flagged')
assert.ok(validateGridRow(13, { first_sem_q1: '80.5' }).fieldErrors.first_sem_q1, 'decimals are flagged, like the CSV parser')

const empty = validateGridRow(14, {})
assert.deepEqual(empty.errors, ['no scores were provided'])
assert.ok(empty.fieldErrors.letter_grade, 'a row with no scores is missing its letter grade')
assert.equal(empty.record, null)

const badLetter = validateGridRow(15, { final: '90', letter_grade: 'Z' })
assert.ok(badLetter.fieldErrors.letter_grade && badLetter.record === null, 'a letter outside the scale is flagged')
assert.equal(validateGridRow(15, { final: '90', letter_grade: 'b' }).record.letter_grade, 'B', 'a typed letter is kept, upper-cased')
assert.equal(validateGridRow(16, { second_sem_q1: '88' }).record.second_sem_q1, 88, 'a single quarter is saveable mid-year')

// Fixing a cell clears its error, as the grid does on every keystroke.
const fixed = validateGridRow(12, { first_sem_q1: '80', final: '90' })
assert.deepEqual(fixed.errors, [])
assert.equal(fixed.record.final, 90)

// The grid agrees with the CSV parser on the same raw cells.
const csv = ['student_id,first_sem_q1,final', '21,8O,90', '22,85,', '23,,'].join('\n')
parseGradeCsv(csv).forEach(row => {
  assert.ok(row.values, 'parseGradeCsv keeps the raw cell text for the grid')
  const grid = validateGridRow(row.student_id, row.values)
  assert.deepEqual(
    grid.errors,
    row.errors,
    `row ${row.row}: grid and CSV parser must report the same problems`
  )
})

// --- the upload page wiring ------------------------------------------------
const root = resolve(import.meta.dirname, '../../..')
const page = readFileSync(join(root, 'role-faculty', 'faculty-upload-panel.js'), 'utf8')
const grid = readFileSync(join(root, 'role-faculty', 'faculty-grades-upload.js'), 'utf8')
assert.ok(page.includes("from './faculty-grades-upload.js'") && page.includes('mountEditableGrid('), 'the page mounts the grid')
assert.equal(page.split('mountEditableGrid(').length - 1, 1, 'the page makes a single mount call')
assert.ok(page.includes('!row.errors.length'), 'save still filters to error-free rows only')
assert.ok(grid.includes('validateGridRow') && grid.includes('data-field'), 'the grid validates through the shared helper')

const folder = mkdtempSync(join(tmpdir(), 'grade-grid-'))
try {
  for (const name of ['faculty-grades-upload', 'faculty-upload-panel']) {
    const file = join(folder, `${name}.mjs`)
    writeFileSync(file, name === 'faculty-grades-upload' ? grid : page)
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert.equal(result.status, 0, `${name}.js has a syntax error: ${String(result.stderr).slice(-600)}`)
  }
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

console.log('grade grid checks passed')
