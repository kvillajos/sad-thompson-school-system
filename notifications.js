import { supabase } from './auth-client.js'
import { escapeHtml, formatDate } from './html.js'

const WEEK_MS = 7 * 86400000
const label = key => key.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
const show = value => value === null || value === undefined || value === '' ? '—' : String(value)
const BELL = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'

// Bell in the student's profile bar. Notices disappear after a week (the database policy hides
// them too; the date filter here just keeps the list correct before that policy is applied).
export async function mountNotificationBell(user) {
  const profile = document.querySelector('.floating-profile')
  if (!profile) return
  document.body.classList.add('has-notif-bell')
  const box = document.createElement('div')
  box.className = 'notif'
  box.innerHTML = `<button type="button" class="notif-toggle" aria-label="Notifications" aria-expanded="false">${BELL}<span class="notif-count hidden"></span></button><div class="notif-panel hidden"></div>`
  profile.prepend(box)
  window.dispatchEvent(new Event('resize')) // the bar just got wider: re-clamp a saved drag position so it stays on screen
  const toggle = box.querySelector('.notif-toggle')
  const panel = box.querySelector('.notif-panel')
  const count = box.querySelector('.notif-count')
  let items = []

  async function load() {
    const since = new Date(Date.now() - WEEK_MS).toISOString()
    const { data } = await supabase.from('notifications').select('id,title,message,details,is_read,created_at').eq('recipient_email', user.email).gte('created_at', since).order('created_at', { ascending: false }).limit(30)
    items = data || []
    const unread = items.filter(item => !item.is_read).length
    count.textContent = unread
    count.classList.toggle('hidden', !unread)
    panel.innerHTML = items.map(item => `<button type="button" class="notif-item${item.is_read ? '' : ' unread'}" data-notif="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span><small>${formatDate(item.created_at, true)}</small></button>`).join('') || '<p class="notif-empty">No notifications this week.</p>'
  }

  function openDetails(item) {
    const changes = Object.entries(item.details || {})
    const modal = document.createElement('div')
    modal.className = 'admin-modal'
    modal.innerHTML = `<div class="admin-modal-box account-details-box"><div class="admin-modal-head"><h3>${escapeHtml(item.title)}</h3><button type="button" data-close>x</button></div><div class="account-hero"><div class="account-avatar">${BELL}</div><div><p class="account-hero-name">${escapeHtml(item.message)}</p><div class="account-hero-meta"><span class="badge">${formatDate(item.created_at, true)}</span></div></div></div>${changes.length ? `<h4>What changed</h4><div class="review-grid">${changes.map(([key, change]) => `<div><small>${escapeHtml(label(key))}</small><p><s style="color:#94a3b8">${escapeHtml(show(change.from))}</s> &rarr; <b>${escapeHtml(show(change.to))}</b></p></div>`).join('')}</div>` : ''}<p style="color:#64748b;font-size:13px">If something here looks wrong, please tell the registrar's office.</p></div>`
    document.body.appendChild(modal)
    modal.querySelector('[data-close]').onclick = () => modal.remove()
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove() })
  }

  toggle.onclick = () => { panel.classList.toggle('hidden'); toggle.setAttribute('aria-expanded', String(!panel.classList.contains('hidden'))) }
  panel.onclick = async event => {
    const row = event.target.closest('[data-notif]')
    if (!row) return
    const item = items.find(entry => String(entry.id) === row.dataset.notif)
    if (!item) return
    panel.classList.add('hidden')
    openDetails(item)
    if (!item.is_read) { await supabase.rpc('acknowledge_notification', { p_id: item.id }); await load() }
  }
  document.addEventListener('click', event => { if (!box.contains(event.target)) panel.classList.add('hidden') })
  await load()
  setInterval(load, 60000)
}
