import { mountSchoolDays } from './school-days.js'
import { supabase } from '../shared/lib/auth-client.js'
import { toast } from '../shared/ui/ui-theme.js'
import { hideLoadingScreen } from '../shared/ui/loading-screen.js'
import {
  escapeHtml as escape,
  gradeLevelCheckboxes,
  bindExclusiveGradePicker,
  readGradePicker,
  setGradePicker,
  gradeLevelSummary,
  errorRow,
  activeStatus,
  subjectDisplayName
} from '../shared/lib/html.js'
import { OFFERED_GRADES } from '../shared/lib/grade-levels.js'
import { STRANDS, isSeniorHigh } from '../shared/lib/strands.js'
import { mountFilterBar, gradeFilter, strandFilter } from '../shared/ui/filter-bar.js'
import { describeError } from '../shared/lib/errors.js'
import { mountAdminShell } from './admin-page.js'
import { confirmDialog } from '../shared/ui/dialog.js'
import { withBusy, confirmPassword } from '../shared/ui/shell.js'
import { DEFAULT_GRADING_SCALE, PASSING_GRADE, currentSchoolYear } from '../shared/lib/grades.js'
const admin = await mountAdminShell('subjects')

const subjectModal = document.getElementById('subject-modal')
const subjectForm = document.getElementById('subject-form')
const gradePicker = document.getElementById('subject-grade-picker')
gradePicker.innerHTML = gradeLevelCheckboxes('grade_level', { includeAll: true, allLabel: 'All Grades', grades: OFFERED_GRADES })
bindExclusiveGradePicker(gradePicker)
const strandPicker = document.getElementById('subject-strand-picker')
strandPicker.innerHTML = STRANDS.map(
  strand =>
    `<label class="grade-option" title="${escape(strand.name)}"><input type="checkbox" name="strands" value="${escape(strand.code)}"><span class="grade-check" aria-hidden="true"></span><span>${escape(strand.code)}</span></label>`
).join('')
const SEMESTER_LABELS = { 1: '1st Sem', 2: '2nd Sem' }
let subjects = []
const filters = mountFilterBar(document.getElementById('subject-filters'), {
  filters: [
    gradeFilter(item => item.grade_level),
    // A Senior High subject with no strand is taken by every strand, so it shows under each one.
    strandFilter(item => item.strands || (item.grade_level?.some(isSeniorHigh) ? STRANDS.map(strand => strand.code) : null)),
    { key: 'type', all: 'All types', get: item => item.subject_type },
    { key: 'semester', all: 'All semesters', get: item => item.semester ?? 'whole', options: [['1', '1st Semester'], ['2', '2nd Semester'], ['whole', 'Whole year']] },
    { key: 'status', all: 'All statuses', get: item => item.is_active, options: [['true', 'Active'], ['false', 'Inactive']] }
  ],
  onChange: () => renderSubjects(),
  exportTable: () => document.getElementById('subjects-table').closest('table'),
  filename: 'subjects'
})

