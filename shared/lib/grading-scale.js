import { supabase } from './auth-client.js'
import { setGradingScales } from './grades.js'

// Loads every school year's saved grading scale (a few rows) so letterGrade(value, year) and scaleFor(year)
// can answer without another request. Missing table or a failed read leaves the default DepEd scale in use.
export async function loadGradingScales() {
  const { data } = await supabase.from('grading_scales').select('school_year,bands')
  setGradingScales(data || [])
}
