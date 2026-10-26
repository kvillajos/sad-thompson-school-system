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
modal.innerHTML = `<div class="admin-modal-box schedule-box">
  <div class="admin-modal-head"><h3 data-title>Auto-schedule</h3><button type="button" data-close>x</button></div>
  <div class="admin-filterbar"><label>Semester (Senior High)<select data-semester><option value="1">1st Semester</option><option value="2">2nd Semester</option></select></label></div>
  <p class="admin-note" data-note></p>
  <section class="admin-table-wrap"><table data-no-pages><thead><tr><th>Section</th><th>Subject</th><th>Faculty</th><th>Time (Mon-Fri)</th><th>Room</th></tr></thead><tbody data-rows></tbody></table></section>
  <div class="admin-actions"><button type="button" class="admin-cancel" data-cancel>Cancel</button><button type="button" class="admin-primary" data-apply>Apply</button></div>
</div>`
document.body.append(modal)
const $ = selector => modal.querySelector(selector)
const close = () => modal.classList.add('hidden')
$('[data-close]').onclick = close
$('[data-cancel]').onclick = close

let state = null

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
  const placed = results.flatMap(result => result.placed.map(row => ({ ...row, section: result.section })))
  const unplaced = results.flatMap(result => result.unplaced.map(row => ({ ...row, section: result.section })))
  const sectionName = section => `${section.section_name} (${gradeLabel(section.grade_level)}${section.strand ? ` ${section.strand}` : ''})`
  $('[data-rows]').innerHTML =
    [
      ...placed.map(
        row =>
          `<tr><td>${escape(sectionName(row.section))}</td><td>${escape(row.subject.subject_name)}</td><td>${escape(row.faculty_name)}</td><td>${timeRange12(row.start_time, row.end_time)}</td><td>${escape(row.room || '-')}</td></tr>`
      ),
      ...unplaced.map(
        row =>
          `<tr><td>${escape(sectionName(row.section))}</td><td>${escape(row.subject.subject_name)}</td><td colspan="3"><strong>Not placed:</strong> ${escape(row.reason)}</td></tr>`
      )
    ].join('') || '<tr><td colspan="5">Every subject is already scheduled. Nothing to add.</td></tr>'
  const removedClasses = new Set(removed.map(row => `${row.section_id}:${row.subject_id}`)).size
  $('[data-note]').textContent =
    `${placed.length} class(es) to add, each meeting Monday to Friday` +
    (unplaced.length ? `; ${unplaced.length} subject(s) could not be placed` : '') +
    (removedClasses ? `; ${removedClasses} class(es) of the other semester will be removed.` : '.')
  // Nothing placed means nothing to apply: the other semester's classes are never removed on their own.
  $('[data-apply]').disabled = !placed.length
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
$('[data-semester]').onchange = plan
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
  $('[data-semester]').closest('.admin-filterbar').hidden = !sections.some(section => Number(section.grade_level) >= 11)
  plan()
  modal.classList.remove('hidden')
}
