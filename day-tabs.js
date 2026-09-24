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

export function mountDayTabs(host, rows, { headers, cells, emptyText = 'No classes scheduled.' }) {
  if (!host) return
  const days = visibleDays(rows)
  const byDay = day => (rows || []).filter(row => Number(row.day_of_week) === day).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
  const today = todayDay()
  const show = day => {
    host.querySelectorAll('.subtab').forEach(tab => { const active = Number(tab.dataset.day) === day; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)) })
    const list = byDay(day)
    host.querySelector('tbody').innerHTML = list.map(row => `<tr>${cells(row).map(value => `<td>${value}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}">${escapeHtml(`${emptyText} (${dayNames[day]})`)}</td></tr>`
  }
  host.innerHTML = `<div class="subtabs" role="tablist">${days.map(day => `<button type="button" class="subtab" role="tab" data-day="${day}">${dayNames[day]}${day === today ? ' <small>(today)</small>' : ''}${byDay(day).length ? ` <small>${byDay(day).length}</small>` : ''}</button>`).join('')}</div><table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody></tbody></table>`
  host.querySelectorAll('.subtab').forEach(tab => tab.addEventListener('click', () => show(Number(tab.dataset.day))))
  show(initialDay(days, today))
}
