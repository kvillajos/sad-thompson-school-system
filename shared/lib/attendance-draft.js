// Pure helpers for the attendance sheet's auto-saved draft (role-faculty/faculty-attendance-entry.js).
// Same contract as attendance.js: no app imports beyond it, so dev/scripts/checks/check-attendance-draft.mjs can run in Node.
// A draft is the teacher's unsaved sheet for one class + date, kept in the browser so a refresh, a dropped
// connection or a closed tab in the middle of a class does not lose the marks. It never reaches the database
// by itself: the teacher still presses Save Attendance.
import { STATUS_OPTIONS } from './attendance.js'

export const DRAFT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

export function draftKey(userId, classKey, date) {
  return `tcsms-attendance-draft:${userId}:${classKey}:${date}`
}

// rows: [{ student_id, status, remarks }] read from the sheet.
export function buildDraft(rows = [], now = Date.now()) {
  const students = {}
  rows.forEach(row => {
    students[String(row.student_id)] = { status: String(row.status ?? 'Present'), remarks: String(row.remarks ?? '') }
  })
  return { savedAt: now, students }
}

// Stored text -> a usable draft, or null when it is missing, unreadable, empty or too old.
export function parseDraft(text, now = Date.now(), maxAgeMs = DRAFT_MAX_AGE_MS) {
  if (!text) return null
  let draft
  try {
    draft = JSON.parse(text)
  } catch {
    return null
  }
  if (!draft || typeof draft.students !== 'object' || draft.students === null) return null
  if (!Number.isFinite(draft.savedAt) || now - draft.savedAt > maxAgeMs) return null
  const students = {}
  Object.entries(draft.students).forEach(([id, entry]) => {
    if (entry && STATUS_OPTIONS.includes(entry.status)) students[id] = { status: entry.status, remarks: String(entry.remarks ?? '') }
  })
  return Object.keys(students).length ? { savedAt: draft.savedAt, students } : null
}

// Does the draft change anything on the sheet as it was just loaded? After a successful save the sheet reloads
// with the saved values, so the draft no longer differs and can be thrown away.
export function draftDiffers(draft, rows = []) {
  return rows.some(row => {
    const saved = draft?.students?.[String(row.student_id)]
    return saved && (saved.status !== String(row.status ?? 'Present') || saved.remarks !== String(row.remarks ?? ''))
  })
}
