import { supabase } from '../shared/lib/auth-client.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml as escape, formatDate, richText, errorRow } from '../shared/lib/html.js'
import { confirmDialog, formDialog, noticeDialog } from '../shared/ui/dialog.js'
import { toast } from '../shared/ui/ui-theme.js'
import { staleFields } from '../shared/lib/edit-request.js'
import { withBusy, confirmPassword } from '../shared/ui/shell.js'
import { isEditLocked, editLockMessage } from './edit-lock.js'
import { describeError, describeFunctionError } from '../shared/lib/errors.js'
import { mountAdminShell } from './admin-page.js'
import { mountAnnouncements, pinIcon } from '../shared/ui/announcements.js'
import { mountAdminOverview } from './admin-overview.js'
const user = await mountAdminShell('dashboard')
mountAdminOverview(document.getElementById('dash-overview'))
// Full name with the middle name, so a middle-name-only change is visible to the approver.
const profileLine = data => `${[data?.first_name, data?.middle_name, data?.last_name].filter(Boolean).join(' ')} / ${data?.email || ''}`

let applications = []
let selectedApplication = null
let countdownTimer = null

let profileRequests = []
let approvalErrors = []
let approvalRequests = []
const requestLabels = {
  admission: 'Admission',
  profile: 'Profile change',
  grade_correction: 'Grade correction',
  withdrawal: 'Withdrawal / transfer',
  promotion: 'Batch promotion',
  account_action: 'Account action',
  override: 'Capacity override',
  student_profile: 'Student profile edit'
}
const approvalsTable = document.getElementById('approvals-table')
const approvalFilter = document.getElementById('approval-filter')

