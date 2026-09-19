import { isEditLocked, editLockMessage } from '../edit-lock.js'

const assert = (await import('node:assert/strict')).default
const now = Date.parse('2026-01-01T12:00:00Z')
const locked = { editing_by: 'registrar01', editing_since: '2026-01-01T11:55:00Z' }   // 5 min old
const stale = { editing_by: 'registrar01', editing_since: '2026-01-01T11:49:00Z' }    // 11 min old
assert.equal(isEditLocked(locked, now), true)
assert.equal(isEditLocked(stale, now), false)
assert.equal(isEditLocked({ editing_by: null, editing_since: null }, now), false)
assert.equal(isEditLocked({}, now), false)
assert.equal(isEditLocked({ editing_by: 'a', editing_since: 'not-a-date' }, now), false)
assert.ok(editLockMessage(locked).includes('registrar01'))
console.log('edit-lock checks passed')
