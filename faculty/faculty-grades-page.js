import { supabase } from '../auth-client.js'
import { loadFacultyContext, escapeHtml, classSelect, rosterFor } from './faculty-common.js'
import { SCORE_FIELDS, derivedGrade, gradeRecord, letterGrade } from '../grades.js'
import { withBusy } from '../shell.js'
import { toast } from '../ui-theme.js'
import { describeError } from '../errors.js'
import { confirmDialog, formDialog } from '../dialog.js'
import { guardUnsaved } from './unsaved.js'

const context = await loadFacultyContext('grades')
if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('grade-class'), context.classes)
  $('grade-year').value = context.schoolYear
  const selected = () => rosterFor(context, $('grade-class').value)
  const unsaved = guardUnsaved()
  let gradeRows = []
  const readRow = row => { const values = {}; row.querySelectorAll('[data-field]').forEach(input => { values[input.dataset.field] = input.value }); return gradeRecord(row.dataset.studentId, values) }
  const render = () => { $('grade-table').innerHTML = gradeRows.map(row => { const record = row.record || {}; const student = row.student || {}; const name = `${student.first_name || ''} ${student.last_name || ''}`.trim(); const cells = SCORE_FIELDS.map(field => `<td><input type="number" min="0" max="100" step="0.01" data-field="${field}" aria-label="${escapeHtml(`${field.replaceAll('_', ' ')} for ${name}`)}" value="${record[field] ?? ''}"${record.locked ? ' disabled' : ''}></td>`).join(''); return `<tr data-student-id="${row.student_id}"><td>${record.locked ? '<span title="Submitted and locked">&#128274;</span> ' : ''}${escapeHtml(student.lrn_number || row.student_id)}<br><small>${escapeHtml(name)}</small></td>${cells}<td data-derived>${escapeHtml(record.grade ?? '')}</td><td><input type="text" data-field="letter_grade" aria-label="Letter grade for ${escapeHtml(name)}" value="${escapeHtml(record.letter_grade || '')}"${record.locked ? ' disabled' : ''}></td><td><input type="text" data-field="remarks" aria-label="Remarks for ${escapeHtml(name)}" value="${escapeHtml(record.remarks || '')}"${record.locked ? ' disabled' : ''}>${record.locked ? ' <button type="button" class="admin-view" data-correct>Request correction</button>' : ''}</td></tr>` }).join('') || '<tr><td colspan="10">No active students in this section.</td></tr>' }
  const refresh = () => $('grade-table').querySelectorAll('tr[data-student-id]').forEach(row => { const record = readRow(row); const value = record ? derivedGrade(record) : null; row.querySelector('[data-derived]').textContent = value == null ? '' : value; const input = row.querySelector('[data-field="letter_grade"]'); if (input && !input.dataset.userEdited) input.value = value == null ? '' : letterGrade(value)?.letter || '' })
  $('grade-table').oninput = event => { if (event.target.dataset.field === 'letter_grade') event.target.dataset.userEdited = 'true'; unsaved.mark(); refresh() }

  async function loadGrades() {
    const { chosen, roster } = selected()
    const year = $('grade-year').value.trim()
    if (!chosen || !year) return toast('Choose a class and school year first.', 'error')
    const result = await supabase.from('academic_history').select('*').in('student_id', roster.map(item => item.student_id)).eq('school_year', year).eq('subject', chosen.subject_name)
    if (result.error) return toast(describeError(result.error, 'Load grades'), 'error')
    const existing = new Map((result.data || []).map(record => [String(record.student_id), record]))
    gradeRows = roster.map(item => ({ student_id: item.student_id, student: item.students, record: existing.get(String(item.student_id)) || null }))
    render()
    unsaved.clear()
  }
  $('load-grades').onclick = async () => {
    if (!await unsaved.confirmDiscard()) return
    await withBusy($('load-grades'), 'Loading...', loadGrades)
  }

  $('grade-table').onclick = async event => {
    const button = event.target.closest('[data-correct]')
    if (!button) return
    const row = button.closest('tr')
    const { chosen } = selected()
    const studentId = Number(row.dataset.studentId)
    const answer = await formDialog({
      title: 'Request grade correction',
      message: `${row.querySelector('small')?.textContent || 'Student'}: the grade is locked. The admin must approve the correction before it changes.`,
      fields: [
        { name: 'grade', label: 'Corrected final grade', type: 'number', min: 0, max: 100, step: 0.01, required: true },
        { name: 'reason', label: 'Reason (the admin will see this)', multiline: true, required: true, maxlength: 500 }
      ],
      confirmText: 'Send request'
    })
    if (!answer) return
    const value = Number(answer.grade)
    return withBusy(button, 'Sending...', async () => {
      const { error } = await supabase.rpc('request_grade_correction', { p_subject_id: chosen.subject_id, p_school_year: $('grade-year').value.trim(), p_student_id: studentId, p_new_grade: value, p_letter: letterGrade(value)?.letter || null, p_reason: answer.reason })
      if (error) return toast(describeError(error, 'Send correction'), 'error')
      toast('Correction sent to the admin. The grade stays locked until it is approved.')
    })
  }

  // The inputs carry min/max, so the browser can point at the exact bad cell instead of the server rejecting the batch.
  const firstInvalidInput = () => [...$('grade-table').querySelectorAll('input[type="number"]:not(:disabled)')].find(input => !input.checkValidity())

  $('save-grades').onclick = () => withBusy($('save-grades'), 'Saving...', async () => {
    const { chosen } = selected()
    const year = $('grade-year').value.trim()
    const records = [...$('grade-table').querySelectorAll('tr[data-student-id]')].map(readRow).filter(Boolean)
    if (!chosen || !year || !records.length) return toast('Load a class and enter at least one grade first.', 'error')
    const invalid = firstInvalidInput()
    if (invalid) { invalid.focus(); return invalid.reportValidity() }
    if (records.some(record => derivedGrade(record) == null)) return toast('Each grade needs a Final, a Midterm, or all four quarter scores.', 'error')
    const { error } = await supabase.rpc('save_faculty_grades', { p_subject_id: chosen.subject_id, p_school_year: year, p_records: records })
    if (error) return toast(describeError(error, 'Save grades'), 'error')
    toast(`Saved ${records.length} grade record(s).`)
    await loadGrades()
  })

  $('lock-grades').onclick = () => withBusy($('lock-grades'), 'Locking...', async () => {
    const { chosen } = selected()
    const year = $('grade-year').value.trim()
    if (!chosen || !year || !gradeRows.length) return toast('Load a class first.', 'error')
    if (unsaved.dirty) return toast('Save your changes before submitting.', 'error')
    const missing = gradeRows.filter(row => !row.record).length
    if (missing) return toast(`${missing} student(s) have no saved grade yet. Save a grade for every student, then submit.`, 'error')
    if (!await confirmDialog(`Submit and lock ${chosen.subject_name} grades for ${year}? You cannot edit them afterwards unless the registrar unlocks them.`, { title: 'Submit final grades', confirmText: 'Submit and lock', danger: true })) return
    const { error } = await supabase.rpc('lock_faculty_grades', { p_subject_id: chosen.subject_id, p_school_year: year })
    if (error) return toast(describeError(error, 'Submit grades'), 'error')
    toast('Grades submitted and locked.')
    await loadGrades()
  })
}
