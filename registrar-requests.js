import { supabase } from './auth-client.js'
import { toast } from './ui-theme.js'
import { withBusy } from './shell.js'
import { $ } from './registrar-state.js'
import { escapeHtml, formatDate } from './html.js'
import { mountOverrideForm } from './override-form.js'

mountOverrideForm($('override-form'), { rpc: 'request_capacity_override', button: 'Send for Approval', done: 'Override request sent to the admin.' })

export async function loadMyRequests() {
  const { data, error } = await supabase.from('approval_requests').select('summary,status,remarks,created_at').order('created_at', { ascending: false }).limit(30)
  $('my-requests-table').innerHTML = error
    ? `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`
    : (data || []).map(item => `<tr><td>${escapeHtml(item.summary)}</td><td>${escapeHtml(item.status)}</td><td>${formatDate(item.created_at, true)}</td><td>${escapeHtml(item.remarks || '-')}</td></tr>`).join('') || '<tr><td colspan="4">No requests yet.</td></tr>'
}

$('account-request-action').onchange = () => $('account-request-role-field').classList.toggle('hidden', $('account-request-action').value !== 'role_change')

$('account-request-form').addEventListener('submit', async event => {
  event.preventDefault()
  await withBusy(event.target.querySelector('button.btn'), 'Sending…', async () => {
    const { error } = await supabase.rpc('request_account_action', {
      p_username: $('account-request-username').value, p_action: $('account-request-action').value,
      p_new_role: $('account-request-action').value === 'role_change' ? Number($('account-request-role').value) : null,
      p_reason: $('account-request-reason').value
    })
    if (error) return toast(error.message, 'error')
    toast('Request sent to the admin.')
    event.target.reset()
    await loadMyRequests()
  })
})

// Browser-style tabs so the four forms/lists don't have to be scrolled through.
const subtabs = [...document.querySelectorAll('[data-subtab]')]
subtabs.forEach(tab => tab.addEventListener('click', () => {
  subtabs.forEach(item => { item.classList.toggle('active', item === tab); item.setAttribute('aria-selected', String(item === tab)) })
  document.querySelectorAll('[data-subpanel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.subpanel !== tab.dataset.subtab))
  if (tab.dataset.subtab === 'mine') loadMyRequests()
}))
