import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'
import { escapeHtml, gradeLabel } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { currentSchoolYear } from '../shared/lib/grades.js'
import { searchPicker } from './search-picker.js'
import { isPlaceable } from './sectioning.js'

// Capacity-override form shared by the registrar (files a request) and the admin (places directly).
// The database refuses to bypass grade-level eligibility; it only lifts the seat limit.
export async function mountOverrideForm(root, { rpc, button, done }) {
  root.classList.add('override-form')
  root.innerHTML = `<label>Student<input maxlength="100" class="override-student" placeholder="Search student name or ID..."></label>
    <label>Full section<select class="override-section"><option value="">Choose a student first</option></select></label>
    <label class="wide">Reason<textarea maxlength="500" class="override-reason" required placeholder="e.g. Transferee arriving mid-term; sibling must share a section"></textarea></label>
    <div class="admin-actions actions"><button type="submit" class="admin-primary btn">${button}</button></div>`
  const $ = selector => root.querySelector(selector)
  const [students, sections, enrollments] = await Promise.all([
    fetchAll(() => supabase.from('students').select('student_id,lrn_number,first_name,last_name,grade_level,enrollment_status').order('last_name').order('student_id')),
    supabase.from('sections').select('section_id,section_name,grade_level,capacity').gte('academic_year', currentSchoolYear()).order('section_name'),
    fetchAll(() => supabase.from('enrollments').select('section_id').eq('status', 'active').order('id'))
  ])
  const loadError = students.error || sections.error || enrollments.error
  if (loadError) toast(describeError(loadError, 'Load the override form'), 'error')
  const filled = new Map()
  ;(enrollments.data || []).forEach(row => filled.set(row.section_id, (filled.get(row.section_id) || 0) + 1))
  const label = student => `${student.lrn_number || student.student_id} - ${student.first_name} ${student.last_name}`
  const list = (students.data || []).filter(isPlaceable)
  let picked = null
  const chosen = () => picked
  const showSections = () => {
    const student = chosen()
    const full = student ? (sections.data || []).filter(section => Number(section.grade_level) === Number(student.grade_level) && (filled.get(section.section_id) || 0) >= section.capacity) : []
    $('.override-section').innerHTML = !student ? '<option value="">Choose a student first</option>'
      : full.map(section => `<option value="${section.section_id}">${escapeHtml(section.section_name)} - ${escapeHtml(gradeLabel(section.grade_level))} (${filled.get(section.section_id)}/${section.capacity} seats)</option>`).join('') || '<option value="">No full section for this grade level, place the student normally</option>'
  }
  const picker = searchPicker($('.override-student'), {
    search: query => list.filter(student => label(student).toLowerCase().includes(query.toLowerCase())).slice(0, 12),
    render: student => `<span>${escapeHtml(`${student.first_name} ${student.last_name}`)}</span><small>${escapeHtml(student.lrn_number || student.student_id)} · ${escapeHtml(gradeLabel(student.grade_level))}</small>`,
    text: label,
    onPick: student => { picked = student; showSections() }
  })
  root.onsubmit = async event => {
    event.preventDefault()
    const student = chosen()
    const sectionId = Number($('.override-section').value)
    if (!student || !sectionId) return toast('Choose a student and a full section.', 'error')
    await withBusy($('button'), 'Sending…', async () => {
      const { error } = await supabase.rpc(rpc, { p_student_id: student.student_id, p_section_id: sectionId, p_reason: $('.override-reason').value })
      if (error) return toast(describeError(error, 'Override'), 'error')
      toast(done)
      root.reset()
      picker.clear()
    })
  }
}
