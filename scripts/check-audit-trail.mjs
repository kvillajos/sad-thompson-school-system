import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sql = readFileSync(join(root, 'database', 'backupsqlmigration.sql'), 'utf8')
for (const action of ['REGISTRAR_EDIT', 'UPDATE_STATUS', 'SAVE_FACULTY_GRADES', 'SAVE_ATTENDANCE', 'UPDATE_STUDENT_PROFILE', 'LOCK_ACADEMIC_RECORD', 'BATCH_PROMOTION_RESULT', 'UPDATE_OWN_PROFILE']) assert.match(sql, new RegExp(action), `${action} must be auditable`)
assert.match(sql, /create trigger promotion_log_audit/i)
assert.doesNotMatch(sql, /create policy[^;]+on audit_logs[^;]+for (insert|update|delete)/is, 'audit_logs must remain append-only to clients')
console.log('audit trail static checks passed')
