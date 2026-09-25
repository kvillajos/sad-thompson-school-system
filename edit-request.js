// Pure helpers for the student "Request an Edit" flow (asserted by scripts/check-edit-request.mjs).
const norm = value => String(value ?? '').trim()

// Only the boxes the student really changed: { field: newValue }. Untouched boxes are left out so they never change.
export function changedFields(current, values) {
  const changes = {}
  for (const [field, value] of Object.entries(values || {})) if (norm(value) !== norm(current?.[field])) changes[field] = norm(value)
  return changes
}

// Fields whose value in the record no longer matches what the student saw when they sent the request.
export const staleFields = (before, record) => Object.keys(before || {}).filter(field => norm(before[field]) !== norm(record?.[field]))
