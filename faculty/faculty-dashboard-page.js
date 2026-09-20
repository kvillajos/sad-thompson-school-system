import { loadFacultyContext, escapeHtml, dayNames } from './faculty-common.js'

const context = await loadFacultyContext('dashboard')
if (context) {
  const $ = id => document.getElementById(id)
  $('class-count').textContent = new Set(context.schedules.map(item => item.section_id)).size
  $('schedule-count').textContent = context.schedules.length
  $('student-count').textContent = context.enrollments.length
  $('schedule-table').innerHTML = context.scheduleError ? `<tr><td colspan="5">${escapeHtml(context.scheduleError.message)}</td></tr>` : context.schedules.map(item => `<tr><td>${escapeHtml(item.subjects?.subject_name)}</td><td>${escapeHtml(item.sections?.section_name)}</td><td>${escapeHtml(item.room || '-')}</td><td>${dayNames[item.day_of_week]}</td><td>${escapeHtml(`${item.start_time?.slice(0, 5)} - ${item.end_time?.slice(0, 5)}`)}</td></tr>`).join('') || '<tr><td colspan="5">No schedules assigned.</td></tr>'
  $('student-table').innerHTML = context.enrollmentError ? `<tr><td colspan="4">${escapeHtml(context.enrollmentError.message)}</td></tr>` : context.enrollments.map(item => `<tr><td>${escapeHtml(item.students?.lrn_number || item.student_id)}</td><td>${escapeHtml(`${item.students?.first_name || ''} ${item.students?.last_name || ''}`)}</td><td>${escapeHtml(item.students?.grade_level)}</td><td>Active</td></tr>`).join('') || '<tr><td colspan="4">No students assigned.</td></tr>'
}
