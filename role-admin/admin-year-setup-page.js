import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml, gradeLabel, longDate } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { withBusy } from '../shared/ui/shell.js'
import { fillYearSelect, loadSchoolYears, yearStatus } from '../shared/lib/school-years.js'
import { nextSchoolYear, previousSchoolYear } from '../shared/lib/year-copy.js'
import { mountCopyYear } from './copy-year.js'
import { mountAdminShell } from './admin-page.js'

await mountAdminShell('year-setup')

const $ = id => document.getElementById(id)
let years = []
const selected = () => years.find(year => year.label === $('setup-year').value)
const count = result => (result.error ? null : (result.count ?? result.data?.length ?? 0))

// One checklist row. actions is HTML (buttons/links); host ids inside it are filled after render.
const step = (n, { title, done, blocked = false, text, detail = [], actions = '' }) => `
  <li class="${done ? 'done' : blocked ? 'blocked' : ''}">
    <span class="step-no" aria-hidden="true">${done ? '✓' : n}</span>
    <div>
      <h4>${escapeHtml(title)} <span class="badge ${done ? 'completed' : 'pending'}">${done ? 'Done' : 'To do'}</span></h4>
      <p>${text}</p>
      ${detail.length ? `<ul class="step-detail">${detail.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="step-actions">${actions}</div>
  </li>`

function renderNextYearButton() {
  const newest = years[0]
  const button = $('create-next-year')
  if (!newest) return (button.hidden = true)
  const next = nextSchoolYear(newest.label)
  button.hidden = false
  button.textContent = `+ Create ${next}`
  button.onclick = () =>
    withBusy(button, 'Creating…', async () => {
      const start = new Date(`${newest.end_date}T00:00:00Z`)
      start.setUTCDate(start.getUTCDate() + 1)
      const end = new Date(start)
      end.setUTCFullYear(end.getUTCFullYear() + 1)
      end.setUTCDate(end.getUTCDate() - 1)
      const row = { label: next, start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }
      const ok = await confirmDialog(
        `Create ${next} from ${longDate(row.start_date)} to ${longDate(row.end_date)}? You can change the dates on School Years.`,
        { title: 'Create school year', confirmText: 'Create' }
      )
      if (!ok) return
      const { error } = await supabase.from('school_years').insert(row)
      if (error) return toast(describeError(error, 'Create school year'), 'error')
      toast(`${next} created.`)
      await load(next)
    })
}

async function renderSteps() {
  const year = selected()
  if (!year) return
  const prev = previousSchoolYear(year.label)
  const status = yearStatus(year)
  $('setup-summary').innerHTML =
    `<strong>${escapeHtml(year.label)}</strong> <span class="badge ${status === 'Active' ? 'active' : status === 'Upcoming' ? 'pending' : ''}">${status}</span> <span>${escapeHtml(longDate(year.start_date))} to ${escapeHtml(longDate(year.end_date))}</span> <span>Enrollment: <strong>${year.enrollment_open && !year.closed_at ? 'Open' : 'Closed'}</strong></span>`

  const [sections, settings, scale, quarters, days, prevSettings, prevScale] = await Promise.all([
    supabase
      .from('sections')
      .select('section_id,section_name,grade_level,faculty_assigned')
      .eq('academic_year', year.label)
      .order('grade_level')
      .order('section_name'),
    supabase.from('school_year_settings').select('school_year', { count: 'exact', head: true }).eq('school_year', year.label),
    supabase.from('grading_scales').select('school_year', { count: 'exact', head: true }).eq('school_year', year.label),
    supabase.from('school_quarters').select('quarter', { count: 'exact', head: true }).eq('school_year', year.label),
    supabase.from('school_days').select('month', { count: 'exact', head: true }).eq('school_year', year.label).gt('days', 0),
    supabase.from('school_year_settings').select('*').eq('school_year', prev).maybeSingle(),
    supabase.from('grading_scales').select('*').eq('school_year', prev).maybeSingle()
  ])
  if (sections.error) toast(describeError(sections.error, 'Load sections'), 'error')
  const sectionRows = sections.data || []
  const noAdviser = sectionRows.filter(section => !section.faculty_assigned)
  const hasSettings = count(settings) > 0
  const hasScale = count(scale) > 0
  const quarterCount = count(quarters) ?? 0
  const dayMonths = count(days) ?? 0
  const closed = Boolean(year.closed_at)
  const enrollmentOpen = Boolean(year.enrollment_open) && !closed

  const copyDone = sectionRows.length > 0 && hasSettings && hasScale
  const calendarDone = quarterCount === 4 && dayMonths > 0
  const advisersDone = sectionRows.length > 0 && noAdviser.length === 0
  const readyBefore = copyDone && calendarDone && advisersDone

  $('setup-steps').innerHTML = [
    step(1, {
      title: 'Create the school year',
      done: true,
      text: `${escapeHtml(year.label)} runs from ${escapeHtml(longDate(year.start_date))} to ${escapeHtml(longDate(year.end_date))}.`,
      actions: '<a class="admin-secondary" href="/role-admin/admin-school-years.html">Edit dates</a>'
    }),
    step(2, {
      title: `Copy the setup from ${prev}`,
      done: copyDone,
      text: `Sections and their timetables, lunch and break times, and the grading scale. Students are not copied.`,
      detail: [
        `${sectionRows.length} section(s) in ${year.label}`,
        `Lunch and break times: ${hasSettings ? 'set' : 'not set'}`,
        `Grading scale: ${hasScale ? 'set' : 'not set'}`
      ],
      actions: `<span id="copy-sections-host"></span>${
        (!hasSettings && prevSettings.data) || (!hasScale && prevScale.data)
          ? `<button type="button" class="admin-secondary" id="carry-settings">Carry over lunch times and grading scale</button>`
          : ''
      }`
    }),
    step(3, {
      title: 'Set the calendar and school days',
      done: calendarDone,
      text: 'Quarter dates and grade deadlines, holidays, then school days per month (computed from the calendar).',
      detail: [`Quarters set: ${quarterCount} of 4`, `School days entered for ${dayMonths} month(s)`],
      actions: `<a class="admin-secondary" href="/role-admin/admin-calendar.html?year=${encodeURIComponent(year.label)}">Open School Calendar</a>`
    }),
    step(4, {
      title: 'Assign advisers',
      done: advisersDone,
      text: sectionRows.length
        ? noAdviser.length
          ? `${noAdviser.length} of ${sectionRows.length} section(s) have no adviser yet:`
          : `Every section has an adviser.`
        : 'Copy or add the sections first.',
      detail: noAdviser.map(section => `${section.section_name} (${gradeLabel(section.grade_level)})`),
      actions: '<a class="admin-secondary" href="/role-admin/admin-sections.html">Open Manage Sections</a>'
    }),
    step(5, {
      title: 'Open enrollment',
      done: enrollmentOpen,
      blocked: closed,
      text: closed
        ? 'This year is closed, so enrollment cannot be opened.'
        : enrollmentOpen
          ? `Enrollment for ${escapeHtml(year.label)} is open: the registrar can enroll, re-enroll, import and place students.`
          : `While enrollment is closed, nobody can enroll, re-enroll, import or place students into ${escapeHtml(year.label)}. Moving students already placed still works.`,
      actions: closed
        ? ''
        : `<button type="button" class="${enrollmentOpen ? 'admin-remove' : 'admin-primary'}" id="toggle-enrollment">${enrollmentOpen ? 'Close enrollment' : 'Open enrollment'}</button>`
    })
  ].join('')

  mountCopyYear($('copy-sections-host'), renderSteps, { sourceYear: prev, targetYear: year.label })

  const carry = $('carry-settings')
  if (carry)
    carry.onclick = () =>
      withBusy(carry, 'Copying…', async () => {
        const writes = []
        if (!hasSettings && prevSettings.data) {
          const { lunch_start, lunch_end, break_start, break_end } = prevSettings.data
          writes.push(
            supabase.from('school_year_settings').insert({ school_year: year.label, lunch_start, lunch_end, break_start, break_end })
          )
        }
        if (!hasScale && prevScale.data)
          writes.push(supabase.from('grading_scales').insert({ school_year: year.label, bands: prevScale.data.bands }))
        const failed = (await Promise.all(writes)).find(result => result.error)
        if (failed) return toast(describeError(failed.error, 'Carry over settings'), 'error')
        toast(`Copied from ${prev}.`)
        await renderSteps()
      })

  const toggle = $('toggle-enrollment')
  if (toggle)
    toggle.onclick = () =>
      withBusy(toggle, 'Saving…', async () => {
        const open = !enrollmentOpen
        const ok = await confirmDialog(
          open
            ? `Open enrollment for ${year.label}? The registrar can then enroll, re-enroll, import and place students.`
            : `Close enrollment for ${year.label}? New enrollments, re-enrollments, imports and first placements will be refused until you open it again.`,
          {
            title: open ? 'Open enrollment' : 'Close enrollment',
            confirmText: open ? 'Open enrollment' : 'Close enrollment',
            danger: !open,
            warning: open && !readyBefore ? 'Steps 2 to 4 are not all done yet.' : ''
          }
        )
        if (!ok) return
        const { error } = await supabase.from('school_years').update({ enrollment_open: open }).eq('label', year.label)
        if (error) return toast(describeError(error, 'Change enrollment'), 'error')
        toast(open ? `Enrollment for ${year.label} is open.` : `Enrollment for ${year.label} is closed.`)
        await load(year.label)
      })
}

async function load(pick) {
  years = await loadSchoolYears()
  // Default: the next upcoming year being prepared, else the current one.
  const upcoming = [...years].reverse().find(year => yearStatus(year) === 'Upcoming')
  await fillYearSelect($('setup-year'), { years, selected: pick || upcoming?.label })
  renderNextYearButton()
  await renderSteps()
}

$('setup-year').onchange = () => renderSteps()
try {
  await load(new URLSearchParams(location.search).get('year'))
} catch (error) {
  toast(describeError(error, 'Load Year Setup'), 'error')
}
hideLoadingScreen()
