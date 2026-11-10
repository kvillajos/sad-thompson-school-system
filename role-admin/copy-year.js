import { supabase } from '../shared/lib/auth-client.js'
import { currentSchoolYear } from '../shared/lib/grades.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { nextSchoolYear, planYearCopy, sectionYearKey } from '../shared/lib/year-copy.js'
import { escapeHtml, gradeLabel, subjectDisplayName } from '../shared/lib/html.js'
import { formatDays, groupScheduleRows } from '../shared/lib/schedule-days.js'
import { timeRange12 } from '../shared/ui/day-tabs.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// One collapsible row per section: its classes (days merged), marked new or already in the target year.
function previewHtml(plan, sourceSections, subjectsById) {
  const isNewSection = new Set(plan.sectionsToCreate.map(({ key }) => key))
  const classesByKey = new Map()
  for (const [list, skipped] of [
    [plan.schedulesToCreate, false],
    [plan.schedulesToSkip, true]
  ]) {
    const byKey = new Map()
    list.forEach(({ schedule, key }) => byKey.set(key, [...(byKey.get(key) || []), schedule]))
    byKey.forEach((rows, key) =>
      classesByKey.set(key, [...(classesByKey.get(key) || []), ...groupScheduleRows(rows).map(row => ({ ...row, skipped }))])
    )
  }
  const newClasses = plan.schedulesToCreate.length ? groupScheduleRows(plan.schedulesToCreate.map(({ schedule }) => schedule)).length : 0
  const stats = `<div class="copy-preview-stats"><span><b>${plan.sectionsToCreate.length}</b> new sections</span><span><b>${newClasses}</b> new classes</span>${
    plan.sectionsToSkip.length ? `<span><b>${plan.sectionsToSkip.length}</b> sections already copied</span>` : ''
  }</div>`
  const sections = sourceSections
    .map(section => {
      const key = sectionYearKey(section)
      const classes = (classesByKey.get(key) || []).sort(
        (a, b) => a.skipped - b.skipped || String(a.start_time).localeCompare(String(b.start_time))
      )
      const toAdd = classes.filter(row => !row.skipped).length
      const badge = isNewSection.has(key)
        ? '<em class="is-new">New section</em>'
        : toAdd
          ? `<em class="is-new">+${plural(toAdd, 'class')}</em>`
          : '<em>Already copied</em>'
      const rows = classes
        .map(row => {
          const subject = subjectsById.get(row.subject_id)
          const name = subject ? `${subject.subject_code} - ${subjectDisplayName(subject.subject_name)}` : `Subject #${row.subject_id}`
          return `<tr${row.skipped ? ' class="is-skipped"' : ''}><td>${escapeHtml(name)}${row.skipped ? ' (already copied)' : ''}</td><td>${escapeHtml(row.faculty_name || 'No teacher')}</td><td>${formatDays(row.days)}</td><td>${timeRange12(row.start_time, row.end_time)}</td></tr>`
        })
        .join('')
      const meta = [gradeLabel(section.grade_level), section.strand, section.semester || '1st Semester'].filter(Boolean).join(' · ')
      return `<details><summary><b>${escapeHtml(section.section_name)}</b><small>${escapeHtml(meta)} · ${plural(classes.length, 'class')}</small>${badge}</summary>${
        rows ? `<table><thead><tr><th>Subject</th><th>Teacher</th><th>Days</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="dialog-message" style="padding:0 12px">No classes scheduled.</p>'
      }</details>`
    })
    .join('')
  return `${stats}<div class="copy-preview-list">${sections}</div>`
}

// Defaults to this school year -> next one; School Years passes the years it is preparing (its only caller).
export function mountCopyYear(host, onCopied, { sourceYear = currentSchoolYear(), targetYear } = {}) {
  if (!host) return

  try {
    targetYear ||= nextSchoolYear(sourceYear)
  } catch (error) {
    toast(error.message, 'error')
    return
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'admin-secondary'
  button.textContent = `Copy sections and schedules from ${sourceYear} to ${targetYear}`
  host.replaceChildren(button)

  button.onclick = () =>
    withBusy(button, 'Preparing copy…', async () => {
      const { data: sourceSections, error: sourceError } = await fetchAll(() =>
        supabase
          .from('sections')
          .select('section_id,section_name,grade_level,strand,capacity,room,semester,faculty_assigned')
          .eq('academic_year', sourceYear)
          .order('grade_level')
          .order('section_name')
          .order('section_id')
      )
      if (sourceError) return toast(describeError(sourceError, 'Load sections to copy'), 'error')
      if (!sourceSections?.length) return toast(`No sections found for ${sourceYear}.`, 'error')

      const { data: targetSections, error: targetError } = await fetchAll(() =>
        supabase.from('sections').select('section_id,section_name,grade_level,semester').eq('academic_year', targetYear).order('section_id')
      )
      if (targetError) return toast(describeError(targetError, 'Check next school year sections'), 'error')

      const sourceSectionIds = sourceSections.map(section => section.section_id)
      const targetSectionIds = (targetSections || []).map(section => section.section_id)
      const sourceScheduleResult = sourceSectionIds.length
        ? await fetchAll(() =>
            supabase
              .from('subject_schedules')
              .select('schedule_id,section_id,subject_id,faculty_name,room,day_of_week,start_time,end_time')
              .in('section_id', sourceSectionIds)
              .order('schedule_id')
          )
        : { data: [], error: null }
      if (sourceScheduleResult.error) return toast(describeError(sourceScheduleResult.error, 'Load source schedules'), 'error')

      const targetScheduleResult = targetSectionIds.length
        ? await fetchAll(() =>
            supabase
              .from('subject_schedules')
              .select('schedule_id,section_id,subject_id,faculty_name,room,day_of_week,start_time,end_time')
              .in('section_id', targetSectionIds)
              .order('schedule_id')
          )
        : { data: [], error: null }
      if (targetScheduleResult.error) return toast(describeError(targetScheduleResult.error, 'Check next year schedules'), 'error')

      const plan = planYearCopy({
        sourceSections,
        targetSections: targetSections || [],
        sourceSchedules: sourceScheduleResult.data || [],
        targetSchedules: targetScheduleResult.data || []
      })
      const copyCount = plan.sectionsToCreate.length + plan.schedulesToCreate.length
      if (!copyCount) return toast(`All sections and schedules for ${targetYear} already exist.`)

      const { data: subjects, error: subjectError } = await fetchAll(() =>
        supabase.from('subjects').select('subject_id,subject_code,subject_name').order('subject_id')
      )
      if (subjectError) return toast(describeError(subjectError, 'Load subjects'), 'error')
      const subjectsById = new Map((subjects || []).map(subject => [subject.subject_id, subject]))
      if (
        !(await confirmDialog(
          `This copies each ${sourceYear} section and its class timetable (subject, teacher, days, time) into ${targetYear}. Students are not copied. Click a section to see its classes.`,
          {
            title: `Copy setup: ${sourceYear} to ${targetYear}`,
            confirmText: 'Copy setup',
            html: previewHtml(plan, sourceSections, subjectsById),
            wide: true
          }
        ))
      )
        return

      let createdSections = []
      if (plan.sectionsToCreate.length) {
        const sectionRows = plan.sectionsToCreate.map(({ section }) => ({
          section_name: section.section_name,
          grade_level: section.grade_level,
          strand: section.strand,
          capacity: section.capacity,
          min_capacity: Math.min(10, Number(section.capacity)),
          room: section.room,
          semester: section.semester,
          faculty_assigned: section.faculty_assigned,
          academic_year: targetYear
        }))
        const { data, error } = await supabase.from('sections').insert(sectionRows).select('section_id,section_name,grade_level,semester')
        if (error) return toast(describeError(error, 'Copy sections'), 'error')
        createdSections = data || []
        if (createdSections.length !== sectionRows.length) {
          return toast('Sections were saved, but the database did not return all new section IDs; schedules were not copied.', 'error')
        }
      }

      const targetSectionsByKey = new Map(
        [...(targetSections || []), ...createdSections].map(section => [sectionYearKey(section), section])
      )
      const scheduleRows = plan.schedulesToCreate.map(({ schedule, key }) => {
        const targetSection = targetSectionsByKey.get(key)
        if (!targetSection) return null
        return {
          section_id: targetSection.section_id,
          subject_id: schedule.subject_id,
          faculty_name: schedule.faculty_name,
          room: schedule.room,
          day_of_week: schedule.day_of_week,
          start_time: schedule.start_time,
          end_time: schedule.end_time
        }
      })
      if (scheduleRows.some(row => !row)) {
        return toast('Sections were saved, but a target section could not be matched; schedules were not copied.', 'error')
      }
      if (scheduleRows.length) {
        const { error } = await supabase.from('subject_schedules').insert(scheduleRows)
        if (error) return toast(describeError(error, 'Copy schedules (sections were copied; retry to finish)'), 'error')
      }

      toast(`Copied ${createdSections.length} section(s) and ${scheduleRows.length} schedule(s) to ${targetYear}.`)
      await onCopied?.()
    })
}
