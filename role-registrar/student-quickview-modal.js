import { supabase } from '../shared/lib/auth-client.js'
import { describeError } from '../shared/lib/errors.js'
import { escapeHtml, gradeLabel } from '../shared/lib/html.js'
import { generalAverage } from '../shared/lib/grades.js'
import { fetchAll } from '../shared/lib/fetch-all.js'
import { $, state } from './registrar-state.js'

let modal
let requestSequence = 0

function showStatus(value) {
  const status = value || 'Unknown'
  const className = status.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
  return `<span class="quickview-status quickview-status-${className}">${escapeHtml(status)}</span>`
}

function renderFlags(rows, error) {
  if (error) return `<p class="quickview-error" role="alert">${escapeHtml(error)}</p>`
  if (!rows.length) return '<p class="quickview-empty">No promotion flags recorded.</p>'
  return `<ul class="quickview-flag-list">${rows
    .map(
      row =>
        `<li><b>${escapeHtml(row.result)}</b> · ${escapeHtml(row.school_year || '-')} · Grade ${escapeHtml(row.from_grade)}${
          row.to_grade == null ? '' : ` → Grade ${escapeHtml(row.to_grade)}`
        }${row.reason ? `<small>${escapeHtml(row.reason)}</small>` : ''}</li>`
    )
    .join('')}</ul>`
}

function renderModal(student, enrollment = null) {
  const title = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student Profile'
  $('quickview-title').textContent = title
  $('quickview-identity').innerHTML = `<span>${escapeHtml(student.lrn_number || student.student_id)}</span><span>${escapeHtml(
    student.grade_level == null ? '-' : gradeLabel(student.grade_level)
  )}</span>`
  $('quickview-status').innerHTML = showStatus(enrollment ? enrollment.status : 'Not currently enrolled')
  $('quickview-enrollment').textContent = enrollment
    ? `${enrollment.school_year || '-'}${enrollment.sections?.section_name ? ` · ${enrollment.sections.section_name}` : ''}`
    : 'No active enrollment'
}

function setLoading() {
  $('quickview-gpa').textContent = 'Loading…'
  $('quickview-flags').innerHTML = '<p class="quickview-empty">Loading promotion flag history…</p>'
}