function closeModal(modal, form) {
  modal.classList.add('hidden')
  form.reset()
  form.elements.subject_id.value = ''
}
async function loadData() {
  const subjectResult = await supabase.from('subjects').select('*').order('subject_code')
  if (subjectResult.error) return (document.getElementById('subjects-table').innerHTML = errorRow(8, subjectResult.error, 'Load subjects'))
  subjects = subjectResult.data || []
  filters.update(subjects)
  renderSubjects()
}
function renderSubjects() {
  const search = document.getElementById('subject-search').value.trim().toLowerCase()
  const visibleSubjects = filters.apply(subjects).filter(
    item =>
      !search || `${item.subject_code} ${item.subject_name} ${subjectDisplayName(item.subject_name)}`.toLowerCase().includes(search)
  )
  document.getElementById('subjects-table').innerHTML =
    visibleSubjects
      .map(
        item => `

        
  <tr>
    <td data-label="Code">${escape(item.subject_code)}</td>
    <td data-label="Subject">${escape(subjectDisplayName(item.subject_name))}</td>
    <td data-label="Grade">${escape(gradeLevelSummary(item.grade_level))}</td>
    <td data-label="Type">${escape(item.subject_type || '-')}</td>
    <td data-label="Semester">${escape(SEMESTER_LABELS[item.semester] || 'Whole year')}</td>
    <td data-label="Strand">${escape(item.strands?.join(', ') || 'All')}</td>
    <td data-label="Status">${activeStatus(item.is_active)}</td>
    <td data-label="Actions">
      <button class="admin-view" data-edit-subject="${item.subject_id}">Edit</button>
      <button type="button" class="admin-remove" data-remove-subject="${item.subject_id}">Remove</button>
    </td>
  </tr>
`
      )
      .join('') || '<tr><td colspan="8">No matching subjects.</td></tr>'

  document
    .querySelectorAll('[data-edit-subject]')
    .forEach(button => (button.onclick = () => openSubject(subjects.find(item => String(item.subject_id) === button.dataset.editSubject))))
  document.querySelectorAll('[data-remove-subject]').forEach(button => (button.onclick = () => removeSubject(button.dataset.removeSubject)))
}
function openSubject(item) {
  subjectForm.reset()
  subjectForm.elements.subject_id.value = item?.subject_id || ''
  subjectForm.elements.subject_code.value = item?.subject_code || ''
  subjectForm.elements.subject_name.value = item?.subject_name || ''
  setGradePicker(gradePicker, item ? item.grade_level : null)
  subjectForm.elements.subject_type.value = item?.subject_type || ''
  subjectForm.elements.semester.value = item?.semester || ''
  strandPicker.querySelectorAll('input').forEach(box => (box.checked = Boolean(item?.strands?.includes(box.value))))
  subjectForm.elements.is_active.value = String(item?.is_active ?? true)
  subjectForm.elements.description.value = item?.description || ''
  document.getElementById('subject-modal-title').textContent = item ? 'Edit Subject' : 'Add Subject'
  subjectModal.classList.remove('hidden')
}
async function removeSubject(id) {
  const item = subjects.find(subject => String(subject.subject_id) === String(id))
  const name = item ? `${item.subject_code} - ${item.subject_name}` : 'this subject'
  if (
    !(await confirmDialog(`Remove ${name}? Its class schedules are removed too. This cannot be undone.`, {
      title: 'Remove subject',
      confirmText: 'Remove',
      danger: true,
      warning: 'To stop using a subject but keep its history, edit it and set Status to Inactive instead.'
    }))
  )
    return
  const result = await supabase.from('subjects').delete().eq('subject_id', id)
  if (result.error) return toast(describeError(result.error, 'Remove subject'), 'error')
  toast(`${name} removed.`)
  await loadData()
}
subjectForm.onsubmit = event => {
  event.preventDefault()
  const gradeLevel = readGradePicker(gradePicker)
  if (gradeLevel !== null && !gradeLevel.length) return toast('Select at least one grade, or All Grades.', 'error')
  return withBusy(event.submitter || subjectForm.querySelector('[type="submit"]'), 'Saving…', async () => {
    const values = Object.fromEntries(new FormData(subjectForm).entries())
    const strands = [...strandPicker.querySelectorAll('input:checked')].map(box => box.value)
    const payload = {
      subject_code: values.subject_code.trim().toUpperCase(),
      subject_name: values.subject_name.trim(),
      grade_level: gradeLevel,
      subject_type: values.subject_type || null,
      semester: values.semester ? Number(values.semester) : null,
      strands: strands.length ? strands : null,
      description: values.description.trim() || null,
      is_active: values.is_active === 'true',
      updated_at: new Date().toISOString()
    }
    const result = values.subject_id
      ? await supabase.from('subjects').update(payload).eq('subject_id', values.subject_id)
      : await supabase.from('subjects').insert(payload)
    if (result.error) return toast(describeError(result.error, 'Save subject'), 'error')
    closeModal(subjectModal, subjectForm)
    toast(values.subject_id ? 'Subject saved.' : 'Subject added.')
    await loadData()
  })
}
document.getElementById('add-subject').onclick = () => openSubject()
document.getElementById('close-subject').onclick = () => closeModal(subjectModal, subjectForm)
document.getElementById('cancel-subject').onclick = () => closeModal(subjectModal, subjectForm)
document.getElementById('subject-search').oninput = renderSubjects
// ---- Grading scale, per school year (same pattern as lunch times on Manage Schedules). Saving relabels that
// year's stored letter grades in the database. The passing band (75) and the bottom band stay fixed; bands above
// them can be added (e.g. A+ or A-) or removed, up to MAX_BANDS in all.
let savedScales = []
const scaleYear = document.getElementById('scale-year')
const scaleRows = document.getElementById('scale-rows')
const scaleNote = document.getElementById('scale-note')
const MAX_BANDS = 10 // grading_scales_bands_check
const scaleRow = (band, kind) => {
  const from =
    kind === 'bottom'
      ? `Below ${escape(PASSING_GRADE)}`
      : kind === 'passing'
        ? `${escape(band.min)} <small>(passing)</small>`
        : `<input type="number" min="${PASSING_GRADE + 1}" max="100" step="1" required data-scale-min value="${escape(band.min ?? '')}" aria-label="Lowest grade for ${escape(band.descriptor || 'new band')}" />`
  const remove = kind === 'edit' ? '<button type="button" class="admin-remove" data-remove-band>Remove</button>' : ''
  return `<tr data-scale-band data-min="${escape(band.min ?? '')}"><td data-label="Description"><input required maxlength="40" data-scale-descriptor value="${escape(band.descriptor || '')}" aria-label="Description" /></td><td data-label="From">${from}</td><td data-label="Letter"><input required maxlength="3" data-scale-letter value="${escape(band.letter || '')}" aria-label="Letter for ${escape(band.descriptor || 'new band')}" /></td><td>${remove}</td></tr>`
}
// Remove is offered while more than one band sits above passing; Add while the scale has room.
function syncBandButtons() {
  const editable = scaleRows.querySelectorAll('[data-remove-band]')
  editable.forEach(button => (button.disabled = editable.length <= 1))
  document.getElementById('add-scale-band').disabled = scaleRows.querySelectorAll('[data-scale-band]').length >= MAX_BANDS
}
function fillScaleForm() {
  const own = savedScales.find(row => row.school_year === scaleYear.value)
  const bands = own?.bands?.length ? own.bands : DEFAULT_GRADING_SCALE
  scaleRows.innerHTML = bands
    .map((band, index) => scaleRow(band, index === bands.length - 1 ? 'bottom' : index === bands.length - 2 ? 'passing' : 'edit'))
    .join('')
  syncBandButtons()
  scaleNote.textContent = own
    ? `Last saved ${new Date(own.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${own.updated_by ? ` by ${own.updated_by}` : ''}.`
    : 'Not set for this school year yet. The DepEd scale is shown; save to set this year.'
}
async function loadScales() {
  const [scaleResult, settingsResult] = await Promise.all([
    supabase.from('grading_scales').select('*'),
    supabase.from('school_year_settings').select('school_year')
  ])
  if (scaleResult.error) {
    scaleNote.textContent = describeError(scaleResult.error, 'Load grading scale')
    return
  }
  savedScales = scaleResult.data || []
  const years = [
    ...new Set([
      currentSchoolYear(),
      ...savedScales.map(row => row.school_year),
      ...(settingsResult.data || []).map(row => row.school_year)
    ])
  ]
    .filter(Boolean)
    .sort()
    .reverse()
  const keep = scaleYear.value || currentSchoolYear()
  scaleYear.innerHTML = years.map(year => `<option>${escape(year)}</option>`).join('')
  scaleYear.value = years.includes(keep) ? keep : years[0]
  fillScaleForm()
}
scaleYear.onchange = fillScaleForm
document.getElementById('add-scale-band').onclick = () => {
  scaleRows.insertAdjacentHTML('afterbegin', scaleRow({}, 'edit'))
  syncBandButtons()
  scaleRows.querySelector('[data-scale-min]').focus()
}
scaleRows.addEventListener('click', event => {
  if (!event.target.matches('[data-remove-band]')) return
  event.target.closest('tr').remove()
  syncBandButtons()
})
document.getElementById('scale-form').onsubmit = async event => {
  event.preventDefault()
  // Rows may be added anywhere, so the bands are saved highest first whatever order they were typed in.
  const entries = [...scaleRows.querySelectorAll('[data-scale-band]')]
    .map(row => ({
      row,
      band: {
        min: Number(row.querySelector('[data-scale-min]')?.value ?? row.dataset.min),
        letter: row.querySelector('[data-scale-letter]').value.trim(),
        descriptor: row.querySelector('[data-scale-descriptor]').value.trim()
      }
    }))
    .sort((a, b) => b.band.min - a.band.min)
  const rows = entries.map(entry => entry.row)
  const bands = entries.map(entry => entry.band)
  const invalid = (input, message) => {
    input.setCustomValidity(message)
    input.reportValidity()
    input.addEventListener('input', () => input.setCustomValidity(''), { once: true })
  }
  for (let index = 1; index < bands.length; index++)
    if (bands[index].min >= bands[index - 1].min)
      return invalid(
        rows[index - 1].querySelector('[data-scale-min]') || rows[index].querySelector('[data-scale-min]'),
        'Two bands cannot start at the same grade.'
      )
  if (new Set(bands.map(band => band.letter.toUpperCase())).size !== bands.length)
    return invalid(rows[rows.length - 1].querySelector('[data-scale-letter]'), 'Each band needs its own letter.')
  if (!(await confirmPassword(admin.email, 'Enter your password to change the grading scale.'))) return
  const { error } = await withBusy(event.submitter || event.target.querySelector('[type="submit"]'), 'Saving…', () =>
    supabase
      .from('grading_scales')
      .upsert(
        { school_year: scaleYear.value, bands, updated_at: new Date().toISOString(), updated_by: admin.username },
        { onConflict: 'school_year' }
      )
  )
  if (error) return toast(describeError(error, 'Save grading scale'), 'error')
  toast(`Grading scale saved. ${scaleYear.value} letter grades were updated to match.`, 'success')
  await loadScales()
}

await Promise.all([
  loadData(),
  loadScales(),
  mountSchoolDays(document.getElementById('school-days-card'))
])
hideLoadingScreen()
