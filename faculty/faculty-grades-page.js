import { supabase } from '../auth-client.js'
import { loadFacultyContext, escapeHtml, classSelect, rosterFor } from './faculty-common.js'
import { SCORE_FIELDS, derivedGrade, gradeRecord, letterGrade } from '../grades.js'
import { withBusy } from '../shell.js'

const context = await loadFacultyContext('grades')
if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('grade-class'), context.classes)
  $('grade-year').value = context.schoolYear
  const selected = () => rosterFor(context, $('grade-class').value)
  let gradeRows = []
  const readRow = row => { const values = {}; row.querySelectorAll('[data-field]').forEach(input => { values[input.dataset.field] = input.value }); return gradeRecord(row.dataset.studentId, values) }
  const render = () => { $('grade-table').innerHTML = gradeRows.map(row => { const record = row.record || {}; const student = row.student || {}; const cells = SCORE_FIELDS.map(field => `<td><input type="number" min="0" max="100" step="0.01" data-field="${field}" value="${record[field] ?? ''}"></td>`).join(''); return `<tr data-student-id="${row.student_id}"><td>${escapeHtml(student.lrn_number || row.student_id)}<br><small>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`)}</small></td>${cells}<td data-derived>${escapeHtml(record.grade ?? '')}</td><td><input type="text" data-field="letter_grade" value="${escapeHtml(record.letter_grade || '')}"></td><td><input type="text" data-field="remarks" value="${escapeHtml(record.remarks || '')}"></td></tr>` }).join('') || '<tr><td colspan="10">No active students in this section.</td></tr>' }
  const refresh = () => $('grade-table').querySelectorAll('tr[data-student-id]').forEach(row => { const record = readRow(row); const value = record ? derivedGrade(record) : null; row.querySelector('[data-derived]').textContent = value == null ? '' : value; const input = row.querySelector('[data-field="letter_grade"]'); if (input && !input.dataset.userEdited) input.value = value == null ? '' : letterGrade(value)?.letter || '' })
  $('grade-table').oninput = event => { if (event.target.dataset.field === 'letter_grade') event.target.dataset.userEdited = 'true'; refresh() }
  $('load-grades').onclick = async () => { const { chosen, roster } = selected(); const year = $('grade-year').value.trim(); if (!chosen || !year) return window.alert('Choose a class and school year first.'); const result = await supabase.from('academic_history').select('*').in('student_id', roster.map(item => item.student_id)).eq('school_year', year).eq('subject', chosen.subject_name); if (result.error) return window.alert(result.error.message); const existing = new Map((result.data || []).map(record => [String(record.student_id), record])); gradeRows = roster.map(item => ({ student_id: item.student_id, student: item.students, record: existing.get(String(item.student_id)) || null })); render() }
  $('save-grades').onclick = () => withBusy($('save-grades'), 'Saving...', async () => { const { chosen } = selected(); const year = $('grade-year').value.trim(); const rows = [...$('grade-table').querySelectorAll('tr[data-student-id]')]; const records = rows.map(readRow).filter(Boolean); if (!chosen || !year || !records.length) return window.alert('Choose a class, school year, and at least one grade.'); if (records.some(record => derivedGrade(record) == null)) return window.alert('Each grade needs a Final, Midterm, or all four quarter scores.'); const { error } = await supabase.rpc('save_faculty_grades', { p_subject_id: chosen.subject_id, p_school_year: year, p_records: records }); if (error) return window.alert(error.message); window.alert(`Saved ${records.length} grade record(s).`); $('load-grades').click() })
}
