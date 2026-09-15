import { supabase } from './auth-client.js';

const sharedTheme = `
:root {
  --ui-bg: #f3f6fb;
  --ui-surface: #f8faff;
  --ui-surface-strong: #ffffff;
  --ui-navy: #071b3a;
  --ui-blue: #1756d1;
  --ui-blue-dark: #17345f;
  --ui-text: #17345f;
  --ui-muted: #64748b;
  --ui-border: #dbe3ef;
  --ui-success: #16834b;
  --ui-danger: #c0392b;
  --ui-warning: #b7791f;
}

body {
  margin: 0 !important;
  min-height: 100vh;
  background: var(--ui-bg) !important;
  color: var(--ui-text) !important;
  font-family: Arial, 'Helvetica Neue', sans-serif !important;
  font-size: 14px !important;
  line-height: 1.45 !important;
}
.hidden { display: none !important; }
.admin-shell > header { display:none; }
.login-layout {
  display: grid;
  grid-template-columns: minmax(280px, 35%) 1fr;
  min-height: 100vh;
}
.login-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2rem clamp(1.5rem, 5vw, 3rem);
  background: var(--ui-navy);
  color: #fff !important;
}
.login-panel h2 { color:#fff !important; }
.login-panel label { color:#fff !important; }
.login-panel #message { color:#fff; }
.login-photo {
  min-height: 100vh;
  background: url('/assets/bg.jpg') center / cover no-repeat;
}
.brand-lockup { position:relative; display:flex; flex-direction:column; align-items:center; width:min(100%,384px); margin:0 auto 1.25rem; padding-top:0 }
.brand-copy { color:#fff; text-align:center; order:2 }
.brand-name { font-size:1.7rem; font-weight:700; line-height:1.1 }
.brand-name span { color:#7da8ff }
.brand-tagline { font-size:.9rem; color:#cbd5e1 }
.brand-logo { position:static; order:1; width:200px; height:200px; object-fit:contain; margin-bottom:12px }
.login-panel .card { width:min(100%,384px); margin:0 auto }
.login-panel .card > h2 { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap }
.login-panel .form-group { margin-bottom:8px }
.login-panel form { width:100%; }
.login-panel label { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap }
.login-panel input { display:block; width:100%; padding:.65rem .7rem; background:#e7ebf0; color:#172b4d; border:0; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,.18); font-size:14px }
.login-panel button { display:block; width:100%; box-sizing:border-box; padding:.72rem; background:#2864c7; color:#fff; border:0; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,.22); font-size:15px; cursor:pointer }
.dashboard-info { background:#fff; padding:1rem; border-radius:8px; border:1px solid var(--ui-border); margin-bottom:1rem }
.dashboard-info p { color:var(--ui-text) }
header:not(.profile-header) { display:flex; align-items:center; justify-content:space-between; gap:1rem; min-height:64px; margin-left:198px; padding:14px 24px; background:var(--ui-navy); color:#fff }
header:not(.profile-header) h1 { margin:0; font-size:22px }
header:not(.profile-header) button { padding:.65rem 1rem; border:0; border-radius:6px; background:#fff; color:var(--ui-blue-dark); font-weight:600; cursor:pointer }
header:not(.profile-header) + main { max-width:960px; margin:2rem auto; padding:0 1.25rem }
.welcome { padding:2rem; background:#fff; border-radius:8px; box-shadow:0 4px 20px rgba(7,27,58,.08) }
.welcome h2 { color:var(--ui-blue-dark); font-size:22px }
.admin-page-head { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:18px }
.admin-sidebar { position:fixed; inset:0 auto 0 0; width:220px; z-index:90; display:flex; flex-direction:column; padding:18px 16px; background:var(--ui-navy); color:#fff }
.admin-brand { font-size:14px; font-weight:700; line-height:1.1; padding:0 8px 14px }
.admin-sidebar-logo { width:66px; height:66px; object-fit:contain; margin:0 auto 18px }
.admin-sidebar nav { display:flex; flex-direction:column; gap:0; margin-top:0 }
.admin-sidebar nav a { display:flex; align-items:center; gap:8px; padding:11px 8px; color:#d8e3f7; border-bottom:1px solid rgba(255,255,255,.12); font-size:12px; font-weight:700; text-decoration:none }
.admin-sidebar nav a::before { content:'▣'; width:18px; color:currentColor; text-align:center; }
.admin-sidebar nav a:first-child::before { content:'⌂'; }
.admin-sidebar nav a.active,.admin-sidebar nav a:hover { background:#17417e; color:#fff }
.admin-sidebar ~ main { margin-left:220px; max-width:none; padding:36px 36px; }
.admin-page-head h2 { margin:0; color:var(--ui-blue-dark); font-size:24px }
.admin-page-head p { margin:6px 0 0; color:var(--ui-muted) }
.admin-primary { background:var(--ui-blue); color:#fff; border:0; border-radius:5px; padding:10px 14px; cursor:pointer; font-weight:700 }
.admin-filterbar { display:flex; flex-wrap:wrap; gap:10px; margin:0 0 14px }
.admin-filterbar input,.admin-filterbar select { min-width:180px; padding:9px; border:1px solid #b9c8dc; border-radius:5px; color:var(--ui-text); background:#fff }
.admin-filterbar .admin-action { margin-left:auto }
.admin-checklist { display:grid; gap:0 }
.admin-check { display:flex; align-items:center; gap:10px; padding:12px 8px; border-bottom:1px solid var(--ui-border); color:var(--ui-text); font-weight:600 }
.admin-check input { width:auto; margin:0 }
.admin-check:last-child { border-bottom:0 }
.admin-summary-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px }
@media (max-width:700px) { .admin-summary-grid { grid-template-columns:1fr } }
.admin-table-wrap { overflow:auto; background:var(--ui-surface); border:1px solid var(--ui-border); border-radius:7px; padding:12px }
.admin-table-wrap table { width:100%; border-collapse:collapse; min-width:760px }
.admin-table-wrap th { background:var(--ui-navy); color:#fff; text-align:left; padding:10px; font-size:12px }
.admin-table-wrap td { color:var(--ui-text); border-bottom:1px solid var(--ui-border); padding:10px; font-size:13px }
.admin-view,.admin-remove { border:0; border-radius:4px; padding:6px 9px; margin-right:5px; cursor:pointer; font-size:12px }
.admin-view { background:#eaf1ff; color:var(--ui-blue-dark) }
.admin-remove { background:#fee2e2; color:var(--ui-danger) }
.admin-modal { position:fixed; inset:0; z-index:110; display:grid; place-items:center; background:rgba(7,27,58,.5); padding:20px }
.admin-modal-box { width:min(100%,520px); background:#fff; border-radius:7px; padding:20px; box-shadow:0 12px 35px rgba(7,27,58,.2) }
.admin-modal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px }
.admin-modal-head h3 { margin:0; color:var(--ui-blue-dark) }
.admin-modal-head button { border:0; background:#eaf1ff; color:var(--ui-blue-dark); border-radius:4px; padding:5px 9px; cursor:pointer }
.admin-modal-box form { display:grid; grid-template-columns:1fr 1fr; gap:14px }
.admin-modal-box label { color:var(--ui-text); font-weight:700; font-size:13px }
.admin-modal-box input,.admin-modal-box select { width:100%; margin-top:6px; padding:9px; border:1px solid #b9c8dc; border-radius:5px; color:var(--ui-text); background:#fff }
.admin-full,.admin-actions { grid-column:1/-1 }
.admin-actions { display:flex; justify-content:flex-end; gap:8px }
.admin-cancel { border:0; border-radius:5px; padding:10px 14px; background:#fee2e2; color:var(--ui-danger); cursor:pointer }
@media (max-width:700px) { header:not(.profile-header) { margin-left:0; padding:1rem 1.25rem } .admin-sidebar { position:static; width:100%; min-height:0; display:block }.admin-sidebar nav { flex-direction:row; flex-wrap:wrap }.admin-sidebar nav a { border:0 }.admin-sidebar-logo { display:block; margin:0 auto 12px }.admin-sidebar ~ main { margin-left:0; padding:20px 14px }.admin-page-head { align-items:flex-start; flex-direction:column } .admin-modal-box form { grid-template-columns:1fr } }
@media (max-width:700px) { .login-layout { grid-template-columns:1fr } .login-photo { display:none } }
.main, .card, .student-directory {
  color: var(--ui-text) !important;
}
.main h2, .main h3, .section-title, .toolbar h2 {
  color: var(--ui-blue-dark) !important;
  font-size: 22px !important;
  line-height: 1.25 !important;
}
.main p, .main label, .main small, td {
  color: var(--ui-text) !important;
}
.main small, .main .note {
  color: var(--ui-muted) !important;
  font-size: 12px !important;
}
.main button.btn {
  background: var(--ui-blue) !important;
  color: #fff !important;
  border: 1px solid var(--ui-blue) !important;
  font-size: 13px !important;
}
.main button.btn.secondary, .main button.small, .modalhead button {
  background: #eaf1ff !important;
  color: var(--ui-blue-dark) !important;
  border: 1px solid #c9dbfb !important;
  font-size: 12px !important;
}
.main input, .main select, .main textarea {
  background: var(--ui-surface-strong) !important;
  color: var(--ui-text) !important;
  border: 1px solid #b9c8dc !important;
  font-size: 13px !important;
}
.main input::placeholder, .main textarea::placeholder {
  color: var(--ui-muted) !important;
  opacity: 1 !important;
}
.main table {
  color: var(--ui-text) !important;
}
.main th {
  background: var(--ui-navy) !important;
  color: #fff !important;
  font-size: 12px !important;
}
.main td {
  color: var(--ui-text) !important;
  font-size: 13px !important;
  border-color: var(--ui-border) !important;
}
.side {
  background: var(--ui-navy) !important;
  color: #fff !important;
}
.side button, .side button.active, .side button:hover {
  color: #e5eefc !important;
  font-size: 13px !important;
}
.side button.active, .side button:hover {
  background: #17417e !important;
  color: #fff !important;
}
.profile-toggle {
  display:flex;
  align-items:center;
  gap:10px;
  min-width:190px;
  min-height:42px;
  padding:6px 10px !important;
  border:1px solid #e1e8f2 !important;
  border-radius:9px !important;
  background:#fff !important;
  color: var(--ui-text) !important;
  font-size: 13px !important;
}
.profile-toggle strong,.profile-toggle small { display:block; text-align:left; }
.profile-toggle small { margin-top:2px; color:#64748b; font-size:11px; }
.profile-avatar { display:grid; place-items:center; width:34px; height:34px; flex:0 0 34px; border-radius:50%; background:#2161d1; color:#fff; font-weight:700; }
.profile-chevron { margin-left:8px; font-size:18px; }
.floating-profile {
  position: fixed;
  top: 18px;
  right: 24px;
  z-index: 100;
}
.floating-profile .profile-toggle {
  min-width: 190px;
  min-height: 42px;
  justify-content: flex-start;
  box-shadow: 0 3px 12px rgba(7,27,58,.1);
}
.floating-profile .profile-toggle > span:nth-child(2) { min-width: 0; flex: 1; line-height: 1.1; }
.floating-profile .profile-toggle strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.floating-profile .profile-toggle small { display: block; margin-top: 3px; white-space: nowrap; }
.floating-profile .profile-dropdown {
  top: 48px;
}
.new-enrollment-action {
  margin-left: auto !important;
}
.profile-toggle small, .profile-dropdown button {
  color: var(--ui-text) !important;
  font-size: 12px !important;
}
.profile-dropdown button {
  background: #fff !important;
}
.badge {
  font-size: 11px !important;
}
.app-sidebar { width:220px; min-height:100vh; box-sizing:border-box; background:var(--ui-navy); color:#fff; padding:18px 16px; }
.app-sidebar .sidebar-brand { color:#fff; font-size:14px; font-weight:700; line-height:1.1; padding:0 8px 14px; }
.app-sidebar .sidebar-logo { display:block; width:66px; height:66px; object-fit:contain; margin:0 auto 18px; }
.app-sidebar .sidebar-nav { display:flex; flex-direction:column; gap:0; }
.app-sidebar .sidebar-link { display:flex; align-items:center; gap:8px; width:100%; box-sizing:border-box; padding:11px 8px; border:0; border-bottom:1px solid rgba(255,255,255,.12); background:transparent; color:#d8e3f7; font:700 12px/1.45 Arial,'Helvetica Neue',sans-serif; text-align:left; text-decoration:none; cursor:pointer; }
.app-sidebar .sidebar-link::before { content:var(--sidebar-icon, '▣'); width:18px; color:currentColor; text-align:center; }
.app-sidebar .sidebar-link.active,.app-sidebar .sidebar-link:hover { background:#17417e; color:#fff; }
body.has-app-sidebar > header { display:none; }
body.has-app-sidebar > main { margin-left:220px; max-width:none; padding:36px 36px; }
body.has-app-sidebar > .app-sidebar { position:fixed; inset:0 auto 0 0; z-index:90; }
.spam-guard-cooling { opacity: .6; cursor: not-allowed !important; pointer-events: none; }
.review-box { width: min(100%, 560px); }
.review-summary { margin-bottom: 14px; }
.review-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 14px; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 6px; }
.review-grid small { display: block; color: var(--ui-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.review-grid p { margin: 4px 0 0; color: var(--ui-text); font-weight: 600; }
.review-countdown { margin: 10px 0 0; padding: 9px 12px; background: #fff4d6; color: var(--ui-warning); border-radius: 5px; font-size: 12px; font-weight: 700; }
.admin-actions button[disabled] { opacity: .55; cursor: not-allowed; }
.admin-modal-box textarea { width:100%; box-sizing:border-box; margin-top:6px; padding:9px; border:1px solid #b9c8dc; border-radius:5px; color:var(--ui-text); background:#fff; resize:vertical; min-height:72px; max-height:160px; font:inherit; }
`;

