import { supabase, isSupabaseConfigured, showConfigurationError } from './auth-client.js'
import { hideLoadingScreen, showLoadingScreen } from './loading-screen.js'
import { applyUiTheme } from './ui-theme.js'

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

if (!isSupabaseConfigured) showConfigurationError()

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
    messageDiv.style.color = 'red'
    messageDiv.textContent = 'Invalid username or password!'
    submitButton.disabled = false
    hideLoadingScreen()
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
    messageDiv.style.color = 'red'
    messageDiv.textContent = 'Invalid username or password!'
    submitButton.disabled = false
    hideLoadingScreen()
    return
  }

  redirectToDashboard(user)
})

function redirectToDashboard(user) {
  window.location.href = dashboardPages[user.role_id]
}