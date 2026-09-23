      import { supabase, requireRole, signOut } from './auth-client.js'
      import { hideLoadingScreen } from './loading-screen.js'
      import { dayNames, escapeHtml as escape, formatDate, gradeLabel } from './html.js'
      import { applyUiTheme } from './ui-theme.js'
      import { mountProfile, mountSidebar } from './shell.js'
      import { attendanceSummaryLine } from './attendance.js'
      import { generalAverage, letterGrade } from './grades.js'
      import { buildSemesterTable } from './semester-grades.js'
      import { buildTranscript } from './transcript.js'
      import { printElement } from './print.js'
      applyUiTheme()
      const user = await requireRole(4)
      if (!user) throw new Error('Unauthorized')
      mountProfile(user, 'Student', signOut)
      mountSidebar([
        { label: 'Dashboard', tab: 'dashboard', active: true, icon: '⌂' },
        { label: 'Grades', tab: 'grades', icon: '♧' },
        { label: 'Transcript', tab: 'transcript', icon: '▱' },
        { label: 'Schedule', tab: 'schedule', icon: '▤' },
        { label: 'Profile', tab: 'profile', icon: '☷' }
      ], 'Student Portal')

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
        document.getElementById('dash-term').textContent = `${enrollment?.sections?.semester || ''} - ${enrollment?.sections?.academic_year || schoolYear}`
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
        if (student?.profile_picture_url) document.getElementById('profile-picture-preview').src = student.profile_picture_url
      }

      async function loadSchedule() {
        const table = document.getElementById('schedule-table')
        document.getElementById('schedule-caption').textContent = `Class Schedule — ${schoolYear || 'Current Term'}`
        if (!sectionId) { table.innerHTML = '<tr><td colspan="5">No active section enrollment found.</td></tr>'; return }
        const { data, error } = await supabase.from('subject_schedules').select('subject_id,section_id,faculty_name,day_of_week,start_time,end_time,subjects(subject_name),sections(section_name)').eq('section_id', sectionId).order('day_of_week').order('start_time')
        if (error) return table.innerHTML = `<tr><td colspan="5">${escape(error.message)}</td></tr>`
        table.innerHTML = (data || []).map(item => `<tr><td>${escape(item.subjects?.subject_name || '')}</td><td>${escape(item.sections?.section_name || '')}</td><td>${escape(item.faculty_name || '-')}</td><td>${dayNames[item.day_of_week]}</td><td>${escape(item.start_time?.slice(0,5))} - ${escape(item.end_time?.slice(0,5))}</td></tr>`).join('') || '<tr><td colspan="5">No schedule configured yet.</td></tr>'
        document.getElementById('dash-units').textContent = `${(data || []).length} Subject${(data || []).length === 1 ? '' : 's'}`
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

      async function loadAnnouncements() {
        const table = document.getElementById('announcements-table')
        const { data, error } = await supabase.from('announcements').select('title,posted_at').order('posted_at', { ascending: false }).limit(8)
        if (error) return table.innerHTML = `<tr><td colspan="2">${escape(error.message)}</td></tr>`
        table.innerHTML = (data || []).map(a => `<tr><td>${escape(a.title)}</td><td>${formatDate(a.posted_at)}</td></tr>`).join('') || '<tr><td colspan="2">No announcements posted.</td></tr>'
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

      document.getElementById('save-picture').onclick = async () => {
        const file = document.getElementById('profile-picture-input').files?.[0]
        if (!file) return window.alert('Choose an image file first.')
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) return window.alert('PNG/JPG/WEBP up to 3MB only.')
        const path = `${user.student_id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: uploadError } = await supabase.storage.from('profile-pictures').upload(path, file, { upsert: false })
        if (uploadError) return window.alert(uploadError.message)
        const { data: publicUrlData } = supabase.storage.from('profile-pictures').getPublicUrl(path)
        const { error: rpcError } = await supabase.rpc('update_own_profile_picture', { p_url: publicUrlData.publicUrl })
        if (rpcError) return window.alert(rpcError.message)
        document.getElementById('profile-picture-preview').src = publicUrlData.publicUrl
        window.alert('Profile picture updated.')
      }

      document.getElementById('grade-year-filter').onchange = renderGrades
      document.getElementById('grade-semester-filter').onchange = renderGrades
      document.getElementById('transcript-year-filter').onchange = renderTranscript
      document.getElementById('print-unofficial-transcript').onclick = () => printElement(document.getElementById('student-transcript-print'), 'printing-transcript')

      await loadStudent()
      await Promise.all([loadSchedule(), loadGrades(), loadAnnouncements(), loadAttendance()])
      hideLoadingScreen()
    
