import { supabase } from '../shared/lib/auth-client.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml as escape, formatDate, errorRow } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { todayDateValue } from '../shared/lib/attendance.js'
import { mountAdminShell } from './admin-page.js'
import { withBusy } from '../shared/ui/shell.js'
import { mountRestoreChanges } from '../shared/ui/restore-changes.js'
import { mountFilterBar, yearFilter } from '../shared/ui/filter-bar.js'
import { currentSchoolYear } from '../shared/lib/grades.js'

await mountAdminShell('audit')

// "field: value" lines instead of a raw JSON blob; nested objects stay compact.
const detailText = details =>
  Object.entries(details || {})
    .map(
      ([key, value]) =>
        `${key.replaceAll('_', ' ')}: ${value !== null && typeof value === 'object' ? JSON.stringify(value) : (value ?? '-')}`
    )
    .join('\n') || '-'
const auditRow = row =>
  `<tr class="audit-card-row"><td data-label="When">${formatDate(row.created_at, true)}</td><td data-label="Action">${escape(row.action)}</td><td data-label="By">${escape([row.actor, row.ip_address].filter(Boolean).join(' · ') || '-')}</td><td data-label="Entity">${escape(`${row.entity_type || ''} ${row.entity_id || ''}`)}</td><td data-label="Details"><span class="audit-details-desktop">${escape(JSON.stringify(row.details || {}))}</span><span class="audit-details-mobile">${escape(detailText(row.details))}</span></td></tr>`

// An event belongs to the school year (June to May) of the day it happened.
const filters = mountFilterBar(document.getElementById('audit-filters'), {
  filters: [
    yearFilter(row => currentSchoolYear(new Date(row.created_at))),
    { key: 'action', all: 'All actions', get: row => row.action },
    { key: 'entity', all: 'All records', get: row => row.entity_type }
  ],
  onChange: () => renderAudit(),
  exportTable: () => document.getElementById('audit-table').closest('table'),
  filename: 'audit-events'
})
let auditEvents = []
function renderAudit() {
  document.getElementById('audit-table').innerHTML =
    filters.apply(auditEvents).map(auditRow).join('') || '<tr><td colspan="5">No audit events match these filters.</td></tr>'
}
async function loadAudit() {
  const table = document.getElementById('audit-table')
  const { data, error } = await supabase
    .from('audit_logs')
    .select('created_at,actor,ip_address,action,entity_type,entity_id,details')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return (table.innerHTML = errorRow(5, error, 'Load audit log'))
  auditEvents = data || []
  filters.update(auditEvents)
  renderAudit()
}

function auditRowsHtml(rows) {
  return (rows || []).map(auditRow).join('') || '<tr><td colspan="5">No audit events recorded for this date.</td></tr>'
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
    supabase
      .from('audit_logs')
      .select('created_at,actor,ip_address,action,entity_type,entity_id,details')
      .gte('created_at', `${date}T00:00:00Z`)
      .lt('created_at', nextDay.toISOString())
      .order('created_at')
  ])
  const error = archived.error || live.error
  if (error) return (target.innerHTML = `<p class="note" role="alert">${escape(describeError(error, 'Load archived actions'))}</p>`)
  const events = [...(archived.data?.events || []), ...(live.data || [])].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  )
  target.innerHTML = `<table class="audit-events-table"><thead><tr><th>Date</th><th>Action</th><th>By</th><th>Entity</th><th>Details</th></tr></thead><tbody>${auditRowsHtml(events)}</tbody></table>`
}

async function exportAudit() {
  const dateInput = document.getElementById('audit-date')
  const date = dateInput.value
  if (!date) {
    dateInput.setCustomValidity('Choose an audit date first.')
    dateInput.reportValidity()
    return dateInput.addEventListener('input', () => dateInput.setCustomValidity(''), { once: true })
  }
  await loadAuditArchive()
  const source = document.querySelector('#audit-archive-table table')
  if (!source) return
  const printArea = document.getElementById('audit-print-area')
  printArea.innerHTML = `<h1>Thompson Christian School</h1><h2>Audit Log - ${escape(date)}</h2>${source.outerHTML}`
  // The on-screen table is paged (rows beyond page 1 are hidden); the export must list every event.
  printArea.querySelectorAll('tr[hidden]').forEach(row => {
    row.hidden = false
  })
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
document.getElementById('refresh-restore').onclick = event =>
  withBusy(event.currentTarget, 'Refreshing…', () => mountRestoreChanges(restoreHost, { includeDeletedAccounts: true }))
await loadAudit()
await loadAuditArchive()
await mountRestoreChanges(restoreHost, { includeDeletedAccounts: true })
hideLoadingScreen()
