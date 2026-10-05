import { supabase, requireRole, signOut } from '../shared/lib/auth-client.js'
import { applyUiTheme, toast } from '../shared/ui/ui-theme.js'
import { formDialog, noticeDialog } from '../shared/ui/dialog.js'
import { describeFunctionError } from '../shared/lib/errors.js'
import { mountProfile, mountSidebar } from '../shared/ui/shell.js'

const NAV = [
  ['Dashboard', '/role-admin/admin-dashboard.html', '⌂', 'dashboard'],
  ['Manage Accounts', '/role-admin/admin-accounts.html', '▣', 'accounts'],
  ['Manage Faculty', '/role-admin/admin-faculty.html', '♙', 'faculty'],
  ['Manage Sections', '/role-admin/admin-sections.html', '▤', 'sections'],
  ['Manage Subjects', '/role-admin/admin-subjects.html', '♧', 'subjects'],
  ['Manage Schedules', '/role-admin/admin-schedules.html', '▱', 'schedules'],
  ['Audit Trail', '/role-admin/admin-audit.html', '▤', 'audit']
]

export function adminNav(active) {
  return NAV.map(([label, href, icon, page]) => ({ label, href, icon, active: page === active }))
}

export async function mountAdminShell(active) {
  applyUiTheme()
  const user = await requireRole(1)
  if (!user) throw new Error('Unauthorized')
  mountProfile(user, 'Administrator', signOut)
  mountSidebar(adminNav(active), 'Administrative<br>Control', 'admin')
  return user
}

const FACULTY_FIELDS = [
  { name: 'employee_no', label: 'Employee No.', maxlength: 40 },
  { name: 'department', label: 'Department', maxlength: 80 },
  { name: 'specialization', label: 'Specialization (optional)', maxlength: 80 },
  { name: 'phone', label: 'Phone (optional)', maxlength: 40 }
]
export const facultyFields = (values = {}, required = true) => FACULTY_FIELDS.map(field => ({ ...field, value: values[field.name] ?? '', required: required && ['employee_no', 'department'].includes(field.name) }))

// Creates a staff login + its profile through provision-account and shows the one-time password.
// roleId = 3 fixes the role (Manage Faculty); without it the admin picks Faculty, Registrar or Administrator.
// Students are not created here: approving their admission application creates their account.
export async function createStaffAccount(roleId = null) {
  const values = await formDialog({
    title: roleId === 3 ? 'Add Faculty' : 'Add Account',
    message: 'The username and the @tcs.edu.ph email are made from the name. A temporary password is shown once at the end.',
    fields: [
      ...(roleId ? [] : [{ name: 'role_id', label: 'Role', options: [['3', 'Faculty'], ['2', 'Registrar'], ['1', 'Administrator']], required: true }]),
      { name: 'first_name', label: 'First name', required: true, maxlength: 80 },
      { name: 'middle_name', label: 'Middle name (optional)', maxlength: 80 },
      { name: 'last_name', label: 'Last name', required: true, maxlength: 80 },
      ...facultyFields({}, roleId === 3).map(field => roleId ? field : { ...field, label: `${field.label.replace(' (optional)', '')} (faculty only)` })
    ],
    confirmText: 'Create account'
  })
  if (!values) return null
  toast('Creating account…')
  const { data, error } = await supabase.functions.invoke('provision-account', { body: { action: 'create-account', ...values, role_id: Number(roleId || values.role_id) } })
  if (error) { toast(await describeFunctionError(error, 'Create account'), 'error'); return null }
  await noticeDialog(`Username: ${data.username}\nEmail: ${data.email}\nThe temporary password below is shown only once. Give it to the account owner; they can change it from the profile menu.`, { title: 'Account created', copyText: data.temporary_password })
  return data
}
