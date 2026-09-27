import { supabase, isSupabaseConfigured, showConfigurationError } from './auth-client.js'
import { hideLoadingScreen, showLoadingScreen } from './loading-screen.js'
import { applyUiTheme } from './ui-theme.js'

applyUiTheme()

const form = document.getElementById('forgot-password-form')
const messageDiv = document.getElementById('message')
const emailInput = document.getElementById('email')

hideLoadingScreen()

if (!isSupabaseConfigured) showConfigurationError()

// Never reveal whether an email is registered: same wording either way.
const GENERIC_MESSAGE = "If that email is registered, we sent a code. Check your inbox, then enter the code on the next screen."

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  if (!supabase) {
    showConfigurationError()
    return
  }

  const email = emailInput.value.trim()
  const submitButton = form.querySelector('[type="submit"]')
  submitButton.disabled = true
  showLoadingScreen()

  // redirectTo matters only if the email template also includes a confirmation link;
  // the primary flow here is the emailed code, checked on verify-reset-code.html.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/verify-reset-code.html`
  })

  // Log for debugging only — never shown to the user, so a bad actor can't use the
  // response to find out which emails are registered.
  if (error) console.error('resetPasswordForEmail:', error.message)

  try {
    sessionStorage.setItem('tcsms_reset_email', email)
  } catch {}

  messageDiv.style.color = ''
  messageDiv.textContent = GENERIC_MESSAGE

  submitButton.disabled = false
  hideLoadingScreen()

  window.setTimeout(() => {
    window.location.href = '/verify-reset-code.html'
  }, 1800)
})
