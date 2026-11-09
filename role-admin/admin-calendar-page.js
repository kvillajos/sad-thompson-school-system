import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml, errorRow, longDate } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { withBusy } from '../shared/ui/shell.js'
import { fillYearSelect } from '../shared/lib/school-years.js'
import { QUARTERS, classSpan, quarterProblems, schoolDaysByMonth } from '../shared/lib/calendar.js'
import { mountAdminShell } from './admin-page.js'

await mountAdminShell('calendar')

const $ = id => document.getElementById(id)
const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
let years = []
let quarters = []
let holidays = []
const year = () => years.find(row => row.label === $('calendar-year').value)

function renderQuarters() {
  const y = year()
  const byQuarter = new Map(quarters.map(q => [q.quarter, q]))
  const bounds = y ? `min="${y.start_date}" max="${y.end_date}"` : ''
  $('quarters-rows').innerHTML = QUARTERS.map(n => {
    const q = byQuarter.get(n) || {}
    const input = (field, label) =>
      `<input type="date" name="${field}-${n}" value="${q[field] || ''}" ${field === 'grade_deadline' ? '' : bounds} aria-label="Q${n} ${label}">`
    return `<tr><td data-label="Quarter"><strong>Q${n}</strong></td><td data-label="Start">${input('start_date', 'start')}</td><td data-label="End">${input('end_date', 'end')}</td><td data-label="Grade deadline">${input('grade_deadline', 'grade deadline')}</td></tr>`
  }).join('')
}

function renderHolidays() {
  $('holidays-table').innerHTML =
    holidays
      .map(
        h => `<tr>
          <td data-label="Date">${escapeHtml(longDate(h.holiday_date))}</td>
          <td data-label="Day">${escapeHtml(longDate(h.holiday_date, { year: undefined, month: undefined, day: undefined, weekday: 'long' }))}</td>
          <td data-label="Name">${escapeHtml(h.name)}</td>
          <td data-label="Actions"><button type="button" class="admin-remove" data-remove-holiday="${h.id}">Remove</button></td>
        </tr>`
      )
      .join('') || '<tr><td colspan="4">No holidays for this school year yet.</td></tr>'
  document.querySelectorAll('[data-remove-holiday]').forEach(button => {
    button.onclick = () => removeHoliday(holidays.find(h => h.id === Number(button.dataset.removeHoliday)))
  })
}

async function loadYear() {
  const y = year()
  if (!y) return
  $('calendar-year-dates').textContent = `${longDate(y.start_date)} to ${longDate(y.end_date)}`
  const holidayForm = $('holiday-form')
  holidayForm.elements.holiday_date.min = y.start_date
  holidayForm.elements.holiday_date.max = y.end_date
  const [quarterResult, holidayResult] = await Promise.all([
    supabase.from('school_quarters').select('quarter,start_date,end_date,grade_deadline').eq('school_year', y.label).order('quarter'),
    supabase.from('school_holidays').select('id,holiday_date,name').eq('school_year', y.label).order('holiday_date')
  ])
  if (quarterResult.error) toast(describeError(quarterResult.error, 'Load quarters'), 'error')
  quarters = quarterResult.data || []
  renderQuarters()
  if (holidayResult.error) return ($('holidays-table').innerHTML = errorRow(4, holidayResult.error, 'Load holidays'))
  holidays = holidayResult.data || []
  renderHolidays()
}

