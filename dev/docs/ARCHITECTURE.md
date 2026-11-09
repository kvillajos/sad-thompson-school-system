# TCSMS Architecture

**If you use an AI assistant, make it read this file before it edits anything.**

## Stack

- Vite + vanilla HTML and JavaScript ES modules (no framework)
- Supabase Auth, Postgres, Row Level Security (RLS), Storage, one Edge Function
- Role IDs: `1` administrator, `2` registrar, `3` faculty, `4` student
- Hosted on Vercel (see [DEPLOYMENT.md](DEPLOYMENT.md))

## Folder layout

Each role owns a folder with its pages (`*.html`) and their scripts (`*-page.js`).
Anything used by more than one role lives in `shared/`.

```
index.html                    login page
forgot-password.html          password reset, step 1 (email)
verify-reset-code.html        password reset, step 2 (6-digit code)
reset-password.html           password reset, step 3 (new password)
auth/                         scripts for the four pages above (login-page.js, ...)

role-admin/                   7 admin pages
  admin-page.js               mountAdminShell (admin nav + shell), shared faculty form fields
  edit-lock.js                registrar edit-lock rule (pure)
  auto-schedule.js            Manage Schedules > Auto-schedule preview and Apply
role-registrar/               student-records.html (one page, tabbed) + its modules, see below
role-faculty/                 6 faculty pages
  faculty-common.js           loadFacultyContext (shell + assigned classes), class picker, roster
  unsaved.js                  guardUnsaved: warn before losing typed grades/attendance
role-student/                 student-dashboard.html
  student-dashboard-layout.js URL-aware portal navigation
  student-history-view.js     historical enrollment and grade views
  student-request-portal.js   student service requests and live status tracking
  notifications.js            notification bell

shared/
  ui/                         browser-facing modules
    ui-theme.js               shared CSS + applyUiTheme() + toast(); installs the table helpers below
    shell.js                  mountSidebar, mountProfile, withBusy, profile/password modals
    dialog.js                 in-page confirm / prompt / alert
    loading-screen.js         full-page loader
    table-sort.js, table-pages.js, table-copy.js   sortable, paged, copyable tables (auto-installed)
    day-tabs.js               schedule day tabs
    announcements.js          announcement list + login maintenance banner
    restore-changes.js        "Restore Changes" list (admin audit trail + registrar tab)
    search-picker.js          type-to-search dropdown (replaces <datalist>)
    filter-bar.js             School Year / Grade / Strand / ... filters + Export CSV on list pages
    override-form.js          section capacity override (registrar requests it, admin applies it)
    photo-upload.js           staff-only profile photo upload (mounted in Manage Accounts)
  lib/                        data + logic
    auth-client.js            Supabase client, requireRole, signOut
    session-timeout.js        idle / background logout clocks
    errors.js                 describeError + global error classification
    fetch-all.js              read past Supabase's 1,000-row page limit
    html.js                   escapeHtml, formatDate, dayNames, grade-level helpers (pure)
    school-settings.js        lunch/break times per school year
    edit-request.js           student "Request an Edit" helpers (pure)
    grades.js                 scores, CSV upload, letter grades, general average (pure)
    attendance.js             attendance sheet + summary line (pure)
    semester-grades.js        semester tables + averages (pure)
    schedule-days.js          multi-day schedule diff/grouping (pure)
    schedule-plan.js          auto-schedule planner: daily slots around lunch/break, no double-booking (pure)
    strands.js                Senior High strands (table strands)
    sectioning.js             who may join a section + balanced auto-assign allocator (pure)
  documents/                  printable documents
    report-card.js, transcript.js   pure HTML builders
    pdf-preview.js            PDF preview window (html2pdf.js, loaded only on demand)
    print.js                  in-page print helper

public/                       copied as-is to the site root
  assets/                     logo.png, bg.jpg
  css/                        theme-dark, responsive-tablet, responsive-mobile, documents, admin-polish
                              (loaded by applyUiTheme() after the shared theme, so they win)
supabase/functions/provision-account/   Edge Function: create / deactivate / activate / reset accounts

dev/                          development only, not part of the build
  database/backupsqlmigration.sql       the one complete database file
  scripts/checks/             npm run check / check:<name>
  scripts/seed/               account seeding (needs the service-role key, local only)
  docs/                       this file, DEPLOYMENT.md, TESTING.md
  backups/                    SQL backups (git-ignored)
```

