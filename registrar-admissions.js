import { supabase } from './auth-client.js'
import { toast } from './ui-theme.js'
import { withBusy } from './shell.js'
import { $, state } from './registrar-state.js'
import { escapeHtml, formatDate, gradeLabel, gradeToNumber } from './html.js'
import { attendanceSummaryLine } from './attendance.js'
import { generalAverage, letterGrade } from './grades.js'

// Grade is stored as a number but the select options are labels, so map back on resume.
const gradeSelectLabel = (value) => value == null || value === '' ? '' : (Number.isFinite(Number(value)) ? gradeLabel(Number(value)) : String(value))

export function statusBadge(s) { return `<span class="badge ${String(s).toLowerCase().replaceAll(' ','-')}">${escapeHtml(s)}</span>` }
const photoPlaceholder = $('application-photo-preview')?.getAttribute('src') || ''
if ($('application-photo')) {
  $('application-photo').setAttribute('capture', 'user')
  $('application-photo').closest('label')?.querySelector('small')?.replaceChildren('Optional — choose a file or use the device camera')
}

let cameraStream = null
let cameraModal = null
function stopCamera() {
  cameraStream?.getTracks().forEach(track => track.stop())
  cameraStream = null
  cameraModal?.classList.add('hidden')
}
function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Camera capture is not supported by this browser.', 'error')
  if (!cameraModal) {
    cameraModal = document.createElement('div')
    cameraModal.id = 'profile-camera-modal'
    cameraModal.className = 'admin-modal hidden'
    cameraModal.innerHTML = '<div class="admin-modal-box camera-box"><div class="admin-modal-head"><h3>Capture Profile Picture</h3><button type="button" id="close-profile-camera">x</button></div><video id="profile-camera-video" autoplay playsinline></video><div class="admin-actions"><button type="button" id="cancel-profile-camera" class="admin-cancel">Cancel</button><button type="button" id="capture-profile-camera" class="admin-primary">Capture Photo</button></div></div>'
    document.body.appendChild(cameraModal)
    cameraModal.querySelector('#close-profile-camera').onclick = stopCamera
    cameraModal.querySelector('#cancel-profile-camera').onclick = stopCamera
    cameraModal.querySelector('#capture-profile-camera').onclick = () => {
      const video = cameraModal.querySelector('#profile-camera-video')
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      canvas.toBlob(blob => {
        if (!blob) return toast('Could not capture the camera image.', 'error')
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
        const transfer = new DataTransfer()
        transfer.items.add(file)
        $('application-photo').files = transfer.files
        removeSavedPhoto = false
        setApplicationPhoto(URL.createObjectURL(file))
        stopCamera()
      }, 'image/jpeg', 0.9)
    }
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(stream => {
    cameraStream = stream
    cameraModal.querySelector('#profile-camera-video').srcObject = stream
    cameraModal.classList.remove('hidden')
  }).catch(error => toast(`Camera could not be opened: ${error.message}`, 'error'))
}
if ($('application-photo')) {
  const cameraButton = document.createElement('button')
  cameraButton.type = 'button'
  cameraButton.className = 'btn secondary'
  cameraButton.textContent = 'Use Camera'
  cameraButton.onclick = openCamera
  $('application-photo').after(cameraButton)
}
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
export function bindViewStudentButtons(container) {
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
  if (error) toast(`Profile picture saved to storage, but it could not be linked to the application. Run database/backupsqlmigration.sql and try again (${error.message})`, 'error')
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

export async function loadApplications() {
  const { data, error } = await supabase.from('admission_applications').select('*').order('created_at',{ascending:false})
  if (error) return toast(error.message,'error')
  state.applications = data || []
  $('applications-table').innerHTML = state.applications.map(a => `<tr>
    <td>${escapeHtml(`${a.first_name} ${a.last_name}`)}</td><td>${escapeHtml(gradeLabel(a.grade_level))}</td><td>${statusBadge(a.status)}</td>
    <td>${formatDate(a.created_at)}</td><td>${a.status === 'draft' ? `<button class="admin-approve" data-resume="${a.id}">Resume</button>` : `<button class="admin-view" data-review="${a.id}">Review</button>`}</td></tr>`).join('') || '<tr><td colspan="5">No applications found.</td></tr>'
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
    ? `<table><thead><tr><th>Name</th><th>Grade</th><th>Last Saved</th><th>Actions</th></tr></thead><tbody>${state.drafts.map(draft => `<tr><td>${escapeHtml(`${draft.first_name || ''} ${draft.last_name || ''}`.trim())}</td><td>${escapeHtml(draft.grade_level == null ? '-' : gradeLabel(draft.grade_level))}</td><td>${draft.updated_at ? formatDate(draft.updated_at, true) : '-'}</td><td><button class="admin-approve" data-draft-resume="${draft.id}">Resume</button> <button class="admin-remove" data-draft-delete="${draft.id}">Delete</button></td></tr>`).join('')}</tbody></table>`
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

export async function openStudentDetails(studentId) {
  const cached = state.students.find(item => String(item.student_id) === String(studentId))
  $('student-modal-title').textContent = cached ? `${cached.first_name || ''} ${cached.last_name || ''}`.trim() || 'Student Details' : 'Student Details'
  $('student-details').innerHTML = '<p>Loading student details…</p>'
  $('student-modal').classList.remove('hidden')
  const detailResult = cached ? { data: cached } : await supabase.from('students').select('*').eq('student_id', studentId).single()
  const student = detailResult.data
  if (!student) return $('student-details').innerHTML = '<p class="empty-state">Student record not found.</p>'
  const [enrollments, academics] = await Promise.all([
    supabase.from('enrollments').select('school_year,status,enrolled_at,sections(section_name)').eq('student_id', studentId).order('enrolled_at', { ascending: false }),
    supabase.from('academic_history').select('school_year,subject,grade,letter_grade,remarks').eq('student_id', studentId).order('school_year', { ascending: false })
  ])
  const enrollmentRows = enrollments.data || []
  const academicRows = academics.data || []
  const active = enrollmentRows.find(row => row.status === 'active')
  const currentYearAverage = generalAverage(academicRows.filter(row => row.school_year === active?.school_year))
  const attendanceTotals = await supabase.rpc('attendance_totals', { p_student_id: studentId, p_school_year: active?.school_year || null })
  const attendanceLine = attendanceTotals.error ? attendanceTotals.error.message : attendanceSummaryLine(attendanceTotals.data)
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
      <div><b>Attendance</b><p>${escapeHtml(attendanceLine)}</p></div>
      <div><b>General Average (${escapeHtml(active?.school_year || 'current year')})</b><p>${currentYearAverage == null ? '-' : `${currentYearAverage} (${escapeHtml(letterGrade(currentYearAverage)?.letter || '-')})`}</p></div>
    </div></div>
    <h3>Enrollment History</h3>
    <table><thead><tr><th>School Year</th><th>Section</th><th>Status</th><th>Enrolled On</th></tr></thead><tbody>${enrollmentRows.map(row => `<tr><td>${escapeHtml(row.school_year || '-')}</td><td>${escapeHtml(row.sections?.section_name || 'No Section')}</td><td>${statusBadge(row.status || 'active')}</td><td>${formatDate(row.enrolled_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">No enrollment records.</td></tr>'}</tbody></table>
    <h3>Academic History</h3>
    <table><thead><tr><th>School Year</th><th>Subject</th><th>Grade</th><th>Letter</th><th>Remarks</th></tr></thead><tbody>${academicRows.map(row => `<tr><td>${escapeHtml(row.school_year || '')}</td><td>${escapeHtml(row.subject || '')}</td><td>${row.grade ?? ''}</td><td>${escapeHtml(row.letter_grade || letterGrade(row.grade)?.letter || '')}</td><td>${escapeHtml(row.remarks || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-state">No academic records.</td></tr>'}</tbody></table>`
}


// Opens the application with a database-held edit lock so the administrator cannot
// approve or decline it while the registrar is correcting it.
async function openReview(id) {
  if (state.selectedApplication) return toast('Close the current review first.', 'error')
  const { data, error } = await supabase.rpc('begin_application_edit', { p_application_id: Number(id) })
  if (error) return toast(error.message, 'error')
  state.selectedApplication = data
  const field = (label, name, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(data[name] ?? '')}"></label>`
  $('review-content').innerHTML = `<div class="note">Editing as <b>${escapeHtml(data.editing_by || 'registrar')}</b>. The administrator cannot approve or decline this file while it is open here. Closing the form releases it.</div>
  <form id="review-form">${field('First Name','first_name')}${field('Middle Name','middle_name')}${field('Last Name','last_name')}${field('Birth Date','birth_date','date')}${field('Sex','sex')}${field('Grade Level','grade_level')}${field('Address','address')}${field('Guardian Name','guardian_name')}${field('Relationship','guardian_relationship')}${field('Guardian Phone','guardian_phone')}${field('Guardian Email','guardian_email')}${field('Prior School','prior_school')}${field('Prior Grade','prior_grade')}${field('Special Program','special_program')}<label>Registrar remarks<textarea name="remarks">${escapeHtml(data.remarks || '')}</textarea></label><label>Status<select name="status" disabled><option>draft</option><option>under_review</option></select></label><div class="actions"><button class="btn-approve">Save Review</button></div></form>`
  $('review-content').querySelector('[name=status]').value = data.status === 'submitted' ? 'under_review' : data.status
  $('review-modal').classList.remove('hidden')
  // Renew the lease; stale tokens are rejected by the server even after tab suspension.
  data.heartbeat = setInterval(async () => {
    try {
      const { error } = await supabase.rpc('renew_application_edit', { p_application_id: data.id, p_token: data.editing_token })
      if (error) throw error
    } catch (error) {
      clearInterval(data.heartbeat)
      if (state.selectedApplication === data) {
        $('review-content').querySelector('button').disabled = true
        toast(`Edit lock lost. Copy your corrections, close and reopen: ${error.message}`, 'error')
      }
    }
  }, 60000)
}
$('close-review').addEventListener('click', async () => {
  const app = state.selectedApplication
  clearInterval(app?.heartbeat)
  $('review-modal').classList.add('hidden')
  if (app?.editing_token) await supabase.rpc('end_application_edit', { p_application_id: app.id, p_token: app.editing_token })
  state.selectedApplication = null
})
async function saveReviewEdits() {
  const payload = Object.fromEntries(new FormData($('review-form')).entries())
  const { error } = await supabase.rpc('save_application_edit', { p_application_id: state.selectedApplication.id, p_token: state.selectedApplication.editing_token, p_payload: payload })
  if (error) return toast(error.message, 'error')
  $('review-modal').classList.add('hidden')
  clearInterval(state.selectedApplication?.heartbeat)
  state.selectedApplication = null
  toast('Application updated.'); loadApplications()
}
$('review-content').addEventListener('submit', e => {
  e.preventDefault()
  withBusy(e.target.querySelector('button'), 'Saving…', saveReviewEdits)
})
