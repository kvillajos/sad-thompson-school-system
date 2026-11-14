import { supabase } from '../shared/lib/auth-client.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml, errorRow, formatDate, gradeLabel, lastFirst } from '../shared/lib/html.js'
import { withBusy } from '../shared/ui/shell.js'
import { loadRequirementData, requirementBadge } from '../shared/ui/requirements-checklist.js'
import { mountRequirementTypes } from './requirement-types.js'
import { isEditLocked } from './edit-lock.js'
import { mountAdmissionReview } from './admission-review.js'
import { mountAdminShell } from './admin-page.js'

// Admissions: every waiting application, reviewed (approved or declined) here. The Dashboard only links here.
await mountAdminShell('admissions')
mountRequirementTypes(document.getElementById('requirement-types-host'))

const $ = id => document.getElementById(id)
let applications = []
const openReview = mountAdmissionReview(() => loadApplications())

async function loadApplications() {
  const [{ data, error }] = await Promise.all([
    supabase
      .from('admission_applications')
      .select('id,first_name,last_name,grade_level,admission_type,status,created_at,editing_by,editing_since')
      .in('status', ['submitted', 'under_review'])
      .order('created_at'),
    loadRequirementData()
  ])
  if (error) return ($('admission-rejection-table').innerHTML = errorRow(7, error, 'Load applications'))
  applications = data || []
  $('admissions-count').textContent = applications.length ? `${applications.length} waiting` : ''
  renderApplications()
}

function renderApplications() {
  const search = $('admission-search').value.trim().toLowerCase()
  const shown = applications.filter(
    app => !search || `${app.id} ${app.first_name} ${app.last_name} ${app.last_name} ${app.first_name}`.toLowerCase().includes(search)
  )
  $('admission-rejection-table').innerHTML =
    shown
      .map(
        app => `<tr>
          <td data-label="Application ID">${app.id}</td>
          <td data-label="Applicant">${escapeHtml(lastFirst(app))}</td>
          <td data-label="Grade Level">${escapeHtml(gradeLabel(app.grade_level))}</td>
          <td data-label="Status">${escapeHtml(app.status.replace('_', ' '))}${isEditLocked(app) ? ' <b title="The registrar has this file open for correction.">✏️ editing</b>' : ''}</td>
          <td data-label="Requirements">${requirementBadge(app)}</td>
          <td data-label="Date Submitted">${escapeHtml(formatDate(app.created_at))}</td>
          <td data-label="Action"><button type="button" class="admin-view" data-review="${app.id}">Review</button></td>
        </tr>`
      )
      .join('') ||
    `<tr><td colspan="7">${search ? 'No applications match your search.' : 'No applications are waiting for review.'}</td></tr>`
  document.querySelectorAll('[data-review]').forEach(button => {
    button.onclick = () => openReview(applications.find(app => String(app.id) === button.dataset.review))
  })
}

$('admission-search').oninput = renderApplications
$('refresh-admissions').onclick = event => withBusy(event.currentTarget, 'Refreshing…', loadApplications)
await loadApplications()
// Open straight to one application when the Dashboard links here with ?review=<id>.
const linked = applications.find(app => String(app.id) === new URLSearchParams(location.search).get('review'))
if (linked) openReview(linked)
setInterval(loadApplications, 30000)
hideLoadingScreen()
