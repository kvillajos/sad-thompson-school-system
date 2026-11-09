import { escapeHtml } from '../shared/lib/html.js'
import { GRID_SCORE_FIELDS, scaleLetters, validateGridRow } from '../shared/lib/grade-grid.js'
import { ACADEMIC_LABELS } from '../shared/lib/grades.js'

// Editable grid for the Bulk Upload preview. After a CSV is read, every row becomes a row of inputs so the teacher
// can double-check and fix scores on screen before anything reaches the database. Bad cells are outlined as they
// are typed, and the page's Save button stays disabled until every row is clean.
//
// Mounted once from faculty-upload-page.js; it reads the page's own `rows` through getRows() and keeps each row's
// `record` and `errors` current, so the page's existing save handler (which saves rows with no errors) is unchanged.

const STYLE_ID = 'tcsms-grade-grid-style'
const COLUMNS = ['Row', 'Student ID', ...GRID_SCORE_FIELDS.map(field => ACADEMIC_LABELS[field]), 'Grade', 'Letter', 'Remarks', 'Check']

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .grade-grid input.grid-cell { width: 4.5rem; text-align: center; }
    .grade-grid input.grid-remarks { width: 12rem; }
    .grade-grid .grid-cell-invalid { outline: 2px solid #d33; background: #fdecec; }
    .grade-grid .grid-status-ok { color: #1a7f37; }
    .grade-grid .grid-status-bad { color: #b42318; }
  `
  document.head.append(style)
}

const scoreInput = (index, field, value, locked) =>
  `<td><input class="grid-cell" type="text" inputmode="numeric" maxlength="3" data-field="${field}" aria-label="${escapeHtml(ACADEMIC_LABELS[field])} for row ${index + 1}" value="${escapeHtml(value ?? '')}"${locked ? ' disabled' : ''}></td>`

export function mountEditableGrid({ body, getRows, getSchoolYear, saveButton }) {
  injectStyle()
  const table = body.closest('table')
  table.classList.add('grade-grid')
  table.dataset.noSort = ''
  table.tHead.innerHTML = `<tr>${COLUMNS.map(label => `<th>${label}</th>`).join('')}</tr>`

  const isLocked = row => !row.student_id || Number.isNaN(Number(row.student_id))
  const revalidate = row => {
    const result = validateGridRow(row.student_id, row.values, getSchoolYear())
    row.record = result.record
    row.errors = [...row.gridBase, ...result.errors]
    return result
  }
  // Remember the problems the page found on its own (not on this roster, duplicate student), which editing a score
  // cannot fix; everything validateGridRow() finds is recomputed on each edit.
  const adopt = row => {
    if (row.gridBase) return
    row.values = row.values || {}
    if (isLocked(row)) {
      row.gridBase = [...row.errors]
      return
    }
    const mine = validateGridRow(row.student_id, row.values, getSchoolYear()).errors
    row.gridBase = row.errors.filter(message => !mine.includes(message))
  }
  const refreshSave = () => {
    const rows = getRows()
    saveButton.disabled = !rows.length || rows.some(row => row.errors.length)
  }
  const paintRow = (tr, row, result) => {
    tr.classList.toggle('table-state-error', row.errors.length > 0)
    tr.querySelectorAll('input[data-field], select[data-field]').forEach(input => {
      const message = result?.fieldErrors[input.dataset.field]
      input.classList.toggle('grid-cell-invalid', Boolean(message))
      input.title = message || ''
    })
    tr.querySelector('[data-cell="grade"]').textContent = result?.grade ?? ''
    const auto = tr.querySelector('select[data-field="letter_grade"] option[value=""]')
    if (auto) auto.textContent = result?.letter ? `Auto: ${result.letter}` : 'Auto'
    const status = tr.querySelector('[data-cell="status"]')
    status.textContent = row.errors.join('; ') || 'OK'
    status.className = row.errors.length ? 'grid-status-bad' : 'grid-status-ok'
  }

  const letters = () => scaleLetters(getSchoolYear())
  let rendering = false
  const render = () => {
    rendering = true
    const rows = getRows()
    rows.forEach(adopt)
    body.innerHTML = rows
      .map((row, index) => {
        const locked = isLocked(row)
        const picked = String(row.values.letter_grade ?? '')
          .trim()
          .toUpperCase()
        const options = ['', ...letters()]
          .map(letter => `<option value="${letter}"${letter === picked ? ' selected' : ''}>${letter || 'Auto'}</option>`)
          .join('')
        return `<tr data-index="${index}"><td>${row.row}</td><td>${escapeHtml(row.student_id)}</td>${GRID_SCORE_FIELDS.map(field => scoreInput(index, field, row.values[field], locked)).join('')}<td data-cell="grade"></td><td><select data-field="letter_grade" aria-label="Letter grade for row ${index + 1}"${locked ? ' disabled' : ''}>${options}</select></td><td><input class="grid-remarks" type="text" maxlength="200" data-field="remarks" aria-label="Remarks for row ${index + 1}" value="${escapeHtml(row.values.remarks ?? '')}"${locked ? ' disabled' : ''}></td><td data-cell="status"></td></tr>`
      })
      .join('')
    body.querySelectorAll('tr[data-index]').forEach(tr => {
      const row = rows[Number(tr.dataset.index)]
      paintRow(tr, row, isLocked(row) ? null : revalidate(row))
    })
    refreshSave()
    // The page re-renders after every file choice; the observer below picks that up, but not our own redraw.
    observer.takeRecords()
    rendering = false
  }
  const observer = new MutationObserver(() => {
    if (!rendering) render()
  })
  observer.observe(body, { childList: true })

  const onEdit = event => {
    const input = event.target.closest('[data-field]')
    const tr = event.target.closest('tr[data-index]')
    if (!input || !tr) return
    const row = getRows()[Number(tr.dataset.index)]
    row.values[input.dataset.field] = input.value
    paintRow(tr, row, revalidate(row))
    refreshSave()
  }
  body.addEventListener('input', onEdit)
  body.addEventListener('change', onEdit)
  return { render }
}
