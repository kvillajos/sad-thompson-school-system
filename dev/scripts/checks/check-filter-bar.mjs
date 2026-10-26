// Runnable checks for the shared filter bar's pure helpers: node dev/scripts/checks/check-filter-bar.mjs
import assert from 'node:assert/strict'
import { filterOptions, matchesFilters, yearFilter, gradeFilter, strandFilter } from '../../../shared/ui/filter-bar.js'
import { currentSchoolYear } from '../../../shared/lib/grades.js'

const rows = [
  { academic_year: '2025-2026', grade_level: 10, strand: null },
  { academic_year: '2026-2027', grade_level: 11, strand: 'STEM' },
  { academic_year: '2026-2027', grade_level: 9, strand: null },
  { academic_year: '2024-2025', grade_level: 12, strand: 'ABM', tags: ['STEM', 'ABM'] }
]
const year = yearFilter(row => row.academic_year)
const grade = gradeFilter(row => row.grade_level)
const strand = strandFilter(row => row.strand)

// The active school year is always offered (even with no rows yet), newest first; grades sort as numbers.
assert.equal(filterOptions([], year)[0], currentSchoolYear())
assert.deepEqual(filterOptions(rows, { ...year, initial: null }), ['2026-2027', '2025-2026', '2024-2025'])
assert.deepEqual(filterOptions(rows, grade), ['9', '10', '11', '12'])
assert.deepEqual(filterOptions(rows, strand), ['ABM', 'STEM'], 'empty values are not options')

const filters = [year, grade, strand]
assert.equal(rows.filter(row => matchesFilters(row, filters, { year: '', grade: '', strand: '' })).length, 4, '"All" passes everything')
assert.equal(rows.filter(row => matchesFilters(row, filters, { year: '2026-2027', grade: '', strand: '' })).length, 2)
assert.equal(rows.filter(row => matchesFilters(row, filters, { year: '2026-2027', grade: '11', strand: 'STEM' })).length, 1)
// Array values (a subject's grades or strands) match when any element matches.
const tags = { key: 'tags', all: 'All', get: row => row.tags }
assert.equal(rows.filter(row => matchesFilters(row, [tags], { tags: 'STEM' })).length, 1)
// Fixed options keep their order and labels.
assert.deepEqual(
  filterOptions(rows, {
    key: 'status',
    all: 'All',
    get: row => row.x,
    options: [
      ['true', 'Active'],
      ['false', 'Inactive']
    ]
  }),
  ['true', 'false']
)
console.log('filter bar checks passed')