function renderApprovals() {
  const query = approvalFilter.value.trim().toLowerCase()

  const rows = [
    ...applications.map(application => ({
      type: 'admission',
      at: application.created_at,
      html: `
      <td data-label="Type">Admission</td>
      <td data-label="Details">${escape(application.first_name)} ${escape(application.last_name)} - Grade ${escape(application.grade_level)}</td>
      <td data-label="Requested By">Registrar</td>
      <td data-label="Requested">${formatDate(application.created_at, true)}${isEditLocked(application) ? ' <b title="The registrar has this file open for correction.">✏️ editing</b>' : ''}</td>
      <td data-label="Action"><button class="admin-view" data-review="${application.id}">Review</button></td>
    `
    })),
    ...profileRequests.map(request => ({
      type: 'profile',
      at: request.created_at,
      html: `
      <td data-label="Type">Profile change</td>
      <td data-label="Details">${escape(profileLine(request.before_data))} → ${escape(profileLine(request.after_data))}</td>
      <td data-label="Requested By">${escape(request.requester)}</td>
      <td data-label="Requested">${formatDate(request.created_at, true)}</td>
      <td data-label="Action">
        <button class="admin-approve" data-profile-action="approve" data-request="${request.request_id}" data-user="${request.user_id}">Approve</button>
        <button class="admin-remove" data-profile-action="reject" data-request="${request.request_id}" data-user="${request.user_id}">Reject</button>
      </td>
    `
    })),
    ...approvalRequests.map(request => ({
      type: request.request_type,
      at: request.created_at,
      html: `
      <td data-label="Type">${requestLabels[request.request_type]}</td>
      <td data-label="Details">${escape(request.summary)}<br><small>Reason: ${escape(request.reason)}</small></td>
      <td data-label="Requested By">${escape(request.requester_name || '-')}</td>
      <td data-label="Requested">${formatDate(request.created_at, true)}</td>
      <td data-label="Action">
        <button class="admin-approve" data-request-action="approve" data-approval="${request.id}">Approve</button>
        <button class="admin-remove" data-request-action="reject" data-approval="${request.id}">Reject</button>
      </td>
    `
    }))
  ]
    .filter(row => requestLabels[row.type].toLowerCase().includes(query))
    .sort((x, y) => new Date(y.at) - new Date(x.at))

  approvalsTable.innerHTML =
    approvalErrors.map(message => `<tr class="table-state-error"><td colspan="5" role="alert">${escape(message)}</td></tr>`).join('') +
    (rows.map(row => `<tr>${row.html}</tr>`).join('') ||
      `<tr><td colspan="5">${query ? 'No pending approvals of that type.' : 'No pending approvals. You are all caught up.'}</td></tr>`)
  approvalsTable.querySelectorAll('[data-review]').forEach(button => (button.onclick = () => openReview(button.dataset.review)))
  approvalsTable
    .querySelectorAll('[data-request-action]')
    .forEach(button => (button.onclick = () => reviewRequest(button.dataset.approval, button.dataset.requestAction === 'approve', button)))
  approvalsTable
    .querySelectorAll('[data-profile-action]')
    .forEach(
      button =>
        (button.onclick = () => reviewProfileChange(button.dataset.request, button.dataset.user, button.dataset.profileAction, button))
    )
}
// Searchable type filter: typing narrows the rows and the list; the list shows a pending count per type.
const typeList = document.getElementById('approval-types')
let activeOption = -1
const typeCounts = () => {
  const counts = {}
  ;[
    ...applications.map(() => 'admission'),
    ...profileRequests.map(() => 'profile'),
    ...approvalRequests.map(item => item.request_type)
  ].forEach(type => {
    counts[type] = (counts[type] || 0) + 1
  })
  return counts
}
function showTypeList(all) {
  const query = all ? '' : approvalFilter.value.trim().toLowerCase()
  const counts = typeCounts()
  const options = Object.entries(requestLabels).filter(([, label]) => label.toLowerCase().includes(query))
  typeList.innerHTML =
    (!query ? '<li data-type="">All types</li>' : '') +
    (options
      .map(
        ([type, label]) =>
          `<li data-type="${type}" role="option" aria-selected="${label === approvalFilter.value}">${escape(label)}<small>${counts[type] || 0}</small></li>`
      )
      .join('') || '<li class="combo-empty">No matching type</li>')
  typeList.classList.remove('hidden')
  approvalFilter.setAttribute('aria-expanded', 'true')
  activeOption = -1
}
const hideTypeList = () => {
  typeList.classList.add('hidden')
  approvalFilter.setAttribute('aria-expanded', 'false')
}
const pickType = item => {
  approvalFilter.value = item.dataset.type ? requestLabels[item.dataset.type] : ''
  hideTypeList()
  renderApprovals()
}
approvalFilter.oninput = () => {
  showTypeList(false)
  renderApprovals()
}
approvalFilter.onfocus = approvalFilter.onclick = () =>
  showTypeList(!approvalFilter.value || Object.values(requestLabels).includes(approvalFilter.value))
document.getElementById('approval-toggle').onclick = () =>
  typeList.classList.contains('hidden') ? (approvalFilter.focus(), showTypeList(true)) : hideTypeList()
typeList.onmousedown = event => {
  const item = event.target.closest('li[data-type]')
  if (item) {
    event.preventDefault()
    pickType(item)
  }
}
approvalFilter.onkeydown = event => {
  const items = [...typeList.querySelectorAll('li[data-type]')]
  if (event.key === 'Escape') return hideTypeList()
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (typeList.classList.contains('hidden')) showTypeList(true)
    event.preventDefault()
    activeOption = (activeOption + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items.forEach((item, index) => item.classList.toggle('active', index === activeOption))
    items[activeOption]?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter' && items[activeOption]) {
    event.preventDefault()
    pickType(items[activeOption])
  }
}
document.addEventListener('click', event => {
  if (!event.target.closest('.combo')) hideTypeList()
})

async function loadApplications() {
  const { data, error } = await supabase
    .from('admission_applications')
    .select('id,first_name,last_name,grade_level,status,created_at,editing_by,editing_since')
    .in('status', ['submitted', 'under_review'])
    .order('created_at', { ascending: false })
  applications = error ? [] : data || []
  approvalErrors = approvalErrors.filter(message => !message.startsWith('Load admissions '))
  if (error) approvalErrors.push(describeError(error, 'Load admissions'))
  renderApprovals()
}

