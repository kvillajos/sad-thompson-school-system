import { supabase } from '../shared/lib/auth-client.js'
import { currentSchoolYear } from '../shared/lib/grades.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog, noticeDialog } from '../shared/ui/dialog.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { nextSchoolYear, planYearCopy, sectionYearKey } from '../shared/lib/year-copy.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'

const sectionLabel = section =>
  `${section.section_name} (Grade ${section.grade_level}, ${section.semester || '1st Semester'})`

const scheduleLabel = (schedule, key, sectionsByKey) => {
  const section = sectionsByKey.get(key)
  return `${section ? sectionLabel(section) : key}: subject ${schedule.subject_id}, day ${schedule.day_of_week}, ${String(schedule.start_time).slice(0, 5)}-${String(schedule.end_time).slice(0, 5)}`
}

export function mountCopyYear(host, onCopied) {
  if (!host) return

  const sourceYear = currentSchoolYear()
  let targetYear
  try {
    targetYear = nextSchoolYear(sourceYear)
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
        supabase
          .from('sections')
          .select('section_id,section_name,grade_level,semester')
          .eq('academic_year', targetYear)
          .order('section_id')
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
      const sourceSectionsByKey = new Map(sourceSections.map(section => [sectionYearKey(section), section]))
      const previewRows = rows => (rows.length ? rows : ['None'])
      const preview = [
        `From ${sourceYear} to ${targetYear}`,
        '',
        `Sections to create (${plan.sectionsToCreate.length}):`,
        ...previewRows(plan.sectionsToCreate.map(({ section }) => `+ ${sectionLabel(section)}`)),
        '',
        `Sections to skip (${plan.sectionsToSkip.length}):`,
        ...previewRows(plan.sectionsToSkip.map(({ section }) => `- ${sectionLabel(section)} (already exists)`)),
        '',
        `Schedules to create (${plan.schedulesToCreate.length}):`,
        ...previewRows(
          plan.schedulesToCreate.map(({ schedule, key }) =>
            `+ ${scheduleLabel(schedule, key, sourceSectionsByKey)}`
          )
        ),
        '',
        `Schedules to skip (${plan.schedulesToSkip.length}):`,
        ...previewRows(
          plan.schedulesToSkip.map(({ schedule, key }) =>
            `- ${scheduleLabel(schedule, key, sourceSectionsByKey)} (already exists)`
          )
        ),
        '',
        'Students will not be copied.'
      ].join('\n')
      await noticeDialog(preview, { title: `Copy setup: ${sourceYear} to ${targetYear}` })

      const copyCount = plan.sectionsToCreate.length + plan.schedulesToCreate.length
      if (!copyCount) return toast(`All sections and schedules for ${targetYear} already exist.`)
      if (
        !(await confirmDialog(
          `Create ${plan.sectionsToCreate.length} section(s) and ${plan.schedulesToCreate.length} schedule(s) for ${targetYear}?`,
          { title: 'Confirm school-year setup copy', confirmText: 'Copy setup' }
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
        const { data, error } = await supabase
          .from('sections')
          .insert(sectionRows)
          .select('section_id,section_name,grade_level,semester')
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
