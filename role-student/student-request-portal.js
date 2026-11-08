import { describeError } from '../shared/lib/errors.js'
import { escapeHtml, formatDate } from '../shared/lib/html.js'
import { withBusy } from '../shared/ui/shell.js'
import { toast } from '../shared/ui/ui-theme.js'

const CATEGORY_LABELS = {
  lrn_update: 'LRN update',
  account_fix: 'Account fix',
  section_transfer: 'Section transfer'
}

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected'
}

export function mountStudentRequestPortal({ supabase, user }) {
  const form = document.getElementById('student-request-form')
  const category = form.elements.category
  const details = form.elements.details
  const submitButton = form.querySelector('[type="submit"]')
  const table = document.getElementById('student-requests-table')
  const statusNote = document.getElementById('student-requests-status')
  let latestLoad = 0
  let channelErrorReported = false
  let liveUpdatesUnavailable = false

  const placeholders = {
    lrn_update: 'Explain the LRN correction and provide the correct information.',
    account_fix: 'Describe the student account information that needs correction.',
    section_transfer: 'Share the requested section and the reason for the transfer.'
  }
  const updatePlaceholder = () => {
    details.placeholder = placeholders[category.value]
  }
  category.addEventListener('change', updatePlaceholder)
  updatePlaceholder()

  async function loadRequests() {
    const loadId = ++latestLoad
    const { data, error } = await supabase
      .from('approval_requests')
      .select('id,payload,summary,reason,status,remarks,created_at')
      .eq('request_type', 'student_portal_request')
      .order('created_at', { ascending: false })
      .limit(50)

    if (loadId !== latestLoad) return
    if (error) {
      statusNote.textContent = describeError(error, 'Load requests')
      table.innerHTML = `<tr><td colspan="5" role="alert">${escapeHtml(statusNote.textContent)}</td></tr>`
      return
    }
    if (!liveUpdatesUnavailable) statusNote.textContent = ''

    table.innerHTML =
      (data || [])
        .map(request => {
          const requestCategory = request.payload?.category
          const requestStatus = String(request.status || '').toLowerCase()
          return `<tr>
            <td data-label="Request">${escapeHtml(CATEGORY_LABELS[requestCategory] || 'Student request')}</td>
            <td data-label="Details">${escapeHtml(request.reason || request.payload?.details || '')}</td>
            <td data-label="Submitted">${formatDate(request.created_at, true)}</td>
            <td data-label="Status"><span class="student-request-status status-${escapeHtml(requestStatus)}">${escapeHtml(STATUS_LABELS[requestStatus] || request.status || 'Unknown')}</span></td>
            <td data-label="Review note">${escapeHtml(request.remarks || '-')}</td>
          </tr>`
        })
        .join('') || '<tr><td colspan="5">No requests submitted yet.</td></tr>'
  }

  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (!form.reportValidity()) return

    const result = await withBusy(submitButton, 'Sending…', () =>
      supabase.rpc('submit_student_portal_request', {
        p_category: category.value,
        p_details: details.value.trim()
      })
    )
    if (result.error) {
      toast(describeError(result.error, 'Submit request'), 'error')
      return
    }

    details.value = ''
    toast('Request submitted. You can track its status below.')
    await loadRequests()
  })

  const channel = supabase
    .channel(`student-requests-${user.user_id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'approval_requests',
        filter: `requested_by=eq.${user.user_id}`
      },
      loadRequests
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        liveUpdatesUnavailable = true
        statusNote.textContent = 'Live updates are unavailable; checking request status periodically.'
        if (!channelErrorReported) {
          channelErrorReported = true
          toast('Live request updates are unavailable. Status will refresh periodically.', 'error')
        }
      } else if (status === 'SUBSCRIBED') {
        liveUpdatesUnavailable = false
        channelErrorReported = false
        statusNote.textContent = ''
      }
    })

  const refreshTimer = window.setInterval(loadRequests, 30000)
  window.addEventListener(
    'beforeunload',
    () => {
      window.clearInterval(refreshTimer)
      supabase.removeChannel(channel)
    },
    { once: true }
  )
  loadRequests()
}
