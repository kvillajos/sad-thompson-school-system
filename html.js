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
