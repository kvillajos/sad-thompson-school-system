import { supabase, isSupabaseConfigured, showConfigurationError } from './auth-client.js'
import { hideLoadingScreen, showLoadingScreen } from './loading-screen.js'
import { applyUiTheme } from './ui-theme.js'
import { passwordRules, passwordIsValid, withPasswordToggle } from './shell.js'

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
