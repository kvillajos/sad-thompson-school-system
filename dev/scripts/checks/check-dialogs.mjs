// Headless-browser check for dialog.js, toast(), errorRow() and the global modal behaviour in ui-theme.js: npm run check:dialogs
// Loads the real modules from a temp folder and drives each dialog like a user would.
import { writeFileSync, mkdtempSync, copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

import { browserPath } from './browser-path.mjs'

const root = resolve(import.meta.dirname, '../../..')
const folder = mkdtempSync(join(tmpdir(), 'ux-check-'))
for (const f of ['ui/ui-theme.js', 'ui/dialog.js', 'lib/html.js', 'lib/errors.js', 'ui/table-sort.js', 'ui/table-pages.js', 'ui/table-copy.js']) { const dest = join(folder, 'shared', f); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(join(root, 'shared', f), dest) }

const driver = `
import { applyUiTheme, toast } from './shared/ui/ui-theme.js'
import { confirmDialog, formDialog, noticeDialog } from './shared/ui/dialog.js'
import { errorRow } from './shared/lib/html.js'
applyUiTheme()
const wait = ms => new Promise(r => setTimeout(r, ms))
const out = {}
const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
try {
  // confirm: OK resolves true, Escape resolves false, danger focuses Cancel
  let p = confirmDialog('Remove <b>X</b>?', { title: 'Remove', confirmText: 'Remove', danger: true })
  await wait(10)
  out.escapedText = !document.querySelector('.dialog-message b') && document.querySelector('.dialog-message').textContent === 'Remove <b>X</b>?'
  out.dangerClass = document.querySelector('[data-dialog-ok]').className
  out.focusOnCancel = document.activeElement?.textContent
  out.dialogRole = document.querySelector('.dialog-box').getAttribute('role')
  document.querySelector('[data-dialog-ok]').click()
  out.okResult = await p
  out.removedAfterOk = !document.querySelector('.dialog-box')
  p = confirmDialog('Sure?', { warning: 'Heads up' })
  await wait(10)
  out.warningShown = document.querySelector('.dialog-warning')?.textContent
  esc()
  out.escResult = await p

  // form: native validation blocks bad input; good input resolves trimmed values; Escape resolves null
  p = formDialog({ title: 'Correct', fields: [{ name: 'grade', label: 'Grade', type: 'number', min: 0, max: 100, step: 0.01, required: true }, { name: 'reason', label: 'Reason', multiline: true, required: true }] })
  await wait(10)
  const form = document.querySelector('form.dialog-box')
  let settled = false; p.then(() => { settled = true })
  form.elements.grade.value = '150'; form.elements.reason.value = 'typo'
  form.requestSubmit(); await wait(10)
  out.blockedOutOfRange = !settled && Boolean(document.querySelector('form.dialog-box'))
  form.elements.grade.value = '95'; form.elements.reason.value = '   '
  form.requestSubmit(); await wait(10)
  out.blockedBlankReason = !settled
  form.elements.reason.value = '  fixed typo  '
  form.requestSubmit()
  out.formResult = await p
  p = formDialog({ title: 'Reject', fields: [{ name: 'remarks', label: 'Why', multiline: true }] })
  await wait(10); esc()
  out.formEscResult = await p

  // notice with copy value
  p = noticeDialog('Temp password for ana.', { title: 'Temporary password', copyText: 'Xy7!pass' })
  await wait(10)
  out.copyShown = document.querySelector('.dialog-copy code')?.textContent
  document.querySelector('[data-dialog-ok]').click(); await p
  out.noticeClosed = !document.querySelector('.dialog-box')

  // static modal: close button gets aria-label, box gets role, Escape clicks close
  const modal = document.createElement('div')
  modal.className = 'admin-modal'
  modal.innerHTML = '<div class="admin-modal-box"><div class="admin-modal-head"><h3>Static</h3><button type="button" id="static-close">x</button></div></div>'
  document.body.appendChild(modal)
  await wait(10)
  document.getElementById('static-close').onclick = () => modal.classList.add('hidden')
  out.staticLabel = document.getElementById('static-close').getAttribute('aria-label')
  out.staticRole = modal.querySelector('.admin-modal-box').getAttribute('role')
  esc()
  out.staticClosedByEsc = modal.classList.contains('hidden')

  // dialog stacked over a static modal: Escape closes only the dialog
  modal.classList.remove('hidden')
  p = confirmDialog('Stacked?')
  await wait(10); esc()
  out.stackedResult = await p
  out.staticStillOpen = !modal.classList.contains('hidden')

  // toast: second toast is not hidden by the first one's timer; errors get role=alert
  toast('first', 'success', 300)
  await wait(200)
  toast('second', 'error', 2000)
  await wait(250)
  const t = document.getElementById('toast')
  out.toastStillVisible = !t.classList.contains('hidden') && t.textContent === 'second'
  out.toastRole = t.getAttribute('role')
  t.click()
  out.toastClickHides = t.classList.contains('hidden')

  // error row: friendly text + retry button
  const table = document.createElement('table'); table.innerHTML = '<tbody></tbody>'; document.body.appendChild(table)
  table.tBodies[0].innerHTML = errorRow(4, { message: 'JWT expired' }, 'Load audit log')
  out.errorRowText = table.querySelector('td').textContent
  out.errorRowColor = getComputedStyle(table.querySelector('td')).color
  table.tBodies[0].innerHTML = '<tr><td colspan="4">No audit events recorded.</td></tr>'
  out.emptyRowStyle = getComputedStyle(table.querySelector('td')).fontStyle + '|' + getComputedStyle(table.querySelector('td')).textAlign

  // busy spinner style exists for aria-busy buttons
  const b = document.createElement('button'); b.setAttribute('aria-busy', 'true'); b.textContent = 'Saving'; document.body.appendChild(b)
  out.spinner = getComputedStyle(b, '::before').animationName
} catch (error) { out.failure = String(error?.stack || error) }
document.getElementById('result').textContent = JSON.stringify(out)
`
writeFileSync(join(folder, 'driver.js'), driver)
writeFileSync(join(folder, 'fixture.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="result"></pre><script type="module" src="./driver.js"></script></body></html>`)
try {
const result = spawnSync(browserPath(), ['--headless', '--disable-gpu', '--no-first-run', '--disable-extensions', '--allow-file-access-from-files', `--user-data-dir=${join(folder, 'profile')}`, '--virtual-time-budget=8000', '--dump-dom', pathToFileURL(join(folder, 'fixture.html')).href], { encoding: 'utf8', timeout: 60000, maxBuffer: 6e6 })
const match = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)
assert.ok(match?.[1], 'no result: ' + String(result.stderr).slice(-800))
const out = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
console.log(out)
assert.equal(out.failure, undefined)
assert.equal(out.escapedText, true, 'dialog text is escaped')
assert.equal(out.errorRowColor, 'rgb(192, 57, 43)', 'error rows use the danger colour, not the empty-state grey')
assert.equal(out.dangerClass, 'admin-danger')
assert.equal(out.focusOnCancel, 'Cancel', 'danger dialogs focus Cancel first')
assert.equal(out.dialogRole, 'dialog')
assert.equal(out.okResult, true); assert.equal(out.removedAfterOk, true)
assert.equal(out.warningShown, 'Heads up'); assert.equal(out.escResult, false)
assert.equal(out.blockedOutOfRange, true, 'grade 150 is blocked by native validation')
assert.equal(out.blockedBlankReason, true, 'whitespace-only reason is blocked')
assert.deepEqual(out.formResult, { grade: '95', reason: 'fixed typo' })
assert.equal(out.formEscResult, null)
assert.equal(out.copyShown, 'Xy7!pass'); assert.equal(out.noticeClosed, true)
assert.equal(out.staticLabel, 'Close'); assert.equal(out.staticRole, 'dialog'); assert.equal(out.staticClosedByEsc, true)
assert.equal(out.stackedResult, false); assert.equal(out.staticStillOpen, true, 'Escape closes only the top modal')
assert.equal(out.toastStillVisible, true, 'an earlier toast timer does not hide a newer toast')
assert.equal(out.toastRole, 'alert'); assert.equal(out.toastClickHides, true)
assert.match(out.errorRowText, /Load audit log failed: your session has expired\. Sign in again\.Retry/)
assert.equal(out.emptyRowStyle, 'italic|center')
assert.equal(out.spinner, 'tcsms-spin')
console.log('dialog, toast and modal checks passed')
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