async function loadDetails(student, studentId, sequence) {
  const [enrollmentResult, flagsResult] = await Promise.all([
    supabase
      .from('enrollments')
      .select('school_year,status,sections(section_name)')
      .eq('student_id', studentId)
      .eq('status', 'active')
      .order('school_year', { ascending: false })
      .limit(1),
    fetchAll(() =>
      supabase
        .from('promotion_logs')
        .select('id,school_year,from_grade,to_grade,result,reason,created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
    )
  ])
  if (sequence !== requestSequence || modal.classList.contains('hidden')) return

  if (enrollmentResult.error) {
    const message = describeError(enrollmentResult.error, 'Load current enrollment')
    $('quickview-status').innerHTML = `<span class="quickview-error">${escapeHtml(message)}</span>`
    $('quickview-enrollment').textContent = 'Could not load enrollment details.'
    $('quickview-gpa').innerHTML = `<span class="quickview-error">${escapeHtml(message)}</span>`
  } else {
    const enrollment = enrollmentResult.data?.[0] || null
    renderModal(student, enrollment)
    if (enrollment) {
      $('quickview-gpa').textContent = 'Loading…'
      const { data: grades, error } = await fetchAll(() =>
        supabase.from('academic_history').select('grade').eq('student_id', studentId).eq('school_year', enrollment.school_year).order('id')
      )
      if (sequence !== requestSequence || modal.classList.contains('hidden')) return
      if (error) {
        $('quickview-gpa').innerHTML = `<span class="quickview-error">${escapeHtml(describeError(error, 'Load current GPA'))}</span>`
      } else {
        const average = generalAverage(grades || [])
        $('quickview-gpa').textContent = average == null ? 'No grades yet' : average.toFixed(2)
      }
    } else {
      $('quickview-gpa').textContent = 'No active enrollment'
    }
  }

  $('quickview-flags').innerHTML = flagsResult.error
    ? `<p class="quickview-error" role="alert">${escapeHtml(describeError(flagsResult.error, 'Load promotion flag history'))}</p>`
    : renderFlags(flagsResult.data || [])
}

export function openStudentQuickview(studentId) {
  const sequence = ++requestSequence
  const student = state.students.find(item => String(item.student_id) === String(studentId))
  if (!student) {
    $('quickview-title').textContent = 'Student Profile'
    $('quickview-identity').textContent = `Student ${studentId}`
    $('quickview-status').textContent = 'Loading…'
    $('quickview-enrollment').textContent = ''
    setLoading()
    modal.classList.remove('hidden')
    supabase
      .from('students')
      .select('*')
      .eq('student_id', studentId)
      .single()
      .then(({ data, error }) => {
        if (sequence !== requestSequence || modal.classList.contains('hidden')) return
        if (error || !data) {
          $('quickview-status').innerHTML = `<span class="quickview-error">${escapeHtml(
            describeError(error, 'Load student profile')
          )}</span>`
          $('quickview-gpa').textContent = 'Unavailable'
          $('quickview-flags').textContent = 'Unavailable'
          return
        }
        renderModal(data)
        loadDetails(data, studentId, sequence).catch(error => showLoadFailure(error, sequence))
      })
    return
  }

  renderModal(student)
  setLoading()
  modal.classList.remove('hidden')
  loadDetails(student, studentId, sequence).catch(error => showLoadFailure(error, sequence))
}

function showLoadFailure(error, sequence) {
  if (sequence !== requestSequence || modal.classList.contains('hidden')) return
  const message = describeError(error, 'Load student quick view')
  $('quickview-status').innerHTML = `<span class="quickview-error">${escapeHtml(message)}</span>`
  $('quickview-gpa').innerHTML = `<span class="quickview-error">${escapeHtml(message)}</span>`
  $('quickview-flags').innerHTML = `<p class="quickview-error" role="alert">${escapeHtml(message)}</p>`
}

export function mountStudentQuickviewModal() {
  if (modal) return
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="student-quickview-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="quickview-title">
      <div class="modalbox quickview-box">
        <div class="modalhead">
          <div>
            <h2 id="quickview-title">Student Profile</h2>
            <div id="quickview-identity" class="quickview-identity"></div>
          </div>
          <button type="button" id="close-student-quickview" aria-label="Close student profile">×</button>
        </div>
        <div class="quickview-metrics">
          <div><b>Current Enrollment Status</b><p id="quickview-status">Loading…</p></div>
          <div><b>Current GPA</b><p id="quickview-gpa">Loading…</p></div>
          <div class="quickview-enrollment-card"><b>Current School Year / Section</b><p id="quickview-enrollment">Loading…</p></div>
        </div>
        <h3>Promotion Flag History</h3>
        <div id="quickview-flags"><p class="quickview-empty">Loading promotion flag history…</p></div>
      </div>
    </div>`
  )
  modal = $('student-quickview-modal')
  $('close-student-quickview').onclick = () => {
    requestSequence += 1
    modal.classList.add('hidden')
  }
  modal.addEventListener('click', event => {
    if (event.target === modal) $('close-student-quickview').click()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) $('close-student-quickview').click()
  })
  document.addEventListener('dblclick', event => {
    if (!(event.target instanceof Element) || event.target.closest('button,input,select,a,summary')) return
    const row = event.target.closest('tr')
    const promotionCandidate = event.target.closest('.promotion-candidate')
    const studentId =
      promotionCandidate?.querySelector('input[type="checkbox"]')?.value ||
      row?.dataset.quickviewStudent ||
      row?.querySelector('[data-view-student]')?.dataset.viewStudent ||
      row?.querySelector('[data-view-academic]')?.dataset.viewAcademic
    if (studentId) openStudentQuickview(studentId)
  })
}
