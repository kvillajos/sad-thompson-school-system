import { escapeHtml, gradeLabel } from '../shared/lib/html.js'
import { buildSemesterTable } from '../shared/lib/semester-grades.js'
import { generalAverage } from '../shared/lib/grades.js'

// Every year the student has a placement or grade in, plus the current year (even before its first grade). Newest first.
export function historicalSchoolYears(enrollments = [], gradeRows = [], currentSchoolYear = '') {
  const years = new Set([
    currentSchoolYear,
    ...enrollments.map(row => row.school_year || row.sections?.academic_year),
    ...gradeRows.map(row => row.school_year)
  ])
  return [...years].filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))
}

export function renderHistoricalRecords({ schoolYear, enrollments = [], gradeRows = [] }) {
  const year = String(schoolYear || '')
  const placements = enrollments.filter(row => (row.school_year || row.sections?.academic_year) === year)
  const rows = gradeRows.filter(row => row.school_year === year)
  const average = generalAverage(rows)

  const placementHtml = placements.length
    ? `<ul class="student-placement-list">${placements
        .map(row => {
          const section = row.sections?.section_name || 'Section not recorded'
          const grade = row.grade_level == null ? 'Grade not recorded' : gradeLabel(row.grade_level)
          return `<li><strong>${escapeHtml(grade)} · ${escapeHtml(section)}</strong><span>${escapeHtml(year)} · ${escapeHtml(row.status || 'Enrollment record')}</span></li>`
        })
        .join('')}</ul>`
    : '<p class="admin-note">No section placement is recorded for this school year.</p>'

  // One table for the year: Q1-Q2 under "1st Semester", Q3-Q4 under "2nd Semester", General Average at the bottom.
  return { placementHtml, gradesHtml: buildSemesterTable(rows, { schoolYear: year, average, polished: true }) }
}
