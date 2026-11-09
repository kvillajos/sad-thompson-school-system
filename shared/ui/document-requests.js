// Document requests (table document_requests, v62): Form 137, Good Moral, Certificate of Enrollment.
//   mountStudentDocumentRequests(host)   the student's form and their requests' status
//   mountRegistrarDocumentRequests(host) the registrar's queue: approve / reject / ready / released
import { supabase } from '../lib/auth-client.js'
import { escapeHtml, errorRow, formatDate, lastFirst } from '../lib/html.js'
import { describeError } from '../lib/errors.js'
import { fetchAll } from '../lib/fetch-all.js'
import { confirmDialog, formDialog } from './dialog.js'
import { toast } from './ui-theme.js'
import { withBusy } from './shell.js'

export const DOCUMENT_TYPES = [
  ['form_137', 'Form 137 (SF10)'],
  ['good_moral', 'Good Moral Certificate'],
  ['coe', 'Certificate of Enrollment']
]
const typeLabel = Object.fromEntries(DOCUMENT_TYPES)
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', ready: 'Ready for pickup', released: 'Released' }
const STATUS_BADGE = { pending: 'pending', approved: 'approved', rejected: 'rejected', ready: 'completed', released: 'graduated' }
const statusBadge = status => `<span class="badge ${STATUS_BADGE[status] || ''}">${escapeHtml(STATUS_LABEL[status] || status)}</span>`

export async function mountStudentDocumentRequests(host) {
  if (!host) return
  host.innerHTML = `
    <div class="admin-section-title"><h3>Request a Document</h3></div>
    <form class="student-request-form" data-doc-form>
      <label>Document<select name="document_type" required>${DOCUMENT_TYPES.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('')}</select></label>
      <label>Copies<input name="copies" type="number" min="1" max="5" step="1" value="1" required></label>
      <label>Purpose<input name="purpose" maxlength="300" required placeholder="e.g. Transfer to another school, scholarship application"></label>
      <div class="student-request-submit"><small class="admin-note">The Registrar's Office tells you here (and in your notifications) when it is ready for pickup.</small><button class="admin-primary" type="submit">Request document</button></div>
    </form>
    <table><thead><tr><th>Document</th><th>Purpose</th><th>Requested</th><th>Status</th><th>Note</th></tr></thead><tbody data-doc-rows><tr><td colspan="5">Loading…</td></tr></tbody></table>`
  const body = host.querySelector('[data-doc-rows]')
  const load = async () => {
    const { data, error } = await supabase
      .from('document_requests')
      .select('id,document_type,purpose,copies,status,remarks,created_at')
      .order('created_at', { ascending: false })
    if (error) return (body.innerHTML = errorRow(5, error, 'Load document requests'))
    body.innerHTML =
      (data || [])
        .map(
          row =>
            `<tr><td data-label="Document">${escapeHtml(typeLabel[row.document_type])}${row.copies > 1 ? ` ×${row.copies}` : ''}</td><td data-label="Purpose">${escapeHtml(row.purpose)}</td><td data-label="Requested">${escapeHtml(formatDate(row.created_at))}</td><td data-label="Status">${statusBadge(row.status)}</td><td data-label="Note">${escapeHtml(row.remarks || '-')}</td></tr>`
        )
        .join('') || '<tr><td colspan="5">No document requests yet.</td></tr>'
  }
  const form = host.querySelector('[data-doc-form]')
  form.onsubmit = event => {
    event.preventDefault()
    return withBusy(form.querySelector('[type="submit"]'), 'Sending…', async () => {
      const values = Object.fromEntries(new FormData(form).entries())
      const { error } = await supabase.rpc('submit_document_request', {
        p_document_type: values.document_type,
        p_purpose: values.purpose.trim(),
        p_copies: Number(values.copies)
      })
      if (error) return toast(describeError(error, 'Request document'), 'error')
      form.reset()
      toast('Request sent to the Registrar.')
      await load()
    })
  }
  await load()
}

// Next steps the registrar can take from each status.
const NEXT = {
  pending: [
    ['approved', 'Approve', 'admin-approve'],
    ['rejected', 'Reject', 'admin-remove']
  ],
  approved: [
    ['ready', 'Ready for pickup', 'admin-approve'],
    ['rejected', 'Reject', 'admin-remove']
  ],
  ready: [['released', 'Released', 'admin-approve']]
}

