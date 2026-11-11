import { supabase } from '../shared/lib/auth-client.js'
import { mountAnnouncements } from '../shared/ui/announcements.js'
import { mountDayTabs, gapsFrom, timeRange12 } from '../shared/ui/day-tabs.js'
import { loadSchoolYearSettings } from '../shared/lib/school-settings.js'
import { loadFacultyContext, escapeHtml, rosterFor } from './faculty-common.js'
import { errorRow } from '../shared/lib/html.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'

const context = await loadFacultyContext('dashboard')
if (context) {
  const $ = id => document.getElementById(id)
  mountAnnouncements($('announcements-host'), 'faculty')
  if (context.scheduleError)
    $('schedule-days').innerHTML =
      `<p class="note" role="alert">${escapeHtml(describeError(context.scheduleError, 'Load your schedule'))}</p>`
  else if (!context.schedules.length)
    $('schedule-days').innerHTML =
      `<p class="note">No classes are assigned to you yet. Classes appear here once the administrator schedules a subject with you (${escapeHtml(context.facultyName)}) as the teacher.</p>`
  else
    mountDayTabs($('schedule-days'), context.schedules, {
      gaps: gapsFrom(await loadSchoolYearSettings(context.schoolYear)),
      headers: ['Subject', 'Section', 'Room', 'Time'],
      cells: item => [
        escapeHtml(item.subjects?.subject_name),
        escapeHtml(item.sections?.section_name),
        escapeHtml(item.room || '-'),
        timeRange12(item.start_time, item.end_time)
      ],
      emptyText: 'No classes'
    })
  // One row per class with its head count; the roster itself lives on Class List.
  const sex = (item, letter) => String(item.students?.gender || '').trim().toLowerCase().startsWith(letter)
  $('class-counts').innerHTML = context.enrollmentError
    ? errorRow(5, context.enrollmentError, 'Load students')
    : context.classes
        .map(item => {
          const { roster } = rosterFor(context, item.key)
          return `<tr><td data-label="Class">${escapeHtml(item.label)}</td><td data-label="Students"><b>${roster.length}</b></td><td data-label="Male">${roster.filter(row => sex(row, 'm')).length}</td><td data-label="Female">${roster.filter(row => sex(row, 'f')).length}</td><td data-label="Actions"><a class="admin-view" href="/role-faculty/faculty-class-list.html?class=${encodeURIComponent(item.key)}">View list</a></td></tr>`
        })
        .join('') || '<tr><td colspan="5">No classes assigned yet.</td></tr>'
  // Teaching-load notices need no approval; the teacher just acknowledges them.
  const showNotices = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id,title,message,created_at')
      .eq('recipient_email', context.user.email)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
    $('notice-section').classList.toggle('hidden', !data?.length)
    $('notice-table').innerHTML = (data || [])
      .map(
        item =>
          `<tr><td><b>${escapeHtml(item.title)}</b><br>${escapeHtml(item.message)}</td><td style="width:1%"><button class="admin-view" data-ack="${item.id}" aria-label="Mark as seen" title="Mark as seen" style="color:#94a3b8;background:transparent;border-color:#e2e8f0;font-size:16px">✓</button></td></tr>`
      )
      .join('')
    $('notice-table')
      .querySelectorAll('[data-ack]')
      .forEach(
        button =>
          (button.onclick = async () => {
            const { error } = await supabase.rpc('acknowledge_notification', { p_id: Number(button.dataset.ack) })
            if (error) return toast(describeError(error, 'Acknowledge notice'), 'error')
            showNotices()
          })
      )
  }
  showNotices()
}
