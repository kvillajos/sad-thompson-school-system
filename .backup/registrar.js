import { supabase, requireRole, signOut } from './auth-client.js'
import { applyUiTheme, mountProfile, mountSidebar, withBusy } from './ui-theme.js'
import { hideLoadingScreen } from './loading-screen.js'
import { planBalancedAssignments, studentsForSection } from './sectioning.js'

applyUiTheme()

const $ = (id) => document.getElementById(id)
const state = { applications: [], drafts: [], sections: [], students: [], academic: [], selectedApplication: null }
const gradeToNumber = (value) => value === 'Kindergarten' ? 0 : Number(String(value).replace('Grade ', ''))
const gradeLabel = (value) => Number(value) === 0 ? 'Kindergarten' : `Grade ${value}`
// Grade is stored as a number but the select options are labels, so map back on resume.
const gradeSelectLabel = (value) => value == null || value === '' ? '' : (Number.isFinite(Number(value)) ? gradeLabel(Number(value)) : String(value))

const user = await requireRole(2)
if (!user) throw new Error('Unauthorized')

mountProfile(user, 'Registrar', signOut)
hideLoadingScreen()

mountSidebar([
  { label: 'Manage Enrollment', tab: 'enrollment', active: true, icon: '▣' },
  { label: 'New Admission', tab: 'admission', icon: '▣' },
  { label: 'Applications', tab: 'applications', icon: '♙' },
  { label: 'Section Students', tab: 'sectioning', icon: '▤' },
  { label: 'Academic History', tab: 'academic', icon: '♧' },
  { label: 'Transcript', tab: 'transcript', icon: '▱' },
  { label: 'Batch Promotion', tab: 'promotion', icon: '↗' },
  { label: 'Transfer & Shifting', tab: 'shifting', icon: '⇄' },
  { label: 'Feedback Log', tab: 'feedback', icon: '☷' }
], 'Registry and<br>Student Records')
const enrollmentPanel = document.createElement('section')
enrollmentPanel.id = 'enrollment'
enrollmentPanel.dataset.panel = ''
enrollmentPanel.className = ''
enrollmentPanel.innerHTML = `<div class="toolbar"><h2>Manage Enrollment</h2></div><div class="card"><div class="filterbar"><input id="enrollment-search" placeholder="Search Student ID or Name..."><select id="enrollment-section-filter"><option value="">All Sections</option></select><button class="btn" id="filter-enrollment">Filter</button><button class="btn new-enrollment-action" id="new-enrollment">+ New Admission</button></div><table><thead><tr><th>Student ID</th><th>Name</th><th>Year</th><th>Registration Date</th><th>Section</th><th>Status</th><th>Actions</th></tr></thead><tbody id="enrollment-table"></tbody></table></div>`
document.querySelector('.main').prepend(enrollmentPanel)
$('new-enrollment').onclick = () => document.querySelector('[data-tab="admission"]').click()
const studentDirectory = document.createElement('div')
studentDirectory.className = 'card student-directory'
studentDirectory.innerHTML = '<div class="toolbar"><h2>Student Directory</h2><input id="student-directory-search" placeholder="Search student name or ID..."></div><table><thead><tr><th>Student ID</th><th>Name</th><th>Birth Date</th><th>Gender</th><th>Grade</th><th>Enrollment Status</th><th>Actions</th></tr></thead><tbody id="student-directory-table"></tbody></table>'
document.querySelector('#sectioning').appendChild(studentDirectory)
const sectionCard = document.querySelector('#sectioning > .card')
sectionCard.innerHTML = '<div class="toolbar"><h2>Sectioning</h2><button id="auto-assign-sections" class="btn secondary">Auto-Assign Grades 1-10</button><button id="open-placement" class="btn">Placement Tool</button></div><div class="filterbar"><input id="section-search" placeholder="Search Section Name..."><select id="section-grade-filter"><option value="">All Grades</option></select><button id="filter-sections" class="btn">Filter</button></div><table><thead><tr><th>Section Name</th><th>Grade</th><th>Students</th><th>Action</th></tr></thead><tbody id="section-table"></tbody></table>'

const tabs = [...document.querySelectorAll('[data-tab]')]
const panels = [...document.querySelectorAll('[data-panel]')]
tabs.forEach((tab) => tab.addEventListener('click', () => {
  tabs.forEach(t => t.classList.remove('active'))
  panels.forEach(p => p.classList.add('hidden'))
  tab.classList.add('active')
  $(tab.dataset.tab).classList.remove('hidden')
}))

