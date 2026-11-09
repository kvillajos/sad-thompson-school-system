// Turns deped-forms.js sheet descriptions into an .xlsx workbook (exceljs, loaded on demand). No DOM access, so
// dev/scripts/checks/check-deped-forms.mjs can write and re-read a workbook in Node.
import { uniqueSheetNames } from './deped-forms.js'

const thin = { style: 'thin', color: { argb: 'FF9AA9BF' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

// specs: [{ name, rows, merges: [[r1,c1,r2,c2]] (0-based), headerRow, tableHeaders, bold, widths }]
export async function buildWorkbook(specs, ExcelJS) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'TCSMS'
  for (const spec of uniqueSheetNames(specs)) {
    const sheet = workbook.addWorksheet(spec.name, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    })
    spec.rows.forEach(row => sheet.addRow(row))
    ;(spec.widths || []).forEach((width, i) => (sheet.getColumn(i + 1).width = width))
    for (const [r1, c1, r2, c2] of spec.merges || []) sheet.mergeCells(r1 + 1, c1 + 1, r2 + 1, c2 + 1)
    sheet.getRow(1).font = { bold: true, size: 14 }
    sheet.getRow(2).font = { italic: true }
    sheet.getRow(3).font = { bold: true }
    ;[1, 2, 3].forEach(r => (sheet.getRow(r).alignment = { horizontal: 'center' }))
    for (const r of spec.bold || []) sheet.getRow(r + 1).font = { bold: true }
    const headers = spec.tableHeaders || (spec.headerRow == null ? [] : [spec.headerRow])
    const width = Math.max(...spec.rows.map(row => row.length))
    for (const h of headers) {
      const row = sheet.getRow(h + 1)
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      for (let c = 1; c <= spec.rows[h].length; c++)
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17345F' } }
    }
    // Borders on the table area: from the first table header to the last non-empty row.
    if (headers.length) {
      for (let r = headers[0] + 1; r <= spec.rows.length; r++) {
        if (!spec.rows[r - 1].length) continue
        for (let c = 1; c <= width; c++) sheet.getRow(r).getCell(c).border = border
      }
      if (spec.tableHeaders == null) sheet.views = [{ state: 'frozen', ySplit: spec.headerRow + 1 }]
    }
  }
  return workbook
}
