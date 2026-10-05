import { requireRole, signOut } from '../shared/lib/auth-client.js'
import { applyUiTheme, toast } from '../shared/ui/ui-theme.js'
import { mountProfile, mountSidebar, withBusy } from '../shared/ui/shell.js'
import { mountRestoreChanges } from '../shared/ui/restore-changes.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { describeError } from '../shared/lib/errors.js'
import { $, state } from './registrar-state.js'
import { loadApplications } from './registrar-admissions.js'
import { loadSections, loadEnrollments } from './registrar-sectioning.js'
import { loadAcademic } from './registrar-academic.js'
import { mountAnnouncements } from '../shared/ui/announcements.js'
import { loadMyRequests } from './registrar-requests.js'
import { loadStudents, refreshShiftSections, renderPromotionExclusions } from './registrar-shifting.js'

applyUiTheme()

const user = await requireRole(2)
if (!user) throw new Error('Unauthorized')
state.user = user

mountProfile(user, 'Registrar', signOut)

mountSidebar([
  { label: 'Manage Enrollment', tab: 'enrollment', active: true, icon: '▣' },
  { label: 'New Admission', tab: 'admission', icon: '▣' },
  { label: 'Applications', tab: 'applications', icon: '♙' },
  { label: 'Section Students', tab: 'sectioning', icon: '▤' },
  { label: 'Academic History', tab: 'academic', icon: '♧' },
  { label: 'Promotion & Transfers', tab: 'promotion', icon: '↗' },
  { label: 'Requests & Feedback', tab: 'requests', icon: '✉' },
  { label: 'Restore Changes', tab: 'restore', icon: '↺' }
], 'Registry and<br>Student Records', 'registrar')

const tabs = [...document.querySelectorAll('[data-tab]')]
const panels = [...document.querySelectorAll('[data-panel]')]
// The open tab lives in the URL hash so refresh and the browser Back button keep your place.
function showTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name))
  panels.forEach(p => p.classList.add('hidden'))
  $(name).classList.remove('hidden')
  if (name === 'sectioning') loadSections()
  if (name === 'requests') loadMyRequests()
  if (name === 'restore') mountRestoreChanges($('restore-changes-host'))
}
$('refresh-restore').onclick = event => withBusy(event.currentTarget, 'Refreshing…', () => mountRestoreChanges($('restore-changes-host')))
const tabFromHash = () => { const name = location.hash.slice(1); return tabs.some(t => t.dataset.tab === name) && $(name) ? name : null }
tabs.forEach((tab) => tab.addEventListener('click', () => {
  if (location.hash.slice(1) !== tab.dataset.tab) history.pushState(null, '', `#${tab.dataset.tab}`)
  showTab(tab.dataset.tab)
}))
window.addEventListener('popstate', () => showTab(tabFromHash() || tabs[0].dataset.tab))
if (tabFromHash()) showTab(tabFromHash())

mountAnnouncements($('announcements-host'), 'registrar')

async function init(){
  const results = await Promise.allSettled([loadApplications(), loadSections(), loadStudents(), loadEnrollments()])
  results.filter(result => result.status === 'rejected').forEach(result => toast(describeError(result.reason, 'Loading some records'), 'error'))
  await loadAcademic()
  renderPromotionExclusions()
  await refreshShiftSections()
  hideLoadingScreen()
}
init()