const SPAM_GUARD_MS = 600;

// Blocks rapid repeat clicks on any clickable control app-wide so double-clicks or
// impatient re-clicks during a network request can't trigger an action twice.
function installSpamGuard() {
  if (window.__tcsmsSpamGuardInstalled) return;
  window.__tcsmsSpamGuardInstalled = true;
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, [type="submit"], .admin-view, .admin-remove, .sidebar-link');
    if (!target) return;
    const now = Date.now();
    const last = Number(target.dataset.tcsmsLastClick || 0);
    if (now - last < SPAM_GUARD_MS) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    target.dataset.tcsmsLastClick = String(now);
    target.classList.add('spam-guard-cooling');
    setTimeout(() => target.classList.remove('spam-guard-cooling'), SPAM_GUARD_MS);
  }, true);
}

// Disables a button and swaps its label while an async action runs, restoring it after.
export async function withBusy(button, busyLabel, action) {
  const originalLabel = button.textContent;
  const originalDisabled = button.disabled;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    return await action();
  } finally {
    button.disabled = originalDisabled;
    button.textContent = originalLabel;
  }
}

export function applyUiTheme() {
  installSpamGuard();
  if (document.getElementById('shared-ui-theme')) return;
  const style = document.createElement('style');
  style.id = 'shared-ui-theme';
  style.textContent = sharedTheme;
  document.head.appendChild(style);
}

