import { supabase, requireRole, signOut } from './auth-client.js'
import { hideLoadingScreen } from './loading-screen.js'
import { mountDayTabs, gapsFrom, timeRange12 } from './day-tabs.js'
import { loadSchoolYearSettings } from './school-settings.js'
import { dayNames, escapeHtml as escape, formatDate, gradeLabel } from './html.js'
import { applyUiTheme } from './ui-theme.js'
import { mountProfile, mountSidebar, confirmPassword } from './shell.js'
import { attendanceSummaryLine } from './attendance.js'
import { changedFields } from './edit-request.js'
import { generalAverage, letterGrade } from './grades.js'
import { buildSemesterTable } from './semester-grades.js'
import { buildTranscript } from './transcript.js'
import { previewPdf, pdfName } from './pdf-preview.js'
import { mountAnnouncements } from './announcements.js'
import { mountNotificationBell } from './notifications.js'

applyUiTheme()

const user = await requireRole(4)
if (!user) throw new Error('Unauthorized')

mountProfile(user, 'Student', signOut)
mountNotificationBell(user)
mountSidebar([
  { label: 'Dashboard', tab: 'dashboard', active: true, icon: '⌂' },
  { label: 'Schedule', tab: 'schedule', icon: '▤' },
  { label: 'Grades', tab: 'grades', icon: '♧' },
  { label: 'Transcript', tab: 'transcript', icon: '▱' },
  { label: 'Profile', tab: 'profile', icon: '☷' }
], 'Student Portal', 'student')

const tabs = [...document.querySelectorAll('[data-tab]')]
const panels = [...document.querySelectorAll('[data-panel]')]
tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => t.classList.remove('active'))
  panels.forEach(p => p.classList.add('hidden'))
  tab.classList.add('active')
  const targetPanel = document.querySelector(`[data-panel="${tab.dataset.tab}"]`)
  if (targetPanel) targetPanel.classList.remove('hidden')
}))

let student = null
let sectionId = null
let sectionName = ''
let schoolYear = ''
let gradeRows = []

function showProfilePicture(url) {
  const initials = [student?.first_name, student?.last_name]
    .filter(Boolean)
    .map(name => name.trim().charAt(0))
    .join('')
    .toUpperCase()
  document.getElementById('profile-picture-preview').innerHTML = url 
    ? `<img src="${escape(url)}" alt="Profile picture">` 
    : escape(initials || '?')
}

