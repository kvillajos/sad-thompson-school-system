import { loadFacultyContext, escapeHtml, classSelect, rosterFor } from './faculty-common.js'

const context = await loadFacultyContext('class-list')
if (context) {
  const select = document.getElementById('roster-class')
  const table = document.getElementById('roster-table')
  classSelect(select, context.classes)
  const render = () => {
    const { roster } = rosterFor(context, select.value)
  
    
    
    table.innerHTML = roster.map(item => `<tr><td>${escapeHtml(item.students?.lrn_number || item.student_id)}</td><td>${escapeHtml(`${item.students?.first_name || ''} ${item.students?.last_name || ''}`)}</td><td>${escapeHtml(item.students?.gender || '-')}</td><td style="text-align:center;">${escapeHtml(item.students?.grade_level || '-')}</td><td>Active</td><td><div style="display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;"><a class="admin-view" style="display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:90px;min-height:30px;padding:6px 8px;text-align:center;white-space:nowrap;font-size:12px;" href="/role-faculty/faculty-grades.html?class=${encodeURIComponent(select.value)}">Grades</a><a class="admin-view" style="display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:90px;min-height:30px;padding:6px 8px;text-align:center;white-space:nowrap;font-size:12px;" href="/role-faculty/faculty-attendance.html?class=${encodeURIComponent(select.value)}">Attendance</a></div></td></tr>`).join('') || '<tr><td colspan="6">No active students in this class.</td></tr>'
  }
  select.onchange = render
  render()
}
