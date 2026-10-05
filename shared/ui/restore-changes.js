// "Restore Changes" list shared by the admin audit trail and the registrar tab. The server decides
// what each role may see and restore (list_change_groups / restore_change_group, migration v33):
// admins get every change, registrars only their own, and nothing older than 30 days.
import { supabase } from '../lib/auth-client.js'
import { escapeHtml as escape, formatDate } from '../lib/html.js'
import { confirmDialog } from './dialog.js'
import { toast } from './ui-theme.js'
import { withBusy } from './shell.js'
import { describeError, describeFunctionError } from '../lib/errors.js'

const TABLE_LABELS = {
  students: 'Student', admission_applications: 'Application', application_documents: 'Document',
  enrollments: 'Enrollment', sections: 'Section', subjects: 'Subject', subject_schedules: 'Schedule',
  faculty_subjects: 'Faculty load', announcements: 'Announcement', staff_profiles: 'Staff profile',
  academic_history: 'Grade', attendance: 'Attendance', school_year_settings: 'School year settings'
}
const OPERATION_LABELS = { INSERT: 'Added', UPDATE: 'Edited', DELETE: 'Deleted' }
const ROLE_NAMES = { 1: 'Administrator', 2: 'Registrar', 3: 'Faculty', 4: 'Student' }
const expiresOn = date => formatDate(new Date(new Date(date).getTime() + 30 * 24 * 60 * 60 * 1000))

export async function mountRestoreChanges(host, { includeDeletedAccounts = false } = {}) {
  host.innerHTML = '<p>Loading changes…</p>'
  const [changes, accounts] = await Promise.all([
    supabase.rpc('list_change_groups', { p_limit: 200 }),
    includeDeletedAccounts
      ? supabase.from('users').select('user_id,username,email,role_id,deleted_at,deleted_by').not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
      : Promise.resolve({ data: [] })
  ])
  const failure = changes.error || accounts.error
  if (failure) { host.innerHTML = `<p class="note" role="alert">${escape(describeError(failure, 'Load changes'))}</p>`; return }

  const accountRows = (accounts.data || []).map(item => `<tr><td>${escape(item.username)}</td><td>${ROLE_NAMES[item.role_id] || 'Unknown'}</td><td>${formatDate(item.deleted_at, true)}</td><td>${escape(item.deleted_by || '-')}</td><td>${expiresOn(item.deleted_at)}</td><td><button type="button" class="admin-view" data-restore-account="${item.user_id}">Restore</button></td></tr>`).join('')
  const accountsHtml = includeDeletedAccounts
    ? `<h4>Deleted Accounts</h4><table data-no-sort><thead><tr><th>Username</th><th>Role</th><th>Deleted</th><th>Deleted by</th><th>Erased on</th><th>Action</th></tr></thead><tbody>${accountRows || '<tr><td colspan="6">No deleted accounts.</td></tr>'}</tbody></table><h4>Recent Changes</h4>`
    : ''

  const groups = changes.data || []
  const changeRows = groups.map(group => {
    const what = [...new Set(group.tables.map(table => TABLE_LABELS[table] || table))].join(', ')
    const change = group.operations.map(operation => OPERATION_LABELS[operation] || operation).join(' / ')
    const action = group.restored_at
      ? `Restored ${formatDate(group.restored_at, true)}`
      : `<button type="button" class="admin-view" data-restore-group="${group.change_group}">Restore</button><br><small>until ${expiresOn(group.changed_at)}</small>`
    return `<tr><td>${formatDate(group.changed_at, true)}</td><td>${escape(group.changed_by || '-')}</td><td><b>${escape(group.label || '-')}</b><br><small>${escape(what)}${group.row_count > 1 ? ` · ${group.row_count} records` : ''}</small></td><td>${escape(change)}</td><td>${action}</td></tr>`
  }).join('')
  host.innerHTML = `${accountsHtml}<table data-no-sort><thead><tr><th>When</th><th>By</th><th>What</th><th>Change</th><th>Action</th></tr></thead><tbody>${changeRows || '<tr><td colspan="5">No changes in the last 30 days.</td></tr>'}</tbody></table>`

  host.querySelectorAll('[data-restore-group]').forEach(button => button.onclick = async () => {
    const group = groups.find(item => String(item.change_group) === button.dataset.restoreGroup)
    const warning = group.has_newer ? 'These records were changed again after this. Restoring puts them back to how they were before this change, which also undoes the later edits.' : ''
    const records = group.row_count > 1 ? `${group.row_count} records` : '1 record'
    if (!await confirmDialog(`Restore "${group.label}" (${records}) to how it was before this change on ${formatDate(group.changed_at, true)}?`, { title: 'Restore change', confirmText: 'Restore', warning })) return
    await withBusy(button, 'Restoring…', async () => {
      const { error } = await supabase.rpc('restore_change_group', { p_group: group.change_group })
      if (error) return toast(describeError(error, 'Restore change'), 'error')
      toast('Change restored.')
      await mountRestoreChanges(host, { includeDeletedAccounts })
    })
  })
  host.querySelectorAll('[data-restore-account]').forEach(button => button.onclick = async () => {
    const item = (accounts.data || []).find(account => String(account.user_id) === button.dataset.restoreAccount)
    if (!await confirmDialog(`Restore the account "${item.username}"? It reappears in Manage Accounts and can sign in again if it was active before it was deleted.`, { title: 'Restore account', confirmText: 'Restore' })) return
    await withBusy(button, 'Restoring…', async () => {
      const { error } = await supabase.functions.invoke('provision-account', { body: { user_id: Number(item.user_id), action: 'restore-account' } })
      if (error) return toast(await describeFunctionError(error, 'Restore account'), 'error')
      toast(`${item.username} restored.`)
      await mountRestoreChanges(host, { includeDeletedAccounts })
    })
  })
}
