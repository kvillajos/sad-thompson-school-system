// Creates the real Supabase Auth login for students whose admission was approved
// in the browser (admin-dashboard.html). The browser can only insert the
// username/temp-password into the custom `users` table via a Postgres function
// (see database/migration-v2-features.sql); it cannot call the Auth Admin API
// directly because that requires the service-role key, which must never be
// exposed to the browser. Run this script (with the service role key) after
// approving applications so those accounts can actually log in.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: pending, error } = await supabase
  .from('users')
  .select('user_id, username, email, initial_password')
  .not('initial_password', 'is', null)

if (error) throw error
if (!pending?.length) {
  console.log('No accounts are waiting for provisioning.')
  process.exit(0)
}

for (const account of pending) {
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw listError
  const existing = existingUsers.users.find(u => u.email?.toLowerCase() === account.email.toLowerCase())

  if (existing) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password: account.initial_password,
      email_confirm: true,
      user_metadata: { username: account.username, role: 'student' }
    })
    if (updateError) { console.error(`Failed to update ${account.email}: ${updateError.message}`); continue }
  } else {
    const { error: createError } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.initial_password,
      email_confirm: true,
      user_metadata: { username: account.username, role: 'student' }
    })
    if (createError) { console.error(`Failed to create ${account.email}: ${createError.message}`); continue }
  }

  const { error: clearError } = await supabase.from('users').update({ initial_password: null }).eq('user_id', account.user_id)
  if (clearError) { console.error(`Provisioned ${account.email} but failed to clear temp password: ${clearError.message}`); continue }
  console.log(`Provisioned login for ${account.username} (${account.email}).`)
}
