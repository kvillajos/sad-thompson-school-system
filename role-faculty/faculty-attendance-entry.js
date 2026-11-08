import { buildDraft, draftDiffers, draftKey, parseDraft } from '../shared/lib/attendance-draft.js'
import { confirmDialog } from '../shared/ui/dialog.js'

// Auto-save for the subject attendance sheet. While a teacher marks Present / Late / Absent / Excused during a
// class, the sheet is copied to this browser a moment after every change. Reopening the same class and date
// offers to restore it, so a refresh or lost connection does not cost the marks. The draft is cleared once the
// saved sheet matches it. Nothing is written to the database until Save Attendance is pressed.
//
// Mounted once from faculty-attendance-page.js. It watches the sheet's body, so the page's own render, save and
// unsaved-changes code stay as they were.

const SAVE_DELAY_MS = 800

export function mountAttendanceDraft({ body, userId, getClassKey, getDate, saveButton, storage = window.localStorage, delayMs = SAVE_DELAY_MS }) {
  const status = document.createElement('span')
  status.className = 'admin-note'
  status.setAttribute('role', 'status')
  status.style.marginLeft = '0.75rem'
  saveButton.after(status)

  let key = null
  let timer = null
  const read = () => {
    try {
      return storage.getItem(key)
    } catch {
      return null
    }
  }
  const write = text => {
    try {
      if (text == null) storage.removeItem(key)
      else storage.setItem(key, text)
      return true
    } catch {
      return false
    }
  }
  const sheetRows = () =>
    [...body.querySelectorAll('tr[data-student-id]')].map(tr => ({
      student_id: tr.dataset.studentId,
      status: tr.querySelector('[data-field="status"]')?.value,
      remarks: tr.querySelector('[data-field="remarks"]')?.value
    }))
  const time = at => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const saveDraft = () => {
    timer = null
    if (!key) return
    const draft = buildDraft(sheetRows())
    status.textContent = write(JSON.stringify(draft)) ? `Draft saved ${time(draft.savedAt)}` : 'Could not save a draft in this browser.'
  }
  const onEdit = () => {
    if (!key) return
    status.textContent = 'Saving draft...'
    clearTimeout(timer)
    timer = setTimeout(saveDraft, delayMs)
  }
  body.addEventListener('input', onEdit)
  body.addEventListener('change', onEdit)

  const applyDraft = draft => {
    body.querySelectorAll('tr[data-student-id]').forEach(tr => {
      const saved = draft.students[tr.dataset.studentId]
      if (!saved) return
      tr.querySelector('[data-field="status"]').value = saved.status
      tr.querySelector('[data-field="remarks"]').value = saved.remarks
    })
    // The page marks the sheet as unsaved on change events, so a restored draft is protected the same way.
    body.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // Runs after the page draws a sheet (opening a log, or reloading it after a save).
  const onSheetDrawn = async () => {
    clearTimeout(timer)
    timer = null
    const rows = sheetRows()
    status.textContent = ''
    if (!rows.length) {
      key = null
      return
    }
    key = draftKey(userId, getClassKey(), getDate())
    const draft = parseDraft(read())
    if (!draft) return void write(null)
    if (!draftDiffers(draft, rows)) return void write(null)
    const forKey = key
    const restore = await confirmDialog(`Unsaved attendance from ${time(draft.savedAt)} was found for this class and date. Restore it?`, {
      title: 'Restore draft',
      confirmText: 'Restore draft',
      cancelText: 'Discard draft'
    })
    if (key !== forKey) return
    if (restore) {
      applyDraft(draft)
      status.textContent = `Draft restored (saved ${time(draft.savedAt)}). Press Save Attendance to keep it.`
    } else {
      write(null)
    }
  }
  new MutationObserver(onSheetDrawn).observe(body, { childList: true })
}
