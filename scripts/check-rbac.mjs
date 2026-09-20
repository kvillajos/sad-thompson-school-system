import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sql = readFileSync(join(root, 'database', 'backupsqlmigration.sql'), 'utf8')
const tables = ['users', 'students', 'sections', 'subjects', 'subject_schedules', 'staff_profiles', 'enrollments', 'academic_history', 'attendance', 'audit_logs']
for (const table of tables) assert.match(sql, new RegExp(`alter table ${table} enable row level security`, 'i'), `${table} must have RLS enabled`)
assert.match(sql, /create policy admin_audit on audit_logs for select to authenticated using \(\(select current_app_role\(\)\) = 1\)/i)
assert.doesNotMatch(sql, /create policy[^;]+using\s*\(\s*true\s*\)/is, 'RLS must not use a true predicate')
assert.match(sql, /current_app_role\(\)/, 'policies must use the role helper')
assert.match(sql, /attendance_totals[\s\S]+u\.student_id = p_student_id[\s\S]+faculty_teaches_student\(p_student_id\)/i, 'attendance totals must enforce caller scope')
assert.match(sql, /profile_pictures_upload[\s\S]+applications\/%[\s\S]+student_id::text \|\| '\/%'/i, 'profile-picture uploads must be path-scoped')
assert.match(sql, /update_own_profile_picture[\s\S]+expected_path[\s\S]+Profile picture must belong to your account/i, 'profile-picture URL updates must enforce ownership')
assert.doesNotMatch(sql, /security definer as \$\$/i, 'SECURITY DEFINER functions must set an explicit search_path')
console.log('RBAC static checks passed')