async function loadStudent() {
  if (!user.student_id) return
  const { data } = await supabase.from('students').select('*').eq('student_id', user.student_id).single()
  student = data

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('section_id,school_year,sections(section_name,academic_year,semester)')
    .eq('student_id', user.student_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  sectionId = enrollment?.section_id || null
  sectionName = enrollment?.sections?.section_name || 'Unassigned'
  schoolYear = enrollment?.school_year || ''

  const fullName = `${student?.first_name || ''} ${student?.middle_name || ''} ${student?.last_name || ''}`.replace(/\s+/g, ' ').trim()
  document.getElementById('dash-name').textContent = fullName
  document.getElementById('dash-lrn').textContent = student?.lrn_number || '-'
  
  const status = student?.enrollment_status || 'Not enrolled'
  const statusEl = document.getElementById('dash-status')
  statusEl.textContent = status
  statusEl.className = `badge ${status.toLowerCase().replaceAll(' ', '-')}`

  const initials = [student?.first_name, student?.last_name].filter(Boolean).map(name => name.trim().charAt(0)).join('').toUpperCase()
  document.getElementById('dash-photo').innerHTML = student?.profile_picture_url 
    ? `<img src="${escape(student.profile_picture_url)}" alt="Profile Photo">` 
    : escape(initials || '?')

  // Dashboard detail cards rendering
  const details = [
    ['Grade level', student?.grade_level != null ? gradeLabel(student.grade_level) : '-'],
    ['Section', sectionName],
    ['School year', enrollment?.sections?.academic_year || schoolYear || '-'],
    ['Semester', enrollment?.sections?.semester || '-'],
    ['Date of birth', student?.date_of_birth ? formatDate(student.date_of_birth) : '-'],
    ['Sex', student?.gender || student?.sex || '-'],
    ['Contact number', student?.contact_number || '-'],
    ['Email', user.email || '-'],
    ['Address', student?.address || '-', true]
  ]

  document.getElementById('dash-details').innerHTML = details
    .map(([label, value, wide]) => `<div${wide ? ' class="wide"' : ''}><dt>${label}</dt><dd>${escape(value)}</dd></div>`)
    .join('')

  // Profile detail cards rendering
  const profileDetails = [
    ['Name', fullName, true],
    ['Student ID', student?.lrn_number || '-'],
    ['Status', student?.enrollment_status || '-'],
    ['Grade Level', student?.grade_level != null ? `Grade ${student.grade_level}` : '-'],
    ['Section', sectionName],
    ['Program', Number(student?.grade_level) >= 11 ? 'Senior High School' : Number(student?.grade_level) >= 7 ? 'Junior High School' : 'Elementary'],
    ['Date of Birth', student?.date_of_birth ? formatDate(student.date_of_birth) : '-'],
    ['Contact Number', student?.contact_number || '-'],
    ['Email Address', user.email || '-'],
    ['Address', student?.address || '-', true],
    ['Guardian', student?.guardian_name || '-'],
    ['Relationship', student?.guardian_relationship || '-'],
    ['Guardian Phone', student?.guardian_phone || '-'],
    ['Guardian Email', student?.guardian_email || '-'],
    ['Medical Notes', student?.medical_notes || 'None reported', true]
  ]

  const profileGridEl = document.getElementById('profile-info-grid')
  if (profileGridEl) {
    profileGridEl.innerHTML = profileDetails
      .map(([label, value, wide]) => `<div${wide ? ' class="wide"' : ''}><dt>${label}</dt><dd>${escape(value)}</dd></div>`)
      .join('')
  }

  showProfilePicture(student?.profile_picture_url)
}

const editModal = document.getElementById('edit-request-modal')
const editForm = document.getElementById('edit-request-form')
const closeEditRequest = () => editModal.classList.add('hidden')

document.getElementById('open-edit-request').onclick = () => {
  for (const input of editForm.querySelectorAll('[name]')) {
    if (input.name === 'reason') { input.value = ''; continue }
    input.value = student?.[input.name] ?? ''
    input.dataset.current = input.value
  }
  editModal.classList.remove('hidden')
}

document.getElementById('edit-request-close').onclick = closeEditRequest
document.getElementById('edit-request-cancel').onclick = closeEditRequest

editForm.onsubmit = async event => {
  event.preventDefault()
  const changes = changedFields(student, Object.fromEntries([...editForm.querySelectorAll('[name]:not([name="reason"])')].map(input => [input.name, input.value])))
  if (!Object.keys(changes).length) return window.alert('You have not changed anything.')
  if (!await confirmPassword(user.email, 'Enter your password to send this request.')) return
  
  const { error } = await supabase.rpc('request_student_profile', { 
    p_changes: changes, 
    p_reason: editForm.elements.reason.value 
  })
  if (error) return window.alert(error.message)
  
  closeEditRequest()
  window.alert('Request sent. An administrator will review it, and you will get a notification.')
  showEditRequestStatus()
}

async function showEditRequestStatus() {
  const { data, error } = await supabase.rpc('my_pending_profile_request')
  const note = document.getElementById('edit-request-status')
  const button = document.getElementById('open-edit-request')
  const pending = !error && data
  note.hidden = !pending
  if (pending) note.textContent = `Pending since ${formatDate(data.created_at)}. An administrator is reviewing your request.`
  button.disabled = Boolean(pending)
  button.textContent = pending ? 'Request pending' : 'Request edit'
}

async function loadSchedule() {
  const host = document.getElementById('schedule-days')
  document.getElementById('schedule-section').textContent = sectionId ? `Section: ${sectionName}` : 'No section yet'
  document.getElementById('schedule-caption').textContent = `Class Schedule — ${schoolYear || 'Current Term'}`
  if (!sectionId) { host.innerHTML = '<p class="admin-note">No active section enrollment found.</p>'; return }
  
  const { data, error } = await supabase
    .from('subject_schedules')
    .select('subject_id,section_id,faculty_name,room,day_of_week,start_time,end_time,subjects(subject_name),sections(section_name)')
    .eq('section_id', sectionId)
    .order('day_of_week')
    .order('start_time')

  if (error) return host.innerHTML = `<p class="admin-note">${escape(error.message)}</p>`
  
  const settings = await loadSchoolYearSettings(schoolYear)
  mountDayTabs(host, data || [], {
    gaps: gapsFrom(settings),
    headers: ['Subject', 'Faculty', 'Room', 'Time'],
    cells: item => [escape(item.subjects?.subject_name || ''), escape(item.faculty_name || '-'), escape(item.room || '-'), timeRange12(item.start_time, item.end_time)],
    emptyText: 'No classes'
  })
}

async function loadGrades() {
  const table = document.getElementById('grades-table')
  if (!user.student_id) return table.innerHTML = '<tr><td colspan="10">No student record linked.</td></tr>'
  
  const { data, error } = await supabase
    .from('academic_history')
    .select('school_year,subject,grade,letter_grade,remarks,first_sem_q1,first_sem_q2,second_sem_q1,second_sem_q2')
    .eq('student_id', user.student_id)
    .order('school_year', { ascending: false })

  if (error) return table.innerHTML = `<tr><td colspan="10">${escape(error.message)}</td></tr>`
  gradeRows = data || []
  
  const years = [...new Set(gradeRows.map(row => row.school_year).filter(Boolean))].sort().reverse()
  document.getElementById('grade-year-filter').innerHTML = '<option value="">All school years</option>' + years.map(year => `<option>${escape(year)}</option>`).join('')
  document.getElementById('transcript-year-filter').innerHTML = '<option value="">All school years</option>' + years.map(year => `<option>${escape(year)}</option>`).join('')
  
  renderGrades()
  renderTranscript()
}

function renderGrades() {
  const year = document.getElementById('grade-year-filter').value
  const semester = document.getElementById('grade-semester-filter').value
  const averageRows = year ? gradeRows.filter(row => row.school_year === year) : gradeRows
  
  document.getElementById('grades-table').innerHTML = buildSemesterTable(averageRows, { semester })
  const average = generalAverage(averageRows)
  document.getElementById('grades-average').textContent = average == null ? '' : `General Average (${year || 'all school years'}): ${average} (${letterGrade(average)?.letter || '-'})`
}

function renderTranscript() {
  const year = document.getElementById('transcript-year-filter').value
  const html = buildTranscript({ student, rows: gradeRows, mode: 'unofficial', schoolYear: year, sectionName })
  document.getElementById('transcript-preview').innerHTML = html
  document.getElementById('student-transcript-print').innerHTML = html
}

async function loadAttendance() {
  const table = document.getElementById('attendance-table')
  if (!user.student_id) return table.innerHTML = '<tr><td colspan="2">No student record linked.</td></tr>'
  
  const [totals, history] = await Promise.all([
    supabase.rpc('attendance_totals', { p_student_id: user.student_id, p_school_year: schoolYear || null }),
    supabase.from('attendance').select('attendance_date,status').eq('student_id', user.student_id).order('attendance_date', { ascending: false }).limit(20)
  ])

  document.getElementById('attendance-summary').textContent = totals.error ? totals.error.message : attendanceSummaryLine(totals.data)
  if (history.error) return table.innerHTML = `<tr><td colspan="2">${escape(history.error.message)}</td></tr>`
  
  table.innerHTML = (history.data || []).map(a => {
    const statusClass = a.status?.toLowerCase() === 'present' ? 'badge-success' : 'badge-warning'
    return `<tr><td>${formatDate(a.attendance_date)}</td><td><span class="badge ${statusClass}">${escape(a.status)}</span></td></tr>`
  }).join('') || '<tr><td colspan="2">No attendance recorded yet.</td></tr>'
}

const pictureInput = document.getElementById('profile-picture-input')
const pictureActions = document.getElementById('picture-actions')
const pictureHint = document.getElementById('picture-hint')
const hintText = pictureHint.textContent
let previewUrl = null

const resetPicture = () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = null
  pictureInput.value = ''
  pictureActions.classList.add('hidden')
  pictureHint.textContent = hintText
  pictureHint.style.color = ''
  showProfilePicture(student?.profile_picture_url)
}

