# TCSMS Project Context

## Stack

- Vite with vanilla HTML and JavaScript modules
- Supabase Auth, Postgres, RLS, and Storage
- Role IDs: `1` administrator, `2` registrar, `3` faculty, `4` student

## Organization

- Root HTML files are the stable browser entry points; each one's script is an external `<page>-page.js` (or, for the registrar, `registrar.js` itself), matching the `faculty/*-page.js` pattern.
- Shared runtime modules remain in the root: `auth-client.js`, `html.js` (pure: `escapeHtml`, `formatDate`, `dayNames`, grade-level helpers, asserted by `scripts/check-shared-helpers.mjs`), `ui-theme.js` (shared CSS + `applyUiTheme` + `toast`), `shell.js` (`mountSidebar`, `mountProfile`, `withBusy`, the profile/password modals), `loading-screen.js`, `admin-page.js` (`mountAdminShell` — the shared admin nav+shell for all 8 admin pages), and `main.js`.
- The registrar page (`student-records.html`) is split into `registrar.js` (entry: nav, tab wiring, `init()`), `registrar-state.js` (`$`, shared `state`), `registrar-admissions.js` (application form, camera, drafts, review, student details), `registrar-sectioning.js` (sections, enrollment, placement, auto-assign), `registrar-academic.js` (academic history, report card, print card, transcript), and `registrar-shifting.js` (promotion, transfer/shifting, feedback). Import direction is one-way (`registrar.js` → the four feature modules → `registrar-admissions.js`/`registrar-sectioning.js`/`registrar-academic.js` → `registrar-state.js`) to avoid ES module circular-import ordering issues.
- Pure helper modules with no app imports, asserted by their `scripts/check-*.mjs`: `grades.js` (scores, CSV upload, letter grades, general average), `attendance.js` (attendance sheet + summary line), `report-card.js` (report card HTML builder), `semester-grades.js` (`buildSemesterTable` — semester-split or `{ flat: true }` record-card shape).
- `public/assets/` contains `logo.png` and `bg.jpg`.
- `database/backupsqlmigration.sql` is the single executable database file: base schema plus migrations v2-v11 (including Data API grants and the faculty grade lock). Add future changes to it directly.
- The security-hardening delta is already folded into `database/backupsqlmigration.sql`; run it as the single executable database artifact.
- Browser data access uses Supabase's parameterized client and RPC APIs; ownership and role checks are enforced by RLS and server-side functions. Only the public anon/publishable key may use `VITE_` variables; service-role credentials belong only in Edge Functions or local server-side scripts.
- `scripts/seed-students.mjs` creates 40 Filipino student accounts.
- `scripts/seed-staff.mjs` creates 10 faculty accounts, 3 registrar accounts, profiles, and 10 subjects.
- `docs/` contains this context file and the peer-agent handoff.

## Completed

