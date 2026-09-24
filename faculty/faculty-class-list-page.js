import { loadFacultyContext, escapeHtml, classSelect, rosterFor } from './faculty-common.js'

const context = await loadFacultyContext('class-list')
if (context) {
  const select = document.getElementById('roster-class')
  const table = document.getElementById('roster-table')
  classSelect(select, context.classes)
  const render = () => {
    const { roster } = rosterFor(context, select.value)
    table.innerHTML = roster.map(item => `<tr><td>${escapeHtml(item.students?.lrn_number || item.student_id)}</td><td>${escapeHtml(`${item.students?.first_name || ''} ${item.students?.last_name || ''}`)}</td><td>${escapeHtml(item.students?.gender || '-')}</td><td>${escapeHtml(item.students?.grade_level || '-')}</td><td>Active</td><td><a class="admin-view" href="/faculty/faculty-grades.html?class=${encodeURIComponent(select.value)}">Grades</a><a class="admin-view" href="/faculty/faculty-attendance.html?class=${encodeURIComponent(select.value)}">Attendance</a></td></tr>`).join('') || '<tr><td colspan="6">No active students in this class.</td></tr>'
  }
  select.onchange = render
  render()
}
