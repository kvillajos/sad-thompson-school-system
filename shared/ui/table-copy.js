// Copy from any table to Excel/Sheets: select cells across several rows and columns, press Ctrl+C, paste.
// The browser's default copy drags along button labels ("Edit Pin Remove"), pager text and odd spacing, and
// Excel turns long IDs (12-digit LRNs) into 1.2E+11 or drops leading zeros. This rebuilds the clipboard as
// clean tab-separated text plus an HTML table that tells Excel to keep IDs as text.
// The pure helpers stay free of DOM so scripts/check-table-copy.mjs can test them in Node.

export const cleanText = value => String(value ?? '').replace(/[\u00a0\s]+/g, ' ').trim()

const tsvField = value => /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
export const toTsv = rows => rows.map(row => row.map(tsvField).join('\t')).join('\n')

const esc = value => value.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]))
// Digit-only values with a leading zero or 11+ digits are identifiers, not quantities.
export const isTextNumber = value => /^\d+$/.test(value) && (value.length >= 11 || /^0\d/.test(value))
export const toHtml = rows => `<table>${rows.map(row => `<tr>${row.map(value => `<td${isTextNumber(value) ? ' style="mso-number-format:\'\@\'"' : ''}>${esc(value)}</td>`).join('')}</tr>`).join('')}</table>`

const isActionHeader = text => /^actions?$/i.test(cleanText(text))
const cellText = cell => {
  const clone = cell.cloneNode(true)
  clone.querySelectorAll('button, svg, script, style, [data-no-copy]').forEach(node => node.remove())
  return cleanText(clone.textContent)
}

function onCopy(event) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) return
  const anchor = selection.getRangeAt(0).commonAncestorContainer
  const table = (anchor.nodeType === 1 ? anchor : anchor.parentElement)?.closest('table')
  if (!table || table.closest('[data-no-copy]')) return // selection is not inside one table: leave the browser's copy alone
  const skip = new Set()
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1]
  headRow && [...headRow.cells].forEach(cell => { if (isActionHeader(cell.textContent)) skip.add(cell.cellIndex) })
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