export function mountSidebar(items, brand) {
  const existing = document.querySelector('.app-sidebar, .side, .admin-sidebar');
  if (existing) existing.remove();
  document.body.classList.add('has-app-sidebar');
  const sidebar = document.createElement('aside');
  sidebar.className = 'app-sidebar';
  sidebar.innerHTML = `<div class="sidebar-brand">${brand}</div><img src="/assets/logo.png" alt="Thompson Christian School" class="sidebar-logo"><nav class="sidebar-nav"></nav>`;
  const nav = sidebar.querySelector('.sidebar-nav');
  items.forEach(item => {
    const link = item.tab ? document.createElement('button') : document.createElement('a');
    link.className = 'sidebar-link';
    link.textContent = item.label;
    link.dataset.icon = item.icon || '';
    if (item.tab) link.dataset.tab = item.tab;
    if (item.href) link.href = item.href;
    if (item.active) link.classList.add('active');
    if (item.tab) link.type = 'button';
    nav.appendChild(link);
  });
  nav.querySelectorAll('.sidebar-link').forEach((link, index) => {
    const icon = link.dataset.icon;
    if (icon) link.style.setProperty('--sidebar-icon', `'${icon}'`);
    link.style.setProperty('--sidebar-index', index);
  });
  const layout = document.querySelector('.layout');
  if (layout) layout.prepend(sidebar);
  else document.body.prepend(sidebar);
  return sidebar;
}

