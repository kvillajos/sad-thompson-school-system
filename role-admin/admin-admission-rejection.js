import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml, errorRow, formatDate, gradeLabel, lastFirst } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { withBusy } from '../shared/ui/shell.js'
import { loadRequirementData, requirementBadge } from '../shared/ui/requirements-checklist.js'
import { mountRequirementTypes } from './requirement-types.js'
import { mountAdminShell } from './admin-page.js'

await mountAdminShell('admissions')
mountRequirementTypes(document.getElementById('requirement-types-host'))

const $ = id => document.getElementById(id)
const form = $('rejection-form')
let applications = []

async function loadApplications() {
  const [{ data, error }] = await Promise.all([
    supabase
      .from('admission_applications')
      .select('id,first_name,last_name,grade_level,admission_type,status,created_at')
      .in('status', ['submitted', 'under_review'])
      .order('created_at'),
    loadRequirementData()
  ])
  if (error) return ($('admission-rejection-table').innerHTML = errorRow(7, error, 'Load applications'))
  applications = data || []
  $('admission-rejection-table').innerHTML =
    applications
      .map(
        app => `<tr>
          <td data-label="Application ID">${app.id}</td>
          <td data-label="Applicant">${escapeHtml(lastFirst(app))}</td>
          <td data-label="Grade Level">${escapeHtml(gradeLabel(app.grade_level))}</td>
          <td data-label="Status">${escapeHtml(app.status.replace('_', ' '))}</td>
          <td data-label="Requirements">${requirementBadge(app)}</td>
          <td data-label="Date Submitted">${escapeHtml(formatDate(app.created_at))}</td>
          <td data-label="Action"><button type="button" class="admin-remove" data-reject="${app.id}">Reject</button></td>
        </tr>`
      )
      .join('') || '<tr><td colspan="7">No applications are waiting for review.</td></tr>'
  $('rejection-application').innerHTML =
    '<option value="">Select an application</option>' +
    applications.map(app => `<option value="${app.id}">#${app.id} ${escapeHtml(lastFirst(app))}</option>`).join('')
  document.querySelectorAll('[data-reject]').forEach(button => {
    button.onclick = () => {
      $('rejection-application').value = button.dataset.reject
      $('rejection-reason').focus()
    }
  })
}

form.onsubmit = event => {
  event.preventDefault()
  return withBusy(form.querySelector('button[type="submit"]'), 'Rejecting…', async () => {
    const id = Number($('rejection-application').value)
    const reason = $('rejection-reason').value.trim()
    const app = applications.find(item => item.id === id)
    if (!app || !reason) return
    const ok = await confirmDialog(`Reject the application of ${lastFirst(app)}? The guardian is notified.`, {
      title: 'Reject application',
      confirmText: 'Reject',
      danger: true
    })
    if (!ok) return
    const { error } = await supabase.rpc('review_admission_application', {
      p_application_id: id,
      p_status: 'rejected',
      p_remarks: reason
    })
    if (error) return toast(describeError(error, 'Reject application'), 'error')
    form.reset()
    $('rejection-message').textContent = `Application #${id} was rejected.`
    toast('Application rejected.')
    await loadApplications()
  })
}

$('refresh-admissions').onclick = event => withBusy(event.currentTarget, 'Refreshing…', loadApplications)
await loadApplications()
hideLoadingScreen()
