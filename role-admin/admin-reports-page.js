
import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import { mountAdminShell } from './admin-page.js'

const reportTypeSelect = document.getElementById('report-type')
const schoolYearSelect = document.getElementById('report-school-year')
const gradeLevelSelect = document.getElementById('report-grade-level')
const sectionSelect = document.getElementById('report-section')

const generateButton = document.getElementById('generate-report-btn')
const printButton = document.getElementById('print-report-btn')
const statusElement = document.getElementById('reports-status')
const outputElement = document.getElementById('reports-output')

let students = []
let sections = []
let enrollments = []
let currentReportGenerated = false

const ACTIVE_STATUS = 'active'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function normalizeGradeLevel(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  return String(value).trim()
}

function getGradeLabel(value) {
  const grade = normalizeGradeLevel(value)

  if (grade === '0') {
    return 'Kindergarten'
  }

  if (grade) {
    return `Grade ${grade}`
  }

  return 'Unspecified'
}

function getStudentName(student) {
  if (!student) {
    return 'Unknown Student'
  }

  return [
    student.last_name,
    student.first_name,
    student.middle_name,
  ]
    .filter(Boolean)
    .join(', ')
}

function setStatus(message, isError = false) {
  statusElement.textContent = message
  statusElement.style.color = isError ? '#c62828' : ''
}

function setLoading(isLoading) {
  generateButton.disabled = isLoading
  generateButton.textContent = isLoading ? 'Generating...' : 'Generate Report'
}

function showEmptyMessage(message) {
  outputElement.innerHTML = `
    <div class="reports-empty">
      ${escapeHtml(message)}
    </div>
  `

  currentReportGenerated = false
  printButton.disabled = true
}

async function fetchAllRows(tableName) {
  const pageSize = 1000
  let start = 0
  let allRows = []

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(start, start + pageSize - 1)

    if (error) {
      throw new Error(`Unable to load ${tableName}: ${error.message}`)
    }

    const rows = data ?? []
    allRows = allRows.concat(rows)

    if (rows.length < pageSize) {
      break
    }

    start += pageSize
  }

  return allRows
}

async function loadReportData() {
  const [studentRows, sectionRows, enrollmentRows] = await Promise.all([
    fetchAllRows('students'),
    fetchAllRows('sections'),
    fetchAllRows('enrollments'),
  ])

  students = studentRows
  sections = sectionRows
  enrollments = enrollmentRows
}

function populateSchoolYearFilter() {
  const years = new Set()

  enrollments.forEach((enrollment) => {
    if (enrollment.school_year) {
      years.add(String(enrollment.school_year))
    }
  })

  sections.forEach((section) => {
    if (section.academic_year) {
      years.add(String(section.academic_year))
    }
  })

  const sortedYears = [...years].sort((a, b) => b.localeCompare(a))

  schoolYearSelect.innerHTML = `
    <option value="">All School Years</option>
    ${sortedYears
      .map(
        (year) =>
          `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`,
      )
      .join('')}
  `
}

function populateSectionFilter() {
  const selectedGrade = normalizeGradeLevel(gradeLevelSelect.value)
  const selectedYear = schoolYearSelect.value

  const matchingSections = sections.filter((section) => {
    const sectionGrade = normalizeGradeLevel(section.grade_level)
    const sectionYear = String(section.academic_year ?? '')

    const gradeMatches =
      !selectedGrade || sectionGrade === selectedGrade

    const yearMatches =
      !selectedYear || !sectionYear || sectionYear === selectedYear

    return gradeMatches && yearMatches
  })

  matchingSections.sort((a, b) =>
    String(a.section_name ?? '').localeCompare(String(b.section_name ?? '')),
  )

  const previousSection = sectionSelect.value

  sectionSelect.innerHTML = `
    <option value="">All Sections</option>
    ${matchingSections
      .map(
        (section) => `
          <option value="${escapeHtml(section.section_id)}">
            ${escapeHtml(section.section_name ?? 'Unnamed Section')}
          </option>
        `,
      )
      .join('')}
  `

  const previousStillExists = matchingSections.some(
    (section) => String(section.section_id) === previousSection,
  )

  if (previousStillExists) {
    sectionSelect.value = previousSection
  }
}

function getFilteredEnrollments() {
  const selectedYear = schoolYearSelect.value
  const selectedGrade = normalizeGradeLevel(gradeLevelSelect.value)
  const selectedSection = sectionSelect.value

  return enrollments.filter((enrollment) => {
    const status = String(enrollment.status ?? '').toLowerCase()

    if (status !== ACTIVE_STATUS) {
      return false
    }

    const yearMatches =
      !selectedYear ||
      String(enrollment.school_year ?? '') === selectedYear

    const gradeMatches =
      !selectedGrade ||
      normalizeGradeLevel(enrollment.grade_level) === selectedGrade

    const sectionMatches =
      !selectedSection ||
      String(enrollment.section_id ?? '') === selectedSection

    return yearMatches && gradeMatches && sectionMatches
  })
}

