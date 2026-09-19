// Runnable check for the shared table sorter's pure helpers: npm run check:sort
import assert from 'node:assert/strict'
import { compareValues, pickDefaultColumn, installTableSort } from '../table-sort.js'

// Text: case-insensitive A-Z.
assert.ok(compareValues('apple', 'Banana') < 0)
assert.ok(compareValues('Zara', 'bella') > 0)
assert.equal(compareValues('Grade 1', 'Grade 1'), 0)

// Numbers sort as numbers, not as text.
assert.ok(compareValues('Grade 2', 'Grade 10') < 0)
assert.ok(compareValues('9', '10') < 0)
assert.ok(compareValues('1,200', '900') > 0)

// Blanks always land last.
assert.ok(compareValues('', 'apple') > 0)
assert.ok(compareValues('apple', '') < 0)
assert.equal(compareValues('', '  '), 0)

// Default column: exact Name-ish header, else any header containing "name", else column 0.
assert.equal(pickDefaultColumn(['Student ID', 'Name', 'Year']), 1)
assert.equal(pickDefaultColumn(['Section Name', 'Grade', 'Students']), 0)
assert.equal(pickDefaultColumn(['Student', 'Grade', 'Status']), 0)
assert.equal(pickDefaultColumn(['Student No.', 'Student', 'School Year']), 1)
assert.equal(pickDefaultColumn(['Username', 'Email', 'Role']), 0)
assert.equal(pickDefaultColumn(['School Year', 'Subject', 'Grade']), 0)
assert.equal(pickDefaultColumn([]), 0)

// --- Sorting behaviour, exercised against a minimal fake DOM -----------------
// ponytail: hand-rolled stub of only the nodes installTableSort touches, so the
// wiring can be checked without a browser or a test framework.
const makeClassList = () => {
  const classes = new Set()
  return { add: name => classes.add(name), contains: name => classes.has(name), toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) }
}
const makeCell = (text, isPlaceholder = false) => {
  const attributes = {}
  return {
    textContent: text, dataset: {}, classList: makeClassList(),
    parentElement: null, closest: () => null,
    querySelector: () => (isPlaceholder ? { placeholder: true } : null),
    setAttribute: (name, value) => { attributes[name] = value },
    removeAttribute: name => { delete attributes[name] },
    getAttribute: name => attributes[name] ?? null
  }
}

function makeTable(labels, rowLabels) {
  const headerCells = labels.map(label => makeCell(label))
  const rows = rowLabels.map(label => ({ label, cells: label.map(value => makeCell(value)), querySelector: () => null }))
  let order = [...rows]
  let writes = 0
  const tBody = {
    get rows() { return order },
    get writes() { return writes },
    appendChild(row) { writes += 1; order = [...order.filter(item => item !== row), row] },
    setOrder(labelsInOrder) { order = labelsInOrder.map(label => rows.find(row => row.label[1] === label)) }
  }
  const table = { tHead: { rows: [{ cells: headerCells }] }, tBodies: [tBody] }
  headerCells.forEach(cell => {
    cell.parentElement = { children: headerCells }
    cell.closest = selector => (selector.startsWith('th') ? cell : selector === 'table' ? table : null)
  })
  return { table, headers: headerCells, rows, tBody, order: () => order.map(row => row.label.join('|')) }
}

function makeDoc(tables) {
  const handlers = {}
  const doc = {
    __tcsmsTableSortInstalled: false,
    body: {},
    addEventListener: (type, handler) => { (handlers[type] ||= []).push(handler) },
    querySelectorAll: selector => (selector === 'table' ? tables : [])
  }
  doc.fire = (type, target, extra = {}) => handlers[type].forEach(handler => handler({ target, preventDefault() {}, ...extra }))
  return doc
}

const students = makeTable(['Student ID', 'Name', 'Grade'], [['3', 'Charlie', 'Grade 2'], ['1', 'Alice', 'Grade 10'], ['2', 'Bob', 'Grade 1']])
const labelsOnly = makeTable(['Section Name', 'Grade'], [['Zeta', '1'], ['Alpha', '2']])
const placeholder = makeTable(['Name', 'Grade'], [])
// A single placeholder row (colspan) must never be reordered or lose its column count.
placeholder.table.tBodies[0].appendChild({ label: ['No students'], cells: [makeCell('No students')], querySelector: selector => (selector === 'td[colspan]' ? {} : null) })

const doc = makeDoc([students.table, labelsOnly.table, placeholder.table])
// The sorter re-applies itself after every re-render through this observer; stub it
// so the no-endless-loop guarantee can be asserted here.
let notifyMutation = () => {}
globalThis.MutationObserver = class { constructor(callback) { notifyMutation = callback } observe() {} }
globalThis.window = { requestAnimationFrame: callback => callback() }

installTableSort(doc)

// Default order is the name column A-Z, and that column shows the ascending indicator.
assert.deepEqual(students.order(), ['1|Alice|Grade 10', '2|Bob|Grade 1', '3|Charlie|Grade 2'])
assert.equal(students.headers[1].dataset.sortable, 'true')
assert.ok(students.headers[1].classList.contains('sort-asc'))
assert.equal(students.headers[1].getAttribute('aria-sort'), 'ascending')

// Tables without a name header fall back to the first column.
assert.deepEqual(labelsOnly.order(), ['Alpha|2', 'Zeta|1'])

// Re-applying the sort to an already-sorted table writes nothing to the DOM.
const writesAfterInitialSort = students.tBody.writes
notifyMutation()
assert.equal(students.tBody.writes, writesAfterInitialSort)

// A re-render that lands out of order gets sorted again.
students.tBody.setOrder(['Charlie', 'Alice', 'Bob'])
notifyMutation()
assert.deepEqual(students.order(), ['1|Alice|Grade 10', '2|Bob|Grade 1', '3|Charlie|Grade 2'])
assert.ok(students.tBody.writes > writesAfterInitialSort)

// Tapping a header sorts by it, tapping it again reverses, and other headers reset.
doc.fire('click', students.headers[2])
assert.deepEqual(students.order(), ['2|Bob|Grade 1', '3|Charlie|Grade 2', '1|Alice|Grade 10'])
assert.ok(students.headers[2].classList.contains('sort-asc'))
assert.ok(!students.headers[1].classList.contains('sort-asc'))
doc.fire('click', students.headers[2])
assert.deepEqual(students.order(), ['1|Alice|Grade 10', '3|Charlie|Grade 2', '2|Bob|Grade 1'])
assert.ok(students.headers[2].classList.contains('sort-desc'))
assert.equal(students.headers[2].getAttribute('aria-sort'), 'descending')

// Keyboard users get the same behaviour (Enter on the header cell, as a browser sends it).
doc.fire('keydown', students.headers[1], { key: 'Enter' })
assert.deepEqual(students.order(), ['1|Alice|Grade 10', '2|Bob|Grade 1', '3|Charlie|Grade 2'])
assert.ok(students.headers[1].classList.contains('sort-asc'))

// Placeholder rows (td[colspan]) are never treated as data rows.
assert.deepEqual(placeholder.order(), ['No students'])
assert.equal(placeholder.headers[0].dataset.sortable, 'true')
assert.equal(placeholder.tBody.writes, 1) // the one append that added the placeholder

console.log('table-sort checks passed')
