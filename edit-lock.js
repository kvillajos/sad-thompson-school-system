// Registrar edit-lock decision shared by the admin dashboard.
// Mirrors review_admission_application's 10-minute stale-lock window in
// database/backupsqlmigration.sql — keep new workflow changes in separate edit migrations.
export const EDIT_LOCK_WINDOW_MS = 10 * 60 * 1000

export function isEditLocked(application, now = Date.now()) {
  if (!application?.editing_by || !application?.editing_since) return false
  const since = new Date(application.editing_since).getTime()
  return Number.isFinite(since) && since > now - EDIT_LOCK_WINDOW_MS
}

export function editLockMessage(application) {
  return `${application.editing_by} is correcting this application right now. Approve/Decline stay disabled until they save or close the form.`
}
