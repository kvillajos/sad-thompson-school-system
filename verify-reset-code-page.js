import { supabase, isSupabaseConfigured, showConfigurationError } from './auth-client.js'
import { hideLoadingScreen, showLoadingScreen } from './loading-screen.js'
import { applyUiTheme } from './ui-theme.js'

applyUiTheme()
hideLoadingScreen()

const form = document.getElementById('verify-code-form')
const messageDiv = document.getElementById('message')
const codeInput = document.getElementById('code')

if (!isSupabaseConfigured) showConfigurationError()

// The email is carried over from forgot-password.html via sessionStorage (same tab/session,
// matching how auth-client.js already scopes the Supabase session to sessionStorage).
// Landing here without it means the flow wasn't started properly, so send them back to start.
let email = ''
try { email = sessionStorage.getItem('tcsms_reset_email') || '' } catch {}
if (!email) window.location.href = '/forgot-password.html'

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  if (!supabase) {
    showConfigurationError()
    return
  }

  const code = codeInput.value.trim()
  const submitButton = form.querySelector('[type="submit"]')
  submitButton.disabled = true
  showLoadingScreen()

  // On success this also signs the user into a short-lived recovery session, which
  // reset-password.html relies on to call updateUser().
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })

  if (error) {
    messageDiv.style.color = 'red'
    messageDiv.textContent = 'That code is invalid or has expired. Please try again.'
    submitButton.disabled = false
    hideLoadingScreen()
    return
  }

  window.location.href = '/reset-password.html'
})