$('quarters-form').onsubmit = event => {
  event.preventDefault()
  const form = event.currentTarget
  return withBusy(form.querySelector('[type="submit"]'), 'Saving…', async () => {
    const y = year()
    const read = n => ({
      quarter: n,
      start_date: form.elements[`start_date-${n}`].value,
      end_date: form.elements[`end_date-${n}`].value,
      grade_deadline: form.elements[`grade_deadline-${n}`].value || null
    })
    const rows = QUARTERS.map(read)
    const filled = rows.filter(q => q.start_date || q.end_date || q.grade_deadline)
    const problems = quarterProblems(filled, y)
    if (problems.length) {
      $('quarters-note').textContent = problems.join(' ')
      return toast(problems[0], 'error')
    }
    const cleared = rows.filter(q => !filled.includes(q) && quarters.some(old => old.quarter === q.quarter)).map(q => q.quarter)
    if (cleared.length) {
      const { error } = await supabase.from('school_quarters').delete().eq('school_year', y.label).in('quarter', cleared)
      if (error) return toast(describeError(error, 'Clear quarters'), 'error')
    }
    if (filled.length) {
      const { error } = await supabase.from('school_quarters').upsert(
        filled.map(q => ({ ...q, school_year: y.label })),
        { onConflict: 'school_year,quarter' }
      )
      if (error) return toast(describeError(error, 'Save quarters'), 'error')
    }
    $('quarters-note').textContent = `Quarters saved for ${y.label}.`
    toast('Quarters saved.')
    await loadYear()
  })
}

$('holiday-form').onsubmit = event => {
  event.preventDefault()
  const form = event.currentTarget
  return withBusy(form.querySelector('[type="submit"]'), 'Adding…', async () => {
    const y = year()
    const row = { school_year: y.label, holiday_date: form.elements.holiday_date.value, name: form.elements.name.value.trim() }
    if (row.holiday_date < y.start_date || row.holiday_date > y.end_date) return toast(`The date must fall inside ${y.label}.`, 'error')
    if (holidays.some(h => h.holiday_date === row.holiday_date)) return toast('That date is already a holiday.', 'error')
    const { error } = await supabase.from('school_holidays').insert(row)
    if (error) return toast(describeError(error, 'Add holiday'), 'error')
    form.reset()
    toast('Holiday added.')
    await loadYear()
  })
}

async function removeHoliday(holiday) {
  if (!holiday) return
  const ok = await confirmDialog(`Remove ${holiday.name} (${longDate(holiday.holiday_date)})?`, {
    title: 'Remove holiday',
    confirmText: 'Remove',
    danger: true
  })
  if (!ok) return
  const { error } = await supabase.from('school_holidays').delete().eq('id', holiday.id)
  if (error) return toast(describeError(error, 'Remove holiday'), 'error')
  toast('Holiday removed.')
  await loadYear()
}

$('compute-days').onclick = event =>
  withBusy(event.currentTarget, 'Computing…', async () => {
    const y = year()
    const span = classSpan(quarters, y)
    const counts = schoolDaysByMonth({ ...span, holidays })
    const months = Object.keys(counts).map(Number)
    // School months run June to May, so sort June first.
    months.sort((a, b) => ((a + 6) % 12) - ((b + 6) % 12))
    if (!months.length) return toast('No school days in this span. Set the quarter dates first.', 'error')
    const lines = months.map(m => `${MONTH_NAMES[m]}: ${counts[m]} day(s)`)
    const source = quarters.length
      ? `Q1 start to Q4 end (${longDate(span.start)} to ${longDate(span.end)})`
      : `the whole school year (no quarters set)`
    const ok = await confirmDialog(
      [
        `Counted over ${source}, minus ${holidays.length} holiday(s):`,
        ...lines,
        'Save these into School days? Months not listed are left as they are.'
      ].join('\n'),
      { title: `School days for ${y.label}`, confirmText: 'Save school days' }
    )
    if (!ok) return
    const { error } = await supabase.from('school_days').upsert(
      months.map(month => ({ school_year: y.label, month, days: counts[month] })),
      { onConflict: 'school_year,month' }
    )
    if (error) return toast(describeError(error, 'Save school days'), 'error')
    toast(`School days saved for ${y.label}. You can still adjust them on Manage Subjects.`)
  })

$('calendar-year').onchange = loadYear
try {
  years = await fillYearSelect($('calendar-year'))
  await loadYear()
} catch (error) {
  toast(describeError(error, 'Load school years'), 'error')
}
hideLoadingScreen()
