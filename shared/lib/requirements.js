// Admission requirements checklist (pure; tested by dev/scripts/checks/check-requirements.mjs).
// Same rule as application_missing_requirements() in SQL (v58), which is what actually blocks approval.

const gradeOf = value => {
  const match = /\d+/.exec(String(value ?? ''))
  return match ? Number(match[0]) : null
}

// Grade 7 and Grade 11 are entry grades, so an applicant there is "new" unless marked otherwise.
export const admissionType = app => app.admission_type || ([7, 11].includes(gradeOf(app.grade_level)) ? 'new' : 'transferee')

export const ADMISSION_TYPES = [
  ['new', 'New student'],
  ['transferee', 'Transferee']
]

// The active requirement types that apply to this application, in display order.
export function requirementsFor(app, types = []) {
  const grade = gradeOf(app.grade_level)
  const type = admissionType(app)
  return types
    .filter(t => t.is_active !== false)
    .filter(t => !t.grade_levels?.length || t.grade_levels.includes(grade))
    .filter(t => !t.transferee_only || type === 'transferee')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label)))
}

// received: codes marked as received plus the document types uploaded for this application.
export function requirementStatus(app, types = [], received = new Set()) {
  const items = requirementsFor(app, types).map(t => ({
    code: t.code,
    label: t.label,
    required: t.required !== false,
    received: received.has(t.code)
  }))
  const required = items.filter(item => item.required)
  const missing = required.filter(item => !item.received).map(item => item.label)
  return { items, missing, done: required.length - missing.length, total: required.length, complete: missing.length === 0 }
}
