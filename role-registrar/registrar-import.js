// Registrar > Bulk Import: new students from a CSV or Excel file for the first weeks of enrollment.
// Preview first (every row checked the same way the database checks it), then one all-or-nothing import.
import { supabase } from '../shared/lib/auth-client.js'
import { escapeHtml, gradeLabel } from '../shared/lib/html.js'
import { describeError, describeFunctionError } from '../shared/lib/errors.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { OFFERED_GRADES } from '../shared/lib/grade-levels.js'
import { STRANDS } from '../shared/lib/strands.js'
import { loadSchoolYears } from '../shared/lib/school-years.js'
import { MAX_IMPORT_ROWS, buildImportTemplate, parseCsv, tableToRecords, validateImportRows } from '../shared/lib/student-import.js'
import { downloadFile, loadExcel, sheetToTable } from '../shared/ui/download.js'
import { confirmDialog, noticeDialog } from '../shared/ui/dialog.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'

let checked = []

export async function mountImportTab(host) {
  host.innerHTML = `
    <p>Add many new students at once, for example during the first week of enrollment. Each row becomes an enrolled
    student with a login (the admin activates the logins on Manage Accounts). Place them in sections afterwards with
    auto-assign on Section Students. Returning students are not imported: re-enroll them instead.</p>
    <div class="filterbar">
      <select id="import-year" aria-label="School year"></select>
      <button type="button" class="btn secondary" id="import-template">Download Excel template</button>
      <input type="file" id="import-file" accept=".csv,.xlsx" aria-label="Choose a CSV or Excel file" />
    </div>
    <p id="import-summary" class="note hidden" role="status"></p>
    <div id="import-preview"></div>
    <div class="actions"><button type="button" class="btn" id="import-run" disabled>Import students</button></div>`
  const $ = id => host.querySelector(`#${id}`)

  const years = await loadSchoolYears().catch(() => [])
  const open = years.filter(year => year.enrollment_open && !year.closed_at)
  $('import-year').innerHTML = open.length
    ? open.map(year => `<option value="${escapeHtml(year.label)}">${escapeHtml(year.label)} (enrollment open)</option>`).join('')
    : '<option value="">No school year has enrollment open</option>'
  $('import-file').disabled = !open.length

  $('import-template').onclick = () =>
    withBusy($('import-template'), 'Preparing…', async () => {
      const workbook = buildImportTemplate(await loadExcel(), {
        grades: OFFERED_GRADES,
        strands: STRANDS.map(strand => strand.code ?? strand)
      })
      downloadFile(
        'student-import-template.xlsx',
        new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      )
    })
  $('import-file').onchange = () => withBusy($('import-file'), 'Reading…', () => preview($, $('import-file').files[0]))
  $('import-run').onclick = () => withBusy($('import-run'), 'Importing…', () => runImport($))
}

async function readTable(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = await loadExcel()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new Error('The Excel file has no sheets')
    return sheetToTable(sheet)
  }
  return parseCsv(await file.text())
}

