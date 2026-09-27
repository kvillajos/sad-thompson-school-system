import { supabase, isSupabaseConfigured, showConfigurationError } from './auth-client.js'
import { hideLoadingScreen, showLoadingScreen } from './loading-screen.js'
import { applyUiTheme } from './ui-theme.js'
import { passwordRules, passwordIsValid } from './shell.js'

applyUiTheme()
hideLoadingScreen()

const form = document.getElementById('reset-password-form')
const messageDiv = document.getElementById('message')
const newPasswordInput = document.getElementById('new-password')
const confirmPasswordInput = document.getElementById('confirm-password')
const rulesList = document.getElementById('pw-rules')

rulesList.innerHTML = passwordRules.map(([label]) => `<li>${label}</li>`).join('')

if (!isSupabaseConfigured) showConfigurationError()

// Only someone who just verified a code (and so holds the short-lived recovery session
// from verifyOtp) should be able to reach this page. Anyone else starts over.
supabase?.auth.getSession().then(({ data: { session } }) => {
  if (!session) window.location.href = '/forgot-password.html'
})

// eye icon show/hide, same as the one in shell.js's Change Password modal
// (duplicated locally since shell.js doesn't export it; safe to swap for an import
// if `withPasswordToggle` is exported later)
const EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>'
const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a19.8 19.8 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a19.7 19.7 0 0 1-3.17 4.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
function withPasswordToggle(input) {
  const wrap = document.createElement('div')
  wrap.className = 'pw-wrap'
  input.replaceWith(wrap)
  wrap.append(input)
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'pw-toggle'
  toggle.innerHTML = EYE_OPEN
  toggle.setAttribute('aria-label', 'Show password')
  toggle.onclick = () => {
    const reveal = input.type === 'password'
    input.type = reveal ? 'text' : 'password'
    toggle.innerHTML = reveal ? EYE_OFF : EYE_OPEN
    toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password')
  }
  wrap.append(toggle)
}
withPasswordToggle(newPasswordInput)
withPasswordToggle(confirmPasswordInput)

const strengthNames = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
const strengthColors = ['#dc2626', '#dc2626', '#f59e0b', '#65a30d', '#16a34a']
function showStrength() {
  const pw = newPasswordInput.value
  const passed = passwordRules.map(([, test]) => test(pw))
  const met = passed.filter(Boolean).length
  const level = !pw ? 0 : met === passed.length ? (pw.length >= 12 ? 4 : 3) : Math.min(2, met)
  rulesList.querySelectorAll('li').forEach((li, index) => li.classList.toggle('ok', passed[index]))
  const fill = document.getElementById('pw-fill')
  fill.style.width = `${pw ? (level + 1) * 20 : 0}%`
  fill.style.background = strengthColors[level]
  document.getElementById('pw-label').textContent = pw ? strengthNames[level] : 'Enter a password'
}
newPasswordInput.addEventListener('input', showStrength)

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  if (!supabase) {
    showConfigurationError()
    return
  }

  const newPassword = newPasswordInput.value
  const confirmPassword = confirmPasswordInput.value

  if (!passwordIsValid(newPassword)) {
    messageDiv.style.color = 'red'
    messageDiv.textContent = 'Password must be at least 8 characters with an uppercase letter, a lowercase letter and a number.'
    return
  }
  if (newPassword !== confirmPassword) {
    messageDiv.style.color = 'red'
    messageDiv.textContent = 'Passwords do not match.'
    return
  }

  const submitButton = form.querySelector('[type="submit"]')
  submitButton.disabled = true
  showLoadingScreen()

  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) {
    messageDiv.style.color = 'red'
    messageDiv.textContent = error.message
    submitButton.disabled = false
    hideLoadingScreen()
    return
  }

  try { sessionStorage.removeItem('tcsms_reset_email') } catch {}
  await supabase.auth.signOut()

  messageDiv.style.color = ''
  messageDiv.textContent = 'Password updated. Redirecting to sign in...'
  window.setTimeout(() => { window.location.href = '/index.html' }, 1800)
})
