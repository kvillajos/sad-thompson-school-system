// Report card builder: pure (no app imports besides grades.js, also pure) so
// scripts/check-report-card.mjs can assert it in Node. Produces the HTML string the
// registrar's Academic History panel prints, the same way printAcademicCard() already does.
import { escapeHtml } from './html.js'
import { ACADEMIC_LABELS, SCORE_FIELDS, generalAverage, letterGrade } from './grades.js'


// One student, one school year: grades + attendance + remarks + general average + signatures.
export function buildReportCard({ student, gradeLevel, schoolYear, sectionName, academicRows = [], attendance, remarks }) {
  const average = generalAverage(academicRows)
  const band = letterGrade(average)
  const totals = attendance || { present: 0, late: 0, absent: 0, excused: 0, total: 0 }
  const name = `${student?.first_name || ''} ${student?.last_name || ''}`.trim()

  const academicHead = `<tr><th>Subject</th>${SCORE_FIELDS.map(key => `<th>${ACADEMIC_LABELS[key]}</th>`).join('')}<th>Grade</th><th>Letter</th></tr>`
  const academicBody = academicRows.map(row => `<tr><td>${escapeHtml(row.subject)}</td>${SCORE_FIELDS.map(key => `<td>${row[key] ?? ''}</td>`).join('')}<td>${row.grade ?? ''}</td><td>${escapeHtml(row.letter_grade || letterGrade(row.grade)?.letter || '')}</td></tr>`).join('')
    || `<tr><td colspan="${SCORE_FIELDS.length + 3}" class="empty-state">No academic records yet.</td></tr>`

  return `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--ui-navy);padding-bottom:8px">
      <div><b>THOMPSON CHRISTIAN SCHOOL</b><div style="font-size:10px;letter-spacing:.18em;color:var(--ui-muted)">REPORT CARD</div></div>
      <img src="/assets/logo.png" alt="" style="width:54px;height:54px;object-fit:contain">
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;font-size:12px;margin:10px 0">
      <div><small>Student</small><p>${escapeHtml(name)}</p></div>
      <div><small>Grade &amp; Section</small><p>${escapeHtml(gradeLevel)}${sectionName ? ` - ${escapeHtml(sectionName)}` : ''}</p></div>
      <div><small>School Year</small><p>${escapeHtml(schoolYear)}</p></div>
      <div><small>Student No.</small><p>${escapeHtml(student?.lrn_number || student?.student_id || '')}</p></div>
    </div>
    <table><thead>${academicHead}</thead><tbody>${academicBody}</tbody></table>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-top:12px">
      <div><small>General Average</small><p>${average == null ? '-' : `${average} (${escapeHtml(band?.letter || '-')} - ${escapeHtml(band?.descriptor || '')})`}</p></div>
      <div><small>Attendance</small><p>${totals.present}/${totals.total} present, ${totals.late} late, ${totals.absent} absent, ${totals.excused} excused</p></div>
    </div>
    <div style="margin-top:10px;font-size:12px"><small>Remarks</small><p>${escapeHtml(remarks || 'None')}</p></div>
    <div style="display:flex;justify-content:space-between;gap:24px;margin-top:32px;font-size:11px">
      <div style="flex:1;border-top:1px solid #111;padding-top:4px;text-align:center">Class Adviser</div>
      <div style="flex:1;border-top:1px solid #111;padding-top:4px;text-align:center">Parent / Guardian</div>
      <div style="flex:1;border-top:1px solid #111;padding-top:4px;text-align:center">School Principal</div>
    </div>`
}
