// Registrar > Graduation: Grade 12 graduates and Grade 10 completers of a school year. Both come from batch
// promotion (Promotion & Transfers, approved by the admin): passing Grade 12 students become 'Graduated' and
// passing Grade 10 students are promoted to Grade 11 and listed here as Junior High completers.
import { supabase } from '../shared/lib/auth-client.js'
import { byLastName, escapeHtml, errorRow, formatDate, lastFirst } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { fillYearSelect } from '../shared/lib/school-years.js'
import { nextSchoolYear } from '../shared/lib/year-copy.js'
import { toast } from '../shared/ui/ui-theme.js'

const LEVELS = [
  { grade: 12, title: 'Grade 12 graduates', note: 'Status: Graduated. Their login now shows only the transcript and document requests.' },
  { grade: 10, title: 'Grade 10 completers (Junior High)', note: 'They stay enrolled and continue to Grade 11.' }
]

export async function mountGraduationTab(host) {
  host.innerHTML = `
    <div class="filterbar"><select id="graduation-year" aria-label="Graduating school year"></select></div>
    <p>Graduation and completion are recorded when the batch promotion for the year is approved (Promotion &amp; Transfers).
    Students still waiting are those in the grade with no promotion result yet.</p>
    <div id="graduation-lists"></div>`
  const yearSelect = host.querySelector('#graduation-year')
  const lists = host.querySelector('#graduation-lists')

  async function load() {
    const year = yearSelect.value
    lists.innerHTML = '<p>Loading…</p>'
    const [logs, enrolled] = await Promise.all([
      fetchAll(() =>
        supabase
          .from('promotion_logs')
          .select('id,student_id,from_grade,to_grade,result,created_at,students(first_name,last_name,lrn_number,strand,enrollment_status)')
          .eq('school_year', nextSchoolYear(year))
          .in('from_grade', [10, 12])
          .order('id')
      ),
      fetchAll(() =>
        supabase
          .from('enrollments')
          .select('id,student_id,grade_level,students(first_name,last_name,lrn_number,strand)')
          .eq('school_year', year)
          .in('grade_level', [10, 12])
          .in('status', ['active', 'completed'])
          .order('id')
      )
    ])
    const failed = [logs, enrolled].find(result => result.error)
    if (failed) return (lists.innerHTML = `<table><tbody>${errorRow(1, failed.error, 'Load graduation lists')}</tbody></table>`)
    lists.innerHTML = LEVELS.map(level => {
      const levelLogs = logs.data.filter(row => row.from_grade === level.grade)
      const done = levelLogs.filter(row => row.result === 'promoted').sort((a, b) => byLastName(a.students, b.students))
      const held = levelLogs.filter(row => row.result !== 'promoted')
      const logged = new Set(levelLogs.map(row => row.student_id))
      const waiting = enrolled.data.filter(row => row.grade_level === level.grade && !logged.has(row.student_id))
      return `<h3>${escapeHtml(level.title)} (${done.length})</h3>
        <p class="note-inline">${escapeHtml(level.note)}${waiting.length ? ` ${waiting.length} still waiting for promotion.` : ''}${
          held.length ? ` ${held.length} retained or incomplete.` : ''
        }</p>
        <table><thead><tr><th>No.</th><th>Student No.</th><th>Name</th>${level.grade === 12 ? '<th>Strand</th>' : ''}<th>Recorded</th></tr></thead><tbody>${
          done
            .map(
              (row, i) =>
                `<tr><td>${i + 1}</td><td>${escapeHtml(row.students?.lrn_number || '')}</td><td>${escapeHtml(lastFirst(row.students))}</td>${
                  level.grade === 12 ? `<td>${escapeHtml(row.students?.strand || '-')}</td>` : ''
                }<td>${escapeHtml(formatDate(row.created_at))}</td></tr>`
            )
            .join('') || `<tr><td colspan="${level.grade === 12 ? 5 : 4}">None recorded yet for ${escapeHtml(year)}.</td></tr>`
        }</tbody></table>`
    }).join('')
  }

  await fillYearSelect(yearSelect)
  yearSelect.onchange = () => load().catch(error => toast(describeError(error, 'Load graduation lists'), 'error'))
  await load()
}
