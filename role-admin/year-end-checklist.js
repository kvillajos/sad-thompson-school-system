// Year Setup > End of the year: the checklist from year_end_checklist() (v63) and the Close / Reopen buttons.
import { supabase } from '../shared/lib/auth-client.js'
import { escapeHtml, longDate } from '../shared/lib/html.js'
import { describeError } from '../shared/lib/errors.js'
import { confirmDialog, formDialog } from '../shared/ui/dialog.js'
import { toast } from '../shared/ui/ui-theme.js'
import { withBusy } from '../shared/ui/shell.js'
import { todayManila } from '../shared/lib/school-years.js'

// Where each open item is dealt with.
const WHERE = {
  grades: ['Grade Tracker', '/role-admin/admin-grade-tracker.html'],
  promotion: ['Pending Approvals (the registrar requests promotion)', '/role-admin/admin-dashboard.html'],
  approvals: ['Pending Approvals', '/role-admin/admin-dashboard.html'],
  admissions: ['Admissions', '/role-admin/admin-admissions.html'],
  documents: ["Registrar's Document Requests", null],
  shifts: ["Registrar's Promotion & Transfers", null]
}

export async function mountYearEnd(host, year, onChange) {
  if (!host || !year) return
  if (year.closed_at) {
    host.innerHTML = `<ol class="checklist"><li class="done"><span class="step-no" aria-hidden="true">✓</span><div>
        <h4>${escapeHtml(year.label)} is closed <span class="badge completed">Closed</span></h4>
        <p>Closed on ${escapeHtml(longDate(String(year.closed_at).slice(0, 10)))}${year.closed_by ? ` by ${escapeHtml(year.closed_by)}` : ''}. Faculty and the registrar can no longer change its records.${
          year.close_reason ? ` Closed with open items: ${escapeHtml(year.close_reason)}` : ''
        }</p></div>
        <div class="step-actions"><button type="button" class="admin-secondary" data-reopen>Reopen year</button></div></li></ol>`
    host.querySelector('[data-reopen]').onclick = event =>
      withBusy(event.currentTarget, 'Reopening…', async () => {
        const values = await formDialog({
          title: `Reopen ${year.label}`,
          message: 'Faculty and the registrar will be able to change this year again.',
          fields: [{ name: 'reason', label: 'Reason', required: true, multiline: true, maxlength: 300 }],
          confirmText: 'Reopen',
          danger: true
        })
        if (!values) return
        const { error } = await supabase.rpc('reopen_school_year', { p_label: year.label, p_reason: values.reason })
        if (error) return toast(describeError(error, 'Reopen year'), 'error')
        toast(`${year.label} reopened.`)
        await onChange?.()
      })
    return
  }

  host.innerHTML = '<p class="admin-note">Checking the year…</p>'
  const { data, error } = await supabase.rpc('year_end_checklist', { p_label: year.label })
  if (error) return (host.innerHTML = `<p class="admin-note">${escapeHtml(describeError(error, 'Load the year-end checklist'))}</p>`)
  const items = data || []
  const open = items.filter(item => item.count > 0)
  // close_school_year (v64) refuses this too.
  const notStarted = todayManila() < year.start_date
  host.innerHTML = `<ol class="checklist">${items
    .map((item, i) => {
      const [place, href] = WHERE[item.key] || []
      return `<li class="${item.count ? '' : 'done'}"><span class="step-no" aria-hidden="true">${item.count ? i + 1 : '✓'}</span><div>
        <h4>${escapeHtml(item.label)} <span class="badge ${item.count ? 'pending' : 'completed'}">${item.count ? item.count : 'Done'}</span></h4>
        <p>${item.count ? escapeHtml(item.detail) : 'Nothing left.'}</p></div>
        <div class="step-actions">${item.count && place ? (href ? `<a class="admin-secondary" href="${href}">${escapeHtml(place)}</a>` : `<span class="admin-note">${escapeHtml(place)}</span>`) : ''}</div></li>`
    })
    .join('')}</ol>
    ${
      notStarted
        ? `<p class="admin-note" style="margin-top:16px">${escapeHtml(year.label)} starts on ${escapeHtml(longDate(year.start_date))}. It can be closed once it has started.</p>`
        : `<div class="admin-actions" style="margin-top:16px"><button type="button" class="${open.length ? 'admin-remove' : 'admin-primary'}" data-close-year>${
            open.length ? 'Close anyway…' : `Close ${escapeHtml(year.label)}`
          }</button></div>`
    }`
  if (notStarted) return

  host.querySelector('[data-close-year]').onclick = event =>
    withBusy(event.currentTarget, 'Closing…', async () => {
      let reason = null
      if (open.length) {
        const values = await formDialog({
          title: `Close ${year.label} with open items`,
          message: `Still open: ${open.map(item => item.detail).join('; ')}. Closing makes the year read-only for faculty and the registrar, so these may not get finished.`,
          fields: [{ name: 'reason', label: 'Why close now?', required: true, multiline: true, maxlength: 500 }],
          confirmText: 'Close year',
          danger: true
        })
        if (!values) return
        reason = values.reason
      } else if (
        !(await confirmDialog(
          `Close ${year.label}? Enrollment closes and the year becomes read-only for faculty and the registrar. You can reopen it if needed.`,
          { title: 'Close school year', confirmText: 'Close year', danger: true }
        ))
      )
        return
      const { error: closeError } = await supabase.rpc('close_school_year', { p_label: year.label, p_override_reason: reason })
      if (closeError) return toast(describeError(closeError, 'Close year'), 'error')
      toast(`${year.label} is closed.`)
      await onChange?.()
    })
}
