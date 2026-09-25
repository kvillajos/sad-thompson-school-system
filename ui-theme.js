import { installTableSort } from './table-sort.js';
import { installTablePages } from './table-pages.js';
import { installTableCopy } from './table-copy.js';
import { describeError } from './errors.js';

const sharedTheme = /* css */ `
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
.toast { position:fixed; right:20px; bottom:20px; z-index:10000; max-width:min(420px, calc(100vw - 40px)); padding:13px 17px; border-radius:10px; background:#166534; color:#fff; box-shadow:0 8px 24px rgba(7,27,58,.18); font-weight:700; }
.toast.error { background:#b91c1c; }
button:not(:disabled) { transition:filter .15s ease; }
button:not(:disabled):hover { filter:brightness(0.96); }
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
.admin-page-head { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:18px; padding-right:236px }
.admin-page-head h2 { margin:0; color:var(--ui-blue-dark); font-size:24px }
.admin-page-head p { margin:6px 0 0; color:var(--ui-muted) }
.admin-primary { background:var(--ui-blue); color:#fff; border:1px solid var(--ui-blue); border-radius:11px; padding:9px 14px; font-size:14px; line-height:1.3; cursor:pointer; font-weight:700 }
button.admin-primary[id^="add-"]:hover { background:#1445ae; box-shadow:0 6px 12px rgba(23,86,209,.2); transform:translateY(-1px) scale(1.02); }
.admin-secondary { display:inline-block; background:#eaf1ff; color:var(--ui-blue-dark); border:1px solid #c9dbfb; border-radius:11px; padding:9px 14px; font-size:14px; line-height:1.3; text-decoration:none; cursor:pointer; font-weight:700 }
.admin-filterbar { display:flex; flex-wrap:wrap; gap:10px; margin:0 0 14px }
.admin-filterbar input,.admin-filterbar select { min-width:180px; padding:10px 12px; border:1px solid #b9c8dc; border-radius:11px; color:var(--ui-text); background:#fff }
.admin-filterbar .admin-action { margin-left:auto }
.filterbar { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px }
.filterbar input,.filterbar select { margin:0; padding:9px; font-size:12px; max-width:220px }
.admin-checklist { display:grid; gap:0 }
.admin-check { display:flex; align-items:center; gap:10px; padding:12px 8px; border-bottom:1px solid var(--ui-border); color:var(--ui-text); font-weight:600 }
.admin-check input { width:auto; margin:0 }
.admin-check:last-child { border-bottom:0 }
.admin-summary-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; align-items:start }
.admin-summary-grid > .admin-table-wrap { margin-top:0 }
.admin-summary-grid .card { background:var(--ui-bg); border-radius:12px; padding:14px 16px }
.stat { margin-top:4px; color:var(--ui-blue); font-size:28px; font-weight:800 }
.student-card { grid-column:span 2; display:flex; gap:22px; align-items:flex-start }
.student-card-photo { display:grid; place-items:center; flex:0 0 112px; width:112px; height:112px; border-radius:50%; overflow:hidden; background:var(--ui-blue); color:#fff; font-size:34px; font-weight:700 }
.student-card-photo img { width:100%; height:100%; object-fit:cover }
.student-card-body { flex:1; min-width:0 }
.student-card-head { display:flex; align-items:center; flex-wrap:wrap; gap:10px }
.student-card-head h3 { margin:0; color:var(--ui-blue-dark); font-size:20px }
.student-card-id { margin:4px 0 16px; color:var(--ui-muted) }
.student-card-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px 22px; margin:0 }
.student-card-grid dt { color:var(--ui-muted); font-size:12px; font-weight:700 }
.student-card-grid dd { margin:2px 0 0; color:var(--ui-text); font-weight:600; overflow-wrap:anywhere }
.student-card-grid .wide { grid-column:1/-1 }
@media (max-width:700px) { .admin-summary-grid { grid-template-columns:1fr } .student-card { grid-column:auto; flex-direction:column; align-items:center; text-align:center } .student-card-head { justify-content:center } .student-card-grid { text-align:left; width:100% } }
.admin-table-wrap { overflow:auto; background:var(--ui-surface-strong); border:1px solid #e5ebf4; border-radius:16px; padding:18px; box-shadow:0 8px 24px rgba(7,27,58,.06) }
.admin-table-wrap + .admin-table-wrap { margin-top:18px; }
.admin-section-title { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:0 0 14px; }
.admin-section-title h3 { margin:0; color:var(--ui-blue-dark); font-size:16px; }
.admin-table-wrap table { width:100%; border-collapse:collapse; min-width:760px }
.admin-table-wrap th { background:var(--ui-navy); color:#fff; text-align:left; padding:11px 12px; font-size:12px }
.admin-table-wrap th:first-child { border-radius:10px 0 0 10px; }
.admin-table-wrap th:last-child { border-radius:0 10px 10px 0; }
.admin-table-wrap td { color:var(--ui-text); border-bottom:1px solid var(--ui-border); padding:10px; font-size:13px }
.admin-table-wrap td { border-bottom:1px solid #d3dce8; }
.admin-view,.admin-remove,.admin-approve { display:inline-block; border:0; border-radius:9px; padding:7px 10px; margin-right:5px; cursor:pointer; font-size:12px; font-weight:600; line-height:1.3; text-decoration:none; white-space:nowrap }
.admin-view { background:#eaf1ff; color:var(--ui-blue-dark) }
.admin-remove { background:#fee2e2; color:var(--ui-danger) }
.admin-modal { position:fixed; inset:0; z-index:110; display:grid; place-items:center; background:rgba(7,27,58,.5); padding:20px }
.admin-modal-box { width:min(100%,520px); background:#fff; border-radius:18px; padding:20px; box-shadow:0 12px 35px rgba(7,27,58,.2) }
.admin-modal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px }
.admin-modal-head h3 { margin:0; color:var(--ui-blue-dark) }
.admin-modal-head button { border:0; background:#eaf1ff; color:var(--ui-blue-dark); border-radius:10px; padding:5px 9px; cursor:pointer }
.admin-modal-box form { display:grid; grid-template-columns:1fr 1fr; gap:14px }
.faculty-assign-box { width:min(100%, 620px) !important; }
.faculty-assign-box form { grid-template-columns:1fr; }
.assignment-list { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:0 14px; max-height:55vh; overflow:auto; border:1px solid var(--ui-border); border-radius:6px; padding:8px; }
.assignment-list .admin-check { min-width:0; }
.moderator-box { width:min(100%, 760px) !important; }
.moderator-box table { width:100%; min-width:0 !important; }
.moderator-box .table-scroll { max-height:55vh; }
.moderator-picker { margin-left:8px; }
#selected-moderator { display:inline-flex; vertical-align:middle; margin-left:8px; }
.faculty-details-box { width:min(100%, 720px) !important; }
.schedule-box { width:min(100%,1120px) !important; max-height:88vh; overflow:auto; padding:18px; border-radius:24px; }
.schedule-box > .admin-modal-head { position:static; padding:8px 0 0; margin:0 0 8px; background:transparent; align-items:flex-start; }
.schedule-box > .admin-modal-head h3 { display:flex; align-items:center; gap:10px; font-size:22px; }
.schedule-box > .admin-modal-head h3::before { content:''; width:5px; height:27px; border-radius:4px; background:var(--ui-blue); }
.schedule-box > .admin-modal-head p { margin:3px 0 0 15px; color:var(--ui-muted); font-size:13px; }
.schedule-overview-actions { display:flex; align-items:center; gap:14px; }
.schedule-overview-actions #add-schedule { border-radius:24px; padding:11px 18px; box-shadow:0 6px 12px rgba(23,86,209,.18); }
.schedule-overview-actions #close-section-schedule { width:36px; height:36px; padding:0; border-radius:12px; font-size:18px; }
.schedule-box > .admin-table-wrap { padding:14px; border-radius:15px; }
.schedule-box > .admin-table-wrap th { height:42px; padding:8px 12px; }
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
.schedule-input,.schedule-picker { box-sizing:border-box; width:100%; height:52px; min-height:52px; border:1.5px solid var(--ui-border); border-radius:11px; background:#fff; color:var(--ui-text); font:inherit; font-size:15px; transition:border-color .15s,box-shadow .15s; }
.schedule-input { box-sizing:border-box; margin-top:0 !important; padding:0 14px !important; }
.schedule-input::placeholder,.schedule-picker-input::placeholder { color:#8a97b0; }
.schedule-input:focus,.schedule-picker:focus-within { outline:0; border-color:var(--ui-blue); box-shadow:0 0 0 4px #e6eefc; }
.schedule-hint { color:var(--ui-muted); font-size:12.5px; line-height:1.35; }
.schedule-picker { display:flex; align-items:center; gap:10px; min-width:0; padding:5px 5px 5px 14px; }
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
.section-box { width:min(100%,760px) !important; max-height:calc(100vh - 32px); padding:26px; border-radius:22px; }
.section-box .admin-modal-head { margin-bottom:28px; }
.section-box .admin-modal-head h3 { display:flex; align-items:center; gap:12px; font-size:20px; }
.section-box .admin-modal-head h3::before { content:''; width:5px; height:27px; border-radius:4px; background:var(--ui-blue); }
.section-box .admin-modal-head button { width:34px; height:34px; padding:0; border-radius:10px; font-size:18px; }
.section-box form { gap:22px 16px; }
.section-box form > label { display:flex; flex-direction:column; gap:6px; }
.section-box form > label > input,.section-box form > label > select { margin-top:0; min-height:40px; padding:10px 14px; border:1px solid #d6e0ee; border-radius:12px; }
.section-box .section-moderator-field { display:grid; grid-template-columns:auto 1fr; align-items:center; gap:10px 12px; margin-top:2px; }
.section-box .section-moderator-field > span { color:var(--ui-text); }
.section-box .section-moderator-field .moderator-picker { grid-column:2; grid-row:1; justify-self:end; margin:0; border:0; border-radius:22px; padding:10px 18px; }
.section-box .section-moderator-field .moderator-card { grid-column:1/-1; width:100%; box-sizing:border-box; margin-top:0; border-radius:18px; padding:10px 16px; }
.section-box .admin-actions { margin:4px 0 -2px; padding-top:18px; border-top:1px solid #edf1f6; }
.section-box .admin-actions button { border-radius:22px; padding:10px 20px; }
.account-details-box { width:min(100%,760px) !important; max-height:90vh; overflow:auto }
.account-details-box h4 { margin:20px 0 8px; color:var(--ui-blue-dark) }
.account-details-box .review-grid p { overflow-wrap:anywhere }
.account-picture { display:flex; align-items:center; gap:14px; margin-top:14px }
.account-picture img { width:64px; height:64px; border-radius:50%; object-fit:cover }
.faculty-details-box h4 { color:var(--ui-blue-dark); margin:20px 0 8px; }
.faculty-details-box ul { margin:0; padding-left:20px; color:var(--ui-text); }
.admin-modal-box label { color:var(--ui-text); font-weight:700; font-size:13px }
.admin-modal-box input,.admin-modal-box select,.admin-modal-box textarea { width:100%; box-sizing:border-box; margin-top:6px; padding:10px 12px; border:1px solid #b9c8dc; border-radius:11px; color:var(--ui-text); background:#fff }
.admin-full,.admin-actions { grid-column:1/-1 }
.admin-actions { display:flex; justify-content:flex-end; gap:8px }
.admin-cancel { border:0; border-radius:11px; padding:10px 14px; background:#fee2e2; color:var(--ui-danger); cursor:pointer }
.profile-picture-actions { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 5px; }
.profile-crop-box { width:min(100%,420px) !important; }
.profile-crop-box canvas { display:block; width:240px; height:240px; margin:0 auto 14px; background:#102a43; border-radius:6px; }
.pfp-edit-wrap { position:relative; width:96px; margin:0 auto 16px; }
.pfp-edit-wrap .profile-picture-preview { margin:0; }
.pfp-edit-btn { position:absolute; right:-2px; bottom:0; width:30px; height:30px; padding:0; border-radius:50%; border:2px solid #fff; background:#2161d1; color:#fff; display:grid; place-items:center; cursor:pointer; box-shadow:0 1px 4px rgba(15,23,42,.3); }
.pfp-edit-btn:hover { background:#1a4fb0; }
.pfp-menu { position:absolute; left:calc(100% - 10px); top:62px; z-index:5; min-width:150px; background:#fff; border:1px solid #d5e0f0; border-radius:10px; box-shadow:0 8px 24px rgba(15,23,42,.18); padding:4px; }
.pfp-menu button { display:block; width:100%; text-align:left; background:none; border:0; padding:8px 10px; border-radius:6px; font-size:13px; color:#102a43; cursor:pointer; }
.pfp-menu button:hover { background:#eaf1ff; }
.pfp-menu button.danger { color:#c0392b; }
.crop-stage { position:relative; width:240px; height:240px; margin:0 auto 6px; }
.crop-stage canvas { margin:0 !important; }
.crop-circle { position:absolute; inset:0; border-radius:6px; pointer-events:none; background:radial-gradient(circle closest-side, transparent 99%, rgba(8,20,40,.6) 100%); }
.crop-circle::after { content:''; position:absolute; inset:0; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,.25); }
.crop-hint { display:block; text-align:center; color:#64748b; margin-bottom:6px; }
.profile-crop-box label { display:block; margin-top:8px; }
@media (max-width:700px) { body.has-app-sidebar > main { margin-left:0; padding:20px 14px } .admin-page-head { align-items:flex-start; flex-direction:column; padding-right:0 } .admin-modal-box form { grid-template-columns:1fr } .assignment-list { grid-template-columns:1fr; } .moderator-picker, #selected-moderator { margin-left:0; } #selected-moderator { display:block; margin-top:8px; } .day-check-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } .picker-field { align-items:stretch; flex-direction:column; } .picker-field button { width:100%; } .schedule-form { grid-template-columns:1fr !important; padding:4px 20px 20px; } .schedule-form-head { padding:20px 20px 14px; } .schedule-day-chips { grid-template-columns:repeat(4,1fr); } .schedule-actions { margin:0 -20px -20px; padding:14px 20px; } .schedule-actions .schedule-button { flex:1; } }
@media (max-width:700px) { body.has-app-sidebar > main { margin-left:0; padding:20px 14px } .admin-page-head { align-items:flex-start; flex-direction:column; padding-right:0 } .admin-modal-box form { grid-template-columns:1fr } .assignment-list { grid-template-columns:1fr; } .moderator-picker, #selected-moderator { margin-left:0; } #selected-moderator { display:block; margin-top:8px; } .day-check-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } .picker-field { align-items:stretch; flex-direction:column; } .picker-field button { width:100%; } .schedule-form { grid-template-columns:1fr !important; padding:4px 20px 20px; } .schedule-row { grid-template-columns:1fr; } .schedule-form-head { padding:20px 20px 14px; } .schedule-day-chips { grid-template-columns:repeat(4,1fr); } .schedule-actions { margin:0 -20px -20px; padding:14px 20px; } .schedule-actions .schedule-button { flex:1; } }
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
.profile-toggle {
  display:flex !important;
  align-items:center;
  gap:10px;
  width:212px !important;
  min-height:53px;
  box-sizing:border-box;
  padding:6px 12px !important;
  border:1px solid #e1e8f2 !important;
  border-radius:16px !important;
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
.profile-picture-placeholder { display:grid; place-items:center; color:#fff; font-weight:700; font-size:18px; }
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
  border-radius:14px !important;
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
  border-radius:10px !important;
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
  /* The brand row above reserves 60px on its right for this; collapse it to just
     the avatar so it fits there instead of covering the seal/brand text. */
  .floating-profile { top: 10px; right: 10px; }
  .floating-profile .profile-toggle { width: 44px; min-height: 44px; padding: 0 !important; justify-content: center; border-radius: 50%; box-shadow: none; }
  .floating-profile .profile-toggle > span:nth-child(2),
  .floating-profile .profile-chevron { display: none; }
  .floating-profile .profile-dropdown { top: 50px; }
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
.badge { display:inline-block; padding:3px 10px; border-radius:999px; font-weight:700; text-transform:capitalize; background:#eef2f7; color:var(--ui-muted); }
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
.admin-modal-box > .admin-modal-head:not(.schedule-form-head) {
  position:sticky;
  top:-20px;
  z-index:2;
  padding:20px 0 12px;
  margin-top:-20px;
  background:#fff;
}
.admin-modal-box > .admin-modal-head:not(.schedule-form-head) { top:-20px; }
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
.pdf-preview-box { width:min(100%,860px) !important; max-height:92vh; display:flex; flex-direction:column; }
.pdf-preview-scroll { overflow:auto; background:#e5eaf2; padding:16px; border-radius:8px; margin:8px 0 12px; }
.pdf-sheet { width:794px; max-width:none; margin:0 auto; background:#fff; color:#111; padding:24px; box-sizing:border-box; box-shadow:0 2px 10px rgba(15,23,42,.18); }
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
/* Searchable type filter (input + custom list; the native datalist popup can't be styled). */
.combo { position:relative; width:260px; max-width:100%; }
.combo input { box-sizing:border-box; width:100%; margin:0; padding:9px 34px 9px 12px; border:1px solid #d3dbe8; border-radius:10px; background:#fff; color:var(--ui-navy); font:inherit; font-size:14px; }
.combo input:focus { outline:none; border-color:#2f6fed; box-shadow:0 0 0 3px rgba(47,111,237,.15); }
.combo-toggle { position:absolute; right:4px; top:4px; bottom:4px; width:28px; border:0; background:none; color:#64748b; cursor:pointer; border-radius:8px; font-size:12px; }
.combo-toggle:hover { background:#eef3fb; }
.combo-list { position:absolute; z-index:30; left:0; right:0; top:calc(100% + 6px); margin:0; padding:6px; list-style:none; background:#fff; border:1px solid #dbe3ef; border-radius:12px; box-shadow:0 12px 28px rgba(7,27,58,.16); max-height:280px; overflow:auto; }
.combo-list li { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 10px; border-radius:8px; color:var(--ui-navy); font-size:14px; cursor:pointer; }
.combo-list li:hover, .combo-list li.active { background:#eef3fb; }
.combo-list li[aria-selected="true"] { font-weight:700; }
.combo-list li small { min-width:22px; text-align:center; padding:1px 7px; border-radius:999px; background:#e3ebf8; color:#17345f; font-size:11px; font-weight:700; }
.combo-list .combo-empty { color:#64748b; cursor:default; }
.combo-list .combo-empty:hover { background:none; }
.announcement-item { display:flex; justify-content:space-between; gap:16px; padding:10px 0; border-top:1px solid #edf1f6; }
.announcement-item:first-of-type { border-top:0; }
.announcement-item p { margin:3px 0 0; color:#475569; font-size:14px; }
.announcement-item small { color:#64748b; white-space:nowrap; }
#maintenance-notices:empty { display:none; }
.login-photo { position:relative; }
#maintenance-notices { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:min(360px,calc(100% - 32px)); }
.login-notice-card { padding:18px 22px; border-radius:10px; background:rgba(9,28,60,.78); border:1px solid rgba(255,255,255,.3); color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.55); max-height:70vh; overflow:auto; }
.login-notice-tag { color:#ffd479; text-transform:uppercase; letter-spacing:.08em; font-size:12px; }
.login-notice + .login-notice { margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,.3); }
.login-notice strong { display:block; font-size:15px; }
.login-notice-date { display:block; margin-top:8px; text-align:right; font-size:12px; opacity:.85; }
.login-notice .rich { margin-top:6px; font-size:13px; line-height:1.45; }
@media (max-width:700px) { #maintenance-notices { display:none; } }
.rich { overflow-wrap:anywhere; }
.rich p, .rich div, .rich ul, .rich ol, .rich blockquote { margin:0 0 6px; }
.rich li { margin:0 0 2px; }
.rich ul, .rich ol { padding-left:22px; }
.rich blockquote { border:0; padding:0; margin-left:32px; }
.mail-row { display:block; width:100%; padding:12px 12px 12px 14px; border:0; border-top:1px solid #edf1f6; border-left:3px solid transparent; border-radius:0; background:transparent; text-align:left; color:inherit; cursor:pointer; font:inherit; }
.mail-row:first-of-type { border-top:0; }
.mail-row:hover, .mail-row:focus-visible { background:#f6f9fd; }
.mail-row.urgent { background:#fffaf0; border-left-color:#e0961a; }
.mail-row.urgent:hover { background:#fff3dc; }
.mail-main { display:flex; flex-direction:column; min-width:0; gap:3px; }
.mail-top { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
.mail-date { color:#64748b; font-size:12px; white-space:nowrap; }
.mail-subject { display:inline-flex; align-items:baseline; gap:6px; flex-wrap:wrap; font-weight:700; color:#0f172a; font-size:14px; min-width:0; }
.ann-table { table-layout:fixed; width:100%; }
.ann-table th:nth-child(1) { width:17%; }
.ann-table th:nth-child(3) { width:110px; }
.ann-table th:nth-child(4) { width:100px; }
.ann-table th:nth-child(5) { width:120px; }
.ann-table th:nth-child(6) { width:100px; }
.ann-table th:nth-child(7) { width:190px; }
.ann-table td { overflow:hidden; text-overflow:ellipsis; }
.ann-table td.ann-msg { white-space:nowrap; }
.ann-table td.ann-actions { white-space:nowrap; overflow:visible; }
.pw-meter { grid-column:1/-1; margin:-4px 0 4px; }
.pw-bar { height:6px; border-radius:6px; background:#e5e7eb; overflow:hidden; }
.pw-bar span { display:block; height:100%; width:0; transition:width .15s, background .15s; }
.pw-meter small { display:block; margin:4px 0; color:#475569; font-weight:600; }
.pw-meter ul { margin:0; padding:0; list-style:none; display:grid; grid-template-columns:1fr 1fr; gap:2px 12px; font-size:12px; color:#94a3b8; }
.pw-meter li::before { content:'○ '; }
.pw-meter li.ok { color:#16a34a; }
.pw-meter li.ok::before { content:'✓ '; }
.mail-author { flex:none; margin-left:4px; color:#64748b; font-size:12px; font-weight:400; white-space:nowrap; }
.mail-preview { color:#64748b; font-size:13px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; max-height:2.8em; overflow-wrap:anywhere; }
.pin-icon { flex:none; vertical-align:-2px; margin-right:4px; color:#64748b; }
.mail-view h3 { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.mail-view { width:min(100%,620px) !important; }
.mail-meta { padding:2px 0 12px; border-bottom:1px solid #e5ebf4; }
.mail-meta small { display:flex; align-items:center; color:#64748b; }
.mail-body { padding-top:14px; white-space:pre-wrap; font-size:15px; line-height:1.55; max-height:60vh; overflow:auto; }
.announcement-item.urgent { background:#fff7e6; border-left:4px solid #e0961a; padding-left:12px; }
.urgent-badge { background:#fde7b0 !important; color:#7a4d00 !important; }
.rte { border:1px solid #cbd5e1; border-radius:10px; background:#fff; overflow:hidden; }
.rte:focus-within { border-color:#2864c7; box-shadow:0 0 0 3px rgba(40,100,199,.15); }
.rte-bar { display:flex; align-items:center; gap:2px; padding:5px 6px; background:#fff; border-bottom:1px solid #e2e8f0; overflow-x:auto; }
.rte-bar button { display:grid; place-items:center; flex:none; width:30px; height:30px; padding:0; border:0; border-radius:6px; background:transparent; color:#475569; cursor:pointer; }
.rte-bar button:hover { background:#eef2f7; color:#0f172a; }
.rte-bar button:active { background:#dbe5f3; }
.rte-sep { flex:none; width:1px; height:18px; margin:0 5px; background:#e2e8f0; }
.rte-body { min-height:110px; max-height:240px; overflow:auto; padding:10px 12px; outline:none; font-size:14px; }
#announcement-form input:not([type=checkbox]), #announcement-form select { border-radius:10px; }
.ann-cancel { background:#f3f4f6; color:#374151; border:1px solid #e5e7eb; border-radius:10px; padding:10px 18px; font-weight:600; cursor:pointer; }
.ann-cancel:hover { background:#e5e7eb; }
.pin-switch { display:flex; align-items:center; gap:10px; cursor:pointer; font-weight:600; }
.pin-switch input { position:absolute; opacity:0; width:0; height:0; margin:0; }
.pin-track { position:relative; flex:none; width:36px; height:20px; border-radius:20px; background:#cbd5e1; transition:background .15s; }
.pin-track::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.3); transition:transform .15s; }
.pin-switch input:checked + .pin-track { background:#2864c7; }
.pin-switch input:checked + .pin-track::after { transform:translateX(16px); }
.pin-switch input:focus-visible + .pin-track { outline:2px solid #2864c7; outline-offset:2px; }
.rte-body:empty::before { content:attr(data-placeholder); color:#94a3b8; }
.pw-wrap { position:relative; }
.pw-wrap input { padding-right:44px !important; }
.pw-toggle { position:absolute; right:6px; top:50%; transform:translateY(-50%); margin:0; padding:6px; width:32px; height:32px; display:grid; place-items:center; border:0; border-radius:8px; background:transparent; color:#64748b; cursor:pointer; box-shadow:none; }
.pw-toggle:hover { background:#eef3fb; color:#17345f; }
.account-hero { display:flex; align-items:center; gap:16px; padding:14px 16px; margin:0 0 16px; border:1px solid #e5ebf4; border-radius:14px; background:#f8faff; }
.account-avatar { flex:none; width:64px; height:64px; border-radius:50%; display:grid; place-items:center; overflow:hidden; background:linear-gradient(160deg,#2f5fa8,#17345f); color:#fff; font-size:22px; font-weight:700; letter-spacing:.02em; }
.account-avatar img { width:100%; height:100%; object-fit:cover; }
.account-hero-name { margin:0; font-size:17px; font-weight:700; color:var(--ui-navy); }
.account-hero-meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.account-hero .admin-view { margin-left:auto; }
.account-edit-grid { display:grid !important; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px; align-items:end; margin:0 0 4px; }
.account-edit-grid label { font-size:12px; color:#64748b; font-weight:600; }
.account-edit-grid input, .account-edit-grid select { width:100%; box-sizing:border-box; margin-top:4px; padding:7px 10px !important; font-size:13px; }
.account-edit-grid .admin-actions { grid-column:1/-1; }
.account-edit-grid .admin-actions button { padding:7px 16px; font-size:13px; }
@media (max-width:700px) { .account-edit-grid { grid-template-columns:1fr; } }
.floating-profile { display:flex; align-items:flex-start; gap:10px; }
.has-notif-bell .admin-page-head, .has-notif-bell .toolbar { padding-right:300px; }
.profile-grid { display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:16px; align-items:start; }
.profile-grid > .admin-table-wrap { margin:0 !important; overflow:visible; }
.lunch-card { margin-top:18px; padding:20px 22px; }
.lunch-sub { margin:2px 0 0; font-size:13px; color:var(--ui-muted); font-weight:400; }
.lunch-form { display:grid; grid-template-columns:minmax(140px,1.2fr) repeat(4,minmax(120px,1fr)) auto; gap:14px; align-items:end; margin-top:14px; }
.lunch-form label { display:flex; flex-direction:column; gap:6px; font-size:13px; font-weight:600; color:var(--ui-muted); }
.lunch-form input, .lunch-form select { width:100%; height:42px; border-radius:14px; margin:0; box-sizing:border-box; }
.lunch-save { height:42px; padding:0 22px; }
.lunch-card .admin-note { margin:12px 0 0; }
@media (max-width:900px) { .lunch-form { grid-template-columns:1fr 1fr; } .lunch-save { grid-column:1 / -1; } }
.schedule-gap td { background:#f3f7fd; color:#64748b; font-size:13px; font-style:italic; text-align:center; letter-spacing:.02em; }
.schedule-head { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px 14px; margin:0 0 14px; }
.schedule-head h3 { margin:0; color:var(--ui-blue-dark); font-size:20px; }
.schedule-head .admin-note { margin:0; }
.profile-side { display:grid; gap:16px; }
.profile-side > .admin-table-wrap { margin:0 !important; }
.edit-request-card .admin-note { margin:0 0 12px; }
.edit-request-box { width:min(100%,640px) !important; max-height:90vh; overflow:auto; }
.edit-request-box .profile-form { display:grid; grid-template-columns:1fr 1fr; gap:12px 14px; }
.edit-request-box .profile-form label { display:flex; flex-direction:column; gap:5px; font-weight:600; }
.edit-request-box .profile-form .admin-full { grid-column:1 / -1; }
@media (max-width:640px) { .edit-request-box .profile-form { grid-template-columns:1fr; } }
.pfp-card { display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; }
.pfp-big { flex:0 0 132px; width:132px; height:132px; font-size:40px; box-shadow:0 0 0 4px #eaf1ff; }
.pfp-card .admin-secondary, .pfp-card .admin-primary { min-width:130px; }
.pfp-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }
.pfp-card .admin-note { margin:0; overflow-wrap:anywhere; }
@media (max-width:900px) { .profile-grid { grid-template-columns:1fr; } }
.notif { position:relative; }
.notif-toggle { position:relative; width:53px; height:53px; display:grid; place-items:center; padding:0; border:1px solid var(--ui-border); border-radius:16px; background:#fff; color:var(--ui-blue-dark); cursor:pointer; box-shadow:0 3px 12px rgba(7,27,58,.1); }
.notif-toggle:hover { background:#f3f7fd; }
.notif-count { position:absolute; top:7px; right:7px; min-width:18px; height:18px; padding:0 5px; box-sizing:border-box; display:grid; place-items:center; border-radius:9px; background:#c0392b; color:#fff; font-size:11px; font-weight:700; }
.notif-panel { position:absolute; right:0; top:60px; width:340px; max-height:420px; overflow:auto; padding:8px; background:#fff; border:1px solid #dbe3ef; border-radius:14px; box-shadow:0 12px 28px rgba(7,27,58,.16); z-index:120; }
.notif-item { display:flex; flex-direction:column; gap:2px; width:100%; margin:0; padding:10px 12px; border:0; border-radius:10px; background:none; text-align:left; cursor:pointer; color:var(--ui-text); font:inherit; }
.notif-item:hover { background:#eef3fb; }
.notif-item.unread { background:#f3f7fd; box-shadow:inset 3px 0 0 var(--ui-blue); }
.notif-item span { font-size:13px; color:#475569; }
.notif-item small { color:#94a3b8; font-size:11px; }
.notif-empty { margin:0; padding:14px; text-align:center; color:#64748b; font-size:13px; }
.account-edit-grid .wide { grid-column:1/-1; }
.account-edit-grid textarea { width:100%; box-sizing:border-box; margin-top:4px; padding:7px 10px; font-size:13px; min-height:60px; resize:vertical; }
.account-section-head { display:flex; align-items:center; justify-content:space-between; margin:20px 0 8px; }
.account-section-head h4 { margin:0 !important; }
@media (min-width:701px) { .layout > .app-sidebar { position:sticky; top:0; align-self:flex-start; flex:none; height:100vh; z-index:90; } .layout > .main { flex:1; min-width:0; } }
.floating-profile .profile-toggle { cursor:grab; touch-action:none; }
.floating-profile.dragging, .floating-profile.dragging .profile-toggle { cursor:grabbing; user-select:none; }
.subtabs { display:flex; gap:4px; margin:0 0 -1px 14px; position:relative; z-index:1; overflow-x:auto; }
.subtab { flex:none; padding:10px 18px; border:1px solid #e5ebf4; border-bottom:0; border-radius:12px 12px 0 0; background:#e9eef7; color:var(--ui-muted); font:inherit; font-size:13px; font-weight:600; cursor:pointer; }
#schedule-days .subtabs { margin:0 0 12px; gap:6px; flex-wrap:wrap; }
#schedule-days .subtab { border:1px solid #e5ebf4; border-radius:10px; padding:8px 14px; }
#schedule-days .subtab small { opacity:.75; font-weight:400; }
.subtab:hover { background:#f1f5fb; color:var(--ui-blue-dark); }
.subtab.active { background:#fff; color:var(--ui-blue-dark); box-shadow:0 -3px 0 var(--ui-blue) inset; }
.override-form { display:grid; grid-template-columns:1fr 1fr; gap:14px 16px; align-items:start; }
.override-form label { display:flex; flex-direction:column; gap:6px; font-size:13px; font-weight:600; color:var(--ui-blue-dark); }
.override-form input, .override-form select, .override-form textarea { width:100%; box-sizing:border-box; margin:0; padding:10px 12px; border:1px solid #b9c8dc; border-radius:11px; background:#fff; color:var(--ui-text); font:inherit; font-size:14px; font-weight:400; }
.override-form input:focus, .override-form select:focus, .override-form textarea:focus { outline:none; border-color:#2f6fed; box-shadow:0 0 0 3px rgba(47,111,237,.15); }
.override-form textarea { min-height:70px; resize:vertical; }
.override-form .wide, .override-form .actions { grid-column:1/-1; }
.override-form .actions { display:flex; justify-content:flex-end; margin:0; }
@media (max-width:700px) { .override-form { grid-template-columns:1fr; } }
tbody tr[hidden] { display:none !important; }
.table-pager { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:12px 4px 0; color:var(--ui-muted); font-size:13px; }
.table-pager .pager-nav { display:inline-flex; align-items:center; gap:10px; }
.pager-btn { border:1px solid #c9dbfb; border-radius:9px; padding:6px 12px; background:#eaf1ff; color:var(--ui-blue-dark); font:inherit; font-size:12px; font-weight:600; cursor:pointer; }
.pager-btn:hover:not(:disabled) { background:#dbe7fc; }
.pager-btn:disabled { opacity:.45; cursor:not-allowed; }
@media print { tbody tr[hidden] { display:table-row !important; } .table-pager { display:none !important; } }
/* Role bar: a thin gradient strip across the very top tells the roles apart. Students have none. */
body[data-role]::before { content:''; position:fixed; top:0; left:0; right:0; height:12px; z-index:200; pointer-events:none; background:var(--role-bar); }

body[data-role="admin"] { --role-bar: linear-gradient(90deg, #091c3c 0%, #091c3c 18%, #3b184f 39%, #4c1c6c 60%); }
body[data-role="registrar"] { --role-bar: linear-gradient(90deg, #091c3c 0%, #091c3c 18%, #2a1a2e 32%, #5a1a22 46%, #6a1818 60%); }
body[data-role="faculty"] { --role-bar: linear-gradient(90deg, #091c3c 0%, #091c3c 18%, #143d33 39%, #1e5a3a 60%); }
body[data-role="student"] { --role-bar: #091c3c; } /* solid, no gradient: same navy as the sidebar */

/* Joins the bar to the sidebar: square the sidebar's top-right corner and draw a navy
   concave corner so the page area curves into the bar (desktop only; students unaffected). */
@media (min-width:701px) {
  body[data-role] .app-sidebar { border-top-right-radius:0; }
  body[data-role]::after { content:''; position:fixed; top:12px; left:244px; width:28px; height:28px; z-index:200; pointer-events:none; background:radial-gradient(circle at 100% 100%, transparent 27.5px, #091c3c 28px); }
}
@media print { body[data-role]::before, body[data-role]::after { display:none; } }
`;

