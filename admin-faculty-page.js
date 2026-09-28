  import { supabase } from './auth-client.js'
  import { toast } from './ui-theme.js'
  import { hideLoadingScreen } from './loading-screen.js'
  import { escapeHtml as escape, errorRow } from './html.js'
  import { describeError } from './errors.js'
  import { mountAdminShell } from './admin-page.js'
  import { confirmPassword, withBusy } from './shell.js'
  const user = await mountAdminShell('faculty')
  let faculty = []
  let subjects = []
  let assignments = []
  let assigningProfileId = null
  async function loadFaculty() {
    const [facultyResult, subjectResult, assignmentResult] = await Promise.all([
      supabase.from('staff_profiles').select('profile_id,employee_no,first_name,middle_name,last_name,department,specialization,phone,user_id,users(username,email,is_active)').order('last_name'),
      supabase.from('subjects').select('subject_id,subject_code,subject_name').eq('is_active', true).order('subject_code'),
      supabase.from('faculty_subjects').select('profile_id,subject_id,subjects(subject_code,subject_name)')
    ])
    const table = document.getElementById('faculty-table')
    const loadError = facultyResult.error || subjectResult.error || assignmentResult.error
    if (loadError) return table.innerHTML = errorRow(8, loadError, 'Load faculty')
    faculty = facultyResult.data || []
    subjects = subjectResult.data || []
    assignments = assignmentResult.data || []
    renderFaculty()
  }
  function renderFaculty() {
    const search = document.getElementById('faculty-search').value.trim().toLowerCase()
    const rows = faculty.filter(item => `${item.first_name} ${item.last_name} ${item.department} ${item.specialization} ${item.employee_no}`.toLowerCase().includes(search))
    document.getElementById('faculty-table').innerHTML = rows.map(item => {
      const assigned = assignments.filter(a => a.profile_id === item.profile_id).map(a => escape(a.subjects?.subject_code || '')).join(', ')
      return `<tr><td>${escape(item.employee_no)}</td><td>${escape(`${item.first_name} ${item.middle_name || ''} ${item.last_name}`)}</td><td>${escape(item.department)}</td><td>${escape(item.specialization)}</td><td>${escape(item.phone || '-')}</td><td>${item.users?.is_active ? 'Active' : 'Inactive'}</td><td>${assigned || '-'}</td><td><button class="admin-view" data-details="${item.profile_id}">Details</button><button class="admin-view" data-assign="${item.profile_id}">Assign Subjects</button></td></tr>`
    }).join('') || `<tr><td colspan="8">${search ? 'No faculty match your search.' : 'No faculty found.'}</td></tr>`
    document.querySelectorAll('[data-assign]').forEach(button => button.onclick = () => openAssign(button.dataset.assign))
    document.querySelectorAll('[data-details]').forEach(button => button.onclick = async () => {
      if (await confirmPassword(user.email, 'Enter your password to view faculty contact details.')) openFacultyDetails(button.dataset.details)
    })
  }
  function openFacultyDetails(profileId) {
    const item = faculty.find(f => String(f.profile_id) === String(profileId))
    if (!item) return
    const assigned = assignments.filter(a => String(a.profile_id) === String(profileId)).map(a => `${escape(a.subjects?.subject_code || '')} - ${escape(a.subjects?.subject_name || '')}`)
    document.getElementById('faculty-details-title').textContent = `${item.first_name} ${item.last_name}`
    document.getElementById('faculty-details-body').innerHTML = `<div class="review-grid"><div><small>Employee No.</small><p>${escape(item.employee_no)}</p></div><div><small>Department</small><p>${escape(item.department)}</p></div><div><small>Specialization</small><p>${escape(item.specialization || '-')}</p></div><div><small>Phone</small><p>${escape(item.phone || '-')}</p></div><div><small>Username</small><p>${escape(item.users?.username || '-')}</p></div><div><small>Email</small><p>${escape(item.users?.email || '-')}</p></div></div><h4>Assigned Subjects</h4><ul>${assigned.map(subject => `<li>${subject}</li>`).join('') || '<li>No subjects assigned.</li>'}</ul>`
    document.getElementById('faculty-details-modal').classList.remove('hidden')
  }
  function openAssign(profileId) {
    assigningProfileId = profileId
    const item = faculty.find(f => String(f.profile_id) === String(profileId))
    document.getElementById('assign-modal-title').textContent = `Assign Subjects — ${item?.first_name || ''} ${item?.last_name || ''}`
    const assignedIds = new Set(assignments.filter(a => String(a.profile_id) === String(profileId)).map(a => a.subject_id))
    document.getElementById('assign-subject-list').innerHTML = subjects.map(s => `<label class="admin-check"><input type="checkbox" value="${s.subject_id}" ${assignedIds.has(s.subject_id) ? 'checked' : ''}> ${escape(s.subject_code)} - ${escape(s.subject_name)}</label>`).join('') || '<p>No active subjects to assign. Add subjects on the Subjects page first.</p>'
    document.getElementById('assign-modal').classList.remove('hidden')
  }
  function closeAssign() { document.getElementById('assign-modal').classList.add('hidden'); assigningProfileId = null }
  // Only the difference is written, so a failed request never leaves a teacher with no subjects at all.
  document.getElementById('assign-form').onsubmit = event => {
    event.preventDefault()
    return withBusy(event.submitter || event.target.querySelector('[type="submit"]'), 'Saving…', async () => {
      const profileId = Number(assigningProfileId)
      const checked = new Set([...document.querySelectorAll('#assign-subject-list input[type=checkbox]:checked')].map(input => Number(input.value)))
      const current = new Set(assignments.filter(a => Number(a.profile_id) === profileId).map(a => Number(a.subject_id)))
      const removed = [...current].filter(id => !checked.has(id))
      const added = [...checked].filter(id => !current.has(id))
      if (added.length) {
        const { error } = await supabase.from('faculty_subjects').insert(added.map(subject_id => ({ profile_id: profileId, subject_id })))
        if (error) return toast(describeError(error, 'Assign subjects'), 'error')
      }
      if (removed.length) {
        const { error } = await supabase.from('faculty_subjects').delete().eq('profile_id', profileId).in('subject_id', removed)
        if (error) return toast(describeError(error, 'Unassign subjects'), 'error')
      }
      closeAssign()
      toast(added.length || removed.length ? 'Subject assignments saved.' : 'No changes to save.')
      await loadFaculty()
    })
  }
  document.getElementById('close-assign').onclick = closeAssign
  document.getElementById('cancel-assign').onclick = closeAssign
  document.getElementById('close-faculty-details').onclick = () => document.getElementById('faculty-details-modal').classList.add('hidden')
  document.getElementById('faculty-search').oninput = renderFaculty
  await loadFaculty()
  hideLoadingScreen()
