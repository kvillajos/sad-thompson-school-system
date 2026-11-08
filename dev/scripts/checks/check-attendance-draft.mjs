// Runnable checks for the attendance sheet auto-save draft: npm run check:attendance-draft
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DRAFT_MAX_AGE_MS, buildDraft, draftDiffers, draftKey, parseDraft } from '../../../shared/lib/attendance-draft.js'

const now = Date.UTC(2026, 10, 9, 8, 0, 0)

// --- the pure draft helpers ------------------------------------------------
assert.equal(draftKey(7, '3:12', '2026-11-09'), 'tcsms-attendance-draft:7:3:12:2026-11-09')
assert.notEqual(draftKey(7, '3:12', '2026-11-09'), draftKey(8, '3:12', '2026-11-09'), 'each teacher has their own draft')
assert.notEqual(draftKey(7, '3:12', '2026-11-09'), draftKey(7, '3:13', '2026-11-09'), 'each class has its own draft')
assert.notEqual(draftKey(7, '3:12', '2026-11-09'), draftKey(7, '3:12', '2026-11-10'), 'each date has its own draft')

const rows = [
  { student_id: '11', status: 'Absent', remarks: 'sick' },
  { student_id: '12', status: 'Present', remarks: '' }
]
const draft = buildDraft(rows, now)
assert.equal(draft.savedAt, now)
assert.deepEqual(draft.students['11'], { status: 'Absent', remarks: 'sick' })

const roundTrip = parseDraft(JSON.stringify(draft), now + 1000)
assert.deepEqual(roundTrip, draft, 'a stored draft reads back unchanged')
assert.equal(parseDraft(null, now), null, 'no stored draft')
assert.equal(parseDraft('not json', now), null, 'unreadable text is ignored')
assert.equal(parseDraft(JSON.stringify({ savedAt: now, students: {} }), now), null, 'an empty draft is ignored')
assert.equal(parseDraft(JSON.stringify(draft), now + DRAFT_MAX_AGE_MS + 1), null, 'an old draft expires')
const tampered = parseDraft(JSON.stringify({ savedAt: now, students: { 11: { status: 'Sick' }, 12: { status: 'Late' } } }), now)
assert.deepEqual(Object.keys(tampered.students), ['12'], 'an invalid status is dropped')

assert.equal(draftDiffers(draft, rows), false, 'a sheet that matches its draft needs no restore (e.g. right after saving)')
assert.equal(draftDiffers(draft, [{ student_id: '11', status: 'Present', remarks: '' }, rows[1]]), true, 'a different status needs a restore')
assert.equal(draftDiffers(draft, [{ student_id: '11', status: 'Absent', remarks: '' }, rows[1]]), true, 'different remarks need a restore')
assert.equal(draftDiffers(draft, [{ student_id: '99', status: 'Present', remarks: '' }]), false, 'students not in the draft are ignored')

// --- the attendance page wiring ---------------------------------------------
const root = resolve(import.meta.dirname, '../../..')
const page = readFileSync(join(root, 'role-faculty', 'faculty-attendance-page.js'), 'utf8')
const entry = readFileSync(join(root, 'role-faculty', 'faculty-attendance-entry.js'), 'utf8')
assert.ok(page.includes("from './faculty-attendance-entry.js'") && page.includes('mountAttendanceDraft('), 'the page mounts the auto-save')
assert.equal(page.split('mountAttendanceDraft(').length - 1, 1, 'the page makes a single mount call')
assert.ok(page.includes('save_attendance'), 'attendance still saves through the validated RPC')
assert.ok(!entry.includes('.rpc('), 'auto-save only keeps a local draft and never writes to the database')

const folder = mkdtempSync(join(tmpdir(), 'attendance-draft-'))
try {
  const file = join(folder, 'faculty-attendance-entry.mjs')
  writeFileSync(file, entry)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  assert.equal(result.status, 0, `faculty-attendance-entry.js has a syntax error: ${String(result.stderr).slice(-600)}`)
} finally {
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

console.log('attendance draft checks passed')
