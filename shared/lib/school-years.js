// School years (table school_years) for pickers, plus the status rule school_year_status() uses in SQL.
import { supabase } from './auth-client.js'
import { escapeHtml } from './html.js'
import { currentSchoolYear } from './grades.js'

export const todayManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

// Upcoming / Active / Past from the dates; a year closed early (closed_at, v57) is Past.
export function yearStatus(year, today = todayManila()) {
  if (year.closed_at) return 'Past'
  if (today < year.start_date) return 'Upcoming'
  if (today > year.end_date) return 'Past'
  return 'Active'
}

// Newest first. Falls back to the plain columns before v57 adds enrollment_open / closed_at.
export async function loadSchoolYears() {
  let result = await supabase
    .from('school_years')
    .select('label,start_date,end_date,enrollment_open,closed_at,closed_by,close_reason')
    .order('start_date', { ascending: false })
  if (result.error)
    result = await supabase.from('school_years').select('label,start_date,end_date').order('start_date', { ascending: false })
  if (result.error) throw result.error
  return result.data || []
}

// Fills a <select> with the years and picks the current one (or `selected`). Returns the rows.
export async function fillYearSelect(select, { selected = currentSchoolYear(), years } = {}) {
  const rows = years || (await loadSchoolYears())
  select.innerHTML = rows.map(year => `<option value="${escapeHtml(year.label)}">${escapeHtml(year.label)}</option>`).join('')
  select.value = rows.some(year => year.label === selected) ? selected : rows[0]?.label || ''
  return rows
}
