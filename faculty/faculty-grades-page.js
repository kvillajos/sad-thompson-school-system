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
  const render = () => { $('grade-table').innerHTML = gradeRows.map(row => { const record = row.record || {}; const student = row.student || {}; const cells = SCORE_FIELDS.map(field => `<td><input type="number" min="0" max="100" step="0.01" data-field="${field}" value="${record[field] ?? ''}"${record.locked ? ' disabled' : ''}></td>`).join(''); return `<tr data-student-id="${row.student_id}"><td>${record.locked ? '&#128274; ' : ''}${escapeHtml(student.lrn_number || row.student_id)}<br><small>${escapeHtml(`${student.first_name || ''} ${student.last_name || ''}`)}</small></td>${cells}<td data-derived>${escapeHtml(record.grade ?? '')}</td><td><input type="text" data-field="letter_grade" value="${escapeHtml(record.letter_grade || '')}"${record.locked ? ' disabled' : ''}></td><td><input type="text" data-field="remarks" value="${escapeHtml(record.remarks || '')}"${record.locked ? ' disabled' : ''}>${record.locked ? ' <button type="button" class="admin-view" data-correct>Request correction</button>' : ''}</td></tr>` }).join('') || '<tr><td colspan="10">No active students in this section.</td></tr>' }
  const refresh = () => $('grade-table').querySelectorAll('tr[data-student-id]').forEach(row => { const record = readRow(row); const value = record ? derivedGrade(record) : null; row.querySelector('[data-derived]').textContent = value == null ? '' : value; const input = row.querySelector('[data-field="letter_grade"]'); if (input && !input.dataset.userEdited) input.value = value == null ? '' : letterGrade(value)?.letter || '' })
  $('grade-table').oninput = event => { if (event.target.dataset.field === 'letter_grade') event.target.dataset.userEdited = 'true'; refresh() }
  $('load-grades').onclick = async () => { const { chosen, roster } = selected(); const year = $('grade-year').value.trim(); if (!chosen || !year) return window.alert('Choose a class and school year first.'); const result = await supabase.from('academic_history').select('*').in('student_id', roster.map(item => item.student_id)).eq('school_year', year).eq('subject', chosen.subject_name); if (result.error) return window.alert(result.error.message); const existing = new Map((result.data || []).map(record => [String(record.student_id), record])); gradeRows = roster.map(item => ({ student_id: item.student_id, student: item.students, record: existing.get(String(item.student_id)) || null })); render() }
  $('grade-table').onclick = event => {
    const button = event.target.closest('[data-correct]')
    if (!button) return
    const row = button.closest('tr')
    const { chosen } = selected()
    const studentId = Number(row.dataset.studentId)
    const newGrade = window.prompt('Corrected final grade (0-100):')
    if (newGrade === null) return
    const value = Number(newGrade)
    if (newGrade.trim() === '' || !Number.isFinite(value) || value < 0 || value > 100) return window.alert('Enter a number from 0 to 100.')
    const reason = window.prompt('Reason for the correction (the admin will see this):')
    if (!reason?.trim()) return window.alert('A reason is required.')
    return withBusy(button, 'Sending...', async () => {
      const { error } = await supabase.rpc('request_grade_correction', { p_subject_id: chosen.subject_id, p_school_year: $('grade-year').value.trim(), p_student_id: studentId, p_new_grade: value, p_letter: letterGrade(value)?.letter || null, p_reason: reason.trim() })
      window.alert(error ? error.message : 'Correction sent to the admin for approval. The grade stays locked until it is approved.')
    })
  }
  $('save-grades').onclick = () => withBusy($('save-grades'), 'Saving...', async () => { const { chosen } = selected(); const year = $('grade-year').value.trim(); const rows = [...$('grade-table').querySelectorAll('tr[data-student-id]')]; const records = rows.map(readRow).filter(Boolean); if (!chosen || !year || !records.length) return window.alert('Choose a class, school year, and at least one grade.'); if (records.some(record => derivedGrade(record) == null)) return window.alert('Each grade needs a Final, Midterm, or all four quarter scores.'); const { error } = await supabase.rpc('save_faculty_grades', { p_subject_id: chosen.subject_id, p_school_year: year, p_records: records }); if (error) return window.alert(error.message); window.alert(`Saved ${records.length} grade record(s).`); $('load-grades').click() })
  $('lock-grades').onclick = () => withBusy($('lock-grades'), 'Locking...', async () => { const { chosen } = selected(); const year = $('grade-year').value.trim(); if (!chosen || !year || !gradeRows.length) return window.alert('Load a class first.'); if (gradeRows.some(row => !row.record)) return window.alert('Every student needs a saved grade before you can submit. Save the grades, then submit.'); if (!window.confirm('Submit and lock these grades? You will not be able to edit them afterwards without the registrar unlocking them.')) return; const { error } = await supabase.rpc('lock_faculty_grades', { p_subject_id: chosen.subject_id, p_school_year: year }); if (error) return window.alert(error.message); window.alert('Grades submitted and locked.'); $('load-grades').click() })
}
