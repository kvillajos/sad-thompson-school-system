// Shared table sorting: tap a column header to sort by it, tap it again to reverse.
// Every table starts on its name column, A-Z (a table led by a date column starts newest first).
// The pure helpers below stay free of app imports so scripts/check-table-sort.mjs
// can assert them in Node without a DOM.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const NAME_HEADERS = ['name', 'student', 'student name', 'full name']
// "10/4/2026, 7:10 PM" or "2026-10-04": compared as dates so AM/PM and months order correctly.
const DATE_LIKE = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/
// Logs and history (When, Date, Posted...) open newest first; everything else A-Z.
const DATE_HEADER = /^(when|date|posted|requested|sent|submitted|created|updated|last saved)\b/i
export const defaultDirection = header => (DATE_HEADER.test(String(header ?? '').trim()) ? -1 : 1)

export function compareValues(left, right) {
  const a = String(left ?? '').trim()
  const b = String(right ?? '').trim()
  if (!a && !b) return 0
  if (!a) return 1 // blanks always sort last, either direction
  if (!b) return -1
  const numberA = Number(a.replace(/[,\s]/g, ''))
  const numberB = Number(b.replace(/[,\s]/g, ''))
  if (Number.isFinite(numberA) && Number.isFinite(numberB)) return numberA - numberB
  if (DATE_LIKE.test(a) && DATE_LIKE.test(b)) {
    const timeA = Date.parse(a)
    const timeB = Date.parse(b)
    if (Number.isFinite(timeA) && Number.isFinite(timeB)) return timeA - timeB
  }
  return collator.compare(a, b)
}

// Prefers an exact "Name"/"Student" header, then any header containing "name",
// then the first column. So "Student No." loses to the "Student" name column.
export function pickDefaultColumn(headers) {
  const labels = headers.map(header => String(header ?? '').trim().toLowerCase())
  const exact = labels.findIndex(label => NAME_HEADERS.includes(label))
  if (exact !== -1) return exact
  const fuzzy = labels.findIndex(label => label.includes('name'))
  return fuzzy === -1 ? 0 : fuzzy
}

const sortState = new WeakMap()

function headerCells(table) {
  return [...(table.tHead?.rows?.[0]?.cells || [])]
}

function cellValue(row, column) {
  const cell = row.cells[column]
  return cell ? (cell.dataset.sort ?? cell.textContent) : ''
}

function prepareHeaders(table) {
  headerCells(table).forEach(header => {
    if (header.dataset.sortable) return
    header.dataset.sortable = 'true'
    header.classList.add('sortable')
    header.tabIndex = 0
    header.title = 'Click to sort'
  })
}

function paintHeaders(table, column, direction) {
  headerCells(table).forEach((header, index) => {
    header.classList.toggle('sort-asc', index === column && direction === 1)
    header.classList.toggle('sort-desc', index === column && direction === -1)
    if (index === column) header.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending')
    else header.removeAttribute('aria-sort')
  })
}

function sortTable(table, column, direction) {
  const body = table.tBodies[0]
  if (!body) return
  const rows = [...body.rows].filter(row => row.cells.length > 1 && !row.querySelector('td[colspan]'))
  if (rows.length > 1) {
    const sorted = [...rows].sort((a, b) => direction * compareValues(cellValue(a, column), cellValue(b, column)))
    // Only write to the DOM when the order really changes, so the observer below settles.
    if (!sorted.every((row, position) => row === rows[position])) sorted.forEach(row => body.appendChild(row))
  }
  paintHeaders(table, column, direction)
}

function sortByColumn(table, column) {
  const current = sortState.get(table)
  const direction = current && current.column === column && current.direction === 1 ? -1 : 1
  sortState.set(table, { column, direction })
  sortTable(table, column, direction)
}

export function installTableSort(doc = document) {
  if (!doc || doc.__tcsmsTableSortInstalled) return
  doc.__tcsmsTableSortInstalled = true

  const columnOf = header => [...header.parentElement.children].indexOf(header)

  doc.addEventListener('click', event => {
    const header = event.target.closest?.('th')
    if (!header || !header.closest('table')) return
    const table = header.closest('table')
    if (table.hasAttribute?.('data-no-sort')) return
    if (!table.tHead) return
    prepareHeaders(table)
    sortByColumn(table, columnOf(header))
  })

  doc.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const header = event.target.closest?.('th.sortable')
    if (!header) return
    event.preventDefault()
    sortByColumn(header.closest('table'), columnOf(header))
  })

  const refresh = () => {
    doc.querySelectorAll('table').forEach(table => {
      if (!table.tHead || !table.tBodies[0] || table.hasAttribute?.('data-no-sort')) return
      prepareHeaders(table)
      const state = sortState.get(table)
      if (state) sortTable(table, state.column, state.direction)
      else {
        const labels = headerCells(table).map(cell => cell.textContent)
        const column = pickDefaultColumn(labels)
        const direction = defaultDirection(labels[column])
        sortState.set(table, { column, direction })
        sortTable(table, column, direction)
      }
    })
  }

  const schedule = () => refresh()

  // Tables re-render through innerHTML all over this app, so re-apply the remembered
  // sort whenever rows land. ponytail: one document-wide observer for ~20 small tables;
  // swap it for per-tbody observers if a large/virtualized table ever shows up.
  const scope = doc.documentElement || doc.body
  if (typeof MutationObserver !== 'undefined' && scope) {
    new MutationObserver(schedule).observe(scope, { childList: true, subtree: true })
  }
  refresh()
}
