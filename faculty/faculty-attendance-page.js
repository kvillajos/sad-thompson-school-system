import { supabase } from '../auth-client.js'
import { loadFacultyContext, escapeHtml, classSelect, rosterFor } from './faculty-common.js'
import { STATUS_OPTIONS, attendanceRecord, todayDateValue } from '../attendance.js'
import { withBusy } from '../shell.js'

const context = await loadFacultyContext('attendance')
if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('attendance-class'), context.classes)
  $('attendance-date').value = todayDateValue()
  const selected = () => rosterFor(context, $('attendance-class').value)
  let rows = []
  const readRow = row => { const values = {}; row.querySelectorAll('[data-field]').forEach(input => { values[input.dataset.field] = input.value }); return attendanceRecord(row.dataset.studentId, values) }
  const render = () => { $('attendance-table-body').innerHTML = rows.map(row => { const student = row.student || {}; const options = STATUS_OPTIONS.map(status => `<option value="${status}" ${(row.record?.status || 'Present') === status ? 'selected' : ''}>${status}</option>`).join(''); return `<tr data-student-id="${row.student_id}"><td>${escapeHtml(student.lrn_number || row.student_id)}<br><small>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`)}</small></td><td><select data-field="status">${options}</select></td><td><input type="text" data-field="remarks" value="${escapeHtml(row.record?.remarks || '')}"></td></tr>` }).join('') || '<tr><td colspan="3">No active students in this section.</td></tr>' }
  $('load-attendance').onclick = async () => { const { chosen, roster } = selected(); const date = $('attendance-date').value; if (!chosen || !date) return window.alert('Choose a class and date first.'); const result = await supabase.from('attendance').select('*').in('student_id', roster.map(item => item.student_id)).eq('attendance_date', date).eq('section_id', chosen.section_id).eq('subject_id', chosen.subject_id); if (result.error) return window.alert(result.error.message); const existing = new Map((result.data || []).map(record => [String(record.student_id), record])); rows = roster.map(item => ({ student_id: item.student_id, student: item.students, record: existing.get(String(item.student_id)) || null })); render() }
  $('save-attendance').onclick = () => withBusy($('save-attendance'), 'Saving...', async () => { const { chosen } = selected(); const date = $('attendance-date').value; const records = [...$('attendance-table-body').querySelectorAll('tr[data-student-id]')].map(readRow).filter(Boolean); if (!chosen || !date || !records.length) return window.alert('Load a class before saving attendance.'); const { error } = await supabase.rpc('save_attendance', { p_section_id: chosen.section_id, p_subject_id: chosen.subject_id, p_date: date, p_records: records }); if (error) return window.alert(error.message); window.alert(`Saved attendance for ${records.length} student(s).`); $('load-attendance').click() })
}
