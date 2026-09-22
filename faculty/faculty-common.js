import { supabase, requireRole, signOut } from '../auth-client.js'
import { applyUiTheme } from '../ui-theme.js'
import { mountProfile, mountSidebar } from '../shell.js'
import { hideLoadingScreen } from '../loading-screen.js'
import { classOptions, currentSchoolYear } from '../grades.js'
import { dayNames, escapeHtml } from '../html.js'

export { dayNames, escapeHtml }

export async function loadFacultyContext(activePage = 'dashboard') {
  applyUiTheme()
  const user = await requireRole(3)
  if (!user) return null
  mountProfile(user, 'Faculty', signOut)
  const navigation = [
    ['Dashboard', '/faculty/faculty-dashboard.html', '⌂', 'dashboard'],
    ['Class List', '/faculty/faculty-class-list.html', '▤', 'class-list'],
    ['Encode Grades', '/faculty/faculty-grades.html', '✎', 'grades'],
    ['Bulk Upload', '/faculty/faculty-upload.html', '⇧', 'upload'],
    ['Attendance', '/faculty/faculty-attendance.html', '✓', 'attendance'],
    ['Reports', '/faculty/faculty-reports.html', '▧', 'reports']
  ]
  mountSidebar(navigation.map(([label, href, icon, page]) => ({ label, href, icon, active: page === activePage })), 'Faculty Portal')
  const profileResult = await supabase.from('staff_profiles').select('first_name,last_name').eq('user_id', user.user_id).single()
  const profile = profileResult.data
  const facultyName = profile ? `${profile.first_name} ${profile.last_name}` : user.username
  const scheduleResult = await supabase.from('subject_schedules').select('subject_id,section_id,room,day_of_week,start_time,end_time,subjects(subject_name),sections(section_name)').ilike('faculty_name', facultyName).order('day_of_week').order('start_time')
  const schedules = scheduleResult.data || []
  const sectionIds = [...new Set(schedules.map(item => item.section_id))]
  const enrollmentResult = sectionIds.length
    ? await supabase.from('enrollments').select('student_id,section_id,students(lrn_number,first_name,last_name,grade_level,gender)').in('section_id', sectionIds).eq('status', 'active')
    : { data: [], error: null }
  hideLoadingScreen()
  return { user, schedules, enrollments: enrollmentResult.data || [], scheduleError: scheduleResult.error, enrollmentError: enrollmentResult.error, classes: classOptions(schedules), schoolYear: currentSchoolYear() }
}

export function classSelect(select, classes) {
  select.innerHTML = classes.map(item => `<option value="${item.key}">${escapeHtml(item.label)}</option>`).join('') || '<option value="">No classes assigned</option>'
}

export function rosterFor(context, classKey) {
  const chosen = context.classes.find(item => item.key === classKey)
  return { chosen, roster: chosen ? context.enrollments.filter(item => Number(item.section_id) === chosen.section_id) : [] }
}
