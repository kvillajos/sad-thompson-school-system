// Saves a Blob (or text) as a file through a temporary link.
export function downloadFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// exceljs is large, so it is loaded only when a page actually reads or writes a spreadsheet.
export const loadExcel = () => import('exceljs').then(module => module.default || module)

// A worksheet as plain cell arrays (row 1 first). Formula, rich-text and hyperlink cells give their shown value.
export function sheetToTable(worksheet) {
  const rows = []
  worksheet.eachRow({ includeEmpty: false }, row => {
    const cells = []
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const value = cell.value
      cells[column - 1] =
        value && typeof value === 'object' && !(value instanceof Date)
          ? (value.result ?? value.text ?? value.richText?.map(part => part.text).join('') ?? '')
          : (value ?? '')
    })
    rows.push(Array.from(cells, cell => cell ?? ''))
  })
  return rows
}
