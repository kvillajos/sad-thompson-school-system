// report-card.js
import { escapeHtml } from './html.js'
import { ACADEMIC_LABELS, SCORE_FIELDS, generalAverage, letterGrade } from './grades.js'

export function buildReportCard({ student, gradeLevel, schoolYear, sectionName, academicRows = [], attendance, remarks }) {
  const average = generalAverage(academicRows)
  const name = `${student?.first_name || ''} ${student?.last_name || ''}`.trim()

  const depedSubjects = [
    'Filipino',
    'English',
    'Mathematics',
    'Science',
    'Araling Panlipunan (AP)',
    'Edukasyong Pantahanan at Pangkabuhayan (EPP)',
    'MAPEH',
    'Music',
    'Arts',
    'Physical Education',
    'Health',
    'Edukasyon sa Pagpapakatao (EsP)'
  ]

  const gradeMap = new Map((academicRows || []).map(r => [r.subject?.trim().toLowerCase(), r]))

  const tableRowsHtml = depedSubjects.map(subject => {
    const record = gradeMap.get(subject.toLowerCase()) || {}
    const isMapehSub = ['Music', 'Arts', 'Physical Education', 'Health'].includes(subject)
    const indentClass = isMapehSub ? 'indent-sub' : 'text-left'

    return `
      <tr>
        <td class="${indentClass}">${escapeHtml(subject)}</td>
        <td>${record.q1 ?? record.q1_score ?? ''}</td>
        <td>${record.q2 ?? record.q2_score ?? ''}</td>
        <td>${record.q3 ?? record.q3_score ?? ''}</td>
        <td>${record.q4 ?? record.q4_score ?? ''}</td>
        <td><strong>${record.grade ?? ''}</strong></td>
        <td>${escapeHtml(record.remarks || (record.grade ? (record.grade >= 75 ? 'Passed' : 'Failed') : ''))}</td>
      </tr>
    `
  }).join('')

  return `
    <link rel="stylesheet" href="/css/documents.css">
    <div class="document-container">
      <div class="print-btn-bar no-print">
        <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      </div>

      <header class="doc-header">
        <h4>Republic of the Philippines — Department of Education</h4>
        <h4>Region XI • Division of Davao City</h4>
        <h3>THOMPSON CHRISTIAN SCHOOL, INC.</h3>
        <h2>REPORT ON LEARNING PROGRESS AND ACHIEVEMENT</h2>
      </header>

      <section class="info-section">
        <div class="info-grid">
          <div class="info-item"><span class="info-label">Name:</span><span class="info-value">${escapeHtml(name)}</span></div>
          <div class="info-item"><span class="info-label">LRN:</span><span class="info-value">${escapeHtml(student?.lrn_number || student?.student_id || '')}</span></div>
          <div class="info-item"><span class="info-label">Grade & Section:</span><span class="info-value">${escapeHtml(gradeLevel)}${sectionName ? ` - ${escapeHtml(sectionName)}` : ''}</span></div>
          <div class="info-item"><span class="info-label">School Year:</span><span class="info-value">${escapeHtml(schoolYear)}</span></div>
        </div>
      </section>

      <main>
        <table class="doc-table">
          <thead>
            <tr>
              <th rowspan="2" style="width: 42%;">Learning Areas</th>
              <th colspan="4" style="width: 28%;">Quarter</th>
              <th rowspan="2" style="width: 14%;">Final Grade</th>
              <th rowspan="2" style="width: 16%;">REMARKS</th>
            </tr>
            <tr>
              <th style="width: 7%;">1</th>
              <th style="width: 7%;">2</th>
              <th style="width: 7%;">3</th>
              <th style="width: 7%;">4</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
            <tr>
              <td class="text-left" style="font-weight:bold; text-align:right; padding-right:15px;">General Average</td>
              <td></td><td></td><td></td><td></td>
              <td><strong>${average ?? ''}</strong></td>
              <td>${average ? (average >= 75 ? 'Passed' : 'Failed') : ''}</td>
            </tr>
          </tbody>
        </table>

        <div class="grading-scale-container">
          <div class="scale-header">Description</div>
          <div class="scale-header">Grading Scale</div>
          <div class="scale-header">Remarks</div>

          <div>Outstanding</div><div>90-100</div><div>Passed</div>
          <div>Very Satisfactory</div><div>85-89</div><div>Passed</div>
          <div>Satisfactory</div><div>80-84</div><div>Passed</div>
          <div>Fairly Satisfactory</div><div>75-79</div><div>Passed</div>
          <div>Did Not Meet Expectations</div><div>Below 75</div><div>Failed</div>
        </div>

        <section class="signatures-section">
          <div class="signature-block">
            <div class="signature-line">Class Adviser</div>
            <div class="signature-title">Class Adviser</div>
          </div>
          <div class="signature-block">
            <div class="signature-line">Parent / Guardian</div>
            <div class="signature-title">Parent / Guardian</div>
          </div>
          <div class="signature-block">
            <div class="signature-line">School Principal</div>
            <div class="signature-title">School Principal</div>
          </div>
        </section>
      </main>
    </div>
  `
}