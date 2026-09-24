import { supabase } from './auth-client.js'
import { toast } from './ui-theme.js'
import { withBusy } from './shell.js'
import { $, state } from './registrar-state.js'
import { escapeHtml, gradeLabel, gradeToNumber } from './html.js'
import { loadSections, loadEnrollments, renderStudentDirectory } from './registrar-sectioning.js'
import { renderAcademicStudents } from './registrar-academic.js'

export function renderPromotionExclusions() {
  const search = $('promotion-exclude-search').value.trim().toLowerCase()
  const grade = gradeToNumber($('promotion-grade').value)
  const students = state.students.filter(student => Number(student.grade_level) === grade && `${student.lrn_number} ${student.first_name} ${student.last_name}`.toLowerCase().includes(search))
  $('promotion-exclude-list').innerHTML = students.map(student => `<label><input type="checkbox" value="${student.student_id}"> ${escapeHtml(student.lrn_number || student.student_id)} — ${escapeHtml(`${student.first_name} ${student.last_name}`)}</label>`).join('') || '<small>No matching students.</small>'
}
$('promotion-exclude-search').oninput = renderPromotionExclusions
$('promotion-grade').onchange = renderPromotionExclusions

export async function loadStudents(){
  const [{data,error},{data:enrollments}] = await Promise.all([
    supabase.from('students').select('*').order('last_name'),
    supabase.from('enrollments').select('student_id,section_id,sections(section_name)').eq('status','active')
  ])
  if(error)return toast(`Could not load students: ${error.message}`,'error')
  state.students=data||[]
  state.studentSections=new Map((enrollments||[]).map(row=>[String(row.student_id),row.sections?.section_name||'No Section']))
  const shiftSections = [...new Set([...state.studentSections.values()].filter(Boolean))].sort()
  $('shift-student-filter').innerHTML = '<option value="">All sections</option>' + shiftSections.map(section => `<option>${escapeHtml(section)}</option>`).join('')
  const html=state.students.map(s=>`<option value="${s.student_id}">${escapeHtml(s.lrn_number||s.student_id)} — ${escapeHtml(s.first_name||'')} ${escapeHtml(s.last_name||'')}</option>`).join('')
  $('transcript-student').innerHTML=html
  renderStudentDirectory()
  renderShiftStudents()
  renderAcademicStudents()
}

function renderShiftStudents(){const search=($('shift-student-search')?.value||'').trim().toLowerCase();const section=String($('shift-student-filter')?.value||'');const rows=state.students.filter(s=>{const text=`${s.lrn_number||''} ${s.student_id} ${s.first_name||''} ${s.last_name||''}`.toLowerCase();const current=state.studentSections.get(String(s.student_id))||'No Section';return (!search||text.includes(search))&&(!section||current===section)});$('shift-student-table').innerHTML=rows.map(s=>`<tr class="${String($('shift-student')?.value||'')===String(s.student_id)?'selected-row':''}"><td>${escapeHtml(s.lrn_number||s.student_id)}</td><td>${escapeHtml(`${s.first_name||''} ${s.last_name||''}`)}</td><td>${escapeHtml(s.grade_level == null ? '-' : gradeLabel(s.grade_level))}</td><td>${escapeHtml(state.studentSections.get(String(s.student_id)) || 'No Section')}</td><td><button type="button" class="admin-view" data-select-shift-student="${s.student_id}">Select</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty-state">No students found.</td></tr>';document.querySelectorAll('[data-select-shift-student]').forEach(button=>button.onclick=()=>{ $('shift-student').value=button.dataset.selectShiftStudent; renderShiftStudents(); refreshShiftSections() })}

$('shift-student-search').oninput=renderShiftStudents
$('shift-student-filter').onchange=renderShiftStudents

 $('promotion-form').addEventListener('submit',async e=>{e.preventDefault();const grade=gradeToNumber($('promotion-grade').value);const excluded=[...document.querySelectorAll('#promotion-exclude-list input:checked')].map(input=>Number(input.value));const {data,error}=await supabase.rpc('request_promotion',{p_grade_level:grade,p_school_year:$('promotion-year').value,p_excluded:excluded});if(error)return toast(error.message,'error');toast(`Promotion request for ${data?.students||0} students sent to the admin for approval.`);renderPromotionExclusions()})

export async function refreshShiftSections() {
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
  const transferring = $('shift-mode').value !== 'shift'
  $('shift-section-field').classList.toggle('hidden', transferring)
  $('shift-form').querySelector('button.btn').textContent = transferring ? 'Send for Approval' : 'Process Shift'
}

$('shift-form').addEventListener('submit', async e => {
  e.preventDefault()
  const studentId = Number($('shift-student').value)
  const reason = $('shift-reason').value.trim()
  if (!studentId) return toast('Select a student first.', 'error')
  if (!reason) return toast('Enter a reason for this action.', 'error')
  if ($('shift-mode').value !== 'shift') return confirmTransferOut(studentId, reason)
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
  $('transfer-details').innerHTML = `You are about to ask the admin to ${$('shift-mode').value === 'withdraw' ? 'withdraw' : 'transfer'} <b>${escapeHtml(`${student?.first_name || ''} ${student?.last_name || ''}`.trim() || studentId)}</b> out of school. If approved, active enrollments will be closed and the student status set to <b>${$('shift-mode').value === 'withdraw' ? 'Withdrawn' : 'Transferred'}</b>.`
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
  confirmBtn.onclick = () => withBusy(confirmBtn, 'Sending…', () => transferStudentOut(studentId, reason))
  $('transfer-modal').classList.remove('hidden')
}
function closeTransferModal() { clearInterval(transferCountdown); $('transfer-modal').classList.add('hidden') }
$('close-transfer').addEventListener('click', closeTransferModal)
$('cancel-transfer').addEventListener('click', closeTransferModal)
async function transferStudentOut(studentId, reason) {
  const kind = $('shift-mode').value === 'withdraw' ? 'Withdrawn' : 'Transferred'
  const { error } = await supabase.rpc('request_withdrawal', { p_student_id: studentId, p_kind: kind, p_reason: reason })
  if (error) return toast(error.code === 'PGRST202' ? 'Requests need database/backupsqlmigration.sql applied first (request_withdrawal is missing).' : error.message, 'error')
  closeTransferModal()
  toast('Request sent to the admin. The student record stays unchanged until it is approved.')
  $('shift-reason').value = ''
}

$('feedback-form').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const {error}=await supabase.from('registrar_feedback').insert({...d,submitted_by:state.user.username});if(error)return toast(error.message,'error');toast('Feedback logged.');e.target.reset()})
