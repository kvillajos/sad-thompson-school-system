// Admission requirements: a status badge for application lists and the tick-list shown when an application
// is opened. Approval itself is blocked in the database (v58) while a required item is missing.
import { supabase } from '../lib/auth-client.js'
import { fetchAll } from '../lib/fetch-all.js'
import { escapeHtml } from '../lib/html.js'
import { describeError } from '../lib/errors.js'
import { ADMISSION_TYPES, admissionType, requirementStatus } from '../lib/requirements.js'
import { toast } from './ui-theme.js'
import { formDialog } from './dialog.js'

let data = null // { types, received: Map(appId -> Set(code)), uploaded: Map(appId -> Set(code)), overrides: Map(appId -> request) }

const addTo = (map, key, value) => (map.get(key) || map.set(key, new Set()).get(key)).add(value)

// Loads every application's marks, uploads and override requests at once. Returns false before v58 is applied.
export async function loadRequirementData() {
  const [types, marks, docs, overrides] = await Promise.all([
    supabase.from('requirement_types').select('code,label,grade_levels,transferee_only,required,sort_order,is_active').order('sort_order'),
    fetchAll(() => supabase.from('application_requirements').select('application_id,code').order('application_id').order('code')),
    fetchAll(() => supabase.from('application_documents').select('id,application_id,document_type').order('id')),
    supabase
      .from('approval_requests')
      .select('id,status,payload,remarks,created_at')
      .eq('request_type', 'requirements_override')
      .order('created_at', { ascending: false })
  ])
  if (types.error) {
    data = null
    return false
  }
  data = { types: types.data || [], received: new Map(), uploaded: new Map(), overrides: new Map() }
  ;(marks.data || []).forEach(row => addTo(data.received, row.application_id, row.code))
  ;(docs.data || []).forEach(row => addTo(data.uploaded, row.application_id, row.document_type))
  ;(overrides.data || []).forEach(row => {
    const id = Number(row.payload?.application_id)
    if (!data.overrides.has(id)) data.overrides.set(id, row) // newest first
  })
  return true
}

const statusOf = app => {
  const codes = new Set([...(data.received.get(app.id) || []), ...(data.uploaded.get(app.id) || [])])
  return requirementStatus(app, data.types, codes)
}

// "Complete", "2 of 4" or "Override approved"; '-' before v58 or for drafts.
export function requirementBadge(app) {
  if (!data || app.status === 'draft') return '-'
  const status = statusOf(app)
  if (status.complete) return '<span class="badge completed">Complete</span>'
  if (data.overrides.get(app.id)?.status === 'approved') return '<span class="badge completed">Override approved</span>'
  return `<span class="badge pending" title="Missing: ${escapeHtml(status.missing.join(', '))}">${status.done} of ${status.total}</span>`
}

// Tick-list for one application. editable: the registrar can mark items and request an override.
export async function mountRequirementChecklist(host, app, { editable = false, onChange } = {}) {
  if (!host) return
  if (!data) await loadRequirementData()
  if (!data) return (host.innerHTML = '<p class="note">The requirements checklist is not set up yet.</p>')
  const status = statusOf(app)
  const uploaded = data.uploaded.get(app.id) || new Set()
  const override = data.overrides.get(app.id)
  const typeLabel = Object.fromEntries(ADMISSION_TYPES)[admissionType(app)]
  host.innerHTML = `
    <p class="note">${escapeHtml(typeLabel)}${app.admission_type ? '' : ' (from the grade level)'} · ${status.complete ? 'All required items received.' : `Missing: ${escapeHtml(status.missing.join(', '))}`}</p>
    <ul class="document-list requirement-list">${
      status.items
        .map(
          item =>
            `<li><label><input type="checkbox" data-requirement="${escapeHtml(item.code)}"${item.received ? ' checked' : ''}${
              !editable || uploaded.has(item.code) ? ' disabled' : ''
            }> ${escapeHtml(item.label)}${item.required ? '' : ' <small>(optional)</small>'}${uploaded.has(item.code) ? ' <small>(uploaded)</small>' : ''}</label></li>`
        )
        .join('') || '<li>No requirements apply.</li>'
    }</ul>
    ${
      override
        ? `<p class="note">Override request: <span class="badge ${escapeHtml(override.status)}">${escapeHtml(override.status)}</span>${override.remarks ? ` · ${escapeHtml(override.remarks)}` : ''}</p>`
        : ''
    }
    ${editable && !status.complete && (!override || override.status === 'rejected') ? '<button type="button" class="admin-secondary" data-request-override>Request override</button>' : ''}`

  host.querySelectorAll('[data-requirement]').forEach(box => {
    box.onchange = async () => {
      box.disabled = true
      const code = box.dataset.requirement
      const result = box.checked
        ? await supabase.from('application_requirements').insert({ application_id: app.id, code })
        : await supabase.from('application_requirements').delete().eq('application_id', app.id).eq('code', code)
      if (result.error) {
        box.checked = !box.checked
        box.disabled = false
        return toast(describeError(result.error, 'Update requirement'), 'error')
      }
      const set = data.received.get(app.id) || new Set()
      box.checked ? set.add(code) : set.delete(code)
      data.received.set(app.id, set)
      await mountRequirementChecklist(host, app, { editable, onChange })
      onChange?.()
    }
  })

  const request = host.querySelector('[data-request-override]')
  if (request)
    request.onclick = async () => {
      const values = await formDialog({
        title: 'Request requirements override',
        message: `Missing: ${status.missing.join(', ')}. The admin decides in Pending Approvals; once approved, this application can be approved without them.`,
        fields: [
          { name: 'reason', label: 'Reason (e.g. PSA certificate to follow by July 15)', multiline: true, required: true, maxlength: 500 }
        ],
        confirmText: 'Send request'
      })
      if (!values) return
      const { error } = await supabase.rpc('request_requirements_override', { p_application_id: app.id, p_reason: values.reason })
      if (error) return toast(describeError(error, 'Request override'), 'error')
      toast('Override request sent to the admin.')
      await loadRequirementData()
      await mountRequirementChecklist(host, app, { editable, onChange })
      onChange?.()
    }
}
