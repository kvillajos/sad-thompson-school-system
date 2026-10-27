// Admin dashboard overview: today's date, the stat strip, and enrollment charts. Read-only counts from tables the
// dashboard and list pages already read; nothing here changes data.
import { supabase } from '../shared/lib/auth-client.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { currentSchoolYear } from '../shared/lib/grades.js'
import { gradeLabel } from '../shared/lib/html.js'
import { statStrip, columnChart, barList } from '../shared/ui/charts.js'

const count = query => query.then(({ count: total, error }) => (error ? null : total))
const shown = value => (value == null ? '–' : value.toLocaleString())

export async function mountAdminOverview(host) {
  const year = currentSchoolYear()
  document.getElementById('dash-today').textContent = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  document.getElementById('dash-post-announcement').onclick = () => document.getElementById('add-announcement').click()
  host.innerHTML = `<div data-stats></div>
    <div class="dash-grid">
      <section class="admin-table-wrap chart-card"><div class="admin-section-title"><div><h3>Enrolled students by grade</h3><p class="chart-sub">Active enrollments</p></div></div><div data-grade-chart></div></section>
      <section class="admin-table-wrap chart-card"><div class="admin-section-title"><div><h3>Senior High by strand</h3><p class="chart-sub">Grades 11 and 12, active enrollments</p></div></div><div data-strand-chart></div></section>
    </div>`
  const stats = host.querySelector('[data-stats]')
  const labels = ['Pending approvals', 'Enrolled students', 'Sections', 'Faculty']
  statStrip(
    stats,
    labels.map(label => ({ label }))
  )

  const head = { count: 'exact', head: true }
  const [admissions, profileChanges, requests, sections, faculty, enrolled] = await Promise.all([
    count(supabase.from('admission_applications').select('id', head).in('status', ['submitted', 'under_review'])),
    count(supabase.from('profile_change_requests').select('request_id', head).eq('status', 'pending')),
    count(supabase.from('approval_requests').select('id', head).eq('status', 'pending')),
    count(supabase.from('sections').select('section_id', head).eq('academic_year', year)),
    count(supabase.from('staff_profiles').select('profile_id, users!inner(role_id)', head).eq('users.role_id', 3)),
    fetchAll(() => supabase.from('enrollments').select('grade_level,sections(strand)').eq('status', 'active').order('id'))
  ])
  const pending = [admissions, profileChanges, requests].includes(null) ? null : admissions + profileChanges + requests
  const rows = enrolled.data || []
  statStrip(stats, [
    { label: labels[0], value: shown(pending), note: pending ? `${admissions} admission${admissions === 1 ? '' : 's'}, ${pending - admissions} other` : 'All caught up' },
    { label: labels[1], value: shown(enrolled.error ? null : rows.length), note: 'Active enrollments' },
    { label: labels[2], value: shown(sections), note: `SY ${year.replace('-', '–')}` },
    { label: labels[3], value: shown(faculty), note: 'Faculty accounts' }
  ])

  const byGrade = new Map()
  const byStrand = new Map()
  rows.forEach(row => {
    byGrade.set(row.grade_level, (byGrade.get(row.grade_level) || 0) + 1)
    const strand = row.sections?.strand
    if (Number(row.grade_level) >= 11 && strand) byStrand.set(strand, (byStrand.get(strand) || 0) + 1)
  })
  const gradeHost = host.querySelector('[data-grade-chart]')
  const strandHost = host.querySelector('[data-strand-chart]')
  if (enrolled.error) {
    gradeHost.textContent = strandHost.textContent = 'Could not load enrollments. Refresh to try again.'
    return
  }
  columnChart(
    gradeHost,
    [...byGrade].sort(([a], [b]) => a - b).map(([grade, value]) => ({ label: gradeLabel(grade), value })),
    { emptyText: 'No active enrollments yet.' }
  )
  barList(
    strandHost,
    [...byStrand].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
    { emptyText: 'No Senior High enrollments yet.' }
  )
}
