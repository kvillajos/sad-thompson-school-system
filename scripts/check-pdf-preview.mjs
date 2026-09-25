// Headless-browser check for the PDF preview window and the 12-hour schedule day tabs: npm run check:pdf
// Loads the real pdf-preview.js and day-tabs.js (imports swapped for tiny stand-ins) plus the real theme, then clicks through them.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { browserPath } from './browser-path.mjs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const read = name => readFileSync(join(root, name), 'utf8')
const theme = read('ui-theme.js').match(/const sharedTheme = (?:\/\* css \*\/ )?`([\s\S]*?)`;/)[1]
const strip = source => source.replace(/^import .*$/gm, '').replace(/^export (async )?(function|const)/gm, '$1$2')
const pdfPreview = strip(read('pdf-preview.js'))
const dayTabs = strip(read('day-tabs.js'))

const fixture = `<!doctype html><html><head><meta charset="utf-8"><style>${theme}</style></head><body>
<div id="doc" style="display:none"><h1>Official Transcript</h1><p id="marker">Grade 10 - Sam De Guzman</p></div>
<div id="days"></div><pre id="result"></pre>
<script>
const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
let printedWith = null
const printElement = (element, className) => { printedWith = className }
const alerts = []
window.alert = message => alerts.push(String(message))
${dayTabs}
${pdfPreview}
const out = {}
;(async () => {
  const student = { first_name: 'Sam', last_name: 'De Guzman' }
  previewPdf(document.getElementById('doc'), { title: 'Official Transcript', filename: pdfName('Transcript', student), printClass: 'printing-transcript' })
  const modal = document.getElementById('pdf-preview-modal')
  out.modalOpen = Boolean(modal)
  out.title = modal.querySelector('h3').textContent
  out.sheetText = modal.querySelector('.pdf-sheet').textContent
  out.sheetWidth = Math.round(modal.querySelector('.pdf-sheet').getBoundingClientRect().width)
  out.buttons = [...modal.querySelectorAll('.admin-actions button')].map(button => button.textContent)
  out.fileName = pdfName('Transcript', student)
  out.badName = pdfName('Report Card', { first_name: 'A/B', last_name: 'C:D' })
  modal.querySelector('[data-pdf-print]').click()
  out.printedWith = printedWith
  modal.querySelector('[data-pdf-download]').click() // html2pdf.js is not reachable from file://, so this must fail politely
  await new Promise(resolve => setTimeout(resolve, 500))
  out.downloadButtonBack = modal.querySelector('[data-pdf-download]').textContent
  out.alertAfterDownload = alerts.join('|')
  modal.querySelector('[data-pdf-cancel]').click()
  out.closed = !document.getElementById('pdf-preview-modal')

  const rows = [
    { day_of_week: 1, start_time: '07:30:00', end_time: '08:15:00', name: 'English' },
    { day_of_week: 1, start_time: '09:00:00', end_time: '09:45:00', name: 'Math' },
    { day_of_week: 1, start_time: '10:00:00', end_time: '10:45:00', name: 'Science' },
    { day_of_week: 1, start_time: '12:00:00', end_time: '12:45:00', name: 'Filipino' },
    { day_of_week: 1, start_time: '13:45:00', end_time: '14:30:00', name: 'MAPEH' },
    { day_of_week: 2, start_time: '10:00:00', end_time: '10:45:00', name: 'Late start' }
  ]
  const gaps = gapsFrom({ lunch_start: '11:00:00', lunch_end: '12:00:00', break_start: '09:45:00', break_end: '10:00:00' })
  const host = document.getElementById('days')
  mountDayTabs(host, rows, { gaps, headers: ['Subject', 'Time'], cells: row => [escapeHtml(row.name), timeRange12(row.start_time, row.end_time)] })
  const tableRows = () => [...host.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim()).join(' | '))
  host.querySelector('[data-day="1"]').click()
  out.mondayRows = tableRows()
  host.querySelector('[data-day="2"]').click()
  out.tuesdayRows = tableRows()
  out.noSortAttr = host.querySelector('table').hasAttribute('data-no-sort')
  document.getElementById('result').textContent = JSON.stringify(out)
})()
</script></body></html>`

const folder = mkdtempSync(join(tmpdir(), 'pdf-preview-'))
const file = join(folder, 'fixture.html')
writeFileSync(file, fixture)
const result = spawnSync(browserPath(), ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', '--allow-file-access-from-files', `--user-data-dir=${join(folder, 'profile')}`, '--window-size=1200,900', '--virtual-time-budget=4000', '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 40000, maxBuffer: 4e6 })
if (result.error) throw result.error
const match = result.stdout.match(/<pre id="result">(.*?)<\/pre>/s)
assert.ok(match?.[1], `browser produced no result: ${result.stderr.slice(-1500)}`)
const out = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
console.log(out)

assert.equal(out.modalOpen, true, 'the preview window opens')
assert.equal(out.title, 'Official Transcript')
assert.ok(out.sheetText.includes('Grade 10 - Sam De Guzman'), 'the document is shown on the page')
assert.equal(out.sheetWidth, 794, 'the page is A4 width')
assert.deepEqual(out.buttons, ['Close', 'Print', 'Download PDF'])
assert.equal(out.fileName, 'Transcript - De Guzman, Sam.pdf')
assert.equal(out.badName, 'Report Card - CD, AB.pdf', 'characters not allowed in file names are dropped')
assert.equal(out.printedWith, 'printing-transcript', 'Print still uses the print styles')
assert.equal(out.downloadButtonBack, 'Download PDF', 'the download button recovers after a failure')
assert.match(out.alertAfterDownload, /Could not make the PDF/, 'a failed download says so instead of failing silently')
assert.equal(out.closed, true, 'Close removes the window')

assert.equal(out.mondayRows[0], 'English | 7:30 AM - 8:15 AM', 'first row is the first class, in 12-hour time')
assert.ok(out.mondayRows.includes('Break \u00b7 9:45 AM - 10:00 AM'), 'break shows between classes')
assert.ok(out.mondayRows.includes('Lunch break \u00b7 11:00 AM - 12:00 PM'), 'lunch shows in 12-hour time')
assert.ok(out.mondayRows.some(row => row.includes('1:45 PM - 2:30 PM')), 'afternoon classes use PM')
assert.ok(!out.mondayRows.some(row => /\b1[3-9]:\d\d|\b0\d:\d\d/.test(row)), 'no 24-hour times anywhere')
assert.deepEqual(out.tuesdayRows, ['Late start | 10:00 AM - 10:45 AM'], 'no break above the first class, no lunch after the last')
assert.equal(out.noSortAttr, true, 'schedule tables opt out of column sorting')
console.log('pdf preview + 12-hour schedule checks passed')
