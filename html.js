export const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))
}

export function formatDate(value, includeTime = false) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return includeTime ? date.toLocaleString() : date.toLocaleDateString()
}

export function gradeLabel(value) {
  return Number(value) === 0 ? 'Kindergarten' : `Grade ${value}`
}

export function gradeToNumber(value) {
  return value === 'Kindergarten' ? 0 : Number(String(value).replace('Grade ', ''))
}

export function gradeLevelOptions({ includeAll = false, allLabel = 'All Grades', includeKindergarten = true } = {}) {
  const grades = Array.from({ length: includeKindergarten ? 13 : 12 }, (_, index) => includeKindergarten ? index : index + 1)
  const options = includeAll ? [`<option value="">${escapeHtml(allLabel)}</option>`] : []
  return options.concat(grades.map(grade => `<option value="${grade}">${escapeHtml(gradeLabel(grade))}</option>`)).join('')
}
