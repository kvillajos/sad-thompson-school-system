import { supabase } from '../auth-client.js'
import { mountAnnouncements } from '../announcements.js'
import { mountDayTabs, gapsFrom } from '../day-tabs.js'
import { loadSchoolYearSettings } from '../school-settings.js'
import { loadFacultyContext, escapeHtml, dayNames } from './faculty-common.js'

const context = await loadFacultyContext('dashboard')
if (context) {
  const $ = id => document.getElementById(id)
  mountAnnouncements($('announcements-host'), 'faculty')
  $('class-count').textContent = new Set(context.schedules.map(item => item.section_id)).size
  $('schedule-count').textContent = context.schedules.length
  $('student-count').textContent = context.enrollments.length
  if (context.scheduleError) $('schedule-days').innerHTML = `<p>${escapeHtml(context.scheduleError.message)}</p>`
  else mountDayTabs($('schedule-days'), context.schedules, {
    gaps: gapsFrom(await loadSchoolYearSettings(context.schoolYear)),
    headers: ['Subject', 'Section', 'Room', 'Time'],
    cells: item => [escapeHtml(item.subjects?.subject_name), escapeHtml(item.sections?.section_name), escapeHtml(item.room || '-'), escapeHtml(`${item.start_time?.slice(0, 5)} - ${item.end_time?.slice(0, 5)}`)],
    emptyText: 'No classes'
  })
  $('student-table').innerHTML = context.enrollmentError ? `<tr><td colspan="4">${escapeHtml(context.enrollmentError.message)}</td></tr>` : context.enrollments.map(item => `<tr><td>${escapeHtml(item.students?.lrn_number || item.student_id)}</td><td>${escapeHtml(`${item.students?.first_name || ''} ${item.students?.last_name || ''}`)}</td><td>${escapeHtml(item.students?.grade_level)}</td><td>Active</td></tr>`).join('') || '<tr><td colspan="4">No students assigned.</td></tr>'
  // Teaching-load notices need no approval; the teacher just acknowledges them.
  const showNotices = async () => {
    const { data } = await supabase.from('notifications').select('id,title,message,created_at').eq('recipient_email', context.user.email).eq('is_read', false).order('created_at', { ascending: false })
    $('notice-section').classList.toggle('hidden', !data?.length)
    $('notice-table').innerHTML = (data || []).map(item => `<tr><td><b>${escapeHtml(item.title)}</b><br>${escapeHtml(item.message)}</td><td style="width:1%"><button class="admin-view" data-ack="${item.id}">I see</button></td></tr>`).join('')
    $('notice-table').querySelectorAll('[data-ack]').forEach(button => button.onclick = async () => { await supabase.rpc('acknowledge_notification', { p_id: Number(button.dataset.ack) }); showNotices() })
  }
  showNotices()
}
