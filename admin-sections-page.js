    import { supabase } from './auth-client.js'
    import { toast } from './ui-theme.js'
    import { hideLoadingScreen } from './loading-screen.js'
    import { escapeHtml as escape, gradeLevelOptions } from './html.js'
    import { describeError } from './errors.js'
    import { mountAdminShell } from './admin-page.js'
    import { mountOverrideForm } from './override-form.js'
    await mountAdminShell('sections')
    mountOverrideForm(document.getElementById('override-form'), { rpc: 'admin_place_override', button: 'Place with Override', done: 'Student placed with override.' })
    const modal = document.getElementById('section-modal')
    const form = document.getElementById('section-form')
    const modalTitle = document.getElementById('section-modal-title')
    let moderators = []
    let sections = []
    const moderatorName = value => String(value || '').trim().toLowerCase()
    const avatar = (item, size = 40) => { const name = `${item?.first_name || ''} ${item?.last_name || ''}`.trim(); const initials = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); return item?.users?.profile_picture_url ? `<span class="person-avatar" style="width:${size}px;height:${size}px"><img src="${escape(item.users.profile_picture_url)}" alt=""></span>` : `<span class="person-avatar" style="width:${size}px;height:${size}px">${escape(initials || '?')}</span>` }
    const moderatorByName = name => moderators.find(item => `${item.first_name} ${item.last_name}` === name)
    function renderModeratorCard(name) { const item = moderatorByName(name); document.getElementById('selected-moderator').innerHTML = item ? `${avatar(item, 48)}<span><strong>${escape(name)}</strong><small>${escape(item.department)}</small></span><button type="button" class="admin-secondary" id="clear-moderator">Clear</button>` : '<span>No moderator selected</span>' }
    const close = () => { modal.classList.add('hidden'); form.reset(); form.elements.section_id.value = '' }
    const openForm = section => {
      form.reset()
      form.elements.section_id.value = section?.section_id || ''
      form.elements.section_name.value = section?.section_name || ''
      form.elements.grade_level.value = section?.grade_level ?? ''
      form.elements.capacity.value = section?.capacity || 40
      form.elements.academic_year.value = section?.academic_year || '2025-2026'
      form.elements.room.value = section?.room || ''
      form.elements.faculty_assigned.value = section?.faculty_assigned || ''
      renderModeratorCard(section?.faculty_assigned || '')
      modalTitle.textContent = section ? 'Edit Section' : 'Add New Section'
      modal.classList.remove('hidden')
    }
    document.getElementById('add-section').onclick = () => openForm()
    document.getElementById('close-section').onclick = close
    document.getElementById('cancel-section').onclick = close
    document.getElementById('section-grade').innerHTML = gradeLevelOptions({ includeAll: true, allLabel: 'All grades' })
    form.elements.grade_level.innerHTML = gradeLevelOptions({ includeAll: true, allLabel: 'Select Grade' })
    async function loadSections() {
      const table = document.getElementById('sections-table')
      if (!moderators.length) { const moderatorResult = await supabase.from('staff_profiles').select('profile_id,employee_no,first_name,last_name,department,user_id,users(profile_picture_url)').order('last_name'); moderators = moderatorResult.data || [] }
      const { data, error } = await supabase.from('sections').select('section_id,section_name,grade_level,capacity,academic_year,faculty_assigned,room').order('grade_level').order('section_name')
      if (error) return table.innerHTML = `<tr><td colspan="7">${escape(error.message)}</td></tr>`
      sections = data || []
      const { data: enrollments, error: enrollmentError } = await supabase.from('enrollments').select('section_id').eq('status', 'active')
      if (enrollmentError) return table.innerHTML = `<tr><td colspan="7">${escape(enrollmentError.message)}</td></tr>`
      const counts = (enrollments || []).reduce((result, row) => { result[row.section_id] = (result[row.section_id] || 0) + 1; return result }, {})
      const search = document.getElementById('section-search').value.trim().toLowerCase()
      const grade = document.getElementById('section-grade').value
      const visibleSections = (data || []).filter(section => (!grade || String(section.grade_level) === grade) && (!search || section.section_name.toLowerCase().includes(search)))
      table.innerHTML = visibleSections.map(section => { const moderator = moderatorByName(section.faculty_assigned); return `<tr><td>${escape(section.section_name)}</td><td>${Number(section.grade_level) === 0 ? 'Kindergarten' : `Grade ${section.grade_level}`}</td><td>${escape(section.academic_year || '-')}</td><td>${moderator ? `${avatar(moderator, 32)} ` : ''}${escape(section.faculty_assigned || 'Unassigned')}</td><td>${escape(section.room || '-')}</td><td>${counts[section.section_id] || 0} / ${Number(section.capacity) || 0}</td><td><button class="admin-view" data-edit="${section.section_id}">Edit</button><button class="admin-remove" data-remove="${section.section_id}">Remove</button></td></tr>` }).join('') || '<tr><td colspan="7">No matching sections.</td></tr>'
      document.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => removeSection(button.dataset.remove))
      document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => openForm(data.find(item => String(item.section_id) === String(button.dataset.edit))))
    }
    async function removeSection(id) {
      const { count, error: countError } = await supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('section_id', id).eq('status', 'active')
      if (countError) return toast(describeError(countError, 'Remove section'), 'error')
      if (count) return window.alert('This section has active students. Move them to another section before removing it.')
      if (!window.confirm('Remove this section?')) return
      const { error } = await supabase.from('sections').delete().eq('section_id', id)
      if (error) return toast(describeError(error, 'Remove section'), 'error')
      await loadSections()
    }
    form.onsubmit = async event => {
      event.preventDefault()
      const submitButton = form.querySelector('button[type="submit"]')
      submitButton.disabled = true
      const values = Object.fromEntries(new FormData(form).entries())
      const payload = { section_name: values.section_name.trim(), grade_level: Number(values.grade_level), capacity: Number(values.capacity), academic_year: values.academic_year.trim(), room: values.room.trim() || null, faculty_assigned: values.faculty_assigned.trim() || null }
      const sectionId = values.section_id
      if (payload.faculty_assigned) {
        const { data: currentSections, error: moderatorError } = await supabase.from('sections').select('section_id,faculty_assigned')
        if (moderatorError) { submitButton.disabled = false; return toast(describeError(moderatorError, 'Save section'), 'error') }
        const alreadyAssigned = (currentSections || []).some(section => String(section.section_id) !== String(sectionId) && moderatorName(section.faculty_assigned) === moderatorName(payload.faculty_assigned))
        if (alreadyAssigned) { submitButton.disabled = false; return window.alert('This faculty member is already assigned as moderator for another section.') }
      }
      if (sectionId) {
        const { count, error: countError } = await supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('section_id', sectionId).eq('status', 'active')
        if (countError) { submitButton.disabled = false; return toast(describeError(countError, 'Save section'), 'error') }
        if (count > payload.capacity) { submitButton.disabled = false; return window.alert(`Capacity cannot be lower than the ${count} active students in this section.`) }
      }
      const result = sectionId
        ? await supabase.from('sections').update(payload).eq('section_id', sectionId)
        : await supabase.from('sections').insert(payload)
      submitButton.disabled = false
      if (result.error) return toast(describeError(result.error, 'Save section'), 'error')
      close()
      await loadSections()
    }
    document.getElementById('section-search').oninput = loadSections
    document.getElementById('section-grade').onchange = loadSections
    function renderModerators() {
      const search = document.getElementById('moderator-search').value.trim().toLowerCase()
      const currentSectionId = form.elements.section_id.value
      const currentModerator = moderatorName(form.elements.faculty_assigned.value)
      const assigned = new Set(sections.filter(section => String(section.section_id) !== String(currentSectionId)).map(section => moderatorName(section.faculty_assigned)).filter(Boolean))
      const rows = moderators.filter(item => {
        const name = `${item.first_name} ${item.last_name}`
        return !assigned.has(moderatorName(name)) || moderatorName(name) === currentModerator
      }).filter(item => `${item.first_name} ${item.last_name} ${item.department} ${item.employee_no}`.toLowerCase().includes(search))
      document.getElementById('moderator-table').innerHTML = rows.map(item => `<tr><td>${escape(item.employee_no)}</td><td>${avatar(item)} ${escape(`${item.first_name} ${item.last_name}`)}</td><td>${escape(item.department)}</td><td><button type="button" class="admin-view" data-moderator="${item.profile_id}">Choose</button></td></tr>`).join('') || '<tr><td colspan="4">No faculty found.</td></tr>'
      document.querySelectorAll('[data-moderator]').forEach(button => button.onclick = () => { const item = moderators.find(row => String(row.profile_id) === button.dataset.moderator); form.elements.faculty_assigned.value = `${item.first_name} ${item.last_name}`; renderModeratorCard(form.elements.faculty_assigned.value); document.getElementById('moderator-modal').classList.add('hidden') })
    }
    document.getElementById('choose-moderator').onclick = async () => { if (!moderators.length) { const result = await supabase.from('staff_profiles').select('profile_id,employee_no,first_name,last_name,department,user_id,users(profile_picture_url)').order('last_name'); moderators = result.data || [] }; document.getElementById('moderator-modal').classList.remove('hidden'); renderModerators() }
    document.getElementById('moderator-search').oninput = renderModerators
    document.getElementById('close-moderator').onclick = () => document.getElementById('moderator-modal').classList.add('hidden')
    document.getElementById('selected-moderator').onclick = event => { if (event.target.id === 'clear-moderator') { form.elements.faculty_assigned.value = ''; renderModeratorCard('') } }
    await loadSections()
    hideLoadingScreen()
  
