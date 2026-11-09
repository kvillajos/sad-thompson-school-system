// School calendar helpers: quarter dates, holidays and school days per month (pure, tested by
// dev/scripts/checks/check-calendar.mjs). Dates are 'YYYY-MM-DD' strings, so text comparison orders them.

export const QUARTERS = [1, 2, 3, 4]
// Senior High semesters: the 1st semester is Q1-Q2, the 2nd semester Q3-Q4 (same as the grade sheet columns).
export const QUARTER_FIELDS = { 1: 'first_sem_q1', 2: 'first_sem_q2', 3: 'second_sem_q1', 4: 'second_sem_q2' }
export const semesterOfQuarter = quarter => (quarter <= 2 ? 1 : 2)

const toDate = iso => new Date(`${iso}T00:00:00Z`)
const toIso = date => date.toISOString().slice(0, 10)

// Every date from start to end inclusive.
function* days(start, end) {
  for (let day = toDate(start); toIso(day) <= end; day.setUTCDate(day.getUTCDate() + 1)) yield new Date(day)
}

// Classes run Monday to Friday (schedule-plan.js SCHOOL_DAYS). Returns { month: count } for the months that
// have at least one school day between start and end, minus the holiday dates.
export function schoolDaysByMonth({ start, end, holidays = [] }) {
  const off = new Set(holidays.map(item => (typeof item === 'string' ? item : item.holiday_date)))
  const counts = {}
  if (!start || !end || end < start) return counts
  for (const day of days(start, end)) {
    const weekday = day.getUTCDay()
    if (weekday === 0 || weekday === 6 || off.has(toIso(day))) continue
    const month = day.getUTCMonth() + 1
    counts[month] = (counts[month] || 0) + 1
  }
  return counts
}

// The span classes run: first quarter's start to last quarter's end, or the school year's own dates.
export function classSpan(quarters = [], year = null) {
  const set = quarters.filter(q => q.start_date && q.end_date)
  if (set.length) {
    return {
      start: set.map(q => q.start_date).sort()[0],
      end: set
        .map(q => q.end_date)
        .sort()
        .at(-1)
    }
  }
  return year ? { start: year.start_date, end: year.end_date } : null
}

export const quarterOn = (quarters = [], date) => quarters.find(q => q.start_date <= date && date <= q.end_date)?.quarter ?? null

// Problems with a year's quarter rows, as messages. Empty means valid. Quarters may be left out, but the
// ones given must sit inside the school year, follow each other in order and not overlap.
export function quarterProblems(quarters = [], year) {
  const problems = []
  const sorted = [...quarters].sort((a, b) => a.quarter - b.quarter)
  for (const q of sorted) {
    const label = `Q${q.quarter}`
    if (!q.start_date || !q.end_date) {
      problems.push(`${label}: enter both a start and an end date.`)
      continue
    }
    if (q.end_date < q.start_date) problems.push(`${label}: the end date is before the start date.`)
    if (year && (q.start_date < year.start_date || q.end_date > year.end_date))
      problems.push(`${label}: dates must fall inside ${year.label} (${year.start_date} to ${year.end_date}).`)
    if (q.grade_deadline && q.grade_deadline < q.start_date) problems.push(`${label}: the grade deadline is before the quarter starts.`)
  }
  sorted.forEach((q, index) => {
    const next = sorted[index + 1]
    if (next && q.end_date && next.start_date && next.start_date <= q.end_date)
      problems.push(`Q${next.quarter} must start after Q${q.quarter} ends.`)
  })
  return problems
}

// The quarter whose grades are due next (or most recently due) on a date: the first quarter with a deadline on
// or after the date, else the last one with a deadline.
export function currentGradingQuarter(quarters = [], date) {
  const withDeadline = quarters.filter(q => q.grade_deadline).sort((a, b) => a.quarter - b.quarter)
  return withDeadline.find(q => q.grade_deadline >= date) || withDeadline.at(-1) || null
}
