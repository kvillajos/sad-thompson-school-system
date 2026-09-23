  import { supabase } from './auth-client.js'
  import { toast } from './ui-theme.js'
  import { hideLoadingScreen } from './loading-screen.js'
  import { escapeHtml as escape, formatDate } from './html.js'
  import { confirmPassword } from './shell.js'
  import { describeError } from './errors.js'
  import { mountAdminShell } from './admin-page.js'
  const admin = await mountAdminShell('accounts')
  const verify = message => confirmPassword(admin.email, message)
  const roleNames = { 1: 'Administrator', 2: 'Registrar', 3: 'Faculty', 4: 'Student' }
  let accounts = []
  async function loadAccounts() {
    const result = await supabase.from('users').select('username,email,role_id,is_active,student_id,user_id,initial_password,profile_picture_url').order('role_id').order('username')
    const table = document.getElementById('accounts-table')
    if (result.error) return table.innerHTML = `<tr><td colspan="6">${escape(result.error.message)}</td></tr>`
    accounts = result.data || []
    renderAccounts()
  }
  function renderAccounts() {
    const search = document.getElementById('account-search').value.trim().toLowerCase()
    const role = document.getElementById('account-role').value
    const rows = accounts.filter(item => (!role || String(item.role_id) === role) && (!search || `${item.username} ${item.email}`.toLowerCase().includes(search)))
    document.getElementById('accounts-table').innerHTML = rows.map(item => `<tr><td>${escape(item.username)}</td><td>${escape(item.email)}</td><td>${roleNames[item.role_id] || 'Unknown'}</td><td>${item.is_active ? 'Active' : 'Inactive'}</td><td>${item.student_id ? `Student #${item.student_id}` : '-'}</td><td><button class="admin-view" data-details="${item.user_id}">View / Edit</button> ${item.initial_password ? `<button class="admin-view" data-provision="${item.user_id}">Provision Login</button> ` : ''}<button class="admin-view" data-toggle="${item.user_id}" data-active="${item.is_active}">${item.is_active ? 'Deactivate' : 'Activate'}</button> <button class="admin-view" data-reset="${item.user_id}">Reset Password</button></td></tr>`).join('') || '<tr><td colspan="6">No accounts found.</td></tr>'
    document.querySelectorAll('[data-details]').forEach(button => button.onclick = () => showAccountDetails(button.dataset.details))
    document.querySelectorAll('[data-provision]').forEach(button => button.onclick = () => runAccountAction(button.dataset.provision, 'provision', button))
    document.querySelectorAll('[data-toggle]').forEach(button => button.onclick = () => runAccountAction(button.dataset.toggle, button.dataset.active === 'true' ? 'deactivate' : 'activate', button))
    document.querySelectorAll('[data-reset]').forEach(button => button.onclick = () => runAccountAction(button.dataset.reset, 'reset', button))
  }
  const label = key => key.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
  const format = (key, value) => {
    if (value === null || value === undefined || value === '') return '-'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (/_at$/.test(key)) return formatDate(value, true)
    if (/date|birth/.test(key)) return formatDate(value)
    return String(value)
  }
  async function showAccountDetails(userId) {
    const item = accounts.find(account => String(account.user_id) === String(userId))
    if (!item) return
    if (!await verify('Enter your password to view this account.')) return
    const relation = item.student_id ? 'students' : item.role_id === 1 ? 'admins' : 'staff_profiles'
    const key = item.student_id ? 'student_id' : 'user_id'
    const { data: profile } = await supabase.from(relation).select('*').eq(key, item.student_id || item.user_id).maybeSingle()
    const account = { user_id: item.user_id, role: roleNames[item.role_id] || 'Unknown', status: item.is_active ? 'Active' : 'Inactive', linked_record: item.student_id ? 'Student #' + item.student_id : null }
    const skip = new Set(['profile_picture_url', 'initial_password', 'user_id'])
    const grid = rows => rows.map(([k, v]) => `<div><small>${escape(label(k))}</small><p>${escape(format(k, v))}</p></div>`).join('')
    document.getElementById('account-details-body').innerHTML = `<form id="account-edit-form"><label class="admin-full">Username<input id="account-edit-username" value="${escape(item.username)}" maxlength="80" required></label><label class="admin-full">Email<input value="${escape(item.email)}" readonly></label><label class="admin-full">Role<select id="account-edit-role"><option value="1" ${item.role_id === 1 ? 'selected' : ''}>Administrator</option><option value="2" ${item.role_id === 2 ? 'selected' : ''}>Registrar</option><option value="3" ${item.role_id === 3 ? 'selected' : ''}>Faculty</option><option value="4" ${item.role_id === 4 ? 'selected' : ''}>Student</option></select></label><div class="admin-actions"><button class="admin-primary">Save Account</button></div></form><div class="account-picture">${item.profile_picture_url ? `<img src="${escape(item.profile_picture_url)}" alt="Profile picture"> <button class="admin-view" data-revert-picture="${item.user_id}">Revert Picture</button>` : '<p>No profile picture.</p>'}</div><h4>Account</h4><div class="review-grid">${grid(Object.entries(account))}</div><h4>Profile</h4><div class="review-grid">${profile ? grid(Object.entries(profile).filter(([k]) => !skip.has(k))) : '<p>No linked profile record.</p>'}</div>`
    document.getElementById('account-edit-form').onsubmit = event => saveAccount(event, item.user_id)
    document.querySelector('[data-revert-picture]')?.addEventListener('click', () => revertPicture(userId))
    document.getElementById('account-details-modal').classList.remove('hidden')
  }
  async function saveAccount(event, userId) {
    event.preventDefault()
    const username = document.getElementById('account-edit-username').value.trim()
    const roleId = Number(document.getElementById('account-edit-role').value)
    if (!username) return window.alert('Username is required.')
    const { error } = await supabase.from('users').update({ username, role_id: roleId }).eq('user_id', userId)
    if (error) return toast(describeError(error, 'Save account'), 'error')
    document.getElementById('account-details-modal').classList.add('hidden')
    await loadAccounts()
  }
  async function revertPicture(userId) {
    const { error } = await supabase.from('users').update({ profile_picture_url: null }).eq('user_id', userId)
    if (error) return toast(describeError(error, 'Revert picture'), 'error')
    document.getElementById('account-details-modal').classList.add('hidden')
    await loadAccounts()
  }
  async function runAccountAction(userId, action, button) {
    if (!await verify('Enter your password to confirm this action.')) return
    button.disabled = true
    try {
      const { data, error } = await supabase.functions.invoke('provision-account', { body: { user_id: Number(userId), action } })
      if (error) return toast(describeError(error, 'Account action'), 'error')
      if (action === 'reset') window.alert(`New temporary password for ${data.username}: ${data.temporary_password}\nShare this with the account holder securely - it will not be shown again.`)
      else if (action === 'provision') window.alert(`Login "${data.username}" is ready to use.`)
      await loadAccounts()
    } finally {
      button.disabled = false
    }
  }
  document.getElementById('account-search').oninput = renderAccounts
  document.getElementById('account-role').onchange = renderAccounts
  document.getElementById('close-account-details').onclick = () => document.getElementById('account-details-modal').classList.add('hidden')
  await loadAccounts()
  hideLoadingScreen()

