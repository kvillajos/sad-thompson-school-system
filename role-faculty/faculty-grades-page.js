import { supabase } from '../shared/lib/auth-client.js'
import { loadFacultyContext, escapeHtml, classSelect, rosterFor } from './faculty-common.js'
import { SCORE_FIELDS, derivedGrade, gradeRecord, letterGrade } from '../shared/lib/grades.js'
import { withBusy } from '../shared/ui/shell.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog, formDialog } from '../shared/ui/dialog.js'
import { guardUnsaved } from './unsaved.js'
import { errorRow } from '../shared/lib/html.js'
import { loadGradingScales } from '../shared/lib/grading-scale.js'

const SCORE_LABELS = {
  first_sem_q1: 'Q1',
  first_sem_q2: 'Q2',
  second_sem_q1: 'Q3',
  second_sem_q2: 'Q4',
  midterm: 'Midterm',
  final: 'Final'
}

const context = await loadFacultyContext('grades')
await loadGradingScales()
if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('grade-class'), context.classes)
  $('grade-year').value = context.schoolYear
  const selected = () => rosterFor(context, $('grade-class').value)
  const unsaved = guardUnsaved()
  let gradeRows = []
  // Scores stay between 0 and 100 and are rounded to hundredths (99.9777 becomes 99.98).
  const clampScore = input => {
    if (input.type !== 'number' || input.value === '') return
    const number = Math.min(100, Math.max(0, Number(input.value)))
    const rounded = Math.round((number + Number.EPSILON) * 100) / 100
    if (Number.isFinite(rounded) && String(rounded) !== input.value) input.value = rounded
  }
  const readRow = (row, normalize = false) => {
    const values = {}
    row.querySelectorAll('[data-field]').forEach(input => {
      if (normalize) clampScore(input)
      values[input.dataset.field] = input.dataset.field === 'final' && !input.dataset.userEdited ? '' : input.value
    })
    return gradeRecord(row.dataset.studentId, values)
  }
  // A stored final that differs from the quarter average was typed in by the faculty; keep it as an override.
  const edited = record => record.final != null && Number(record.final) !== derivedGrade({ ...record, final: null })
  // A Senior High semester subject is graded only in its own semester's two quarters (1st: Q1-Q2, 2nd: Q3-Q4).
  const OFF_SEMESTER = { 1: ['second_sem_q1', 'second_sem_q2'], 2: ['first_sem_q1', 'first_sem_q2'] }
  const render = () => {
    const offFields = OFF_SEMESTER[selected().chosen?.semester] || []
    $('grade-table').innerHTML =
      gradeRows
        .map(row => {
          const record = row.record || {}
          const student = row.student || {}
          const name = `${student.first_name || ''} ${student.last_name || ''}`.trim()
          const cells = SCORE_FIELDS.filter(field => field !== 'final')
            .map(field =>
              offFields.includes(field)
                ? `<td data-label="${SCORE_LABELS[field]}" title="Not taught this semester">-</td>`
                : `<td${field === 'midterm' ? ' style="display:none !important"' : ` data-label="${SCORE_LABELS[field]}"`}><input type="number" min="0" max="100" step="0.01" data-field="${field}" aria-label="${escapeHtml(`${field.replaceAll('_', ' ')} for ${name}`)}" value="${record[field] ?? ''}"${record.locked ? ' disabled' : ''}></td>`
            )
            .join('')
          return `<tr data-student-id="${row.student_id}"><td data-label="Student">${record.locked ? '<span title="Submitted and locked">&#128274;</span> ' : ''}${escapeHtml(student.lrn_number || row.student_id)}<br><small>${escapeHtml(name)}</small></td>${cells}<td data-label="Final Grade"><input type="number" min="0" max="100" step="0.01" data-field="final" aria-label="Final grade for ${escapeHtml(name)}" value="${record.final ?? ''}"${edited(record) ? ' data-user-edited="true"' : ''}${record.locked ? ' disabled' : ''}></td><td data-label="Letter Grade"><input type="text" maxlength="3" readonly tabindex="-1" data-field="letter_grade" aria-label="Letter grade for ${escapeHtml(name)}" value="${escapeHtml(record.letter_grade || '')}"${record.locked ? ' disabled' : ''}></td><td data-label="Remarks"><input type="text" maxlength="100" data-field="remarks" aria-label="Remarks for ${escapeHtml(name)}" value="${escapeHtml(record.remarks || '')}"${record.locked ? ' disabled' : ''}>${record.locked ? ' <button type="button" class="admin-view" data-correct>Request correction</button>' : ''}</td></tr>`
        })
        .join('') || '<tr><td colspan="8">No active students in this section.</td></tr>'
    refresh()
  }
  const refresh = () =>
    $('grade-table')
      .querySelectorAll('tr[data-student-id]')
      .forEach(row => {
        const record = readRow(row)
        const finalInput = row.querySelector('[data-field="final"]')
        if (!finalInput.dataset.userEdited && document.activeElement !== finalInput) {
          const auto = record ? derivedGrade(record) : null
          finalInput.value = auto == null ? '' : auto
        }
        const value = finalInput.value === '' ? null : Number(finalInput.value)
        row.querySelector('[data-field="letter_grade"]').value =
          value == null ? '' : letterGrade(value, $('grade-year').value.trim())?.letter || ''
      })
  $('grade-table').onchange = event => {
    clampScore(event.target)
    refresh()
  }
  $('grade-table').oninput = event => {
    if (event.target.type === 'number' && Number(event.target.value) > 100) event.target.value = 100 // stop at 100 while typing
    if (event.target.dataset.field === 'final') {
      if (event.target.value === '') delete event.target.dataset.userEdited
      else event.target.dataset.userEdited = 'true'
    }
    unsaved.mark()
    refresh()
  }

  async function loadGrades() {
    const { chosen, roster } = selected()
    const year = $('grade-year').value.trim()
    if (!chosen || !year) return toast('Choose a class and school year first.', 'error')
    const result = await supabase
      .from('academic_history')
      .select('*')
      .in(
        'student_id',
        roster.map(item => item.student_id)
      )
      .eq('school_year', year)
      .eq('subject', chosen.subject_name)
    if (result.error) return toast(describeError(result.error, 'Load grades'), 'error')
    const existing = new Map((result.data || []).map(record => [String(record.student_id), record]))
    gradeRows = roster.map(item => ({
      student_id: item.student_id,
      student: item.students,
      record: existing.get(String(item.student_id)) || null
    }))
    render()
    unsaved.clear()
  }
  // Every student this faculty teaches, one row per class (section + subject), for the school year above.
  let allGradeRows = []
  const renderAllGrades = () => {
    const words = $('all-grades-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const shown = allGradeRows.filter(row => words.every(word => row.search.includes(word)))
    const cell = (label, value) => `<td data-label="${label}">${escapeHtml(value ?? '')}</td>`
    $('all-grades-table').innerHTML =
      shown
        .map(
          row =>
            `<tr>${cell('Student No.', row.lrn)}${cell('Student', row.name)}${cell('Section', row.section)}${cell('Subject', row.subject)}${SCORE_FIELDS.slice(
              0,
              4
            )
              .map(field => cell(SCORE_LABELS[field], row.record?.[field]))
              .join(
                ''
              )}<td data-label="Final Grade"><strong>${escapeHtml(row.record?.grade ?? '')}</strong></td>${cell('Letter Grade', row.record?.letter_grade)}</tr>`
        )
        .join('') || `<tr><td colspan="10">${allGradeRows.length ? 'No match.' : 'No students assigned.'}</td></tr>`
  }
  async function loadAllGrades() {
    const year = $('grade-year').value.trim()
    const ids = [...new Set(context.enrollments.map(item => item.student_id))]
    const subjects = [...new Set(context.classes.map(item => item.subject_name))]
    const records = []
    // Chunked so a long student list never makes the request URL too long.
    for (let start = 0; start < ids.length; start += 200) {
      const { data, error } = await supabase
        .from('academic_history')
        .select('student_id,subject,first_sem_q1,first_sem_q2,second_sem_q1,second_sem_q2,grade,letter_grade')
        .in('student_id', ids.slice(start, start + 200))
        .in('subject', subjects)
        .eq('school_year', year)
      if (error) return ($('all-grades-table').innerHTML = errorRow(10, error, 'Load grades'))
      records.push(...data)
    }
    const byKey = new Map(records.map(record => [`${record.student_id}:${record.subject}`, record]))
    allGradeRows = context.classes
      .flatMap(chosen => {
        const section = chosen.label.slice(0, chosen.label.length - chosen.subject_name.length - 3)
        return context.enrollments
          .filter(item => Number(item.section_id) === chosen.section_id)
          .map(item => {
            const name = `${item.students?.first_name || ''} ${item.students?.last_name || ''}`.trim()
            const lrn = item.students?.lrn_number || String(item.student_id)
            return {
              lrn,
              name,
              section,
              subject: chosen.subject_name,
              record: byKey.get(`${item.student_id}:${chosen.subject_name}`),
              search: `${lrn} ${name} ${section} ${chosen.subject_name}`.toLowerCase()
            }
          })
      })
      .sort((a, b) => a.section.localeCompare(b.section) || a.subject.localeCompare(b.subject) || a.name.localeCompare(b.name))
    renderAllGrades()
  }
  $('all-grades-search').oninput = renderAllGrades

  // Picking a class loads it; Refresh reloads the current one. Unsaved scores ask before being discarded.
  let loadedClass = $('grade-class').value
  $('load-grades').onclick = async () => {
    if (!(await unsaved.confirmDiscard())) return
    await withBusy($('load-grades'), 'Refreshing...', () => Promise.all([loadGrades(), loadAllGrades()]))
  }
  $('grade-class').onchange = async () => {
    if (!(await unsaved.confirmDiscard())) return ($('grade-class').value = loadedClass)
    loadedClass = $('grade-class').value
    await loadGrades()
  }
  if (loadedClass) await Promise.all([loadGrades(), loadAllGrades()])
  else renderAllGrades()

  $('grade-table').onclick = async event => {
    const button = event.target.closest('[data-correct]')
    if (!button) return
    const row = button.closest('tr')
    const { chosen } = selected()
    const studentId = Number(row.dataset.studentId)
    const record = gradeRows.find(item => Number(item.student_id) === studentId)?.record || {}
    const current = SCORE_FIELDS.map(field => `${SCORE_LABELS[field]} ${record[field] ?? '-'}`).join(', ')
    const answer = await formDialog({
      title: 'Request grade correction',
      message: `${row.querySelector('small')?.textContent || 'Student'}: the grade is locked. The admin must approve the correction before it changes. Current scores: ${current}.`,
      fields: [
        { name: 'field', label: 'Score to correct', options: SCORE_FIELDS.map(field => [field, SCORE_LABELS[field]]), required: true },
        { name: 'grade', label: 'Corrected score', type: 'number', min: 0, max: 100, step: 0.01, required: true },
        { name: 'reason', label: 'Reason (the admin will see this)', multiline: true, required: true, maxlength: 500 }
      ],
      confirmText: 'Send request'
    })
    if (!answer) return
    const value = Number(answer.grade)
    // The year grade (and its letter) after the correction, worked out the way the approval recalculates it.
    const corrected = derivedGrade(gradeRecord(studentId, { ...record, [answer.field]: value }))
    return withBusy(button, 'Sending...', async () => {
      const { error } = await supabase.rpc('request_grade_correction', {
        p_subject_id: chosen.subject_id,
        p_school_year: $('grade-year').value.trim(),
        p_student_id: studentId,
        p_field: answer.field,
        p_new_grade: value,
        p_letter: letterGrade(corrected, $('grade-year').value.trim())?.letter || null,
        p_reason: answer.reason
      })
      if (error) return toast(describeError(error, 'Send correction'), 'error')
      toast('Correction sent to the admin. The grade stays locked until it is approved.')
    })
  }

  // The inputs carry min/max, so the browser can point at the exact bad cell instead of the server rejecting the batch.
  const firstInvalidInput = () =>
    [...$('grade-table').querySelectorAll('input[type="number"]:not(:disabled)')].find(input => !input.checkValidity())

  $('save-grades').onclick = () =>
    withBusy($('save-grades'), 'Saving...', async () => {
      const { chosen } = selected()
      const year = $('grade-year').value.trim()
      const records = [...$('grade-table').querySelectorAll('tr[data-student-id]')].map(row => readRow(row, true)).filter(Boolean)
      if (!chosen || !year || !records.length) return toast('Load a class and enter at least one grade first.', 'error')
      const invalid = firstInvalidInput()
      if (invalid) {
        invalid.focus()
        return invalid.reportValidity()
      }
      if (records.some(record => derivedGrade(record) == null))
        return toast('Enter at least one score for each student you fill in.', 'error')
      const { error } = await supabase.rpc('save_faculty_grades', {
        p_subject_id: chosen.subject_id,
        p_school_year: year,
        p_records: records
      })
      if (error) return toast(describeError(error, 'Save grades'), 'error')
      toast(`Saved ${records.length} grade record(s).`)
      await Promise.all([loadGrades(), loadAllGrades()])
    })

  $('lock-grades').onclick = () =>
    withBusy($('lock-grades'), 'Locking...', async () => {
      const { chosen } = selected()
      const year = $('grade-year').value.trim()
      if (!chosen || !year || !gradeRows.length) return toast('Load a class first.', 'error')
      if (unsaved.dirty) return toast('Save your changes before submitting.', 'error')
      const missing = gradeRows.filter(row => !row.record).length
      if (missing) return toast(`${missing} student(s) have no saved grade yet. Save a grade for every student, then submit.`, 'error')
      if (
        !(await confirmDialog(
          `Submit and lock ${chosen.subject_name} grades for ${year}? You cannot edit them afterwards unless the registrar unlocks them.`,
          { title: 'Submit final grades', confirmText: 'Submit and lock', danger: true }
        ))
      )
        return
      const { error } = await supabase.rpc('lock_faculty_grades', { p_subject_id: chosen.subject_id, p_school_year: year })
      if (error) return toast(describeError(error, 'Submit grades'), 'error')
      toast('Grades submitted and locked.')
      await Promise.all([loadGrades(), loadAllGrades()])
    })
}
