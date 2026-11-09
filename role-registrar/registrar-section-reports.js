// Registrar > Section Reports: whole-section documents. Batch report cards (one Form 138 per student, one page
// each, printed or saved as one PDF) and the DepEd School Forms exports.
import { supabase } from '../shared/lib/auth-client.js'
import { byLastName, escapeHtml, gradeLabel } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { fillYearSelect } from '../shared/lib/school-years.js'
import { buildReportCard, monthlyAbsencesFrom } from '../shared/documents/report-card.js'
import { previewPdf } from '../shared/documents/pdf-preview.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'

let sections = []

// Runs fn over items with at most `size` requests in flight (one attendance_totals call per student).
async function inBatches(items, size, fn) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  return out
}

// Everything a section's documents need for one school year. Exported for the DepEd forms.
export async function loadSectionData(section) {
  const year = section.academic_year
  const roster = await supabase
    .from('enrollments')
    .select('student_id,grade_level,status,students(*)')
    .eq('section_id', section.section_id)
    .in('status', ['active', 'completed'])
  if (roster.error) throw roster.error
  const students = (roster.data || [])
    .map(row => row.students)
    .filter(Boolean)
    .sort(byLastName)
  const ids = students.map(student => student.student_id)
  if (!ids.length) return { section, students, grades: [], absences: [], schoolDays: [] }
  const [grades, absences, schoolDays] = await Promise.all([
    fetchAll(() => supabase.from('academic_history').select('*').eq('school_year', year).in('student_id', ids).order('id')),
    fetchAll(() =>
      supabase
        .from('attendance')
        .select('attendance_id,student_id,attendance_date,status,sections!inner(academic_year)')
        .in('student_id', ids)
        .eq('sections.academic_year', year)
        .eq('status', 'Absent')
        .order('attendance_id')
    ),
    supabase.from('school_days').select('month,days').eq('school_year', year)
  ])
  const failed = [grades, absences, schoolDays].find(result => result.error)
  if (failed) throw failed.error
  return { section, students, grades: grades.data, absences: absences.data, schoolDays: schoolDays.data || [] }
}

async function printReportCards(section) {
  const data = await loadSectionData(section)
  if (!data.students.length) return toast('This section has no students.', 'error')
  const totals = await inBatches(data.students, 8, student =>
    supabase.rpc('attendance_totals', { p_student_id: student.student_id, p_school_year: section.academic_year })
  )
  const cards = data.students.map((student, index) => {
    const rows = data.grades.filter(row => row.student_id === student.student_id)
    return `<div class="batch-report-card">${buildReportCard({
      student,
      gradeLevel: gradeLabel(section.grade_level),
      schoolYear: section.academic_year,
      sectionName: section.section_name,
      academicRows: rows,
      attendance: totals[index].data,
      schoolDays: data.schoolDays,
      monthlyAbsences: monthlyAbsencesFrom(data.absences.filter(row => row.student_id === student.student_id)),
      remarks: rows
        .map(row => row.remarks)
        .filter(Boolean)
        .join('; ')
    })}</div>`
  })
  const host = document.getElementById('academic-print-card')
  host.innerHTML = cards.join('')
  previewPdf(host, {
    title: `Report Cards: ${section.section_name} (${data.students.length})`,
    filename: `Report Cards - ${section.section_name} ${section.academic_year}.pdf`.replace(/[\\/:*?"<>|]/g, ''),
    printClass: 'printing-card'
  })
}

export async function mountSectionReportsTab(host) {
  host.innerHTML = `
    <div class="filterbar">
      <select id="reports-year" aria-label="School year"></select>
      <select id="reports-section" aria-label="Section"></select>
    </div>
    <p id="reports-section-info" class="year-summary"></p>
    <h3>Report cards</h3>
    <p>Every student's report card (Form 138) for the chosen section and year, one page each, ready to print or save as one PDF.</p>
    <div class="actions" style="justify-content:flex-start"><button type="button" class="btn" id="reports-cards">Print report cards</button></div>
    <div id="deped-forms-host"></div>`
  const $ = id => host.querySelector(`#${id}`)
  const selected = () => sections.find(section => String(section.section_id) === $('reports-section').value)

  async function loadSections() {
    const { data, error } = await supabase
      .from('sections')
      .select('section_id,section_name,grade_level,strand,semester,academic_year,faculty_assigned,room')
      .eq('academic_year', $('reports-year').value)
      .order('grade_level')
      .order('section_name')
    if (error) return toast(describeError(error, 'Load sections'), 'error')
    sections = data || []
    $('reports-section').innerHTML =
      sections
        .map(
          s =>
            `<option value="${s.section_id}">${escapeHtml(gradeLabel(s.grade_level))} - ${escapeHtml(s.section_name)}${s.semester ? ` (${escapeHtml(s.semester)})` : ''}</option>`
        )
        .join('') || '<option value="">No sections this year</option>'
    showInfo()
  }
  const showInfo = () => {
    const s = selected()
    $('reports-section-info').innerHTML = s
      ? `<span>Adviser: <strong>${escapeHtml(s.faculty_assigned || 'none')}</strong></span>${s.strand ? `<span>Strand: ${escapeHtml(s.strand)}</span>` : ''}${s.room ? `<span>Room: ${escapeHtml(s.room)}</span>` : ''}`
      : ''
  }

  await fillYearSelect($('reports-year'))
  $('reports-year').onchange = loadSections
  $('reports-section').onchange = showInfo
  $('reports-cards').onclick = event =>
    withBusy(event.currentTarget, 'Preparing…', async () => {
      const section = selected()
      if (!section) return toast('Choose a section first.', 'error')
      await printReportCards(section).catch(error => toast(describeError(error, 'Prepare report cards'), 'error'))
    })
  await loadSections()
  return { selected }
}
