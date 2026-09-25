  import { supabase } from './auth-client.js'
  import { toast } from './ui-theme.js'
  import { hideLoadingScreen } from './loading-screen.js'
  import { escapeHtml as escape, formatDate } from './html.js'
  import { confirmPassword } from './shell.js'
  import { describeError } from './errors.js'
  import { mountAdminShell } from './admin-page.js'
  import { fetchAll } from './fetch-all.js'
  const admin = await mountAdminShell('accounts')
  const verify = message => confirmPassword(admin.email, message)
  const roleNames = { 1: 'Administrator', 2: 'Registrar', 3: 'Faculty', 4: 'Student' }
  let accounts = []
  async function loadAccounts() {
    const result = await fetchAll(() => supabase.from('users').select('username,email,role_id,is_active,student_id,user_id,initial_password,profile_picture_url').order('role_id').order('username').order('user_id'))
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
  const GRADES = Array.from({ length: 13 }, (_, n) => n)
  const STUDENT_FIELDS = [
    ['first_name', 'First name'], ['middle_name', 'Middle name'], ['last_name', 'Last name'],
    ['date_of_birth', 'Date of birth', 'date'], ['gender', 'Gender', ['Male', 'Female']], ['grade_level', 'Grade level', 'grade'],
    ['enrollment_status', 'Status', ['Enrolled', 'Pending', 'Graduated', 'Transferred', 'Withdrawn']], ['contact_number', 'Contact number'], ['guardian_name', 'Guardian name'],
    ['guardian_relationship', 'Guardian relationship'], ['guardian_phone', 'Guardian phone'], ['guardian_email', 'Guardian email', 'email'],
    ['address', 'Address', 'wide'], ['medical_notes', 'Medical notes', 'area']
  ]
  // Admin edits a student's record: password re-check, one database call that applies and audits it, and the student is notified.
  function editStudentInfo(item, profile) {
    const input = ([key, text, kind]) => {
      const value = profile[key] ?? ''
      if (Array.isArray(kind)) return `<label>${text}<select data-student-field="${key}"><option value="">-</option>${kind.map(option => `<option ${option === value ? 'selected' : ''}>${option}</option>`).join('')}</select></label>`
      if (kind === 'grade') return `<label>${text}<select data-student-field="${key}"><option value="">-</option>${GRADES.map(n => `<option value="${n}" ${String(n) === String(value) ? 'selected' : ''}>${n === 0 ? 'Kindergarten' : 'Grade ' + n}</option>`).join('')}</select></label>`
      if (kind === 'area') return `<label class="wide">${text}<textarea data-student-field="${key}" maxlength="500">${escape(value)}</textarea></label>`
      return `<label class="${kind === 'wide' ? 'wide' : ''}">${text}<input data-student-field="${key}" type="${kind === 'date' || kind === 'email' ? kind : 'text'}" value="${escape(value)}" maxlength="200"></label>`
    }
    const host = document.getElementById('account-profile-host')
    document.getElementById('edit-student-info').classList.add('hidden')
    host.innerHTML = `<form id="student-edit-form" class="account-edit-grid">${STUDENT_FIELDS.map(input).join('')}<p class="wide" style="margin:0;color:#64748b;font-size:12px">The student is notified of every change and it is recorded in the audit trail.</p><div class="admin-actions"><button type="button" class="admin-cancel" id="student-edit-cancel">Cancel</button><button class="admin-primary">Save Student Info</button></div></form>`
    document.getElementById('student-edit-cancel').onclick = () => showAccountDetails(item.user_id, { verified: true })
    document.getElementById('student-edit-form').onsubmit = async event => {
      event.preventDefault()
      const changes = {}
      host.querySelectorAll('[data-student-field]').forEach(field => { changes[field.dataset.studentField] = field.value })
      if (!await verify('Enter your password to save changes to this student.')) return
      const { error } = await supabase.rpc('admin_update_student', { p_student_id: item.student_id, p_changes: changes })
      if (error) return toast(describeError(error, 'Save student info'), 'error')
      toast('Saved. The student has been notified.')
      await showAccountDetails(item.user_id, { verified: true })
    }
  }
  async function showAccountDetails(userId, { verified = false } = {}) {
    const item = accounts.find(account => String(account.user_id) === String(userId))
    if (!item) return
    if (!verified && !await verify('Enter your password to view this account.')) return
    const relation = item.student_id ? 'students' : item.role_id === 1 ? 'admins' : 'staff_profiles'
    const key = item.student_id ? 'student_id' : 'user_id'
    const { data: profile } = await supabase.from(relation).select('*').eq(key, item.student_id || item.user_id).maybeSingle()
    const account = { user_id: item.user_id, role: roleNames[item.role_id] || 'Unknown', status: item.is_active ? 'Active' : 'Inactive', linked_record: item.student_id ? 'Student #' + item.student_id : null }
    const skip = new Set(['profile_picture_url', 'initial_password', 'user_id'])
    const grid = rows => rows.map(([k, v]) => `<div><small>${escape(label(k))}</small><p>${escape(format(k, v))}</p></div>`).join('')
    const fullName = profile ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ') : ''
    const initials = (fullName || item.username).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
    const roleOptions = Object.entries(roleNames).map(([id, name]) => `<option value="${id}" ${item.role_id === Number(id) ? 'selected' : ''}>${name}</option>`).join('')
    document.getElementById('account-details-body').innerHTML = `<div class="account-hero"><div class="account-avatar">${item.profile_picture_url ? `<img src="${escape(item.profile_picture_url)}" alt="Profile picture">` : escape(initials || '?')}</div><div><p class="account-hero-name">${escape(fullName || item.username)}</p><div class="account-hero-meta"><span class="badge">${escape(account.role)}</span><span class="badge">${escape(account.status)}</span></div></div>${item.profile_picture_url ? `<button class="admin-view" data-revert-picture="${item.user_id}">Revert Picture</button>` : ''}</div><form id="account-edit-form" class="account-edit-grid"><label>Username<input id="account-edit-username" value="${escape(item.username)}" maxlength="80" required></label><label>Email<input value="${escape(item.email)}" readonly></label><label>Role<select id="account-edit-role">${roleOptions}</select></label><div class="admin-actions"><button class="admin-primary">Save Account</button></div></form><h4>Account</h4><div class="review-grid">${grid(Object.entries(account))}</div><div class="account-section-head"><h4>Profile</h4>${item.student_id && profile ? '<button class="admin-view" id="edit-student-info" type="button">Edit Student Info</button>' : ''}</div><div id="account-profile-host"><div class="review-grid">${profile ? grid(Object.entries(profile).filter(([k]) => !skip.has(k))) : '<p>No linked profile record.</p>'}</div></div>`
    document.getElementById('account-edit-form').onsubmit = event => saveAccount(event, item.user_id)
    document.querySelector('[data-revert-picture]')?.addEventListener('click', () => revertPicture(userId))
    document.getElementById('edit-student-info')?.addEventListener('click', () => editStudentInfo(item, profile))
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

