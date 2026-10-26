// Copy from any table to Excel/Sheets: select cells across several rows and columns, press Ctrl+C, paste.
// The browser's default copy drags along button labels ("Edit Pin Remove"), pager text and odd spacing, and
// Excel turns long IDs (12-digit LRNs) into 1.2E+11 or drops leading zeros. This rebuilds the clipboard as
// clean tab-separated text plus an HTML table that tells Excel to keep IDs as text.
// The pure helpers stay free of DOM so dev/scripts/checks/check-table-copy.mjs can test them in Node.

export const cleanText = value =>
  String(value ?? '')
    .replace(/[\u00a0\s]+/g, ' ')
    .trim()

const tsvField = value => (/[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
export const toTsv = rows => rows.map(row => row.map(tsvField).join('\t')).join('\n')

const csvField = (value, isTextColumn) => {
  let text = String(value ?? '')
  if (isTextColumn && /^\d+$/.test(text)) {
    text = `="${text}"`
  } else if (text.length > 1 && /^[=+\-@]/.test(text)) {
    text = `'${text}`
  }
  return `"${text.replace(/"/g, '""')}"`
}
export const toCsv = (rows, textColumns = []) => {
  const textColumnIndexes = new Set(textColumns)
  return rows
    .map(row => row.map((value, index) => csvField(value, textColumnIndexes.has(index))).join(','))
    .join('\r\n')
}

const esc = value => value.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character])
// Digit-only values with a leading zero or 11+ digits are identifiers, not quantities.
export const isTextNumber = value => /^\d+$/.test(value) && (value.length >= 11 || /^0\d/.test(value))
export const toHtml = rows =>
  `<table>${rows.map(row => `<tr>${row.map(value => `<td${isTextNumber(value) ? ' style="mso-number-format:\'\@\'"' : ''}>${esc(value)}</td>`).join('')}</tr>`).join('')}</table>`

const isActionHeader = text => /^actions?$/i.test(cleanText(text))
export const cellText = cell => {
  const clone = cell.cloneNode(true)
  clone.querySelectorAll('button, svg, script, style, [data-no-copy]').forEach(node => node.remove())
  return cleanText(clone.textContent)
}

// Download a table as CSV: every data row the page rendered (the filtered rows), including rows the pager is
// hiding, without the Actions column. ID-like columns (Student ID, LRN, Employee No.) stay text in Excel.
export function downloadTableCsv(table, filename) {
  const headerRow = table.tHead?.rows[table.tHead.rows.length - 1]
  if (!headerRow) return false
  const columns = [...headerRow.cells].map((cell, index) => ({ index, label: cellText(cell) })).filter(column => !isActionHeader(column.label))
  const rows = [
    columns.map(column => column.label),
    ...[...(table.tBodies[0]?.rows || [])]
      .filter(row => row.cells.length === headerRow.cells.length && [...row.cells].every(cell => cell.colSpan === 1))
      .map(row => columns.map(column => cellText(row.cells[column.index])))
  ]
  const textColumns = columns.flatMap((column, index) => (/(\bid\b|lrn|student no|employee no)/i.test(column.label) ? [index] : []))
  const url = URL.createObjectURL(new Blob([`﻿${toCsv(rows, textColumns)}`], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `${filename}-${new Date().toISOString().slice(0, 10)}.csv` })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

function onCopy(event) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) return
  const anchor = selection.getRangeAt(0).commonAncestorContainer
  const table = (anchor.nodeType === 1 ? anchor : anchor.parentElement)?.closest('table')
  if (!table || table.closest('[data-no-copy]')) return // selection is not inside one table: leave the browser's copy alone
  const skip = new Set()
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1]
  headRow &&
    [...headRow.cells].forEach(cell => {
      if (isActionHeader(cell.textContent)) skip.add(cell.cellIndex)
    })
  const grid = []
  let picked = 0
  for (const row of table.rows) {
    if (row.hidden || row.offsetParent === null) continue // rows on other pages / filtered out
    const cells = [...row.cells].filter(cell => cell.colSpan === 1 && !skip.has(cell.cellIndex) && selection.containsNode(cell, true))
    if (!cells.length) continue
    picked += cells.length
    grid.push(cells.map(cellText))
  }
  if (picked < 2) return // a single cell is a normal text copy
  event.clipboardData.setData('text/plain', toTsv(grid))
  event.clipboardData.setData('text/html', toHtml(grid))
  event.preventDefault()
}

let installed = false
export function installTableCopy() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('copy', onCopy)
}