document.getElementById('choose-picture').onclick = () => pictureInput.click()
document.getElementById('cancel-picture').onclick = resetPicture

pictureInput.onchange = () => {
  const file = pictureInput.files?.[0]
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
    resetPicture()
    pictureHint.textContent = "That file can't be used. Choose a PNG, JPG or WEBP up to 3 MB."
    pictureHint.style.color = '#c0392b'
    return
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = URL.createObjectURL(file)
  document.getElementById('profile-picture-preview').innerHTML = `<img src="${previewUrl}" alt="New profile picture preview">`
  pictureHint.textContent = file.name
  pictureHint.style.color = ''
  pictureActions.classList.remove('hidden')
}

document.getElementById('save-picture').onclick = async () => {
  const file = pictureInput.files?.[0]
  if (!file) return
  const button = document.getElementById('save-picture')
  button.disabled = true
  button.textContent = 'Saving...'
  try {
    const path = `${user.student_id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('profile-pictures').upload(path, file, { upsert: false })
    if (uploadError) throw uploadError
    const { data: publicUrlData } = supabase.storage.from('profile-pictures').getPublicUrl(path)
    const { error: rpcError } = await supabase.rpc('update_own_profile_picture', { p_url: publicUrlData.publicUrl })
    if (rpcError) throw rpcError
    student = { ...student, profile_picture_url: publicUrlData.publicUrl }
    resetPicture()
    pictureHint.textContent = 'Profile picture updated.'
  } catch (error) {
    pictureHint.textContent = error.message || 'Could not save the picture.'
    pictureHint.style.color = '#c0392b'
  } finally {
    button.disabled = false
    button.textContent = 'Save photo'
  }
}

document.getElementById('grade-year-filter').onchange = renderGrades
document.getElementById('grade-semester-filter').onchange = renderGrades
document.getElementById('transcript-year-filter').onchange = renderTranscript
document.getElementById('print-unofficial-transcript').onclick = () => previewPdf(document.getElementById('student-transcript-print'), { title: 'Unofficial Transcript', filename: pdfName('Unofficial Transcript', student), printClass: 'printing-transcript' })

await loadStudent()
await showEditRequestStatus()
await Promise.all([loadSchedule(), loadGrades(), mountAnnouncements(document.getElementById('announcements-host'), 'student'), loadAttendance()])
hideLoadingScreen()