## Conventions

- **Imports** are relative (`../shared/lib/html.js` from a role folder). `<script src>` and page links use
  root-absolute paths (`/role-admin/admin-dashboard.html`).
- **New page**: add it to the `pages` map in `vite.config.js`, or it is missing from the production build.
- **Root page URLs are stable.** Supabase emails link to them; do not move the four root HTML files.
- **Pure modules** (marked "pure" above) import nothing from the app, so `dev/scripts/checks/` can test them in Node.
- **Formatting**: Prettier (`npm run format`), config in `.prettierrc.json`. No semicolons, single quotes.
  CSS inside JS template strings (e.g. `sharedTheme` in `ui-theme.js`) is left as written.
- **Styles**: shared component CSS is in `ui-theme.js`; theme and breakpoint overrides go in the matching
  `public/css/*.css` file. Colours are `--ui-*` CSS variables at the top of `ui-theme.js`.
- **Security**: the browser only ever gets the anon/publishable key (`VITE_` variables). Ownership and role
  checks are enforced by RLS and server-side functions, not by hiding buttons. The service-role key lives
  only in the Edge Function and in local seed scripts.

## Registrar page modules

`student-records.html` is one tabbed page split into:

| Module | Owns |
| --- | --- |
| `registrar.js` | entry: nav, tab wiring, `init()` |
| `registrar-state.js` | `$` and the shared `state` object |
| `registrar-admissions.js` | application form, camera, drafts, review, student details |
| `registrar-sectioning.js` | sections, enrollment, placement, auto-assign |
| `registrar-academic.js` | academic history, report card, print card, transcript |
| `registrar-shifting.js` | promotion, transfer/shifting, feedback |
| `registrar-requests.js` | approval requests filed to the admin |
| `registrar-lifecycle-tabs.js` | lazy tabs: Bulk Import, Section Reports, Graduation, Document Requests, Discipline |

Imports go one way (`registrar.js` → feature modules → `registrar-state.js`) to avoid ES-module circular-import
ordering bugs. Keep it that way.

## Database

- `dev/database/backupsqlmigration.sql` is the single executable database file: base schema plus migrations
  v2-v45, each in a `BEGIN/END` block. It is safe to re-run.
- **Grade levels offered**: the school runs Grades 7-12. Table `grade_levels` (v40) has an `offered` switch per
  grade (0 = Kindergarten to 12); every grade picker reads it through `shared/lib/grade-levels.js`, and a trigger
  refuses new sections, students, applications and promotion requests in a grade that is switched off. To add
  grades back: `update grade_levels set offered = true where grade_level between 0 and 6;`
- **Changes**: append a new numbered block at the end of that file. Ask before running SQL on the live project.
- New SQL awaiting lead review goes in `dev/database/pending/` and must not be run against the live project or copied
  into the consolidated backup until approved.
- **Subjects and strands** (v52): Junior High subjects are named by topic, one per grade (e.g. Grade 9 "Chemistry").
  Senior High uses the K-12 strands in table `strands` (STEM, ABM, HUMSS, GAS, TVL-CSS, TVL-MSES, TVL-PLUMB);
  each subject has `subject_type`, `semester` (1, 2 or null = whole year) and `strands` (null = every strand).
  Grades 11-12 students and sections carry one strand, and placement only matches the same strand. The catalog and
  the demo data generator live in `dev/scripts/seed/curriculum.mjs` and `seed-curriculum.mjs`.
- Enrollment status is fixed by `students_enrollment_status_check`: `Enrolled | Pending | Graduated | Transferred`.
  Adding one needs a new migration block.

## Features (done)

- Supabase login, role-based redirects, password reset by emailed code, maintenance banner on login
- Shared sidebar/profile UI for every role; dark mode; mobile and tablet layouts
- Two logout clocks: 30 minutes idle in a visible tab, 4 hours in a background tab
- Sortable, paged and copyable tables everywhere (default Name A-Z), row action menus
- **Admin**: dashboard with Pending Approvals (admissions, profile changes, grade corrections, withdrawals,
  promotions, account actions, capacity overrides, student portal requests), sections, subjects, schedules with conflict detection
  (section / faculty / room) and multi-day entries, faculty management, Manage Accounts (via `provision-account`),
  announcements (notice/maintenance, per-role audience, expiry), audit trail with restore
