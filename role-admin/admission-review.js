// Admissions > Review: the one place an admin approves or declines an application.
// The three checks must be ticked first, and declining needs a reason (the guardian is told).
import { supabase } from '../shared/lib/auth-client.js'
import { escapeHtml as escape, formatDate, gradeLabel } from '../shared/lib/html.js'
import { confirmDialog, noticeDialog } from '../shared/ui/dialog.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'
import { isEditLocked, editLockMessage } from './edit-lock.js'
import { describeError, describeFunctionError } from '../shared/lib/errors.js'
import { previewPdf, pdfName } from '../shared/documents/pdf-preview.js'

// A printable slip with the new student's login, handed to the student or guardian. The first password is
// username + "123" (set by review_admission_application); the slip asks the student to change it.
// The address students sign in at, whatever copy of the app the admin approved from (local dev, a preview).
const STUDENT_SITE = 'https://tcsms.vercel.app'

// sharedEmail: the application's Student Email when another account already signs in with it (v76), so the
// student got the default username@tcs.edu.ph login instead; the slip says so.
export async function showLoginSlip(userId, provision = {}, sharedEmail = '') {
  const { data: account } = await supabase.from('users').select('username,email,student_id').eq('user_id', userId).single()
  const { data: student } = account?.student_id
    ? await supabase.from('students').select('first_name,middle_name,last_name,lrn_number,grade_level').eq('student_id', account.student_id).single()
    : { data: null }
  const username = account?.username || provision.username
  const email = account?.email || provision.email
  const name = [student?.first_name, student?.middle_name, student?.last_name].filter(Boolean).join(' ')
  const row = (label, value, big) =>
    `<tr><th style="text-align:left;padding:8px 12px;border:1px solid #cbd5e1;background:#f1f5f9;width:38%">${label}</th><td style="padding:8px 12px;border:1px solid #cbd5e1;${big ? 'font-size:18px;font-weight:700;font-family:monospace' : ''}">${escape(value || '-')}</td></tr>`
  let host = document.getElementById('login-slip-print')
  if (!host) {
    // Its own direct child of <body> with this class, so "Print" (printing-card) shows only the slip.
    host = Object.assign(document.createElement('div'), { id: 'login-slip-print', className: 'academic-print-card', hidden: true })
    document.body.appendChild(host)
  }
  host.innerHTML = `<div style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:0 auto">
      <p style="text-align:center;margin:0;font-size:12px;letter-spacing:.08em">THOMPSON CHRISTIAN SCHOOL, INC. · DAVAO CITY</p>
      <h2 style="text-align:center;margin:6px 0 4px">Student Login Slip</h2>
      <p style="text-align:center;margin:0 0 18px;font-size:13px">Thompson Christian School Management System (TCSMS)</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row('Student', name)}${row('Student No.', student?.lrn_number)}${row('Grade Level', student?.grade_level == null ? '' : gradeLabel(student.grade_level))}
        ${row('Website', STUDENT_SITE)}${row('Username', username, true)}${row('Login email', email)}${row('First password', `${username}123`, true)}
      </table>
      ${
        sharedEmail
          ? `<p style="margin:14px 0 0;font-size:13px"><b>Note:</b> ${escape(sharedEmail)} is already used by another account, so this student signs in with ${escape(email)} instead.</p>`
          : ''
      }
      <p style="margin:18px 0 6px;font-size:13px"><b>How to sign in:</b> open the website, type the username (or the login email) and the first password, then press Sign In.</p>
      <p style="margin:0 0 6px;font-size:13px"><b>Please change your password as soon as you can</b> after your first sign-in: open the menu with your name (top right) → Change Password.</p>
      <p style="margin:0;font-size:12px;color:#475569">Keep this slip private. Issued ${escape(new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }))}.</p>
    </div>`
  previewPdf(host, { title: 'Student Login Slip', filename: pdfName('Login Slip', student), printClass: 'printing-card' })
}

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
        <div><small>Student Login Email</small><p>${escape(application.student_email || 'username@tcs.edu.ph (default)')}</p></div>
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
          <div><small>Prior Grade</small><p>${escape(a.prior_grade || '-')}</p></div><div><small>Student Email</small><p>${escape(a.student_email || 'username@tcs.edu.ph (default)')}</p></div>
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
        else {
          toast(
            data.email_in_use
              ? `Application approved. ${data.email_in_use} is already used by another account, so the student signs in as "${provision.username}" (${provision.email}).`
              : `Application approved. Student login "${provision.username}" (${provision.email}) is ready to use.`
          )
          await showLoginSlip(data.new_user_id, provision, data.email_in_use)
        }
      } else toast(status === 'approved' ? 'Application approved.' : 'Application declined.')
    })
  }
  $('approve-application').onclick = event => decide('approved', event.currentTarget)
  $('decline-application').onclick = event => decide('rejected', event.currentTarget)

  return open
}
