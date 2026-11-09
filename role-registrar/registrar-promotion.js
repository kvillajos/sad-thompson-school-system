import { supabase } from '../shared/lib/auth-client.js'
import { describeError } from '../shared/lib/errors.js'
import { escapeHtml, lastFirst, gradeLabel, gradeToNumber } from '../shared/lib/html.js'
import { OFFERED_GRADES } from '../shared/lib/grade-levels.js'
import { PASSING_GRADE } from '../shared/lib/grades.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { toast } from '../shared/ui/ui-theme.js'
import { $, state } from './registrar-state.js'

$('promotion-grade').innerHTML = OFFERED_GRADES.map(grade => `<option>${gradeLabel(grade)}</option>`).join('')

const excludedStudentIds = new Set()
const historyByYear = new Map()
const sectionsByStudent = new Map()
const subjectsBySection = new Map()
let scheduleLoadError = ''
let renderSequence = 0

function gradedSchoolYear(nextYear) {
  const match = /^(\d{4})-(\d{4})$/.exec(nextYear)
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return ''
  return `${Number(match[1]) - 1}-${Number(match[2]) - 1}`
}

function candidateSubjects(studentId, gradedYear, history) {
  const subjects = new Map()
  let scheduledSubjectCount = 0
  const enrollments = sectionsByStudent.get(String(studentId)) || []

  enrollments
    .filter(enrollment => enrollment.schoolYear === gradedYear)
    .forEach(enrollment => {
      ;(subjectsBySection.get(String(enrollment.sectionId)) || []).forEach(subject => {
        const key = subject.subject_name.trim().toLowerCase()
        if (!subjects.has(key)) {
          subjects.set(key, subject.subject_name)
          scheduledSubjectCount += 1
        }
      })
    })

  history
    .filter(record => String(record.student_id) === String(studentId) && record.subject?.trim())
    .forEach(record => {
      const key = record.subject.trim().toLowerCase()
      if (!subjects.has(key)) subjects.set(key, record.subject.trim())
    })

  const recordsBySubject = new Map()
  history
    .filter(record => String(record.student_id) === String(studentId) && record.subject?.trim())
    .forEach(record => {
      const key = record.subject.trim().toLowerCase()
      const records = recordsBySubject.get(key) || []
      records.push(record)
      recordsBySubject.set(key, records)
    })

  const failed = []
  const unattempted = []
  const passed = []

  subjects.forEach((name, key) => {
    const records = recordsBySubject.get(key) || []
    const grades = records.map(record => (record.grade == null || record.grade === '' ? null : Number(record.grade)))
    if (grades.some(grade => grade != null && Number.isFinite(grade) && grade < PASSING_GRADE)) {
      failed.push(name)
    } else if (!grades.length || grades.some(grade => grade == null || !Number.isFinite(grade))) {
      unattempted.push(name)
    } else {
      passed.push(name)
    }
  })

  if (!scheduledSubjectCount) unattempted.push('Expected subjects unavailable for this school year')

  return { failed, unattempted, passed, passedAll: subjects.size > 0 && !failed.length && !unattempted.length }
}

function candidateMarkup(student, gradedYear, history) {
  const status = candidateSubjects(student.student_id, gradedYear, history)
  const concernCount = status.failed.length + status.unattempted.length
  const details = [
    status.failed.length
      ? `<div><b>Failed:</b><ul>${status.failed.map(subject => `<li>${escapeHtml(subject)}</li>`).join('')}</ul></div>`
      : '',
    status.unattempted.length
      ? `<div><b>Unattempted:</b><ul>${status.unattempted.map(subject => `<li>${escapeHtml(subject)}</li>`).join('')}</ul></div>`
      : '',
    status.passed.length
      ? `<div><b>Passed:</b><ul>${status.passed.map(subject => `<li>${escapeHtml(subject)}</li>`).join('')}</ul></div>`
      : ''
  ].join('')

  return `<div class="promotion-candidate" data-quickview-student="${escapeHtml(student.student_id)}">
    <div class="promotion-candidate-heading">
      <label><input type="checkbox" value="${student.student_id}"${excludedStudentIds.has(String(student.student_id)) ? ' checked' : ''}>
        ${escapeHtml(student.lrn_number || student.student_id)} - ${escapeHtml(lastFirst(student))}
      </label>
      <span class="promotion-status ${status.passedAll ? 'promotion-status-pass' : 'promotion-status-fail'}" role="status">
        Pass All Subjects: ${status.passedAll ? 'YES' : 'NO'}
      </span>
    </div>
    <details class="promotion-breakdown">
      <summary>${concernCount ? `${concernCount} failed or unattempted subject${concernCount === 1 ? '' : 's'}` : 'View subject breakdown'}</summary>
      <div>${details || '<p>All scheduled subjects have passing grades.</p>'}</div>
    </details>
  </div>`
}

