// The grade levels the school offers (table grade_levels, migration v40). Switch a grade on there and every
// grade picker lists it, with no code change. Until v40 is applied (no table yet) every grade is listed.
import { supabase } from './auth-client.js'
import { ALL_GRADES } from './html.js'

const { data } = await supabase.from('grade_levels').select('grade_level').eq('offered', true).order('grade_level')
export const OFFERED_GRADES = data?.length ? data.map(row => row.grade_level) : ALL_GRADES
