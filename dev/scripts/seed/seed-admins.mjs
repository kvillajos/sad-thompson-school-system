import { createClient } from '@supabase/supabase-js'
import { randomBytes, scryptSync } from 'node:crypto'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const admins = [
  ['ADM-GKHAN', 'Genghis', 'Gol', 'Khan', 'gkhan', 'gkhan123'],
  ['ADM-AGREAT', 'Alexander', 'Mace', 'Great', 'agreat', 'agreat123']
]

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`
}

const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError

for (const [employeeCode, firstName, middleName, lastName, username, password] of admins) {
  const email = `${username}@tcs.edu.ph`
  const existingAuth = authUsers.users.find(user => user.email?.toLowerCase() === email || user.user_metadata?.username === username)
  const authPayload = { email, password, email_confirm: true, user_metadata: { username, role: 'admin' } }
  const authResult = existingAuth
    ? await supabase.auth.admin.updateUserById(existingAuth.id, authPayload)
    : await supabase.auth.admin.createUser(authPayload)
  if (authResult.error) throw authResult.error

  const accountPayload = { username, email, password_hash: hashPassword(password), role_id: 1, is_active: true }
  const { data: account, error: accountLookupError } = await supabase.from('users').select('user_id').eq('email', email).maybeSingle()
  if (accountLookupError) throw accountLookupError
  const accountResult = account
    ? await supabase.from('users').update(accountPayload).eq('user_id', account.user_id).select('user_id').single()
    : await supabase.from('users').insert(accountPayload).select('user_id').single()
  if (accountResult.error) throw accountResult.error

  const profileResult = await supabase.from('admins').upsert({
    user_id: accountResult.data.user_id,
    employee_code: employeeCode,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName
  }, { onConflict: 'user_id' })
  if (profileResult.error) throw profileResult.error
  console.log(`${username} | ${email} | Password ${password}`)
}

console.log(`Seeded ${admins.length} administrator accounts.`)