export function mountProfile(user, roleLabel, onSignOut) {
  const existing = document.querySelector('.floating-profile');
  if (existing) existing.remove();
  const profile = document.createElement('div');
  profile.className = 'floating-profile profile-menu';
  const name = user?.username || roleLabel;
  profile.innerHTML = `<button class="profile-toggle" aria-expanded="false"><span class="profile-avatar">${String(name).charAt(0).toUpperCase()}</span><span><strong>${name}</strong><small>${roleLabel}</small></span><span class="profile-chevron">⌄</span></button><div class="profile-dropdown hidden"><button class="profile-change-password"><span aria-hidden="true">⚿</span> Change Password</button><button class="profile-signout"><span aria-hidden="true">↪</span> Sign Out</button></div>`;
  document.body.appendChild(profile);
  const toggle = profile.querySelector('.profile-toggle');
  const dropdown = profile.querySelector('.profile-dropdown');
  toggle.addEventListener('click', () => {
    dropdown.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
  });
  profile.querySelector('.profile-signout').addEventListener('click', onSignOut);
  profile.querySelector('.profile-change-password').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    openPasswordModal();
  });
  showLoginNotice();
}

function openPasswordModal() {
  document.getElementById('tcsms-password-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tcsms-password-modal';
  modal.className = 'admin-modal';
  modal.innerHTML = `<div class="admin-modal-box" style="width:min(100%,420px)">
    <div class="admin-modal-head"><h3>Change Password</h3><button type="button" id="tcsms-password-close">x</button></div>
    <form id="tcsms-password-form">
      <label class="admin-full">New Password<input type="password" id="tcsms-new-password" minlength="8" required></label>
      <label class="admin-full">Confirm Password<input type="password" id="tcsms-confirm-password" minlength="8" required></label>
      <div class="admin-actions"><button type="button" id="tcsms-password-cancel" class="admin-cancel">Cancel</button><button class="admin-primary" type="submit">Update Password</button></div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#tcsms-password-close').addEventListener('click', close);
  modal.querySelector('#tcsms-password-cancel').addEventListener('click', close);
  modal.querySelector('#tcsms-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = document.getElementById('tcsms-new-password').value;
    const confirmPassword = document.getElementById('tcsms-confirm-password').value;
    if (newPassword.length < 8) return window.alert('Password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return window.alert('Passwords do not match.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return window.alert(error.message);
    close();
    window.alert('Password updated successfully.');
  });
}

// Reminds users once per browser session (i.e. each fresh login) that they can change
// their password, instead of forcing it. sessionStorage clears on sign-out/new session.
function showLoginNotice() {
  if (sessionStorage.getItem('tcsms_password_notice_shown')) return;
  sessionStorage.setItem('tcsms_password_notice_shown', 'true');
  window.setTimeout(() => {
    document.getElementById('tcsms-login-notice')?.remove();
    const modal = document.createElement('div');
    modal.id = 'tcsms-login-notice';
    modal.className = 'admin-modal';
    modal.innerHTML = `<div class="admin-modal-box" style="width:min(100%,400px);text-align:center">
      <p style="margin:0 0 16px;color:var(--ui-text);font-size:14px">Tip: you can change your password anytime from the profile menu in the top-right corner.</p>
      <div class="admin-actions" style="justify-content:center"><button type="button" class="admin-primary" id="tcsms-login-notice-ok">Got it</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#tcsms-login-notice-ok').addEventListener('click', () => modal.remove());
  }, 300);
}

export const applyRegistrarTheme = applyUiTheme;
