<<<<<<< HEAD
import { supabase } from './auth-client.js'
import { hideLoadingScreen } from './loading-screen.js'

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

=======
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// DOM Elements
const loginContainer = document.getElementById('login-container')
const dashboardContainer = document.getElementById('dashboard-container')
const loginForm = document.getElementById('login-form')
const messageDiv = document.getElementById('message')
const userDisplay = document.getElementById('user-display')
const emailDisplay = document.getElementById('email-display')
const logoutBtn = document.getElementById('logout-btn')

// Check active session on load
const currentSession = JSON.parse(sessionStorage.getItem('tcsms_user'))
if (currentSession) {
  showDashboard(currentSession)
}

>>>>>>> 67b42edc8833838d19ea0e224fe3311856993196
// Handle Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  
  const username = document.getElementById('username').value.trim()
<<<<<<< HEAD
  const password = document.getElementById('password').value
=======
  const password = document.getElementById('password').value.trim()
>>>>>>> 67b42edc8833838d19ea0e224fe3311856993196

  messageDiv.style.color = '#333'
  messageDiv.textContent = 'Authenticating...'

<<<<<<< HEAD
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
=======
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)

  if (error || !data || data.length === 0) {
>>>>>>> 67b42edc8833838d19ea0e224fe3311856993196
    messageDiv.style.color = 'red'
    messageDiv.textContent = 'Invalid username or password!'
    return
  }

<<<<<<< HEAD
  redirectToDashboard(user)
})

function redirectToDashboard(user) {
  window.location.href = dashboardPages[user.role_id]
=======
  const user = data[0]

  if (user.password_hash === password) {
    // Store user session state
    sessionStorage.setItem('tcsms_user', JSON.stringify(user))
    messageDiv.textContent = ''
    showDashboard(user)
  } else {
    messageDiv.style.color = 'red'
    messageDiv.textContent = 'Invalid username or password!'
  }
})

// Handle Logout
logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('tcsms_user')
  dashboardContainer.classList.add('hidden')
  loginContainer.classList.remove('hidden')
  document.getElementById('username').value = ''
  document.getElementById('password').value = ''
})

// UI Helper Function
function showDashboard(user) {
  loginContainer.classList.add('hidden')
  dashboardContainer.classList.remove('hidden')
  userDisplay.textContent = user.username
  emailDisplay.textContent = user.email
>>>>>>> 67b42edc8833838d19ea0e224fe3311856993196
}