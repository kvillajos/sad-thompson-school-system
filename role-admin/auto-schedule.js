// Manage Schedules > Auto-schedule: plans the missing subjects of one section (or every listed section) with
// shared/lib/schedule-plan.js, shows a preview, and saves only on Apply. Senior High subjects belong to one
// semester: planning a semester replaces the section's classes of the other semester (they are over).
import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { timeRange12 } from '../shared/ui/day-tabs.js'
import { escapeHtml as escape, gradeLabel } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { daySlots, planSections, SCHOOL_DAYS } from '../shared/lib/schedule-plan.js'

// June to October is the 1st semester, November to May the 2nd.
const currentSemester = (now = new Date()) => (now.getMonth() + 1 >= 6 && now.getMonth() + 1 <= 10 ? 1 : 2)
const takes = (subject, section) =>
  subject.is_active &&
  (subject.grade_level || []).includes(Number(section.grade_level)) &&
  (!subject.strands || subject.strands.includes(section.strand))

const modal = document.createElement('div')
modal.className = 'admin-modal hidden'
// Pinned header (title, counts, controls) and footer (actions); only the section list in between scrolls.
modal.innerHTML = `<div class="admin-modal-box auto-schedule-box" role="dialog" aria-modal="true" aria-labelledby="auto-schedule-title">
  <header class="as-head">
    <div class="admin-modal-head as-title-row"><h3 id="auto-schedule-title" data-title>Auto-schedule</h3><button type="button" class="as-close" data-close aria-label="Close">×</button></div>
    <div class="as-stats" data-stats></div>
    <div class="as-controls">
      <label class="as-semester" data-semester-wrap>Semester <select data-semester><option value="1">1st Semester</option><option value="2">2nd Semester</option></select></label>
      <label class="as-check"><input type="checkbox" data-preview-only /> Preview only (don't save)</label>
      <input type="search" class="as-search" data-search maxlength="100" placeholder="Search section or subject..." aria-label="Search section or subject" />
    </div>
  </header>
  <div class="as-body" data-body></div>
  <footer class="as-foot">
    <p class="as-note" data-note></p>
    <div class="as-actions"><button type="button" class="admin-cancel" data-cancel>Cancel</button><button type="button" class="admin-primary" data-apply>Apply</button></div>
  </footer>
</div>`
document.body.append(modal)
const $ = selector => modal.querySelector(selector)
const close = () => modal.classList.add('hidden')
$('[data-close]').onclick = close
$('[data-cancel]').onclick = close

let state = null
// Which section blocks are expanded and whether removed classes are listed; kept across re-renders (search, semester).
let openSections = new Set()
let showRemoved = false

async function loadYear(schoolYear) {
  const [subjects, schedules, assignments, settings] = await Promise.all([
    supabase.from('subjects').select('subject_id,subject_code,subject_name,grade_level,semester,strands,is_active'),
    fetchAll(() =>
      supabase
        .from('subject_schedules')
        .select(
          'schedule_id,subject_id,section_id,faculty_name,faculty_profile_id,room,day_of_week,start_time,end_time,sections!inner(academic_year)'
        )
        .eq('sections.academic_year', schoolYear)
        .order('schedule_id')
    ),
    supabase.from('faculty_subjects').select('subject_id,profile_id,staff_profiles(first_name,last_name)'),
    supabase.from('school_year_settings').select('*').order('school_year', { ascending: false })
  ])
  const error = subjects.error || schedules.error || assignments.error || settings.error
  if (error) throw error
  const teachers = new Map()
  ;(assignments.data || []).forEach(row => {
    const name = `${row.staff_profiles?.first_name || ''} ${row.staff_profiles?.last_name || ''}`.trim()
    if (!teachers.has(row.subject_id)) teachers.set(row.subject_id, [])
    teachers.get(row.subject_id).push({ profile_id: row.profile_id, name })
  })
  const yearSettings = (settings.data || []).find(row => row.school_year === schoolYear) || settings.data?.[0] || {}
  return { subjects: subjects.data || [], schedules: schedules.data || [], teachers, slots: daySlots(yearSettings) }
}

