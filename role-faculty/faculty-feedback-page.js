import { supabase } from '../shared/lib/auth-client.js'
import { loadFacultyContext, escapeHtml } from './faculty-common.js'
import { formatDate, errorRow } from '../shared/lib/html.js'
import { withBusy } from '../shared/ui/shell.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import { noticeDialog } from '../shared/ui/dialog.js'

// Faculty feedback and requests go to the admin's Feedback card (table registrar_feedback, tagged 'faculty').
// The database only lets a faculty member add rows under their own username and read their own rows (v45).
const context = await loadFacultyContext('feedback')
if (context) {
  const $ = id => document.getElementById(id)
  const PREVIEW = 40
  const short = text => (text.length > PREVIEW ? text.slice(0, PREVIEW).trimEnd() + '...' : text)
  let items = []

  const showItem = item => {
    const lines = [
      `Area: ${item.area}`,
      `Priority: ${item.priority}`,
      `Submitted: ${formatDate(item.created_at, true)}`,
      `Issue or request: ${item.pain_point}`,
      `Suggested fix: ${item.suggested_fix || '-'}`,
      item.status === 'fixed'
        ? `Status: Fixed by ${item.fixed_by || 'the admin'} on ${formatDate(item.fixed_at, true)}`
        : 'Status: Open, waiting for the admin',
      item.status === 'fixed' ? `What was done: ${item.fixed_reason || '-'}` : ''
    ]
    noticeDialog(lines.filter(Boolean).join('\n'), { title: 'My request', okText: 'Close' })
  }

  async function loadMine() {
    const { data, error } = await supabase
      .from('registrar_feedback')
      .select('id,area,priority,pain_point,suggested_fix,created_at,status,fixed_by,fixed_at,fixed_reason')
      .eq('submitted_role', 'faculty')
      .eq('submitted_by', context.user.username)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return ($('my-feedback-table').innerHTML = errorRow(5, error, 'Load my requests'))
    items = data || []
    $('my-feedback-table').innerHTML =
      items
        .map(
          item =>
            `<tr class="feedback-row" data-feedback="${item.id}"><td data-label="Submitted">${formatDate(item.created_at, true)}</td><td data-label="Area">${escapeHtml(item.area)}</td><td data-label="Priority"><span class="badge priority-${escapeHtml(String(item.priority).toLowerCase())}">${escapeHtml(item.priority)}</span></td><td data-label="Issue or request" title="Press to read the full text">${escapeHtml(short(item.pain_point))}</td><td data-label="Status">${item.status === 'fixed' ? '<span class="badge approved">Fixed</span>' : '<span class="badge pending">Open</span>'}</td></tr>`
        )
        .join('') || '<tr><td colspan="5">You have not sent any feedback yet.</td></tr>'
  }

  $('my-feedback-table').addEventListener('click', event => {
    const row = event.target.closest('[data-feedback]')
    if (row) showItem(items.find(item => String(item.id) === row.dataset.feedback))
  })

  $('faculty-feedback-form').onsubmit = event => {
    event.preventDefault()
    const form = event.target
    const values = Object.fromEntries(new FormData(form).entries())
    values.pain_point = values.pain_point.trim()
    values.suggested_fix = values.suggested_fix.trim() || null
    if (!values.pain_point) return form.elements.pain_point.reportValidity()
    return withBusy(event.submitter || form.querySelector('[type="submit"]'), 'Sending…', async () => {
      const { error } = await supabase
        .from('registrar_feedback')
        .insert({ ...values, submitted_by: context.user.username, submitted_role: 'faculty', status: 'open' })
      if (error) return toast(describeError(error, 'Send feedback'), 'error')
      toast('Sent to the admin. You can follow it under My Requests.')
      form.reset()
      await loadMine()
    })
  }

  await loadMine()
}
