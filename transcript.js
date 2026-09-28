// transcript.js
import { escapeHtml } from './html.js'
import { semesterGroups } from './semester-grades.js'

export function buildTranscript({ student = {}, rows = [], mode = 'official', schoolYear = '', sectionName = '' } = {}) {
  const unofficial = mode === 'unofficial'
  const filtered = schoolYear ? rows.filter(row => String(row.school_year) === String(schoolYear)) : rows
  const grouped = semesterGroups(filtered)
  const name = `${student.first_name || ''} ${student.last_name || ''}`.trim()
  const heading = unofficial ? 'UNOFFICIAL TRANSCRIPT - STUDENT COPY' : 'OFFICIAL STUDENT PERMANENT RECORD (FORM 137 / SF10)'

  const historyHtml = grouped.map(group => {
    const semesterBlocks = [...group.semesters.entries()].map(([semester, semesterRows]) => {
      const tableRows = semesterRows.map(row => `
        <tr>
          <td class="text-left">${escapeHtml(row.subject)}</td>
          <td>${row.grade ?? '-'}</td>
          <td>${escapeHtml(row.remarks || (row.grade >= 75 ? 'Passed' : 'Failed'))}</td>
        </tr>
      `).join('')

      return `
        <div style="margin-bottom: 12px;">
          <div style="font-weight:bold; background:#e0e0e0; padding:4px 6px; border:1px solid #000; border-bottom:none; font-size:9pt;">
            SCHOOL YEAR: ${escapeHtml(group.schoolYear)} — ${semester === 'first' ? '1st Semester' : '2nd Semester'}
          </div>
          <table class="doc-table" style="margin-top:0;">
            <thead>
              <tr>
                <th style="width: 50%;">Learning Areas / Subject Title</th>
                <th style="width: 25%;">Final Rating</th>
                <th style="width: 25%;">Action Taken</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="3">No records for this term.</td></tr>'}
            </tbody>
          </table>
        </div>
      `
    }).join('')

    return semesterBlocks
  }).join('') || '<p>No academic records yet.</p>'

  const verification = unofficial 
    ? '<p style="text-align:center; font-style:italic; font-size:9pt; margin-top:15px; color:#555;">For reference only. Verify this record with the Registrar\'s Office.</p>' 
    : ''

  const signatures = unofficial ? '' : `
    <section class="signatures-section">
      <div class="signature-block">
        <div class="signature-line">School Registrar</div>
        <div class="signature-title">School Registrar</div>
      </div>
      <div class="signature-block">
        <div class="signature-line">School Principal</div>
        <div class="signature-title">School Seal & Signature</div>
      </div>
    </section>
  `

  return `
    <link rel="stylesheet" href="/css/documents.css">
    <div class="document-container${unofficial ? ' unofficial' : ''}">
      <div class="print-btn-bar no-print">
        <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      </div>

      <header class="doc-header">
        <h4>Republic of the Philippines — Department of Education</h4>
        <h4>Region XI • Division of Davao City</h4>
        <h3>THOMPSON CHRISTIAN SCHOOL, INC.</h3>
        <h2>${heading}</h2>
      </header>

      <section class="info-section">
        <div class="info-grid">
          <div class="info-item"><span class="info-label">Learner Name:</span><span class="info-value">${escapeHtml(name)}</span></div>
          <div class="info-item"><span class="info-label">LRN:</span><span class="info-value">${escapeHtml(student.lrn_number || student.student_id || '')}</span></div>
          <div class="info-item"><span class="info-label">Grade & Section:</span><span class="info-value">${escapeHtml(student.grade_level == null ? '' : `Grade ${student.grade_level}`)}${sectionName ? ` - ${escapeHtml(sectionName)}` : ''}</span></div>
          <div class="info-item"><span class="info-label">Date of Birth:</span><span class="info-value">${escapeHtml(student.date_of_birth || '-')}</span></div>
        </div>
      </section>

      <main>
        <h4 style="margin: 10px 0 6px 0;">SCHOLASTIC HISTORY</h4>
        ${historyHtml}
        ${verification}
        ${signatures}
      </main>
    </div>
  `
}