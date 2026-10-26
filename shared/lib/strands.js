// Senior High strands (table strands, migration v52). Grades 11 and 12 belong to one strand; Junior High has none.
import { supabase } from './auth-client.js'
import { escapeHtml } from './html.js'

const { data } = await supabase.from('strands').select('code,name,track').order('sort_order')
export const STRANDS = data || []
export const SHS_GRADES = [11, 12]
export const isSeniorHigh = grade => SHS_GRADES.includes(Number(grade))

export const strandOptions = (selected = '', blank = 'Select strand') =>
  `<option value="">${escapeHtml(blank)}</option>` +
  STRANDS.map(
    strand =>
      `<option value="${escapeHtml(strand.code)}"${strand.code === selected ? ' selected' : ''}>${escapeHtml(strand.code)} - ${escapeHtml(strand.name)}</option>`
  ).join('')
