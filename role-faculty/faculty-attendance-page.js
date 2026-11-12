import { supabase } from '../shared/lib/auth-client.js'
import { loadFacultyContext, escapeHtml, lastFirst, classSelect, rosterFor } from './faculty-common.js'
import { STATUS_OPTIONS, attendanceRecord, todayDateValue } from '../shared/lib/attendance.js'
import { withBusy } from '../shared/ui/shell.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import { guardUnsaved } from './unsaved.js'
import { mountAttendanceDraft } from './faculty-attendance-entry.js'
import { downloadTableCsv } from '../shared/ui/table-copy.js'

const context = await loadFacultyContext('attendance')
// A past year: no daily log to take, just each student's totals for the chosen class, exportable as CSV.
if (context?.past) {
  const $ = id => document.getElementById(id)
  classSelect($('attendance-class'), context.classes)
  $('load-attendance').textContent = 'Export CSV'
  const table = $('attendance-table-body').closest('table')
  table.tHead.innerHTML = '<tr><th>Student ID</th><th>Student Name</th><th>Absences</th><th>Lates</th><th>Excused</th></tr>'
  const renderSummary = async () => {
    const { chosen, roster } = rosterFor(context, $('attendance-class').value)
    if (!chosen) return ($('attendance-table-body').innerHTML = '<tr><td colspan="5">No classes that year.</td></tr>')
    const { data, error } = await supabase
      .from('attendance')
      .select('student_id,status')
      .eq('section_id', chosen.section_id)
      .eq('subject_id', chosen.subject_id)
      .neq('status', 'Present')
    if (error) return toast(describeError(error, 'Load attendance'), 'error')
    const counts = new Map()
    ;(data || []).forEach(row => {
      const item = counts.get(String(row.student_id)) || { Absent: 0, Late: 0, Excused: 0 }
      item[row.status] = (item[row.status] || 0) + 1
      counts.set(String(row.student_id), item)
    })
    $('attendance-table-body').innerHTML =
      roster
        .map(item => {
          const c = counts.get(String(item.student_id)) || { Absent: 0, Late: 0, Excused: 0 }
          return `<tr><td data-label="Student ID">${escapeHtml(item.students?.lrn_number || item.student_id)}</td><td data-label="Student Name">${escapeHtml(lastFirst(item.students))}</td><td data-label="Absences">${c.Absent}</td><td data-label="Lates">${c.Late}</td><td data-label="Excused">${c.Excused}</td></tr>`
        })
        .join('') || '<tr><td colspan="5">No students in this class.</td></tr>'
    if (!data?.length && roster.length) toast('No absences or lates were recorded for this class that year.')
  }
  $('attendance-class').onchange = renderSummary
  $('load-attendance').onclick = () => downloadTableCsv(table, `attendance-${context.schoolYear}-${$('attendance-class').selectedOptions[0]?.textContent || 'class'}`.replace(/[^\w-]+/g, '-'))
  await renderSummary()
} else if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('attendance-class'), context.classes)
  $('attendance-date').value = todayDateValue()
  $('attendance-date').max = todayDateValue()
  const selected = () => rosterFor(context, $('attendance-class').value)
  const unsaved = guardUnsaved()
  let rows = []
  const readRow = row => {
    const values = {}
    row.querySelectorAll('[data-field]').forEach(input => {
      values[input.dataset.field] = input.value
    })
    return attendanceRecord(row.dataset.studentId, values)
  }
  const render = () => {
    $('attendance-table-body').innerHTML =
      rows
        .map(row => {
          const student = row.student || {}
          const name = lastFirst(student)
          const options = STATUS_OPTIONS.map(
            status => `<option value="${status}" ${(row.record?.status || 'Present') === status ? 'selected' : ''}>${status}</option>`
          ).join('')
          return `<tr data-student-id="${row.student_id}"><td data-label="Student ID">${escapeHtml(student.lrn_number || row.student_id)}</td><td data-label="Student Name">${escapeHtml(name)}</td><td><select data-field="status" aria-label="Status for ${escapeHtml(name)}">${options}</select></td><td><input type="text" maxlength="100" data-field="remarks" aria-label="Remarks for ${escapeHtml(name)}" value="${escapeHtml(row.record?.remarks || '')}"></td></tr>`
        })
        .join('') || '<tr><td colspan="4">No active students in this section.</td></tr>'
  }
  $('attendance-table-body').addEventListener('input', () => unsaved.mark())
  $('attendance-table-body').addEventListener('change', () => unsaved.mark())
  mountAttendanceDraft({
    body: $('attendance-table-body'),
    userId: context.user.user_id,
    getClassKey: () => $('attendance-class').value,
    getDate: () => $('attendance-date').value,
    saveButton: $('save-attendance')
  })

  async function loadAttendance() {
    const { chosen, roster } = selected()
    const date = $('attendance-date').value
    if (!chosen || !date) return toast('Choose a class and date first.', 'error')
    const result = await supabase
      .from('attendance')
      .select('*')
      .in(
        'student_id',
        roster.map(item => item.student_id)
      )
      .eq('attendance_date', date)
      .eq('section_id', chosen.section_id)
      .eq('subject_id', chosen.subject_id)
    if (result.error) return toast(describeError(result.error, 'Load attendance'), 'error')
    const existing = new Map((result.data || []).map(record => [String(record.student_id), record]))
    rows = roster.map(item => ({
      student_id: item.student_id,
      student: item.students,
      record: existing.get(String(item.student_id)) || null
    }))
    render()
    unsaved.clear()
    if (rows.length && !existing.size) toast('No attendance saved for this date yet. Everyone starts as Present.')
  }
  $('load-attendance').onclick = async () => {
    if (!(await unsaved.confirmDiscard())) return
    await withBusy($('load-attendance'), 'Loading...', loadAttendance)
  }
  $('save-attendance').onclick = () =>
    withBusy($('save-attendance'), 'Saving...', async () => {
      const { chosen } = selected()
      const date = $('attendance-date').value
      const records = [...$('attendance-table-body').querySelectorAll('tr[data-student-id]')].map(readRow).filter(Boolean)
      if (!chosen || !date || !records.length) return toast('Load a class before saving attendance.', 'error')
      const { error } = await supabase.rpc('save_attendance', {
        p_section_id: chosen.section_id,
        p_subject_id: chosen.subject_id,
        p_date: date,
        p_records: records
      })
      if (error) return toast(describeError(error, 'Save attendance'), 'error')
      toast(`Saved attendance for ${records.length} student(s).`)
      await loadAttendance()
    })
}
