// Admissions > Review: the one place an admin approves or declines an application.
// The three checks must be ticked first, and declining needs a reason (the guardian is told).
import { supabase } from '../shared/lib/auth-client.js'
import { escapeHtml as escape, formatDate, gradeLabel } from '../shared/lib/html.js'
import { confirmDialog, noticeDialog } from '../shared/ui/dialog.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'
import { isEditLocked, editLockMessage } from './edit-lock.js'
import { describeError, describeFunctionError } from '../shared/lib/errors.js'

const markup = `
<div id="review-modal" class="admin-modal hidden">
  <div class="admin-modal-box review-box" role="dialog" aria-modal="true" aria-labelledby="review-title">
    <div class="admin-modal-head">
      <h3 id="review-title">Review Admission Application</h3>
      <button type="button" id="close-review" aria-label="Close">x</button>
    </div>
    <div id="review-details" class="admin-full review-summary"></div>
    <div class="admin-actions admin-full">
      <button type="button" id="view-enrollee-details" class="admin-secondary">View Documents &amp; Details</button>
    </div>
    <fieldset class="admin-full review-checks">
      <legend>Before you decide</legend>
      <label><input type="checkbox" data-review-check /> I reviewed the applicant's submitted information.</label>
      <label><input type="checkbox" data-review-check /> I checked the applicant's required documents.</label>
      <label><input type="checkbox" data-review-check /> I reviewed the applicant's eligibility for the requested grade level.</label>
    </fieldset>
    <label class="admin-full"
      >Remarks<textarea id="review-remarks" rows="3" maxlength="500" placeholder="Optional when approving. Required when declining: the guardian sees it."></textarea>
    </label>
    <p id="review-lock" class="admin-full review-countdown hidden"><span id="review-lock-text"></span></p>
    <p id="review-countdown" class="admin-full review-countdown">
      Please review the details above - decisions unlock in <span id="review-countdown-seconds">3</span>s...
    </p>
    <div class="admin-actions">
      <button type="button" id="decline-application" class="admin-remove" disabled>Decline</button>
      <button type="button" id="approve-application" class="admin-approve" disabled>Approve</button>
    </div>
  </div>
</div>
<div id="enrollee-details-modal" class="admin-modal hidden">
  <div class="admin-modal-box enrollee-details-box">
    <div class="admin-modal-head">
      <h3>Application Details</h3>
      <button type="button" id="close-enrollee-details" aria-label="Close">x</button>
    </div>
    <div id="enrollee-details-body"></div>
  </div>
</div>`

// Adds the modals to the page. Returns open(application); onChanged runs after a decision or close.
export function mountAdmissionReview(onChanged) {
  document.body.insertAdjacentHTML('beforeend', markup)
  const $ = id => document.getElementById(id)
  let selected = null
  let locked = false
  let timer = null
  let unlocked = false

  const checks = () => [...document.querySelectorAll('[data-review-check]')]
  const sync = () => {
    const ready = unlocked && !locked && checks().every(box => box.checked)
    $('approve-application').disabled = !ready
    $('decline-application').disabled = !ready
  }
  checks().forEach(box => (box.onchange = sync))

  function open(application) {
    selected = application
    locked = isEditLocked(application)
    unlocked = false
    $('review-lock').classList.toggle('hidden', !locked)
    if (locked) $('review-lock-text').textContent = editLockMessage(application)
    $('review-details').innerHTML = `
      <div class="review-grid">
        <div><small>Student</small><p>${escape(application.first_name)} ${escape(application.last_name)}</p></div>
        <div><small>Grade Level</small><p>${escape(gradeLabel(application.grade_level))}</p></div>
        <div><small>Current Status</small><p>${escape(String(application.status).replace('_', ' '))}</p></div>
        <div><small>Submitted</small><p>${formatDate(application.created_at)}</p></div>
      </div>`
    $('review-remarks').value = ''
    checks().forEach(box => (box.checked = false))
    sync()
    $('review-modal').classList.remove('hidden')
    let secondsLeft = 3
    $('review-countdown-seconds').textContent = secondsLeft
    $('review-countdown').classList.remove('hidden')
    clearInterval(timer)
    timer = setInterval(() => {
      secondsLeft -= 1
      $('review-countdown-seconds').textContent = secondsLeft
      if (secondsLeft > 0) return
      clearInterval(timer)
      $('review-countdown').classList.add('hidden')
      unlocked = true
      sync()
    }, 1000)
  }

  function close() {
    clearInterval(timer)
    $('review-modal').classList.add('hidden')
    selected = null
    onChanged?.()
  }
  $('close-review').onclick = close

  $('view-enrollee-details').onclick = event =>
    withBusy(event.currentTarget, 'Loading…', async () => {
      if (!selected) return
      const [applicationResult, documentsResult] = await Promise.all([
        supabase.from('admission_applications').select('*').eq('id', selected.id).single(),
        supabase
          .from('application_documents')
          .select('document_type,original_name,file_path,uploaded_at')
          .eq('application_id', selected.id)
          .order('uploaded_at')
      ])
      if (applicationResult.error) return toast(describeError(applicationResult.error, 'Load enrollee details'), 'error')
      const a = applicationResult.data
      const documentLinks = await Promise.all(
        (documentsResult.data || []).map(async document => {
          const result = await supabase.storage.from('admission-documents').createSignedUrl(document.file_path, 600)
          return `<li>${escape(document.document_type)}: ${result.error ? `<span class="note">${escape(document.original_name)} (link unavailable: ${escape(describeError(result.error, 'Open file'))})</span>` : `<a href="${escape(result.data.signedUrl)}" target="_blank" rel="noopener">${escape(document.original_name)}</a>`}</li>`
        })
      )
      const fullName = escape(`${a.first_name || ''} ${a.middle_name || ''} ${a.last_name || ''}`.replace(/\s+/g, ' ').trim())
      const photo = a.profile_picture_url
        ? `<img src="${escape(a.profile_picture_url)}" alt="Profile picture" class="enrollee-details-photo">`
        : `<div class="enrollee-details-photo enrollee-details-photo-empty" aria-hidden="true">No photo</div>`
      $('enrollee-details-body').innerHTML = `
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
      $('enrollee-details-modal').classList.remove('hidden')
    })
  $('close-enrollee-details').onclick = () => $('enrollee-details-modal').classList.add('hidden')

  async function decide(status, button) {
    const application = selected
    if (!application) return
    const remarks = $('review-remarks').value.trim()
    if (status === 'rejected') {
      if (!remarks) {
        $('review-remarks').focus()
        return toast('Write the reason in Remarks before declining. The guardian sees it.', 'error')
      }
      const ok = await confirmDialog(`Decline the application of ${application.first_name} ${application.last_name}? The guardian is notified.`, {
        title: 'Decline application',
        confirmText: 'Decline',
        danger: true
      })
      if (!ok) return
    }
    await withBusy(button, status === 'approved' ? 'Approving…' : 'Declining…', async () => {
      const { data, error } = await supabase.rpc('review_admission_application', {
        p_application_id: application.id,
        p_status: status,
        p_remarks: remarks || null
      })
      if (error) return toast(describeError(error, 'Review application'), 'error')
      close()
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
      } else toast(status === 'approved' ? 'Application approved.' : 'Application declined.')
    })
  }
  $('approve-application').onclick = event => decide('approved', event.currentTarget)
  $('decline-application').onclick = event => decide('rejected', event.currentTarget)

  return open
}
