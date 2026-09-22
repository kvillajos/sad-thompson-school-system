import { escapeHtml } from './html.js'
import { semesterGroups } from './semester-grades.js'

export function buildTranscript({ student = {}, rows = [], mode = 'official', schoolYear = '', sectionName = '' } = {}) {
  const unofficial = mode === 'unofficial'
  const filtered = schoolYear ? rows.filter(row => String(row.school_year) === String(schoolYear)) : rows
  const grouped = semesterGroups(filtered)
  const body = grouped.flatMap(group => [...group.semesters.entries()].flatMap(([semester, semesterRows]) => semesterRows.map(row => `<tr><td>${escapeHtml(group.schoolYear)}</td><td>${semester === 'first' ? '1st Semester' : '2nd Semester'}</td><td>${escapeHtml(row.subject)}</td><td>${row.grade ?? ''}</td><td>${escapeHtml(row.remarks || '')}</td></tr>`))).join('')
  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim()
  const heading = unofficial ? 'UNOFFICIAL TRANSCRIPT - STUDENT COPY' : 'OFFICIAL TRANSCRIPT OF RECORDS'
  const verification = unofficial ? '<p class="verify">For reference only. Verify this record with the Registrar\'s Office.</p>' : ''
  const signatures = unofficial ? '' : '<div class="sign"><div>Registrar</div><div>School Seal / Signature</div></div>'
  return `<article class="transcript-document${unofficial ? ' unofficial' : ''}">${unofficial ? '<div class="watermark">UNOFFICIAL</div>' : ''}<header><h1>THOMPSON CHRISTIAN SCHOOL</h1><p>${heading}</p></header><div class="student"><span><b>Student No:</b> ${escapeHtml(student.lrn_number || student.student_id || '')}</span><span><b>Name:</b> ${escapeHtml(name)}</span><span><b>Grade Level:</b> ${escapeHtml(student.grade_level == null ? '' : `Grade ${student.grade_level}`)}</span><span><b>Section:</b> ${escapeHtml(sectionName)}</span></div><table><thead><tr><th>School Year</th><th>Semester</th><th>Subject</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>${body || '<tr><td colspan="5">No academic records yet.</td></tr>'}</tbody></table>${verification}${signatures}</article>`
}
