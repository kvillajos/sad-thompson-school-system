const sectionKey = section =>
  `${Number(section.grade_level)}:${String(section.section_name).trim().toLowerCase()}:${section.semester || '1st Semester'}`

const scheduleKey = (key, schedule) =>
  [
    key,
    Number(schedule.subject_id),
    schedule.faculty_name || '',
    schedule.room || '',
    Number(schedule.day_of_week),
    String(schedule.start_time).slice(0, 5),
    String(schedule.end_time).slice(0, 5)
  ].join('|')

export function planYearCopy({ sourceSections, targetSections, sourceSchedules, targetSchedules }) {
  const targetByKey = new Map(targetSections.map(section => [sectionKey(section), section]))
  const sourceKeysById = new Map(sourceSections.map(section => [String(section.section_id), sectionKey(section)]))
  const targetKeysById = new Map(targetSections.map(section => [String(section.section_id), sectionKey(section)]))
  const scheduleKeys = new Set(
    targetSchedules.flatMap(schedule => {
      const key = targetKeysById.get(String(schedule.section_id))
      return key ? [scheduleKey(key, schedule)] : []
    })
  )
  const sectionsToCreate = []
  const sectionsToSkip = []

  sourceSections.forEach(section => {
    const key = sectionKey(section)
    const existing = targetByKey.get(key)
    if (existing) {
      sectionsToSkip.push({ section, existing })
    } else {
      sectionsToCreate.push({ section, key })
    }
  })

  const schedulesToCreate = []
  const schedulesToSkip = []
  sourceSchedules.forEach(schedule => {
    const key = sourceKeysById.get(String(schedule.section_id))
    if (!key) return

    const entry = { schedule, key }
    const identity = scheduleKey(key, schedule)
    if (scheduleKeys.has(identity)) {
      schedulesToSkip.push(entry)
    } else {
      schedulesToCreate.push(entry)
      scheduleKeys.add(identity)
    }
  })

  return { sectionsToCreate, sectionsToSkip, schedulesToCreate, schedulesToSkip }
}

export function nextSchoolYear(schoolYear) {
  const match = /^(\d{4})-(\d{4})$/.exec(schoolYear)
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error(`Invalid school year: ${schoolYear}`)
  }
  return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`
}

export function sectionYearKey(section) {
  return sectionKey(section)
}