function toast(message, type='success') {
  const el = $('toast'); el.textContent = message; el.className = `toast ${type}`; el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 3500)
}
function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])) }
function statusBadge(s) { return `<span class="badge ${String(s).toLowerCase().replaceAll(' ','-')}">${escapeHtml(s)}</span>` }
const photoPlaceholder = $('application-photo-preview')?.getAttribute('src') || ''
let photoObjectUrl = null
let removeSavedPhoto = false
function setApplicationPhoto(url) {
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl)
  photoObjectUrl = url?.startsWith('blob:') ? url : null
  $('application-photo-preview').src = url || photoPlaceholder
}
$('application-photo').addEventListener('change', event => {
  const file = event.target.files?.[0]
  if (!file) return // Cancelling the picker keeps the existing preview.
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
    event.target.value = ''; return toast('Choose a PNG/JPG/WEBP image up to 3MB.', 'error')
  }
  removeSavedPhoto = false
  setApplicationPhoto(URL.createObjectURL(file))
})
$('remove-application-photo').onclick = () => {
  $('application-photo').value = ''; removeSavedPhoto = true; setApplicationPhoto(null)
}
function clearApplicationForm() {
  $('application-form').reset(); $('application-id').value = ''
  removeSavedPhoto = false; setApplicationPhoto(null)
}
$('clear-application').onclick = clearApplicationForm
function bindViewStudentButtons(container) {
  container.querySelectorAll('[data-view-student]').forEach(button => button.onclick = () => openStudentDetails(button.dataset.viewStudent))
}
function validateApplication(form) {
  const data = Object.fromEntries(new FormData(form).entries())
  const errors = []
  if (!data.first_name?.trim() || !data.last_name?.trim()) errors.push('Student first and last name are required.')
  if (!/^\+?[0-9 ()-]{7,20}$/.test(data.guardian_phone || '')) errors.push('Enter a valid guardian phone number.')
  if (!/^\S+@\S+\.\S+$/.test(data.guardian_email || '')) errors.push('Enter a valid guardian email.')
  if (!data.birth_date) errors.push('Birth date is required.')
  if (!data.grade_level) errors.push('Grade level is required.')
  return { data, errors }
}

$('application-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const { data, errors } = validateApplication(e.target)
  if (errors.length) return toast(errors.join(' '), 'error')
  await saveApplication(data, 'submitted')
})
$('save-draft').addEventListener('click', async () => {
  const { data } = validateApplication($('application-form'))
  await saveApplication(data, 'draft')
})

async function saveApplication(data, status) {
  const payload = {
    first_name:data.first_name, middle_name:data.middle_name || null, last_name:data.last_name,
    birth_date:data.birth_date || null, sex:data.sex || null, address:data.address || null,
    guardian_name:data.guardian_name || null, guardian_relationship:data.guardian_relationship || null,
    guardian_phone:data.guardian_phone || null, guardian_email:data.guardian_email || null,
    prior_school:data.prior_school || null, prior_grade:data.prior_grade || null,
    grade_level:data.grade_level ? gradeToNumber(data.grade_level) : null, special_program:data.special_program || null,
    status,
    ...(removeSavedPhoto ? { profile_picture_url: null } : {})
  }
  const id = $('application-id').value || null
  const result = id
    ? await supabase.from('admission_applications').update(payload).eq('id', id).select().single()
    : await supabase.from('admission_applications').insert(payload).select().single()
  if (result.error) return toast(result.error.message, 'error')
  $('application-id').value = result.data.id
  await saveProfilePicture(result.data.id)
  if (status === 'submitted') {
    await uploadDocuments(result.data.id)
    toast('Application submitted successfully. The registrar can now review it.')
    $('application-form').reset(); $('application-id').value = ''; setApplicationPhoto(null)
  } else {
    toast('Draft saved. You can resume it later from the draft list.')
    if (!$('drafts-modal').classList.contains('hidden')) openDrafts()
  }
  loadApplications()
}

// The photo needs an application id for its storage path, so it uploads after the row is saved.
async function saveProfilePicture(applicationId) {
  const input = $('application-photo')
  const file = input?.files?.[0]
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
    toast('Profile picture: PNG/JPG/WEBP up to 3MB only. The application was saved without it.', 'error')
    return
  }
  const path = `applications/${applicationId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: uploadError } = await supabase.storage.from('profile-pictures').upload(path, file, { upsert: false })
  if (uploadError) return toast(`Profile picture upload failed: ${uploadError.message}`, 'error')
  const publicUrl = supabase.storage.from('profile-pictures').getPublicUrl(path).data.publicUrl
  const { error } = await supabase.from('admission_applications').update({ profile_picture_url: publicUrl }).eq('id', applicationId)
  if (error) toast(`Profile picture saved to storage, but it could not be linked to the application. Run database/migration-v3-registrar-ui.sql and try again (${error.message})`, 'error')
}

async function uploadDocuments(applicationId) {
  const files = [...document.querySelectorAll('#application-documents input[type=file]')]
  for (const input of files) {
    const file = input.files?.[0]; if (!file) continue
    const allowed = ['application/pdf','image/jpeg','image/png']
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) { toast(`${input.dataset.label}: PDF/JPG/PNG up to 5MB only.`, 'error'); continue }
    const path = `${applicationId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
    const { error: uploadError } = await supabase.storage.from('admission-documents').upload(path, file, { upsert:false })
    if (uploadError) { toast(`Document upload failed: ${uploadError.message}`, 'error'); continue }
    await supabase.from('application_documents').insert({ application_id: applicationId, document_type: input.dataset.type, file_path:path, original_name:file.name })
  }
}

$('refresh-applications').addEventListener('click', loadApplications)
async function loadApplications() {
  const { data, error } = await supabase.from('admission_applications').select('*').order('created_at',{ascending:false})
  if (error) return toast(error.message,'error')
  state.applications = data || []
  $('applications-table').innerHTML = state.applications.map(a => `<tr>
    <td>${escapeHtml(`${a.first_name} ${a.last_name}`)}</td><td>${escapeHtml(gradeLabel(a.grade_level))}</td><td>${statusBadge(a.status)}</td>
    <td>${new Date(a.created_at).toLocaleDateString()}</td><td>${a.status === 'draft' ? `<button class="small btn-approve" data-resume="${a.id}">Resume</button>` : `<button class="small btn-review" data-review="${a.id}">Review</button>`}</td></tr>`).join('') || '<tr><td colspan="5">No applications found.</td></tr>'
  document.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => openReview(b.dataset.review)))
  document.querySelectorAll('[data-resume]').forEach(b => b.addEventListener('click', () => resumeApplication(b.dataset.resume)))
}

