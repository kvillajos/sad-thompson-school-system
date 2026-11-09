// Discipline and sanctions records (table student_sanctions, v61). One component for every role:
//   staff mode  - mountSanctions(host, { students, canDelete })  list + add / edit / resolve (RLS limits advisers to
//                 their own section; only admin and registrar may delete)
//   student     - mountSanctions(host, { studentId, readOnly: true })  the student's own records
import { supabase } from '../lib/auth-client.js'
import { escapeHtml, errorRow, lastFirst, longDate } from '../lib/html.js'
import { describeError } from '../lib/errors.js'
import { currentSchoolYear } from '../lib/grades.js'
import { fetchAll } from '../lib/fetch-all.js'
import { fillYearSelect } from '../lib/school-years.js'
import { confirmDialog, formDialog } from './dialog.js'
import { searchPicker } from './search-picker.js'
import { toast } from './ui-theme.js'

const STATUSES = [
  ['active', 'Active'],
  ['resolved', 'Resolved'],
  ['dismissed', 'Dismissed']
]
const statusBadge = status =>
  `<span class="badge ${status === 'active' ? 'pending' : status === 'resolved' ? 'completed' : ''}">${escapeHtml(status)}</span>`

const recordFields = (row = {}) => [
  {
    name: 'incident_date',
    label: 'Incident date',
    type: 'date',
    required: true,
    value: row.incident_date || new Date().toLocaleDateString('en-CA')
  },
  {
    name: 'violation_type',
    label: 'Violation',
    required: true,
    maxlength: 120,
    placeholder: 'e.g. Tardiness, Dress code',
    value: row.violation_type
  },
  { name: 'description', label: 'What happened', multiline: true, required: true, maxlength: 1000, value: row.description },
  {
    name: 'sanction_type',
    label: 'Sanction',
    required: true,
    maxlength: 120,
    placeholder: 'e.g. Verbal warning, Parent conference',
    value: row.sanction_type
  },
  { name: 'sanction_details', label: 'Sanction details (optional)', multiline: true, maxlength: 1000, value: row.sanction_details }
]

// Registrar tab and admin page: a school-year picker over the whole school's records.
export async function mountStaffSanctions(host, { canDelete = true } = {}) {
  if (!host) return
  host.innerHTML =
    '<div class="filterbar admin-filterbar"><select data-sanction-year aria-label="School year"></select></div><div data-sanction-list></div>'
  const yearSelect = host.querySelector('[data-sanction-year]')
  const [, students] = await Promise.all([
    fillYearSelect(yearSelect),
    fetchAll(() => supabase.from('students').select('student_id,first_name,last_name,lrn_number').order('last_name').order('student_id'))
  ])
  if (students.error) toast(describeError(students.error, 'Load students'), 'error')
  const list = host.querySelector('[data-sanction-list]')
  const show = () => mountSanctions(list, { students: students.data || [], canDelete, schoolYear: yearSelect.value })
  yearSelect.onchange = show
  await show()
}

