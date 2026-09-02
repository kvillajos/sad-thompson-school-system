import { supabase, requireRole, signOut } from './auth-client.js'

const $ = (id) => document.getElementById(id)
const state = { applications: [], sections: [], students: [], academic: [], selectedApplication: null }
const gradeToNumber = (value) => value === 'Kindergarten' ? 0 : Number(String(value).replace('Grade ', ''))
const gradeLabel = (value) => Number(value) === 0 ? 'Kindergarten' : `Grade ${value}`

const user = await requireRole(2)
if (!user) throw new Error('Unauthorized')
$('user-name').textContent = user.username
$('logout').addEventListener('click', signOut)

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
    status
  }
  const id = $('application-id').value || null
  const result = id
    ? await supabase.from('admission_applications').update(payload).eq('id', id).select().single()
    : await supabase.from('admission_applications').insert(payload).select().single()
  if (result.error) return toast(result.error.message, 'error')
  $('application-id').value = result.data.id
  if (status === 'submitted') {
    await uploadDocuments(result.data.id)
    toast('Application submitted successfully. The registrar can now review it.')
    $('application-form').reset(); $('application-id').value = ''
  } else toast('Draft saved. You can resume it later from the draft list.')
  loadApplications()
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
  $('application-count').textContent = state.applications.filter(a => a.status !== 'enrolled').length
  $('applications-table').innerHTML = state.applications.map(a => `<tr>
    <td>${escapeHtml(`${a.first_name} ${a.last_name}`)}</td><td>${escapeHtml(gradeLabel(a.grade_level))}</td><td>${statusBadge(a.status)}</td>
    <td>${new Date(a.created_at).toLocaleDateString()}</td><td>${a.status === 'draft' ? `<button class="small" data-resume="${a.id}">Resume</button>` : `<button class="small" data-review="${a.id}">Review</button>`}</td></tr>`).join('') || '<tr><td colspan="5">No applications found.</td></tr>'
  document.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => openReview(b.dataset.review)))
  document.querySelectorAll('[data-resume]').forEach(b => b.addEventListener('click', () => resumeApplication(b.dataset.resume)))
}

function resumeApplication(id) {
  const a = state.applications.find(x => x.id === id); if (!a) return
  $('application-id').value = a.id
  const form = $('application-form')
  Object.entries(a).forEach(([key,value]) => { const field=form.elements.namedItem(key); if(field && value != null) field.value=value })
  document.querySelector('[data-tab=\"admission\"]').click()
  toast('Draft loaded. Continue editing and submit when ready.')
}

async function openReview(id) {
  const a = state.applications.find(x => x.id === id); if (!a) return
  state.selectedApplication = a
  $('review-content').innerHTML = `<div class="review-grid"><div><b>Student</b><p>${escapeHtml(a.first_name)} ${escapeHtml(a.middle_name||'')} ${escapeHtml(a.last_name)}</p></div><div><b>Grade</b><p>${escapeHtml(a.grade_level||'')}</p></div><div><b>Guardian</b><p>${escapeHtml(a.guardian_name||'')} (${escapeHtml(a.guardian_relationship||'')})</p></div><div><b>Contact</b><p>${escapeHtml(a.guardian_phone||'')}<br>${escapeHtml(a.guardian_email||'')}</p></div><div><b>Prior School</b><p>${escapeHtml(a.prior_school||'')}</p></div><div><b>Program</b><p>${escapeHtml(a.special_program||'None')}</p></div></div>
  <label>Status<select id="review-status"><option>under_review</option><option>approved</option><option>rejected</option></select></label><label>Registrar remarks<textarea id="review-remarks"></textarea></label><button id="save-review">Save Review</button>`
  $('review-status').value = a.status === 'submitted' ? 'under_review' : a.status
  $('review-remarks').value = a.remarks || ''
  $('review-modal').classList.remove('hidden')
  $('save-review').onclick = updateApplicationStatus
}
$('close-review').addEventListener('click', () => $('review-modal').classList.add('hidden'))
async function updateApplicationStatus() {
  const a = state.selectedApplication, status = $('review-status').value, remarks = $('review-remarks').value.trim()
  const { error } = await supabase.rpc('review_admission_application',{p_application_id:a.id,p_status:status,p_remarks:remarks})
  if (error) return toast(error.message,'error')
  $('review-modal').classList.add('hidden'); toast(`Application marked ${status.replace('_',' ')}.`); loadApplications(); loadDashboard()
}