function plan() {
  const semester = Number($('[data-semester]').value)
  const { sections, data } = state
  const bySubject = new Map(data.subjects.map(subject => [subject.subject_id, subject]))
  const planned = new Set(sections.map(section => Number(section.section_id)))
  const offSemester = row => {
    const subject = bySubject.get(row.subject_id)
    return planned.has(Number(row.section_id)) && subject?.semester && subject.semester !== semester
  }
  // The other semester's classes in these sections are replaced; everything else stays and is planned around.
  const removed = data.schedules.filter(offSemester)
  const kept = data.schedules.filter(row => !offSemester(row))
  const results = planSections({
    sections,
    // Only subjects of this grade/strand/semester that the section does not have yet.
    subjectsFor: section =>
      data.subjects.filter(
        subject =>
          takes(subject, section) &&
          (!subject.semester || subject.semester === semester) &&
          !kept.some(row => Number(row.section_id) === Number(section.section_id) && row.subject_id === subject.subject_id)
      ),
    teachers: data.teachers,
    existing: kept,
    slots: data.slots
  })
  state.plan = { removed, results }
  // One removed entry per section + subject (a class meets on five days, so it has five schedule rows).
  const removedBySection = new Map()
  for (const row of new Map(removed.map(row => [`${row.section_id}:${row.subject_id}`, row])).values()) {
    const key = Number(row.section_id)
    if (!removedBySection.has(key)) removedBySection.set(key, [])
    removedBySection.get(key).push({ ...row, subject: bySubject.get(row.subject_id) })
  }
  state.groups = results.map(({ section, placed, unplaced }) => ({
    section,
    placed: [...placed].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
    unplaced,
    removed: removedBySection.get(Number(section.section_id)) || []
  }))
  render()
}

const sectionLabel = section => `${gradeLabel(section.grade_level)}${section.strand ? ` ${section.strand}` : ''}`
const count = (n, label, tone) => (n ? `<span class="as-chip ${tone}">${n} ${label}</span>` : '')

function render() {
  const groups = state.groups
  const totals = groups.reduce(
    (sum, g) => ({
      placed: sum.placed + g.placed.length,
      unplaced: sum.unplaced + g.unplaced.length,
      removed: sum.removed + g.removed.length
    }),
    { placed: 0, unplaced: 0, removed: 0 }
  )
  const previewOnly = $('[data-preview-only]').checked
  $('[data-stats]').innerHTML = `
    <div class="as-stat add"><b>${totals.placed}</b><span>class(es) to add</span></div>
    <div class="as-stat warn${totals.unplaced ? '' : ' zero'}"><b>${totals.unplaced}</b><span>not placed</span></div>
    <div class="as-stat removed${totals.removed ? '' : ' zero'}"><b>${totals.removed}</b><span>from the other semester removed</span>${
      totals.removed ? `<button type="button" class="as-link" data-toggle-removed>${showRemoved ? 'Hide list' : 'Show list'}</button>` : ''
    }</div>`

  const search = $('[data-search]').value.trim().toLowerCase()
  const matches = text =>
    String(text || '')
      .toLowerCase()
      .includes(search)
  const filtered = groups
    .map(group => {
      if (!search || matches(`${group.section.section_name} ${sectionLabel(group.section)}`)) return group
      const pick = rows => rows.filter(row => matches(row.subject?.subject_name) || matches(row.faculty_name))
      const narrowed = { ...group, placed: pick(group.placed), unplaced: pick(group.unplaced), removed: pick(group.removed) }
      return narrowed.placed.length + narrowed.unplaced.length + narrowed.removed.length ? { ...narrowed, forceOpen: true } : null
    })
    .filter(Boolean)
    // Sections that need attention first, then by grade and name.
    .sort(
      (a, b) =>
        Number(!a.unplaced.length) - Number(!b.unplaced.length) ||
        Number(a.section.grade_level) - Number(b.section.grade_level) ||
        String(a.section.section_name).localeCompare(String(b.section.section_name))
    )

  const single = groups.length === 1
  $('[data-body]').innerHTML = filtered.length
    ? filtered
        .map(group => {
          const id = Number(group.section.section_id)
          const open = single || group.forceOpen || openSections.has(id)
          const removedRows = showRemoved ? group.removed : []
          const rows = [
            ...group.unplaced.map(
              row =>
                `<tr class="as-row-warn"><td>${escape(row.subject.subject_name)}</td><td colspan="3"><span class="as-tag warn">Not placed</span> ${escape(row.reason)}</td></tr>`
            ),
            ...group.placed.map(
              row =>
                `<tr><td>${escape(row.subject.subject_name)}</td><td>${escape(row.faculty_name || '-')}</td><td class="as-time">${timeRange12(row.start_time, row.end_time)}</td><td>${escape(row.room || '-')}</td></tr>`
            ),
            ...removedRows.map(
              row =>
                `<tr class="as-row-removed"><td>${escape(row.subject?.subject_name || row.subject_id)}</td><td>${escape(row.faculty_name || '-')}</td><td colspan="2"><span class="as-tag removed">Removed</span> other semester</td></tr>`
            )
          ].join('')
          return `<details class="as-section${group.unplaced.length ? ' needs-attention' : ''}" data-section="${id}"${open ? ' open' : ''}>
            <summary><span class="as-section-name">${escape(group.section.section_name)}</span><span class="as-section-grade">${escape(sectionLabel(group.section))}</span>
              <span class="as-chips">${count(group.placed.length, 'to add', 'add')}${count(group.unplaced.length, 'not placed', 'warn')}${count(group.removed.length, 'removed', 'removed')}${
                group.placed.length + group.unplaced.length ? '' : '<span class="as-chip done">Already scheduled</span>'
              }</span></summary>
            ${
              rows
                ? `<table data-no-pages><thead><tr><th>Subject</th><th>Faculty</th><th>Time (Mon–Fri)</th><th>Room</th></tr></thead><tbody>${rows}</tbody></table>`
                : '<p class="as-empty">Every subject is already scheduled.</p>'
            }
          </details>`
        })
        .join('')
    : `<p class="as-empty">${search ? 'No section or subject matches your search.' : 'Every subject is already scheduled. Nothing to add.'}</p>`

  $('[data-body]')
    .querySelectorAll('details[data-section]')
    .forEach(block => {
      block.ontoggle = () => {
        const id = Number(block.dataset.section)
        block.open ? openSections.add(id) : openSections.delete(id)
      }
    })
  const toggle = $('[data-toggle-removed]')
  if (toggle)
    toggle.onclick = () => {
      showRemoved = !showRemoved
      render()
    }

  $('[data-note]').textContent = previewOnly
    ? 'Preview only: nothing is saved. Untick "Preview only" to apply.'
    : totals.placed
      ? `Each class meets Monday to Friday.${totals.removed ? ` Applying also removes ${totals.removed} class(es) of the other semester.` : ''}`
      : 'Nothing to add.'
  // Nothing placed means nothing to apply: the other semester's classes are never removed on their own.
  $('[data-apply]').disabled = !totals.placed || previewOnly
  $('[data-apply]').textContent = totals.placed ? `Apply ${totals.placed} class(es)` : 'Apply'
}

