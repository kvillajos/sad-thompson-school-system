import { describeError } from './errors.js'

export const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))
}

// A table row for a failed load: readable message plus a Retry button (handled globally in ui-theme.js).
export function errorRow(colspan, error, context = 'Load') {
  return `<tr class="table-state-error"><td colspan="${colspan}" role="alert">${escapeHtml(describeError(error, context))}<button type="button" class="table-retry">Retry</button></td></tr>`
}

export const activeStatus = isActive => isActive ? '<span class="badge active">Active</span>' : 'Inactive'

export function formatDate(value, includeTime = false) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return includeTime ? date.toLocaleString() : date.toLocaleDateString()
}

export function gradeLabel(value) {
  return Number(value) === 0 ? 'Kindergarten' : `Grade ${value}`
}

// subjects.grade_level is null for "All Grades", else an array of grades (see gradeLevelCheckboxes below).
export function gradeLevelSummary(value) {
  return value == null || !value.length ? 'All Grades' : value.map(gradeLabel).join(', ')
}

export function gradeToNumber(value) {
  return value === 'Kindergarten' ? 0 : Number(String(value).replace('Grade ', ''))
}

export function gradeLevelOptions({ includeAll = false, allLabel = 'All Grades', includeKindergarten = true } = {}) {
  const grades = Array.from({ length: includeKindergarten ? 13 : 12 }, (_, index) => includeKindergarten ? index : index + 1)
  const options = includeAll ? [`<option value="">${escapeHtml(allLabel)}</option>`] : []
  return options.concat(grades.map(grade => `<option value="${grade}">${escapeHtml(gradeLabel(grade))}</option>`)).join('')
}

// Same grade choices as gradeLevelOptions, but as a tile grid of checkboxes (several grades picked, like
// the auto-assign grade picker's .grade-picker/.grade-option/.grade-check styles) instead of a dropdown.
// Pass an <input value=""> "All Grades" tile and bindExclusiveGradePicker() to make it exclusive with the rest.
export function gradeLevelCheckboxes(name, { includeAll = false, allLabel = 'All Grades', includeKindergarten = true } = {}) {
  const grades = Array.from({ length: includeKindergarten ? 13 : 12 }, (_, index) => includeKindergarten ? index : index + 1)
  const tile = (value, label, checked) => `<label class="grade-option"><input type="checkbox" name="${escapeHtml(name)}" value="${value}"${checked ? ' checked' : ''}><span class="grade-check" aria-hidden="true"></span><span>${escapeHtml(label)}</span></label>`
  const tiles = includeAll ? [tile('', allLabel, true)] : []
  return tiles.concat(grades.map(grade => tile(grade, gradeLabel(grade), false))).join('')
}

// Checking the value="" ("All Grades") tile unchecks every other tile in the picker, and checking
// any other tile unchecks "All Grades" - the two are mutually exclusive, everything else is multi-select.
export function bindExclusiveGradePicker(container) {
  container.addEventListener('change', event => {
    const boxes = [...container.querySelectorAll('input[type=checkbox]')]
    const all = boxes.find(box => box.value === '')
    if (!all) return
    if (event.target === all) { if (all.checked) boxes.forEach(box => { if (box !== all) box.checked = false }) }
    else if (event.target.checked) all.checked = false
  })
}

// Reads a gradeLevelCheckboxes() picker back into subjects.grade_level's shape: null for "All Grades", else a sorted number array.
export function readGradePicker(container) {
  const boxes = [...container.querySelectorAll('input[type=checkbox]')]
  if (boxes.find(box => box.value === '')?.checked) return null
  return boxes.filter(box => box.value !== '' && box.checked).map(box => Number(box.value)).sort((a, b) => a - b)
}

// Checks the tiles matching subjects.grade_level's shape (null -> "All Grades", array -> those grades).
export function setGradePicker(container, gradeLevel) {
  const values = new Set(gradeLevel == null ? [''] : gradeLevel.map(String))
  container.querySelectorAll('input[type=checkbox]').forEach(box => { box.checked = values.has(box.value) })
}

// Announcement bodies are written in a small rich-text editor and shown to other users, so they are
// rebuilt from a whitelist: only basic formatting tags, and only text-align / indent styles survive.
// Older plain-text messages (no tags) are escaped and keep their line breaks.
const RICH_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'BLOCKQUOTE', 'H3'])
export function richText(value = '') {
  const text = String(value ?? '')
  if (!/<[a-z][\s\S]*>/i.test(text)) return escapeHtml(text).replace(/\n/g, '<br>')
  const clean = node => {
    let out = ''
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) return void (out += escapeHtml(child.nodeValue))
      if (child.nodeType !== 1) return
      const tag = child.tagName
      if (!RICH_TAGS.has(tag)) return void (out += clean(child))
      const style = []
      const align = /text-align:\s*(left|center|right|justify)/i.exec(child.getAttribute('style') || '')
      const indent = /margin-left:\s*(\d{1,3})px/i.exec(child.getAttribute('style') || '')
      if (align) style.push(`text-align:${align[1].toLowerCase()}`)
      if (indent) style.push(`margin-left:${Math.min(Number(indent[1]), 240)}px`)
      if (tag === 'BLOCKQUOTE') style.push('margin-left:32px') // execCommand('indent') output
      const attr = style.length ? ` style="${style.join(';')}"` : ''
      out += tag === 'BR' ? '<br>' : `<${tag.toLowerCase()}${attr}>${clean(child)}</${tag.toLowerCase()}>`
    })
    return out
  }
  return clean(new DOMParser().parseFromString(text, 'text/html').body)
}
