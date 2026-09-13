import { createClient } from '@supabase/supabase-js'
import { randomBytes, scryptSync } from 'node:crypto'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const passwordMode = process.env.SEED_STAFF_PASSWORD || 'initials'

if (!url || !serviceRoleKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')
if (passwordMode !== 'initials' && passwordMode.length < 8) throw new Error('SEED_STAFF_PASSWORD must be "initials" or a password with at least 8 characters.')

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

function requireMigrationTable(error, tableName) {
  if (error?.code === 'PGRST205') {
    throw new Error(`Supabase table "${tableName}" is missing from the schema cache. Run database/supabase-migration.sql, wait a few seconds, and rerun npm run seed:staff.`)
  }
  throw error
}
const faculty = [
  ['FAC-001', 'Althea Marie', 'Santos', 'Basic Education', 'Mathematics', '09170000001'],
  ['FAC-002', 'Bernardo Luis', 'Reyes', 'Basic Education', 'Science', '09170000002'],
  ['FAC-003', 'Carla Denise', 'Garcia', 'Basic Education', 'English', '09170000003'],
  ['FAC-004', 'Diego Rafael', 'Mendoza', 'Basic Education', 'Filipino', '09170000004'],
  ['FAC-005', 'Eunice Grace', 'Villanueva', 'Basic Education', 'Social Studies', '09170000005'],
  ['FAC-006', 'Francis Miguel', 'Torres', 'Basic Education', 'Physical Education', '09170000006'],
  ['FAC-007', 'Gloria Mae', 'Dela Peña', 'Basic Education', 'Values Education', '09170000007'],
  ['FAC-008', 'Hector Paolo', 'Ramos', 'Senior High School', 'Information Technology', '09170000008'],
  ['FAC-009', 'Irene Sofia', 'Navarro', 'Senior High School', 'Earth Science', '09170000009'],
  ['FAC-010', 'Julio Andres', 'Castro', 'Senior High School', 'Research', '09170000010']
]
const registrars = [
  ['REG-001', 'Katrina Anne', 'Domingo', 'Registrar Office', 'Admissions and Enrollment', '09170000011'],
  ['REG-002', 'Leonardo Jose', 'Bautista', 'Registrar Office', 'Student Records', '09170000012'],
  ['REG-003', 'Monica Claire', 'Flores', 'Registrar Office', 'Sectioning and Scheduling', '09170000013']
]
const subjects = [
  ['ENG-101', 'English Language', 'Communication and reading skills', null],
  ['FIL-101', 'Filipino', 'Wika at panitikan', null],
  ['MAT-101', 'Mathematics', 'Number sense and problem solving', null],
  ['SCI-101', 'Science', 'Scientific inquiry and discovery', null],
  ['SST-101', 'Social Studies', 'History, civics, and culture', null],
  ['MAP-101', 'Mapeh', 'Music, arts, physical education, and health', null],
  ['TLE-101', 'Technology and Livelihood Education', 'Practical skills and technology', null],
  ['VAL-101', 'Values Education', 'Character and faith formation', null],
  ['ICT-101', 'Information and Communications Technology', 'Digital literacy and computing', null],
  ['RES-101', 'Research', 'Research methods and academic writing', 11]
]

function usernameFor(firstName, lastName) {
  return `${firstName.split(/\s+/).map(part => part[0]).join('')}${lastName.replace(/[^a-z]/gi, '')}`.toLowerCase()
}
function passwordFor(firstName, lastName) {
  if (passwordMode !== 'initials') return passwordMode
  return `${usernameFor(firstName, lastName)}123`
}
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`
}
async function authUserFor(email, username, password, role) {
  const { data, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw listError
  const existing = data.users.find(item => item.email?.toLowerCase() === email.toLowerCase() || item.user_metadata?.username === username)
  const payload = { email, password, email_confirm: true, user_metadata: { username, role } }
  if (existing) {
    const result = await supabase.auth.admin.updateUserById(existing.id, payload)
    if (result.error) throw result.error
    return result.data.user
  }
  const result = await supabase.auth.admin.createUser(payload)
  if (result.error) throw result.error
  return result.data.user
}
async function seedStaff(rows, roleId, roleName) {
  for (const [employeeNo, firstName, lastName, department, specialization, phone] of rows) {
    const username = usernameFor(firstName, lastName)
    const email = `${username}@tcs.edu.ph`
    const password = passwordFor(firstName, lastName)
    const passwordHash = hashPassword(password)
    const authUser = await authUserFor(email, username, password, roleName)
    const { data: existing, error: lookupError } = await supabase.from('users').select('user_id').eq('email', email).maybeSingle()
    if (lookupError) throw lookupError
    const accountPayload = { username, email, password_hash: passwordHash, role_id: roleId, is_active: true }
    const accountResult = existing
      ? await supabase.from('users').update(accountPayload).eq('user_id', existing.user_id).select('user_id').single()
      : await supabase.from('users').insert(accountPayload).select('user_id').single()
    if (accountResult.error) throw accountResult.error
    const userId = accountResult.data.user_id
    const profilePayload = { user_id: userId, employee_no: employeeNo, first_name: firstName, last_name: lastName, department, specialization, phone, updated_at: new Date().toISOString() }
    const profileResult = await supabase.from('staff_profiles').upsert(profilePayload, { onConflict: 'user_id' })
    if (profileResult.error) requireMigrationTable(profileResult.error, 'staff_profiles')
    console.log(`${roleName} | ${username} | ${email} | Password ${password} | Auth ID ${authUser.id}`)
  }
}

for (const [subjectCode, subjectName, description, gradeLevel] of subjects) {
  const result = await supabase.from('subjects').upsert({ subject_code: subjectCode, subject_name: subjectName, description, grade_level: gradeLevel, is_active: true, updated_at: new Date().toISOString() }, { onConflict: 'subject_code' })
  if (result.error) requireMigrationTable(result.error, 'subjects')
}
await seedStaff(faculty, 3, 'faculty')
await seedStaff(registrars, 2, 'registrar')
console.log(`Seeded ${faculty.length} faculty, ${registrars.length} registrars, and ${subjects.length} subjects.`)