async function loadProfileRequests() {
  const requestResult = await supabase
    .from('profile_change_requests')
    .select('request_id,user_id,before_data,after_data,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  const requests = requestResult.data || []
  const userIds = [...new Set(requests.map(request => request.user_id))]
  const userResult = userIds.length
    ? await supabase.from('users').select('user_id,username,email').in('user_id', userIds)
    : { data: [], error: null }
  const users = new Map((userResult.data || []).map(account => [account.user_id, account]))
  const error = requestResult.error || userResult.error
  profileRequests = error
    ? []
    : requests.map(request => ({
        ...request,
        requester: users.get(request.user_id)?.username || users.get(request.user_id)?.email || String(request.user_id)
      }))
  approvalErrors = approvalErrors.filter(message => !message.startsWith('Load profile changes '))
  if (error) approvalErrors.push(describeError(error, 'Load profile changes'))
  renderApprovals()
}

async function loadApprovalRequests() {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('id,request_type,payload,summary,reason,requester_name,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  approvalRequests = error ? [] : data || []
  approvalErrors = approvalErrors.filter(message => !message.startsWith('Load requests '))
  if (error) approvalErrors.push(describeError(error, 'Load requests'))
  renderApprovals()
}

// Registrar feedback: open items in the table, fixed ones in the "Fixed" window. Long text is cut at 40
// characters; pressing a row opens the full item. "Mark as fixed" needs a reason and can attach proof files.
const FEEDBACK_PREVIEW = 40
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
let feedbackItems = []
const feedbackTable = document.getElementById('registrar-feedback-table')
const short = text => (text.length > FEEDBACK_PREVIEW ? text.slice(0, FEEDBACK_PREVIEW).trimEnd() + '...' : text)
const priorityBadge = priority => `<span class="badge priority-${escape(String(priority).toLowerCase())}">${escape(priority)}</span>`
const withBreaks = text => escape(text).replaceAll('\n', '<br>')
const feedbackFields = item =>
  [
    ['Area', escape(item.area)],
    ['Priority', priorityBadge(item.priority)],
    ['Issue/Concern', withBreaks(item.pain_point)],
    ['Suggested fix', withBreaks(item.suggested_fix || '-')],
    [
      'Submitted',
      `${escape(item.submitted_by || '-')} (${item.submitted_role === 'faculty' ? 'Faculty' : 'Registrar'}) &middot; ${formatDate(item.created_at, true)}`
    ]
  ]
    .map(([label, value]) => `<p><strong>${label}:</strong> ${value}</p>`)
    .join('')

function feedbackModal(title, bodyHtml, actionsHtml) {
  const modal = document.createElement('div')
  modal.className = 'admin-modal stack-above drawer'
  modal.innerHTML = `<div class="admin-modal-box" role="dialog" aria-modal="true" style="width:min(100%,520px)"><div class="admin-modal-head"><h3>${title}</h3><button type="button" data-close aria-label="Close">x</button></div><div style="max-height:60vh;overflow:auto">${bodyHtml}</div><div class="admin-actions">${actionsHtml}</div></div>`
  document.body.appendChild(modal)
  modal.onclick = event => {
    if (event.target === modal || event.target.closest('[data-close]')) modal.remove()
  }
  return modal
}

async function openFeedback(id) {
  const item = feedbackItems.find(row => row.id === id)
  if (!item) return
  const fixed = item.status === 'fixed'
  let proofHtml = ''
  if (fixed && item.proof_files?.length) {
    const links = await Promise.all(
      item.proof_files.map(async file => {
        const { data } = await supabase.storage.from('feedback-proofs').createSignedUrl(file.path, 600)
        return data?.signedUrl
          ? `<a href="${escape(data.signedUrl)}" target="_blank" rel="noopener">${escape(file.name)}</a>`
          : escape(file.name)
      })
    )
    proofHtml = `<p><strong>Proof:</strong> ${links.join(', ')}</p>`
  }
  const fixedHtml = fixed
    ? `<hr><p><span class="badge priority-low">Fixed</span> ${escape(item.fixed_by || '-')} &middot; ${formatDate(item.fixed_at, true)}</p><p><strong>Reason:</strong> ${withBreaks(item.fixed_reason || '-')}</p>${proofHtml}`
    : ''
  const modal = feedbackModal(
    'Feedback',
    feedbackFields(item) + fixedHtml,
    `<button type="button" class="admin-secondary" data-close>Close</button>${fixed ? '' : '<button type="button" class="admin-primary" data-fix>Mark as fixed</button>'}`
  )
  modal.querySelector('[data-fix]')?.addEventListener('click', () => {
    modal.remove()
    markFeedbackFixed(id)
  })
}

async function markFeedbackFixed(id) {
  const values = await formDialog({
    title: 'Mark as fixed',
    message: 'Say what was done. Proof files are optional: up to 3 files (PDF, JPG or PNG, 5 MB each).',
    confirmText: 'Mark as fixed',
    fields: [
      { name: 'reason', label: 'What was fixed?', multiline: true, required: true, maxlength: 1000 },
      { name: 'proof', label: 'Proof (optional)', type: 'file', multiple: true, accept: '.pdf,.jpg,.jpeg,.png' }
    ]
  })
  if (!values) return
  const files = values.proof
  if (files.length > 3) return toast('Attach at most 3 proof files.', 'error')
  if (files.some(file => !PROOF_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024))
    return toast('Proof files must be PDF, JPG or PNG up to 5 MB each.', 'error')
  const proof = []
  for (const file of files) {
    const path = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('feedback-proofs').upload(path, file, { upsert: false })
    if (error) return toast(describeError(error, 'Upload proof'), 'error')
    proof.push({ path, name: file.name })
  }
  const { error } = await supabase
    .from('registrar_feedback')
    .update({
      status: 'fixed',
      fixed_reason: values.reason,
      fixed_by: user.username,
      fixed_at: new Date().toISOString(),
      proof_files: proof
    })
    .eq('id', id)
    .eq('status', 'open')
  if (error) return toast(describeError(error, 'Mark as fixed'), 'error')
  toast('Marked as fixed.')
  await loadRegistrarFeedback()
}

function openFixedList() {
  const rows = feedbackItems
    .filter(item => item.status === 'fixed')
    .map(
      item =>
        `<button type="button" class="mail-row" data-feedback="${item.id}"><span class="mail-top">${priorityBadge(item.priority)} ${escape(short(item.pain_point))} <small>&middot; fixed ${formatDate(item.fixed_at)}</small></span></button>`
    )
    .join('')
  const modal = feedbackModal(
    'Fixed feedback',
    rows || '<p style="color:#64748b">Nothing has been marked as fixed yet.</p>',
    '<button type="button" class="admin-secondary" data-close>Close</button>'
  )
  modal.querySelectorAll('[data-feedback]').forEach(button => (button.onclick = () => openFeedback(Number(button.dataset.feedback))))
}

async function loadRegistrarFeedback() {
  const { data, error } = await supabase
    .from('registrar_feedback')
    .select(
      'id,area,priority,pain_point,suggested_fix,submitted_by,submitted_role,created_at,status,fixed_reason,fixed_by,fixed_at,proof_files'
    )
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    feedbackTable.innerHTML = errorRow(7, error, 'Load registrar feedback')
    return
  }
  feedbackItems = data || []
  const open = feedbackItems.filter(item => item.status !== 'fixed')
  document.getElementById('view-fixed-feedback').textContent = `Fixed (${feedbackItems.length - open.length})`
  feedbackTable.innerHTML =
    open
      .map(
        item =>
          `<tr class="feedback-row" data-feedback="${item.id}"><td>${escape(item.area)}</td><td>${priorityBadge(item.priority)}</td><td title="Press to read the full text">${escape(short(item.pain_point))}</td><td>${escape(short(item.suggested_fix || '-'))}</td><td>${escape(item.submitted_by || '-')}<br><small>${item.submitted_role === 'faculty' ? 'Faculty' : 'Registrar'}</small></td><td>${formatDate(item.created_at, true)}</td><td><button type="button" data-fix-feedback="${item.id}">Mark as fixed</button></td></tr>`
      )
      .join('') || '<tr><td colspan="7">No open feedback.</td></tr>'
  feedbackTable.querySelectorAll('[data-fix-feedback]').forEach(button => {
    button.onclick = () => markFeedbackFixed(Number(button.dataset.fixFeedback))
  })
}
feedbackTable.addEventListener('click', event => {
  const row = event.target.closest('[data-feedback]')
  if (row && !event.target.closest('.table-action-menu')) openFeedback(Number(row.dataset.feedback))
})
document.getElementById('view-fixed-feedback').onclick = openFixedList

async function reviewRequest(id, approve, button) {
  const request = approvalRequests.find(item => String(item.id) === String(id))
  if (!request) return
  let remarks = null
  if (!approve) {
    const answer = await formDialog({
      title: `Reject ${requestLabels[request.request_type].toLowerCase()}`,
      message: request.summary,
      fields: [{ name: 'remarks', label: 'Reason (optional, the requester sees this)', multiline: true, maxlength: 500 }],
      confirmText: 'Reject',
      danger: true
    })
    if (!answer) return
    remarks = answer.remarks || null
  } else {
    // A profile edit is based on the values the student saw; warn if the record was changed by someone else since.
    let warning = ''
    if (request.request_type === 'student_profile' && request.payload?.before) {
      const { data: record } = await supabase.from('students').select('*').eq('student_id', request.payload.student_id).maybeSingle()
      const stale = staleFields(request.payload.before, record)
      if (stale.length) warning = `${stale.join(', ')} changed after this request was made. Approving overwrites the newer value.`
    }
    if (
      !(await confirmDialog(request.summary, {
        title: `Approve ${requestLabels[request.request_type].toLowerCase()}?`,
        confirmText: 'Approve',
        warning
      }))
    )
      return
  }
  await withBusy(button, approve ? 'Approving…' : 'Rejecting…', async () => {
    const action = request.payload
    // Password reset and (de)activation change the Supabase login, so the Edge Function runs before the approval is recorded.
    if (approve && request.request_type === 'account_action' && action.action !== 'role_change') {
      const { data, error } = await supabase.functions.invoke('provision-account', {
        body: { user_id: Number(action.target_user_id), action: action.action }
      })
      if (error) return toast(await describeFunctionError(error, 'Account action'), 'error')
      if (data?.temporary_password)
        await noticeDialog(`Temporary password for ${data.username}. It is shown only once; give it to the account owner securely.`, {
          title: 'Temporary password',
          copyText: data.temporary_password
        })
    }
    const { data: outcome, error } = await supabase.rpc('review_approval', { p_id: Number(id), p_approve: approve, p_remarks: remarks })
    if (error) return toast(describeError(error, 'Review request'), 'error')
    // A promotion can approve fine yet move nobody (no grades, already promoted), so say what happened.
    if (approve && request.request_type === 'promotion' && outcome?.processed != null) {
      const parts = [
        `${outcome.promoted} promoted`,
        outcome.graduated && `${outcome.graduated} graduated`,
        outcome.retained && `${outcome.retained} retained`,
        outcome.incomplete && `${outcome.incomplete} without grades`,
        outcome.skipped && `${outcome.skipped} already promoted`
      ].filter(Boolean)
      toast(`Promotion approved: ${parts.join(', ')}.`)
    } else toast(approve ? 'Request approved.' : 'Request rejected.')
    await loadApprovalRequests()
  })
}

async function reviewProfileChange(requestId, userId, action, button) {
  const originalLabel = button.textContent
  button.disabled = true
  button.textContent = action === 'approve' ? 'Approving...' : 'Rejecting...'
  try {
    const { error } = await supabase.functions.invoke('provision-account', {
      body: { user_id: Number(userId), action: `${action}-profile-change`, request_id: Number(requestId) }
    })
    if (error) return toast(await describeFunctionError(error, 'Profile change'), 'error')
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
      supabase
        .from('application_documents')
        .select('document_type,original_name,file_path,uploaded_at')
        .eq('application_id', selectedApplication.id)
        .order('uploaded_at')
    ])
    if (applicationResult.error) return toast(describeError(applicationResult.error, 'Load enrollee details'), 'error')
    const a = applicationResult.data
    const documents = documentsResult.data || []
    const documentLinks = await Promise.all(
      documents.map(async document => {
        const result = await supabase.storage.from('admission-documents').createSignedUrl(document.file_path, 600)
        return `<li>${escape(document.document_type)}: ${result.error ? `<span class="note">${escape(document.original_name)} (link unavailable: ${escape(describeError(result.error, 'Open file'))})</span>` : `<a href="${escape(result.data.signedUrl)}" target="_blank" rel="noopener">${escape(document.original_name)}</a>`}</li>`
      })
    )
    const fullName = escape(`${a.first_name || ''} ${a.middle_name || ''} ${a.last_name || ''}`.replace(/\s+/g, ' ').trim())
    const photo = a.profile_picture_url
      ? `<img src="${escape(a.profile_picture_url)}" alt="Profile picture" class="enrollee-details-photo">`
      : `<div class="enrollee-details-photo enrollee-details-photo-empty" aria-hidden="true">No photo</div>`
    document.getElementById('enrollee-details-body').innerHTML = `
            <div class="enrollee-details-head">${photo}<h3>${fullName || 'Applicant'}</h3></div>
            <div class="review-grid enrollee-details-grid">
              <div><small>Grade Level</small><p>${escape(a.grade_level || '-')}</p></div><div><small>Sex</small><p>${escape(a.sex || '-')}</p></div>
              <div><small>Birth Date</small><p>${escape(a.birth_date || '-')}</p></div><div><small>Address</small><p>${escape(a.address || '-')}</p></div>
              <div><small>Contact Number</small><p>${escape(a.contact_number || '-')}</p></div><div><small>Prior School</small><p>${escape(a.prior_school || '-')}</p></div>
              <div><small>Prior Grade</small><p>${escape(a.prior_grade || '-')}</p></div>
              <div><small>Special Program</small><p>${escape(a.special_program || '-')}</p></div><div><small>Status</small><p>${escape(a.status || '-')}</p></div>
              <div><small>Guardian</small><p>${escape(a.guardian_name || '-')} (${escape(a.guardian_relationship || '-')})</p></div><div><small>Guardian Contact</small><p>${escape(a.guardian_phone || '-')} / ${escape(a.guardian_email || '-')}</p></div>
            </div>
            <h4>Uploaded Documents</h4><ul class="document-list">${documentLinks.join('') || '<li>No documents uploaded.</li>'}</ul>`
    document.getElementById('enrollee-details-modal').classList.remove('hidden')
  })
}
document.getElementById('view-enrollee-details').onclick = showEnrolleeDetails
document.getElementById('close-enrollee-details').onclick = () => document.getElementById('enrollee-details-modal').classList.add('hidden')

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
    const { data, error } = await supabase.rpc('review_admission_application', {
      p_application_id: selectedApplication.id,
      p_status: status,
      p_remarks: remarks || null
    })
    if (error) return toast(describeError(error, 'Review application'), 'error')
    closeReview()
    if (status === 'approved' && data?.new_user_id) {
      const { data: provision, error: provisionError } = await supabase.functions.invoke('provision-account', {
        body: { user_id: data.new_user_id }
      })
      if (provisionError)
        await noticeDialog(
          `The application was approved, but the student's login could not be created automatically (${await describeFunctionError(provisionError, 'Create login')}).\nOpen Manage Accounts and use "Provision Login" on the new student account to finish.`,
          { title: 'Approved, login still needed' }
        )
      else toast(`Application approved. Student login "${provision.username}" is ready to use.`)
    } else {
      toast(status === 'approved' ? 'Application approved.' : 'Application declined.')
    }
    await loadApplications()
  })
}
document.getElementById('approve-application').onclick = event => reviewApplication('approved', event.currentTarget)
document.getElementById('decline-application').onclick = event => reviewApplication('rejected', event.currentTarget)