- Supabase login and role-based redirects
- Shared sidebar and profile UI for admin, registrar, faculty, and student pages
- Admin dashboard, section management, subject CRUD, schedules, filtering, and capacity validation
- Schedule conflict detection for sections, faculty, and rooms
- Registrar admissions, enrollment, section placement, academic history, transcripts, promotion, shifting, and feedback
- Admin faculty management, account review, and curriculum review checklist
- Faculty dashboard with assigned schedules and student rosters
- Student, faculty, registrar, subject, and profile seed data
- Role-aware RLS policies replacing broad authenticated access
- Registrar UI: student details popup with a View action, draft list/resume, admission profile picture, section student popup, status colour coding, working transfer and shifting
- Sortable tables on every page (default Name A-Z) via `table-sort.js`, installed by `applyUiTheme()`
- Two logout clocks in `session-timeout.js`: 30 minutes idle in a visible tab, 4 hours with the tab in the background (`npm run check:timeout`)
- Registrar Academic History is read-only: searchable student list, View History modal, printable academic record card
- Auto-assign accepts one, several, or all grade levels plus a searchable student exclusion list; the modal Cancel button closes it
- Placement tool lists a grade's students as a titled, searchable table with a "without a section" filter
- Login screen version label (`v<package.json version> · branch@commit`) injected by `vite.config.js`
- Faculty attendance entry per class + date (`attendance.js`, wired into the faculty dashboard's Attendance panel, saved through `save_attendance`, covered by `npm run check:attendance`); the registrar academic modal and student dashboard both show the same attendance summary line
- Faculty grade CSV bulk upload (`parseGradeCsv` in `grades.js`): preview table with per-row errors, Save blocked until the file is clean, covered by `npm run check:grades-upload`
- DepEd-style letter-grade scale and general average (`LETTER_GRADE_SCALE`, `letterGrade`, `generalAverage` in `grades.js`) wired into the faculty grade sheet (editable override), the registrar academic modal, and the student dashboard
- Printable report card (`report-card.js`, `npm run check:report-card`): grades + attendance + remarks + general average + signature block, printed the same way as the existing academic record card
- Guardian contact/medical profile fields and an `update_student_profile` RPC, plus a `set_academic_lock`/unlock RPC completing the locked-record feature (`database/backupsqlmigration.sql`)
- Manage Accounts page wired to `provision-account` for re-provisioning a pending login, deactivating/reactivating an account, and issuing a one-time password reset
- Admin dashboard Announcements panel: `+ Add` posts to the existing `announcements` table and the list now renders real posts instead of a static placeholder
- Semester-wise student and registrar grade views (`semester-grades.js`) with shared averages and filters
- Official and unofficial semester-grouped transcripts (`transcript.js`) rendered through the shared in-page print helper (`print.js`)
- Global normalized runtime error notifications and static RBAC/audit checks; admin Audit Trail panel

## Remaining Work

- Enrollment status vocabulary is fixed by `students_enrollment_status_check`: `Enrolled | Pending | Graduated | Transferred`. Adding a status means creating a new numbered edit file; do not modify `database/backupsqlmigration.sql` directly.
- The consolidated migration drops the legacy `student_enrollments` table if Supabase still has it (guarded, no-op if it is already gone) - review/back up before running the database setup if that table might still hold data.
- A true one-click PDF report card would need a new PDF library; for now "Print Report Card" uses the browser's Print → Save as PDF, same as the transcript.
- Print output intentionally remains browser Print → Save as PDF; a generated `.pdf` would require a server-side/Edge Function PDF renderer.
- The backup includes v7 promotion audit events, v8 CRUD audit coverage and daily archives, v9 password-confirmed profile editing, v10 Data API grants (Supabase stops auto-granting access to new tables on 2026-10-30), and v11 faculty grade locking.
- Test every role after applying `database/backupsqlmigration.sql` and any separate edit migrations, then rotate Supabase JWT/API keys.

## Required Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set the Vite Supabase values.
3. Run `database/backupsqlmigration.sql` in the Supabase SQL Editor. It is the only SQL file and is safe to re-run.
4. Run `npm run dev`.
5. Use the service-role key only in a local terminal for seed scripts. Never commit or share it.
6. Set the Edge Function `APP_ORIGIN` environment variable to the deployed application origin, then deploy: `supabase functions deploy provision-account` (it handles deactivate/activate/reset actions from Manage Accounts).

Optional validation: `npm run check:sort` (table sorter), `npm run check:sectioning` (allocator), `npm run check:timeout` (logout clocks), `npm run check:registrar-flow` and `npm run check:registrar` (registrar UI in headless Edge), `npm run check:attendance`, `npm run check:grades-upload`, `npm run check:report-card`, `npm run check:shared-helpers` (guards against re-declaring `escapeHtml` instead of importing it from `html.js`). No frameworks, no network. The four headless-Edge checks (`check:registrar`, `check:registrar-flow`, `check:admin-lock`, `check:sidebar`) need a real Edge window free to run headless — they silently no-op ("Browser produced no result") if another Edge instance is already open under the same Windows user.

Student seed command:

```powershell
$env:SEED_STUDENT_PASSWORD="initials"
npm run seed:students
```

Staff seed command:

```powershell
$env:SEED_STAFF_PASSWORD="initials"
npm run seed:staff
```