function getStudentById(studentId) {
  return students.find(
    (student) => String(student.student_id) === String(studentId),
  )
}

function getSectionById(sectionId) {
  return sections.find(
    (section) => String(section.section_id) === String(sectionId),
  )
}

function getReportContext() {
  const year = schoolYearSelect.value || 'All School Years'
  const grade = gradeLevelSelect.value
    ? getGradeLabel(gradeLevelSelect.value)
    : 'All Grade Levels'

  const section = sectionSelect.value
    ? getSectionById(sectionSelect.value)?.section_name ?? 'Selected Section'
    : 'All Sections'

  return `${year} | ${grade} | ${section}`
}

function renderReportHeading(title) {
  return `
    <div class="reports-section">
      <h2 class="reports-report-heading">${escapeHtml(title)}</h2>
      <p class="reports-report-subheading">
        ${escapeHtml(getReportContext())}
      </p>
      <p class="reports-report-subheading">
        Generated on ${escapeHtml(new Date().toLocaleString())}
      </p>
    </div>
  `
}

function renderTable(headers, rows) {
  return `
    <div class="reports-table-wrap">
      <table class="reports-table">
        <thead>
          <tr>
            ${headers
              .map((header) => `<th>${escapeHtml(header)}</th>`)
              .join('')}
          </tr>
        </thead>

        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (row) => `
                      <tr>
                        ${row
                          .map(
                            (cell) =>
                              `<td>${escapeHtml(cell ?? '—')}</td>`,
                          )
                          .join('')}
                      </tr>
                    `,
                  )
                  .join('')
              : `
                  <tr>
                    <td colspan="${headers.length}">
                      No records found for the selected filters.
                    </td>
                  </tr>
                `
          }
        </tbody>
      </table>
    </div>
  `
}

function renderClassList(filteredEnrollments) {
  const rows = filteredEnrollments
    .map((enrollment) => {
      const student = getStudentById(enrollment.student_id)
      const section = getSectionById(enrollment.section_id)

      return {
        student,
        enrollment,
        section,
      }
    })
    .sort((a, b) => {
      const lastNameA = String(a.student?.last_name ?? '').toLowerCase()
      const lastNameB = String(b.student?.last_name ?? '').toLowerCase()

      return lastNameA.localeCompare(lastNameB)
    })

  const tableRows = rows.map(({ student, enrollment, section }, index) => [
    index + 1,
    student?.student_id ?? enrollment.student_id ?? '—',
    getStudentName(student),
    getGradeLabel(enrollment.grade_level),
    section?.section_name ?? 'Unassigned',
    student?.gender ?? '—',
    enrollment.school_year ?? '—',
  ])

  return `
    ${renderReportHeading('Master Class List')}
    ${renderTable(
      [
        '#',
        'Student ID',
        'Student Name',
        'Grade Level',
        'Section',
        'Gender',
        'School Year',
      ],
      tableRows,
    )}
  `
}

function renderSectionSummary(filteredEnrollments) {
  const sectionMap = new Map()

  filteredEnrollments.forEach((enrollment) => {
    const sectionId = String(enrollment.section_id ?? 'unassigned')
    const section = getSectionById(enrollment.section_id)

    if (!sectionMap.has(sectionId)) {
      sectionMap.set(sectionId, {
        sectionName: section?.section_name ?? 'Unassigned',
        gradeLevel: enrollment.grade_level,
        schoolYear: enrollment.school_year,
        studentCount: 0,
        maleCount: 0,
        femaleCount: 0,
        otherCount: 0,
      })
    }

    const summary = sectionMap.get(sectionId)
    const student = getStudentById(enrollment.student_id)
    const gender = String(student?.gender ?? '').toLowerCase()

    summary.studentCount += 1

    if (gender === 'male' || gender === 'm') {
      summary.maleCount += 1
    } else if (gender === 'female' || gender === 'f') {
      summary.femaleCount += 1
    } else {
      summary.otherCount += 1
    }
  })

  const summaries = [...sectionMap.values()].sort((a, b) =>
    String(a.sectionName).localeCompare(String(b.sectionName)),
  )

  const tableRows = summaries.map((summary) => [
    summary.sectionName,
    getGradeLabel(summary.gradeLevel),
    summary.schoolYear ?? '—',
    summary.studentCount,
    summary.maleCount,
    summary.femaleCount,
    summary.otherCount,
  ])

  return `
    ${renderReportHeading('Section Summary')}
    ${renderTable(
      [
        'Section',
        'Grade Level',
        'School Year',
        'Total Students',
        'Male',
        'Female',
        'Other / Unspecified',
      ],
      tableRows,
    )}
  `
}

