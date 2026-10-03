import { supabase } from '../auth-client.js'
import { loadFacultyContext, escapeHtml, classSelect, rosterFor } from './faculty-common.js'
import { STATUS_OPTIONS, attendanceRecord, todayDateValue } from '../attendance.js'
import { withBusy } from '../shell.js'
import { toast } from '../ui-theme.js'
import { describeError } from '../errors.js'
import { guardUnsaved } from './unsaved.js'

const context = await loadFacultyContext('attendance')
if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('attendance-class'), context.classes)
  $('attendance-date').value = todayDateValue()
  $('attendance-date').max = todayDateValue()
  const selected = () => rosterFor(context, $('attendance-class').value)
  const unsaved = guardUnsaved()
  let rows = []
  const readRow = row => { const values = {}; row.querySelectorAll('[data-field]').forEach(input => { values[input.dataset.field] = input.value }); return attendanceRecord(row.dataset.studentId, values) }
  const render = () => { $('attendance-table-body').innerHTML = rows.map(row => { const student = row.student || {}; const name = `${student.first_name || ''} ${student.last_name || ''}`.trim(); const options = STATUS_OPTIONS.map(status => `<option value="${status}" ${(row.record?.status || 'Present') === status ? 'selected' : ''}>${status}</option>`).join(''); return `<tr data-student-id="${row.student_id}"><td>${escapeHtml(student.lrn_number || row.student_id)}<br><small>${escapeHtml(name)}</small></td><td><select data-field="status" aria-label="Status for ${escapeHtml(name)}">${options}</select></td><td><input type="text" maxlength="100" data-field="remarks" aria-label="Remarks for ${escapeHtml(name)}" value="${escapeHtml(row.record?.remarks || '')}"></td></tr>` }).join('') || '<tr><td colspan="3">No active students in this section.</td></tr>' }
  $('attendance-table-body').addEventListener('input', () => unsaved.mark())
  $('attendance-table-body').addEventListener('change', () => unsaved.mark())

  async function loadAttendance() {
    const { chosen, roster } = selected()
    const date = $('attendance-date').value
    if (!chosen || !date) return toast('Choose a class and date first.', 'error')
    const result = await supabase.from('attendance').select('*').in('student_id', roster.map(item => item.student_id)).eq('attendance_date', date).eq('section_id', chosen.section_id).eq('subject_id', chosen.subject_id)
    if (result.error) return toast(describeError(result.error, 'Load attendance'), 'error')
    const existing = new Map((result.data || []).map(record => [String(record.student_id), record]))
    rows = roster.map(item => ({ student_id: item.student_id, student: item.students, record: existing.get(String(item.student_id)) || null }))
    render()
    unsaved.clear()
    if (rows.length && !existing.size) toast('No attendance saved for this date yet. Everyone starts as Present.')
  }
  $('load-attendance').onclick = async () => {
    if (!await unsaved.confirmDiscard()) return
    await withBusy($('load-attendance'), 'Loading...', loadAttendance)
  }
  $('save-attendance').onclick = () => withBusy($('save-attendance'), 'Saving...', async () => {
    const { chosen } = selected()
    const date = $('attendance-date').value
    const records = [...$('attendance-table-body').querySelectorAll('tr[data-student-id]')].map(readRow).filter(Boolean)
    if (!chosen || !date || !records.length) return toast('Load a class before saving attendance.', 'error')
    const { error } = await supabase.rpc('save_attendance', { p_section_id: chosen.section_id, p_subject_id: chosen.subject_id, p_date: date, p_records: records })
    if (error) return toast(describeError(error, 'Save attendance'), 'error')
    toast(`Saved attendance for ${records.length} student(s).`)
    await loadAttendance()
  })
}