async function loadSections() {
  const { data, error } = await supabase.from('sections').select('section_id,section_name,grade_level,capacity').order('grade_level').order('section_name')
  if (error) return toast(error.message,'error'); state.sections = data || []
  const { data: enrollmentRows } = await supabase.from('enrollments').select('section_id').eq('status','active')
  const counts = (enrollmentRows || []).reduce((result, row) => { result[row.section_id] = (result[row.section_id] || 0) + 1; return result }, {})
  $('section-table').innerHTML = state.sections.map(s => `<tr><td>${escapeHtml(s.section_name)}</td><td>${escapeHtml(gradeLabel(s.grade_level))}</td><td>${counts[s.section_id] || 0}/${s.capacity}</td><td>General</td><td><button class="small" data-place="${s.section_id}">Place</button></td></tr>`).join('') || '<tr><td colspan="5">No sections configured.</td></tr>'
  document.querySelectorAll('[data-place]').forEach(b => b.onclick=()=>openPlacement(Number(b.dataset.place)))
  const grades=[...new Set(state.sections.map(s=>s.grade_level))]; $('placement-grade').innerHTML=grades.map(g=>`<option value="${g}">${escapeHtml(gradeLabel(g))}</option>`).join('')
}
async function openPlacement(sectionId='') {
  const { data, error } = await supabase.from('students').select('student_id,lrn_number,first_name,last_name,grade_level').order('last_name')
  if (error) return toast(error.message,'error'); state.students=data||[]
  $('placement-student').innerHTML=state.students.map(s=>`<option value="${s.student_id}">${escapeHtml(s.lrn_number||'')} - ${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)} (${escapeHtml(gradeLabel(s.grade_level))})</option>`).join('')
  $('placement-section').innerHTML=state.sections.map(s=>`<option value="${s.section_id}">${escapeHtml(s.section_name)} — ${escapeHtml(gradeLabel(s.grade_level))} (${s.capacity})</option>`).join('')
  if(sectionId) $('placement-section').value=sectionId
  $('placement-modal').classList.remove('hidden')
}
$('open-placement').onclick=()=>openPlacement()
$('close-placement').onclick=()=>$('placement-modal').classList.add('hidden')
$('run-auto-placement').onclick=async()=>{
  const { data, error } = await supabase.rpc('auto_place_student',{p_student_id:Number($('placement-student').value),p_grade_level:Number($('placement-grade').value)})
  if(error) return toast(error.message,'error'); toast(`Automatically placed in ${data?.section_name || 'a section'}.`); $('placement-modal').classList.add('hidden'); loadSections(); loadDashboard()
}
$('manual-place').onclick=async()=>{
  const { error }=await supabase.rpc('manual_place_student',{p_student_id:Number($('placement-student').value),p_section_id:Number($('placement-section').value)})
  if(error)return toast(error.message,'error'); toast('Student manually assigned.'); $('placement-modal').classList.add('hidden'); loadSections()
}

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
async function loadStudents(){const {data,error}=await supabase.from('students').select('student_id,lrn_number,first_name,last_name').order('last_name');if(error)return toast(error.message,'error');state.students=data||[];const html=state.students.map(s=>`<option value="${s.student_id}">${escapeHtml(s.lrn_number||'')} — ${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</option>`).join('');$('academic-student').innerHTML=html;$('transcript-student').innerHTML=html;$('promotion-student').innerHTML=html;$('shift-student').innerHTML=html}
async function generateTranscript(studentId){const {data:s,error:se}=await supabase.from('students').select('*').eq('student_id',studentId).single();if(se)return toast(se.message,'error');const {data:g,error:ge}=await supabase.from('academic_history').select('*').eq('student_id',studentId).order('school_year');if(ge)return toast(ge.message,'error');const win=window.open('','_blank');if(!win)return toast('Allow pop-ups to generate the transcript.','error');win.document.write(`<html><head><title>Official Transcript - ${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</title><style>body{font-family:Arial;padding:40px}header{text-align:center;border-bottom:2px solid #111;padding-bottom:15px}.student{margin:25px 0}.student span{display:inline-block;width:48%}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #333;padding:8px;text-align:left}.sign{display:flex;justify-content:space-between;margin-top:80px}.sign div{width:40%;border-top:1px solid #111;text-align:center;padding-top:6px}@media print{button{display:none}}</style></head><body><header><h1>THOMPSON CHRISTIAN SCHOOL</h1><p>OFFICIAL TRANSCRIPT OF RECORDS</p></header><div class="student"><span><b>Student No:</b> ${escapeHtml(s.lrn_number||'')}</span><span><b>Name:</b> ${escapeHtml(`${s.first_name} ${s.last_name}`)}</span><span><b>Grade Level:</b> ${escapeHtml(gradeLabel(s.grade_level))}</span></div><table><thead><tr><th>School Year</th><th>Subject</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>${g.map(r=>`<tr><td>${escapeHtml(r.school_year)}</td><td>${escapeHtml(r.subject)}</td><td>${r.grade??''}</td><td>${escapeHtml(r.remarks||'')}</td></tr>`).join('')}</tbody></table><div class="sign"><div>Registrar</div><div>School Seal / Signature</div></div><button onclick="window.print()">Print / Save as PDF</button></body></html>`);win.document.close();win.focus()}

$('promotion-form').addEventListener('submit',async e=>{e.preventDefault();const grade=gradeToNumber($('promotion-grade').value);const {data,error}=await supabase.rpc('batch_promote_students',{p_grade_level:grade,p_school_year:$('promotion-year').value});if(error)return toast(error.message,'error');toast(`${data?.processed||0} students processed; ${data?.promoted||0} promoted.`);loadDashboard()})
$('shift-form').addEventListener('submit',async e=>{e.preventDefault();const {error}=await supabase.rpc('shift_student',{p_student_id:Number($('shift-student').value),p_target_section_id:Number($('shift-section').value),p_reason:$('shift-reason').value});if(error)return toast(error.message,'error');toast('Student shift completed successfully.');e.target.reset();loadSections()})

$('feedback-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const {error}=await supabase.from('registrar_feedback').insert({...d,submitted_by:user.username});if(error)return toast(error.message,'error');toast('Feedback logged.');e.target.reset()})

async function loadDashboard(){const {data,error}=await supabase.from('admission_applications').select('status');if(!error){$('pending-count').textContent=data.filter(x=>['submitted','under_review'].includes(x.status)).length;$('approved-count').textContent=data.filter(x=>x.status==='approved').length}}
async function init(){await Promise.all([loadApplications(),loadSections(),loadStudents(),loadAcademic(),loadDashboard()]);$('year').textContent=new Date().getFullYear()}
init()