function resumeApplication(id) {
  const application = state.applications.find(item => String(item.id) === String(id))
  if (!application) return toast('That draft could not be found. Refresh the draft list and try again.', 'error')
  const form = $('application-form')
  clearApplicationForm()
  $('application-id').value = application.id
  Object.entries(application).forEach(([key, value]) => {
    if (key === 'grade_level') return
    const field = form.elements.namedItem(key)
    if (field && value != null) field.value = value
  })
  // Grade is stored as a number, the select options are labels like "Grade 1".
  form.elements.namedItem('grade_level').value = gradeSelectLabel(application.grade_level)
  setApplicationPhoto(application.profile_picture_url || null)
  $('drafts-modal').classList.add('hidden')
  document.querySelector('[data-tab="admission"]').click()
  toast('Draft loaded. Continue editing and submit when ready.')
}

async function openDrafts() {
  $('drafts-modal').classList.remove('hidden')
  $('drafts-list').innerHTML = '<p>Loading drafts…</p>'
  const { data, error } = await supabase.from('admission_applications').select('*').eq('status', 'draft').order('updated_at', { ascending: false })
  if (error) return $('drafts-list').innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`
  state.drafts = data || []
  state.applications = [...state.drafts, ...state.applications.filter(application => !state.drafts.some(draft => draft.id === application.id))]
  $('drafts-list').innerHTML = state.drafts.length
    ? `<table><thead><tr><th>Name</th><th>Grade</th><th>Last Saved</th><th>Actions</th></tr></thead><tbody>${state.drafts.map(draft => `<tr><td>${escapeHtml(`${draft.first_name || ''} ${draft.last_name || ''}`.trim())}</td><td>${escapeHtml(draft.grade_level == null ? '-' : gradeLabel(draft.grade_level))}</td><td>${draft.updated_at ? new Date(draft.updated_at).toLocaleString() : '-'}</td><td><button class="small btn-approve" data-draft-resume="${draft.id}">Resume</button> <button class="small btn-remove" data-draft-delete="${draft.id}">Delete</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="empty-state">No drafts saved.</p>'
  $('drafts-list').querySelectorAll('[data-draft-resume]').forEach(button => button.onclick = () => resumeApplication(button.dataset.draftResume))
  $('drafts-list').querySelectorAll('[data-draft-delete]').forEach(button => button.onclick = () => deleteDraft(button.dataset.draftDelete))
}

async function deleteDraft(id) {
  const { error } = await supabase.from('admission_applications').delete().eq('id', id).eq('status', 'draft')
  if (error) return toast(error.message, 'error')
  toast('Draft deleted.')
  if ($('application-id').value === id) { $('application-form').reset(); $('application-id').value = ''; setApplicationPhoto(null) }
  openDrafts()
  loadApplications()
}
$('open-drafts').addEventListener('click', openDrafts)
$('close-drafts').addEventListener('click', () => $('drafts-modal').classList.add('hidden'))
$('close-student').addEventListener('click', () => $('student-modal').classList.add('hidden'))
$('close-section-students').addEventListener('click', () => $('section-students-modal').classList.add('hidden'))

async function openStudentDetails(studentId) {
  const cached = state.students.find(item => String(item.student_id) === String(studentId))
  $('student-modal-title').textContent = cached ? `${cached.first_name || ''} ${cached.last_name || ''}`.trim() || 'Student Details' : 'Student Details'
  $('student-details').innerHTML = '<p>Loading student details…</p>'
  $('student-modal').classList.remove('hidden')
  const detailResult = cached ? { data: cached } : await supabase.from('students').select('*').eq('student_id', studentId).single()
  const student = detailResult.data
  if (!student) return $('student-details').innerHTML = '<p class="empty-state">Student record not found.</p>'
  const [enrollments, academics] = await Promise.all([
    supabase.from('enrollments').select('school_year,status,enrolled_at,sections(section_name)').eq('student_id', studentId).order('enrolled_at', { ascending: false }),
    supabase.from('academic_history').select('school_year,subject,grade,remarks').eq('student_id', studentId).order('school_year', { ascending: false })
  ])
  const enrollmentRows = enrollments.data || []
  const academicRows = academics.data || []
  const active = enrollmentRows.find(row => row.status === 'active')
  const photo = student.profile_picture_url
    ? `<img class="photo-preview" src="${escapeHtml(student.profile_picture_url)}" alt="Profile picture">`
    : '<div class="photo-preview photo-preview-empty" aria-hidden="true">No photo</div>'
  $('student-details').innerHTML = `<div class="student-profile">${photo}<div class="review-grid">
      <div><b>Student No.</b><p>${escapeHtml(student.lrn_number || student.student_id)}</p></div>
      <div><b>Grade Level</b><p>${escapeHtml(student.grade_level == null ? '-' : gradeLabel(student.grade_level))}</p></div>
      <div><b>Birth Date</b><p>${escapeHtml(student.date_of_birth || student.birth_date || '-')}</p></div>
      <div><b>Sex</b><p>${escapeHtml(student.gender || student.sex || '-')}</p></div>
      <div><b>Enrollment Status</b><p>${statusBadge(student.enrollment_status || 'Enrolled')}</p></div>
      <div><b>Section</b><p>${escapeHtml(active?.sections?.section_name || 'No Section')}</p></div>
      <div><b>School Year</b><p>${escapeHtml(active?.school_year || '-')}</p></div>
      <div><b>Contact Number</b><p>${escapeHtml(student.contact_number || '-')}</p></div>
      <div><b>Address</b><p>${escapeHtml(student.address || '-')}</p></div>
    </div></div>
    <h3>Enrollment History</h3>
    <table><thead><tr><th>School Year</th><th>Section</th><th>Status</th><th>Enrolled On</th></tr></thead><tbody>${enrollmentRows.map(row => `<tr><td>${escapeHtml(row.school_year || '-')}</td><td>${escapeHtml(row.sections?.section_name || 'No Section')}</td><td>${statusBadge(row.status || 'active')}</td><td>${row.enrolled_at ? new Date(row.enrolled_at).toLocaleDateString() : '-'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">No enrollment records.</td></tr>'}</tbody></table>
    <h3>Academic History</h3>
    <table><thead><tr><th>School Year</th><th>Subject</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>${academicRows.map(row => `<tr><td>${escapeHtml(row.school_year || '')}</td><td>${escapeHtml(row.subject || '')}</td><td>${row.grade ?? ''}</td><td>${escapeHtml(row.remarks || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">No academic records.</td></tr>'}</tbody></table>`
}


// Opens the application with a database-held edit lock so the administrator cannot
// approve or decline it while the registrar is correcting it.
async function openReview(id) {
  const { data, error } = await supabase.rpc('begin_application_edit', { p_application_id: Number(id) })
  if (error) return toast(error.message, 'error')
  state.selectedApplication = data
  const field = (label, name, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(data[name] ?? '')}"></label>`
  $('review-content').innerHTML = `<div class="note">Editing as <b>${escapeHtml(data.editing_by || 'registrar')}</b>. The administrator cannot approve or decline this file while it is open here. Closing the form releases it.</div>
  <form id="review-form">${field('First Name','first_name')}${field('Middle Name','middle_name')}${field('Last Name','last_name')}${field('Birth Date','birth_date','date')}${field('Sex','sex')}${field('Grade Level','grade_level')}${field('Address','address')}${field('Guardian Name','guardian_name')}${field('Relationship','guardian_relationship')}${field('Guardian Phone','guardian_phone')}${field('Guardian Email','guardian_email')}${field('Prior School','prior_school')}${field('Prior Grade','prior_grade')}${field('Special Program','special_program')}<label>Registrar remarks<textarea name="remarks">${escapeHtml(data.remarks || '')}</textarea></label><label>Status<select name="status"><option>under_review</option><option>approved</option><option>rejected</option></select></label><div class="actions"><button class="btn-approve">Save Review</button></div></form>`
  $('review-content').querySelector('[name=status]').value = data.status === 'submitted' ? 'under_review' : data.status
  $('review-modal').classList.remove('hidden')
}
$('close-review').addEventListener('click', async () => {
  const app = state.selectedApplication
  $('review-modal').classList.add('hidden')
  if (app?.editing_token) await supabase.rpc('end_application_edit', { p_application_id: app.id, p_token: app.editing_token })
  state.selectedApplication = null
})
async function saveReviewEdits() {
  const payload = Object.fromEntries(new FormData($('review-form')).entries())
  const { error } = await supabase.rpc('save_application_edit', { p_application_id: state.selectedApplication.id, p_token: state.selectedApplication.editing_token, p_payload: payload })
  if (error) return toast(error.message, 'error')
  $('review-modal').classList.add('hidden')
  state.selectedApplication = null
  toast('Application updated.'); loadApplications()
}
$('review-content').addEventListener('submit', e => {
  e.preventDefault()
  withBusy(e.target.querySelector('button'), 'Saving…', saveReviewEdits)
})

async function loadSections() {
  const { data, error } = await supabase.from('sections').select('section_id,section_name,grade_level,capacity').order('grade_level').order('section_name')
  if (error) return toast(error.message,'error'); state.sections = data || []
  const { data: enrollmentRows } = await supabase.from('enrollments').select('section_id').eq('status','active')
  const counts = (enrollmentRows || []).reduce((result, row) => { result[row.section_id] = (result[row.section_id] || 0) + 1; return result }, {})
  const sectionSearch = ($('section-search')?.value || '').trim().toLowerCase()
  const sectionGrade = $('section-grade-filter')?.value || ''
  const visibleSections = state.sections.filter(section => (!sectionGrade || String(section.grade_level) === sectionGrade) && (!sectionSearch || section.section_name.toLowerCase().includes(sectionSearch)))
  $('section-table').innerHTML = visibleSections.map(s => `<tr><td>${escapeHtml(s.section_name)}</td><td>${escapeHtml(gradeLabel(s.grade_level))}</td><td>${counts[s.section_id] || 0}</td><td><button class="small btn-view" data-view-section="${s.section_id}">View Students</button></td></tr>`).join('') || '<tr><td colspan="4">No sections configured.</td></tr>'
  document.querySelectorAll('[data-place]').forEach(b => b.onclick=()=>openPlacement(Number(b.dataset.place)))
  document.querySelectorAll('[data-view-section]').forEach(b => b.onclick=()=>viewSectionStudents(Number(b.dataset.viewSection)))
  const grades=[...new Set(state.sections.map(s=>s.grade_level))]; $('placement-grade').innerHTML=grades.map(g=>`<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join(''); $('section-grade-filter').innerHTML='<option value="">All Grades</option>'+grades.map(g=>`<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join('')
  $('enrollment-section-filter').innerHTML = '<option value="">All Sections</option>' + state.sections.map(s=>`<option value="${s.section_id}">${escapeHtml(s.section_name)}</option>`).join('')
}
document.querySelector('#filter-sections').onclick = loadSections
document.querySelector('#section-search').onkeydown = event => { if (event.key === 'Enter') loadSections() }
async function viewSectionStudents(sectionId) {
  const section = state.sections.find(item => Number(item.section_id) === sectionId)
  if (!section) return
  $('section-students-title').textContent = `${section.section_name} — Students`
  $('section-students-body').innerHTML = '<p>Loading section students…</p>'
  $('section-students-modal').classList.remove('hidden')
  const { data, error } = await supabase.from('enrollments').select('student_id,students(lrn_number,first_name,last_name,grade_level,enrollment_status)').eq('section_id', sectionId).eq('status', 'active')
  if (error) return $('section-students-body').innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`
  const rows = data || []
  $('section-students-body').innerHTML = `<table><thead><tr><th>Student ID</th><th>Name</th><th>Grade</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(row => { const student = row.students || {}; return `<tr><td>${escapeHtml(student.lrn_number || row.student_id)}</td><td>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`)}</td><td>${escapeHtml(student.grade_level == null ? '-' : gradeLabel(student.grade_level))}</td><td>${statusBadge(student.enrollment_status || 'Enrolled')}</td><td><button class="small btn-view" data-view-student="${row.student_id}">View</button></td></tr>` }).join('') || '<tr><td colspan="5" class="empty-state">No active students in this section.</td></tr>'}</tbody></table>`
  bindViewStudentButtons($('section-students-body'))
}
async function loadEnrollments() {
  const [studentResult, enrollmentResult] = await Promise.all([
    supabase.from('students').select('*').order('last_name'),
    supabase.from('enrollments').select('id,student_id,school_year,enrolled_at,status,section_id,sections(section_name)').eq('status', 'active').order('school_year', { ascending: false })
  ])
  if (studentResult.error || enrollmentResult.error) return toast((studentResult.error || enrollmentResult.error).message, 'error')
  const data = (studentResult.data || []).map(student => ({
    ...(enrollmentResult.data || []).find(row => String(row.student_id) === String(student.student_id)),
    student_id: student.student_id, students: student
  }))
  const search = $('enrollment-search').value.trim().toLowerCase()
  const section = $('enrollment-section-filter').value
  const rows = (data || []).filter(row => {
    const student = row.students || {}
    return (!section || String(row.section_id) === section) && (!search || `${student.lrn_number} ${student.first_name} ${student.last_name}`.toLowerCase().includes(search))
  })
  $('enrollment-table').innerHTML = rows.map(row => { const student = row.students || {}; return `<tr><td>${escapeHtml(student.lrn_number || row.student_id)}</td><td>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`)}</td><td>${escapeHtml(row.school_year || '')}</td><td>${row.enrolled_at ? new Date(row.enrolled_at).toLocaleDateString() : '-'}</td><td>${escapeHtml(row.sections?.section_name || 'No Section')}</td><td>${statusBadge(row.status || 'Not Enrolled')}</td><td><button class="small btn-view" data-view-student="${row.student_id}">View</button> ${row.id ? `<button class="small btn-remove" data-remove-enrollment="${row.id}">Remove</button>` : ''}</td></tr>` }).join('') || '<tr><td colspan="7" class="empty-state">No enrollment records found.</td></tr>'
  bindViewStudentButtons($('enrollment-table'))
  document.querySelectorAll('[data-remove-enrollment]').forEach(button => button.onclick = () => confirmRemoveEnrollment(button.dataset.removeEnrollment, rows.find(row => String(row.id) === button.dataset.removeEnrollment)))
}
let removeEnrollmentCountdown = null
function confirmRemoveEnrollment(id, row) {
  const student = row?.students || {}
  $('remove-enrollment-details').innerHTML = `You are about to remove <b>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`.trim() || row?.student_id || '')}</b> from <b>${escapeHtml(row?.sections?.section_name || 'their section')}</b>.`
  const confirmBtn = $('confirm-remove-enrollment')
  const countdownEl = $('remove-enrollment-countdown')
  const secondsEl = $('remove-enrollment-seconds')
  confirmBtn.disabled = true
  countdownEl.classList.remove('hidden')
  let secondsLeft = 3
  secondsEl.textContent = secondsLeft
  clearInterval(removeEnrollmentCountdown)
  removeEnrollmentCountdown = setInterval(() => {
    secondsLeft -= 1
    if (secondsLeft <= 0) {
      clearInterval(removeEnrollmentCountdown)
      countdownEl.classList.add('hidden')
      confirmBtn.disabled = false
      return
    }
    secondsEl.textContent = secondsLeft
  }, 1000)
  $('remove-enrollment-modal').classList.remove('hidden')
  confirmBtn.onclick = () => withBusy(confirmBtn, 'Removing…', () => removeEnrollment(id))
}
function closeRemoveEnrollmentModal() {
  clearInterval(removeEnrollmentCountdown)
  $('remove-enrollment-modal').classList.add('hidden')
}
$('close-remove-enrollment').addEventListener('click', closeRemoveEnrollmentModal)
$('cancel-remove-enrollment').addEventListener('click', closeRemoveEnrollmentModal)
async function removeEnrollment(id) {
  const { error } = await supabase.from('enrollments').update({ status: 'inactive' }).eq('id', id)
  if (error) return toast(error.message, 'error')
  closeRemoveEnrollmentModal()
  toast('Enrollment removed.'); loadEnrollments()
}
$('filter-enrollment').onclick = loadEnrollments
async function openPlacement(sectionId='') {
  const { data, error } = await supabase.from('students').select('*').order('last_name')
  if (error) return toast(`Could not load placement students: ${error.message}`,'error'); state.students=data||[]
  if (!state.students.length) return toast('No students are available for placement. Check the students table and RLS policy.', 'error')
  const grades=[...new Set(state.sections.map(s=>s.grade_level))].sort((a,b)=>a-b)
  $('placement-grade').innerHTML=grades.map(g=>`<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join('')
  renderPlacementStudents()
  if(sectionId) $('placement-section').value=sectionId
  $('placement-modal').classList.remove('hidden')
}
function renderPlacementStudents() {
  const grade = $('placement-grade').value
  const sections = state.sections.filter(s => Number(s.grade_level) === Number(grade)).sort((a,b)=>String(a.section_name).localeCompare(String(b.section_name)))
  $('placement-section').innerHTML = sections.map(s=>`<option value="${s.section_id}">${escapeHtml(s.section_name)} (${s.enrolled ?? 0}/${s.capacity})</option>`).join('')
  const sectionId = Number($('placement-section').value) || null
  $('placement-students').innerHTML = state.students
    .filter(s => Number(s.grade_level) === Number(grade))
    .map(s => `<label><input type="checkbox" value="${s.student_id}"> ${escapeHtml(s.lrn_number || s.student_id)} — ${escapeHtml(`${s.first_name} ${s.last_name}`)}</label>`)
    .join('') || '<small>No students in this grade.</small>'
}
$('placement-grade').addEventListener('change', renderPlacementStudents)
$('placement-section').addEventListener('change', renderPlacementStudents)
$('open-placement').onclick=()=>openPlacement()
$('close-placement').onclick=()=>$('placement-modal').classList.add('hidden')
$('place-selected').onclick=async()=>{
  const sectionId=$('placement-section').value
  const studentIds=[...$('placement-students').querySelectorAll('input:checked')].map(i=>Number(i.value))
  if(!sectionId||!studentIds.length)return toast('Select a section and at least one student.','error')
  withBusy($('place-selected'),'Placing…',async()=>{
    const { data, error }=await supabase.rpc('apply_section_assignments',{p_assignments:studentIds.map(id=>({student_id:id,section_id:Number(sectionId)}))})
    if(error)return toast(error.message,'error')
    $('placement-modal').classList.add('hidden')
    toast(`Placed ${data?.placed??studentIds.length} student(s).`); await Promise.all([loadSections(), loadEnrollments()])
  })
}
// Auto-assign grades 1-10: balanced, randomized allocator, then one validated write.
$('auto-assign-sections').onclick=()=>{
  if(!state.students.length||!state.sections.length)return toast('Load students and sections first.','error')
  const enrolledByStudent=new Map(state.enrollments.filter(e=>e.id).map(e=>[e.student_id,e.section_id]))
  const plan=planBalancedAssignments({students:state.students,sections:state.sections.map(s=>({...s,enrolled:[...enrolledByStudent.values()].filter(v=>v===s.section_id).length})),enrolledByStudent})
  $('auto-assign-summary').innerHTML=`<p><b>${plan.assignments.length}</b> student(s) will be placed across grades 1-10; <b>${plan.unplaced.length}</b> cannot be placed.</p>`+(plan.summary.filter(s=>s.total).map(s=>`<small>${escapeHtml(s.section_name)} — ${s.boys} boy(s), ${s.girls} girl(s)</small>`).join('<br>')||'')+(plan.unplaced.length?`<br><small class="empty-state">Unplaced: ${plan.unplaced.map(u=>u.student_id).join(', ')}</small>`:'')
  $('auto-assign-count').textContent=String(plan.assignments.length)
  $('auto-assign-count').dataset.assignments=JSON.stringify(plan.assignments)
  $('auto-assign-modal').classList.remove('hidden')
}
$('close-auto-assign').onclick=()=>$('auto-assign-modal').classList.add('hidden')
$('confirm-auto-assign').onclick=()=>{
  withBusy($('confirm-auto-assign'),'Assigning…',async()=>{
    const { data, error }=await supabase.rpc('apply_section_assignments',{p_assignments:JSON.parse($('auto-assign-count').dataset.assignments||'[]')})
    if(error)return toast(error.message,'error')
    $('auto-assign-modal').classList.add('hidden')
    toast(`Auto-assigned ${data?.placed??0} student(s).`); await Promise.all([loadSections(), loadEnrollments()])
  })
}

const promotionExclusions = document.createElement('div')
promotionExclusions.className = 'card'
promotionExclusions.innerHTML = '<label>Exclude Students</label><input id="promotion-exclude-search" placeholder="Search student name or ID..."><div id="promotion-exclude-list" class="exclude-list"></div>'
document.querySelector('#promotion').appendChild(promotionExclusions)
function renderPromotionExclusions() {
  const search = $('promotion-exclude-search').value.trim().toLowerCase()
  const grade = gradeToNumber($('promotion-grade').value)
  const students = state.students.filter(student => Number(student.grade_level) === grade && `${student.lrn_number} ${student.first_name} ${student.last_name}`.toLowerCase().includes(search))
  $('promotion-exclude-list').innerHTML = students.map(student => `<label><input type="checkbox" value="${student.student_id}"> ${escapeHtml(student.lrn_number || student.student_id)} — ${escapeHtml(`${student.first_name} ${student.last_name}`)}</label>`).join('') || '<small>No matching students.</small>'
}
$('promotion-exclude-search').oninput = renderPromotionExclusions
$('promotion-grade').onchange = renderPromotionExclusions

$('academic-form').addEventListener('submit', async e=>{
  e.preventDefault(); const d=Object.fromEntries(new FormData(e.target).entries());
  const {error}=await supabase.from('academic_history').insert(d); if(error)return toast(error.message,'error'); toast('Academic record saved.'); e.target.reset(); loadAcademic()
})
$('import-csv').addEventListener('change', async e=>{
  const file=e.target.files?.[0]; if(!file)return
  const rows=(await file.text()).trim().split(/\r?\n/).map(r=>r.split(',').map(x=>x.trim().replace(/^"|"$/g,''))); const headers=rows.shift()
  const records=rows.filter(r=>r.length>=headers.length).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))
  const {error}=await supabase.from('academic_history').insert(records); if(error)return toast(error.message,'error'); toast(`${records.length} academic records imported.`); loadAcademic()
})
async function loadAcademic(){const {data,error}=await supabase.from('academic_history').select('*').order('school_year',{ascending:false}).limit(100);if(error)return toast(error.message,'error');state.academic=data||[];const studentsById=Object.fromEntries(state.students.map(s=>[s.student_id,s]));$('academic-table').innerHTML=state.academic.map(r=>{const s=studentsById[r.student_id]||{};return `<tr><td>${escapeHtml(s.lrn_number||'')}</td><td>${escapeHtml(`${s.first_name||''} ${s.last_name||''}`)}</td><td>${escapeHtml(r.school_year)}</td><td>${escapeHtml(r.subject)}</td><td>${r.grade ?? ''}</td><td>${escapeHtml(r.remarks||'')}</td></tr>`}).join('')||'<tr><td colspan="6">No records found.</td></tr>'}

$('transcript-form').addEventListener('submit', async e=>{e.preventDefault();const studentId=$('transcript-student').value;if(!studentId)return;await generateTranscript(studentId)})
async function loadStudents(){const {data,error}=await supabase.from('students').select('*').order('last_name');if(error)return toast(`Could not load students: ${error.message}`,'error');state.students=data||[];const html=state.students.map(s=>`<option value="${s.student_id}">${escapeHtml(s.lrn_number||s.student_id)} — ${escapeHtml(s.first_name||'')} ${escapeHtml(s.last_name||'')}</option>`).join('');$('academic-student').innerHTML=html;$('transcript-student').innerHTML=html;$('shift-student').innerHTML=html;renderStudentDirectory()}
function renderStudentDirectory(){const search=($('student-directory-search')?.value||'').trim().toLowerCase();const rows=state.students.filter(s=>`${s.lrn_number} ${s.student_id} ${s.first_name||''} ${s.last_name||''}`.toLowerCase().includes(search));$('student-directory-table').innerHTML=rows.map(s=>`<tr><td>${escapeHtml(s.lrn_number||s.student_id)}</td><td>${escapeHtml(`${s.first_name||''} ${s.last_name||''}`)}</td><td>${escapeHtml(s.date_of_birth||s.birth_date||'-')}</td><td>${escapeHtml(s.gender||s.sex||'-')}</td><td>${escapeHtml(s.grade_level == null ? '-' : gradeLabel(s.grade_level))}</td><td>${statusBadge(s.enrollment_status||'Enrolled')}</td><td><button class="small btn-view" data-view-student="${s.student_id}">View</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty-state">No students found.</td></tr>';bindViewStudentButtons($('student-directory-table'))}
$('student-directory-search').oninput=renderStudentDirectory
async function generateTranscript(studentId){const {data:s,error:se}=await supabase.from('students').select('*').eq('student_id',studentId).single();if(se)return toast(se.message,'error');const {data:g,error:ge}=await supabase.from('academic_history').select('*').eq('student_id',studentId).order('school_year');if(ge)return toast(ge.message,'error');const win=window.open('','_blank');if(!win)return toast('Allow pop-ups to generate the transcript.','error');win.document.write(`<html><head><title>Official Transcript - ${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</title><style>body{font-family:Arial;padding:40px}header{text-align:center;border-bottom:2px solid #111;padding-bottom:15px}.student{margin:25px 0}.student span{display:inline-block;width:48%}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #333;padding:8px;text-align:left}.sign{display:flex;justify-content:space-between;margin-top:80px}.sign div{width:40%;border-top:1px solid #111;text-align:center;padding-top:6px}@media print{button{display:none}}</style></head><body><header><h1>THOMPSON CHRISTIAN SCHOOL</h1><p>OFFICIAL TRANSCRIPT OF RECORDS</p></header><div class="student"><span><b>Student No:</b> ${escapeHtml(s.lrn_number||'')}</span><span><b>Name:</b> ${escapeHtml(`${s.first_name} ${s.last_name}`)}</span><span><b>Grade Level:</b> ${escapeHtml(gradeLabel(s.grade_level))}</span></div><table><thead><tr><th>School Year</th><th>Subject</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>${g.map(r=>`<tr><td>${escapeHtml(r.school_year)}</td><td>${escapeHtml(r.subject)}</td><td>${r.grade??''}</td><td>${escapeHtml(r.remarks||'')}</td></tr>`).join('')}</tbody></table><div class="sign"><div>Registrar</div><div>School Seal / Signature</div></div><button onclick="window.print()">Print / Save as PDF</button></body></html>`);win.document.close();win.focus()}

 $('promotion-form').addEventListener('submit',async e=>{e.preventDefault();const grade=gradeToNumber($('promotion-grade').value);const excluded=[...document.querySelectorAll('#promotion-exclude-list input:checked')].map(input=>Number(input.value));const {data,error}=await supabase.rpc('batch_promote_students',{p_grade_level:grade,p_school_year:$('promotion-year').value,p_excluded_student_ids:excluded});if(error)return toast(error.message,'error');toast(`${data?.processed||0} students processed; ${data?.promoted||0} promoted.`);await Promise.all([loadStudents(), loadEnrollments()]); renderPromotionExclusions()})
async function refreshShiftSections() {
  const select = $('shift-section')
  const studentId = $('shift-student').value
  if (!studentId) { select.innerHTML = '<option value="">No student selected</option>'; return }
  const student = state.students.find(item => String(item.student_id) === String(studentId))
  const { data, error } = await supabase.from('enrollments').select('section_id').eq('student_id', studentId).eq('status', 'active')
  if (error) return toast(`Could not load the current section: ${error.message}`, 'error')
  const currentSections = new Set((data || []).map(row => row.section_id))
  const candidates = state.sections.filter(section => Number(section.grade_level) === Number(student?.grade_level) && !currentSections.has(section.section_id))
  select.innerHTML = candidates.length
    ? candidates.map(section => `<option value="${section.section_id}">${escapeHtml(section.section_name)} — ${escapeHtml(gradeLabel(section.grade_level))} (capacity ${section.capacity})</option>`).join('')
    : '<option value="">No other section for this grade level</option>'
}
$('shift-student').onchange = refreshShiftSections
$('shift-mode').onchange = () => {
  const transferring = $('shift-mode').value === 'transfer'
  $('shift-section-field').classList.toggle('hidden', transferring)
  $('shift-form').querySelector('button.btn').textContent = transferring ? 'Process Transfer' : 'Process Shift'
}

$('shift-form').addEventListener('submit', async e => {
  e.preventDefault()
  const studentId = Number($('shift-student').value)
  const reason = $('shift-reason').value.trim()
  if (!studentId) return toast('Select a student first.', 'error')
  if (!reason) return toast('Enter a reason for this action.', 'error')
  if ($('shift-mode').value === 'transfer') return confirmTransferOut(studentId, reason)
  const targetSectionId = Number($('shift-section').value)
  if (!targetSectionId) return toast('Select an eligible target section first.', 'error')
  await withBusy(e.target.querySelector('button.btn'), 'Processing…', async () => {
    const { error } = await supabase.rpc('shift_student', { p_student_id: studentId, p_target_section_id: targetSectionId, p_reason: reason })
    if (error) return toast(error.message, 'error')
    toast('Student shift completed successfully.')
    $('shift-reason').value = ''
    await Promise.all([loadSections(), loadEnrollments()])
    await refreshShiftSections()
  })
})

let transferCountdown = null
function confirmTransferOut(studentId, reason) {
  const student = state.students.find(item => String(item.student_id) === String(studentId))
  $('transfer-details').innerHTML = `You are about to transfer <b>${escapeHtml(`${student?.first_name || ''} ${student?.last_name || ''}`.trim() || studentId)}</b> out of school. Active enrollments will be closed and the student status set to <b>Transferred</b>.`
  const confirmBtn = $('confirm-transfer')
  confirmBtn.disabled = true
  $('transfer-countdown').classList.remove('hidden')
  let secondsLeft = 3
  $('transfer-seconds').textContent = secondsLeft
  clearInterval(transferCountdown)
  transferCountdown = setInterval(() => {
    secondsLeft -= 1
    if (secondsLeft <= 0) {
      clearInterval(transferCountdown)
      $('transfer-countdown').classList.add('hidden')
      confirmBtn.disabled = false
      return
    }
    $('transfer-seconds').textContent = secondsLeft
  }, 1000)
  confirmBtn.onclick = () => withBusy(confirmBtn, 'Transferring…', () => transferStudentOut(studentId, reason))
  $('transfer-modal').classList.remove('hidden')
}
function closeTransferModal() { clearInterval(transferCountdown); $('transfer-modal').classList.add('hidden') }
$('close-transfer').addEventListener('click', closeTransferModal)
$('cancel-transfer').addEventListener('click', closeTransferModal)
async function transferStudentOut(studentId, reason) {
  const { data, error } = await supabase.rpc('transfer_student_out', { p_student_id: studentId, p_reason: reason })
  if (error) {
    if (error.code === 'PGRST202') return toast('Transfer needs database/migration-v3-registrar-ui.sql applied first (transfer_student_out is missing).', 'error')
    // The database runs both updates in one transaction, so a rejection changes nothing.
    return toast(`Transfer was rolled back, nothing changed: ${error.message}`, 'error')
  }
  closeTransferModal()
  toast(`Student transferred out. ${data?.closed_enrollments ?? 0} active enrollment(s) closed. Reason: ${reason}`)
  $('shift-reason').value = ''
  await Promise.all([loadStudents(), loadSections(), loadEnrollments()])
  await refreshShiftSections()
}

$('feedback-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const {error}=await supabase.from('registrar_feedback').insert({...d,submitted_by:user.username});if(error)return toast(error.message,'error');toast('Feedback logged.');e.target.reset()})

async function init(){
  const results = await Promise.allSettled([loadApplications(), loadSections(), loadStudents(), loadEnrollments()])
  results.filter(result => result.status === 'rejected').forEach(result => toast(`Some records could not be loaded: ${result.reason?.message || result.reason}`, 'error'))
  await loadAcademic()
  renderPromotionExclusions()
  await refreshShiftSections()
}
init()
