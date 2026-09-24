// Weekly schedule as day tabs (Monday, Tuesday, ...). Opens on today's day; every other day is one click away.
// Used by the student and faculty schedule views. `rows` need day_of_week and start_time.
import { dayNames, escapeHtml } from './html.js'

// JS getDay(): 0 = Sunday. Schedule days: 1 = Monday ... 7 = Sunday.
export const todayDay = (date = new Date()) => date.getDay() || 7

// Monday-Friday always get a tab; Saturday/Sunday only when a class is scheduled then.
export function visibleDays(rows) {
  const used = new Set((rows || []).map(row => Number(row.day_of_week)))
  return [1, 2, 3, 4, 5, 6, 7].filter(day => day <= 5 || used.has(day))
}

// Today if it has a tab, otherwise Monday (e.g. a Sunday with no classes).
export const initialDay = (days, today = todayDay()) => days.includes(today) ? today : days[0]

const hm = value => String(value ?? '').slice(0, 5)

// school_year_settings row -> [{ label, start, end }] as 'HH:MM' strings, ready for mountDayTabs({ gaps }).
export function gapsFrom(settings) {
  if (!settings) return []
  const gaps = [{ label: 'Lunch break', start: hm(settings.lunch_start), end: hm(settings.lunch_end) }]
  if (settings.break_start && settings.break_end) gaps.push({ label: 'Break', start: hm(settings.break_start), end: hm(settings.break_end) })
  return gaps
}

// Does a class (start/end as 'HH:MM[:SS]') overlap the lunch window? Used by the admin schedule form.
export const overlapsLunch = (settings, start, end) => Boolean(settings) && hm(start) < hm(settings.lunch_end) && hm(end) > hm(settings.lunch_start)

// Class rows plus lunch/break rows in time order. A gap is left out when a class overlaps it that day
// (e.g. a long class that runs through the break), so the table never shows a break "inside" a class.
export function withGaps(list, gaps = []) {
  const items = list.map(row => ({ type: 'class', start: hm(row.start_time), end: hm(row.end_time), row }))
  for (const gap of gaps) {
    if (items.some(item => item.type === 'class' && item.start < gap.end && item.end > gap.start)) continue
    items.push({ type: 'gap', start: gap.start, end: gap.end, label: gap.label })
  }
  return items.sort((a, b) => a.start.localeCompare(b.start) || (a.type === 'gap' ? -1 : 1))
}

export function mountDayTabs(host, rows, { headers, cells, emptyText = 'No classes scheduled.', gaps = [] }) {
  if (!host) return
  const days = visibleDays(rows)
  const byDay = day => (rows || []).filter(row => Number(row.day_of_week) === day).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
  const today = todayDay()
  const show = day => {
    host.querySelectorAll('.subtab').forEach(tab => { const active = Number(tab.dataset.day) === day; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)) })
    const list = byDay(day)
    const items = list.length ? withGaps(list, gaps) : []
    host.querySelector('tbody').innerHTML = items.map(item => item.type === 'gap'
      ? `<tr class="schedule-gap"><td colspan="${headers.length}">${escapeHtml(item.label)} &middot; ${item.start} - ${item.end}</td></tr>`
      : `<tr>${cells(item.row).map(value => `<td>${value}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}">${escapeHtml(`${emptyText} (${dayNames[day]})`)}</td></tr>`
  }
  host.innerHTML = `<div class="subtabs" role="tablist">${days.map(day => `<button type="button" class="subtab" role="tab" data-day="${day}">${dayNames[day]}${day === today ? ' <small>(today)</small>' : ''}${byDay(day).length ? ` <small>${byDay(day).length}</small>` : ''}</button>`).join('')}</div><table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody></tbody></table>`
  host.querySelectorAll('.subtab').forEach(tab => tab.addEventListener('click', () => show(Number(tab.dataset.day))))
  show(initialDay(days, today))
}
