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
  background: url('/bg.jpg') center / cover no-repeat;
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
header:not(.profile-header) { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1.25rem 2rem; background:var(--ui-navy); color:#fff }
header:not(.profile-header) h1 { margin:0; font-size:22px }
header:not(.profile-header) button { padding:.65rem 1rem; border:0; border-radius:6px; background:#fff; color:var(--ui-blue-dark); font-weight:600; cursor:pointer }
header:not(.profile-header) + main { max-width:960px; margin:2rem auto; padding:0 1.25rem }
.welcome { padding:2rem; background:#fff; border-radius:8px; box-shadow:0 4px 20px rgba(7,27,58,.08) }
.welcome h2 { color:var(--ui-blue-dark); font-size:22px }
.admin-page-head { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:18px }
.admin-sidebar { position:fixed; inset:0 auto 0 0; width:198px; z-index:90; display:flex; flex-direction:column; padding:22px 16px; background:var(--ui-navy); color:#fff }
.admin-brand { font-size:15px; font-weight:700; line-height:1.15; padding:0 8px 24px; border-bottom:1px solid rgba(255,255,255,.16) }
.admin-sidebar nav { display:flex; flex-direction:column; gap:0; margin-top:12px }
.admin-sidebar nav a { padding:11px 8px; color:#e5eefc; border-bottom:1px solid rgba(255,255,255,.12); font-size:12px; text-decoration:none }
.admin-sidebar nav a.active,.admin-sidebar nav a:hover { background:#17417e; color:#fff }
.admin-sidebar-logo { width:70px; height:70px; object-fit:contain; margin:auto auto 10px }
.admin-sidebar ~ main { margin-left:198px; max-width:none; padding:38px 36px; }
.admin-page-head h2 { margin:0; color:var(--ui-blue-dark); font-size:24px }
.admin-page-head p { margin:6px 0 0; color:var(--ui-muted) }
.admin-primary { background:var(--ui-blue); color:#fff; border:0; border-radius:5px; padding:10px 14px; cursor:pointer; font-weight:700 }
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
@media (max-width:700px) { .admin-sidebar { position:static; width:100%; min-height:0; display:block }.admin-sidebar nav { flex-direction:row; flex-wrap:wrap }.admin-sidebar nav a { border:0 }.admin-sidebar-logo { display:none }.admin-sidebar ~ main { margin-left:0; padding:20px 14px }.admin-page-head { align-items:flex-start; flex-direction:column } .admin-modal-box form { grid-template-columns:1fr } }
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
  color: var(--ui-text) !important;
  font-size: 13px !important;
}
.floating-profile {
  position: fixed;
  top: 18px;
  right: 24px;
  z-index: 100;
}
.floating-profile .profile-toggle {
  min-width: 160px;
  box-shadow: 0 3px 12px rgba(7,27,58,.1);
}
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
`;

export function applyUiTheme() {
  if (document.getElementById('shared-ui-theme')) return;
  const style = document.createElement('style');
  style.id = 'shared-ui-theme';
  style.textContent = sharedTheme;
  document.head.appendChild(style);
}

export function mountProfile(user, roleLabel, onSignOut) {
  const existing = document.querySelector('.floating-profile');
  if (existing) existing.remove();
  const profile = document.createElement('div');
  profile.className = 'floating-profile profile-menu';
  const name = user?.username || roleLabel;
  profile.innerHTML = `<button class="profile-toggle" aria-expanded="false"><span class="profile-avatar">${String(name).charAt(0).toUpperCase()}</span><span><strong>${name}</strong><small>${roleLabel}</small></span><span class="profile-chevron">⌄</span></button><div class="profile-dropdown hidden"><button class="profile-signout"><span aria-hidden="true">↪</span> Sign Out</button></div>`;
  document.body.appendChild(profile);
  const toggle = profile.querySelector('.profile-toggle');
  const dropdown = profile.querySelector('.profile-dropdown');
  toggle.addEventListener('click', () => {
    dropdown.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
  });
  profile.querySelector('.profile-signout').addEventListener('click', onSignOut);
}

export const applyRegistrarTheme = applyUiTheme;
