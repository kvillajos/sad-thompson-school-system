import { supabase } from '../auth-client.js'
import { loadFacultyContext, escapeHtml } from './faculty-common.js'
import { buildReportCard } from '../report-card.js'
import { printElement } from '../print.js'
import { withBusy } from '../shell.js'

const context = await loadFacultyContext('reports')
if (context) {
  const $ = id => document.getElementById(id)
  $('report-student').innerHTML = context.enrollments.map(item => `<option value="${item.student_id}">${escapeHtml(`${item.students?.first_name || ''} ${item.students?.last_name || ''}`)} (${escapeHtml(item.students?.lrn_number || item.student_id)})</option>`).join('') || '<option value="">No students assigned</option>'
  $('report-year').value = context.schoolYear
  $('generate-report').onclick = () => withBusy($('generate-report'), 'Loading...', async () => { const studentId = Number($('report-student').value); const year = $('report-year').value.trim(); const studentRow = context.enrollments.find(item => Number(item.student_id) === studentId); if (!studentRow || !year) return window.alert('Choose a student and school year first.'); const [academicResult, attendanceResult, enrollmentDetail] = await Promise.all([supabase.from('academic_history').select('*').eq('student_id', studentId).eq('school_year', year).order('subject'), supabase.rpc('attendance_totals', { p_student_id: studentId, p_school_year: year }), supabase.from('enrollments').select('sections(section_name)').eq('student_id', studentId).eq('status', 'active').maybeSingle()]); if (academicResult.error || attendanceResult.error) return window.alert((academicResult.error || attendanceResult.error).message); $('faculty-report-preview').innerHTML = buildReportCard({ student: { ...studentRow.students, student_id: studentId }, gradeLevel: studentRow.students?.grade_level, schoolYear: year, sectionName: enrollmentDetail.data?.sections?.section_name, academicRows: academicResult.data || [], attendance: attendanceResult.data }); printElement($('faculty-report-preview'), 'printing-report-card') })
}
