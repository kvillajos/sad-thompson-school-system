import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml, gradeLabel, longDate } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog, formDialog } from '../shared/ui/dialog.js'
import { withBusy } from '../shared/ui/shell.js'
import { loadSchoolYears, todayManila, yearStatus } from '../shared/lib/school-years.js'
import { nextSchoolYear, previousSchoolYear } from '../shared/lib/year-copy.js'
import { mountCopyYear } from './copy-year.js'
import { mountYearEnd } from './year-end-checklist.js'
import { mountCalendar } from './school-calendar.js'
import { mountAdminShell } from './admin-page.js'

await mountAdminShell('year-setup')

const $ = id => document.getElementById(id)
let years = []
let selectedLabel = ''
const selected = () => years.find(year => year.label === selectedLabel)
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

// Closed early counts as its own state on the cards; otherwise the date rule (Active shows as "Current").
const cardStatus = year => (year.closed_at ? 'Closed' : yearStatus(year))
const statusText = { Active: 'Current', Upcoming: 'Upcoming', Past: 'Past', Closed: 'Closed' }

function renderCards() {
  $('year-cards').innerHTML =
    years
      .map(year => {
        const status = cardStatus(year)
        const enrollment = year.enrollment_open && !year.closed_at ? ' · Enrollment open' : ''
        return `<button type="button" class="year-card" role="radio" data-year="${escapeHtml(year.label)}" data-status="${status}" aria-checked="${year.label === selectedLabel}">
          <span class="year-card-top"><strong>${escapeHtml(year.label)}</strong><span class="year-tag">${statusText[status]}</span></span>
          <small>${escapeHtml(longDate(year.start_date))} to ${escapeHtml(longDate(year.end_date))}</small>
          <small>${status === 'Closed' ? 'Read-only' : status === 'Upcoming' ? 'Being prepared' : status === 'Active' ? 'In progress' : 'Ended'}${enrollment}</small>
        </button>`
      })
      .join('') || '<p class="admin-note">No school years yet. Add the first one.</p>'
  $('year-cards')
    .querySelectorAll('[data-year]')
    .forEach(card => (card.onclick = () => selectYear(card.dataset.year)))
}

// Two tabs for the selected year. The URL keeps ?year= and ?tab= so a link or reload lands on the same view.
const showCalendarYear = mountCalendar()
let activeTab = new URLSearchParams(location.search).get('tab') === 'calendar' ? 'calendar' : 'setup'
const syncUrl = () =>
  history.replaceState(null, '', `?year=${encodeURIComponent(selectedLabel)}${activeTab === 'calendar' ? '&tab=calendar' : ''}`)
function showTab(tab) {
  activeTab = tab
  document.querySelectorAll('[data-year-tab]').forEach(button => {
    const on = button.dataset.yearTab === tab
    button.classList.toggle('active', on)
    button.setAttribute('aria-selected', String(on))
  })
  $('panel-setup').hidden = tab !== 'setup'
  $('panel-calendar').hidden = tab !== 'calendar'
  syncUrl()
  const year = selected()
  if (!year) return
  $('setup-summary').innerHTML =
    `<span>Showing <strong>${escapeHtml(year.label)}</strong> (${statusText[cardStatus(year)].toLowerCase()})</span> <span>Enrollment: <strong>${year.enrollment_open && !year.closed_at ? 'Open' : 'Closed'}</strong></span>`
  // Each tab reloads on show, so calendar edits are reflected in the setup steps and back.
  return tab === 'calendar' ? showCalendarYear(selected()) : renderSteps()
}
document.querySelectorAll('[data-year-tab]').forEach(button => (button.onclick = () => showTab(button.dataset.yearTab)))

function selectYear(label) {
  selectedLabel = label
  renderCards()
  return showTab(activeTab)
}

