import { supabase } from './auth-client.js';
import { installTableSort } from './table-sort.js';
import { describeError } from './errors.js';

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
.login-panel input { display:block; width:100%; box-sizing:border-box; padding:.65rem .7rem; background:#e7ebf0; color:#172b4d; border:0; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,.18); font-size:14px }
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
.admin-sidebar { position:fixed; inset:0 auto 0 0; width:220px; z-index:90; display:flex; flex-direction:column; padding:18px 16px; background:linear-gradient(180deg,#0d5ca8 0%,#0a4d8b 100%); color:#fff }
.admin-brand { font-size:14px; font-weight:700; line-height:1.1; padding:0 8px 14px }
.admin-sidebar-logo { width:66px; height:66px; object-fit:contain; margin:0 auto 18px }
.admin-sidebar nav { display:flex; flex-direction:column; gap:0; margin-top:0 }
.admin-sidebar nav a { display:flex; align-items:center; gap:8px; padding:11px 8px; color:#dfeaff; border-bottom:1px solid rgba(255,255,255,.14); font-size:12px; font-weight:700; text-decoration:none }
.admin-sidebar nav a::before { content:'▣'; width:18px; color:currentColor; text-align:center; }
.admin-sidebar nav a:first-child::before { content:'⌂'; }
.admin-sidebar nav a.active,.admin-sidebar nav a:hover { background:#dfeeff; color:#0d5ca8 }
.admin-sidebar ~ main { margin-left:220px; max-width:none; padding:36px 36px; }
.admin-page-head h2 { margin:0; color:var(--ui-blue-dark); font-size:24px }
.admin-page-head p { margin:6px 0 0; color:var(--ui-muted) }
.admin-primary { background:var(--ui-blue); color:#fff; border:0; border-radius:5px; padding:10px 14px; cursor:pointer; font-weight:700 }
.admin-secondary { background:#eaf1ff; color:var(--ui-blue-dark); border:1px solid #c9dbfb; border-radius:5px; padding:8px 12px; cursor:pointer; font-weight:700 }
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
.admin-table-wrap td { border-bottom:1px solid #d3dce8; }
.admin-view,.admin-remove,.admin-approve { border:0; border-radius:4px; padding:6px 9px; margin-right:5px; cursor:pointer; font-size:12px }
.admin-view { background:#eaf1ff; color:var(--ui-blue-dark) }
.admin-remove { background:#fee2e2; color:var(--ui-danger) }
.admin-modal { position:fixed; inset:0; z-index:110; display:grid; place-items:center; background:rgba(7,27,58,.5); padding:20px }
.admin-modal-box { width:min(100%,520px); background:#fff; border-radius:7px; padding:20px; box-shadow:0 12px 35px rgba(7,27,58,.2) }
.admin-modal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px }
.admin-modal-head h3 { margin:0; color:var(--ui-blue-dark) }
.admin-modal-head button { border:0; background:#eaf1ff; color:var(--ui-blue-dark); border-radius:4px; padding:5px 9px; cursor:pointer }
.admin-modal-box form { display:grid; grid-template-columns:1fr 1fr; gap:14px }
.faculty-assign-box { width:min(100%, 620px) !important; }
.faculty-assign-box form { grid-template-columns:1fr; }
.assignment-list { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:0 14px; max-height:55vh; overflow:auto; border:1px solid var(--ui-border); border-radius:6px; padding:8px; }
.assignment-list .admin-check { min-width:0; }
.moderator-box { width:min(100%, 760px) !important; }
.moderator-box table { min-width:0 !important; }
.moderator-box .table-scroll { max-height:55vh; }
.moderator-picker { margin-left:8px; }
#selected-moderator { display:inline-block; margin-left:8px; }
.faculty-details-box { width:min(100%, 720px) !important; }
.schedule-box { width:min(100%,1120px) !important; max-height:88vh; overflow:auto; }
.schedule-box .admin-table-wrap table { min-width:0 !important; }
.schedule-form-box { width:min(580px, calc(100vw - 24px)) !important; max-height:calc(100vh - 24px); padding:0 !important; border-radius:18px; overflow:hidden; font-family:Arial, 'Helvetica Neue', sans-serif; }
.schedule-form-head { box-sizing:border-box; padding:24px 32px 18px; margin:0; align-items:flex-start; }
.schedule-form-head h3 { font-size:22px; letter-spacing:-.01em; }
.schedule-form-head p { margin:4px 0 0; color:var(--ui-muted); font-size:14px; }
.schedule-form-head > button { width:34px; height:34px; border-radius:10px; font-size:18px; }
.schedule-form { display:grid !important; grid-template-columns:1fr 1fr; gap:20px 16px !important; padding:4px 28px 22px; }
.schedule-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:start; gap:16px; min-width:0; }
.schedule-field { display:grid; gap:7px; min-width:0; }
.schedule-label { color:var(--ui-text); font-size:14px; font-weight:700; }
.schedule-input,.schedule-picker { width:100%; min-height:46px; border:1.5px solid var(--ui-border); border-radius:11px; background:#fff; color:var(--ui-text); font:inherit; font-size:15px; transition:border-color .15s,box-shadow .15s; }
.schedule-input { box-sizing:border-box; margin-top:0 !important; padding:0 14px !important; }
.schedule-input::placeholder,.schedule-picker-input::placeholder { color:#8a97b0; }
.schedule-input:focus,.schedule-picker:focus-within { outline:0; border-color:var(--ui-blue); box-shadow:0 0 0 4px #e6eefc; }
.schedule-hint { color:var(--ui-muted); font-size:12.5px; line-height:1.35; }
.schedule-picker { display:flex; align-items:center; gap:10px; min-width:0; box-sizing:border-box; padding:5px 5px 5px 14px; }
.schedule-picker-value { min-width:0; flex:1; display:flex; align-items:center; gap:10px; }
.schedule-picker-text { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:15px; }
.schedule-picker-text.empty { color:#8a97b0; }
.schedule-picker-input { min-width:0; width:100% !important; margin:0 !important; padding:0 !important; border:0 !important; box-shadow:none !important; font-size:15px !important; }
.schedule-pick-button { flex:none; height:36px; max-width:100%; padding:0 14px; border:0; border-radius:8px; background:#e6eefc; color:#1445ae; font:inherit; font-size:14px; font-weight:700; cursor:pointer; white-space:nowrap; }
.schedule-pick-button:hover { background:#d3e1fb; }
.schedule-days { margin:0; padding:0; border:0; min-width:0; }
.schedule-days-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:9px; }
.schedule-presets { display:flex; gap:6px; flex-wrap:wrap; }
.schedule-preset { border:0; background:none; padding:2px 8px; border-radius:6px; color:var(--ui-blue); font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.schedule-preset:hover { background:#e6eefc; }
.schedule-day-chips { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }
.schedule-chip { position:relative; min-width:0; }
.schedule-chip input { position:absolute; inset:0; opacity:0; margin:0; cursor:pointer; }
.schedule-chip span { display:grid; place-items:center; height:46px; border:1.5px solid var(--ui-border); border-radius:11px; color:var(--ui-muted); background:#fff; font-size:14px; font-weight:700; user-select:none; transition:background .12s,border-color .12s,color .12s; }
.schedule-chip:hover span { border-color:#b9c5da; }
.schedule-chip input:checked + span { border-color:var(--ui-blue); background:var(--ui-blue); color:#fff; }
.schedule-chip input:focus-visible + span { border-color:var(--ui-blue); box-shadow:0 0 0 4px #e6eefc; }
.schedule-error { min-height:0; margin-top:7px; color:var(--ui-danger); font-size:12.5px; font-weight:600; }
.schedule-summary { display:flex; align-items:center; gap:12px; padding:12px 14px; border:1px solid var(--ui-border); border-radius:11px; background:var(--ui-bg); font-size:14px; line-height:1.4; }
.schedule-summary-icon { color:var(--ui-blue); font-size:18px; }
.schedule-summary .empty { color:var(--ui-muted); }
.schedule-actions { justify-content:flex-end; gap:10px; margin:0 -28px -22px; padding:16px 28px; border-top:1px solid var(--ui-border); background:#fff; }
.schedule-button { height:44px; padding:0 22px; border-radius:11px; font:inherit; font-size:15px; font-weight:700; cursor:pointer; }
.schedule-button-ghost { border:1.5px solid var(--ui-border); background:#fff; color:var(--ui-text); }
.schedule-button-ghost:hover { background:var(--ui-bg); }
.schedule-button-primary { border:1.5px solid var(--ui-blue); background:var(--ui-blue); color:#fff; }
.schedule-button-primary:hover { border-color:#1445ae; background:#1445ae; }
.picker-box { width:min(100%, 820px) !important; }
.stack-above { z-index:120; }
.day-check-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:0 12px; border:1px solid var(--ui-border); padding:8px; margin:0; }
.day-check-grid legend { grid-column:1/-1; padding:0 4px; color:var(--ui-text); font-weight:700; }
.day-check-grid .admin-check { border-bottom:0; padding:8px 4px; }
.picker-field { display:flex; align-items:end; gap:8px; }
.picker-field input { flex:1; }
.picker-field button { flex:0 0 auto; }
.person-avatar { display:inline-grid; place-items:center; width:40px; height:40px; border-radius:50%; background:#2161d1; color:#fff; font-weight:700; vertical-align:middle; overflow:hidden; }
.person-avatar img { width:100%; height:100%; object-fit:cover; }
.moderator-card { display:flex; align-items:center; gap:10px; margin-top:8px; padding:10px; border:1px solid var(--ui-border); border-radius:6px; }
.moderator-card strong,.moderator-card small { display:block; }
.moderator-card small { color:var(--ui-muted); }
.section-box { width:min(100%,760px) !important; }
.faculty-details-box h4 { color:var(--ui-blue-dark); margin:20px 0 8px; }
.faculty-details-box ul { margin:0; padding-left:20px; color:var(--ui-text); }
.admin-modal-box label { color:var(--ui-text); font-weight:700; font-size:13px }
.admin-modal-box input,.admin-modal-box select,.admin-modal-box textarea { width:100%; box-sizing:border-box; margin-top:6px; padding:9px; border:1px solid #b9c8dc; border-radius:5px; color:var(--ui-text); background:#fff }
.admin-full,.admin-actions { grid-column:1/-1 }
.admin-actions { display:flex; justify-content:flex-end; gap:8px }
.admin-cancel { border:0; border-radius:5px; padding:10px 14px; background:#fee2e2; color:var(--ui-danger); cursor:pointer }
.profile-picture-actions { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 5px; }
.profile-crop-box { width:min(100%,420px) !important; }
.profile-crop-box canvas { display:block; width:240px; height:240px; margin:0 auto 14px; background:#102a43; border-radius:6px; }
.profile-crop-box label { display:block; margin-top:8px; }
@media (max-width:700px) { header:not(.profile-header) { margin-left:0; padding:1rem 1.25rem } .admin-sidebar { position:static; width:100%; min-height:0; display:block }.admin-sidebar nav { flex-direction:row; flex-wrap:wrap }.admin-sidebar nav a { border:0 }.admin-sidebar-logo { display:block; margin:0 auto 12px }.admin-sidebar ~ main { margin-left:0; padding:20px 14px } body.has-app-sidebar > main { margin-left:0; padding:20px 14px } .admin-page-head { align-items:flex-start; flex-direction:column } .admin-modal-box form { grid-template-columns:1fr } .assignment-list { grid-template-columns:1fr; } .moderator-picker, #selected-moderator { margin-left:0; } #selected-moderator { display:block; margin-top:8px; } .day-check-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } .picker-field { align-items:stretch; flex-direction:column; } .picker-field button { width:100%; } .schedule-form { grid-template-columns:1fr !important; padding:4px 20px 20px; } .schedule-form-head { padding:20px 20px 14px; } .schedule-day-chips { grid-template-columns:repeat(4,1fr); } .schedule-actions { margin:0 -20px -20px; padding:14px 20px; } .schedule-actions .schedule-button { flex:1; } }
@media (max-width:700px) { header:not(.profile-header) { margin-left:0; padding:1rem 1.25rem } .admin-sidebar { position:static; width:100%; min-height:0; display:block }.admin-sidebar nav { flex-direction:row; flex-wrap:wrap }.admin-sidebar nav a { border:0 }.admin-sidebar-logo { display:block; margin:0 auto 12px }.admin-sidebar ~ main { margin-left:0; padding:20px 14px } body.has-app-sidebar > main { margin-left:0; padding:20px 14px } .admin-page-head { align-items:flex-start; flex-direction:column } .admin-modal-box form { grid-template-columns:1fr } .assignment-list { grid-template-columns:1fr; } .moderator-picker, #selected-moderator { margin-left:0; } #selected-moderator { display:block; margin-top:8px; } .day-check-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } .picker-field { align-items:stretch; flex-direction:column; } .picker-field button { width:100%; } .schedule-form { grid-template-columns:1fr !important; padding:4px 20px 20px; } .schedule-row { grid-template-columns:1fr; } .schedule-form-head { padding:20px 20px 14px; } .schedule-day-chips { grid-template-columns:repeat(4,1fr); } .schedule-actions { margin:0 -20px -20px; padding:14px 20px; } .schedule-actions .schedule-button { flex:1; } }
@media (max-width:700px) { .login-layout { grid-template-columns:1fr } .login-photo { display:none } }
@media (max-width:700px) { body.has-app-sidebar > #tcsms-loading-screen { left:0 !important; width:100% !important; } }
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
  border-bottom: 1px solid #d3dce8 !important;
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
  display:flex !important;
  align-items:center;
  gap:10px;
  width:212px !important;
  min-height:53px;
  box-sizing:border-box;
  padding:6px 12px !important;
  border:1px solid #e1e8f2 !important;
  border-radius:9px !important;
  background:#fff !important;
  color: var(--ui-text) !important;
  font: 13px/1.2 Arial, 'Helvetica Neue', sans-serif !important;
  cursor:pointer;
}
.profile-toggle strong,.profile-toggle small { display:block; text-align:left; }
.profile-toggle small { margin-top:2px; color:#64748b; font-size:11px; }
.profile-avatar { display:grid; place-items:center; width:40px; height:40px; flex:0 0 40px; border-radius:50%; background:#2161d1; color:#fff; font-size:16px; font-weight:700; }
.profile-avatar img { width:40px; height:40px; border-radius:50%; object-fit:cover; }
.profile-readonly { margin:8px 0; color:var(--ui-muted); font-size:13px; }
.profile-form { display:grid !important; grid-template-columns:1fr !important; gap:14px !important; }
.profile-identity { display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:center; }
.profile-picture-preview { display:block; width:50px; height:50px; margin:0 auto 12px; border-radius:50%; object-fit:cover; border:2px solid #c9dbfb; background:#eaf1ff; }
.profile-picture-placeholder { display:grid; place-items:center; color:#1756d1; font-weight:700; font-size:18px; }
.profile-form > div:first-child { text-align:center; }
.profile-form > label { display:block; }
.profile-form > label input { box-sizing:border-box; margin-top:7px; }
.profile-form input.has-value { color:#64748b !important; font-weight:400; }
.profile-form input::placeholder { color:#64748b !important; opacity:1; font-weight:400; }
.profile-identity { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px; align-items:center; max-width:380px; margin:0 auto; text-align:left; }
.profile-identity .profile-readonly { margin:8px 0 0; }
.profile-picture-preview { display:block; width:96px; height:96px; margin:0 auto 16px; border-radius:50%; object-fit:cover; border:2px solid #c9dbfb; background:#eaf1ff; }
.profile-picture-placeholder { display:grid; place-items:center; color:#1756d1; font-weight:700; font-size:28px; }
.profile-modal-box { width:min(100%,520px) !important; }
.profile-chevron { margin-left:8px; font-size:18px; }
.floating-profile {
  position: fixed;
  top: 18px;
  right: 24px;
  z-index: 100;
}
.floating-profile .profile-toggle {
  width: 212px;
  min-height: 53px;
  justify-content: flex-start;
  box-shadow: 0 3px 12px rgba(7,27,58,.1);
}
.floating-profile .profile-toggle > span:nth-child(2) { min-width: 0; flex: 1; line-height: 1.1; }
.floating-profile .profile-toggle strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.floating-profile .profile-toggle small { display: block; margin-top: 3px; white-space: nowrap; }
.floating-profile .profile-dropdown {
  top: 55px;
  width: 212px;
  box-sizing: border-box;
}
.profile-dropdown {
  display:block !important;
  position:absolute !important;
  top:55px !important;
  right:0 !important;
  width:212px !important;
  box-sizing:border-box;
  padding:5px !important;
  border:1px solid #dbe3ef !important;
  border-radius:6px !important;
  background:#fff !important;
  box-shadow:0 5px 18px rgba(7,27,58,.14) !important;
  overflow:hidden;
}
.profile-dropdown.hidden {
  display:none !important;
}
.profile-dropdown button {
  display:block !important;
  width:100% !important;
  box-sizing:border-box;
  margin:0;
  border:0 !important;
  border-radius:4px !important;
  background:#fff !important;
  color:var(--ui-text) !important;
  padding:9px 10px !important;
  font: 12px/1.2 Arial, 'Helvetica Neue', sans-serif !important;
  text-align:left !important;
  cursor:pointer;
}
.profile-dropdown button:hover,
.profile-dropdown button:focus-visible {
  background:#eaf1ff !important;
  color:var(--ui-blue) !important;
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
/* ---- Sidebar: blue, with the active tab flooding into the page ----
   The active tab uses the same color as the page body (--ui-bg) and two
   curved "fillets" above and below it round off the blue, so the tab reads
   as part of the main area. Change the colors in the variables below.        */
.app-sidebar {
  --sidebar-bg: #091c3c;
  --sidebar-bg-end: #091c3c;
  --sidebar-text: #fff;
  --sidebar-unselected: #091c3c;
  --sidebar-active-text: #091c3c; /* active link color           */
  --sidebar-rail: 48px;
  --sidebar-curve: 20px;          /* radius of the curved corners */
  width: 244px;
  min-height: 100vh;
  box-sizing: border-box;
  position: relative;
  overflow-x: hidden;
  overflow-y: hidden;
  background: linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-bg-end) 100%);
  color: #fff;
  padding: 18px 0;
  border-radius: 0 24px 24px 0;
}
.app-sidebar .sidebar-brand {
  position: relative;
  z-index: 1;
  min-height: 0;
  margin: 0;
  padding: 0 18px 24px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.12;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-sizing: border-box;
}
.app-sidebar .sidebar-logo {
  position: static;
  z-index: 2;
  width: 145px;
  height: 145px;
  object-fit: contain;
  display: block;
  margin: 0 auto 12px;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.25));
}
.app-sidebar .sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 0;
  padding: 18px 0 16px 0;
  background: transparent;
  min-height: calc(100vh - 120px);
}
.app-sidebar .sidebar-link {
  position: relative;
  display: grid;
  grid-template-columns: var(--sidebar-rail) minmax(0, 1fr);
  align-items: center;
  width: calc(100% - 12px);       /* runs all the way to the sidebar's right edge */
  min-height: 36px;
  box-sizing: border-box;
  margin-left: 12px;
  padding: 0 16px 0 0;
  border: 0;
  background: transparent;
  color: var(--sidebar-text);
  background: var(--sidebar-unselected);
  font: 700 14px/1.2 Arial, 'Helvetica Neue', sans-serif;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  border-radius: 999px 0 0 999px;
  transition: transform .18s ease, background-color .18s ease, color .18s ease;
}
.app-sidebar .sidebar-link .sidebar-icon {
  z-index: 1;
  display: grid;
  place-items: center;
  width: var(--sidebar-rail);
  height: 36px;
  color: inherit;
  font-weight: 600;
  text-align: center;
}
.app-sidebar .sidebar-link .sidebar-icon svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.app-sidebar .sidebar-link:hover:not(.active) {
  background: #122b55;
  transform: translateX(3px);
}
.app-sidebar .sidebar-link:focus-visible {
  outline: 2px solid #bcd3ff;
  outline-offset: -3px;
}
.app-sidebar .sidebar-link .sidebar-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Active tab: same color as the page, so it merges with the main area */
.app-sidebar .sidebar-link.active {
  z-index: 2;
  color: var(--sidebar-active-text);
  background: var(--ui-bg);
  animation: sidebar-tab-in .28s ease both;
}
@keyframes sidebar-tab-in {
  from { opacity: 1; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .app-sidebar .sidebar-link,
  .app-sidebar .sidebar-link.active { animation: none; transition: none; }
}
.app-sidebar .sidebar-link.active::before,
.app-sidebar .sidebar-link.active::after {
  content: "";
  position: absolute;
  right: 0;
  width: var(--sidebar-curve);
  height: var(--sidebar-curve);
  pointer-events: none;
}
/* curve above the tab: quarter-circle left transparent so the blue shows through */
.app-sidebar .sidebar-link.active::before {
  top: calc(var(--sidebar-curve) * -1);
  background: radial-gradient(circle at 0 0,
    transparent calc(var(--sidebar-curve) - 0.5px), var(--ui-bg) var(--sidebar-curve));
}
/* curve below the tab */
.app-sidebar .sidebar-link.active::after {
  bottom: calc(var(--sidebar-curve) * -1);
  background: radial-gradient(circle at 0 100%,
    transparent calc(var(--sidebar-curve) - 0.5px), var(--ui-bg) var(--sidebar-curve));
}
body.has-app-sidebar > header { display:none; }
body.has-app-sidebar > main { margin-left:244px; max-width:none; padding:36px 36px; }
body.has-app-sidebar > .app-sidebar { position:fixed; inset:0 auto 0 0; z-index:90; }
/* Mobile: sidebar becomes a top bar with wrapped pill links.
   Placed AFTER the desktop rules above so it actually overrides them. */
@media (max-width:700px) {
  .app-sidebar,
  body.has-app-sidebar > .app-sidebar { position: static; width: 100%; min-height: 0; overflow: visible; }
  body.has-app-sidebar > main { margin-left: 0; padding: 20px 14px; }
  body.has-app-sidebar > #tcsms-loading-screen { left: 0 !important; width: 100% !important; }
  .app-sidebar .sidebar-brand { min-height: 64px; padding: 14px 60px 14px 16px; font-size: 15px; }
  .app-sidebar .sidebar-logo { margin: 0 auto 8px; width: 42px; height: 42px; }
  .app-sidebar .sidebar-nav { flex-direction: row; flex-wrap: wrap; gap: 8px; min-height: 0; padding: 4px 12px 14px; overflow: hidden; }
  .app-sidebar .sidebar-link { flex: 1 1 180px; width: auto; margin-left: 0; min-height: 40px; grid-template-columns: 36px auto; padding-right: 16px; border-radius: 999px; font-size: 14px; }
  .app-sidebar .sidebar-link .sidebar-icon { width: 36px; height: 40px; }
  .app-sidebar .sidebar-link.active::before,
  .app-sidebar .sidebar-link.active::after { display: none; }
}
.spam-guard-cooling { opacity: .6; cursor: not-allowed !important; pointer-events: none; }
.review-box { width: min(100%, 560px); }
.review-summary { margin-bottom: 14px; }
.review-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 14px; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: 6px; }
.review-grid small { display: block; color: var(--ui-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.review-grid p { margin: 4px 0 0; color: var(--ui-text); font-weight: 600; }
.enrollee-details-grid { max-height:45vh; overflow:auto; }
.document-list { margin:8px 0 0; padding-left:20px; color:var(--ui-text); }
.document-list a { color:var(--ui-blue); font-weight:700; }
.audit-export-controls { display:flex; align-items:center; gap:8px; }
.audit-export-controls input { margin:0; padding:8px; border:1px solid #b9c8dc; border-radius:5px; color:var(--ui-text); }
.audit-export-note { color:var(--ui-muted); font-size:12px; }
.audit-print-area { display:none; }
@media print {
  body.printing-audit > *:not(.audit-print-area) { display:none !important; }
  body.printing-audit .audit-print-area { display:block !important; padding:24px; color:#111; }
  body.printing-audit .audit-print-area table { width:100%; border-collapse:collapse; }
  body.printing-audit .audit-print-area th, body.printing-audit .audit-print-area td { padding:8px; border-bottom:1px solid #cbd5e1; text-align:left; font-size:11px; }
}
.review-countdown { margin: 10px 0 0; padding: 9px 12px; background: #fff4d6; color: var(--ui-warning); border-radius: 5px; font-size: 12px; font-weight: 700; }
.admin-actions button[disabled] { opacity: .55; cursor: not-allowed; }
.admin-modal-box textarea { width:100%; box-sizing:border-box; margin-top:6px; padding:9px; border:1px solid #b9c8dc; border-radius:5px; color:var(--ui-text); background:#fff; resize:vertical; min-height:72px; max-height:160px; font:inherit; }

/* Enrollment / application status colours. Class names match statusBadge():
   lowercased with spaces replaced by hyphens.
   students.enrollment_status allows Enrolled | Pending | Graduated | Transferred
   (students_enrollment_status_check), so 'inactive'/'dropped' only ever appear on
   enrollments.status, never on a student. */
.badge { background:#eef2f7; color:var(--ui-muted); }
.badge.active, .badge.enrolled, .badge.approved, .badge.completed, .badge.present { background:#dcfce7; color:#166534; }
.badge.pending, .badge.submitted, .badge.under_review, .badge.under-review, .badge.draft, .badge.late, .badge.incomplete { background:#fef3c7; color:#92400e; }
.badge.inactive, .badge.rejected, .badge.dropped, .badge.absent, .badge.retained, .badge.held { background:#fee2e2; color:#991b1b; }
.badge.graduated, .badge.transferred, .badge.promoted { background:#dbeafe; color:#1e40af; }

/* Colour-coded action buttons (used with .small / .btn / .admin-*); modal buttons live
   outside .main, so the selectors must not be scoped to it. */
button.btn-view, .admin-view { background:#eaf1ff !important; color:#1756d1 !important; border:1px solid #c9dbfb !important; }
button.btn-review { background:#fff4d6 !important; color:#b7791f !important; border:1px solid #f2dfae !important; }
button.btn-approve, .admin-approve { background:#e7f6ec !important; color:#16834b !important; border:1px solid #bfe3cd !important; font-weight:700 !important; }
button.btn-remove, .admin-remove { background:#fee2e2 !important; color:#c0392b !important; border:1px solid #f6c9c9 !important; }
/* Modal actions sit outside .main: give them explicit colours, including disabled state. */
.modal .btn.danger { background:#b91c1c !important; color:#fff !important; border:1px solid #991b1b !important; }
.modal button:disabled { opacity:.65; cursor:not-allowed; }
.modalbox { max-height:90vh; overflow:auto; }
.modalbox > .modalhead,
.admin-modal-box > .admin-modal-head {
  position:sticky;
  top:-20px;
  z-index:2;
  padding:20px 0 12px;
  margin-top:-20px;
  background:#fff;
}
.admin-modal-box > .admin-modal-head { top:-20px; }
.academic-history-box { width:min(100%, 1040px) !important; }
.academic-profile-summary { display:flex; gap:22px; align-items:flex-start; margin:4px 0 22px; }
.academic-profile-summary .review-grid { flex:1; margin:0; }
.academic-profile-photo { width:148px; height:148px; flex:0 0 148px; border-radius:8px; object-fit:cover; border:1px solid var(--ui-border); background:#eaf1ff; }
.academic-profile-photo.photo-preview-empty { display:grid; place-items:center; color:var(--ui-muted); font-size:12px; text-align:center; }
.camera-box { width:min(100%, 560px) !important; }
.camera-box video { display:block; width:100%; max-height:65vh; object-fit:cover; border-radius:6px; background:#071b3a; }
.camera-box .admin-actions { margin-top:14px; }
.selected-row { background:#eaf1ff; }
.table-scroll { overflow:auto; max-height:360px; }
.shift-student-picker table { min-width:0 !important; }
.exclude-list input[type=checkbox] { width:auto; }
.exclude-list label { display:block; padding:3px 0; font-weight:400; }
.academic-scroll { overflow-x:auto; }
.academic-scroll input { min-width:65px; }


/* Sortable table headers */
th.sortable { cursor:pointer; user-select:none; }
th.sortable::after { content:'⇅'; margin-left:6px; font-size:10px; opacity:.55; }
th.sortable.sort-asc::after { content:'▲'; opacity:1; }
th.sortable.sort-desc::after { content:'▼'; opacity:1; }
th.sortable:focus-visible { outline:2px solid #f0b429; outline-offset:-2px; }

/* Profile picture fields and previews */
.photo-field { display:flex; align-items:center; gap:14px; margin-top:6px; }
.photo-field input[type=file] { margin-top:0; }
.photo-preview { width:96px; height:96px; flex:0 0 96px; border-radius:50%; object-fit:cover; border:1px solid var(--ui-border); background:#eaf1ff; }
.photo-preview-empty { display:grid; place-items:center; border-style:dashed; color:var(--ui-muted); font-size:11px; text-align:center; }
.student-profile { display:flex; gap:16px; align-items:flex-start; margin:15px 0; }
.student-profile .review-grid { margin:0; flex:1; }
.modalbox h3 { color:var(--ui-blue-dark); margin:18px 0 8px; font-size:15px; }
.modalbox table { width:100%; border-collapse:collapse; }
.modalbox th, .modalbox td { text-align:left; padding:8px; border-bottom:1px solid var(--ui-border); font-size:12px; }
.modalbox td { border-bottom-color:#d3dce8; }
/* Registrar academic record card: printed from the page itself (see printAcademicCard). */
.academic-print-card { display: none; }
.report-print-card { display: none; }
.transcript-print-card { display: none; }
@media print {
  @page { size: A4; margin: 12mm; }
  body.printing-card > *:not(.academic-print-card) { display: none !important; }
  body.printing-card .academic-print-card { display: block !important; padding: 18px; border: 2px solid var(--ui-navy); border-radius: 10px; background: #fff; }
  body.printing-report-card > *:not(.report-print-card) { display: none !important; }
  body.printing-report-card .report-print-card { display: block !important; padding: 18px; border: 2px solid var(--ui-navy); border-radius: 10px; background: #fff; }
  body.printing-transcript > *:not(.transcript-print-card) { display: none !important; }
  body.printing-transcript .transcript-print-card { display: block !important; padding: 18px; border: 2px solid var(--ui-navy); border-radius: 10px; background: #fff; }
}
.modalbox th { background:var(--ui-navy); color:#fff; }
.login-panel .app-version { margin:14px 0 0; text-align:center; color:#93a7c4; font-size:11px; letter-spacing:.03em; }
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

function installGlobalErrorHandler() {
  if (window.__tcsmsErrorHandlerInstalled) return;
  window.__tcsmsErrorHandlerInstalled = true;
  window.addEventListener('unhandledrejection', event => {
    event.preventDefault();
    const toast = document.getElementById('toast') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'toast' });
    toast.className = 'toast error';
    toast.textContent = describeError(event.reason, 'Operation');
    setTimeout(() => toast.classList.add('hidden'), 6000);
  });
  window.addEventListener('error', event => {
    if (!event.error) return;
    const toast = document.getElementById('toast') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'toast' });
    toast.className = 'toast error';
    toast.textContent = describeError(event.error, 'Page');
    setTimeout(() => toast.classList.add('hidden'), 6000);
  });
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
  if (!document.getElementById('shared-ui-theme')) {
    const style = document.createElement('style');
    style.id = 'shared-ui-theme';
    style.textContent = sharedTheme;
    document.head.appendChild(style);
  }
  installSpamGuard();
  installTableSort();
  installGlobalErrorHandler();
}

export function mountSidebar(items, brand) {
  const icons = {
    '⌂': '<svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path></svg>',
    '▣': '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 8h8v8H8z"></path></svg>',
    '♙': '<svg viewBox="0 0 24 24"><path d="M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"></path><path d="m8 20 1-6 3-2 3 2 1 6"></path><path d="M6 20h12"></path></svg>',
    '▤': '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16"></rect><path d="M8 8h8M8 12h8M8 16h8"></path></svg>',
    '♧': '<svg viewBox="0 0 24 24"><path d="M12 20v-5"></path><path d="M12 15a4 4 0 1 0-3-6 4 4 0 1 0 3 6Z"></path><path d="M12 15a4 4 0 1 0 3-6 4 4 0 1 0-3 6Z"></path></svg>',
    '☷': '<svg viewBox="0 0 24 24"><path d="M4 6h4M12 6h8M4 12h8M16 12h4M4 18h4M12 18h8"></path></svg>'
  };
  const existing = document.querySelector('.app-sidebar, .side, .admin-sidebar');
  if (existing) existing.remove();
  document.body.classList.add('has-app-sidebar');
  const sidebar = document.createElement('aside');
  sidebar.className = 'app-sidebar';
  sidebar.innerHTML = `<img src="/assets/logo.png" alt="Thompson Christian School" class="sidebar-logo"><div class="sidebar-brand">${brand}</div><nav class="sidebar-nav"></nav>`;
  const nav = sidebar.querySelector('.sidebar-nav');
  items.forEach(item => {
    const link = item.tab ? document.createElement('button') : document.createElement('a');
    link.className = 'sidebar-link';
    link.innerHTML = `<span class="sidebar-icon" aria-hidden="true">${icons[item.icon] || icons['▣']}</span><span class="sidebar-label"></span>`;
    link.querySelector('.sidebar-label').textContent = item.label;
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
  const safeName = String(name).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  const safeRole = String(roleLabel).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  profile.innerHTML = `<button class="profile-toggle" aria-expanded="false"><span class="profile-avatar">${safeName.charAt(0).toUpperCase()}</span><span><strong>${safeName}</strong><small>${safeRole}</small></span><span class="profile-chevron">⌄</span></button><div class="profile-dropdown hidden"><button class="profile-edit"><span aria-hidden="true">✎</span> Edit Profile</button><button class="profile-change-password"><span aria-hidden="true">⚿</span> Change Password</button><button class="profile-signout"><span aria-hidden="true">↪</span> Sign Out</button></div>`;
  document.body.appendChild(profile);
  const toggle = profile.querySelector('.profile-toggle');
  const dropdown = profile.querySelector('.profile-dropdown');
  toggle.addEventListener('click', () => {
    dropdown.classList.toggle('hidden');
    toggle.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
  });
  document.addEventListener('click', event => {
    if (profile.contains(event.target)) return;
    dropdown.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    dropdown.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
  });
  profile.querySelector('.profile-signout').addEventListener('click', onSignOut);
  profile.querySelector('.profile-edit').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    openProfileModal(user, roleLabel, profile);
  });
  profile.querySelector('.profile-change-password').addEventListener('click', () => {
    dropdown.classList.add('hidden');
    openPasswordModal();
  });
  const avatar = profile.querySelector('.profile-avatar');
  const setAvatar = (url, firstName, lastName) => {
    avatar.textContent = '';
    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      image.width = 40;
      image.height = 40;
      avatar.appendChild(image);
      return;
    }
    const initials = [firstName, lastName].filter(Boolean).map(value => value.trim().charAt(0)).join('').toUpperCase();
    avatar.textContent = initials || safeName.charAt(0).toUpperCase();
  };
  const loadAvatar = async () => {
    const profileResult = user.student_id
      ? await supabase.from('students').select('first_name,last_name,profile_picture_url').eq('student_id', user.student_id).maybeSingle()
      : Number(user.role_id) === 1
        ? await supabase.from('admins').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle()
        : await supabase.from('staff_profiles').select('first_name,last_name').eq('user_id', user.user_id).maybeSingle();
    const accountResult = await supabase.from('users').select('profile_picture_url').eq('user_id', user.user_id).maybeSingle();
    const data = profileResult.data || {};
    setAvatar(data.profile_picture_url || accountResult.data?.profile_picture_url, data.first_name, data.last_name);
  };
  loadAvatar();
  showLoginNotice();
}

function openProfileModal(user, roleLabel, profile) {
  document.getElementById('tcsms-profile-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'tcsms-profile-modal';
  modal.className = 'admin-modal';
  const safeRole = String(roleLabel).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  modal.innerHTML = `<div class="admin-modal-box profile-modal-box">
    <div class="admin-modal-head"><h3>Edit Profile</h3><button type="button" id="tcsms-profile-close">x</button></div>
    <form id="tcsms-profile-form" class="profile-form" novalidate>
      <div><img id="tcsms-profile-preview" class="profile-picture-preview" alt="Current profile picture"><div class="profile-identity"><p class="profile-readonly"><b>Username:</b> ${String(user?.username || '-')}</p><p class="profile-readonly"><b>Role:</b> ${safeRole}</p></div></div>
      <label class="admin-full">First Name<input id="tcsms-profile-first-name" maxlength="80" required></label>
      <label class="admin-full">Middle Name<input id="tcsms-profile-middle-name" maxlength="80"></label>
      <label class="admin-full">Last Name<input id="tcsms-profile-last-name" maxlength="80" required></label>
      <label class="admin-full">Email<input id="tcsms-profile-email" type="email" data-current="${String(user?.email || '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))}" placeholder="${String(user?.email || '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]))}" required></label>
      <div class="admin-full"><label>Profile Picture</label><div class="profile-picture-actions"><input id="tcsms-profile-picture" type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="admin-view" id="tcsms-profile-upload">Upload Image</button><button type="button" class="admin-view" id="tcsms-profile-camera">Use Camera</button><button type="button" class="admin-cancel" id="tcsms-profile-remove">Remove Existing</button></div><small>Images are cropped and saved as 50x50 pixels.</small></div>
      <div class="admin-actions"><button type="button" id="tcsms-profile-cancel" class="admin-cancel">Cancel</button><button class="admin-primary" type="submit">Confirm Changes</button></div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  const setProfilePicture = url => {
    const avatar = profile.querySelector('.profile-avatar');
    const preview = modal.querySelector('#tcsms-profile-preview');
    if (url) { preview.src = url; preview.classList.remove('profile-picture-placeholder'); }
    else { preview.removeAttribute('src'); preview.classList.add('profile-picture-placeholder'); preview.alt = 'No profile picture'; preview.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'%3E%3Ccircle cx='25' cy='25' r='25' fill='%23eaf1ff'/%3E%3Ctext x='25' y='32' text-anchor='middle' fill='%231756d1' font-size='22' font-family='Arial'%3E${String(user?.username || roleLabel).charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E`; }
    avatar.textContent = '';
    if (url) { const image = document.createElement('img'); image.src = url; image.alt = ''; image.width = 40; image.height = 40; avatar.appendChild(image); }
    else avatar.textContent = String(user?.username || roleLabel).charAt(0).toUpperCase();
  };
  const loadProfile = async () => {
    const profileResult = user.student_id
      ? await supabase.from('students').select('first_name,middle_name,last_name,profile_picture_url').eq('student_id', user.student_id).maybeSingle()
      : Number(user.role_id) === 1
        ? await supabase.from('admins').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle()
        : await supabase.from('staff_profiles').select('first_name,middle_name,last_name').eq('user_id', user.user_id).maybeSingle();
    const pictureResult = await supabase.from('users').select('profile_picture_url').eq('user_id', user.user_id).maybeSingle();
    if (profileResult.error) return window.alert(`Could not load your profile details: ${profileResult.error.message}`);
    if (pictureResult.error) return window.alert(`Could not load your profile picture: ${pictureResult.error.message}`);
    const data = profileResult.data || {};
    [['#tcsms-profile-first-name', data.first_name], ['#tcsms-profile-middle-name', data.middle_name], ['#tcsms-profile-last-name', data.last_name]].forEach(([selector, value]) => {
      const input = modal.querySelector(selector);
      input.dataset.current = value || '';
      input.placeholder = value || '';
      input.classList.toggle('has-value', Boolean(value));
    });
    const email = modal.querySelector('#tcsms-profile-email');
    email.classList.add('has-value');
    setProfilePicture(data.profile_picture_url || pictureResult.data?.profile_picture_url);
  };
  modal.querySelectorAll('#tcsms-profile-first-name, #tcsms-profile-middle-name, #tcsms-profile-last-name, #tcsms-profile-email').forEach(input => {
    input.addEventListener('input', () => input.classList.toggle('has-value', Boolean(input.value.trim())));
    input.addEventListener('focus', () => {
      if (!input.value && input.dataset.current) input.dataset.current = '';
    }, { once: false });
  });
  loadProfile();
  const close = () => modal.remove();
  modal.querySelector('#tcsms-profile-close').addEventListener('click', close);
  modal.querySelector('#tcsms-profile-cancel').addEventListener('click', close);
  modal.querySelector('#tcsms-profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const valueFor = selector => { const input = modal.querySelector(selector); return input.value.trim() || input.dataset.current || ''; };
    const firstName = valueFor('#tcsms-profile-first-name');
    const middleName = valueFor('#tcsms-profile-middle-name');
    const lastName = valueFor('#tcsms-profile-last-name');
    const email = valueFor('#tcsms-profile-email');
    if (!firstName || !lastName || !email) return window.alert('Enter your name and email.');
    const result = await confirmProfileChange(user.email, () => supabase.rpc('submit_profile_change', { p_first_name: firstName, p_middle_name: middleName || null, p_last_name: lastName, p_email: email }));
    if (!result) return;
    if (modal.profilePictureBlob) {
      const picture = modal.profilePictureBlob;
      const path = `users/${user.user_id}/${crypto.randomUUID()}-${picture.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const upload = await supabase.storage.from('profile-pictures').upload(path, picture, { upsert: false });
      if (upload.error) return window.alert(upload.error.message);
      const publicUrl = supabase.storage.from('profile-pictures').getPublicUrl(path).data.publicUrl;
      const pictureResult = await supabase.rpc('update_own_profile_picture', { p_url: publicUrl });
      if (pictureResult.error) return window.alert(pictureResult.error.message);
      setProfilePicture(publicUrl);
    }
    close();
    window.alert('Profile changes submitted for administrator approval.');
  });
  const cropImage = (source, name = 'profile.png') => new Promise(resolve => {
    const crop = document.createElement('div');
    crop.className = 'admin-modal';
    crop.innerHTML = `<div class="admin-modal-box profile-crop-box"><div class="admin-modal-head"><h3>Crop Profile Picture</h3><button type="button" data-crop-close>x</button></div><canvas width="240" height="240" id="tcsms-crop-canvas"></canvas><label>Zoom<input type="range" id="tcsms-crop-zoom" min="1" max="3" step="0.01" value="1"></label><label>Horizontal Position<input type="range" id="tcsms-crop-x" min="0" max="100" value="50"></label><label>Vertical Position<input type="range" id="tcsms-crop-y" min="0" max="100" value="50"></label><div class="admin-actions"><button type="button" class="admin-cancel" data-crop-cancel>Cancel</button><button type="button" class="admin-primary" data-crop-save>Use Cropped Image</button></div></div>`;
    document.body.appendChild(crop);
    const canvas = crop.querySelector('canvas'); const context = canvas.getContext('2d');
    const draw = () => { const zoom = Number(crop.querySelector('#tcsms-crop-zoom').value); const side = Math.min(source.width, source.height) / zoom; const left = (source.width - side) * Number(crop.querySelector('#tcsms-crop-x').value) / 100; const top = (source.height - side) * Number(crop.querySelector('#tcsms-crop-y').value) / 100; context.clearRect(0, 0, 240, 240); context.drawImage(source, left, top, side, side, 0, 0, 240, 240); };
    crop.querySelectorAll('input').forEach(input => input.addEventListener('input', draw)); draw();
    const close = () => { crop.remove(); resolve(null); };
    crop.querySelector('[data-crop-close]').onclick = crop.querySelector('[data-crop-cancel]').onclick = close;
    crop.querySelector('[data-crop-save]').onclick = () => canvas.toBlob(blob => { crop.remove(); resolve(new File([blob], name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' })); }, 'image/png');
  });
  const chooseImage = file => { if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return window.alert('Use PNG, JPG, or WEBP for the profile picture.'); const image = new Image(); image.onload = async () => { modal.profilePictureBlob = await cropImage(image, file.name); }; image.src = URL.createObjectURL(file); };
  modal.querySelector('#tcsms-profile-upload').onclick = () => modal.querySelector('#tcsms-profile-picture').click();
  modal.querySelector('#tcsms-profile-picture').onchange = event => chooseImage(event.target.files?.[0]);
  modal.querySelector('#tcsms-profile-camera').onclick = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ video: true }); const camera = document.createElement('div'); camera.className = 'admin-modal'; camera.innerHTML = `<div class="admin-modal-box camera-box"><div class="admin-modal-head"><h3>Take Profile Picture</h3><button type="button" data-camera-close>x</button></div><video autoplay playsinline style="width:100%"></video><div class="admin-actions"><button type="button" class="admin-cancel" data-camera-cancel>Cancel</button><button type="button" class="admin-primary" data-camera-capture>Capture</button></div></div>`; document.body.appendChild(camera); const video = camera.querySelector('video'); video.srcObject = stream; const stop = () => { stream.getTracks().forEach(track => track.stop()); camera.remove(); }; camera.querySelector('[data-camera-close]').onclick = camera.querySelector('[data-camera-cancel]').onclick = stop; camera.querySelector('[data-camera-capture]').onclick = async () => { const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0); const image = new Image(); image.onload = async () => { stop(); modal.profilePictureBlob = await cropImage(image); }; image.src = canvas.toDataURL('image/png'); }; } catch { window.alert('Camera access was not available.'); } };
  modal.querySelector('#tcsms-profile-remove').onclick = async () => { const result = await confirmProfileChange(user.email, () => supabase.rpc('remove_own_profile_picture')); if (result) { setProfilePicture(null); window.alert('Profile picture removed.'); } };
}

function confirmProfileChange(email, action) {
  return new Promise(resolve => {
    const prompt = document.createElement('div'); prompt.className = 'admin-modal';
    prompt.innerHTML = `<div class="admin-modal-box" style="width:min(100%,420px)"><div class="admin-modal-head"><h3>Confirm Changes</h3><button type="button" data-password-close>x</button></div><p>Enter your password to confirm this change.</p><input type="password" data-profile-password autocomplete="current-password"><div class="admin-actions"><button type="button" class="admin-cancel" data-password-cancel>Cancel</button><button type="button" class="admin-primary" data-password-confirm>Confirm</button></div></div>`;
    document.body.appendChild(prompt);
    const close = () => { prompt.remove(); resolve(null); };
    prompt.querySelector('[data-password-close]').onclick = prompt.querySelector('[data-password-cancel]').onclick = close;
    prompt.querySelector('[data-password-confirm]').onclick = async () => { const password = prompt.querySelector('[data-profile-password]').value; if (!password) return window.alert('Enter your password.'); const confirmation = await supabase.auth.signInWithPassword({ email, password }); if (confirmation.error) return window.alert('Password verification failed.'); const result = await action(); prompt.remove(); resolve(result.error ? (window.alert(result.error.message), null) : result); };
    prompt.querySelector('[data-profile-password]').focus();
  });
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
