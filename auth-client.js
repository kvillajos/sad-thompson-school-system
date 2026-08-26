import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const inactivityTimeoutMs = 30 * 60 * 1000
let inactivityTimer

function resetInactivityTimer() {
  sessionStorage.setItem('tcsms_last_activity', String(Date.now()))
  clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(signOut, inactivityTimeoutMs)
}

function startInactivityTimeout() {
  const lastActivity = Number(sessionStorage.getItem('tcsms_last_activity'))
  if (lastActivity && Date.now() - lastActivity >= inactivityTimeoutMs) {
    signOut()
    return
  }

  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, resetInactivityTimer, { passive: true })
  })
  resetInactivityTimer()
}

export async function requireRole(roleId) {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    window.location.href = '/index.html'
    return null
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('username, email, role_id, is_active')
    .eq('email', session.user.email)
    .eq('is_active', true)
    .single()

  if (error || !user || Number(user.role_id) !== roleId) {
    await supabase.auth.signOut()
    window.location.href = '/index.html'
    return null
  }

  startInactivityTimeout()
  return user
}

export async function signOut() {
  clearTimeout(inactivityTimer)
  sessionStorage.removeItem('tcsms_last_activity')
  await supabase.auth.signOut()
  window.location.href = '/index.html'
}