export async function mountSanctions(
  host,
  { students = [], studentId = null, readOnly = false, canDelete = false, schoolYear = currentSchoolYear() } = {}
) {
  if (!host) return
  host.innerHTML = `
    ${
      readOnly
        ? ''
        : `<div class="admin-filterbar filterbar">
            <input type="search" data-sanction-student maxlength="100" placeholder="Type a student's name or ID to add a record" aria-label="Student" />
            <button type="button" class="admin-primary btn" data-sanction-add disabled>+ Add record</button>
            <select data-sanction-status aria-label="Status"><option value="">All statuses</option>${STATUSES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          </div>`
    }
    <table><thead><tr><th>Date</th>${studentId ? '' : '<th>Student</th>'}<th>Violation</th><th>Sanction</th><th>Status</th>${
      readOnly ? '' : '<th>Filed by</th><th>Actions</th>'
    }</tr></thead><tbody data-sanction-rows><tr><td colspan="7">Loading…</td></tr></tbody></table>`
  const body = host.querySelector('[data-sanction-rows]')
  const columns = 4 + (studentId ? 0 : 1) + (readOnly ? 0 : 2)
  let rows = []
  let picked = null

  async function load() {
    let query = supabase
      .from('student_sanctions')
      .select(
        'sanction_id,student_id,school_year,incident_date,violation_type,description,sanction_type,sanction_details,status,issued_by_name,resolution_notes,resolved_at,students(first_name,last_name,lrn_number)'
      )
      .order('incident_date', { ascending: false })
      .order('sanction_id', { ascending: false })
    if (studentId) query = query.eq('student_id', studentId)
    else query = query.eq('school_year', schoolYear)
    const { data, error } = await query
    if (error) return (body.innerHTML = errorRow(columns, error, 'Load discipline records'))
    rows = data || []
    render()
  }

  function render() {
    const status = host.querySelector('[data-sanction-status]')?.value || ''
    const visible = rows.filter(row => !status || row.status === status)
    body.innerHTML =
      visible
        .map(
          row => `<tr>
            <td data-label="Date">${escapeHtml(longDate(row.incident_date))}</td>
            ${studentId ? '' : `<td data-label="Student">${escapeHtml(lastFirst(row.students))} <small>${escapeHtml(row.students?.lrn_number || '')}</small></td>`}
            <td data-label="Violation"><strong>${escapeHtml(row.violation_type)}</strong><br><small>${escapeHtml(row.description)}</small></td>
            <td data-label="Sanction">${escapeHtml(row.sanction_type)}${row.sanction_details ? `<br><small>${escapeHtml(row.sanction_details)}</small>` : ''}</td>
            <td data-label="Status">${statusBadge(row.status)}${row.resolution_notes ? `<br><small>${escapeHtml(row.resolution_notes)}</small>` : ''}</td>
            ${
              readOnly
                ? ''
                : `<td data-label="Filed by">${escapeHtml(row.issued_by_name || '-')}</td>
                   <td data-label="Actions"><button type="button" class="admin-view small" data-sanction-edit="${row.sanction_id}">Edit</button>${
                     canDelete
                       ? ` <button type="button" class="admin-remove small" data-sanction-delete="${row.sanction_id}">Delete</button>`
                       : ''
                   }</td>`
            }
          </tr>`
        )
        .join('') ||
      `<tr><td colspan="${columns}">${readOnly ? 'No discipline records.' : 'No discipline records for this school year.'}</td></tr>`
    body.querySelectorAll('[data-sanction-edit]').forEach(button => {
      button.onclick = () => edit(rows.find(row => row.sanction_id === Number(button.dataset.sanctionEdit)))
    })
    body.querySelectorAll('[data-sanction-delete]').forEach(button => {
      button.onclick = () => remove(rows.find(row => row.sanction_id === Number(button.dataset.sanctionDelete)))
    })
  }

  async function add() {
    if (!picked) return
    const values = await formDialog({
      title: `Discipline record: ${lastFirst(picked)}`,
      fields: recordFields(),
      confirmText: 'Save record'
    })
    if (!values) return
    const { error } = await supabase
      .from('student_sanctions')
      .insert({ ...values, sanction_details: values.sanction_details || null, student_id: picked.student_id })
    if (error) return toast(describeError(error, 'Save discipline record'), 'error')
    toast('Discipline record saved.')
    await load()
  }

  async function edit(row) {
    if (!row) return
    const values = await formDialog({
      title: `Edit record: ${lastFirst(row.students)}`,
      fields: [
        ...recordFields(row),
        { name: 'status', label: 'Status', options: STATUSES, value: row.status },
        { name: 'resolution_notes', label: 'Resolution notes (optional)', multiline: true, maxlength: 1000, value: row.resolution_notes }
      ],
      confirmText: 'Save changes'
    })
    if (!values) return
    const { error } = await supabase
      .from('student_sanctions')
      .update({ ...values, sanction_details: values.sanction_details || null, resolution_notes: values.resolution_notes || null })
      .eq('sanction_id', row.sanction_id)
    if (error) return toast(describeError(error, 'Update discipline record'), 'error')
    toast('Discipline record updated.')
    await load()
  }

  async function remove(row) {
    if (!row) return
    const ok = await confirmDialog(
      `Delete the ${row.violation_type} record of ${lastFirst(row.students)}? It can be brought back from Restore Changes for 30 days.`,
      {
        title: 'Delete discipline record',
        confirmText: 'Delete',
        danger: true
      }
    )
    if (!ok) return
    const { error } = await supabase.from('student_sanctions').delete().eq('sanction_id', row.sanction_id)
    if (error) return toast(describeError(error, 'Delete discipline record'), 'error')
    toast('Discipline record deleted.')
    await load()
  }

  if (!readOnly) {
    const addButton = host.querySelector('[data-sanction-add]')
    searchPicker(host.querySelector('[data-sanction-student]'), {
      search: query => {
        const q = query.toLowerCase()
        return students.filter(s => `${s.last_name} ${s.first_name} ${s.lrn_number || ''}`.toLowerCase().includes(q)).slice(0, 12)
      },
      render: s => `${escapeHtml(lastFirst(s))} <small>${escapeHtml(s.lrn_number || '')}</small>`,
      text: s => lastFirst(s),
      onPick: s => {
        picked = s
        addButton.disabled = !s
      }
    })
    addButton.onclick = add
    host.querySelector('[data-sanction-status]').onchange = render
  }
  await load()
}
