// Auto-schedule planner behind Manage Schedules > Auto-schedule. Each subject gets one time slot that meets every
// school day (Monday to Friday), so the section, its teacher and its room are never double-booked and no class
// touches lunch or break. Teachers come from Manage Faculty's subject assignments; the least-loaded free one wins.
// Pure on purpose (no app imports) so dev/scripts/checks/check-schedule-plan.mjs can assert it in Node.

export const SCHOOL_DAYS = [1, 2, 3, 4, 5]

const toMinutes = time => {
  const [hours, minutes] = String(time).slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}
const toTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const overlaps = (start, end, otherStart, otherEnd) => toMinutes(start) < toMinutes(otherEnd) && toMinutes(otherStart) < toMinutes(end)

// The day's class slots: back-to-back classes of `length` minutes from dayStart to dayEnd, skipping over
// lunch and break (settings are a school_year_settings row).
export function daySlots(settings = {}, { dayStart = '07:30', dayEnd = '17:00', length = 60 } = {}) {
  const blocks = [
    [settings.break_start, settings.break_end],
    [settings.lunch_start, settings.lunch_end]
  ]
    .filter(([start, end]) => start && end)
    .map(([start, end]) => [toMinutes(start), toMinutes(end)])
  const slots = []
  for (let start = toMinutes(dayStart); start + length <= toMinutes(dayEnd); ) {
    const block = blocks.find(([blockStart, blockEnd]) => start < blockEnd && blockStart < start + length)
    if (block) {
      start = block[1]
      continue
    }
    slots.push({ start_time: toTime(start), end_time: toTime(start + length) })
    start += length
  }
  return slots
}

const sameText = (a, b) => Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
const busy = (rows, slot, days, matches) =>
  rows.some(
    row => days.includes(Number(row.day_of_week)) && matches(row) && overlaps(slot.start_time, slot.end_time, row.start_time, row.end_time)
  )

// section: { section_id, room }; subjects: the subjects to place [{ subject_id, ... }];
// teachers: Map subject_id -> [{ profile_id, name }]; existing: the same school year's schedule rows
// (subject_schedules shape) that stay. Returns the classes to add and the subjects that could not be placed.
export function planSection({ section, subjects, teachers, existing = [], slots, days = SCHOOL_DAYS }) {
  const rows = [...existing]
  const placed = []
  const unplaced = []
  const loadOf = teacher =>
    new Set(
      rows
        .filter(row => row.faculty_profile_id === teacher.profile_id || sameText(row.faculty_name, teacher.name))
        .map(row => `${row.day_of_week} ${row.start_time}`)
    ).size
  // The hardest subjects first: those with the fewest teachers to choose from.
  const ordered = [...subjects].sort((a, b) => (teachers.get(a.subject_id)?.length || 0) - (teachers.get(b.subject_id)?.length || 0))
  for (const subject of ordered) {
    const candidates = teachers.get(subject.subject_id) || []
    if (!candidates.length) {
      unplaced.push({ subject, reason: 'No teacher is assigned to this subject (Manage Faculty > Assign).' })
      continue
    }
    const freeSlots = slots.filter(
      slot =>
        !busy(rows, slot, days, row => Number(row.section_id) === Number(section.section_id)) &&
        !(section.room && busy(rows, slot, days, row => sameText(row.room, section.room)))
    )
    if (!freeSlots.length) {
      unplaced.push({ subject, reason: 'The section has no free time slot left.' })
      continue
    }
    let choice = null
    for (const teacher of [...candidates].sort((a, b) => loadOf(a) - loadOf(b))) {
      const slot = freeSlots.find(
        free => !busy(rows, free, days, row => row.faculty_profile_id === teacher.profile_id || sameText(row.faculty_name, teacher.name))
      )
      if (slot) {
        choice = { teacher, slot }
        break
      }
    }
    if (!choice) {
      unplaced.push({ subject, reason: "Every teacher of this subject is busy during the section's free slots." })
      continue
    }
    const planned = {
      section_id: section.section_id,
      subject_id: subject.subject_id,
      faculty_profile_id: choice.teacher.profile_id,
      faculty_name: choice.teacher.name,
      room: section.room || null,
      start_time: choice.slot.start_time,
      end_time: choice.slot.end_time
    }
    placed.push({ ...planned, subject })
    days.forEach(day_of_week => rows.push({ ...planned, day_of_week }))
  }
  return { placed, unplaced }
}

// Plans several sections one after another, so a teacher placed in one section is busy for the next.
export function planSections({ sections, subjectsFor, teachers, existing = [], slots, days = SCHOOL_DAYS }) {
  const rows = [...existing]
  return sections.map(section => {
    const result = planSection({ section, subjects: subjectsFor(section), teachers, existing: rows, slots, days })
    result.placed.forEach(planned => days.forEach(day_of_week => rows.push({ ...planned, day_of_week })))
    return { section, ...result }
  })
}
