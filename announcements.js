import { supabase } from './auth-client.js'
import { escapeHtml, formatDate } from './html.js'

// Shows the announcements meant for one role on its dashboard: maintenance notices as a banner,
// everything else as a list. The database already hides other audiences and expired rows from
// faculty/students; admin and registrar can read every row, so the same filter runs here too.
export async function mountAnnouncements(host, role, { list = true } = {}) {
  if (!host) return
  const { data, error } = await supabase.from('announcements').select('id,title,message,kind,audience,pinned,posted_at,expires_at').order('pinned', { ascending: false }).order('posted_at', { ascending: false }).limit(40)
  const rows = (data || []).filter(item => (!item.expires_at || new Date(item.expires_at) > new Date()) && (item.audience === 'all' || item.audience === role))
  const banners = rows.filter(item => item.kind === 'maintenance').map(item => `<div class="maintenance-banner" role="status"><strong>${item.pinned ? '&#128204; ' : ''}${escapeHtml(item.title)}</strong>${item.message ? `<span>${escapeHtml(item.message)}</span>` : ''}</div>`).join('')
  const notices = rows.filter(item => item.kind !== 'maintenance').slice(0, 8)
  host.innerHTML = banners + (list ? `<section class="admin-table-wrap" style="margin-bottom:18px"><div class="admin-section-title"><h3>Announcements</h3></div>${error ? `<p>${escapeHtml(error.message)}</p>` : notices.map(item => `<div class="announcement-item"><div><b>${item.pinned ? '&#128204; ' : ''}${escapeHtml(item.title)}</b>${item.message ? `<p>${escapeHtml(item.message)}</p>` : ''}</div><small>${formatDate(item.posted_at)}</small></div>`).join('') || '<p style="color:#64748b">No announcements posted.</p>'}</section>` : '')
}

// Login screen: only maintenance notices, readable without signing in.
export async function loadMaintenanceNotices() {
  const { data } = await supabase.from('announcements').select('title,message,pinned,expires_at').eq('kind', 'maintenance').order('pinned', { ascending: false }).order('posted_at', { ascending: false }).limit(3)
  return (data || []).filter(item => !item.expires_at || new Date(item.expires_at) > new Date())
}
