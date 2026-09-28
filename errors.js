export function describeError(error, context = 'Request') {
  const message = String(error?.message || error || '')
  const code = String(error?.code || '')
  // Server-raised business rules (edit locks, full sections) are already readable; check them before the
  // auth rule, whose "session" match would otherwise turn an edit-session lock into "sign in again".
  if (/\b(capacity|full|locked)\b|edit session/i.test(message)) return `${context} failed: ${message}`
  if (code === '401' || /jwt|refresh token|session (has )?expired|not authenticated|unauthorized/i.test(message)) return `${context} failed: your session has expired. Sign in again.`
  if (code === '403' || code === '42501' || /row-level security|permission denied|forbidden/i.test(message)) return `${context} failed: you do not have permission for this action.`
  if (/relation .* does not exist|schema cache|PGRST205|PGRST202/i.test(message + code)) return `${context} failed: the database migration is missing. Apply the required migrations and retry.`
  if (/network|failed to fetch|offline|load failed/i.test(message)) return `${context} failed: the network is unavailable. Check your connection and retry.`
  if (code === '23505' || /duplicate key|unique constraint/i.test(message)) return `${context} failed: that record already exists.`
  if (code === '23503' || /foreign key constraint/i.test(message)) return `${context} failed: other records still depend on this one.`
  if (code === '23514' || code === '22P02' || /violates check constraint|invalid input syntax/i.test(message)) return `${context} failed: check the entered values.`
  return `${context} failed: ${message || 'an unexpected error occurred.'}`
}
