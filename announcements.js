import { supabase } from './auth-client.js'
import { escapeHtml, formatDate, richText } from './html.js'

export const pinIcon = '<svg class="pin-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Pinned" role="img"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>'

// Shows the announcements meant for one role on its dashboard: maintenance notices as a banner,
// everything else as a list. The database already hides other audiences and expired rows from
// faculty/students; admin and registrar can read every row, so the same filter runs here too.
export async function mountAnnouncements(host, role, { list = true } = {}) {
  if (!host) return
  const { data, error } = await supabase.from('announcements').select('id,title,message,kind,audience,pinned,posted_at,expires_at,author_name').order('pinned', { ascending: false }).order('posted_at', { ascending: false }).limit(40)
  const rows = (data || []).filter(item => (!item.expires_at || new Date(item.expires_at) > new Date()) && (item.audience === 'all' || item.audience === role))
  const notices = rows.slice(0, 8)
  const badge = item => item.kind === 'maintenance' ? '<span class="badge urgent-badge">Urgent</span> ' : ''
  const preview = html => { const box = document.createElement('div'); box.innerHTML = richText(html).replace(/<\/(p|div|li|h3|blockquote)>|<br>/gi, ' '); const text = (box.textContent || '').replace(/\s+/g, ' ').trim(); return text.length > 220 ? text.slice(0, 220) + '...' : text }
  const inbox = notices.map((item, index) => `<button type="button" class="mail-row${item.kind === 'maintenance' ? ' urgent' : ''}" data-mail="${index}"><span class="mail-main"><span class="mail-top"><span class="mail-subject">${item.pinned ? pinIcon : ''}${badge(item)}${escapeHtml(item.title)}${item.author_name ? `<span class="mail-author">&middot; ${escapeHtml(item.author_name)}</span>` : ''}</span><span class="mail-date">${formatDate(item.posted_at)}</span></span><span class="mail-preview">${escapeHtml(preview(item.message || '')) || 'No message.'}</span></span></button>`).join('')
  host.innerHTML = list ? `<section class="admin-table-wrap" style="margin-bottom:18px"><div class="admin-section-title"><h3>Announcements</h3></div>${error ? `<p>${escapeHtml(error.message)}</p>` : inbox || '<p style="color:#64748b">No announcements posted.</p>'}</section>` : ''
  host.querySelectorAll('[data-mail]').forEach(button => button.onclick = () => openAnnouncement(notices[Number(button.dataset.mail)]))
}

// Email-style reader: the list shows sender/subject/preview, this window shows the whole message.
function openAnnouncement(item) {
  const modal = document.createElement('div')
  modal.className = 'admin-modal'
  modal.innerHTML = `<div class="admin-modal-box mail-view" role="dialog" aria-modal="true"><div class="admin-modal-head"><h3>${item.pinned ? pinIcon : ''}${item.kind === 'maintenance' ? '<span class="badge urgent-badge">Urgent</span> ' : ''}${escapeHtml(item.title)}</h3><button type="button" data-mail-close aria-label="Close">x</button></div><div class="mail-meta"><small>${item.author_name ? `${escapeHtml(item.author_name)} &middot; ` : ''}${formatDate(item.posted_at, true)}${item.pinned ? pinIcon + ' Pinned' : ''}</small></div><div class="mail-body rich">${item.message ? richText(item.message) : '<p style="color:#64748b">No message.</p>'}</div></div>`
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey) }
  const onKey = event => { if (event.key === 'Escape') close() }
  modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-mail-close]')) close() })
  document.addEventListener('keydown', onKey)
  document.body.appendChild(modal)
  modal.querySelector('[data-mail-close]').focus()
}

// Login screen: only maintenance notices, readable without signing in.
export async function loadMaintenanceNotices() {
  const { data } = await supabase.from('announcements').select('title,message,pinned,posted_at,expires_at').eq('kind', 'maintenance').order('pinned', { ascending: false }).order('posted_at', { ascending: false }).limit(3)
  return (data || []).filter(item => !item.expires_at || new Date(item.expires_at) > new Date())
}

// Transparent card over the login photo. Empty when there is nothing urgent.
export function renderLoginNotices(host, notices) {
  host.innerHTML = notices.length ? `<div class="login-notice-card" role="status">${notices.map(item => `<div class="login-notice"><strong><span class="login-notice-tag">Notice</span> - ${item.pinned ? pinIcon : ''}${escapeHtml(item.title)}</strong>${item.message ? `<div class="rich">${richText(item.message)}</div>` : ''}<small class="login-notice-date">${formatDate(item.posted_at)}</small></div>`).join('')}</div>` : ''
}
