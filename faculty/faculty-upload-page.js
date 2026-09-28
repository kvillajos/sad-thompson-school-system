import { supabase } from '../auth-client.js'
import { loadFacultyContext, escapeHtml, classSelect } from './faculty-common.js'
import { currentSchoolYear, derivedGrade, parseGradeCsv } from '../grades.js'
import { withBusy } from '../shell.js'
import { toast } from '../ui-theme.js'
import { describeError } from '../errors.js'

const context = await loadFacultyContext('upload')
if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('upload-class'), context.classes)
  $('upload-year').value = context.schoolYear || currentSchoolYear()
  let rows = []
  const render = () => {
    $('upload-preview-wrap').classList.toggle('hidden', !rows.length)
    $('upload-preview').innerHTML = rows.map(row => `<tr${row.errors.length ? ' class="table-state-error"' : ''}><td>${row.row}</td><td>${escapeHtml(row.student_id)}</td><td>${row.record ? derivedGrade(row.record) ?? '' : ''}</td><td>${escapeHtml(row.errors.join('; ') || 'OK')}</td></tr>`).join('')
    const bad = rows.filter(row => row.errors.length).length
    $('save-upload').disabled = !rows.length || bad > 0
    if (bad) toast(`${bad} row(s) have problems (shown in red). Fix them in the file and choose it again.`, 'error')
  }
  $('upload-file').onchange = async event => {
    const file = event.target.files[0]
    if (!file) return
    if (!/\.csv$/i.test(file.name)) { event.target.value = ''; rows = []; render(); return toast('Choose a .csv file (in Excel: File > Save As > CSV).', 'error') }
    rows = parseGradeCsv(await file.text())
    render()
    if (!rows.length) toast('That file has no grade rows under the header line.', 'error')
  }
  $('save-upload').onclick = () => withBusy($('save-upload'), 'Saving...', async () => {
    const chosen = context.classes.find(item => item.key === $('upload-class').value)
    const year = $('upload-year').value.trim()
    const records = rows.filter(row => !row.errors.length).map(row => row.record)
    if (!chosen || !year || !records.length) return toast('Choose a class, school year, and a CSV file with no errors first.', 'error')
    const { error } = await supabase.rpc('save_faculty_grades', { p_subject_id: chosen.subject_id, p_school_year: year, p_records: records })
    if (error) return toast(describeError(error, 'Save grades'), 'error')
    toast(`Saved ${records.length} grade record(s).`)
    rows = []
    $('upload-file').value = ''
    render()
  })
}
