import { supabase } from '../shared/lib/auth-client.js'
import { loadFacultyContext, escapeHtml, lastFirst, classSelect, rosterFor } from './faculty-common.js'
import { currentSchoolYear, derivedGrade, parseGradeCsv } from '../shared/lib/grades.js'
import { withBusy } from '../shared/ui/shell.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { loadGradingScales } from '../shared/lib/grading-scale.js'

// Q1 to Q4 and an optional Final Grade override. Midterm and the letter grade are no longer entered by hand.
const TEMPLATE_SCORES = ['first_sem_q1', 'first_sem_q2', 'second_sem_q1', 'second_sem_q2', 'final']

const context = await loadFacultyContext('upload')
await loadGradingScales()
if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('upload-class'), context.classes)
  $('upload-year').value = context.schoolYear || currentSchoolYear()
  let rows = []
  const warnedNames = new Set()
  const nameKey = text =>
    String(text)
      .toLowerCase()
      .replace(/[,\s]+/g, ' ')
      .trim()
      .split(' ')
      .sort()
      .join(' ')
  const render = () => {
    $('upload-preview-wrap').classList.toggle('hidden', !rows.length)
    $('upload-preview').innerHTML = rows
      .map(
        row =>
          `<tr${row.errors.length ? ' class="table-state-error"' : ''}><td>${row.row}</td><td>${escapeHtml(row.student_id)}</td><td>${row.record ? (derivedGrade(row.record) ?? '') : ''}</td><td>${escapeHtml(row.errors.join('; ') || 'OK')}</td></tr>`
      )
      .join('')
    const bad = rows.filter(row => row.errors.length).length
    $('save-upload').disabled = !rows.length || bad > 0
    if (bad) toast(`${bad} row(s) have problems (shown in red). Fix them in the file and choose it again.`, 'error')
  }
  // The CSV is keyed by the internal student_id, which faculty never see, so the template fills it in.
  // The name goes last (commas stripped) because parseGradeCsv splits on every comma.
  $('download-template').onclick = () => {
    const { chosen, roster } = rosterFor(context, $('upload-class').value)
    if (!chosen) return toast('Choose a class first.', 'error')
    const header = ['student_id', ...TEMPLATE_SCORES, 'remarks', 'student_name']
    const lines = roster.map(item =>
      [item.student_id, ...TEMPLATE_SCORES.map(() => ''), '', lastFirst(item.students).replace(/,/g, ' ')].join(',')
    )
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\r\n')], { type: 'text/csv' }))
    link.download = `${chosen.label.replace(/[^a-z0-9]+/gi, '-')}-grades.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  $('upload-file').onchange = async event => {
    const file = event.target.files[0]
    if (!file) return
    if (!/\.csv$/i.test(file.name)) {
      event.target.value = ''
      rows = []
      render()
      return toast('Choose a .csv file (in Excel: File > Save As > CSV).', 'error')
    }
    rows = parseGradeCsv(await file.text(), $('upload-year').value.trim())
    const { roster } = rosterFor(context, $('upload-class').value)
    const onRoster = new Map(roster.map(item => [String(item.student_id), item.students]))
    const seen = new Map()
    const mismatched = []
    rows.forEach(row => {
      if (!row.student_id || Number.isNaN(Number(row.student_id))) return
      const student = onRoster.get(String(Number(row.student_id)))
      if (!student) row.errors.push('student is not in this class')
      const first = seen.get(String(Number(row.student_id)))
      if (first) row.errors.push(`duplicate of row ${first}`)
      else seen.set(String(Number(row.student_id)), row.row)
      // Word order and commas are ignored, so "Cruz Juan" matches "Juan Cruz".
      if (student && row.name && nameKey(row.name) !== nameKey(lastFirst(student))) {
        row.nameKey = `${row.student_id}|${nameKey(row.name)}`
        mismatched.push(row)
      }
    })
    // First time: ask. If the same mismatches come back after "Fix file", those rows are blocked.
    const repeated = mismatched.filter(row => warnedNames.has(row.nameKey))
    repeated.forEach(row =>
      row.errors.push(
        `name "${row.name}" does not match the student on record (${lastFirst(onRoster.get(String(Number(row.student_id))))})`
      )
    )
    const fresh = mismatched.filter(row => !warnedNames.has(row.nameKey))
    if (fresh.length) {
      const list = fresh
        .map(
          row =>
            `Row ${row.row}: ID ${row.student_id} is "${row.name}" in the file but ${lastFirst(onRoster.get(String(Number(row.student_id))))} on record.`
        )
        .join('\n')
      const proceed = await confirmDialog(`${fresh.length} name(s) do not match their Student ID:\n${list}`, {
        title: 'Names do not match',
        confirmText: 'Save anyway',
        cancelText: 'Fix file'
      })
      if (!proceed) {
        fresh.forEach(row => warnedNames.add(row.nameKey))
        event.target.value = ''
        rows = []
        render()
        return toast('Fix the names in the file and choose it again.', 'error')
      }
    }
    render()
    if (!rows.length) toast('That file has no grade rows under the header line.', 'error')
  }
  $('save-upload').onclick = () =>
    withBusy($('save-upload'), 'Saving...', async () => {
      const chosen = context.classes.find(item => item.key === $('upload-class').value)
      const year = $('upload-year').value.trim()
      const records = rows.filter(row => !row.errors.length).map(row => row.record)
      if (!chosen || !year || !records.length) return toast('Choose a class, school year, and a CSV file with no errors first.', 'error')
      const { error } = await supabase.rpc('save_faculty_grades', {
        p_subject_id: chosen.subject_id,
        p_school_year: year,
        p_records: records
      })
      if (error) return toast(describeError(error, 'Save grades'), 'error')
      toast(`Saved ${records.length} grade record(s).`)
      rows = []
      $('upload-file').value = ''
      render()
    })
}