- **Registrar**: admissions with drafts and photo, enrollment, placement tool, balanced auto-assign with
  grade selection and exclusions, read-only academic history, report card, official/unofficial transcripts,
  promotion, transfer/shifting, approval requests
- **Faculty**: dashboard with schedule-change notices, class list, grade entry with DepEd letter grades and
  submit-and-lock, CSV grade upload with per-row validation, correction requests on locked grades,
  attendance, reports
- **Student**: dashboard, current grades and separate historical enrollment/grade views, transcript
  preview/print, schedule, profile with guardian/medical fields, attendance, notifications, edit requests,
  and LRN/account/section-transfer requests with live approval status
- RBAC through RLS, append-only audit logs (including promotions and CRUD), daily audit archives

### School-year lifecycle (branch SchoolYearLifecycle, SQL v56-v63)

| Stage | What | Where |
| --- | --- | --- |
| Before the year | Year Setup wizard: create year, copy sections/timetables, lunch times and grading scale, calendar and school days, advisers, open enrollment | `role-admin/admin-year-setup*`, `copy-year.js` |
| | School calendar: quarter dates, grade deadlines, holidays, "Compute from calendar" school days | `role-admin/admin-calendar*`, `shared/lib/calendar.js` (v56) |
| Enrollment | Enrollment-open switch per year, enforced by triggers on `enrollments` / `student_school_years` | v57, `role-registrar/enrollment-window.js` |
| | Admission requirements checklist (admin-editable list, uploads tick items, approval blocked unless an override is approved) | `shared/lib/requirements.js`, `shared/ui/requirements-checklist.js`, `role-admin/requirement-types.js` (v58) |
| | Bulk import from CSV/Excel; admin "Provision pending logins" | `role-registrar/registrar-import.js`, `shared/lib/student-import.js` (v59) |
| During the year | Grade submission tracker per quarter (late against the calendar deadline) | `role-admin/admin-grade-tracker*`, `shared/lib/grade-tracker.js` |
| | My Advisory: the adviser's section (grades, attendance, requests, discipline) | `role-faculty/faculty-advisory*` (v60 adviser read policies) |
| | Discipline records (admin, registrar, adviser write; student reads own) | `shared/ui/sanctions.js`, `role-admin/admin-discipline*` (v61) |
| | Document requests (Form 137, Good Moral, COE): student → registrar queue → notifications | `shared/ui/document-requests.js` (v62) |
| End of quarter | Batch report cards per section | `role-registrar/registrar-section-reports.js` |
| | DepEd SF1, SF2, SF5, SF10 as .xlsx (exceljs, loaded on demand) | `shared/documents/deped-forms.js`, `xlsx-writer.js`, `role-registrar/registrar-deped-forms.js` |
| End of year | Graduation lists (from batch promotion) and transcript-only login for graduates | `role-registrar/registrar-graduation.js`, `role-student/graduate-access.js` |
| | Year-end checklist + Close / Reopen year (a closed year is Past, so the v47b lock applies) | `role-admin/year-end-checklist.js` (v63) |
| Anytime | "How do I…" help per role (profile menu) | `shared/ui/help.js` |

New registrar tabs are built on first open by `role-registrar/registrar-lifecycle-tabs.js`; `registrar.js` only calls
`showLifecycleTab()`. New tables with a `school_year` column call `link_school_year_column()` (v56) for the v47b
foreign key and Past-year lock, and `attach_change_tracking()` for the audit trail and Restore Changes.

## Known limits

- PDFs come from the browser's Print → Save as PDF (and html2pdf.js for the preview download). A true
  server-side PDF would need an Edge Function renderer.
- The CSP in `vercel.json` is enforced (checked 2026-10-22 against an enforced copy in the browser for admin,
  registrar, faculty and the sign-in pages). Inline scripts, `eval` and other origins are blocked; inline
  styles stay allowed (`'unsafe-inline'`) because the UI sets them from JS.
- The login lookup throttle (`find_login_email`) and audit IP addresses use the first `x-forwarded-for`
  entry when `cf-connecting-ip` is missing; a client can fake that entry, so the per-username limit is the
  one that cannot be dodged.
- Supabase is the current backend. Moving off it later means replacing Supabase Auth, the
  `provision-account` function, and the `supabase.from()/.rpc()` calls; business rules already live in
  Postgres functions and RLS.
