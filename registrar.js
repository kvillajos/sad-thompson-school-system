import { requireRole, signOut } from './auth-client.js'
import { applyUiTheme, toast } from './ui-theme.js'
import { mountProfile, mountSidebar } from './shell.js'
import { hideLoadingScreen } from './loading-screen.js'
import { $, state } from './registrar-state.js'
import { loadApplications } from './registrar-admissions.js'
import { loadSections, loadEnrollments } from './registrar-sectioning.js'
import { loadAcademic } from './registrar-academic.js'
import { mountAnnouncements } from './announcements.js'
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
  { label: 'Transcript', tab: 'transcript', icon: '▱' },
  { label: 'Batch Promotion', tab: 'promotion', icon: '↗' },
  { label: 'Transfer & Shifting', tab: 'shifting', icon: '⇄' },
  { label: 'Requests & Feedback', tab: 'requests', icon: '✉' }
], 'Registry and<br>Student Records', 'registrar')

const tabs = [...document.querySelectorAll('[data-tab]')]
const panels = [...document.querySelectorAll('[data-panel]')]
tabs.forEach((tab) => tab.addEventListener('click', () => {
  tabs.forEach(t => t.classList.remove('active'))
  panels.forEach(p => p.classList.add('hidden'))
  tab.classList.add('active')
  $(tab.dataset.tab).classList.remove('hidden')
  if (tab.dataset.tab === 'sectioning') loadSections()
  if (tab.dataset.tab === 'requests') loadMyRequests()
}))

mountAnnouncements($('announcements-host'), 'registrar')

async function init(){
  const results = await Promise.allSettled([loadApplications(), loadSections(), loadStudents(), loadEnrollments()])
  results.filter(result => result.status === 'rejected').forEach(result => toast(`Some records could not be loaded: ${result.reason?.message || result.reason}`, 'error'))
  await loadAcademic()
  renderPromotionExclusions()
  await refreshShiftSections()
  hideLoadingScreen()
}
init()
