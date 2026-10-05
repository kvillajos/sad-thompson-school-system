// Lunch / break times are stored per school year (table school_year_settings, edited on Manage Schedules).
// A year with no row of its own falls back to the most recent one, so a new year keeps working until it is set.
import { supabase } from './auth-client.js'

export async function loadSchoolYearSettings(schoolYear) {
  const { data } = await supabase.from('school_year_settings').select('school_year,lunch_start,lunch_end,break_start,break_end').order('school_year', { ascending: false })
  const rows = data || []
  return rows.find(row => row.school_year === schoolYear) || rows[0] || null
}
