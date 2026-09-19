// Attendance sheet helpers: same contract as grades.js (pure, no app imports) so
// scripts/check-attendance.mjs can assert it in Node. Reuses grades.js for the shared
// per-class grouping and school-year math instead of duplicating them.
import { classOptions, currentSchoolYear } from './grades.js'

export { classOptions, currentSchoolYear }

export const STATUS_OPTIONS = ['Present', 'Late', 'Absent', 'Excused']

// One sheet row to one save_attendance() record. Falls back to Present when a row is
// left at its default so a whole-class "mark all present" save needs no per-row clicks.
export function attendanceRecord(studentId, values = {}) {
  const status = String(values.status ?? 'Present').trim()
  if (!STATUS_OPTIONS.includes(status)) return null
  const remarks = String(values.remarks ?? '').trim()
  return { student_id: Number(studentId), status, remarks: remarks === '' ? null : remarks }
}

// Today's date as the input[type=date] value the attendance sheet defaults to.
export function todayDateValue(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// attendance_totals() RPC payload -> the one-line summary the student dashboard and the
// registrar academic modal both show, so they can never phrase it differently.
export function attendanceSummaryLine(totals) {
  const safe = totals || { present: 0, late: 0, absent: 0, excused: 0, total: 0 }
  if (!safe.total) return 'No attendance recorded yet.'
  const rate = Math.round((safe.present / safe.total) * 1000) / 10
  return `${safe.present}/${safe.total} present (${rate}%) - ${safe.late} late, ${safe.absent} absent, ${safe.excused} excused`
}
