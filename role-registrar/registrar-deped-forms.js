// Section Reports > DepEd School Forms: SF1, SF2 (per month), SF5 and SF10 for the chosen section, as .xlsx.
import { supabase } from '../shared/lib/auth-client.js'
import { escapeHtml } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { scaleFor } from '../shared/lib/grades.js'
import { loadGradingScales } from '../shared/lib/grading-scale.js'
import { classSpan } from '../shared/lib/calendar.js'
import { nextSchoolYear } from '../shared/lib/year-copy.js'
import { sf10Sheet, sf1Sheet, sf2Sheet, sf5Sheet } from '../shared/documents/deped-forms.js'
import { buildWorkbook } from '../shared/documents/xlsx-writer.js'
import { downloadFile, loadExcel } from '../shared/ui/download.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'
import { loadSectionData } from './registrar-section-reports.js'

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
// School months, June of the first year to May of the second.
const schoolMonths = schoolYear => {
  const first = Number(String(schoolYear).slice(0, 4))
  return [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5].map(month => ({ month, year: month >= 6 ? first : first + 1 }))
}
const fileName = (form, section) => `${form} - ${section.section_name} ${section.academic_year}.xlsx`.replace(/[\\/:*?"<>|]/g, '')

async function download(specs, name) {
  const workbook = await buildWorkbook(specs, await loadExcel())
  const buffer = await workbook.xlsx.writeBuffer()
  downloadFile(name, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

const FORMS = {
  async sf1(section) {
    const { students } = await loadSectionData(section)
    await download([sf1Sheet({ section, students })], fileName('SF1 School Register', section))
  },
  async sf2(section, monthValue) {
    const [year, month] = monthValue.split('-').map(Number)
    const { students } = await loadSectionData(section)
    const ids = students.map(s => s.student_id)
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-31`
    const [attendance, holidays, quarters, schoolYear] = await Promise.all([
      ids.length
        ? fetchAll(() =>
            supabase
              .from('attendance')
              .select('attendance_id,student_id,attendance_date,status,sections!inner(academic_year)')
              .in('student_id', ids)
              .eq('sections.academic_year', section.academic_year)
              .in('status', ['Absent', 'Late'])
              .gte('attendance_date', start)
              .lte('attendance_date', end)
              .order('attendance_id')
          )
        : { data: [] },
      supabase.from('school_holidays').select('holiday_date').eq('school_year', section.academic_year),
      supabase.from('school_quarters').select('quarter,start_date,end_date').eq('school_year', section.academic_year),
      supabase.from('school_years').select('label,start_date,end_date').eq('label', section.academic_year).maybeSingle()
    ])
    if (attendance.error) throw attendance.error
    const span = classSpan(quarters.data || [], schoolYear.data) || {}
    await download(
      [
        sf2Sheet({
          section,
          students,
          year,
          month,
          attendance: attendance.data,
          holidays: (holidays.data || []).map(h => h.holiday_date),
          span
        })
      ],
      fileName(`SF2 Attendance ${MONTH_NAMES[month]} ${year}`, section)
    )
  },
  async sf5(section) {
    const [{ students, grades }] = await Promise.all([loadSectionData(section), loadGradingScales()])
    const ids = students.map(s => s.student_id)
    // Promotion is logged under the year being promoted into (see batch_promote_students).
    const logs = ids.length
      ? await supabase
          .from('promotion_logs')
          .select('student_id,result,created_at')
          .in('student_id', ids)
          .eq('school_year', nextSchoolYear(section.academic_year))
          .order('created_at')
      : { data: [] }
    if (logs.error) throw logs.error
    const promotions = new Map((logs.data || []).map(row => [row.student_id, row.result]))
    await download(
      [sf5Sheet({ section, students, grades, promotions, scale: scaleFor(section.academic_year) })],
      fileName('SF5 Promotion and Proficiency', section)
    )
  },
  async sf10(section) {
    const { students } = await loadSectionData(section)
    const ids = students.map(s => s.student_id)
    if (!ids.length) return toast('This section has no students.', 'error')
    const [history, enrollments] = await Promise.all([
      fetchAll(() => supabase.from('academic_history').select('*').in('student_id', ids).order('id')),
      fetchAll(() =>
        supabase
          .from('enrollments')
          .select('id,student_id,school_year,grade_level,sections(section_name)')
          .in('student_id', ids)
          .order('id')
      )
    ])
    const failed = [history, enrollments].find(result => result.error)
    if (failed) throw failed.error
    await download(
      students.map(student =>
        sf10Sheet({
          student,
          history: history.data.filter(row => row.student_id === student.student_id),
          enrollments: enrollments.data.filter(row => row.student_id === student.student_id)
        })
      ),
      fileName('SF10 Permanent Records', section)
    )
  }
}

// selected(): the section chosen in the Section Reports tab.
export function mountDepedForms(host, { selected }) {
  host.innerHTML = `
    <h3>DepEd School Forms</h3>
    <p>Excel files for the chosen section. School ID and district print blank until they are set (shared/documents/deped-forms.js).</p>
    <div class="filterbar">
      <button type="button" class="btn secondary" data-form="sf1">SF1 School Register</button>
      <select data-sf2-month aria-label="SF2 month"></select>
      <button type="button" class="btn secondary" data-form="sf2">SF2 Daily Attendance</button>
      <button type="button" class="btn secondary" data-form="sf5">SF5 Promotion</button>
      <button type="button" class="btn secondary" data-form="sf10">SF10 Permanent Records</button>
    </div>`
  const monthSelect = host.querySelector('[data-sf2-month]')
  let filledFor = null
  // Rebuilt only when the chosen section's school year changes, so a picked month stays picked.
  const fillMonths = () => {
    const section = selected()
    if ((section?.academic_year ?? null) === filledFor) return
    filledFor = section?.academic_year ?? null
    const months = section ? schoolMonths(section.academic_year) : []
    const now = new Date()
    monthSelect.innerHTML = months
      .map(({ month, year }) => `<option value="${year}-${month}">${escapeHtml(MONTH_NAMES[month])} ${year}</option>`)
      .join('')
    const thisMonth = `${now.getFullYear()}-${now.getMonth() + 1}`
    if (months.some(({ month, year }) => `${year}-${month}` === thisMonth)) monthSelect.value = thisMonth
  }
  fillMonths()
  monthSelect.onfocus = fillMonths
  host.querySelectorAll('[data-form]').forEach(button => {
    button.onclick = () =>
      withBusy(button, 'Preparing…', async () => {
        const section = selected()
        if (!section) return toast('Choose a section first.', 'error')
        try {
          await FORMS[button.dataset.form](section, monthSelect.value)
        } catch (error) {
          toast(describeError(error, `Export ${button.textContent}`), 'error')
        }
      })
  })
}