const SPAM_GUARD_MS = 600;

// Blocks rapid repeat clicks on any clickable control app-wide so double-clicks or
// impatient re-clicks during a network request can't trigger an action twice.
function installSpamGuard() {
  if (window.__tcsmsSpamGuardInstalled) return;
  window.__tcsmsSpamGuardInstalled = true;
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, [type="submit"], .admin-view, .admin-remove, .sidebar-link');
    // Menu toggles open/close instantly and can't double-submit anything, so they don't
    // need the cooldown that guards real actions (saves, deletes) from a double-click.
    if (!target || target.closest('.profile-toggle, .pw-toggle, .notif-toggle, .notif-item, .subtab, .pager-btn')) return;
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
    toast(describeError(event.reason, 'Operation'), 'error', 6000);
  });
  window.addEventListener('error', event => {
    if (!event.error) return;
    toast(describeError(event.error, 'Page'), 'error', 6000);
  });
}

export function toast(message, type = 'success', duration = 3500) {
  const element = document.getElementById('toast') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'toast' });
  element.textContent = message;
  element.className = `toast ${type}`;
  element.classList.remove('hidden');
  setTimeout(() => element.classList.add('hidden'), duration);
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
  installTablePages();
  installTableCopy();
  installGlobalErrorHandler();
}
