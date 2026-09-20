// Runnable checks for attendance: npm run check:attendance
// 1) the pure attendance helpers, 2) the faculty page attendance panel wiring.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { STATUS_OPTIONS, attendanceRecord, attendanceSummaryLine, todayDateValue } from '../attendance.js'

// --- the pure attendance helpers ------------------------------------------
assert.deepEqual(STATUS_OPTIONS, ['Present', 'Late', 'Absent', 'Excused'])
assert.deepEqual(attendanceRecord(11, {}), { student_id: 11, status: 'Present', remarks: null }, 'an untouched row defaults to Present')
assert.deepEqual(attendanceRecord(11, { status: 'Late', remarks: ' traffic ' }), { student_id: 11, status: 'Late', remarks: 'traffic' })
assert.equal(attendanceRecord(11, { status: 'Sick' }), null, 'an invalid status is rejected')
assert.equal(todayDateValue(new Date(2026, 8, 5)), '2026-09-05', 'zero-padded month and day')
assert.equal(attendanceSummaryLine({ present: 18, late: 1, absent: 1, excused: 0, total: 20 }), '18/20 present (90%) - 1 late, 1 absent, 0 excused')
assert.equal(attendanceSummaryLine(null), 'No attendance recorded yet.')

// --- the faculty attendance page ------------------------------------------
const root = resolve(import.meta.dirname, '..')
const html = readFileSync(join(root, 'faculty', 'faculty-attendance.html'), 'utf8')
const script = readFileSync(join(root, 'faculty', 'faculty-attendance-page.js'), 'utf8')
assert.ok(script.includes('save_attendance'), 'attendance must be saved through the validated RPC')
assert.ok(script.includes("from '../attendance.js'"), 'the page must reuse the attendance helpers')
assert.ok(html.includes('id="attendance-table-body"') && html.includes('id="save-attendance"'), 'the attendance page must expose its controls')

const folder = mkdtempSync(join(tmpdir(), 'attendance-page-'))
try {
  const file = join(folder, 'faculty-attendance-page.mjs')
  writeFileSync(file, script)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  assert.equal(result.status, 0, `faculty-attendance-page.js has a syntax error: ${String(result.stderr).slice(-600)}`)
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

console.log('attendance checks passed')
