  import { supabase } from './auth-client.js'
  import { toast } from './ui-theme.js'
  import { hideLoadingScreen } from './loading-screen.js'
  import { escapeHtml as escape, gradeLevelOptions } from './html.js'
  import { formatDays, groupScheduleRows, planDayChanges } from './schedule-days.js'
  import { describeError } from './errors.js'
  import { mountAdminShell } from './admin-page.js'
  import { confirmPassword } from './shell.js'
  import { overlapsLunch } from './day-tabs.js'
  const admin = await mountAdminShell('schedules')

  document.getElementById('section-grade').innerHTML = gradeLevelOptions({ includeAll: true, allLabel: 'All grades' })
  const sectionModal = document.getElementById('section-schedule-modal')
  const scheduleModal = document.getElementById('schedule-modal')
  const scheduleForm = document.getElementById('schedule-form')
  let sections = []
  let subjects = []
  let faculty = []
  let schedules = []
  let selectedSection = null

  function closeModal(modal, form) { modal.classList.add('hidden'); form?.reset(); if (form?.elements.schedule_id) form.elements.schedule_id.value = '' }
  function sectionLabel(section) { return Number(section.grade_level) === 0 ? 'Kindergarten' : `Grade ${section.grade_level}` }
  function renderSections() {
    const search = document.getElementById('section-search').value.trim().toLowerCase()
    const grade = document.getElementById('section-grade').value
    const visible = sections.filter(section => (!grade || String(section.grade_level) === grade) && (!search || section.section_name.toLowerCase().includes(search)))
    document.getElementById('sections-table').innerHTML = visible.map(section => {
      const count = schedules.filter(item => Number(item.section_id) === Number(section.section_id)).length
      return `<tr><td>${escape(section.section_name)}</td><td>${sectionLabel(section)}</td><td>${escape(section.academic_year || '-')}</td><td>${count}</td><td><button class="admin-view" data-section="${section.section_id}">View Subjects</button></td></tr>`
    }).join('') || '<tr><td colspan="5">No matching sections.</td></tr>'
    document.querySelectorAll('[data-section]').forEach(button => button.onclick = () => openSection(sections.find(section => String(section.section_id) === button.dataset.section)))
  }
  function renderSchedules() {
    const rows = groupScheduleRows(schedules.filter(item => Number(item.section_id) === Number(selectedSection?.section_id)))
    document.getElementById('section-schedules-table').innerHTML = rows.map(item => `<tr><td>${escape(item.subjects?.subject_code || '')} - ${escape(item.subjects?.subject_name || '')}</td><td>${escape(item.faculty_name || '-')}</td><td>${escape(item.room || '-')}</td><td>${formatDays(item.days)}</td><td>${escape(item.start_time?.slice(0, 5))} - ${escape(item.end_time?.slice(0, 5))}</td><td><button class="admin-view" data-edit-schedule="${item.schedule_ids.join(',')}">Edit</button><button class="admin-remove" data-remove-schedule="${item.schedule_ids.join(',')}">Remove</button></td></tr>`).join('') || '<tr><td colspan="6">No subjects scheduled for this section.</td></tr>'
    document.querySelectorAll('[data-edit-schedule]').forEach(button => button.onclick = () => openSchedule(rows.find(item => button.dataset.editSchedule.split(',').includes(String(item.schedule_ids[0])))))
    document.querySelectorAll('[data-remove-schedule]').forEach(button => button.onclick = () => removeSchedule(button.dataset.removeSchedule.split(',')))
  }
  function openSection(section) {
    selectedSection = section
    document.getElementById('section-schedule-title').textContent = `${section.section_name} - ${sectionLabel(section)}`
    renderSchedules()
    sectionModal.classList.remove('hidden')
  }
  function openSchedule(item) {
    scheduleForm.reset()
    scheduleForm.elements.schedule_id.value = item?.schedule_ids?.join(',') || ''
    scheduleForm.elements.subject_id.value = item?.subject_id || ''
    const subjectDisplay = document.getElementById('schedule-subject-display')
    subjectDisplay.textContent = item ? `${item.subjects?.subject_code || ''} - ${item.subjects?.subject_name || ''}` : 'No subject chosen'
    subjectDisplay.classList.toggle('empty', !item)
    scheduleForm.elements.faculty_name.value = item?.faculty_name || ''
    scheduleForm.elements.room.value = item?.room || selectedSection?.room || ''
    document.querySelectorAll('#schedule-form input[name="day_of_week"]').forEach(input => { input.checked = item?.days?.includes(Number(input.value)) || false })
    scheduleForm.elements.start_time.value = item?.start_time?.slice(0, 5) || ''
    scheduleForm.elements.end_time.value = item?.end_time?.slice(0, 5) || ''
    document.getElementById('schedule-modal-title').textContent = item ? 'Edit Subject' : 'Add Subject'
    scheduleModal.classList.remove('hidden')
  }
  // ---- Lunch and break times, per school year
  let yearSettings = []
  const lunchNote = document.getElementById('lunch-note')
  const lunchInputs = { year: document.getElementById('lunch-year'), ls: document.getElementById('lunch-start'), le: document.getElementById('lunch-end'), bs: document.getElementById('break-start'), be: document.getElementById('break-end') }
  const hm = value => String(value ?? '').slice(0, 5)
  // The year's own row, else the most recent one (same fallback the schedule pages use).
  const lunchFor = year => yearSettings.find(row => row.school_year === year) || yearSettings[0] || null
  function fillLunchForm() {
    const own = yearSettings.find(row => row.school_year === lunchInputs.year.value)
    const shown = own || yearSettings[0]
    lunchInputs.ls.value = hm(shown?.lunch_start); lunchInputs.le.value = hm(shown?.lunch_end)
    lunchInputs.bs.value = hm(shown?.break_start); lunchInputs.be.value = hm(shown?.break_end)
    lunchNote.textContent = own ? `Last saved ${new Date(own.updated_at).toLocaleDateString()}${own.updated_by ? ` by ${own.updated_by}` : ''}.` : 'Not set for this school year yet. The most recent times are shown; save to set this year.'
  }
  async function loadLunch() {
    const { data, error } = await supabase.from('school_year_settings').select('*').order('school_year', { ascending: false })
    if (error) { lunchNote.textContent = error.message; return }
    yearSettings = data || []
    const years = [...new Set([...yearSettings.map(row => row.school_year), ...sections.map(section => section.academic_year)].filter(Boolean))].sort().reverse()
    const keep = lunchInputs.year.value
    lunchInputs.year.innerHTML = years.map(year => `<option>${escape(year)}</option>`).join('')
    if (keep && years.includes(keep)) lunchInputs.year.value = keep
    fillLunchForm()
  }
  lunchInputs.year.onchange = fillLunchForm
  document.getElementById('lunch-form').onsubmit = async event => {
    event.preventDefault()
    const row = { school_year: lunchInputs.year.value, lunch_start: lunchInputs.ls.value, lunch_end: lunchInputs.le.value, break_start: lunchInputs.bs.value || null, break_end: lunchInputs.be.value || null }
    if (!row.school_year) return window.alert('Choose a school year.')
    if (row.lunch_end <= row.lunch_start) return window.alert('Lunch must end after it starts.')
    if (Boolean(row.break_start) !== Boolean(row.break_end) || (row.break_end && row.break_end <= row.break_start)) return window.alert('Give both break times (end after start), or leave both empty.')
    if (!await confirmPassword(admin.email, 'Enter your password to change lunch and break times.')) return
    const { error } = await supabase.from('school_year_settings').upsert({ ...row, updated_at: new Date().toISOString(), updated_by: admin.username }, { onConflict: 'school_year' })
    if (error) return toast(describeError(error, 'Save lunch times'), 'error')
    toast('Lunch and break times saved.', 'success')
    await loadLunch()
    const clashing = schedules.filter(item => sections.some(section => section.section_id === item.section_id && section.academic_year === row.school_year) && overlapsLunch(row, item.start_time, item.end_time))
    if (clashing.length) lunchNote.textContent += ` ${new Set(clashing.map(item => `${item.section_id}-${item.subject_id}`)).size} class(es) now overlap lunch: adjust them in each section's schedule.`
  }

  async function loadData() {
    const [sectionResult, subjectResult, scheduleResult] = await Promise.all([
      supabase.from('sections').select('section_id,section_name,grade_level,academic_year,room').order('grade_level').order('section_name'),
      supabase.from('subjects').select('subject_id,subject_code,subject_name,grade_level').eq('is_active', true).order('subject_code'),
      supabase.from('subject_schedules').select('schedule_id,subject_id,section_id,faculty_name,room,day_of_week,start_time,end_time,subjects(subject_code,subject_name)').order('day_of_week').order('start_time')
    ])
    if (sectionResult.error) return document.getElementById('sections-table').innerHTML = `<tr><td colspan="5">${escape(sectionResult.error.message)}</td></tr>`
    if (subjectResult.error) return document.getElementById('sections-table').innerHTML = `<tr><td colspan="5">${escape(subjectResult.error.message)}</td></tr>`
    if (scheduleResult.error) return document.getElementById('sections-table').innerHTML = `<tr><td colspan="5">${escape(scheduleResult.error.message)}</td></tr>`
    sections = sectionResult.data || []
    subjects = subjectResult.data || []
    schedules = scheduleResult.data || []
    renderSections()
    if (selectedSection) renderSchedules()
  }
  async function removeSchedule(ids) {
    if (!window.confirm('Remove this subject schedule?')) return
    const result = await supabase.from('subject_schedules').delete().in('schedule_id', ids)
    if (result.error) return toast(describeError(result.error, 'Remove schedule'), 'error')
    await loadData()
  }
  scheduleForm.onsubmit = async event => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(scheduleForm).entries())
    const selectedDays = [...document.querySelectorAll('#schedule-form input[name="day_of_week"]:checked')].map(input => Number(input.value))
    if (!selectedDays.length) return window.alert('Choose at least one day.')
    if (!values.start_time || !values.end_time || values.end_time <= values.start_time) return window.alert('End time must be later than start time.')
    const lunch = lunchFor(selectedSection.academic_year)
    if (overlapsLunch(lunch, values.start_time, values.end_time) && !window.confirm(`This class overlaps lunch (${String(lunch.lunch_start).slice(0, 5)} - ${String(lunch.lunch_end).slice(0, 5)}). Save it anyway?`)) return
    const payload = { subject_id: Number(values.subject_id), section_id: Number(selectedSection.section_id), faculty_name: values.faculty_name.trim() || null, room: values.room.trim() || null, start_time: values.start_time, end_time: values.end_time }
    const ids = values.schedule_id ? values.schedule_id.split(',').map(Number) : []
    const existing = schedules.filter(item => ids.includes(item.schedule_id))
    const changes = planDayChanges(existing.map(item => item.day_of_week), selectedDays)
    const retained = existing.filter(item => selectedDays.includes(Number(item.day_of_week)))
    const updates = await Promise.all(retained.map(item => supabase.from('subject_schedules').update({ ...payload, day_of_week: item.day_of_week }).eq('schedule_id', item.schedule_id)))
    const updateError = updates.find(result => result.error)?.error
    if (updateError) return toast(describeError(updateError, 'Save schedule'), 'error')
    if (changes.remove.length) {
      const removeIds = existing.filter(item => changes.remove.includes(Number(item.day_of_week))).map(item => item.schedule_id)
      const result = await supabase.from('subject_schedules').delete().in('schedule_id', removeIds)
      if (result.error) return toast(describeError(result.error, 'Save schedule'), 'error')
    }
    if (changes.add.length || !values.schedule_id) {
      const result = await supabase.from('subject_schedules').insert((values.schedule_id ? changes.add : selectedDays).map(day_of_week => ({ ...payload, day_of_week })))
      if (result.error) return toast(describeError(result.error, 'Save schedule'), 'error')
    }
    closeModal(scheduleModal, scheduleForm)
    await loadData()
  }
  function renderSubjectPicker() {
    const search = document.getElementById('subject-picker-search').value.trim().toLowerCase()
    const rows = subjects.filter(item => `${item.subject_code} ${item.subject_name} ${item.grade_level === null ? 'All Grades' : item.grade_level === 0 ? 'Kindergarten' : `Grade ${item.grade_level}`}`.toLowerCase().includes(search))
    document.getElementById('subject-picker-table').innerHTML = rows.map(item => `<tr><td>${escape(item.subject_code)}</td><td>${escape(item.subject_name)}</td><td>${item.grade_level === null ? 'All Grades' : item.grade_level === 0 ? 'Kindergarten' : `Grade ${item.grade_level}`}</td><td><button type="button" class="admin-view" data-pick-subject="${item.subject_id}">Choose</button></td></tr>`).join('') || '<tr><td colspan="4">No subjects found.</td></tr>'
    document.querySelectorAll('[data-pick-subject]').forEach(button => button.onclick = () => { const item = subjects.find(row => String(row.subject_id) === button.dataset.pickSubject); scheduleForm.elements.subject_id.value = item.subject_id; const display = document.getElementById('schedule-subject-display'); display.textContent = `${item.subject_code} - ${item.subject_name}`; display.classList.remove('empty'); document.getElementById('subject-picker-modal').classList.add('hidden') })
  }
  function renderFacultyPicker() {
    const search = document.getElementById('faculty-picker-search').value.trim().toLowerCase()
    const rows = faculty.filter(item => `${item.first_name} ${item.last_name} ${item.department} ${item.employee_no}`.toLowerCase().includes(search))
    document.getElementById('faculty-picker-table').innerHTML = rows.map(item => `<tr><td>${escape(`${item.first_name} ${item.last_name}`)}</td><td>${escape(item.department)}</td><td>${escape(item.employee_no)}</td><td><button type="button" class="admin-view" data-pick-faculty="${item.profile_id}">Choose</button></td></tr>`).join('') || '<tr><td colspan="4">No faculty found.</td></tr>'
    document.querySelectorAll('[data-pick-faculty]').forEach(button => button.onclick = () => { const item = faculty.find(row => String(row.profile_id) === button.dataset.pickFaculty); scheduleForm.elements.faculty_name.value = `${item.first_name} ${item.last_name}`; document.getElementById('faculty-picker-modal').classList.add('hidden') })
  }
  document.getElementById('section-search').oninput = renderSections
  document.getElementById('section-grade').onchange = renderSections
  document.getElementById('add-schedule').onclick = () => openSchedule()
  document.getElementById('close-section-schedule').onclick = () => closeModal(sectionModal)
  document.getElementById('close-schedule').onclick = () => closeModal(scheduleModal, scheduleForm)
  document.getElementById('cancel-schedule').onclick = () => closeModal(scheduleModal, scheduleForm)
  document.getElementById('choose-subject').onclick = () => { document.getElementById('subject-picker-modal').classList.remove('hidden'); renderSubjectPicker() }
  document.getElementById('close-subject-picker').onclick = () => document.getElementById('subject-picker-modal').classList.add('hidden')
  document.getElementById('subject-picker-search').oninput = renderSubjectPicker
  document.getElementById('choose-faculty').onclick = async () => { if (!faculty.length) { const result = await supabase.from('staff_profiles').select('profile_id,employee_no,first_name,last_name,department').order('last_name'); faculty = result.data || [] }; document.getElementById('faculty-picker-modal').classList.remove('hidden'); renderFacultyPicker() }
  document.getElementById('close-faculty-picker').onclick = () => document.getElementById('faculty-picker-modal').classList.add('hidden')
  document.getElementById('faculty-picker-search').oninput = renderFacultyPicker
  document.querySelectorAll('.schedule-preset').forEach(button => button.onclick = () => { const days = button.dataset.days.split(',').filter(Boolean); document.querySelectorAll('#schedule-form input[name="day_of_week"]').forEach(input => { input.checked = days.includes(input.value) }) })
  await loadData()
  await loadLunch()
  hideLoadingScreen()

