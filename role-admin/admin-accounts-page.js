  import { supabase } from '../shared/lib/auth-client.js'
  import { toast } from '../shared/ui/ui-theme.js'
  import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
  import { escapeHtml as escape, formatDate, errorRow, activeStatus } from '../shared/lib/html.js'
  import { confirmPassword, withBusy } from '../shared/ui/shell.js'
  import { confirmDialog, noticeDialog } from '../shared/ui/dialog.js'
  import { describeError, describeFunctionError } from '../shared/lib/errors.js'
  import { mountAdminShell, createStaffAccount } from './admin-page.js'
  import { fetchAll } from '../shared/lib/fetch-all.js'
  const admin = await mountAdminShell('accounts')
  const verify = message => confirmPassword(admin.email, message)
  const roleNames = { 1: 'Administrator', 2: 'Registrar', 3: 'Faculty', 4: 'Student' }
  let accounts = []
  async function loadAccounts() {
    const result = await fetchAll(() => supabase.from('users').select('username,email,role_id,is_active,student_id,user_id,initial_password,profile_picture_url,created_at').is('deleted_at', null).order('role_id').order('username').order('user_id'))
    const table = document.getElementById('accounts-table')
    if (result.error) return table.innerHTML = errorRow(7, result.error, 'Load accounts')
    accounts = result.data || []
    renderAccounts()
  }
  function renderAccounts() {
    const search = document.getElementById('account-search').value.trim().toLowerCase()
    const role = document.getElementById('account-role').value
    const rows = accounts.filter(item => (!role || String(item.role_id) === role) && (!search || `${item.username} ${item.email}`.toLowerCase().includes(search)))
    document.getElementById('accounts-table').innerHTML = rows.map(item => `<tr><td>${escape(item.username)}</td><td>${escape(item.email)}</td><td>${roleNames[item.role_id] || 'Unknown'}</td><td>${activeStatus(item.is_active)}</td><td>${item.student_id ? `Student #${item.student_id}` : '-'}</td><td>${formatDate(item.created_at, true)}</td><td><button class="admin-view" data-details="${item.user_id}">View / Edit</button> ${item.initial_password ? `<button class="admin-view" data-provision="${item.user_id}">Provision Login</button> ` : ''}<button class="admin-view" data-toggle="${item.user_id}" data-active="${item.is_active}">${item.is_active ? 'Deactivate' : 'Activate'}</button> <button class="admin-view" data-reset="${item.user_id}">Reset Password</button>${item.user_id === admin.user_id ? '' : ` <button class="admin-remove" data-delete-account="${item.user_id}">Delete</button>`}</td></tr>`).join('') || '<tr><td colspan="7">No accounts found.</td></tr>'
    document.querySelectorAll('[data-details]').forEach(button => button.onclick = () => showAccountDetails(button.dataset.details))
    document.querySelectorAll('[data-provision]').forEach(button => button.onclick = () => runAccountAction(button.dataset.provision, 'provision', button))
    document.querySelectorAll('[data-toggle]').forEach(button => button.onclick = () => runAccountAction(button.dataset.toggle, button.dataset.active === 'true' ? 'deactivate' : 'activate', button))
    document.querySelectorAll('[data-reset]').forEach(button => button.onclick = () => runAccountAction(button.dataset.reset, 'reset', button))
    document.querySelectorAll('[data-delete-account]').forEach(button => button.onclick = () => deleteAccount(button.dataset.deleteAccount, button))
  }

  const HOLD_MS = 1500
  // Typed sentence -> 3 s wait -> press and hold. Resolves true only when the hold completes.
  function deleteAccountDialog(item) {
    return new Promise(resolve => {
      const sentence = `delete ${item.username}`
      const modal = document.createElement('div')
      modal.className = 'admin-modal stack-above'
      modal.innerHTML = `<div class="admin-modal-box" style="width:min(100%,460px)"><div class="admin-modal-head"><h3>Delete account</h3><button type="button" data-delete-close>x</button></div><p style="margin:0 0 12px;line-height:1.5">Deleting <b>${escape(item.username)}</b> blocks its login immediately and hides it from this list. It can be restored from <b>Audit Trail → Restore Changes</b> for 30 days, then it is erased for good. ${item.student_id ? 'The student record, grades and enrollment are kept.' : 'The staff profile and history are kept.'}</p><label style="display:block;font-size:13px">Type <b>${escape(sentence)}</b> to confirm<input maxlength="100" data-delete-sentence autocomplete="off" spellcheck="false" style="margin-top:6px"></label><p data-delete-status class="admin-note" style="margin:10px 0 0;font-size:12px">Type the sentence above to continue.</p><div class="admin-actions" style="margin-top:14px"><button type="button" class="admin-cancel" data-delete-cancel>Cancel</button><button type="button" class="hold-delete" data-delete-hold disabled><span>Hold to delete</span></button></div></div>`
      document.body.appendChild(modal)
      const input = modal.querySelector('[data-delete-sentence]')
      const status = modal.querySelector('[data-delete-status]')
      const hold = modal.querySelector('[data-delete-hold]')
      let countdown = null
      let holdFrame = null
      const finish = value => { clearInterval(countdown); cancelAnimationFrame(holdFrame); modal.remove(); resolve(value) }
      modal.querySelector('[data-delete-close]').onclick = modal.querySelector('[data-delete-cancel]').onclick = () => finish(false)
      input.oninput = () => {
        clearInterval(countdown)
        hold.disabled = true
        if (input.value.trim() !== sentence) { status.textContent = 'Type the sentence above to continue.'; return }
        let left = 3
        status.textContent = `Wait ${left}s…`
        countdown = setInterval(() => {
          left -= 1
          if (left > 0) { status.textContent = `Wait ${left}s…`; return }
          clearInterval(countdown)
          hold.disabled = false
          status.textContent = 'Press and hold the button to delete.'
        }, 1000)
      }
      const stopHold = () => { cancelAnimationFrame(holdFrame); holdFrame = null; hold.style.setProperty('--hold', '0%') }
      const startHold = () => {
        if (hold.disabled || holdFrame) return
        const start = performance.now()
        const step = now => {
          const progress = Math.min(1, (now - start) / HOLD_MS)
          hold.style.setProperty('--hold', `${progress * 100}%`)
          if (progress >= 1) return finish(true)
          holdFrame = requestAnimationFrame(step)
        }
        holdFrame = requestAnimationFrame(step)
      }
      hold.addEventListener('pointerdown', startHold)
      ;['pointerup', 'pointerleave', 'pointercancel'].forEach(type => hold.addEventListener(type, stopHold))
      hold.addEventListener('keydown', event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startHold() } })
      hold.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') stopHold() })
      input.focus()
    })
  }

  async function deleteAccount(userId, button) {
    const item = accounts.find(account => String(account.user_id) === String(userId))
    if (!item) return
    if (!await verify(`Enter your password to delete ${item.username}.`)) return
    if (!await deleteAccountDialog(item)) return
    await withBusy(button, 'Deleting…', async () => {
      const { error } = await supabase.functions.invoke('provision-account', { body: { user_id: Number(userId), action: 'delete' } })
      if (error) return toast(await describeFunctionError(error, 'Delete account'), 'error')
      toast(`${item.username} deleted. It can be restored from Audit Trail for 30 days.`)
      await loadAccounts()
    })
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
      const { error } = await withBusy(event.submitter || event.target.querySelector('.admin-primary'), 'Saving…', () => supabase.rpc('admin_update_student', { p_student_id: item.student_id, p_changes: changes }))
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
    const { data: profile, error: profileError } = await supabase.from(relation).select('*').eq(key, item.student_id || item.user_id).maybeSingle()
    if (profileError) toast(describeError(profileError, 'Load profile details'), 'error')
    const account = { user_id: item.user_id, role: roleNames[item.role_id] || 'Unknown', status: item.is_active ? 'Active' : 'Inactive', linked_record: item.student_id ? 'Student #' + item.student_id : null }
    const skip = new Set(['profile_picture_url', 'initial_password', 'user_id'])
    const grid = rows => rows.map(([k, v]) => `<div><small>${escape(label(k))}</small><p>${escape(format(k, v))}</p></div>`).join('')
    const fullName = profile ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ') : ''
    const initials = (fullName || item.username).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
    const roleOptions = Object.entries(roleNames).map(([id, name]) => `<option value="${id}" ${item.role_id === Number(id) ? 'selected' : ''}>${name}</option>`).join('')
    // A student's photo lives on the student record, not the account row.
    const picture = item.profile_picture_url || (item.student_id ? profile?.profile_picture_url : null)
    document.getElementById('account-details-body').innerHTML = `<div class="account-hero"><div class="account-avatar">${picture ? `<img src="${escape(picture)}" alt="Profile picture">` : escape(initials || '?')}</div><div><p class="account-hero-name">${escape(fullName || item.username)}</p><div class="account-hero-meta"><span class="badge">${escape(account.role)}</span><span class="badge${account.status === 'Active' ? ' active' : ''}">${escape(account.status)}</span></div></div>${picture ? `<button class="admin-view" data-revert-picture="${item.user_id}">Revert Picture</button>` : ''}</div><form id="account-edit-form" class="account-edit-grid"><label>Username<input id="account-edit-username" value="${escape(item.username)}" maxlength="80" required></label><label>Email<input value="${escape(item.email)}" readonly></label><label>Role<select id="account-edit-role">${roleOptions}</select></label><div class="admin-actions"><button class="admin-primary">Save Account</button></div></form><h4>Account</h4><div class="review-grid">${grid(Object.entries(account))}</div><div class="account-section-head"><h4>Profile</h4>${item.student_id && profile ? '<button class="admin-view" id="edit-student-info" type="button">Edit Student Info</button>' : ''}</div><div id="account-profile-host"><div class="review-grid">${profile ? grid(Object.entries(profile).filter(([k]) => !skip.has(k))) : '<p>No linked profile record.</p>'}</div></div>`
    document.getElementById('account-edit-form').onsubmit = event => saveAccount(event, item.user_id)
    document.querySelector('[data-revert-picture]')?.addEventListener('click', () => revertPicture(item))
    document.getElementById('edit-student-info')?.addEventListener('click', () => editStudentInfo(item, profile))
    document.getElementById('account-details-modal').classList.remove('hidden')
  }
  async function saveAccount(event, userId) {
    event.preventDefault()
    const usernameInput = document.getElementById('account-edit-username')
    const username = usernameInput.value.trim()
    const roleId = Number(document.getElementById('account-edit-role').value)
    if (!username) { usernameInput.value = ''; return usernameInput.reportValidity() }
    const item = accounts.find(account => String(account.user_id) === String(userId))
    if (item && item.role_id !== roleId && !await confirmDialog(`Change ${item.username} from ${roleNames[item.role_id]} to ${roleNames[roleId]}? They will get the pages and permissions of the new role the next time they sign in.`, { title: 'Change role', confirmText: 'Change role', danger: roleId === 1 || item.role_id === 1 })) return
    // .select() returns the changed rows, so an update that RLS silently skipped is reported instead of "saved".
    const { data, error } = await withBusy(event.submitter || event.target.querySelector('button'), 'Saving…', () => supabase.from('users').update({ username, role_id: roleId }).eq('user_id', userId).select('user_id'))
    if (error) return toast(describeError(error, 'Save account'), 'error')
    if (!data?.length) return toast('Save account failed: the change was not applied. You may not have permission to edit this account.', 'error')
    document.getElementById('account-details-modal').classList.add('hidden')
    toast('Account saved.')
    await loadAccounts()
  }
  async function revertPicture(item) {
    if (!await confirmDialog('Remove this profile picture? The account holder can upload a new one.', { title: 'Revert picture', confirmText: 'Remove picture', danger: true })) return
    const { data, error } = item.student_id
      ? await supabase.from('students').update({ profile_picture_url: null }).eq('student_id', item.student_id).select('student_id')
      : await supabase.from('users').update({ profile_picture_url: null }).eq('user_id', item.user_id).select('user_id')
    if (error) return toast(describeError(error, 'Revert picture'), 'error')
    if (!data?.length) return toast('Revert picture failed: the change was not applied.', 'error')
    document.getElementById('account-details-modal').classList.add('hidden')
    toast('Profile picture removed.')
    await loadAccounts()
  }
  const actionText = { provision: ['provision a login for', 'Provisioning…'], deactivate: ['deactivate', 'Deactivating…'], activate: ['activate', 'Activating…'], reset: ['reset the password of', 'Resetting…'] }
  async function runAccountAction(userId, action, button) {
    const item = accounts.find(account => String(account.user_id) === String(userId))
    const [verb, busy] = actionText[action]
    if (!await verify(`Enter your password to ${verb} ${item?.username || 'this account'}.${action === 'deactivate' ? ' They will not be able to sign in until the account is activated again.' : ''}`)) return
    await withBusy(button, busy, async () => {
      const { data, error } = await supabase.functions.invoke('provision-account', { body: { user_id: Number(userId), action } })
      if (error) return toast(await describeFunctionError(error, 'Account action'), 'error')
      if (action === 'reset') await noticeDialog(`New temporary password for ${data.username}. Share it with the account holder securely; it will not be shown again.`, { title: 'Temporary password', copyText: data.temporary_password })
      else if (action === 'provision') toast(`Login "${data.username}" is ready to use.`)
      else toast(action === 'deactivate' ? `${item?.username || 'Account'} deactivated.` : `${item?.username || 'Account'} activated.`)
      await loadAccounts()
    })
  }
  document.getElementById('account-search').oninput = renderAccounts
  document.getElementById('account-role').onchange = renderAccounts
  document.getElementById('add-account').onclick = async () => { if (await createStaffAccount()) await loadAccounts() }
  document.getElementById('close-account-details').onclick = () => document.getElementById('account-details-modal').classList.add('hidden')
  await loadAccounts()
  hideLoadingScreen()

