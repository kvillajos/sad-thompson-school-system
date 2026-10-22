// Regression guard: fails if any page re-declares its own escapeHtml/escape helper
// instead of importing the shared one from html.js. Plain grep, no parser needed.
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '../../..')
const files = ['*.html', '{auth,role-admin,role-registrar,role-student,role-faculty}/*.{html,js}', 'shared/*/*.js']
  .flatMap(pattern => globSync(pattern, { cwd: root }))
  .filter(name => name.replaceAll('\\', '/') !== 'shared/lib/html.js')

const redeclarePattern = /(?:function\s+escapeHtml\s*\(|const\s+escapeHtml\s*=|const\s+escape\s*=\s*value\s*=>\s*String)/

const offenders = files.filter(name => redeclarePattern.test(readFileSync(resolve(root, name), 'utf8')))

assert.deepEqual(offenders, [], `these files re-declare escapeHtml instead of importing it from html.js: ${offenders.join(', ')}`)

// Grade pickers list the offered grades (grade_levels table via shared/lib/grade-levels.js), so a page must
// not hard-code its own grade list, and every shared picker call must pass grades: OFFERED_GRADES.
const hardCodedGrades = /<option>(Kindergarten|Grade \d+)<\/option>|Array\.from\(\{ length: 1[23] \}/
const gradeLists = files.filter(name => hardCodedGrades.test(readFileSync(resolve(root, name), 'utf8')))
assert.deepEqual(gradeLists, [], `these files hard-code a grade list instead of using OFFERED_GRADES: ${gradeLists.join(', ')}`)
const unfiltered = files.filter(name =>
  [...readFileSync(resolve(root, name), 'utf8').matchAll(/gradeLevel(?:Options|Checkboxes)\(([^)]*)\)/g)].some(
    ([, args]) => !args.includes('OFFERED_GRADES')
  )
)
assert.deepEqual(unfiltered, [], `these grade pickers do not pass grades: OFFERED_GRADES: ${unfiltered.join(', ')}`)
console.log('shared helper checks passed')
