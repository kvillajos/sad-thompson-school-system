import { supabase } from './auth-client.js'
import { hideLoadingScreen } from './loading-screen.js'
import { escapeHtml as escape, formatDate, errorRow } from './html.js'
import { describeError } from './errors.js'
import { todayDateValue } from './attendance.js'
import { mountAdminShell } from './admin-page.js'
import { withBusy } from './shell.js'
import { mountRestoreChanges } from './restore-changes.js'

await mountAdminShell('audit')

// "field: value" lines instead of a raw JSON blob; nested objects stay compact.
const detailText = details => Object.entries(details || {}).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value !== null && typeof value === 'object' ? JSON.stringify(value) : value ?? '-'}`).join('\n') || '-'
const auditRow = row => `<tr><td>${formatDate(row.created_at, true)}</td><td>${escape(row.action)}</td><td>${escape(`${row.entity_type || ''} ${row.entity_id || ''}`)}</td><td style="white-space:pre-line">${escape(detailText(row.details))}</td></tr>`

async function loadAudit() {
  const table = document.getElementById('audit-table')
  const { data, error } = await supabase.from('audit_logs').select('created_at,action,entity_type,entity_id,details').order('created_at', { ascending: false }).limit(50)
  if (error) return table.innerHTML = errorRow(4, error, 'Load audit log')
  table.innerHTML = (data || []).map(auditRow).join('') || '<tr><td colspan="4">No audit events recorded.</td></tr>'
}

function auditRowsHtml(rows) {
  return (rows || []).map(auditRow).join('') || '<tr><td colspan="4">No audit events recorded for this date.</td></tr>'
}

async function loadAuditArchive() {
  const date = document.getElementById('audit-date').value
  if (!date) return
  const target = document.getElementById('audit-archive-table')
  target.innerHTML = '<p>Loading archived actions...</p>'
  // The last 3 days are still in audit_logs; older days are in the archive. Archive days are UTC dates, so the live query uses the same UTC day.
  const nextDay = new Date(`${date}T00:00:00Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const [archived, live] = await Promise.all([
    supabase.from('audit_log_archives').select('events').eq('archive_date', date).maybeSingle(),
    supabase.from('audit_logs').select('created_at,action,entity_type,entity_id,details').gte('created_at', `${date}T00:00:00Z`).lt('created_at', nextDay.toISOString()).order('created_at')
  ])
  const error = archived.error || live.error
  if (error) return target.innerHTML = `<p class="note" role="alert">${escape(describeError(error, 'Load archived actions'))}</p>`
  const events = [...(archived.data?.events || []), ...(live.data || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  target.innerHTML = `<table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>${auditRowsHtml(events)}</tbody></table>`
}

async function exportAudit() {
  const dateInput = document.getElementById('audit-date')
  const date = dateInput.value
  if (!date) { dateInput.setCustomValidity('Choose an audit date first.'); dateInput.reportValidity(); return dateInput.addEventListener('input', () => dateInput.setCustomValidity(''), { once: true }) }
  await loadAuditArchive()
  const source = document.querySelector('#audit-archive-table table')
  if (!source) return
  document.getElementById('audit-print-area').innerHTML = `<h1>Thompson Christian School</h1><h2>Audit Log - ${escape(date)}</h2>${source.outerHTML}`
  const previousTitle = document.title
  document.title = `audit-log-${date}`
  document.body.classList.add('printing-audit')
  window.print()
  document.body.classList.remove('printing-audit')
  document.title = previousTitle
}

document.getElementById('refresh-audit').onclick = event => withBusy(event.currentTarget, 'Refreshing…', loadAudit)
// Local date, not toISOString(): in the Philippines (UTC+8) the UTC date is still yesterday until 8 AM.
document.getElementById('audit-date').value = todayDateValue()
document.getElementById('audit-date').onchange = loadAuditArchive
document.getElementById('export-audit').onclick = exportAudit
const restoreHost = document.getElementById('restore-changes-host')
document.getElementById('refresh-restore').onclick = event => withBusy(event.currentTarget, 'Refreshing…', () => mountRestoreChanges(restoreHost, { includeDeletedAccounts: true }))
await loadAudit()
await loadAuditArchive()
await mountRestoreChanges(restoreHost, { includeDeletedAccounts: true })
hideLoadingScreen()