async function apply() {
  const { removed, results } = state.plan
  const rows = results.flatMap(result =>
    result.placed.flatMap(({ subject, ...row }) => SCHOOL_DAYS.map(day_of_week => ({ ...row, day_of_week })))
  )
  if (
    removed.length &&
    !(await confirmDialog(
      `Remove ${new Set(removed.map(row => `${row.section_id}:${row.subject_id}`)).size} class(es) of the other semester and add the planned ones?`,
      {
        title: 'Replace semester classes',
        confirmText: 'Apply'
      }
    ))
  )
    return
  if (removed.length) {
    const { error } = await supabase
      .from('subject_schedules')
      .delete()
      .in(
        'schedule_id',
        removed.map(row => row.schedule_id)
      )
    if (error) return toast(describeError(error, 'Remove last semester classes'), 'error')
  }
  if (rows.length) {
    const { error } = await supabase.from('subject_schedules').insert(rows)
    if (error)
      return toast(
        describeError(
          error,
          removed.length ? 'Add planned classes (the old semester was removed; run Auto-schedule again)' : 'Add planned classes'
        ),
        'error'
      )
  }
  close()
  toast(`Auto-schedule added ${rows.length / SCHOOL_DAYS.length} class(es).`, 'success')
  await state.onApplied()
}
// Planning a semester that is not the running one defaults to preview-only, so setting up next term early cannot swap classes by accident.
$('[data-semester]').onchange = () => {
  $('[data-preview-only]').checked = Number($('[data-semester]').value) !== currentSemester()
  plan()
}
$('[data-preview-only]').onchange = render
$('[data-search]').oninput = render
$('[data-apply]').onclick = () => withBusy($('[data-apply]'), 'Applying…', apply)

// Opens the preview for these sections (all from one school year). onApplied reloads the page's data.
export async function openAutoSchedule(sections, onApplied) {
  const years = [...new Set(sections.map(section => section.academic_year))]
  if (!sections.length) return toast('No sections to schedule.', 'error')
  if (years.length > 1) return toast('Choose one school year in the filter first; auto-schedule plans one year at a time.', 'error')
  try {
    state = { sections, onApplied, data: await loadYear(years[0]) }
  } catch (error) {
    return toast(describeError(error, 'Load schedules'), 'error')
  }
  $('[data-title]').textContent =
    sections.length === 1
      ? `Auto-schedule ${sections[0].section_name} (${years[0]})`
      : `Auto-schedule ${sections.length} sections (${years[0]})`
  $('[data-semester]').value = String(currentSemester())
  $('[data-preview-only]').checked = false
  $('[data-search]').value = ''
  openSections = new Set()
  showRemoved = false
  $('[data-semester-wrap]').hidden = !sections.some(section => Number(section.grade_level) >= 11)
  plan()
  modal.classList.remove('hidden')
}