await loadApplications()
await loadProfileRequests()
await loadApprovalRequests()
await loadRegistrarFeedback()
setInterval(loadApplications, 30000)
setInterval(loadProfileRequests, 30000)
setInterval(loadApprovalRequests, 30000)
setInterval(loadRegistrarFeedback, 30000)

// "First Last" using only the first word of the first name; stored on the row because recipients can't read other users.
async function currentAuthorName() {
  const { data } = await supabase.from('admins').select('first_name,last_name').eq('user_id', user.user_id).maybeSingle()
  return data ? `${String(data.first_name).trim().split(/\s+/)[0]} ${String(data.last_name).trim()}` : user.username
}
// Rich message -> one line of plain text for the table cell.
const plainText = html => {
  const box = document.createElement('div')
  box.innerHTML = richText(html || '').replace(/<\/(p|div|li|h3|blockquote)>|<br>/gi, ' ')
  return (box.textContent || '').replace(/\s+/g, ' ').trim()
}
let announcementRows = []
let editingAnnouncement = null
async function loadAnnouncements() {
  const table = document.getElementById('announcements-table')
  const { data, error } = await supabase
    .from('announcements')
    .select('id,title,message,kind,audience,pinned,posted_at,expires_at,author_name')
    .order('pinned', { ascending: false })
    .order('posted_at', { ascending: false })
    .limit(30)
  if (error) return (table.innerHTML = errorRow(7, error, 'Load announcements'))
  announcementRows = data || []
  const audienceLabels = { all: 'Everyone', admin: 'Admins', registrar: 'Registrars', faculty: 'Faculty', student: 'Students' }
  table.innerHTML =
    (data || [])
      .map(a => {
        const message = plainText(a.message) || '-'
        const kindHtml =
          a.kind === 'maintenance'
            ? '<span class="badge urgent-badge">Urgent</span>'
            : '<span class="badge notice-badge ann-notice-label">Notice</span>'
        const expiryHtml = a.expires_at
          ? new Date(a.expires_at) < new Date()
            ? ' <small>(expired)</small>'
            : `<br><small>hides ${formatDate(a.expires_at, true)}</small>`
          : ''
        return `<tr><td class="ann-title-cell"><span class="ann-mobile-kind" style="display:none">${kindHtml}</span><span class="ann-title-text">${a.pinned ? pinIcon : ''}${escape(a.title)}</span><span class="ann-mobile-message" style="display:none">${escape(message)}</span></td><td class="ann-msg" title="${escape(message)}">${escape(message)}</td><td class="ann-type-cell">${kindHtml}${expiryHtml}</td><td>${audienceLabels[a.audience] || escape(a.audience)}</td><td>${escape(a.author_name || '-')}</td><td>${formatDate(a.posted_at)}</td><td class="ann-actions"><button class="admin-view" data-edit-announcement="${a.id}">Edit</button><button class="admin-view" data-pin-announcement="${a.id}" data-pinned="${a.pinned}">${a.pinned ? 'Unpin' : 'Pin'}</button><button class="admin-remove" data-remove-announcement="${a.id}">Remove</button></td></tr>`
      })
      .join('') || `<tr><td colspan="7">No announcements posted.</td></tr>`
  table
    .querySelectorAll('[data-edit-announcement]')
    .forEach(
      button =>
        (button.onclick = () => openAnnouncementForm(announcementRows.find(row => row.id === Number(button.dataset.editAnnouncement))))
    )
  table.querySelectorAll('[data-pin-announcement]').forEach(
    button =>
      (button.onclick = async () => {
        const { error: pinError } = await supabase
          .from('announcements')
          .update({ pinned: button.dataset.pinned !== 'true' })
          .eq('id', Number(button.dataset.pinAnnouncement))
        if (pinError) return toast(describeError(pinError, 'Pin announcement'), 'error')
        await loadAnnouncements()
        mountAnnouncements(document.getElementById('announcements-host'), 'admin', { list: false })
      })
  )
  table.querySelectorAll('[data-remove-announcement]').forEach(
    button =>
      (button.onclick = async () => {
        const row = announcementRows.find(item => item.id === Number(button.dataset.removeAnnouncement))
        if (
          !(await confirmDialog(`Remove "${row?.title || 'this announcement'}"? It disappears for everyone.`, {
            title: 'Remove announcement',
            confirmText: 'Remove',
            danger: true
          }))
        )
          return
        const { error: removeError } = await supabase.from('announcements').delete().eq('id', Number(button.dataset.removeAnnouncement))
        if (removeError) return toast(describeError(removeError, 'Remove announcement'), 'error')
        await loadAnnouncements()
        mountAnnouncements(document.getElementById('announcements-host'), 'admin', { list: false })
      })
  )
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
      document.getElementById('announcement-date').value = new Date(new Date(row.expires_at) - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      document.getElementById('announcement-date-wrap').classList.remove('hidden')
    }
  }
  syncAudience()
  document.getElementById('announcement-modal').classList.remove('hidden')
}
// Urgent notices show on the public login screen, so they always go to everyone; say so instead of ignoring the choice.
function syncAudience() {
  const urgent = document.getElementById('announcement-kind').value === 'maintenance'
  const audience = document.getElementById('announcement-audience')
  if (urgent) audience.value = 'all'
  audience.disabled = urgent
}
document.getElementById('announcement-kind').onchange = syncAudience
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
editor.addEventListener('paste', event => {
  // paste as plain text so outside styling doesn't leak in
  event.preventDefault()
  document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
})
const dateInput = document.getElementById('announcement-date')
const openPicker = () => {
  try {
    dateInput.showPicker()
  } catch {}
}
dateInput.min = ''
dateInput.onclick = openPicker
document.getElementById('announcement-expires').onchange = event => {
  const isDate = event.target.value === 'date'
  document.getElementById('announcement-date-wrap').classList.toggle('hidden', !isDate)
  if (isDate) {
    dateInput.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    dateInput.focus()
    openPicker()
  }
}
document.getElementById('close-announcement').onclick = document.getElementById('cancel-announcement').onclick = () =>
  document.getElementById('announcement-modal').classList.add('hidden')
