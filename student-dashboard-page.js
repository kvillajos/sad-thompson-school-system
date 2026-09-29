      import { supabase, requireRole, signOut } from './auth-client.js'
      import { hideLoadingScreen } from './loading-screen.js'
      import { mountDayTabs, gapsFrom, timeRange12 } from './day-tabs.js'
      import { loadSchoolYearSettings } from './school-settings.js'
      import { dayNames, escapeHtml as escape, formatDate, gradeLabel, errorRow } from './html.js'
      import { applyUiTheme, toast } from './ui-theme.js'
      import { mountProfile, mountSidebar, confirmPassword, withBusy } from './shell.js'
      import { describeError } from './errors.js'
      import { attendanceSummaryLine } from './attendance.js'
      import { changedFields } from './edit-request.js'
      import { generalAverage, letterGrade } from './grades.js'
      import { buildSemesterTable } from './semester-grades.js'
      import { buildTranscript } from './transcript.js'
      import { previewPdf, pdfName } from './pdf-preview.js'
      import { mountAnnouncements } from './announcements.js'
      import { mountNotificationBell } from './notifications.js'
      applyUiTheme()
      const user = await requireRole(4)
      if (!user) throw new Error('Unauthorized')
      mountProfile(user, 'Student', signOut)
      mountNotificationBell(user)
      mountSidebar([
        { label: 'Dashboard', tab: 'dashboard', active: true, icon: '⌂' },
        { label: 'Schedule', tab: 'schedule', icon: '▤' },
        { label: 'Grades', tab: 'grades', icon: '♧' },
        { label: 'Transcript', tab: 'transcript', icon: '▱' },
        { label: 'Profile', tab: 'profile', icon: '☷' }
      ], 'Student Portal', 'student')

      const tabs = [...document.querySelectorAll('[data-tab]')]
      const panels = [...document.querySelectorAll('[data-panel]')]
      // The open tab lives in the URL hash so refresh and the browser Back button keep your place.
      const showTab = name => {
        if (!document.querySelector(`[data-panel="${name}"]`)) name = 'dashboard'
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name))
        panels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name))
      }
      tabs.forEach(tab => tab.addEventListener('click', () => {
        if (location.hash.slice(1) !== tab.dataset.tab) history.pushState(null, '', `#${tab.dataset.tab}`)
        showTab(tab.dataset.tab)
      }))
      window.addEventListener('popstate', () => showTab(location.hash.slice(1) || 'dashboard'))
      showTab(location.hash.slice(1) || 'dashboard')

      let student = null
      let sectionId = null
      let sectionName = ''
      let schoolYear = ''
      let currentSemester = ''
      let gradeRows = []
      let scheduleRows = []
      let gradeYears = []
      let gradePageIndex = 0

      // Same placeholder as the profile bar and dashboard card: initials on a blue circle until a photo is set.
      function showProfilePicture(url) {
        const initials = [student?.first_name, student?.last_name].filter(Boolean).map(name => name.trim().charAt(0)).join('').toUpperCase()
        document.getElementById('profile-picture-preview').innerHTML = url ? `<img src="${escape(url)}" alt="Profile picture">` : escape(initials || '?')
      }

      async function loadStudent() {
        if (!user.student_id) return
        const { data } = await supabase.from('students').select('*').eq('student_id', user.student_id).single()
        student = data
        const { data: enrollment } = await supabase.from('enrollments').select('section_id,school_year,sections(section_name,academic_year,semester)').eq('student_id', user.student_id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
        sectionId = enrollment?.section_id || null
        sectionName = enrollment?.sections?.section_name || 'Unassigned'
        schoolYear = enrollment?.school_year || ''
        currentSemester = { '1st Semester': 'first', '2nd Semester': 'second' }[enrollment?.sections?.semester] || ''

        const fullName = `${student?.first_name || ''} ${student?.middle_name || ''} ${student?.last_name || ''}`.replace(/\s+/g, ' ').trim()
        document.getElementById('dash-name').textContent = fullName
        document.getElementById('dash-lrn').textContent = student?.lrn_number || '-'
        const status = student?.enrollment_status || 'Not enrolled'
        const statusEl = document.getElementById('dash-status')
        statusEl.textContent = status
        statusEl.className = `badge ${status.toLowerCase().replaceAll(' ', '-')}`
        const initials = [student?.first_name, student?.last_name].filter(Boolean).map(name => name.trim().charAt(0)).join('').toUpperCase()
        document.getElementById('dash-photo').innerHTML = student?.profile_picture_url ? `<img src="${escape(student.profile_picture_url)}" alt="">` : escape(initials || '?')
        const details = [
          ['Grade level', student?.grade_level != null ? gradeLabel(student.grade_level) : '-'],
          ['Section', sectionName],
          ['School year', enrollment?.sections?.academic_year || schoolYear || '-'],
          ['Semester', enrollment?.sections?.semester || '-'],
          ['Date of birth', student?.date_of_birth ? formatDate(student.date_of_birth) : '-'],
          ['Sex', student?.gender || student?.sex || '-'],
          ['Contact number', student?.contact_number || '-'],
          ['Email', user.email || '-'],
          ['Address', student?.address || '-', true]
        ]
        document.getElementById('dash-details').innerHTML = details.map(([label, value, wide]) => `<div${wide ? ' class="wide"' : ''}><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')
        document.getElementById('profile-name').textContent = fullName
        document.getElementById('profile-id').textContent = student?.lrn_number || '-'
        document.getElementById('profile-grade').textContent = student?.grade_level != null ? `Grade ${student.grade_level}` : '-'
        document.getElementById('profile-section').textContent = sectionName
        document.getElementById('profile-status').textContent = student?.enrollment_status || '-'
        document.getElementById('profile-dob').textContent = student?.date_of_birth ? formatDate(student.date_of_birth) : '-'
        document.getElementById('profile-address').textContent = student?.address || '-'
        document.getElementById('profile-contact').textContent = student?.contact_number || '-'
        document.getElementById('profile-program').textContent = Number(student?.grade_level) >= 11 ? 'Senior High School' : Number(student?.grade_level) >= 7 ? 'Junior High School' : 'Elementary'
        document.getElementById('profile-email').textContent = user.email
        const setText = (id, value) => { document.getElementById(id).textContent = value || '-' }
        setText('profile-guardian-name', student?.guardian_name)
        setText('profile-guardian-relationship', student?.guardian_relationship)
        setText('profile-guardian-phone', student?.guardian_phone)
        setText('profile-guardian-email', student?.guardian_email)
        setText('profile-medical-notes', student?.medical_notes)
        showProfilePicture(student?.profile_picture_url)
      }

      // Request an edit: every box starts with the current value; only boxes that were changed are sent, then the password is confirmed and an administrator approves.
      const editModal = document.getElementById('edit-request-modal')
      const editForm = document.getElementById('edit-request-form')
      const closeEditRequest = () => editModal.classList.add('hidden')
      document.getElementById('open-edit-request').onclick = () => {
        for (const input of editForm.querySelectorAll('[name]')) {
          if (input.name === 'reason') { input.value = ''; continue }
          input.value = student?.[input.name] ?? ''
          input.dataset.current = input.value
        }
        editModal.classList.remove('hidden')
      }
      document.getElementById('edit-request-close').onclick = document.getElementById('edit-request-cancel').onclick = closeEditRequest
      editForm.onsubmit = async event => {
        event.preventDefault()
        const changes = changedFields(student, Object.fromEntries([...editForm.querySelectorAll('[name]:not([name="reason"])')].map(input => [input.name, input.value])))
        if (!Object.keys(changes).length) return toast('Change at least one field before sending the request.', 'error')
        if (!await confirmPassword(user.email, 'Enter your password to send this request.')) return
        const { error } = await withBusy(event.submitter || editForm.querySelector('[type="submit"]'), 'Sending…', () => supabase.rpc('request_student_profile', { p_changes: changes, p_reason: editForm.elements.reason.value }))
        if (error) return toast(describeError(error, 'Send request'), 'error')
        closeEditRequest()
        toast('Request sent. An administrator will review it, and you will get a notification.')
        showEditRequestStatus()
      }
      // Shows "waiting for approval" on the card while a request is pending (needs migration v26; without it the card just stays as it was).
      async function showEditRequestStatus() {
        const { data, error } = await supabase.rpc('my_pending_profile_request')
        const note = document.getElementById('edit-request-status')
        const button = document.getElementById('open-edit-request')
        const pending = !error && data
        note.hidden = !pending
        if (pending) note.textContent = `Pending since ${formatDate(data.created_at)}. An administrator is reviewing your request.`
        button.disabled = Boolean(pending)
        button.textContent = pending ? 'Request pending' : 'Request edit'
      }
      showEditRequestStatus()

      async function loadSchedule() {
        const host = document.getElementById('schedule-days')
        document.getElementById('schedule-section').textContent = sectionId ? `Section: ${sectionName}` : 'No section yet'
        document.getElementById('schedule-caption').textContent = `Class Schedule — ${schoolYear || 'Current Term'}`
        if (!sectionId) { host.innerHTML = '<p>No active section enrollment found.</p>'; return }
        const { data, error } = await supabase.from('subject_schedules').select('subject_id,section_id,faculty_name,room,day_of_week,start_time,end_time,subjects(subject_name),sections(section_name)').eq('section_id', sectionId).order('day_of_week').order('start_time')
        if (error) return host.innerHTML = `<p class="note" role="alert">${escape(describeError(error, 'Load schedule'))}</p>`
        scheduleRows = data || []
        const settings = await loadSchoolYearSettings(schoolYear)
        mountDayTabs(host, data || [], {
          gaps: gapsFrom(settings),
          headers: ['Subject', 'Faculty', 'Room', 'Time'],
          cells: item => [escape(item.subjects?.subject_name || ''), escape(item.faculty_name || '-'), escape(item.room || '-'), timeRange12(item.start_time, item.end_time)],
          emptyText: 'No classes'
        })
      }

      async function loadGrades() {
        const hosts = [document.getElementById('grades-table-first'), document.getElementById('grades-table-second'), document.getElementById('current-grades-table')]
        const showMessage = html => hosts.forEach(host => { host.innerHTML = html })
        if (!user.student_id) return showMessage('<p>No student record linked.</p>')
        const { data, error } = await supabase.from('academic_history').select('school_year,subject,grade,letter_grade,remarks,first_sem_q1,first_sem_q2,second_sem_q1,second_sem_q2').eq('student_id', user.student_id).order('school_year', { ascending: false })
        if (error) return showMessage(`<p class="note" role="alert">${escape(describeError(error, 'Load grades'))}</p>`)
        gradeRows = data || []
        gradeYears = [...new Set(gradeRows.map(row => row.school_year).filter(Boolean))].sort().reverse()
        gradePageIndex = 0
        const transcriptYears = gradeYears
        document.getElementById('transcript-year-filter').innerHTML = '<option value="">All school years</option>' + transcriptYears.map(year => `<option>${escape(year)}</option>`).join('')
        renderGrades()
        renderTranscript()
      }

      // Absences are recorded per student, not per subject, so the term table shows one total below it rather than a per-subject count.
      async function renderCurrentGrades() {
        const host = document.getElementById('current-grades-table')
        if (!schoolYear || !currentSemester) { host.innerHTML = '<p>No active enrollment for this term.</p>'; return }
        const label = currentSemester === 'first' ? '1st Semester' : '2nd Semester'
        document.getElementById('current-grades-title').textContent = `Current Term — ${label}`
        const quarterFields = currentSemester === 'first' ? ['first_sem_q1', 'first_sem_q2'] : ['second_sem_q1', 'second_sem_q2']
        const teacherFor = subject => scheduleRows.find(item => item.subjects?.subject_name === subject)?.faculty_name || '-'
        const rows = gradeRows.filter(row => row.school_year === schoolYear)
        const body = rows.map(row => {
          const semGrade = generalAverage(quarterFields.map(field => ({ grade: row[field] })))
          return `<tr><td>${escape(row.subject)}</td><td>${escape(teacherFor(row.subject))}</td><td>${row[quarterFields[0]] ?? ''}</td><td>${row[quarterFields[1]] ?? ''}</td><td>${semGrade ?? row.grade ?? ''}</td><td>${escape(row.letter_grade || letterGrade(semGrade ?? row.grade)?.letter || '')}</td><td>${escape(row.remarks || '')}</td></tr>`
        }).join('')
        const { data: totals } = await supabase.rpc('attendance_totals', { p_student_id: user.student_id, p_school_year: schoolYear })
        host.innerHTML = `<table><thead><tr><th>Subject</th><th>Teacher</th><th>Q1</th><th>Q2</th><th>Grade</th><th>Letter</th><th>Remarks</th></tr></thead><tbody>${body || '<tr><td colspan="7" class="empty-state">No academic records yet.</td></tr>'}</tbody></table><p class="admin-note">Absences this term: ${totals?.absent ?? 0}</p>`
      }

      // All Grades is paged one school year at a time, most recent first, each page split into its own 1st/2nd semester tables.
      function renderGrades() {
        const year = gradeYears[gradePageIndex]
        document.getElementById('grades-year-label').textContent = year ? `${year} (${gradePageIndex + 1} of ${gradeYears.length})` : 'No records'
        document.getElementById('grades-prev-year').disabled = gradePageIndex <= 0
        document.getElementById('grades-next-year').disabled = gradePageIndex >= gradeYears.length - 1
        const rows = year ? gradeRows.filter(row => row.school_year === year) : []
        document.getElementById('grades-table-first').innerHTML = buildSemesterTable(rows, { semester: 'first' })
        document.getElementById('grades-table-second').innerHTML = buildSemesterTable(rows, { semester: 'second' })
        const average = generalAverage(rows)
        document.getElementById('grades-average').textContent = average == null ? '' : `General Average (${year || 'no records'}): ${average} (${letterGrade(average)?.letter || '-'})`
      }

      function renderTranscript() {
        const year = document.getElementById('transcript-year-filter').value
        const html = buildTranscript({ student, rows: gradeRows, mode: 'unofficial', schoolYear: year, sectionName })
        document.getElementById('transcript-preview').innerHTML = html
        document.getElementById('student-transcript-print').innerHTML = html
      }

      async function loadAttendance() {
        const table = document.getElementById('attendance-table')
        if (!user.student_id) return table.innerHTML = '<tr><td colspan="2">No student record linked.</td></tr>'
        const [totals, history] = await Promise.all([
          supabase.rpc('attendance_totals', { p_student_id: user.student_id, p_school_year: schoolYear || null }),
          supabase.from('attendance').select('attendance_date,status').eq('student_id', user.student_id).order('attendance_date', { ascending: false }).limit(20)
        ])
        document.getElementById('attendance-summary').textContent = totals.error ? describeError(totals.error, 'Load attendance totals') : attendanceSummaryLine(totals.data)
        if (history.error) return table.innerHTML = errorRow(2, history.error, 'Load attendance')
        table.innerHTML = (history.data || []).map(a => `<tr><td>${formatDate(a.attendance_date)}</td><td>${escape(a.status)}</td></tr>`).join('') || '<tr><td colspan="2">No attendance recorded yet.</td></tr>'
      }

      // Profile picture: pick a file -> instant preview with Save/Cancel -> upload.
      const pictureInput = document.getElementById('profile-picture-input')
      const pictureActions = document.getElementById('picture-actions')
      const pictureHint = document.getElementById('picture-hint')
      const hintText = pictureHint.textContent
      let previewUrl = null
      const resetPicture = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        previewUrl = null
        pictureInput.value = ''
        pictureActions.classList.add('hidden')
        pictureHint.textContent = hintText
        pictureHint.style.color = ''
        showProfilePicture(student?.profile_picture_url)
      }
      document.getElementById('choose-picture').onclick = () => pictureInput.click()
      document.getElementById('cancel-picture').onclick = resetPicture
      pictureInput.onchange = () => {
        const file = pictureInput.files?.[0]
        if (!file) return
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
          resetPicture()
          pictureHint.textContent = "That file can't be used. Choose a PNG, JPG or WEBP up to 3 MB."
          pictureHint.style.color = '#c0392b'
          return
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        previewUrl = URL.createObjectURL(file)
        document.getElementById('profile-picture-preview').innerHTML = `<img src="${previewUrl}" alt="New profile picture preview">`
        pictureHint.textContent = file.name
        pictureHint.style.color = ''
        pictureActions.classList.remove('hidden')
      }
      document.getElementById('save-picture').onclick = async () => {
        const file = pictureInput.files?.[0]
        if (!file) return
        const button = document.getElementById('save-picture')
        button.disabled = true
        button.textContent = 'Saving...'
        try {
          const path = `${user.student_id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          const { error: uploadError } = await supabase.storage.from('profile-pictures').upload(path, file, { upsert: false })
          if (uploadError) throw uploadError
          const { data: publicUrlData } = supabase.storage.from('profile-pictures').getPublicUrl(path)
          const { error: rpcError } = await supabase.rpc('update_own_profile_picture', { p_url: publicUrlData.publicUrl })
          if (rpcError) throw rpcError
          student = { ...student, profile_picture_url: publicUrlData.publicUrl }
          resetPicture()
          pictureHint.textContent = 'Profile picture updated.'
        } catch (error) {
          pictureHint.textContent = describeError(error, 'Save photo')
          pictureHint.style.color = '#c0392b'
        } finally {
          button.disabled = false
          button.textContent = 'Save photo'
        }
      }

      document.getElementById('grades-prev-year').onclick = () => { gradePageIndex--; renderGrades() }
      document.getElementById('grades-next-year').onclick = () => { gradePageIndex++; renderGrades() }
      document.getElementById('transcript-year-filter').onchange = renderTranscript
      document.getElementById('print-unofficial-transcript').onclick = () => previewPdf(document.getElementById('student-transcript-print'), { title: 'Unofficial Transcript', filename: pdfName('Unofficial Transcript', student), printClass: 'printing-transcript' })

      await loadStudent()
      await Promise.all([loadSchedule(), loadGrades(), mountAnnouncements(document.getElementById('announcements-host'), 'student'), loadAttendance()])
      await renderCurrentGrades()
      hideLoadingScreen()
    
