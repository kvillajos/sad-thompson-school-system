export function describeError(error, context = 'Request') {
  const message = String(error?.message || error || '')
  const code = String(error?.code || '')
  if (code === '401' || /jwt|token|session|unauthorized/i.test(message)) return `${context} failed: your session has expired. Sign in again.`
  if (code === '403' || /row-level security|permission denied|forbidden/i.test(message)) return `${context} failed: you do not have permission for this action.`
  if (/relation .* does not exist|schema cache|PGRST205/i.test(message)) return `${context} failed: the database migration is missing. Apply the required migrations and retry.`
  if (/network|fetch|offline|failed to fetch/i.test(message)) return `${context} failed: the network is unavailable. Check your connection and retry.`
  if (/duplicate key|unique constraint/i.test(message)) return `${context} failed: that record already exists.`
  if (/check constraint|must be|invalid|between 0 and 100/i.test(message)) return `${context} failed: check the entered values.`
  if (/capacity|full|locked|edit session/i.test(message)) return `${context} failed: ${message}`
  return `${context} failed: ${message || 'an unexpected error occurred.'}`
}
