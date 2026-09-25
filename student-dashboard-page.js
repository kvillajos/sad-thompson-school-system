      import { supabase, requireRole, signOut } from './auth-client.js'
      import { hideLoadingScreen } from './loading-screen.js'
      import { mountDayTabs, gapsFrom, timeRange12 } from './day-tabs.js'
      import { loadSchoolYearSettings } from './school-settings.js'
      import { dayNames, escapeHtml as escape, formatDate, gradeLabel } from './html.js'
      import { applyUiTheme } from './ui-theme.js'
      import { mountProfile, mountSidebar, confirmPassword } from './shell.js'
      import { attendanceSummaryLine } from './attendance.js'
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
      tabs.forEach(tab => tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'))
        panels.forEach(p => p.classList.add('hidden'))
        tab.classList.add('active')
        document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.remove('hidden')
      }))

      let student = null
      let sectionId = null
      let sectionName = ''
      let schoolYear = ''
      let gradeRows = []

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
        const changes = {}
        for (const input of editForm.querySelectorAll('[name]:not([name="reason"])')) if (input.value.trim() !== input.dataset.current) changes[input.name] = input.value.trim()
        if (!Object.keys(changes).length) return window.alert('You have not changed anything.')
        if (!await confirmPassword(user.email, 'Enter your password to send this request.')) return
        const { error } = await supabase.rpc('request_student_profile', { p_changes: changes, p_reason: editForm.elements.reason.value })
        if (error) return window.alert(error.message)
        closeEditRequest()
        window.alert('Request sent. An administrator will review it, and you will get a notification.')
      }

      async function loadSchedule() {
        const host = document.getElementById('schedule-days')
        document.getElementById('schedule-section').textContent = sectionId ? `Section: ${sectionName}` : 'No section yet'
        document.getElementById('schedule-caption').textContent = `Class Schedule — ${schoolYear || 'Current Term'}`
        if (!sectionId) { host.innerHTML = '<p>No active section enrollment found.</p>'; return }
        const { data, error } = await supabase.from('subject_schedules').select('subject_id,section_id,faculty_name,room,day_of_week,start_time,end_time,subjects(subject_name),sections(section_name)').eq('section_id', sectionId).order('day_of_week').order('start_time')
        if (error) return host.innerHTML = `<p>${escape(error.message)}</p>`
        const settings = await loadSchoolYearSettings(schoolYear)
        mountDayTabs(host, data || [], {
          gaps: gapsFrom(settings),
          headers: ['Subject', 'Faculty', 'Room', 'Time'],
          cells: item => [escape(item.subjects?.subject_name || ''), escape(item.faculty_name || '-'), escape(item.room || '-'), timeRange12(item.start_time, item.end_time)],
          emptyText: 'No classes'
        })
      }

      async function loadGrades() {
        const table = document.getElementById('grades-table')
        if (!user.student_id) return table.innerHTML = '<tr><td colspan="10">No student record linked.</td></tr>'
        const { data, error } = await supabase.from('academic_history').select('school_year,subject,grade,letter_grade,remarks,first_sem_q1,first_sem_q2,second_sem_q1,second_sem_q2').eq('student_id', user.student_id).order('school_year', { ascending: false })
        if (error) return table.innerHTML = `<tr><td colspan="10">${escape(error.message)}</td></tr>`
        gradeRows = data || []
        const years = [...new Set(gradeRows.map(row => row.school_year).filter(Boolean))].sort().reverse()
        document.getElementById('grade-year-filter').innerHTML = '<option value="">All school years</option>' + years.map(year => `<option>${escape(year)}</option>`).join('')
        document.getElementById('transcript-year-filter').innerHTML = '<option value="">All school years</option>' + years.map(year => `<option>${escape(year)}</option>`).join('')
        renderGrades()
        renderTranscript()
      }

      function renderGrades() {
        const year = document.getElementById('grade-year-filter').value
        const semester = document.getElementById('grade-semester-filter').value
        const averageRows = year ? gradeRows.filter(row => row.school_year === year) : gradeRows
        document.getElementById('grades-table').innerHTML = buildSemesterTable(averageRows, { semester })
        const average = generalAverage(averageRows)
        document.getElementById('grades-average').textContent = average == null ? '' : `General Average (${year || 'all school years'}): ${average} (${letterGrade(average)?.letter || '-'})`
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
        document.getElementById('attendance-summary').textContent = totals.error ? totals.error.message : attendanceSummaryLine(totals.data)
        if (history.error) return table.innerHTML = `<tr><td colspan="2">${escape(history.error.message)}</td></tr>`
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
          pictureHint.textContent = error.message || 'Could not save the picture.'
          pictureHint.style.color = '#c0392b'
        } finally {
          button.disabled = false
          button.textContent = 'Save photo'
        }
      }

      document.getElementById('grade-year-filter').onchange = renderGrades
      document.getElementById('grade-semester-filter').onchange = renderGrades
      document.getElementById('transcript-year-filter').onchange = renderTranscript
      document.getElementById('print-unofficial-transcript').onclick = () => previewPdf(document.getElementById('student-transcript-print'), { title: 'Unofficial Transcript', filename: pdfName('Unofficial Transcript', student), printClass: 'printing-transcript' })

      await loadStudent()
      await Promise.all([loadSchedule(), loadGrades(), mountAnnouncements(document.getElementById('announcements-host'), 'student'), loadAttendance()])
      hideLoadingScreen()
    
