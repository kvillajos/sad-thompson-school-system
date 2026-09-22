  import { supabase } from './auth-client.js'
  import { hideLoadingScreen } from './loading-screen.js'
  import { mountAdminShell } from './admin-page.js'
  await mountAdminShell('curriculum')
  const checks = ['Subjects have codes and names', 'Sections have grade and capacity', 'Every schedule has a valid time range', 'No schedule conflicts are reported', 'Student placement rules are ready for demo']
  const checklist = document.getElementById('review-checklist')
  checks.forEach((label, index) => { checklist.insertAdjacentHTML('beforeend', `<label class="admin-check"><input type="checkbox" data-review="${index}"> <span>${label}</span></label>`) })
  function updateProgress() { const complete = [...document.querySelectorAll('[data-review]:checked')].length; document.getElementById('review-progress').textContent = `${complete} of ${checks.length} complete` }
  document.querySelectorAll('[data-review]').forEach(item => item.onchange = updateProgress)
  async function loadSummary() {
    const [subjects, sections, schedules] = await Promise.all([supabase.from('subjects').select('subject_id'), supabase.from('sections').select('section_id'), supabase.from('subject_schedules').select('schedule_id')])
    document.getElementById('subject-count').textContent = subjects.error ? '!' : subjects.data.length
    document.getElementById('section-count').textContent = sections.error ? '!' : sections.data.length
    document.getElementById('schedule-count').textContent = schedules.error ? '!' : schedules.data.length
  }
  document.getElementById('refresh-summary').onclick = loadSummary
  await loadSummary()
  hideLoadingScreen()