function renderUnavailable(message) {
  const search = $('promotion-exclude-search').value.trim().toLowerCase()
  const grade = gradeToNumber($('promotion-grade').value)
  const students = state.students.filter(
    student =>
      Number(student.grade_level) === grade &&
      `${student.lrn_number} ${student.first_name} ${student.last_name}`.toLowerCase().includes(search)
  )

  $('promotion-exclude-list').innerHTML =
    students
      .map(
        student =>
          `<div class="promotion-candidate" data-quickview-student="${escapeHtml(student.student_id)}">
            <label><input type="checkbox" value="${student.student_id}"${excludedStudentIds.has(String(student.student_id)) ? ' checked' : ''}>
              ${escapeHtml(student.lrn_number || student.student_id)} - ${escapeHtml(lastFirst(student))}
            </label>
            <span class="promotion-status promotion-status-unavailable" role="status">Pass All Subjects: unavailable</span>
            <small>${escapeHtml(message)}</small>
          </div>`
      )
      .join('') || '<small>No matching students.</small>'
}

export async function renderPromotionCandidates() {
  const sequence = ++renderSequence
  const nextYear = $('promotion-year').value.trim()
  const gradedYear = gradedSchoolYear(nextYear)

  if (!gradedYear) {
    renderUnavailable('Enter a valid next school year (for example, 2027-2028) to review subject grades.')
    return
  }
  if (scheduleLoadError) {
    renderUnavailable(scheduleLoadError)
    return
  }

  let history = historyByYear.get(gradedYear)
  if (!history) {
    $('promotion-exclude-list').innerHTML = '<small>Loading promotion subject results...</small>'
    const { data, error } = await fetchAll(() =>
      supabase
        .from('academic_history')
        .select('id,student_id,school_year,subject,grade')
        .eq('school_year', gradedYear)
        .order('student_id')
        .order('subject')
        .order('id')
    )
    if (sequence !== renderSequence) return
    if (error) {
      const message = describeError(error, 'Load promotion subject results')
      toast(message, 'error')
      renderUnavailable(message)
      return
    }
    history = data || []
    historyByYear.set(gradedYear, history)
  }

  if (sequence !== renderSequence) return
  const search = $('promotion-exclude-search').value.trim().toLowerCase()
  const grade = gradeToNumber($('promotion-grade').value)
  const students = state.students.filter(
    student =>
      Number(student.grade_level) === grade &&
      `${student.lrn_number} ${student.first_name} ${student.last_name}`.toLowerCase().includes(search)
  )

  $('promotion-exclude-list').innerHTML =
    students.map(student => candidateMarkup(student, gradedYear, history)).join('') || '<small>No matching students.</small>'
}

export async function loadPromotionCandidates() {
  sectionsByStudent.clear()
  subjectsBySection.clear()
  const { data: enrollments, error: enrollmentError } = await fetchAll(() =>
    supabase.from('enrollments').select('id,student_id,school_year,section_id,sections(academic_year)').eq('status', 'active').order('id')
  )
  if (enrollmentError) {
    scheduleLoadError = describeError(enrollmentError, 'Load promotion candidate sections')
    toast(scheduleLoadError, 'error')
    await renderPromotionCandidates()
    return
  }

  const sectionIds = [...new Set((enrollments || []).map(row => row.section_id).filter(id => id != null))]
  const scheduleResult = sectionIds.length
    ? await fetchAll(() =>
        supabase
          .from('subject_schedules')
          .select('schedule_id,section_id,subject_id,subjects!inner(subject_name,is_active)')
          .in('section_id', sectionIds)
          .eq('subjects.is_active', true)
          .order('schedule_id')
      )
    : { data: [], error: null }

  if (scheduleResult.error) {
    scheduleLoadError = describeError(scheduleResult.error, 'Load promotion subjects')
    toast(scheduleLoadError, 'error')
    await renderPromotionCandidates()
    return
  }

  ;(enrollments || []).forEach(row => {
    const sectionYear = row.sections?.academic_year || row.school_year || ''
    const studentKey = String(row.student_id)
    const studentSections = sectionsByStudent.get(studentKey) || []
    studentSections.push({ sectionId: row.section_id, schoolYear: sectionYear })
    sectionsByStudent.set(studentKey, studentSections)
  })
  ;(scheduleResult.data || []).forEach(row => {
    const subjects = subjectsBySection.get(String(row.section_id)) || []
    const subject = row.subjects
    if (subject?.subject_name && !subjects.some(item => item.subject_id === row.subject_id)) {
      subjects.push({ subject_id: row.subject_id, subject_name: subject.subject_name })
      subjectsBySection.set(String(row.section_id), subjects)
    }
  })

  await renderPromotionCandidates()
}

export function getExcludedPromotionStudentIds() {
  return [...excludedStudentIds].map(Number)
}

export function clearExcludedPromotionStudentIds() {
  excludedStudentIds.clear()
}

$('promotion-exclude-list').addEventListener('change', event => {
  const checkbox = event.target
  if (!checkbox.matches('input[type="checkbox"]')) return
  if (checkbox.checked) excludedStudentIds.add(String(checkbox.value))
  else excludedStudentIds.delete(String(checkbox.value))
})
$('promotion-exclude-search').addEventListener('input', renderPromotionCandidates)
$('promotion-grade').addEventListener('change', renderPromotionCandidates)
$('promotion-year').addEventListener('input', renderPromotionCandidates)
