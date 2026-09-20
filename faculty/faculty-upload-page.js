import { supabase } from '../auth-client.js'
import { loadFacultyContext, escapeHtml, classSelect } from './faculty-common.js'
import { currentSchoolYear, derivedGrade, parseGradeCsv } from '../grades.js'
import { withBusy } from '../ui-theme.js'

const context = await loadFacultyContext('upload')
if (context) {
  const $ = id => document.getElementById(id)
  classSelect($('upload-class'), context.classes)
  $('upload-year').value = context.schoolYear || currentSchoolYear()
  let rows = []
  const render = () => { $('upload-preview-wrap').classList.toggle('hidden', !rows.length); $('upload-preview').innerHTML = rows.map(row => `<tr><td>${row.row}</td><td>${escapeHtml(row.student_id)}</td><td>${row.record ? derivedGrade(row.record) ?? '' : ''}</td><td>${escapeHtml(row.errors.join('; '))}</td></tr>`).join(''); $('save-upload').disabled = !rows.length || rows.some(row => row.errors.length) }
  $('upload-file').onchange = async event => { rows = parseGradeCsv(await event.target.files[0].text()); render() }
  $('save-upload').onclick = () => withBusy($('save-upload'), 'Saving...', async () => { const chosen = context.classes.find(item => item.key === $('upload-class').value); const year = $('upload-year').value.trim(); const records = rows.filter(row => !row.errors.length).map(row => row.record); if (!chosen || !year || !records.length) return window.alert('Choose a class, school year, and clean CSV file first.'); const { error } = await supabase.rpc('save_faculty_grades', { p_subject_id: chosen.subject_id, p_school_year: year, p_records: records }); if (error) return window.alert(error.message); window.alert(`Saved ${records.length} grade record(s).`); rows = []; $('upload-file').value = ''; render() })
}
