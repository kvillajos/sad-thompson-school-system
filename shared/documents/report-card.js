// report-card.js
import { escapeHtml } from '../lib/html.js'
import { generalAverage, scaleFor, PASSING_GRADE } from '../lib/grades.js'

export function buildReportCard({ student, gradeLevel, schoolYear, sectionName, academicRows = [], attendance, schoolDays = [], monthlyAbsences = {}, remarks, scale }) {
  const bands = scale || scaleFor(schoolYear)
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
    {
      title: 'Edukasyong Pantahanan at Pangkabuhayan (EPP)',
      keys: [
        'edukasyong pantahanan at pangkabuhayan (epp)',
        'edukasyong pantahanan at pangkabuhayan',
        'epp',
        'technology and livelihood education',
        'tle'
      ]
    },
    { title: 'MAPEH', keys: ['mapeh'] },
    { title: 'Music', keys: ['music'], isSub: true },
    { title: 'Arts', keys: ['arts'], isSub: true },
    { title: 'Physical Education', keys: ['physical education', 'pe'], isSub: true },
    { title: 'Health', keys: ['health'], isSub: true },
    {
      title: 'Edukasyon sa Pagpapakatao (EsP)',
      keys: [
        'edukasyon sa pagpapakatao (esp)',
        'edukasyon sa pagpapakatao',
        'esp',
        'values education',
        'good manners and right conduct (gmrc)',
        'gmrc'
      ]
    }
  ]

  // Map database records by normalized subject key
  const gradeMap = new Map()
  cleanRows.forEach(r => {
    if (r.subject) {
      gradeMap.set(r.subject.trim().toLowerCase(), r)
    }
  })

  const subjectRow = (record, title, isSub = false) => `
      <tr>
        <td class="${isSub ? 'indent-sub' : 'text-left'}" style="${isSub ? 'padding-left: 20px;' : ''}">${escapeHtml(record.subject || title)}</td>
        <td style="text-align: center;">${record.first_sem_q1 ?? ''}</td>
        <td style="text-align: center;">${record.first_sem_q2 ?? ''}</td>
        <td style="text-align: center;">${record.second_sem_q1 ?? ''}</td>
        <td style="text-align: center;">${record.second_sem_q2 ?? ''}</td>
        <td style="text-align: center;"><strong>${record.grade ?? ''}</strong></td>
        <td style="text-align: center;">${escapeHtml(record.remarks || (record.grade ? (record.grade >= PASSING_GRADE ? 'Passed' : 'Failed') : ''))}</td>
      </tr>
    `

  // 4. Build table rows adhering to DepEd sequence. Only standard rows that have a grade are printed: the
  // catalog names subjects by topic (e.g. "Chemistry"), so a fixed empty "Science" row would be noise.
  const shown = new Set()
  const standardRows = depedSubjects
    .map(item => {
      const record = gradeMap.get(item.keys.find(key => gradeMap.has(key)))
      if (!record) return ''
      shown.add(record)
      return subjectRow(record, item.title, item.isSub)
    })
    .join('')
  // Subjects outside the Form 138 list still count in the General Average, so they are listed after the standard
  // ones. Senior High subjects run for one semester (scores only in Q1-Q2 or only in Q3-Q4), so they are grouped
  // under a 1st / 2nd Semester heading.
  const hasScores = (record, fields) => fields.some(field => record[field] != null)
  const termOf = record => {
    const first = hasScores(record, ['first_sem_q1', 'first_sem_q2'])
    const second = hasScores(record, ['second_sem_q1', 'second_sem_q2'])
    return first && !second ? 1 : second && !first ? 2 : 0
  }
  const otherRecords = cleanRows.filter(record => !shown.has(record))
  const termHeading = term =>
    term ? `<tr><td colspan="7" style="text-align: left; font-weight: bold;">${term === 1 ? '1st' : '2nd'} Semester</td></tr>` : ''
  const otherRows = otherRecords.some(termOf)
    ? [0, 1, 2]
        .map(term => {
          const rows = otherRecords.filter(record => termOf(record) === term)
          return rows.length ? termHeading(term) + rows.map(record => subjectRow(record, record.subject)).join('') : ''
        })
        .join('')
    : otherRecords.map(record => subjectRow(record, record.subject)).join('')
  const tableRowsHtml = standardRows + otherRows

  return `
    <link rel="stylesheet" href="/css/documents.css">
    <div class="document-container">
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
        <table class="doc-table" data-no-sort style="width: 100%; font-size: 10.5pt;">
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
              <td style="text-align: center;">${average ? (average >= PASSING_GRADE ? 'Passed' : 'Failed') : ''}</td>
            </tr>
          </tfoot>
        </table>

        <div class="grading-scale-container" style="margin-top: 35px; width: 100%;">
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; text-align: center; font-size: 10pt;">
            <div style="font-weight: bold;">Description</div>
            <div style="font-weight: bold;">Grading Scale</div>
            <div style="font-weight: bold;">Letter</div>
            <div style="font-weight: bold;">Remarks</div>
            ${bands
              .map(
                (band, index) =>
                  `<div>${escapeHtml(band.descriptor)}</div><div>${
                    index === bands.length - 1
                      ? `Below ${bands[index - 1]?.min ?? PASSING_GRADE}`
                      : `${band.min}-${index === 0 ? 100 : bands[index - 1].min - 1}`
                  }</div><div>${escapeHtml(band.letter)}</div><div>${band.min >= PASSING_GRADE ? 'Passed' : 'Failed'}</div>`
              )
              .join('')}
          </div>
        </div>

                <div class="attendance-remarks" style="margin-top: 20px; font-size: 10.5pt;">
          <p><strong>Attendance Summary</strong></p>
          <p>Absences: ${Number(totals.absent) || 0}</p>
          <p>Days present: ${
            schoolDays.length
              ? `${schoolDays.reduce((sum, row) => sum + Number(row.days || 0), 0) - (Number(totals.absent) || 0)} of ${schoolDays.reduce((sum, row) => sum + Number(row.days || 0), 0)}`
              : 'School days not entered'
          }</p>

          <table class="doc-table" style="width: 100%; margin-top: 12px; font-size: 10pt;">
            <thead>
              <tr>
                <th>Month</th>
                <th>School Days</th>
                <th>Days Present</th>
                <th>Days Absent</th>
              </tr>
            </thead>
            <tbody>
              ${[
                { number: 6, name: 'June' },
                { number: 7, name: 'July' },
                { number: 8, name: 'August' },
                { number: 9, name: 'September' },
                { number: 10, name: 'October' },
                { number: 11, name: 'November' },
                { number: 12, name: 'December' },
                { number: 1, name: 'January' },
                { number: 2, name: 'February' },
                { number: 3, name: 'March' }
              ].map(month => {
                const record = schoolDays.find(row => Number(row.month) === month.number)
                const days = record ? Number(record.days) : null
                const absent = record && Number.isFinite(Number(monthlyAbsences[month.number]))
                  ? Math.min(days, Number(monthlyAbsences[month.number]))
                  : null
                const present = days != null && absent != null ? days - absent : null

                return `
                  <tr>
                    <td>${month.name}</td>
                    <td style="text-align:center;">${days ?? '-'}</td>
                    <td style="text-align:center;">${present ?? '-'}</td>
                    <td style="text-align:center;">${absent ?? '-'}</td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>

          <p style="margin-top: 12px;"><strong>Remarks:</strong> ${escapeHtml(remarks || 'None')}</p>
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