// Add (prefilled with the year after the newest one) or edit a year's name and dates.
async function yearForm(year) {
  let suggestion = { label: '', start_date: '', end_date: '' }
  if (!year && years[0]) {
    const start = new Date(`${years[0].end_date}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() + 1)
    const end = new Date(start)
    end.setUTCFullYear(end.getUTCFullYear() + 1)
    end.setUTCDate(end.getUTCDate() - 1)
    suggestion = { label: nextSchoolYear(years[0].label), start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }
  }
  const current = year || suggestion
  const values = await formDialog({
    title: year ? `Edit ${year.label}` : 'Add school year',
    message: year
      ? 'Renaming a school year updates every section, grade and log that uses it.'
      : 'Format is YYYY-YYYY. Dates may not overlap another school year.',
    confirmText: year ? 'Save' : 'Add school year',
    fields: [
      { name: 'label', label: 'School year', value: current.label, required: true, maxlength: 9, placeholder: 'e.g. 2027-2028' },
      { name: 'start_date', label: 'Start date', type: 'date', value: current.start_date, required: true },
      { name: 'end_date', label: 'End date', type: 'date', value: current.end_date, required: true }
    ]
  })
  if (!values) return
  const original = year?.label
  const payload = { label: values.label, start_date: values.start_date, end_date: values.end_date }
  if (!/^\d{4}-\d{4}$/.test(payload.label)) return toast('Use the format YYYY-YYYY, for example 2026-2027.', 'error')
  if (payload.end_date <= payload.start_date) return toast('The end date must come after the start date.', 'error')
  if (years.some(row => row.label === payload.label && row.label !== original))
    return toast(`${payload.label} already exists. Each school year can only exist once.`, 'error')
  const clash = years.find(row => row.label !== original && payload.start_date <= row.end_date && payload.end_date >= row.start_date)
  if (clash) return toast(`These dates overlap ${clash.label}. School year dates may not overlap.`, 'error')
  if (
    original &&
    original !== payload.label &&
    !(await confirmDialog(
      `Rename ${original} to ${payload.label}? Every section, grade and log that uses ${original} will change to ${payload.label}.`,
      { title: 'Rename school year', confirmText: 'Rename' }
    ))
  )
    return
  const result = original
    ? await supabase.from('school_years').update(payload).eq('label', original)
    : await supabase.from('school_years').insert(payload)
  if (result.error) return toast(describeError(result.error, 'Save school year'), 'error')
  toast(original ? 'School year saved.' : `${payload.label} added.`)
  await load(payload.label)
}

async function renderSteps() {
  const year = selected()
  if (!year) return
  const prev = previousSchoolYear(year.label)
  $('start-title').textContent = `Start of ${year.label}`
  // "End of" is about the year being wrapped up, so an upcoming year (the default card) shows the one in progress
  // instead. Picked by dates, not yearStatus(), so a year closed early still shows here with its Reopen button.
  const today = todayManila()
  const inProgress = years.find(row => row.start_date <= today && today <= row.end_date)
  const endYear = cardStatus(year) === 'Upcoming' && inProgress ? inProgress : year
  $('end-title').textContent = `End of ${endYear.label}`

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
      actions: '<button type="button" class="admin-secondary" id="edit-year">Edit name or dates</button>'
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
      actions: '<button type="button" class="admin-secondary" data-open-calendar>Open the Calendar tab</button>'
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

  $('edit-year').onclick = event => withBusy(event.currentTarget, 'Opening…', () => yearForm(year))
  document.querySelector('[data-open-calendar]').onclick = () => showTab('calendar')
  mountCopyYear($('copy-sections-host'), renderSteps, { sourceYear: prev, targetYear: year.label })
  mountYearEnd($('year-end-host'), endYear, () => load(year.label))

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
  // Default: the next upcoming year being prepared, else the current one, else the newest.
  const upcoming = [...years].reverse().find(year => cardStatus(year) === 'Upcoming')
  const active = years.find(year => cardStatus(year) === 'Active')
  const label = [pick, upcoming?.label, active?.label, years[0]?.label].find(value => years.some(year => year.label === value))
  if (!label) return renderCards()
  await selectYear(label)
}

$('add-year').onclick = event => withBusy(event.currentTarget, 'Opening…', () => yearForm())
try {
  await load(new URLSearchParams(location.search).get('year'))
} catch (error) {
  toast(describeError(error, 'Load Year Setup'), 'error')
}
hideLoadingScreen()
