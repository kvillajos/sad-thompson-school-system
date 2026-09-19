# TCSMS Project Context

## Stack

- Vite with vanilla HTML and JavaScript modules
- Supabase Auth, Postgres, RLS, and Storage
- Role IDs: `1` administrator, `2` registrar, `3` faculty, `4` student

## Organization

- Root HTML files are the stable browser entry points.
- Shared runtime modules remain in the root: `auth-client.js`, `ui-theme.js`, `loading-screen.js`, `main.js`, and `registrar.js`.
- Pure helper modules with no app imports, asserted by their `scripts/check-*.mjs`: `grades.js` (scores, CSV upload, letter grades, general average), `attendance.js` (attendance sheet + summary line), `report-card.js` (report card HTML builder).
- `public/assets/` contains `logo.png` and `bg.jpg`.
- `database/supabase-migration.sql` contains tables, functions, constraints, triggers, and RLS policies.
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
- Guardian contact/medical profile fields and an `update_student_profile` RPC, plus a `set_academic_lock`/unlock RPC completing the locked-record feature (`database/migration-v6-attendance-reports.sql`)
- Manage Accounts page wired to `provision-account` for re-provisioning a pending login, deactivating/reactivating an account, and issuing a one-time password reset
- Admin dashboard Announcements panel: `+ Add` posts to the existing `announcements` table and the list now renders real posts instead of a static placeholder

## Remaining Work

- Enrollment status vocabulary is fixed by `students_enrollment_status_check`: `Enrolled | Pending | Graduated | Transferred`. Adding a status means updating that constraint (see `database/migration-v3-registrar-ui.sql`).
- `database/migration-v6-attendance-reports.sql` drops the legacy `student_enrollments` table if Supabase still has it (guarded, no-op if it is already gone) - review/back up before running this migration if that table might still hold data.
- A true one-click PDF report card would need a new PDF library; for now "Print Report Card" uses the browser's Print → Save as PDF, same as the transcript.
- Test every role after applying the latest migration (`migration-v6-attendance-reports.sql`) and rotating Supabase JWT/API keys.

## Required Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set the Vite Supabase values.
3. Run `database/supabase-migration.sql`, then `database/migration-v2-features.sql`, then `database/migration-v3-registrar-ui.sql`, then `database/migration-v4-registrar-workflows.sql`, then `database/migration-v5-faculty-grades.sql`, then `database/migration-v6-attendance-reports.sql` in Supabase SQL Editor. The v4 migration is required for review edit sessions, detailed academic fields/locks, and multi-student placement; v5 adds the faculty grade entry RPC; v6 adds per-session attendance, guardian/medical profile fields, the academic lock RPC, and the reporting views. Apply them again if you ran an earlier draft.
4. Run `npm run dev`.
5. Use the service-role key only in a local terminal for seed scripts. Never commit or share it.
6. Deploy the updated edge function after pulling this change: `supabase functions deploy provision-account` (it now also handles deactivate/activate/reset actions from Manage Accounts).

Optional validation: `npm run check:sort` (table sorter), `npm run check:sectioning` (allocator), `npm run check:timeout` (logout clocks), `npm run check:registrar-flow` and `npm run check:registrar` (registrar UI in headless Edge), `npm run check:attendance`, `npm run check:grades-upload`, `npm run check:report-card`. No frameworks, no network.

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
