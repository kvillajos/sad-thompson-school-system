import { supabase, isSupabaseConfigured, showConfigurationError } from './auth-client.js'
import { hideLoadingScreen, showLoadingScreen } from './loading-screen.js'
import { applyUiTheme } from './ui-theme.js'
import { loadMaintenanceNotices } from './announcements.js'
import { escapeHtml } from './html.js'

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
  document.getElementById('maintenance-notices').innerHTML = notices.map(item => `<div class="maintenance-banner" role="status"><strong>${item.pinned ? '&#128204; ' : ''}${escapeHtml(item.title)}</strong>${item.message ? `<span>${escapeHtml(item.message)}</span>` : ''}</div>`).join('')
}).catch(() => {})

if (!isSupabaseConfigured) showConfigurationError()

const LOGIN_FAILURE_MESSAGE = 'Your password is incorrect or this account does not exist.'
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

  const { data: email, error: lookupError } = await supabase
    .rpc('find_login_email', { login_username: username })

  if (lookupError || !email) {
    failLogin(LOGIN_FAILURE_MESSAGE, username, password)
    return
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  const { data: user, error: profileError } = await supabase
    .from('users')
    .select('role_id, is_active')
    .eq('email', email)
    .eq('is_active', true)
    .single()

  if (authError || profileError || !user || !dashboardPages[user.role_id]) {
    failLogin(LOGIN_FAILURE_MESSAGE, username, password)
    return
  }

  redirectToDashboard(user)
})

function redirectToDashboard(user) {
  window.location.href = dashboardPages[user.role_id]
}