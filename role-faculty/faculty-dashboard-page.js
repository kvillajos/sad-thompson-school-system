import { supabase } from '../shared/lib/auth-client.js'
import { mountAnnouncements } from '../shared/ui/announcements.js'
import { mountDayTabs, gapsFrom, timeRange12 } from '../shared/ui/day-tabs.js'
import { loadSchoolYearSettings } from '../shared/lib/school-settings.js'
import { loadFacultyContext, escapeHtml, dayNames } from './faculty-common.js'
import { errorRow } from '../shared/lib/html.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'

const context = await loadFacultyContext('dashboard')
if (context) {
  const $ = id => document.getElementById(id)
  mountAnnouncements($('announcements-host'), 'faculty')
  if (context.scheduleError) $('schedule-days').innerHTML = `<p class="note" role="alert">${escapeHtml(describeError(context.scheduleError, 'Load your schedule'))}</p>`
  else if (!context.schedules.length) $('schedule-days').innerHTML = `<p class="note">No classes are assigned to you yet. Classes appear here once the administrator schedules a subject with you (${escapeHtml(context.facultyName)}) as the teacher.</p>`
  else mountDayTabs($('schedule-days'), context.schedules, {
    gaps: gapsFrom(await loadSchoolYearSettings(context.schoolYear)),
    headers: ['Subject', 'Section', 'Room', 'Time'],
    cells: item => [escapeHtml(item.subjects?.subject_name), escapeHtml(item.sections?.section_name), escapeHtml(item.room || '-'), timeRange12(item.start_time, item.end_time)],
    emptyText: 'No classes'
  })
  $('student-table').innerHTML = context.enrollmentError ? errorRow(4, context.enrollmentError, 'Load students') : context.enrollments.map(item => `<tr><td>${escapeHtml(item.students?.lrn_number || item.student_id)}</td><td>${escapeHtml(`${item.students?.first_name || ''} ${item.students?.last_name || ''}`)}</td><td>${escapeHtml(item.students?.grade_level)}</td><td>Active</td></tr>`).join('') || '<tr><td colspan="4">No students assigned.</td></tr>'
  // Teaching-load notices need no approval; the teacher just acknowledges them.
  const showNotices = async () => {
    const { data } = await supabase.from('notifications').select('id,title,message,created_at').eq('recipient_email', context.user.email).eq('is_read', false).order('created_at', { ascending: false })
    $('notice-section').classList.toggle('hidden', !data?.length)
    $('notice-table').innerHTML = (data || []).map(item => `<tr><td><b>${escapeHtml(item.title)}</b><br>${escapeHtml(item.message)}</td><td style="width:1%"><button class="admin-view" data-ack="${item.id}">I see</button></td></tr>`).join('')
    $('notice-table').querySelectorAll('[data-ack]').forEach(button => button.onclick = async () => { const { error } = await supabase.rpc('acknowledge_notification', { p_id: Number(button.dataset.ack) }); if (error) return toast(describeError(error, 'Acknowledge notice'), 'error'); showNotices() })
  }
  showNotices()
}
