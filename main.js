import { supabase } from './auth-client.js'
import { hideLoadingScreen } from './loading-screen.js'
import { applyUiTheme } from './ui-theme.js'

applyUiTheme()

// DOM Elements
const loginContainer = document.getElementById('login-container')
const loginForm = document.getElementById('login-form')
const messageDiv = document.getElementById('message')

const dashboardPages = {
  1: '/admin-dashboard.html',
  2: '/student-records.html',
  3: '/faculty-dashboard.html',
  4: '/student-dashboard.html'
}

const { data: { session } } = await supabase.auth.getSession()
if (session) {
  const { data: user } = await supabase
    .from('users')
    .select('role_id, is_active')
    .eq('email', session.user.email)
    .eq('is_active', true)
    .single()

  if (user && dashboardPages[user.role_id]) redirectToDashboard(user)
  else await supabase.auth.signOut()
}

hideLoadingScreen()

// Handle Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  
  const username = document.getElementById('username').value.trim()
  const password = document.getElementById('password').value

  messageDiv.style.color = '#333'
  messageDiv.textContent = 'Authenticating...'

  const { data: email, error: lookupError } = await supabase
    .rpc('find_login_email', { login_username: username })

  if (lookupError || !email) {
    messageDiv.style.color = 'red'
    messageDiv.textContent = 'Invalid username or password!'
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
    return
  }

  redirectToDashboard(user)
})

function redirectToDashboard(user) {
  window.location.href = dashboardPages[user.role_id]
}