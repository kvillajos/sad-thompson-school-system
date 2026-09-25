      import { supabase } from './auth-client.js'
      import { hideLoadingScreen } from './loading-screen.js'
      import { escapeHtml as escape, formatDate, richText } from './html.js'
      import { toast } from './ui-theme.js'
      import { staleFields } from './edit-request.js'
      import { withBusy, confirmPassword } from './shell.js'
      import { isEditLocked, editLockMessage } from './edit-lock.js'
      import { describeError } from './errors.js'
      import { mountAdminShell } from './admin-page.js'
import { mountAnnouncements, pinIcon } from './announcements.js'
      const user = await mountAdminShell('dashboard')

      let applications = []
      let selectedApplication = null
      let countdownTimer = null

      let profileRequests = []
      let approvalErrors = []
      let approvalRequests = []
      const requestLabels = { admission: 'Admission', profile: 'Profile change', grade_correction: 'Grade correction', withdrawal: 'Withdrawal / transfer', promotion: 'Batch promotion', account_action: 'Account action', override: 'Capacity override', student_profile: 'Student profile edit' }
      const approvalsTable = document.getElementById('approvals-table')
      const approvalFilter = document.getElementById('approval-filter')

      function renderApprovals() {
        const query = approvalFilter.value.trim().toLowerCase()
        const rows = [
          ...applications.map(application => ({ type: 'admission', at: application.created_at, html: `<td>Admission</td><td>${escape(application.first_name)} ${escape(application.last_name)} - Grade ${escape(application.grade_level)}</td><td>Registrar</td><td>${formatDate(application.created_at, true)}${isEditLocked(application) ? ' <b title="The registrar has this file open for correction.">✏️ editing</b>' : ''}</td><td><button class="admin-view" data-review="${application.id}">Review</button></td>` })),
          ...profileRequests.map(request => ({ type: 'profile', at: request.created_at, html: `<td>Profile change</td><td>${escape(`${request.before_data.first_name} ${request.before_data.last_name} / ${request.before_data.email}`)} → ${escape(`${request.after_data.first_name} ${request.after_data.last_name} / ${request.after_data.email}`)}</td><td>${escape(request.requester)}</td><td>${formatDate(request.created_at, true)}</td><td><button class="admin-approve" data-profile-action="approve" data-request="${request.request_id}" data-user="${request.user_id}">Approve</button> <button class="admin-remove" data-profile-action="reject" data-request="${request.request_id}" data-user="${request.user_id}">Reject</button></td>` })),
          ...approvalRequests.map(request => ({ type: request.request_type, at: request.created_at, html: `<td>${requestLabels[request.request_type]}</td><td>${escape(request.summary)}<br><small>Reason: ${escape(request.reason)}</small></td><td>${escape(request.requester_name || '-')}</td><td>${formatDate(request.created_at, true)}</td><td><button class="admin-approve" data-request-action="approve" data-approval="${request.id}">Approve</button> <button class="admin-remove" data-request-action="reject" data-approval="${request.id}">Reject</button></td>` }))
        ].filter(row => requestLabels[row.type].toLowerCase().includes(query)).sort((x, y) => new Date(y.at) - new Date(x.at))
        approvalsTable.innerHTML = approvalErrors.map(message => `<tr><td colspan="5">${escape(message)}</td></tr>`).join('') + (rows.map(row => `<tr>${row.html}</tr>`).join('') || '<tr><td colspan="5">No pending approvals.</td></tr>')
        approvalsTable.querySelectorAll('[data-review]').forEach(button => button.onclick = () => openReview(button.dataset.review))
        approvalsTable.querySelectorAll('[data-request-action]').forEach(button => button.onclick = () => reviewRequest(button.dataset.approval, button.dataset.requestAction === 'approve', button))
        approvalsTable.querySelectorAll('[data-profile-action]').forEach(button => button.onclick = () => reviewProfileChange(button.dataset.request, button.dataset.user, button.dataset.profileAction, button))
      }
      // Searchable type filter: typing narrows the rows and the list; the list shows a pending count per type.
      const typeList = document.getElementById('approval-types')
      let activeOption = -1
      const typeCounts = () => { const counts = {}; [...applications.map(() => 'admission'), ...profileRequests.map(() => 'profile'), ...approvalRequests.map(item => item.request_type)].forEach(type => { counts[type] = (counts[type] || 0) + 1 }); return counts }
      function showTypeList(all) {
        const query = all ? '' : approvalFilter.value.trim().toLowerCase()
        const counts = typeCounts()
        const options = Object.entries(requestLabels).filter(([, label]) => label.toLowerCase().includes(query))
        typeList.innerHTML = (!query ? '<li data-type="">All types</li>' : '') + (options.map(([type, label]) => `<li data-type="${type}" role="option" aria-selected="${label === approvalFilter.value}">${escape(label)}<small>${counts[type] || 0}</small></li>`).join('') || '<li class="combo-empty">No matching type</li>')
        typeList.classList.remove('hidden')
        approvalFilter.setAttribute('aria-expanded', 'true')
        activeOption = -1
      }
      const hideTypeList = () => { typeList.classList.add('hidden'); approvalFilter.setAttribute('aria-expanded', 'false') }
      const pickType = item => { approvalFilter.value = item.dataset.type ? requestLabels[item.dataset.type] : ''; hideTypeList(); renderApprovals() }
      approvalFilter.oninput = () => { showTypeList(false); renderApprovals() }
      approvalFilter.onfocus = approvalFilter.onclick = () => showTypeList(!approvalFilter.value || Object.values(requestLabels).includes(approvalFilter.value))
      document.getElementById('approval-toggle').onclick = () => typeList.classList.contains('hidden') ? (approvalFilter.focus(), showTypeList(true)) : hideTypeList()
      typeList.onmousedown = event => { const item = event.target.closest('li[data-type]'); if (item) { event.preventDefault(); pickType(item) } }
      approvalFilter.onkeydown = event => {
        const items = [...typeList.querySelectorAll('li[data-type]')]
        if (event.key === 'Escape') return hideTypeList()
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (typeList.classList.contains('hidden')) showTypeList(true)
          event.preventDefault()
          activeOption = (activeOption + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          items.forEach((item, index) => item.classList.toggle('active', index === activeOption))
          items[activeOption]?.scrollIntoView({ block: 'nearest' })
        } else if (event.key === 'Enter' && items[activeOption]) { event.preventDefault(); pickType(items[activeOption]) }
      }
      document.addEventListener('click', event => { if (!event.target.closest('.combo')) hideTypeList() })

      async function loadApplications() {
        const { data, error } = await supabase.from('admission_applications').select('id,first_name,last_name,grade_level,status,created_at,editing_by,editing_since').in('status', ['submitted', 'under_review']).order('created_at', { ascending: false })
        applications = error ? [] : data || []
        approvalErrors = approvalErrors.filter(message => !message.startsWith('Admissions: '))
        if (error) approvalErrors.push(`Admissions: ${error.message}`)
        renderApprovals()
      }

      async function loadProfileRequests() {
        const requestResult = await supabase.from('profile_change_requests').select('request_id,user_id,before_data,after_data,created_at').eq('status', 'pending').order('created_at', { ascending: false })
        const requests = requestResult.data || []
        const userIds = [...new Set(requests.map(request => request.user_id))]
        const userResult = userIds.length ? await supabase.from('users').select('user_id,username,email').in('user_id', userIds) : { data: [], error: null }
        const users = new Map((userResult.data || []).map(account => [account.user_id, account]))
        const error = requestResult.error || userResult.error
        profileRequests = error ? [] : requests.map(request => ({ ...request, requester: users.get(request.user_id)?.username || users.get(request.user_id)?.email || String(request.user_id) }))
        approvalErrors = approvalErrors.filter(message => !message.startsWith('Profile changes: '))
        if (error) approvalErrors.push(`Profile changes: ${error.message}`)
        renderApprovals()
      }

      async function loadApprovalRequests() {
        const { data, error } = await supabase.from('approval_requests').select('id,request_type,payload,summary,reason,requester_name,created_at').eq('status', 'pending').order('created_at', { ascending: false })
        approvalRequests = error ? [] : data || []
        approvalErrors = approvalErrors.filter(message => !message.startsWith('Requests: '))
        if (error) approvalErrors.push(`Requests: ${error.message}`)
        renderApprovals()
      }

      async function reviewRequest(id, approve, button) {
        const request = approvalRequests.find(item => String(item.id) === String(id))
        if (!request) return
        let remarks = null
        if (!approve) {
          remarks = window.prompt('Reason for rejecting (optional):')
          if (remarks === null) return
        } else {
          // A profile edit is based on the values the student saw; warn if the record was changed by someone else since.
          let warning = ''
          if (request.request_type === 'student_profile' && request.payload?.before) {
            const { data: record } = await supabase.from('students').select('*').eq('student_id', request.payload.student_id).maybeSingle()
            const stale = staleFields(request.payload.before, record)
            if (stale.length) warning = `

WARNING: ${stale.join(', ')} changed after this request was made. Approving overwrites the newer value.`
          }
          if (!window.confirm(`Approve this request?

${request.summary}${warning}`)) return
        }
        await withBusy(button, approve ? 'Approving…' : 'Rejecting…', async () => {
          const action = request.payload
          // Password reset and (de)activation change the Supabase login, so the Edge Function runs before the approval is recorded.
          if (approve && request.request_type === 'account_action' && action.action !== 'role_change') {
            const { data, error } = await supabase.functions.invoke('provision-account', { body: { user_id: Number(action.target_user_id), action: action.action } })
            if (error) return toast(describeError(error, 'Account action'), 'error')
            if (data?.temporary_password) window.alert(`Temporary password for ${data.username}: ${data.temporary_password}

Shown once. Give it to the account owner.`)
          }
          const { error } = await supabase.rpc('review_approval', { p_id: Number(id), p_approve: approve, p_remarks: remarks })
          if (error) return toast(describeError(error, 'Review request'), 'error')
          toast(approve ? 'Request approved.' : 'Request rejected.')
          await loadApprovalRequests()
        })
      }

      async function reviewProfileChange(requestId, userId, action, button) {
        const originalLabel = button.textContent
        button.disabled = true
        button.textContent = action === 'approve' ? 'Approving...' : 'Rejecting...'
        try {
          const { error } = await supabase.functions.invoke('provision-account', { body: { user_id: Number(userId), action: `${action}-profile-change`, request_id: Number(requestId) } })
          if (error) {
            let message = error.message
            try {
              const details = await error.context?.json()
              message = details?.error || details?.message || message
            } catch {}
            return toast(describeError(message, 'Profile change'), 'error')
          }
          await loadProfileRequests()
        } catch (error) {
          toast(describeError(error instanceof Error ? error : 'The profile change could not be processed.', 'Profile change'), 'error')
        } finally {
          button.disabled = false
          button.textContent = originalLabel
        }
      }

      let editingLocked = false
      function openReview(id) {
        selectedApplication = applications.find(a => String(a.id) === String(id))
        if (!selectedApplication) return
        const a = selectedApplication
        editingLocked = isEditLocked(a)
        document.getElementById('review-lock').classList.toggle('hidden', !editingLocked)
        if (editingLocked) document.getElementById('review-lock-text').textContent = editLockMessage(a)
        document.getElementById('review-details').innerHTML = `
          <div class="review-grid">
            <div><small>Student</small><p>${escape(a.first_name)} ${escape(a.last_name)}</p></div>
            <div><small>Grade Level</small><p>${escape(a.grade_level)}</p></div>
            <div><small>Current Status</small><p>${escape(a.status)}</p></div>
            <div><small>Submitted</small><p>${formatDate(a.created_at)}</p></div>
          </div>`
        document.getElementById('review-remarks').value = ''
        document.getElementById('review-modal').classList.remove('hidden')
        startReviewCountdown()
      }

      async function showEnrolleeDetails() {
        if (!selectedApplication) return
        const button = document.getElementById('view-enrollee-details')
        await withBusy(button, 'Loading…', async () => {
          const [applicationResult, documentsResult] = await Promise.all([
            supabase.from('admission_applications').select('*').eq('id', selectedApplication.id).single(),
            supabase.from('application_documents').select('document_type,original_name,file_path,uploaded_at').eq('application_id', selectedApplication.id).order('uploaded_at')
          ])
          if (applicationResult.error) return toast(describeError(applicationResult.error, 'Load enrollee details'), 'error')
          const a = applicationResult.data
          const documents = documentsResult.data || []
          const documentLinks = await Promise.all(documents.map(async document => {
            const result = await supabase.storage.from('admission-documents').createSignedUrl(document.file_path, 600)
            return `<li>${escape(document.document_type)}: ${result.error ? escape(result.error.message) : `<a href="${escape(result.data.signedUrl)}" target="_blank" rel="noopener">${escape(document.original_name)}</a>`}</li>`
          }))
          document.getElementById('review-details').innerHTML = `<div class="review-grid enrollee-details-grid">
            <div><small>Student</small><p>${escape(`${a.first_name || ''} ${a.middle_name || ''} ${a.last_name || ''}`)}</p></div><div><small>Grade Level</small><p>${escape(a.grade_level || '-')}</p></div>
            <div><small>Birth Date</small><p>${escape(a.birth_date || '-')}</p></div><div><small>Sex</small><p>${escape(a.sex || '-')}</p></div>
            <div><small>Address</small><p>${escape(a.address || '-')}</p></div><div><small>Prior School</small><p>${escape(a.prior_school || '-')}</p></div>
            <div><small>Guardian</small><p>${escape(a.guardian_name || '-')} (${escape(a.guardian_relationship || '-')})</p></div><div><small>Guardian Contact</small><p>${escape(a.guardian_phone || '-')} / ${escape(a.guardian_email || '-')}</p></div>
          </div><h4>Uploaded Documents</h4><ul class="document-list">${documentLinks.join('') || '<li>No documents uploaded.</li>'}</ul>`
        })
      }
      document.getElementById('view-enrollee-details').onclick = showEnrolleeDetails

      function startReviewCountdown() {
        const approveBtn = document.getElementById('approve-application')
        const declineBtn = document.getElementById('decline-application')
        const countdownEl = document.getElementById('review-countdown')
        const secondsEl = document.getElementById('review-countdown-seconds')
        approveBtn.disabled = true
        declineBtn.disabled = true
        countdownEl.classList.remove('hidden')
        let secondsLeft = 3
        secondsEl.textContent = secondsLeft
        clearInterval(countdownTimer)
        countdownTimer = setInterval(() => {
          secondsLeft -= 1
          if (secondsLeft <= 0) {
            clearInterval(countdownTimer)
            countdownEl.classList.add('hidden')
            if (!editingLocked) {
              approveBtn.disabled = false
              declineBtn.disabled = false
            }
            return
          }
          secondsEl.textContent = secondsLeft
        }, 1000)
      }

      function closeReview() {
        clearInterval(countdownTimer)
        editingLocked = false
        document.getElementById('review-lock').classList.add('hidden')
        document.getElementById('review-modal').classList.add('hidden')
        loadApplications()
      }
      document.getElementById('close-review').onclick = closeReview

      async function reviewApplication(status, button) {
        await withBusy(button, status === 'approved' ? 'Approving…' : 'Declining…', async () => {
          const remarks = document.getElementById('review-remarks').value.trim()
          const { data, error } = await supabase.rpc('review_admission_application', { p_application_id: selectedApplication.id, p_status: status, p_remarks: remarks || null })
          if (error) return toast(describeError(error, 'Review application'), 'error')
          closeReview()
          if (status === 'approved' && data?.new_user_id) {
            const { data: provision, error: provisionError } = await supabase.functions.invoke('provision-account', { body: { user_id: data.new_user_id } })
            if (provisionError) window.alert(`Application approved, but the login could not be auto-provisioned: ${provisionError.message}. Run "npm run provision:accounts" to fix this.`)
            else window.alert(`Application approved. Student login "${provision.username}" is ready to use.`)
          } else if (status === 'approved') {
            window.alert('Application approved.')
          }
          await loadApplications()
        })
      }
      document.getElementById('approve-application').onclick = event => reviewApplication('approved', event.currentTarget)
      document.getElementById('decline-application').onclick = event => reviewApplication('rejected', event.currentTarget)

      await loadApplications()
      await loadProfileRequests()
      await loadApprovalRequests()
      setInterval(loadApplications, 30000)
      setInterval(loadProfileRequests, 30000)
      setInterval(loadApprovalRequests, 30000)

      // "First Last" using only the first word of the first name; stored on the row because recipients can't read other users.
      async function currentAuthorName() {
        const { data } = await supabase.from('admins').select('first_name,last_name').eq('user_id', user.user_id).maybeSingle()
        return data ? `${String(data.first_name).trim().split(/\s+/)[0]} ${String(data.last_name).trim()}` : user.username
      }
      // Rich message -> one line of plain text for the table cell.
      const plainText = html => { const box = document.createElement('div'); box.innerHTML = richText(html || '').replace(/<\/(p|div|li|h3|blockquote)>|<br>/gi, ' '); return (box.textContent || '').replace(/\s+/g, ' ').trim() }
      let announcementRows = []
      let editingAnnouncement = null
      async function loadAnnouncements() {
        const table = document.getElementById('announcements-table')
        const { data, error } = await supabase.from('announcements').select('id,title,message,kind,audience,pinned,posted_at,expires_at,author_name').order('pinned', { ascending: false }).order('posted_at', { ascending: false }).limit(30)
        if (error) return table.innerHTML = `<tr><td colspan="7">${escape(error.message)}</td></tr>`
        announcementRows = data || []
        const audienceLabels = { all: 'Everyone', admin: 'Admins', registrar: 'Registrars', faculty: 'Faculty', student: 'Students' }
        table.innerHTML = (data || []).map(a => `<tr><td>${a.pinned ? pinIcon : ''}${escape(a.title)}</td><td class="ann-msg" title="${escape(plainText(a.message))}">${escape(plainText(a.message)) || '-'}</td><td>${a.kind === 'maintenance' ? '<span class="badge urgent-badge">Urgent</span>' : 'Notice'}${a.expires_at ? (new Date(a.expires_at) < new Date() ? ' <small>(expired)</small>' : `<br><small>hides ${formatDate(a.expires_at, true)}</small>`) : ''}</td><td>${audienceLabels[a.audience] || escape(a.audience)}</td><td>${escape(a.author_name || '-')}</td><td>${formatDate(a.posted_at)}</td><td class="ann-actions"><button class="admin-view" data-edit-announcement="${a.id}">Edit</button> <button class="admin-view" data-pin-announcement="${a.id}" data-pinned="${a.pinned}">${a.pinned ? 'Unpin' : 'Pin'}</button> <button class="admin-remove" data-remove-announcement="${a.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="7">No announcements posted.</td></tr>'
        table.querySelectorAll('[data-edit-announcement]').forEach(button => button.onclick = () => openAnnouncementForm(announcementRows.find(row => row.id === Number(button.dataset.editAnnouncement))))
        table.querySelectorAll('[data-pin-announcement]').forEach(button => button.onclick = async () => {
          const { error: pinError } = await supabase.from('announcements').update({ pinned: button.dataset.pinned !== 'true' }).eq('id', Number(button.dataset.pinAnnouncement))
          if (pinError) return toast(describeError(pinError, 'Pin announcement'), 'error')
          await loadAnnouncements()
          mountAnnouncements(document.getElementById('announcements-host'), 'admin', { list: false })
        })
        table.querySelectorAll('[data-remove-announcement]').forEach(button => button.onclick = async () => {
          if (!window.confirm('Remove this announcement?')) return
          const { error: removeError } = await supabase.from('announcements').delete().eq('id', Number(button.dataset.removeAnnouncement))
          if (removeError) return toast(describeError(removeError, 'Remove announcement'), 'error')
          await loadAnnouncements()
          mountAnnouncements(document.getElementById('announcements-host'), 'admin', { list: false })
        })
      }
      // One modal for both new and edit; `row` is set when editing an existing announcement.
      function openAnnouncementForm(row = null) {
        editingAnnouncement = row
        document.getElementById('announcement-form').reset()
        document.getElementById('announcement-modal-title').textContent = row ? 'Edit Announcement' : 'New Announcement'
        document.getElementById('announcement-submit').textContent = row ? 'Save' : 'Post'
        document.getElementById('announcement-message').innerHTML = row?.message ? richText(row.message) : ''
        document.getElementById('announcement-date-wrap').classList.add('hidden')
        if (row) {
          document.getElementById('announcement-title').value = row.title
          document.getElementById('announcement-kind').value = row.kind
          document.getElementById('announcement-audience').value = row.audience
          document.getElementById('announcement-pinned').checked = row.pinned
          if (row.expires_at) {
            document.getElementById('announcement-expires').value = 'date'
            document.getElementById('announcement-date').value = new Date(new Date(row.expires_at) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
            document.getElementById('announcement-date-wrap').classList.remove('hidden')
          }
        }
        document.getElementById('announcement-modal').classList.remove('hidden')
      }
      document.getElementById('add-announcement').onclick = () => openAnnouncementForm()
      const editor = document.getElementById('announcement-message')
      document.getElementById('announcement-toolbar').addEventListener('mousedown', event => {
        const button = event.target.closest('[data-cmd]')
        if (!button) return
        event.preventDefault() // keep the text selection in the editor
        editor.focus()
        document.execCommand(button.dataset.cmd, false, button.dataset.arg || null)
      })
      editor.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return
        event.preventDefault()
        document.execCommand(event.shiftKey ? 'outdent' : 'indent')
      })
      editor.addEventListener('paste', event => { // paste as plain text so outside styling doesn't leak in
        event.preventDefault()
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
      })
      const dateInput = document.getElementById('announcement-date')
      const openPicker = () => { try { dateInput.showPicker() } catch {} }
      dateInput.min = ''
      dateInput.onclick = openPicker
      document.getElementById('announcement-expires').onchange = event => {
        const isDate = event.target.value === 'date'
        document.getElementById('announcement-date-wrap').classList.toggle('hidden', !isDate)
        if (isDate) { dateInput.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); dateInput.focus(); openPicker() }
      }
      document.getElementById('close-announcement').onclick = document.getElementById('cancel-announcement').onclick = () => document.getElementById('announcement-modal').classList.add('hidden')
      document.getElementById('announcement-form').addEventListener('submit', async (event) => {
        event.preventDefault()
        const title = document.getElementById('announcement-title').value.trim()
        if (!title) return
        const messageBox = document.getElementById('announcement-message')
        const message = messageBox.textContent.trim() ? messageBox.innerHTML.trim() : ''
        if (message.length > 4000) return toast('Message is too long.', 'error')
        const kind = document.getElementById('announcement-kind').value
        const expires = document.getElementById('announcement-expires').value
        const picked = document.getElementById('announcement-date').value
        if (expires === 'date' && (!picked || new Date(picked) <= new Date())) return toast('Pick a hide date in the future.', 'error')
        const expiresAt = expires === 'date' ? new Date(picked).toISOString() : expires ? new Date(Date.now() + Number(expires) * 3600000).toISOString() : null
        const payload = { title, message: message || null, kind, audience: kind === 'maintenance' ? 'all' : document.getElementById('announcement-audience').value, expires_at: expiresAt, pinned: document.getElementById('announcement-pinned').checked }
        if (editingAnnouncement && !await confirmPassword(user.email, 'Enter your password to save changes to this announcement.')) return
        const { error } = editingAnnouncement
          ? await supabase.from('announcements').update(payload).eq('id', editingAnnouncement.id)
          : await supabase.from('announcements').insert({ ...payload, created_by: user.user_id, author_name: await currentAuthorName() })
        if (error) return toast(describeError(error, editingAnnouncement ? 'Save announcement' : 'Post announcement'), 'error')
        document.getElementById('announcement-modal').classList.add('hidden')
        await loadAnnouncements()
        mountAnnouncements(document.getElementById('announcements-host'), 'admin', { list: false })
      })
      await loadAnnouncements()
      mountAnnouncements(document.getElementById('announcements-host'), 'admin', { list: false })
      hideLoadingScreen()
    
