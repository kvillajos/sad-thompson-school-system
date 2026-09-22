import { dayNames } from './html.js'

const daySet = days => new Set((days || []).map(Number).filter(day => day >= 1 && day <= 7))

export function planDayChanges(existingDays, selectedDays) {
  const existing = daySet(existingDays)
  const selected = daySet(selectedDays)
  return {
    add: [...selected].filter(day => !existing.has(day)).sort((a, b) => a - b),
    remove: [...existing].filter(day => !selected.has(day)).sort((a, b) => a - b)
  }
}

export function groupScheduleRows(rows) {
  const groups = new Map()
  for (const row of rows || []) {
    const key = [row.section_id, row.subject_id, row.faculty_name || '', row.room || '', row.start_time, row.end_time].join('|')
    const group = groups.get(key) || { ...row, days: [], schedule_ids: [] }
    group.days.push(Number(row.day_of_week))
    group.schedule_ids.push(row.schedule_id)
    groups.set(key, group)
  }
  return [...groups.values()].map(group => ({
    ...group,
    days: [...new Set(group.days)].sort((a, b) => a - b)
  }))
}

export function formatDays(days) {
  return [...daySet(days)].sort((a, b) => a - b).map(day => dayNames[day].slice(0, 3)).join(', ')
}
