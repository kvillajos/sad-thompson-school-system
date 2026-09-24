import { requireRole, signOut } from './auth-client.js'
import { applyUiTheme } from './ui-theme.js'
import { mountProfile, mountSidebar } from './shell.js'

const NAV = [
  ['Dashboard', '/admin-dashboard.html', '⌂', 'dashboard'],
  ['Manage Accounts', '/admin-accounts.html', '▣', 'accounts'],
  ['Manage Faculty', '/admin-faculty.html', '♙', 'faculty'],
  ['Manage Sections', '/admin-sections.html', '▤', 'sections'],
  ['Manage Subjects', '/admin-subjects.html', '♧', 'subjects'],
  ['Manage Schedules', '/admin-schedules.html', '▱', 'schedules'],
  ['Curriculum Review', '/admin-curriculum.html', '☷', 'curriculum'],
  ['Audit Trail', '/admin-audit.html', '▤', 'audit']
]

export function adminNav(active) {
  return NAV.map(([label, href, icon, page]) => ({ label, href, icon, active: page === active }))
}

export async function mountAdminShell(active) {
  applyUiTheme()
  const user = await requireRole(1)
  if (!user) throw new Error('Unauthorized')
  mountProfile(user, 'Administrator', signOut)
  mountSidebar(adminNav(active), 'Administrative<br>Control', 'admin')
  return user
}
