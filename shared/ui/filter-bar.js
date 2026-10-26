// Shared filter bar for list pages: one dropdown per filter (School Year, Grade, Strand, ...) plus Export CSV,
// mounted into a page's .admin-filterbar. Options come from the loaded rows (no extra queries), the School Year
// filter starts on the active school year, and apply(rows) keeps the rows that pass every filter.
// filterOptions and matchesFilters are pure so dev/scripts/checks/check-filter-bar.mjs can test them in Node.
import { currentSchoolYear } from '../lib/grades.js'
import { escapeHtml, gradeLabel } from '../lib/html.js'
import { downloadTableCsv } from './table-copy.js'

const text = value => String(value ?? '')
const valuesOf = (filter, row) =>
  [filter.get(row)]
    .flat()
    .filter(value => value != null && value !== '')
    .map(text)

// Ready-made filters; `get` reads the value from one row (a value or an array of values).
export const yearFilter = get => {
  const active = currentSchoolYear()
  return {
    key: 'year',
    name: 'School year',
    all: 'All years',
    get,
    initial: active,
    sort: 'desc',
    label: year => (year === active ? `Active school year (${year})` : year)
  }
}
export const gradeFilter = get => ({
  key: 'grade',
  name: 'Grade',
  all: 'All grades',
  get,
  sort: 'number',
  label: grade => gradeLabel(Number(grade))
})
export const strandFilter = get => ({ key: 'strand', name: 'Strand', all: 'All strands', get })

// The choices for one filter: its fixed `options`, or every value found in the rows (plus the initial value).
export function filterOptions(rows, filter) {
  if (filter.options) return filter.options.map(([value]) => text(value))
  const values = new Set(rows.flatMap(row => valuesOf(filter, row)))
  if (filter.initial) values.add(text(filter.initial))
  const list = [...values].sort(filter.sort === 'number' ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b))
  return filter.sort === 'desc' ? list.reverse() : list
}

// values: { [filter.key]: chosen value or '' for "All" }
export const matchesFilters = (row, filters, values) =>
  filters.every(filter => !values[filter.key] || valuesOf(filter, row).includes(values[filter.key]))

// filters: [{ key, name?: 'Grade' (screen-reader label; defaults to the "All" text), all: 'All grades', get: row => value, label?: value => text, options?: [[value, text]],
//   initial?, sort?: 'number' | 'desc' }]. onChange runs after any choice; exportTable (a table or a function
// returning one) adds Export CSV, which downloads exactly the rows the page rendered.
export function mountFilterBar(host, { filters, onChange, exportTable, filename = 'export' }) {
  const values = Object.fromEntries(filters.map(filter => [filter.key, text(filter.initial)]))
  const selects = filters.map(filter => {
    const select = document.createElement('select')
    select.setAttribute('aria-label', filter.name || filter.all)
    select.onchange = () => {
      values[filter.key] = select.value
      onChange()
    }
    return select
  })
  host.append(...selects)
  if (exportTable) {
    const button = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'admin-secondary',
      textContent: 'Export CSV'
    })
    button.onclick = () => downloadTableCsv(typeof exportTable === 'function' ? exportTable() : exportTable, filename)
    host.append(button)
  }
  const bar = {
    values,
    // Rebuild the choices from freshly loaded rows; a choice that no longer exists falls back to "All".
    update(rows) {
      filters.forEach((filter, index) => {
        const options = filterOptions(rows, filter)
        const labels = new Map(filter.options?.map(([value, label]) => [text(value), label]))
        const select = selects[index]
        select.innerHTML =
          `<option value="">${escapeHtml(filter.all)}</option>` +
          options
            .map(
              value => `<option value="${escapeHtml(value)}">${escapeHtml(labels.get(value) ?? filter.label?.(value) ?? value)}</option>`
            )
            .join('')
        if (!options.includes(values[filter.key])) values[filter.key] = ''
        select.value = values[filter.key]
        select.hidden = !options.length
      })
      return bar
    },
    apply: rows => rows.filter(row => matchesFilters(row, filters, values))
  }
  return bar.update([])
}
