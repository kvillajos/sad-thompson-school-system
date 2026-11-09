// A graduate's login is transcript-only: the dashboard (with an alumni note), the transcript, and document
// requests. Graduation itself happens in batch promotion (Grade 12 students who pass become 'Graduated').
import { escapeHtml } from '../shared/lib/html.js'

const GRADUATE_TABS = ['dashboard', 'transcript', 'requests']

export function applyGraduateAccess(student) {
  if (student?.enrollment_status !== 'Graduated') return false
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    if (!GRADUATE_TABS.includes(link.dataset.tab)) link.remove()
  })
  // Panels stay in the page (the dashboard still renders into them) but are renamed, so a #grades link or the
  // Back button can no longer open them: the tab switcher falls back to the dashboard.
  document.querySelectorAll('[data-panel]').forEach(panel => {
    if (GRADUATE_TABS.includes(panel.dataset.panel)) return
    panel.dataset.panel = `closed-${panel.dataset.panel}`
    panel.classList.add('hidden')
  })
  // Graduates request documents; LRN / account / section requests are for enrolled students.
  document.getElementById('portal-request-card')?.classList.add('hidden')
  document
    .querySelector('[data-panel="dashboard"]')
    ?.insertAdjacentHTML(
      'afterbegin',
      `<p class="note admin-note" role="note"><strong>Congratulations, ${escapeHtml(student.first_name || 'graduate')}!</strong> Your account now gives access to your transcript and to document requests (Form 137, Good Moral, Certificate of Enrollment).</p>`
    )
  if (!GRADUATE_TABS.includes(location.hash.slice(1))) history.replaceState(null, '', '#transcript')
  document.querySelector('.sidebar-link[data-tab="transcript"]')?.click()
  return true
}
