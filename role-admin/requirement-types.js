// Admin editor for the admission requirements list (table requirement_types, v58), on the Admissions page.
import { supabase } from '../shared/lib/auth-client.js'
import { escapeHtml, errorRow, gradeLabel } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog, formDialog } from '../shared/ui/dialog.js'
import { toast } from '../shared/ui/ui-theme.js'

const slug = text =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
const parseGrades = text =>
  String(text || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)

export async function mountRequirementTypes(host) {
  if (!host) return
  host.innerHTML = `
    <div class="admin-section-title">
      <div><h3>Required documents</h3><p class="admin-note" style="margin:4px 0 0">An application cannot be approved until every required item that applies is received or uploaded, unless you approve a requirements override.</p></div>
      <button type="button" class="admin-primary" data-add-requirement>+ Add item</button>
    </div>
    <table><thead><tr><th>Item</th><th>Applies to</th><th>Transferees only</th><th>Required</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody data-requirement-rows><tr><td colspan="6">Loading…</td></tr></tbody></table>`
  const body = host.querySelector('[data-requirement-rows]')
  let rows = []

  const edit = async row => {
    const values = await formDialog({
      title: row ? 'Edit required document' : 'Add required document',
      fields: [
        { name: 'label', label: 'Document', required: true, maxlength: 120, value: row?.label },
        {
          name: 'grade_levels',
          label: 'Grade levels (blank = every grade)',
          placeholder: 'e.g. 11, 12',
          maxlength: 40,
          value: row?.grade_levels?.join(', ')
        },
        { name: 'transferee_only', label: 'Transferees only', type: 'switch', value: Boolean(row?.transferee_only) },
        { name: 'required', label: 'Required', type: 'switch', value: row ? row.required : true },
        { name: 'is_active', label: 'In use', type: 'switch', value: row ? row.is_active : true },
        { name: 'sort_order', label: 'Order', type: 'number', min: 0, max: 99, step: 1, value: row?.sort_order ?? rows.length + 1 }
      ],
      confirmText: 'Save'
    })
    if (!values) return
    const grades = parseGrades(values.grade_levels)
    if (grades.some(grade => !Number.isInteger(grade) || grade < 0 || grade > 12))
      return toast('Grade levels must be whole numbers from 0 to 12, separated by commas.', 'error')
    const payload = {
      label: values.label,
      grade_levels: grades.length ? grades : null,
      transferee_only: values.transferee_only,
      required: values.required,
      is_active: values.is_active,
      sort_order: Number(values.sort_order) || 0
    }
    const code = row?.code || slug(values.label)
    if (!row && rows.some(item => item.code === code)) return toast('A document with that name already exists.', 'error')
    const ok = await confirmDialog(
      row
        ? `Save the changes to ${values.label}? Applications are checked against the updated list right away.`
        : `Add ${values.label} to the required documents? Applications are checked against it right away.`,
      { title: 'Are you sure?', confirmText: row ? 'Save' : 'Add' }
    )
    if (!ok) return
    const { error } = row
      ? await supabase.from('requirement_types').update(payload).eq('code', row.code)
      : await supabase.from('requirement_types').insert({ ...payload, code })
    if (error) return toast(describeError(error, 'Save required document'), 'error')
    toast('Required documents saved.')
    await load()
  }

  async function load() {
    const { data, error } = await supabase
      .from('requirement_types')
      .select('code,label,grade_levels,transferee_only,required,sort_order,is_active')
      .order('sort_order')
    if (error) return (body.innerHTML = errorRow(6, error, 'Load required documents'))
    rows = data || []
    body.innerHTML =
      rows
        .map(
          row => `<tr>
            <td data-label="Item">${escapeHtml(row.label)}</td>
            <td data-label="Applies to">${escapeHtml(row.grade_levels?.length ? row.grade_levels.map(gradeLabel).join(', ') : 'Every grade')}</td>
            <td data-label="Transferees only">${row.transferee_only ? 'Yes' : 'No'}</td>
            <td data-label="Required">${row.required ? 'Required' : 'Optional'}</td>
            <td data-label="Status">${row.is_active ? '<span class="badge active">In use</span>' : '<span class="badge">Not used</span>'}</td>
            <td data-label="Actions"><button type="button" class="admin-view" data-edit-requirement="${escapeHtml(row.code)}">Edit</button></td>
          </tr>`
        )
        .join('') || '<tr><td colspan="6">No required documents yet.</td></tr>'
    body.querySelectorAll('[data-edit-requirement]').forEach(button => {
      button.onclick = () => edit(rows.find(row => row.code === button.dataset.editRequirement))
    })
  }

  host.querySelector('[data-add-requirement]').onclick = () => edit(null)
  await load()
}
