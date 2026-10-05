import { createClient } from '@supabase/supabase-js'
import { randomBytes, scryptSync } from 'node:crypto'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const passwordMode = process.env.SEED_STUDENT_PASSWORD || 'initials'

if (!url || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')
}
if (passwordMode !== 'initials' && passwordMode.length < 8) throw new Error('SEED_STUDENT_PASSWORD must be "initials" or a password with at least 8 characters.')

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const students = [
  ['TCS-26-10001', 'Juan Pablo', 'Dela Cruz', '2013-04-12', 'Male', 7],
  ['TCS-26-10002', 'Maria Clara', 'Santos', '2014-01-28', 'Female', 6],
  ['TCS-26-10003', 'Jose Mercado', 'Rizal', '2012-09-03', 'Male', 8],
  ['TCS-26-10004', 'Andrea Mae', 'Garcia', '2011-11-19', 'Female', 9],
  ['TCS-26-10005', 'Miguel Angelo', 'Bautista', '2010-06-25', 'Male', 10],
  ['TCS-26-10006', 'Sofia Marie', 'Mendoza', '2015-02-14', 'Female', 5],
  ['TCS-26-10007', 'Gabriel Luis', 'Navarro', '2013-08-07', 'Male', 7],
  ['TCS-26-10008', 'Isabella Rose', 'Flores', '2012-12-21', 'Female', 8],
  ['TCS-26-10009', 'Paolo Miguel', 'Rivera', '2014-05-30', 'Male', 6],
  ['TCS-26-10010', 'Camila Joy', 'Aquino', '2011-03-16', 'Female', 9],
  ['TCS-26-10011', 'Lorenzo Gabriel', 'Garcia', '2013-07-11', 'Male', 7],
  ['TCS-26-10012', 'Beatriz Anne', 'Magsaysay', '2014-02-06', 'Female', 6],
  ['TCS-26-10013', 'Rafael Andres', 'Villanueva', '2012-10-18', 'Male', 8],
  ['TCS-26-10014', 'Hannah Nicole', 'Castillo', '2011-05-09', 'Female', 9],
  ['TCS-26-10015', 'Enrique Luis', 'Manalo', '2010-08-23', 'Male', 10],
  ['TCS-26-10016', 'Patricia Mae', 'Navarro', '2015-01-17', 'Female', 5],
  ['TCS-26-10017', 'Nicolas Juan', 'Domingo', '2013-11-02', 'Male', 7],
  ['TCS-26-10018', 'Aurora Faith', 'Del Rosario', '2012-03-27', 'Female', 8],
  ['TCS-26-10019', 'Christian Mark', 'Valdez', '2014-09-14', 'Male', 6],
  ['TCS-26-10020', 'Gabriela Sofia', 'Pascual', '2011-12-08', 'Female', 9],
  ['TCS-26-10021', 'Antonio Jose', 'Mercado', '2010-04-19', 'Male', 10],
  ['TCS-26-10022', 'Elaine Marie', 'Santiago', '2015-06-12', 'Female', 5],
  ['TCS-26-10023', 'Marco Antonio', 'Tolentino', '2013-01-29', 'Male', 7],
  ['TCS-26-10024', 'Carmela Rose', 'Dizon', '2012-07-24', 'Female', 8],
  ['TCS-26-10025', 'Rodrigo Paulo', 'Fernandez', '2011-10-05', 'Male', 9],
  ['TCS-26-10026', 'Mikaela Grace', 'Soriano', '2014-12-16', 'Female', 6],
  ['TCS-26-10027', 'Benjamin Carlo', 'Lacson', '2010-02-11', 'Male', 10],
  ['TCS-26-10028', 'Theresa Joy', 'Ocampo', '2015-08-30', 'Female', 5],
  ['TCS-26-10029', 'Dominic Sean', 'Ramos', '2013-05-22', 'Male', 7],
  ['TCS-26-10030', 'Clarissa Mae', 'Benedicto', '2012-11-13', 'Female', 8],
  ['TCS-26-10031', 'Felix Adrian', 'Cortez', '2011-01-07', 'Male', 9],
  ['TCS-26-10032', 'Angela Marie', 'Salazar', '2014-06-28', 'Female', 6],
  ['TCS-26-10033', 'Jerome Kyle', 'Yap', '2010-09-21', 'Male', 10],
  ['TCS-26-10034', 'Danica Louise', 'Chua', '2015-03-04', 'Female', 5],
  ['TCS-26-10035', 'Samuel Vincent', 'Aguilar', '2013-09-26', 'Male', 7],
  ['TCS-26-10036', 'Bianca Camille', 'Lim', '2012-04-15', 'Female', 8],
  ['TCS-26-10037', 'Nathaniel James', 'Co', '2011-06-03', 'Male', 9],
  ['TCS-26-10038', 'Juliana Kate', 'Estrada', '2014-08-11', 'Female', 6],
  ['TCS-26-10039', 'Vincent Carlo', 'Marquez', '2010-12-29', 'Male', 10],
  ['TCS-26-10040', 'Marissa Claire', 'Gonzales', '2015-10-20', 'Female', 5]
]

