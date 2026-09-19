import { createClient } from '@supabase/supabase-js'
import { createSessionTimeout } from './session-timeout.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null

// Activity events only reach a visible tab, so the visibility listener hands the session
// over to the 4-hour background clock while the tab is hidden.
const sessionTimeout = createSessionTimeout({ onTimeout: () => { signOut() } })
const ACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart']

function startInactivityTimeout() {
  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, () => sessionTimeout.resetInactivity(), { passive: true })
  })
  document.addEventListener('visibilitychange', () => sessionTimeout.visibilityChanged())
  sessionTimeout.start()
}

export async function requireRole(roleId) {
  if (!supabase) {
    showConfigurationError()
    return null
  }

  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    window.location.href = '/index.html'
    return null
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('user_id, username, email, role_id, is_active, student_id')
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

export function showConfigurationError() {
  const message = document.createElement('div')
  message.setAttribute('role', 'alert')
  message.style.cssText = 'position:fixed;inset:1rem 1rem auto;z-index:10000;padding:1rem;background:#fff4d6;color:#5f4300;border:1px solid #e6c15a;border-radius:8px;font:600 14px/1.5 Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.12)'
  message.textContent = 'Supabase is not configured. Copy .env.example to .env, add the project values, and restart Vite.'
  document.body.appendChild(message)
}

export async function signOut() {
  sessionTimeout.stop()
  await supabase.auth.signOut()
  window.location.href = '/index.html'
}
