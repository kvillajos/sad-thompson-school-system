import { supabase } from '../shared/lib/auth-client.js'
import { loadFacultyContext, escapeHtml } from './faculty-common.js'
import { buildReportCard } from '../shared/documents/report-card.js'
import { previewPdf, pdfName } from '../shared/documents/pdf-preview.js'
import { withBusy } from '../shared/ui/shell.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import { gradeLabel } from '../shared/lib/html.js'
import { searchPicker } from '../shared/ui/search-picker.js'
import { loadGradingScales } from '../shared/lib/grading-scale.js'

const context = await loadFacultyContext('reports')
await loadGradingScales()
if (context) {
  const $ = id => document.getElementById(id)
  // Type-to-search over the faculty's students (a plain dropdown is unusable past a few dozen names).
  let pickedStudent = null
  const studentName = item => `${item.students?.first_name || ''} ${item.students?.last_name || ''}`.trim()
  const studentLrn = item => item.students?.lrn_number || item.student_id
  searchPicker($('report-student'), {
    search: query => {
      const words = query.toLowerCase().split(/\s+/)
      return context.enrollments
        .filter(item => words.every(word => `${studentName(item)} ${studentLrn(item)}`.toLowerCase().includes(word)))
        .slice(0, 15)
    },
    render: item => `${escapeHtml(studentName(item))} <small>(${escapeHtml(studentLrn(item))})</small>`,
    text: item => `${studentName(item)} (${studentLrn(item)})`,
    onPick: item => {
      pickedStudent = item
      const info = $('report-student-info')
      info.hidden = !item
      if (!item) return
      const section = context.schedules.find(row => row.section_id === item.section_id)?.sections?.section_name
      const field = (label, value) => `<div><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`
      info.innerHTML =
        field('Student No.', studentLrn(item)) +
        field('Grade', gradeLabel(item.students?.grade_level)) +
        field('Section', section || 'No section')
    },
    emptyText: 'No student found'
  })
  // Blank report card (no name, grades or dates) so faculty can see the layout before generating one.
  $('report-sample').innerHTML = buildReportCard({ student: {}, gradeLevel: '', schoolYear: '', sectionName: '' })
  $('report-year').value = context.schoolYear
  $('generate-report').onclick = () =>
    withBusy($('generate-report'), 'Loading...', async () => {
      const year = $('report-year').value.trim()
      const studentRow = pickedStudent
      const studentId = Number(studentRow?.student_id)
      if (!studentRow || !year) return toast('Search and pick a student, and enter a school year.', 'error')
      const [academicResult, attendanceResult, enrollmentDetail] = await Promise.all([
        supabase.from('academic_history').select('*').eq('student_id', studentId).eq('school_year', year).order('subject'),
        supabase.rpc('attendance_totals', { p_student_id: studentId, p_school_year: year }),
        supabase
          .from('enrollments')
          .select('grade_level,sections(section_name)')
          .eq('student_id', studentId)
          .eq('school_year', year)
          .maybeSingle()
      ])
      const error = academicResult.error || attendanceResult.error
      if (error) return toast(describeError(error, 'Load report card'), 'error')
      if (!academicResult.data?.length) toast(`No grades are recorded for ${year} yet; the report card will be mostly blank.`, 'error')
      $('faculty-report-preview').innerHTML = buildReportCard({
        student: { ...studentRow.students, student_id: studentId },
        gradeLevel: gradeLabel(enrollmentDetail.data?.grade_level ?? studentRow.students?.grade_level),
        schoolYear: year,
        sectionName: enrollmentDetail.data?.sections?.section_name,
        academicRows: academicResult.data || [],
        attendance: attendanceResult.data
      })
      // Same preview window as the registrar's record card: shows the page, then Print or Download PDF.
      previewPdf($('faculty-report-preview'), {
        title: `Report Card ${year}`,
        filename: pdfName(`Report Card ${year}`, studentRow.students),
        printClass: 'printing-report-card'
      })
    })
}
