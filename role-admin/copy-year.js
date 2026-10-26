import { supabase } from '../shared/lib/auth-client.js'
import { currentSchoolYear } from '../shared/lib/grades.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'

function nextSchoolYear(schoolYear) {
  const match = /^(\d{4})-(\d{4})$/.exec(schoolYear)
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error(`Invalid school year: ${schoolYear}`)
  }
  return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`
}

const sectionKey = section =>
  `${Number(section.grade_level)}:${String(section.section_name).trim().toLowerCase()}:${section.semester || '1st Semester'}`

export function mountCopyYear(host, onCopied) {
  if (!host) return

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'admin-secondary'
  button.textContent = 'Copy current year sections to next year'
  host.replaceChildren(button)

  button.onclick = () =>
    withBusy(button, 'Copying sections…', async () => {
      const sourceYear = currentSchoolYear()
      let targetYear
      try {
        targetYear = nextSchoolYear(sourceYear)
      } catch (error) {
        toast(error.message, 'error')
        return
      }

      const { data: sourceSections, error: sourceError } = await supabase
        .from('sections')
        .select('section_name,grade_level,capacity,room,semester,faculty_assigned')
        .eq('academic_year', sourceYear)
        .order('grade_level')
        .order('section_name')
      if (sourceError) return toast(describeError(sourceError, 'Load sections to copy'), 'error')
      if (!sourceSections?.length) return toast(`No sections found for ${sourceYear}.`, 'error')

      const { data: targetSections, error: targetError } = await supabase
        .from('sections')
        .select('section_name,grade_level,semester')
        .eq('academic_year', targetYear)
      if (targetError) return toast(describeError(targetError, 'Check next school year sections'), 'error')

      const existing = new Set((targetSections || []).map(sectionKey))
      const sectionsToCopy = sourceSections
        .filter(section => !existing.has(sectionKey(section)))
        .map(section => ({ ...section, academic_year: targetYear }))

      if (!sectionsToCopy.length) return toast(`Sections for ${targetYear} have already been created.`)
      if (
        !(await confirmDialog(
          `Copy ${sectionsToCopy.length} section(s) from ${sourceYear} to ${targetYear}? Students and schedules will not be copied.`,
          { title: 'Copy sections to next school year', confirmText: 'Copy sections' }
        ))
      )
        return

      const { error } = await supabase.from('sections').insert(sectionsToCopy)
      if (error) return toast(describeError(error, 'Copy sections'), 'error')

      toast(`Copied ${sectionsToCopy.length} section(s) to ${targetYear}.`)
      await onCopied?.()
    })
}
