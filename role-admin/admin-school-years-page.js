import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { escapeHtml as escape, errorRow } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { withBusy } from '../shared/ui/shell.js'
import { mountAdminShell } from './admin-page.js'

await mountAdminShell('school-years')

const modal = document.getElementById('year-modal')
const form = document.getElementById('year-form')
const modalTitle = document.getElementById('year-modal-title')
const hint = document.getElementById('year-hint')
let years = []

// Status is never stored. It comes from today's date and the year's start and end dates,
// the same rule as school_year_status() in SQL (dates are YYYY-MM-DD, so text compare works).
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
const statusOf = year => {
  const now = today()
  if (now < year.start_date) return 'Upcoming'
  if (now > year.end_date) return 'Past'
  return 'Active'
}
const badge = status => {
  if (status === 'Active') return '<span class="badge active">Active</span>'
  const color = status === 'Upcoming' ? '#2161d1' : '#6b7280'
  return `<span class="badge" style="background:${color}1a;color:${color}">${status}</span>`
}
const formatDate = value => {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

const close = () => {
  modal.classList.add('hidden')
  form.reset()
  form.elements.original_label.value = ''
}
const openForm = year => {
  form.reset()
  form.elements.original_label.value = year?.label || ''
  form.elements.label.value = year?.label || ''
  form.elements.start_date.value = year?.start_date || ''
  form.elements.end_date.value = year?.end_date || ''
  modalTitle.textContent = year ? 'Edit School Year' : 'Add School Year'
  hint.textContent = year
    ? 'Renaming a school year updates every section, grade and log that uses it.'
    : 'Format is YYYY-YYYY. Dates may not overlap another school year.'
  modal.classList.remove('hidden')
}
document.getElementById('add-year').onclick = () => openForm()
document.getElementById('close-year').onclick = close
document.getElementById('cancel-year').onclick = close

async function loadYears() {
  const table = document.getElementById('years-table')
  const { data, error } = await supabase.from('school_years').select('label,start_date,end_date').order('start_date', { ascending: false })
  if (error) return (table.innerHTML = errorRow(5, error, 'Load school years'))
  years = data || []
  renderYears()
}

function renderYears() {
  const table = document.getElementById('years-table')
  const search = document.getElementById('year-search').value.trim().toLowerCase()
  const visible = years.filter(year => !search || year.label.toLowerCase().includes(search))
  table.innerHTML =
    visible
      .map(
        year => `
        <tr>
          <td data-label="School Year"><strong>${escape(year.label)}</strong></td>
          <td data-label="Start Date">${escape(formatDate(year.start_date))}</td>
          <td data-label="End Date">${escape(formatDate(year.end_date))}</td>
          <td data-label="Status">${badge(statusOf(year))}</td>
          <td data-label="Actions"><button class="admin-view" data-edit="${escape(year.label)}">Edit</button></td>
        </tr>`
      )
      .join('') || '<tr><td colspan="5">No matching school years.</td></tr>'
  document
    .querySelectorAll('[data-edit]')
    .forEach(button => (button.onclick = () => openForm(years.find(year => year.label === button.dataset.edit))))
}

form.onsubmit = event => {
  event.preventDefault()
  return withBusy(form.querySelector('button[type="submit"]'), 'Saving…', async () => {
    const values = Object.fromEntries(new FormData(form).entries())
    const original = values.original_label
    const payload = { label: values.label.trim(), start_date: values.start_date, end_date: values.end_date }

    if (!/^\d{4}-\d{4}$/.test(payload.label)) return toast('Use the format YYYY-YYYY, for example 2026-2027.', 'error')
    if (!payload.start_date || !payload.end_date || payload.end_date <= payload.start_date)
      return toast('The end date must come after the start date.', 'error')
    if (years.some(year => year.label === payload.label && year.label !== original))
      return toast(`${payload.label} already exists. Each school year can only exist once.`, 'error')
    const clash = years.find(year => year.label !== original && payload.start_date <= year.end_date && payload.end_date >= year.start_date)
    if (clash) return toast(`These dates overlap ${clash.label}. School year dates may not overlap.`, 'error')

    if (original && original !== payload.label) {
      const confirmed = await confirmDialog(
        `Rename ${original} to ${payload.label}? Every section, grade and log that uses ${original} will change to ${payload.label}.`,
        { title: 'Rename school year', confirmText: 'Rename' }
      )
      if (!confirmed) return
    }

    const result = original
      ? await supabase.from('school_years').update(payload).eq('label', original)
      : await supabase.from('school_years').insert(payload)
    if (result.error) return toast(describeError(result.error, 'Save school year'), 'error')
    close()
    toast(original ? 'School year saved.' : 'School year added.')
    await loadYears()
  })
}

document.getElementById('year-search').oninput = renderYears
await loadYears()
hideLoadingScreen()