export async function mountRegistrarDocumentRequests(host) {
  if (!host) return
  host.innerHTML = `
    <div class="filterbar">
      <select data-doc-status aria-label="Status"><option value="open">Open (pending, approved, ready)</option>${Object.entries(
        STATUS_LABEL
      )
        .map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`)
        .join('')}<option value="">All</option></select>
      <input type="search" data-doc-search maxlength="100" placeholder="Search student or document" />
    </div>
    <table><thead><tr><th>Requested</th><th>Student</th><th>Document</th><th>Purpose</th><th>Status</th><th>Actions</th></tr></thead><tbody data-doc-rows><tr><td colspan="6">Loading…</td></tr></tbody></table>`
  const body = host.querySelector('[data-doc-rows]')
  let rows = []
  const render = () => {
    const status = host.querySelector('[data-doc-status]').value
    const search = host.querySelector('[data-doc-search]').value.trim().toLowerCase()
    const visible = rows
      .filter(row => (status === 'open' ? ['pending', 'approved', 'ready'].includes(row.status) : !status || row.status === status))
      .filter(
        row =>
          !search || `${lastFirst(row.students)} ${row.students?.lrn_number} ${typeLabel[row.document_type]}`.toLowerCase().includes(search)
      )
    body.innerHTML =
      visible
        .map(
          row => `<tr>
            <td data-label="Requested">${escapeHtml(formatDate(row.created_at))}</td>
            <td data-label="Student">${escapeHtml(lastFirst(row.students))} <small>${escapeHtml(row.students?.lrn_number || '')}${row.students?.enrollment_status === 'Graduated' ? ' · Graduate' : ''}</small></td>
            <td data-label="Document">${escapeHtml(typeLabel[row.document_type])}${row.copies > 1 ? ` ×${row.copies}` : ''}</td>
            <td data-label="Purpose">${escapeHtml(row.purpose)}</td>
            <td data-label="Status">${statusBadge(row.status)}${row.remarks ? `<br><small>${escapeHtml(row.remarks)}</small>` : ''}</td>
            <td data-label="Actions">${(NEXT[row.status] || [])
              .map(
                ([next, label, cls]) =>
                  `<button type="button" class="${cls} small" data-doc-id="${row.id}" data-doc-next="${next}">${label}</button>`
              )
              .join(' ')}</td>
          </tr>`
        )
        .join('') || '<tr><td colspan="6">No matching requests.</td></tr>'
    body.querySelectorAll('[data-doc-next]').forEach(button => {
      button.onclick = () =>
        advance(
          rows.find(row => row.id === Number(button.dataset.docId)),
          button.dataset.docNext,
          button
        )
    })
  }
  const load = async () => {
    const { data, error } = await fetchAll(() =>
      supabase
        .from('document_requests')
        .select(
          'id,student_id,document_type,purpose,copies,status,remarks,created_at,students(first_name,last_name,lrn_number,enrollment_status)'
        )
        .order('created_at', { ascending: false })
        .order('id')
    )
    if (error) return (body.innerHTML = errorRow(6, error, 'Load document requests'))
    rows = data || []
    render()
  }
  async function advance(row, next, button) {
    let remarks = null
    if (next === 'rejected') {
      const values = await formDialog({
        title: 'Reject document request',
        message: `${typeLabel[row.document_type]} for ${lastFirst(row.students)}. The student sees this reason.`,
        fields: [{ name: 'remarks', label: 'Reason', multiline: true, required: true, maxlength: 500 }],
        confirmText: 'Reject',
        danger: true
      })
      if (!values) return
      remarks = values.remarks
    } else if (
      !(await confirmDialog(
        `Mark the ${typeLabel[row.document_type]} for ${lastFirst(row.students)} as ${STATUS_LABEL[next]}? The student is notified.`,
        {
          title: STATUS_LABEL[next],
          confirmText: STATUS_LABEL[next]
        }
      ))
    )
      return
    await withBusy(button, 'Saving…', async () => {
      const { error } = await supabase.rpc('set_document_request_status', { p_id: row.id, p_status: next, p_remarks: remarks })
      if (error) return toast(describeError(error, 'Update document request'), 'error')
      toast(`Marked ${STATUS_LABEL[next].toLowerCase()}.`)
      await load()
    })
  }
  host.querySelector('[data-doc-status]').onchange = render
  host.querySelector('[data-doc-search]').oninput = render
  await load()
}
