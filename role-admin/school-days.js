import { escapeHtml } from '../shared/lib/html.js'
import { supabase } from '../shared/lib/auth-client.js'
import { currentSchoolYear } from '../shared/lib/grades.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'

const MONTHS = [
  { number: 6, name: 'June' },
  { number: 7, name: 'July' },
  { number: 8, name: 'August' },
  { number: 9, name: 'September' },
  { number: 10, name: 'October' },
  { number: 11, name: 'November' },
  { number: 12, name: 'December' },
  { number: 1, name: 'January' },
  { number: 2, name: 'February' },
  { number: 3, name: 'March' }
]


export async function mountSchoolDays(container) {
  if (!container) return

  container.innerHTML = `
    <section class="admin-table-wrap lunch-card">
      <div class="admin-section-title">
        <div><h3>School days</h3></div>
        <label class="scale-year">
          School year
          <select id="school-days-year"></select>
        </label>
      </div>
      <form id="school-days-form">
        <div id="school-days-months"
          style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin-bottom:16px">
        </div>
        <button class="admin-primary lunch-save" type="submit">Save school days</button>
      </form>
      <p class="admin-note" id="school-days-note" aria-live="polite"></p>
    </section>
  `

  const yearSelect = container.querySelector('#school-days-year')
  const form = container.querySelector('#school-days-form')
  const monthsContainer = container.querySelector('#school-days-months')
  const note = container.querySelector('#school-days-note')

  const defaultYear = currentSchoolYear()

  function renderMonths(rows = []) {
    const saved = new Map(rows.map(row => [Number(row.month), Number(row.days)]))

    monthsContainer.innerHTML = MONTHS.map(month => `
      <label>
        ${month.name}
        <input
          type="number"
          name="month-${month.number}"
          min="0"
          max="31"
          step="1"
          required
          value="${saved.has(month.number) ? saved.get(month.number) : ''}"
          placeholder="School days"
          style="width:100%"
        />
      </label>
    `).join('')
  }

  async function loadYearOptions() {
    const { data, error } = await supabase
      .from('school_days')
      .select('school_year')
      .order('school_year', { ascending: false })

    if (error) {
      note.textContent = describeError(error, 'Load school years')
      return
    }

    const years = [...new Set([
      defaultYear,
      ...(data || []).map(row => row.school_year)
    ])].filter(Boolean).sort().reverse()

    yearSelect.innerHTML = years
      .map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`)
      .join('')

    yearSelect.value = years.includes(defaultYear) ? defaultYear : years[0]
  }

  async function loadSchoolDays() {
    const schoolYear = yearSelect.value
    if (!schoolYear) return

    note.textContent = 'Loading school days...'

    const { data, error } = await supabase
      .from('school_days')
      .select('month,days')
      .eq('school_year', schoolYear)

    if (error) {
      note.textContent = describeError(error, 'Load school days')
      return
    }

    renderMonths(data || [])
    note.textContent = `Enter the number of school days for each month of ${schoolYear}.`
  }

  yearSelect.addEventListener('change', loadSchoolDays)

  form.addEventListener('submit', async event => {
    event.preventDefault()

    const schoolYear = yearSelect.value
    if (!schoolYear) {
      note.textContent = 'Choose a school year first.'
      return
    }

    const values = MONTHS.map(month => ({
      school_year: schoolYear,
      month: month.number,
      days: Number(form.elements.namedItem(`month-${month.number}`).value)
    }))

    if (values.some(row => !Number.isInteger(row.days) || row.days < 0 || row.days > 31)) {
      note.textContent = 'Each month must be a whole number from 0 to 31.'
      return
    }

    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    button.textContent = 'Saving...'

    try {
      const { error } = await supabase
        .from('school_days')
        .upsert(values, { onConflict: 'school_year,month' })

      if (error) {
        note.textContent = describeError(error, 'Save school days')
        return
      }

      toast(`School days saved for ${schoolYear}.`, 'success')
      note.textContent = `School days saved for ${schoolYear}.`
      await loadYearOptions()
      yearSelect.value = schoolYear
      await loadSchoolDays()
    } finally {
      button.disabled = false
      button.textContent = 'Save school days'
    }
  })

  await loadYearOptions()
  await loadSchoolDays()
}