document.getElementById('announcement-form').addEventListener('submit', async event => {
  event.preventDefault()
  const titleInput = document.getElementById('announcement-title')
  const title = titleInput.value.trim()
  if (!title) {
    titleInput.value = ''
    titleInput.setAttribute('required', '')
    return titleInput.reportValidity()
  }
  const messageBox = document.getElementById('announcement-message')
  const message = messageBox.textContent.trim() ? messageBox.innerHTML.trim() : ''
  if (message.length > 4000) return toast('Message is too long.', 'error')
  const kind = document.getElementById('announcement-kind').value
  const expires = document.getElementById('announcement-expires').value
  const picked = document.getElementById('announcement-date').value
  if (expires === 'date' && (!picked || new Date(picked) <= new Date())) return toast('Pick a hide date in the future.', 'error')
  const expiresAt =
    expires === 'date' ? new Date(picked).toISOString() : expires ? new Date(Date.now() + Number(expires) * 3600000).toISOString() : null
  const payload = {
    title,
    message: message || null,
    kind,
    audience: kind === 'maintenance' ? 'all' : document.getElementById('announcement-audience').value,
    expires_at: expiresAt,
    pinned: document.getElementById('announcement-pinned').checked
  }
  if (editingAnnouncement && !(await confirmPassword(user.email, 'Enter your password to save changes to this announcement.'))) return
  const { error } = await withBusy(
    document.getElementById('announcement-submit'),
    editingAnnouncement ? 'Saving…' : 'Posting…',
    async () =>
      editingAnnouncement
        ? supabase.from('announcements').update(payload).eq('id', editingAnnouncement.id)
        : supabase.from('announcements').insert({ ...payload, created_by: user.user_id, author_name: await currentAuthorName() })
  )
  if (error) return toast(describeError(error, editingAnnouncement ? 'Save announcement' : 'Post announcement'), 'error')
  toast(editingAnnouncement ? 'Announcement saved.' : 'Announcement posted.')
  document.getElementById('announcement-modal').classList.add('hidden')
  await loadAnnouncements()
  mountAnnouncements(document.getElementById('announcements-host'), 'admin', { list: false })
})
await loadAnnouncements()
mountAnnouncements(document.getElementById('announcements-host'), 'admin', { list: false })
hideLoadingScreen()
