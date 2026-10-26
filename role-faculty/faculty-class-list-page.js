import { loadFacultyContext, escapeHtml, classSelect, rosterFor } from './faculty-common.js'
import { mountFilterBar } from '../shared/ui/filter-bar.js'

const context = await loadFacultyContext('class-list')
if (context) {
  const select = document.getElementById('roster-class')
  const table = document.getElementById('roster-table')
  classSelect(select, context.classes)
  const filters = mountFilterBar(document.getElementById('roster-filters'), {
    filters: [{ key: 'gender', all: 'All genders', get: item => item.students?.gender }],
    onChange: () => render(),
    exportTable: () => table.closest('table'),
    filename: 'class-list'
  })
  const render = () => {
    const roster = filters.apply(rosterFor(context, select.value).roster)

    table.innerHTML =
      roster
        .map(
          item =>
            `<tr><td data-label="Student ID">${escapeHtml(item.students?.lrn_number || item.student_id)}</td><td data-label="Student Name">${escapeHtml(`${item.students?.first_name || ''} ${item.students?.last_name || ''}`)}</td><td data-label="Gender">${escapeHtml(item.students?.gender || '-')}</td><td data-label="Grade" style="text-align:center;">${escapeHtml(item.students?.grade_level || '-')}</td><td data-label="Status">Active</td><td data-label="Actions"><div style="display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;"><a class="admin-view" style="display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:90px;min-height:30px;padding:6px 8px;text-align:center;white-space:nowrap;font-size:12px;" href="/role-faculty/faculty-grades.html?class=${encodeURIComponent(select.value)}">Grades</a><a class="admin-view" style="display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:90px;min-height:30px;padding:6px 8px;text-align:center;white-space:nowrap;font-size:12px;" href="/role-faculty/faculty-attendance.html?class=${encodeURIComponent(select.value)}">Attendance</a></div></td></tr>`
        )
        .join('') || '<tr><td colspan="6">No active students in this class.</td></tr>'
  }
  filters.update(context.enrollments)
  select.onchange = render
  render()
}
