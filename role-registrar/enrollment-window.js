// "Enrollment for 2026-2027: Open" line on Manage Enrollment. The switch itself is enforced in the database
// (v57); this only tells the registrar before they hit the error.
import { escapeHtml } from '../shared/lib/html.js'
import { loadSchoolYears, yearStatus } from '../shared/lib/school-years.js'

export async function mountEnrollmentWindow(host) {
  if (!host) return
  const years = await loadSchoolYears().catch(() => [])
  if (!years.length || !('enrollment_open' in years[0])) return
  const shown = years.filter(year => yearStatus(year) !== 'Past' || year.enrollment_open).reverse()
  host.innerHTML = shown
    .map(year => {
      const open = year.enrollment_open && !year.closed_at
      return `<span>Enrollment for <strong>${escapeHtml(year.label)}</strong>: <span class="badge ${open ? 'active' : 'inactive'}">${open ? 'Open' : 'Closed'}</span></span>`
    })
    .join('')
}
