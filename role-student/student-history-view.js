import { escapeHtml, gradeLabel } from '../shared/lib/html.js'
import { buildSemesterTable, semesterRows } from '../shared/lib/semester-grades.js'
import { generalAverage } from '../shared/lib/grades.js'

export function historicalSchoolYears(enrollments = [], gradeRows = [], currentSchoolYear = '') {
  const years = new Set([
    ...enrollments.map(row => row.school_year || row.sections?.academic_year),
    ...gradeRows.map(row => row.school_year)
  ])
  return [...years].filter(year => year && year !== currentSchoolYear).sort((a, b) => String(b).localeCompare(String(a)))
}

export function renderHistoricalRecords({ schoolYear, enrollments = [], gradeRows = [] }) {
  const year = String(schoolYear || '')
  const placements = enrollments.filter(row => (row.school_year || row.sections?.academic_year) === year)
  const rows = gradeRows.filter(row => row.school_year === year)
  const hasSecondSemester = semesterRows(rows).some(row => row.semester === 'second' && row.semesterGrade != null)
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

  return {
    placementHtml,
    firstSemesterHtml: buildSemesterTable(rows, {
      semester: 'first',
      ...(hasSecondSemester ? {} : { average, schoolYear: year })
    }),
    secondSemesterHtml: buildSemesterTable(rows, {
      semester: 'second',
      ...(hasSecondSemester ? { average, schoolYear: year } : {})
    })
  }
}