function getStudentUsername(firstName, lastName) {
  const firstNameInitials = firstName.split(/\s+/).filter(Boolean).map(name => name[0]).join('')
  const surname = lastName.replace(/[^a-z]/gi, '').toLowerCase()
  return `${firstNameInitials}${surname}`.toLowerCase()
}

function getStudentPassword(firstName, lastName) {
  if (passwordMode !== 'initials') return passwordMode
  return `${getStudentUsername(firstName, lastName)}123`
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

async function getOrCreateAuthUser(email, username, password) {
  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw listError
  const existing = users.users.find(user => user.email?.toLowerCase() === email.toLowerCase() || user.user_metadata?.username === username)
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, { email, password, email_confirm: true, user_metadata: { username, role: 'student' } })
    if (error) throw error
    return data.user
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, role: 'student' } })
  if (error) throw error
  return data.user
}

for (const [lrn, firstName, lastName, dateOfBirth, gender, gradeLevel] of students) {
  const username = getStudentUsername(firstName, lastName)
  const email = `${username}@tcs.edu.ph`
  const password = getStudentPassword(firstName, lastName)
  const passwordHash = hashPassword(password)
  const authUser = await getOrCreateAuthUser(email, username, password)
  const { data: existingStudent, error: studentLookupError } = await supabase.from('students').select('student_id').eq('lrn_number', lrn).maybeSingle()
  if (studentLookupError) throw studentLookupError
  const studentId = existingStudent?.student_id || null
  const { data: linkedAccount, error: linkedAccountError } = studentId
    ? await supabase.from('users').select('user_id').eq('student_id', studentId).maybeSingle()
    : { data: null, error: null }
  if (linkedAccountError) throw linkedAccountError
  const { data: emailAccount, error: emailAccountError } = linkedAccount
    ? { data: null, error: null }
    : await supabase.from('users').select('user_id').eq('email', email).maybeSingle()
  if (emailAccountError) throw emailAccountError
  const existingAccount = linkedAccount || emailAccount
  const baseAccountPayload = { username, email, password_hash: passwordHash, role_id: 4, is_active: true }
  let accountId = existingAccount?.user_id || null
  if (!accountId) {
    const accountResult = await supabase.from('users').insert(baseAccountPayload).select('user_id').single()
    if (accountResult.error) throw accountResult.error
    accountId = accountResult.data.user_id
  } else {
    const accountResult = await supabase.from('users').update(baseAccountPayload).eq('user_id', accountId)
    if (accountResult.error) throw accountResult.error
  }
  const studentPayload = { lrn_number: lrn, first_name: firstName, last_name: lastName, date_of_birth: dateOfBirth, gender, grade_level: gradeLevel }
  const studentResult = existingStudent
    ? await supabase.from('students').update({ ...studentPayload, user_id: accountId }).eq('student_id', existingStudent.student_id).select('student_id').single()
    : await supabase.from('students').insert({ ...studentPayload, user_id: accountId }).select('student_id').single()
  if (studentResult.error) throw studentResult.error
  const savedStudentId = studentResult.data.student_id
  const accountResult = await supabase.from('users').update({ ...baseAccountPayload, student_id: savedStudentId }).eq('user_id', accountId)
  if (accountResult.error) throw accountResult.error
  console.log(`${username} | ${email} | Password ${password} | Auth ID ${authUser.id} | Student ID ${savedStudentId}`)
}

console.log(`Seeded ${students.length} Filipino student accounts.`)