async function preview($, file) {
  checked = []
  $('import-run').disabled = true
  $('import-preview').innerHTML = ''
  if (!file) return
  let table
  try {
    table = await readTable(file)
  } catch (error) {
    return toast(`Could not read ${file.name}: ${error.message}`, 'error')
  }
  const { rows, unknownHeaders, missingHeaders } = tableToRecords(table)
  if (missingHeaders.length)
    return showSummary($, `Missing columns: ${missingHeaders.join(', ')}. Download the template to see the expected headers.`)
  if (!rows.length) return showSummary($, 'The file has no student rows.')
  if (rows.length > MAX_IMPORT_ROWS) return showSummary($, `The file has ${rows.length} rows; import at most ${MAX_IMPORT_ROWS} at a time.`)

  const { data: students, error } = await fetchAll(() =>
    supabase.from('students').select('student_id,first_name,last_name,date_of_birth,lrn_number').order('student_id')
  )
  if (error) return toast(describeError(error, 'Check existing students'), 'error')
  checked = validateImportRows(rows, {
    offeredGrades: OFFERED_GRADES,
    strands: STRANDS.map(strand => strand.code ?? strand),
    existingKeys: new Set(
      (students || []).map(s => [s.last_name, s.first_name, s.date_of_birth].map(v => String(v ?? '').toLowerCase()).join('|'))
    ),
    existingNumbers: new Set((students || []).map(s => String(s.lrn_number || '').toLowerCase()).filter(Boolean))
  })
  const bad = checked.filter(row => row.errors.length)
  showSummary(
    $,
    `${checked.length} row(s) read, ${bad.length ? `${bad.length} with problems: fix them in the file and choose it again.` : 'all ready to import.'}${
      unknownHeaders.length ? ` Ignored columns: ${unknownHeaders.join(', ')}.` : ''
    }`
  )
  $('import-preview').innerHTML =
    `<table><thead><tr><th>Row</th><th>Name</th><th>Birth Date</th><th>Sex</th><th>Grade</th><th>Strand</th><th>Check</th></tr></thead><tbody>${checked
      .map(
        ({ row, values: v, errors }) => `<tr>
        <td data-label="Row">${row}</td>
        <td data-label="Name">${escapeHtml([v.last_name, v.first_name].filter(Boolean).join(', ') || '-')}</td>
        <td data-label="Birth Date">${escapeHtml(v.birth_date || '-')}</td>
        <td data-label="Sex">${escapeHtml(v.sex || '-')}</td>
        <td data-label="Grade">${escapeHtml(Number.isInteger(v.grade_level) ? gradeLabel(v.grade_level) : '-')}</td>
        <td data-label="Strand">${escapeHtml(v.strand || '-')}</td>
        <td data-label="Check">${errors.length ? `<span class="badge rejected">Fix</span> ${escapeHtml(errors.join('; '))}` : '<span class="badge completed">OK</span>'}</td>
      </tr>`
      )
      .join('')}</tbody></table>`
  $('import-run').disabled = bad.length > 0
  $('import-run').textContent = `Import ${checked.length} student(s)`
}

function showSummary($, text) {
  $('import-summary').textContent = text
  $('import-summary').classList.remove('hidden')
}

async function runImport($) {
  const year = $('import-year').value
  if (!year || !checked.length || checked.some(row => row.errors.length)) return
  const ok = await confirmDialog(
    `Import ${checked.length} student(s) into ${year}? Each gets a student record, an enrollment for ${year} and a login (username + "123").`,
    { title: 'Import students', confirmText: 'Import' }
  )
  if (!ok) return
  const { data, error } = await supabase.rpc('bulk_import_students', {
    p_school_year: year,
    p_rows: checked.map(row => row.values)
  })
  if (error) return toast(describeError(error, 'Import students'), 'error')
  const created = data?.created || []
  // Activate the logins now so no student is left as an account that cannot sign in. Failures are listed, not hidden.
  const failed = []
  for (const [index, item] of created.entries()) {
    $('import-run').textContent = `Activating logins ${index + 1} of ${created.length}…`
    const { error: loginError } = await supabase.functions.invoke('provision-account', {
      body: { student_id: item.student_id, action: 'provision' }
    })
    if (loginError) failed.push(`${item.username}: ${await describeFunctionError(loginError, 'Activate login')}`)
  }
  await noticeDialog(
    [
      `${created.length} student(s) imported into ${year}.`,
      failed.length
        ? `${failed.length} login(s) could not be activated. Ask the admin to run Manage Accounts > Provision pending logins:\n${failed.join('\n')}`
        : `All ${created.length} logins are active. Each student signs in with their username + "123".`,
      'Next: place them in sections with auto-assign on Section Students.',
      ...created.slice(0, 50).map(item => `${item.student_no}  ${item.name}  (username ${item.username})`),
      created.length > 50 ? `…and ${created.length - 50} more.` : ''
    ].join('\n'),
    { title: 'Import finished' }
  )
  checked = []
  $('import-file').value = ''
  $('import-preview').innerHTML = ''
  $('import-run').disabled = true
  $('import-run').textContent = 'Import students'
}
