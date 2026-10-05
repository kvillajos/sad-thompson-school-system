import { supabase } from '../shared/lib/auth-client.js'
import { loadFacultyContext, escapeHtml } from './faculty-common.js'
import { buildReportCard } from '../shared/documents/report-card.js'
import { previewPdf, pdfName } from '../shared/documents/pdf-preview.js'
import { withBusy } from '../shared/ui/shell.js'
import { toast } from '../shared/ui/ui-theme.js'
import { describeError } from '../shared/lib/errors.js'
import { gradeLabel } from '../shared/lib/html.js'

const context = await loadFacultyContext('reports')
if (context) {
  const $ = id => document.getElementById(id)
  $('report-student').innerHTML = context.enrollments.map(item => `<option value="${item.student_id}">${escapeHtml(`${item.students?.first_name || ''} ${item.students?.last_name || ''}`)} (${escapeHtml(item.students?.lrn_number || item.student_id)})</option>`).join('') || '<option value="">No students assigned</option>'
  $('report-year').value = context.schoolYear
  $('generate-report').onclick = () => withBusy($('generate-report'), 'Loading...', async () => {
    const studentId = Number($('report-student').value)
    const year = $('report-year').value.trim()
    const studentRow = context.enrollments.find(item => Number(item.student_id) === studentId)
    if (!studentRow || !year) return toast('Choose a student and school year first.', 'error')
    const [academicResult, attendanceResult, enrollmentDetail] = await Promise.all([
      supabase.from('academic_history').select('*').eq('student_id', studentId).eq('school_year', year).order('subject'),
      supabase.rpc('attendance_totals', { p_student_id: studentId, p_school_year: year }),
      supabase.from('enrollments').select('grade_level,sections(section_name)').eq('student_id', studentId).eq('school_year', year).maybeSingle()
    ])
    const error = academicResult.error || attendanceResult.error
    if (error) return toast(describeError(error, 'Load report card'), 'error')
    if (!academicResult.data?.length) toast(`No grades are recorded for ${year} yet; the report card will be mostly blank.`, 'error')
    $('faculty-report-preview').innerHTML = buildReportCard({ student: { ...studentRow.students, student_id: studentId }, gradeLevel: gradeLabel(enrollmentDetail.data?.grade_level ?? studentRow.students?.grade_level), schoolYear: year, sectionName: enrollmentDetail.data?.sections?.section_name, academicRows: academicResult.data || [], attendance: attendanceResult.data })
    // Same preview window as the registrar's record card: shows the page, then Print or Download PDF.
    previewPdf($('faculty-report-preview'), { title: `Report Card ${year}`, filename: pdfName(`Report Card ${year}`, studentRow.students), printClass: 'printing-report-card' })
  })
}
