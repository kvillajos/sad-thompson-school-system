import { supabase, isSupabaseConfigured, showConfigurationError } from './auth-client.js'
import { hideLoadingScreen, showLoadingScreen } from './loading-screen.js'
import { applyUiTheme } from './ui-theme.js'
import { loadMaintenanceNotices, renderLoginNotices } from './announcements.js'
import { withPasswordToggle } from './shell.js'
import { describeError } from './errors.js'

applyUiTheme()

// DOM Elements
const loginContainer = document.getElementById('login-container')
const loginForm = document.getElementById('login-form')
const messageDiv = document.getElementById('message')

const dashboardPages = {
  1: '/admin-dashboard.html',
  2: '/student-records.html',
  3: '/faculty/faculty-dashboard.html',
  4: '/student-dashboard.html'
}

// Build/version label so the login screen shows which branch and commit is deployed.
const versionLabel = document.getElementById('app-version')
if (versionLabel) versionLabel.textContent = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'v1.1.0 · local build'

hideLoadingScreen()

// Maintenance announcements are public so people see them before signing in.
loadMaintenanceNotices().then(notices => {
  renderLoginNotices(document.getElementById('maintenance-notices'), notices)
}).catch(() => {})

if (!isSupabaseConfigured) showConfigurationError()

const passwordInput = document.getElementById('password')
withPasswordToggle(passwordInput)
const capsWarning = Object.assign(document.createElement('p'), { className: 'caps-warning', textContent: 'Caps Lock is on.', hidden: true })
capsWarning.setAttribute('aria-live', 'polite')
passwordInput.closest('.form-group').append(capsWarning)
const checkCaps = event => { if (event.getModifierState) capsWarning.hidden = !event.getModifierState('CapsLock') }
passwordInput.addEventListener('keydown', checkCaps)
passwordInput.addEventListener('keyup', checkCaps)
passwordInput.addEventListener('blur', () => { capsWarning.hidden = true })

const LOGIN_FAILURE_MESSAGE = 'Your password is incorrect or this account does not exist.'
// A dropped connection is not a wrong password; saying so stops people from retyping a correct one.
const isNetworkError = error => /fetch|network|load failed/i.test(String(error?.message || error || ''))
function failLogin(message, username, password) {
  messageDiv.style.color = 'red'
  messageDiv.textContent = message
  messageDiv.setAttribute('role', 'alert')
  const submitButton = loginForm.querySelector('[type="submit"]')
  submitButton.disabled = false
  hideLoadingScreen()
  const restore = () => {
    document.getElementById('username').value = username
    document.getElementById('password').value = password
    document.getElementById('password').focus()
  }
  restore()
  requestAnimationFrame(restore)
}

// Handle Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  if (!supabase) {
    showConfigurationError()
    return
  }
  
  const username = document.getElementById('username').value.trim()
  const password = document.getElementById('password').value

  const submitButton = loginForm.querySelector('[type="submit"]')
  submitButton.disabled = true
  showLoadingScreen()

  // find_login_email only knows usernames; an email is used as typed (stored emails are lowercase).
  const { data: email, error: lookupError } = username.includes('@')
    ? { data: username.toLowerCase(), error: null }
    : await supabase.rpc('find_login_email', { login_username: username })

  if (isNetworkError(lookupError)) {
    failLogin(describeError(lookupError, 'Sign in'), username, password)
    return
  }
  if (lookupError || !email) {
    failLogin(LOGIN_FAILURE_MESSAGE, username, password)
    return
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  if (authError) {
    failLogin(isNetworkError(authError) ? describeError(authError, 'Sign in') : LOGIN_FAILURE_MESSAGE, username, password)
    return
  }

  const { data: user, error: profileError } = await supabase
    .from('users')
    .select('role_id, is_active')
    .eq('email', email)
    .eq('is_active', true)
    .single()

  if (isNetworkError(profileError)) {
    await supabase.auth.signOut()
    failLogin(describeError(profileError, 'Sign in'), username, password)
    return
  }
  if (profileError || !user || !dashboardPages[user.role_id]) {
    await supabase.auth.signOut()
    failLogin(LOGIN_FAILURE_MESSAGE, username, password)
    return
  }

  redirectToDashboard(user)
})

function redirectToDashboard(user) {
  window.location.href = dashboardPages[user.role_id]
}