function renderSchoolStatistics(filteredEnrollments) {
  const uniqueStudentIds = new Set(
    filteredEnrollments.map((enrollment) => String(enrollment.student_id)),
  )

  const sectionIds = new Set(
    filteredEnrollments
      .map((enrollment) => enrollment.section_id)
      .filter((sectionId) => sectionId !== null && sectionId !== undefined)
      .map(String),
  )

  let maleCount = 0
  let femaleCount = 0
  let otherCount = 0

  uniqueStudentIds.forEach((studentId) => {
    const student = getStudentById(studentId)
    const gender = String(student?.gender ?? '').toLowerCase()

    if (gender === 'male' || gender === 'm') {
      maleCount += 1
    } else if (gender === 'female' || gender === 'f') {
      femaleCount += 1
    } else {
      otherCount += 1
    }
  })

  const gradeMap = new Map()

  filteredEnrollments.forEach((enrollment) => {
    const grade = normalizeGradeLevel(enrollment.grade_level) || 'Unspecified'

    gradeMap.set(grade, (gradeMap.get(grade) ?? 0) + 1)
  })

  const gradeRows = [...gradeMap.entries()]
    .sort((a, b) => {
      const gradeA = Number(a[0])
      const gradeB = Number(b[0])

      if (Number.isNaN(gradeA) || Number.isNaN(gradeB)) {
        return String(a[0]).localeCompare(String(b[0]))
      }

      return gradeA - gradeB
    })
    .map(([grade, count]) => [getGradeLabel(grade), count])

  return `
    ${renderReportHeading('School Statistics')}

    <div class="reports-summary-grid">
      <div class="reports-stat-card">
        <span>Total Active Enrollments</span>
        <strong>${filteredEnrollments.length}</strong>
      </div>

      <div class="reports-stat-card">
        <span>Unique Students</span>
        <strong>${uniqueStudentIds.size}</strong>
      </div>

      <div class="reports-stat-card">
        <span>Sections With Enrollments</span>
        <strong>${sectionIds.size}</strong>
      </div>

      <div class="reports-stat-card">
        <span>Male / Female / Other</span>
        <strong>${maleCount} / ${femaleCount} / ${otherCount}</strong>
      </div>
    </div>

    <div class="reports-section">
      <h3>Enrollment by Grade Level</h3>
      ${renderTable(['Grade Level', 'Active Enrollments'], gradeRows)}
    </div>
  `
}

function generateReport() {
  const filteredEnrollments = getFilteredEnrollments()
  const reportType = reportTypeSelect.value

  if (reportType === 'class-list') {
    outputElement.innerHTML = renderClassList(filteredEnrollments)
  } else if (reportType === 'section-summary') {
    outputElement.innerHTML = renderSectionSummary(filteredEnrollments)
  } else if (reportType === 'school-statistics') {
    outputElement.innerHTML = renderSchoolStatistics(filteredEnrollments)
  }

  currentReportGenerated = true
  printButton.disabled = false

  setStatus(
    `Report generated. ${filteredEnrollments.length} active enrollment record(s) included.`,
  )
}

async function initializeReportsPage() {
  try {
    await mountAdminShell('reports')

    await loadReportData()

    populateSchoolYearFilter()
    populateSectionFilter()

    generateButton.addEventListener('click', () => {
      try {
        generateReport()
      } catch (error) {
        console.error(error)
        setStatus(error.message || 'Unable to generate the report.', true)
        toast(error.message || 'Unable to generate the report.', 'error')
      }
    })

    schoolYearSelect.addEventListener('change', populateSectionFilter)
    gradeLevelSelect.addEventListener('change', populateSectionFilter)

    printButton.addEventListener('click', () => {
      if (!currentReportGenerated) {
        return
      }

      window.print()
    })

    setStatus('Reports data loaded. Choose your filters to begin.')
  } catch (error) {
    console.error(error)

    setStatus(
      error.message || 'Unable to load reports data. Check your Supabase setup.',
      true,
    )

    showEmptyMessage(
      'Unable to load report data. Check the browser console for details.',
    )

    toast(error.message || 'Unable to load reports data.', 'error')
  } finally {
    hideLoadingScreen()
  }
}

initializeReportsPage()
