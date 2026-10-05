import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'
import { $ } from './registrar-state.js'
import { escapeHtml, formatDate, errorRow, gradeLabel, activeStatus } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { mountOverrideForm } from './override-form.js'
import { searchPicker } from './search-picker.js'

mountOverrideForm($('override-form'), { rpc: 'request_capacity_override', button: 'Send for Approval', done: 'Override request sent to the admin.' })

export async function loadMyRequests() {
  const { data, error } = await supabase.from('approval_requests').select('summary,status,remarks,created_at').order('created_at', { ascending: false }).limit(30)
  $('my-requests-table').innerHTML = error
    ? errorRow(4, error, 'Load your requests')
    : (data || []).map(item => `<tr><td>${escapeHtml(item.summary)}</td><td>${escapeHtml(item.status)}</td><td>${formatDate(item.created_at, true)}</td><td>${escapeHtml(item.remarks || '-')}</td></tr>`).join('') || '<tr><td colspan="4">No requests yet.</td></tr>'
}

// Registrars cannot read users directly, so the search goes through registrar_find_accounts(). Picking an
// account shows who owns it, so the request is checked against the right person before it is sent.
const roleNames = { 2: 'Registrar', 3: 'Faculty', 4: 'Student' }
let requestTarget = null
const showRequestTarget = () => {
  const panel = $('account-request-details')
  panel.classList.toggle('hidden', !requestTarget)
  if (!requestTarget) return panel.innerHTML = ''
  const a = requestTarget
  const rows = [['Name', a.full_name || '-'], ['Username', a.username], ['Email', a.email], ['Role', roleNames[a.role_id] || '-'],
    ...(a.role_id === 4 ? [['LRN', a.lrn_number || '-'], ['Grade', a.grade_level == null ? '-' : gradeLabel(a.grade_level)]] : []),
    ['Account created', formatDate(a.created_at)]]
  panel.innerHTML = `<div class="review-grid">${rows.map(([label, value]) => `<div><b>${label}</b><p>${escapeHtml(value)}</p></div>`).join('')}<div><b>Status</b><p>${activeStatus(a.is_active)}</p></div></div>`
}
const accountPicker = searchPicker($('account-request-search'), {
  minLength: 2,
  search: async query => {
    const { data, error } = await supabase.rpc('registrar_find_accounts', { p_query: query })
    if (error) { toast(describeError(error, 'Search accounts'), 'error'); return [] }
    return data
  },
  render: a => `<span>${escapeHtml(a.full_name || a.username)}</span><small>${escapeHtml(a.username)} · ${roleNames[a.role_id] || 'Account'}</small>`,
  text: a => `${a.full_name || a.username} (${a.username})`,
  onPick: a => { requestTarget = a; showRequestTarget() },
  emptyText: 'No account matches. Admin accounts cannot be requested here.'
})

$('account-request-action').onchange = () => $('account-request-role-field').classList.toggle('hidden', $('account-request-action').value !== 'role_change')

$('account-request-form').addEventListener('submit', async event => {
  event.preventDefault()
  if (!requestTarget) return toast('Search for the account and pick it from the list first.', 'error')
  await withBusy(event.target.querySelector('button.btn'), 'Sending…', async () => {
    const { error } = await supabase.rpc('request_account_action', {
      p_username: requestTarget.username, p_action: $('account-request-action').value,
      p_new_role: $('account-request-action').value === 'role_change' ? Number($('account-request-role').value) : null,
      p_reason: $('account-request-reason').value
    })
    if (error) return toast(describeError(error, 'Send request'), 'error')
    toast('Request sent to the admin.')
    event.target.reset()
    accountPicker.clear()
    $('account-request-role-field').classList.add('hidden')
    await loadMyRequests()
  })
})

// Browser-style tabs so forms/lists don't have to be scrolled through. Each tab group only
// switches the panels in its own section, so several sections can have sub-tabs.
document.querySelectorAll('[data-subtab]').forEach(tab => tab.addEventListener('click', () => {
  const section = tab.closest('[data-panel]')
  section.querySelectorAll('[data-subtab]').forEach(item => { item.classList.toggle('active', item === tab); item.setAttribute('aria-selected', String(item === tab)) })
  section.querySelectorAll('[data-subpanel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.subpanel !== tab.dataset.subtab))
  if (tab.dataset.subtab === 'mine') loadMyRequests()
}))
