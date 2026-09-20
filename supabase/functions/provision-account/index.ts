// Deno Edge Function: creates/updates the real Supabase Auth login for an account
// that has a pending `initial_password` (set by review_admission_application()), and
// gives the admin accounts page its create/deactivate/reset actions. Runs server-side
// so the service-role key never reaches the browser.
// Deploy with: supabase functions deploy provision-account
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Browsers preflight cross-origin POSTs with a custom Authorization header;
// without these headers supabase.functions.invoke() fails before it even runs.
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

function randomPassword() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { user_id, action = 'provision', request_id } = await req.json()
    if (!user_id) return json({ error: 'user_id is required' }, 400)
    if (!['provision', 'deactivate', 'activate', 'reset', 'approve-profile-change', 'reject-profile-change'].includes(action)) return json({ error: 'Unknown action' }, 400)

    // Verify the caller is a signed-in admin using their forwarded session token.
    const authHeader = req.headers.get('Authorization') || ''
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller?.email) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: callerProfile } = await admin.from('users').select('user_id,role_id').eq('email', caller.email).eq('is_active', true).single()
    if (!callerProfile || Number(callerProfile.role_id) !== 1) return json({ error: 'Admin role required' }, 403)

    if (action === 'approve-profile-change' || action === 'reject-profile-change') {
      const { data: request, error: requestError } = await admin.from('profile_change_requests').select('*').eq('request_id', request_id).eq('status', 'pending').single()
      if (requestError || !request) return json({ error: 'Pending profile change not found' }, 404)
      if (action === 'reject-profile-change') {
        const { error } = await admin.from('profile_change_requests').update({ status: 'rejected', reviewed_by: callerProfile.user_id, reviewed_at: new Date().toISOString() }).eq('request_id', request_id)
        if (error) return json({ error: error.message }, 500)
        return json({ status: 'rejected' })
      }
      const after = request.after_data
      const { data: target, error: targetError } = await admin.from('users').select('email,student_id,role_id').eq('user_id', request.user_id).single()
      if (targetError || !target) return json({ error: 'Target account not found' }, 404)
      const { data: existingList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (listError) return json({ error: listError.message }, 500)
      const existingTarget = existingList.users.find(u => u.email?.toLowerCase() === target.email.toLowerCase())
      if (existingTarget) {
        const authUpdate = await admin.auth.admin.updateUserById(existingTarget.id, { email: after.email, email_confirm: true })
        if (authUpdate.error) return json({ error: authUpdate.error.message }, 500)
      }
      const { error: userUpdateError } = await admin.from('users').update({ email: after.email }).eq('user_id', request.user_id)
      if (userUpdateError) return json({ error: userUpdateError.message }, 500)
      const profileData = { first_name: after.first_name, middle_name: after.middle_name || null, last_name: after.last_name }
      if (target.student_id) {
        const { error: nameError } = await admin.from('students').update(profileData).eq('student_id', target.student_id)
        if (nameError) return json({ error: nameError.message }, 500)
      } else if (Number(target.role_id) === 1) {
        const { data: adminProfile, error: profileLookupError } = await admin.from('admins').select('admin_id').eq('user_id', request.user_id).maybeSingle()
        if (profileLookupError) return json({ error: profileLookupError.message }, 500)
        const profileResult = adminProfile
          ? await admin.from('admins').update({ first_name: after.first_name, last_name: after.last_name }).eq('admin_id', adminProfile.admin_id)
          : await admin.from('admins').insert({ user_id: request.user_id, employee_code: `ADM-${request.user_id}`, first_name: after.first_name, last_name: after.last_name })
        if (profileResult.error) return json({ error: profileResult.error.message }, 500)
      } else {
        const { data: staffProfile, error: profileLookupError } = await admin.from('staff_profiles').select('profile_id').eq('user_id', request.user_id).maybeSingle()
        if (profileLookupError) return json({ error: profileLookupError.message }, 500)
        const profileResult = staffProfile
          ? await admin.from('staff_profiles').update(profileData).eq('profile_id', staffProfile.profile_id)
          : await admin.from('staff_profiles').insert({ ...profileData, user_id: request.user_id, employee_no: `ADM-${request.user_id}`, department: 'Administration' })
        if (profileResult.error) return json({ error: profileResult.error.message }, 500)
      }
      const { error: requestUpdateError } = await admin.from('profile_change_requests').update({ status: 'approved', reviewed_by: callerProfile.user_id, reviewed_at: new Date().toISOString() }).eq('request_id', request_id)
      if (requestUpdateError) return json({ error: requestUpdateError.message }, 500)
      return json({ status: 'approved' })
    }

    const { data: account, error: accountError } = await admin
      .from('users').select('user_id, username, email, initial_password, student_id').eq('user_id', user_id).single()
    if (accountError || !account) return json({ error: 'Account not found' }, 404)

    const { data: existingList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) return json({ error: listError.message }, 500)

    const existing = existingList.users.find(u => u.email?.toLowerCase() === account.email.toLowerCase())

    if (action === 'deactivate' || action === 'activate') {
      const isActive = action === 'activate'
      const { error: statusError } = await admin.from('users').update({ is_active: isActive }).eq('user_id', user_id)
      if (statusError) return json({ error: statusError.message }, 500)
      if (existing) {
        const banResult = await admin.auth.admin.updateUserById(existing.id, { ban_duration: isActive ? 'none' : '876000h' })
        if (banResult.error) return json({ error: banResult.error.message }, 500)
      }
      return json({ username: account.username, is_active: isActive })
    }

    if (action === 'reset') {
      const newPassword = randomPassword()
      const result = existing
        ? await admin.auth.admin.updateUserById(existing.id, { password: newPassword })
        : await admin.auth.admin.createUser({ email: account.email, password: newPassword, email_confirm: true, user_metadata: { username: account.username } })
      if (result.error) return json({ error: result.error.message }, 500)
      // Returned once so the admin can relay it; never persisted in the database.
      return json({ username: account.username, email: account.email, temporary_password: newPassword })
    }

    if (!account.initial_password) return json({ message: 'Account already provisioned', username: account.username }, 200)

    const payload = { email: account.email, password: account.initial_password, email_confirm: true, user_metadata: { username: account.username } }
    const result = existing
      ? await admin.auth.admin.updateUserById(existing.id, payload)
      : await admin.auth.admin.createUser(payload)
    if (result.error) return json({ error: result.error.message }, 500)

    const { error: clearError } = await admin.from('users').update({ initial_password: null }).eq('user_id', user_id)
    if (clearError) return json({ error: clearError.message }, 500)

    return json({ username: account.username, email: account.email })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
