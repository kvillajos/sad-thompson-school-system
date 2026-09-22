import { supabase } from './auth-client.js'
import { hideLoadingScreen } from './loading-screen.js'
import { escapeHtml as escape, formatDate } from './html.js'
import { mountAdminShell } from './admin-page.js'

await mountAdminShell('audit')

async function loadAudit() {
  const table = document.getElementById('audit-table')
  const { data, error } = await supabase.from('audit_logs').select('created_at,action,entity_type,entity_id,details').order('created_at', { ascending: false }).limit(50)
  if (error) return table.innerHTML = `<tr><td colspan="4">${escape(error.message)}</td></tr>`
  table.innerHTML = (data || []).map(row => `<tr><td>${formatDate(row.created_at, true)}</td><td>${escape(row.action)}</td><td>${escape(`${row.entity_type || ''} ${row.entity_id || ''}`)}</td><td>${escape(JSON.stringify(row.details || {}))}</td></tr>`).join('') || '<tr><td colspan="4">No audit events recorded.</td></tr>'
}

function auditRowsHtml(rows) {
  return (rows || []).map(row => `<tr><td>${formatDate(row.created_at, true)}</td><td>${escape(row.action)}</td><td>${escape(`${row.entity_type || ''} ${row.entity_id || ''}`)}</td><td>${escape(JSON.stringify(row.details || {}))}</td></tr>`).join('') || '<tr><td colspan="4">No audit events recorded for this date.</td></tr>'
}

async function loadAuditArchive() {
  const date = document.getElementById('audit-date').value
  if (!date) return
  const target = document.getElementById('audit-archive-table')
  target.innerHTML = '<p>Loading archived actions...</p>'
  const { data: archive, error } = await supabase.from('audit_log_archives').select('events').eq('archive_date', date).maybeSingle()
  if (error) return target.innerHTML = `<p>${escape(error.message)}. Apply database/backupsqlmigration.sql first.</p>`
  target.innerHTML = `<table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>${auditRowsHtml(archive?.events || [])}</tbody></table>`
}

async function exportAudit() {
  const date = document.getElementById('audit-date').value
  if (!date) return window.alert('Choose an audit date first.')
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

document.getElementById('refresh-audit').onclick = loadAudit
document.getElementById('audit-date').value = new Date().toISOString().slice(0, 10)
document.getElementById('audit-date').onchange = loadAuditArchive
document.getElementById('export-audit').onclick = exportAudit
await loadAudit()
await loadAuditArchive()
hideLoadingScreen()
