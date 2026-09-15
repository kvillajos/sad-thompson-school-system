// Deno Edge Function: creates/updates the real Supabase Auth login for an account
// that has a pending `initial_password` (set by review_admission_application()).
// Runs server-side so the service-role key never reaches the browser.
// Deploy with: supabase functions deploy provision-account
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Browsers preflight cross-origin POSTs with a custom Authorization header;
// without these headers supabase.functions.invoke() fails before it even runs.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { user_id } = await req.json()
    if (!user_id) return json({ error: 'user_id is required' }, 400)

    // Verify the caller is a signed-in admin using their forwarded session token.
    const authHeader = req.headers.get('Authorization') || ''
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller?.email) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: callerProfile } = await admin.from('users').select('role_id').eq('email', caller.email).eq('is_active', true).single()
    if (!callerProfile || Number(callerProfile.role_id) !== 1) return json({ error: 'Admin role required' }, 403)

    const { data: account, error: accountError } = await admin
      .from('users').select('user_id, username, email, initial_password').eq('user_id', user_id).single()
    if (accountError || !account) return json({ error: 'Account not found' }, 404)
    if (!account.initial_password) return json({ message: 'Account already provisioned', username: account.username }, 200)

    const { data: existingList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) return json({ error: listError.message }, 500)
    const existing = existingList.users.find(u => u.email?.toLowerCase() === account.email.toLowerCase())

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
