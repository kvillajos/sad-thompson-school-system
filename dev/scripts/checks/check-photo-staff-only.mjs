import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8')
const studentPage = read('role-student', 'student-dashboard-page.js')
const studentHtml = read('role-student', 'student-dashboard.html')
const shell = read('shared', 'ui', 'shell.js')
const adminPage = read('role-admin', 'admin-accounts-page.js')
const photoUpload = read('shared', 'ui', 'photo-upload.js')
const migration = read('dev', 'database', 'pending', 'v51-photo-staff-only.sql')
const backup = read('dev', 'database', 'backupsqlmigration.sql')

assert.match(studentPage, /showProfilePicture\(student\?\.profile_picture_url\)/, 'students should continue to see their saved photo')
assert.doesNotMatch(studentPage, /update_own_profile_picture|profile-picture-input|save-picture|choose-picture/)
assert.doesNotMatch(studentHtml, /profile-picture-input|picture-actions|id="choose-picture"|id="save-picture"/)
assert.match(shell, /\[1, 2\]\.includes\(Number\(user\?\.role_id\)\)/, 'only administrators and registrars may see shared photo controls')
assert.match(shell, /canChangePicture\s*\?\s*'<input id="tcsms-profile-picture"/)
assert.match(shell, /rpc\('staff_update_profile_picture'/)
assert.doesNotMatch(shell, /update_own_profile_picture|remove_own_profile_picture/)
assert.match(adminPage, /import \{ mountPhotoUpload \} from '\.\.\/shared\/ui\/photo-upload\.js'/)
assert.match(adminPage, /mountPhotoUpload\(document\.getElementById\('account-photo-upload'\)/)
assert.match(adminPage, /rpc\('staff_update_profile_picture', \{ p_user_id: item\.user_id, p_url: null \}\)/)
assert.match(adminPage, /const picture = item\.student_id \? profile\?\.profile_picture_url : item\.profile_picture_url/)
assert.match(photoUpload, /\.from\('profile-pictures'\)\s*\.upload\(/)
assert.match(photoUpload, /rpc\('staff_update_profile_picture', \{ p_user_id: userId, p_url: publicUrl \}\)/)
assert.match(photoUpload, /file\.size > 3 \* 1024 \* 1024/)

assert.match(migration, /revoke execute on function public\.update_own_profile_picture\(text\) from public, anon, authenticated/i)
assert.match(migration, /create or replace function public\.staff_update_profile_picture\(p_user_id integer, p_url text\)/i)
assert.match(migration, /coalesce\(current_app_role\(\), 0\) not in \(1, 2\)/i)
assert.match(migration, /grant execute on function public\.staff_update_profile_picture\(integer, text\) to authenticated/i)
assert.match(
  backup,
  /create policy admin_registrar_students on students for all[\s\S]+?with check \(\(select current_app_role\(\)\) in \(1,2\)\)/i,
  'direct student profile updates must remain limited to administrators and registrars'
)
const uploadPolicy = migration.match(/create policy profile_pictures_upload[\s\S]*?;/i)?.[0]
const updatePolicy = migration.match(/create policy profile_pictures_update[\s\S]*?;/i)?.[0]
assert.ok(uploadPolicy, 'v51 must define the profile-picture upload policy')
assert.ok(updatePolicy, 'v51 must define the profile-picture update policy')
for (const policy of [uploadPolicy, updatePolicy]) {
  assert.match(policy, /bucket_id = 'profile-pictures'/i)
  assert.match(policy, /current_app_role\(\)\) in \(1, 2\)/i, 'only administrators and registrars may write photos')
  assert.doesNotMatch(policy, /student_id|applications\//i, 'student-specific storage paths must not grant write access')
}

console.log('staff-only photo checks passed')
