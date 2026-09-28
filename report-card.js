// report-card.js
import { escapeHtml } from './html.js'
import { generalAverage } from './grades.js'

export function buildReportCard({ student, gradeLevel, schoolYear, sectionName, academicRows = [], attendance, remarks }) {
  // 1. Exclude any duplicate database row where subject is named "General Average"
  const cleanRows = (academicRows || []).filter(r => {
    const sub = (r.subject || '').trim().toLowerCase()
    return sub !== 'general average' && sub !== 'general_average'
  })

  // 2. Calculate General Average
  const average = generalAverage(cleanRows)
  const name = `${student?.first_name || ''} ${student?.last_name || ''}`.trim()
  const totals = attendance || { present: 0, late: 0, absent: 0, excused: 0, total: 0 }

  // 3. Exact subject sequence matching DepEd Form 138 specification
  const depedSubjects = [
    { title: 'Filipino', keys: ['filipino'] },
    { title: 'English', keys: ['english', 'english language'] },
    { title: 'Mathematics', keys: ['mathematics', 'math'] },
    { title: 'Science', keys: ['science'] },
    { title: 'Araling Panlipunan (AP)', keys: ['araling panlipunan (ap)', 'araling panlipunan', 'ap', 'social studies'] },
    { title: 'Edukasyong Pantahanan at Pangkabuhayan (EPP)', keys: ['edukasyong pantahanan at pangkabuhayan (epp)', 'edukasyong pantahanan at pangkabuhayan', 'epp', 'technology and livelihood education', 'tle'] },
    { title: 'MAPEH', keys: ['mapeh'] },
    { title: 'Music', keys: ['music'], isSub: true },
    { title: 'Arts', keys: ['arts'], isSub: true },
    { title: 'Physical Education', keys: ['physical education', 'pe'], isSub: true },
    { title: 'Health', keys: ['health'], isSub: true },
    { title: 'Edukasyon sa Pagpapakatao (EsP)', keys: ['edukasyon sa pagpapakatao (esp)', 'edukasyon sa pagpapakatao', 'esp', 'values education'] }
  ]

  // Map database records by normalized subject key
  const gradeMap = new Map()
  cleanRows.forEach(r => {
    if (r.subject) {
      gradeMap.set(r.subject.trim().toLowerCase(), r)
    }
  })

  // 4. Build table rows adhering to DepEd sequence
  const tableRowsHtml = depedSubjects.map(item => {
    let record = null
    for (const key of item.keys) {
      if (gradeMap.has(key)) {
        record = gradeMap.get(key)
        break
      }
    }
    record = record || {}

    const indentClass = item.isSub ? 'indent-sub' : 'text-left'
    const paddingStyle = item.isSub ? 'padding-left: 20px;' : ''

    return `
      <tr>
        <td class="${indentClass}" style="${paddingStyle}">${escapeHtml(item.title)}</td>
        <td style="text-align: center;">${record.q1 ?? record.q1_score ?? ''}</td>
        <td style="text-align: center;">${record.q2 ?? record.q2_score ?? ''}</td>
        <td style="text-align: center;">${record.q3 ?? record.q3_score ?? ''}</td>
        <td style="text-align: center;">${record.q4 ?? record.q4_score ?? ''}</td>
        <td style="text-align: center;"><strong>${record.grade ?? ''}</strong></td>
        <td style="text-align: center;">${escapeHtml(record.remarks || (record.grade ? (record.grade >= 75 ? 'Passed' : 'Failed') : ''))}</td>
      </tr>
    `
  }).join('')

  return `
    <link rel="stylesheet" href="/css/documents.css">
    <div class="document-container">
      <div class="print-btn-bar no-print">
        <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      </div>

      <header class="doc-header" style="text-align: center; margin-bottom: 20px;">
        <h3 style="margin: 0; font-size: 13pt; font-weight: bold; letter-spacing: 0.03em;">REPORT ON LEARNING PROGRESS AND ACHIEVEMENT</h3>
      </header>

      <section class="info-section" style="margin-bottom: 16px;">
        <div class="info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 11pt;">
          <div class="info-item"><span class="info-label" style="font-weight: bold;">Name:</span> <span class="info-value">${escapeHtml(name)}</span></div>
          <div class="info-item"><span class="info-label" style="font-weight: bold;">LRN:</span> <span class="info-value">${escapeHtml(student?.lrn_number || student?.student_id || '')}</span></div>
          <div class="info-item"><span class="info-label" style="font-weight: bold;">Grade & Section:</span> <span class="info-value">${escapeHtml(gradeLevel)}${sectionName ? ` - ${escapeHtml(sectionName)}` : ''}</span></div>
          <div class="info-item"><span class="info-label" style="font-weight: bold;">School Year:</span> <span class="info-value">${escapeHtml(schoolYear)}</span></div>
        </div>
      </section>

      <main>
        <table class="doc-table" style="width: 100%; border-collapse: collapse; font-size: 10.5pt;">
          <thead>
            <tr>
              <th rowspan="2" style="width: 42%; text-align: center; vertical-align: middle;">Learning Areas</th>
              <th colspan="4" style="width: 28%; text-align: center;">Quarter</th>
              <th rowspan="2" style="width: 14%; text-align: center; vertical-align: middle;">Final Grade</th>
              <th rowspan="2" style="width: 16%; text-align: center; vertical-align: middle;">REMARKS</th>
            </tr>
            <tr>
              <th style="width: 7%; text-align: center;">1</th>
              <th style="width: 7%; text-align: center;">2</th>
              <th style="width: 7%; text-align: center;">3</th>
              <th style="width: 7%; text-align: center;">4</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
          <tfoot>
            <tr style="font-weight: bold; background-color: #ffffff;">
              <td class="text-left" style="text-align: center; font-weight: bold;">General Average</td>
              <td colspan="4"></td>
              <td style="text-align: center;"><strong>${average ?? '-'}</strong></td>
              <td style="text-align: center;">${average ? (average >= 75 ? 'Passed' : 'Failed') : ''}</td>
            </tr>
          </tfoot>
        </table>

        <div class="grading-scale-container" style="margin-top: 35px; width: 100%;">
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; text-align: center; font-size: 10pt;">
            <div style="font-weight: bold;">Description</div>
            <div style="font-weight: bold;">Grading Scale</div>
            <div style="font-weight: bold;">Remarks</div>

            <div>Outstanding</div><div>90-100</div><div>Passed</div>
            <div>Very Satisfactory</div><div>85-89</div><div>Passed</div>
            <div>Satisfactory</div><div>80-84</div><div>Passed</div>
            <div>Fairly Satisfactory</div><div>75-79</div><div>Passed</div>
            <div>Did Not Meet Expectations</div><div>Below 75</div><div>Failed</div>
          </div>
        </div>

        <div class="attendance-remarks" style="margin-top: 20px; font-size: 10.5pt;">
          <p><strong>Attendance:</strong> ${totals.present}/${totals.total} present, ${totals.late} late, ${totals.absent} absent, ${totals.excused} excused</p>
          <p><strong>Remarks:</strong> ${escapeHtml(remarks || 'None')}</p>
        </div>

        <div class="signatures" style="display: flex; justify-content: space-between; gap: 24px; margin-top: 32px; font-size: 10.5pt;">
          <div style="flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center;">Class Adviser</div>
          <div style="flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center;">Parent / Guardian</div>
          <div style="flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center;">School Principal</div>
        </div>
      </main>
    </div>
  `
}