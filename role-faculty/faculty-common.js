import { supabase, requireRole, signOut } from '../shared/lib/auth-client.js'
import { applyUiTheme } from '../shared/ui/ui-theme.js'
import { mountProfile, mountSidebar } from '../shared/ui/shell.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { classOptions, currentSchoolYear } from '../shared/lib/grades.js'
import { dayNames, escapeHtml, lastFirst, byLastName } from '../shared/lib/html.js'

export { dayNames, escapeHtml, lastFirst }

export async function loadFacultyContext(activePage = 'dashboard') {
  applyUiTheme()
  const user = await requireRole(3)
  if (!user) return null
  mountProfile(user, 'Faculty', signOut)
  const navigation = [
    ['Dashboard', '/role-faculty/faculty-dashboard.html', '⌂', 'dashboard'],
    ['My Advisory', '/role-faculty/faculty-advisory.html', '♙', 'advisory'],
    ['Class List', '/role-faculty/faculty-class-list.html', '▤', 'class-list'],
    ['Grades', '/role-faculty/faculty-grades.html', '✎', 'grades'],
    ['Attendance', '/role-faculty/faculty-attendance.html', '✓', 'attendance'],
    ['Reports', '/role-faculty/faculty-reports.html', '▧', 'reports'],
    ['Feedback', '/role-faculty/faculty-feedback.html', '✉', 'feedback']
  ]
  mountSidebar(
    navigation.map(([label, href, icon, page]) => ({ label, href, icon, active: page === activePage })),
    'Faculty Portal',
    'faculty'
  )
  const profileResult = await supabase.from('staff_profiles').select('first_name,last_name').eq('user_id', user.user_id).single()
  const profile = profileResult.data
  const facultyName = profile ? `${profile.first_name} ${profile.last_name}` : user.username
  // School year picker in the page header. A past year is read-only: its classes come from teaching_records
  // (v67), not the timetable, and pages hide their save/upload/lock controls (body.faculty-past-year).
  const thisYear = currentSchoolYear()
  const schoolYear = pickedYear() || thisYear
  const past = schoolYear !== thisYear
  const scheduleResult = past
    ? await supabase
        .from('teaching_records')
        .select('subject_id,section_id,subjects(subject_name,semester),sections!inner(section_name,academic_year)')
        .eq('school_year', schoolYear)
        .order('section_id')
    : await supabase
        .from('subject_schedules')
        .select(
          'subject_id,section_id,room,day_of_week,start_time,end_time,subjects(subject_name,semester),sections!inner(section_name,academic_year)'
        )
        .ilike('faculty_name', facultyName)
        // Only this school year's classes: copied or past years' timetables are not this year's load.
        .eq('sections.academic_year', thisYear)
        .order('day_of_week')
        .order('start_time')
  const schedules = scheduleResult.data || []
  const sectionIds = [...new Set(schedules.map(item => item.section_id))]
  const enrollmentResult = sectionIds.length
    ? await supabase
        .from('enrollments')
        .select('student_id,section_id,status,students(lrn_number,first_name,last_name,grade_level,gender)')
        .in('section_id', sectionIds)
        // A past year's roster as it ended: promoted/graduated students' enrollments are 'completed'.
        .in('status', past ? ['active', 'completed'] : ['active'])
    : { data: [], error: null }
  await mountYearPicker(schoolYear, thisYear)
  document.body.classList.toggle('faculty-past-year', past)
  hideLoadingScreen()
  return {
    user,
    facultyName,
    schedules,
    enrollments: (enrollmentResult.data || []).sort((a, b) => byLastName(a.students, b.students)),
    scheduleError: scheduleResult.error,
    enrollmentError: enrollmentResult.error,
    classes: classOptions(schedules),
    schoolYear,
    past
  }
}

// The picked year lives in the URL (?sy=2025-2026) and in this tab's session, so it carries across pages.
function pickedYear() {
  const fromUrl = new URLSearchParams(location.search).get('sy')
  try {
    if (fromUrl) sessionStorage.setItem('faculty-sy', fromUrl)
    return fromUrl || sessionStorage.getItem('faculty-sy')
  } catch {
    return fromUrl
  }
}

async function mountYearPicker(schoolYear, thisYear) {
  const main = document.querySelector('main')
  if (!main || document.getElementById('faculty-year-bar')) return
  const { data } = await supabase.from('teaching_records').select('school_year').order('school_year', { ascending: false })
  const years = [...new Set([thisYear, ...(data || []).map(row => row.school_year)])].filter(year => year <= thisYear).sort().reverse()
  const bar = document.createElement('div')
  bar.id = 'faculty-year-bar'
  bar.className = 'faculty-year-bar'
  bar.innerHTML = `<label>School year <select id="faculty-year">${years
    .map(year => `<option value="${escapeHtml(year)}"${year === schoolYear ? ' selected' : ''}>${escapeHtml(year)}${year === thisYear ? ' (current)' : ''}</option>`)
    .join('')}</select></label>${
    schoolYear !== thisYear
      ? `<p class="faculty-year-note" role="status">Viewing <b>${escapeHtml(schoolYear)}</b>, read only. Only the classes you taught that year are shown.</p>`
      : ''
  }`
  main.prepend(bar)
  bar.querySelector('select').onchange = event => {
    const url = new URL(location.href)
    url.searchParams.set('sy', event.target.value)
    location.href = url.toString()
  }
}

export function classSelect(select, classes) {
  select.innerHTML =
    classes.map(item => `<option value="${item.key}">${escapeHtml(item.label)}</option>`).join('') ||
    '<option value="">No classes assigned</option>'
}

export function rosterFor(context, classKey) {
  const chosen = context.classes.find(item => item.key === classKey)
  return { chosen, roster: chosen ? context.enrollments.filter(item => Number(item.section_id) === chosen.section_id) : [] }
}
