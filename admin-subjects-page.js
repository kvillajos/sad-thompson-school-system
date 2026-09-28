    import { supabase } from './auth-client.js'
    import { toast } from './ui-theme.js'
    import { hideLoadingScreen } from './loading-screen.js'
    import { escapeHtml as escape, gradeLevelOptions, errorRow } from './html.js'
    import { describeError } from './errors.js'
    import { mountAdminShell } from './admin-page.js'
    import { confirmDialog } from './dialog.js'
    import { withBusy } from './shell.js'
    await mountAdminShell('subjects')

    const subjectModal = document.getElementById('subject-modal')
    const subjectForm = document.getElementById('subject-form')
    subjectForm.elements.grade_level.innerHTML = gradeLevelOptions({ includeAll: true, allLabel: 'All Grades' })
    let subjects = []

    function closeModal(modal, form) { modal.classList.add('hidden'); form.reset(); form.elements.subject_id.value = '' }
    async function loadData() {
      const subjectResult = await supabase.from('subjects').select('*').order('subject_code')
      if (subjectResult.error) return document.getElementById('subjects-table').innerHTML = errorRow(5, subjectResult.error, 'Load subjects')
      subjects = subjectResult.data || []
      renderSubjects()
    }
    function renderSubjects() {
      const search = document.getElementById('subject-search').value.trim().toLowerCase()
      const status = document.getElementById('subject-status').value
      const visibleSubjects = subjects.filter(item => (!status || String(item.is_active) === status) && (!search || `${item.subject_code} ${item.subject_name}`.toLowerCase().includes(search)))
      document.getElementById('subjects-table').innerHTML = visibleSubjects.map(item => `<tr><td>${escape(item.subject_code)}</td><td>${escape(item.subject_name)}</td><td>${item.grade_level === null ? 'All Grades' : item.grade_level === 0 ? 'Kindergarten' : `Grade ${item.grade_level}`}</td><td>${item.is_active ? 'Active' : 'Inactive'}</td><td><button class="admin-view" data-edit-subject="${item.subject_id}">Edit</button><button class="admin-remove" data-remove-subject="${item.subject_id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="5">No matching subjects.</td></tr>'
      document.querySelectorAll('[data-edit-subject]').forEach(button => button.onclick = () => openSubject(subjects.find(item => String(item.subject_id) === button.dataset.editSubject)))
      document.querySelectorAll('[data-remove-subject]').forEach(button => button.onclick = () => removeSubject(button.dataset.removeSubject))
    }
    function openSubject(item) {
      subjectForm.reset(); subjectForm.elements.subject_id.value = item?.subject_id || ''; subjectForm.elements.subject_code.value = item?.subject_code || ''; subjectForm.elements.subject_name.value = item?.subject_name || ''; subjectForm.elements.grade_level.value = item?.grade_level ?? ''; subjectForm.elements.is_active.value = String(item?.is_active ?? true); subjectForm.elements.description.value = item?.description || ''
      document.getElementById('subject-modal-title').textContent = item ? 'Edit Subject' : 'Add Subject'; subjectModal.classList.remove('hidden')
    }
    async function removeSubject(id) {
      const item = subjects.find(subject => String(subject.subject_id) === String(id))
      const name = item ? `${item.subject_code} - ${item.subject_name}` : 'this subject'
      if (!await confirmDialog(`Remove ${name}? Its class schedules are removed too. This cannot be undone.`, { title: 'Remove subject', confirmText: 'Remove', danger: true, warning: 'To stop using a subject but keep its history, edit it and set Status to Inactive instead.' })) return
      const result = await supabase.from('subjects').delete().eq('subject_id', id)
      if (result.error) return toast(describeError(result.error, 'Remove subject'), 'error')
      toast(`${name} removed.`)
      await loadData()
    }
    subjectForm.onsubmit = event => {
      event.preventDefault()
      return withBusy(event.submitter || subjectForm.querySelector('[type="submit"]'), 'Saving…', async () => {
        const values = Object.fromEntries(new FormData(subjectForm).entries())
        const payload = { subject_code: values.subject_code.trim().toUpperCase(), subject_name: values.subject_name.trim(), grade_level: values.grade_level === '' ? null : Number(values.grade_level), description: values.description.trim() || null, is_active: values.is_active === 'true', updated_at: new Date().toISOString() }
        const result = values.subject_id ? await supabase.from('subjects').update(payload).eq('subject_id', values.subject_id) : await supabase.from('subjects').insert(payload)
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
    document.getElementById('subject-status').onchange = renderSubjects
    await loadData()
    hideLoadingScreen()
  
