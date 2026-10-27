# CurriculumUIHotfix – progress log

Branch: `CurriculumUIHotfix` (off `Curriculum` a757a74). Commit prefix: `CurriculumUIHotfix/main - ` (NO Co-Authored-By Claude line).
Rules: ask before running live SQL; mirror every SQL into `dev/database/backupsqlmigration.sql`. Ask the user when unsure.
Update this file after every finished item (tick the box + note files touched).

## Agreed scope (answers from the user, 2026-10-27)

### Student
- [ ] Attendance history: hide **Present** only (show Absent/Late/Excused). Totals line stays. (`role-student/student-dashboard-page.js` ~L291-353)

### Admin
- [ ] Next semester: "Copy 1st Sem -> 2nd Sem" for SHS sections + students, with a **preview dialog** (sections, student counts, subjects dropping/coming) before confirm, PLUS a **1st/2nd Semester switcher** on Manage Sections and Manage Schedules. (`role-admin/copy-year.js`, `shared/lib/year-copy.js`, sections.semester exists)
- [ ] Subject codes: only `21CLIT->LIT21`, `III->INQUIRY`, `KPWKP->KOMPAN`. LIVE SQL: show user + ask first. Mirror in backup SQL + `dev/scripts/seed/curriculum.mjs`.
- [ ] Grading scale buttons: layout/alignment only (`role-admin/admin-subjects-page.js` ~L160-200, `admin-subjects.html` L40-60).
- [ ] Full labels: dates only – spell out months ("Last saved October 22, 2026"). Places: `admin-subjects-page.js` L192, `admin-schedules-page.js` L141, `admin-school-years-page.js` L34.

### Faculty
- [ ] Bulk upload (`role-faculty/faculty-upload-page.js`, `shared/lib/grades.js parseGradeCsv`): ID must be in chosen class roster; no duplicate IDs; whole-number scores only; name mismatch (template has `student_name` last column) -> dialog "Fix file / Save anyway"; if user fixed & re-uploaded with same mismatches, those rows block.
- [ ] Negative grades invalid: block minus key + instant invalid style on grade sheet (`faculty-grades-page.js` L61,64,234); verify upload rejects.
- [ ] Attendance + Grade sheet: separate Student ID and Student Name columns (`faculty-attendance-page.js` L30-34, `faculty-grades-page.js` L64 + html headers).
- [ ] Names "Last, First" + sort by last name: Faculty (class list, attendance, grades, upload template) AND Registrar tables incl. shifting picker.

### Registrar
- [ ] Transfer & Shifting student table: sticky `<thead>` (`role-registrar/student-records.html` ~L430, `.table-scroll`).

### Restore Changes (extra)
- [ ] App-wide: single-action table cells show the plain button, no "..." menu (`shared/ui/ui-theme.js installTableActionMenus` ~L1313; keep menu when 2+ actions).
- [ ] `shared/ui/restore-changes.js`: separate Expires column, "Restored" badge, color-coded Added/Edited/Deleted tags, filter bar (see `shared/ui/filter-bar.js`).

## Suggested order
1 quick fixes -> 2 names -> 3 grade input/upload -> 4 restore UI -> 5 subject code SQL -> 6 semester copy.

## Status snapshot (UNCOMMITTED – nothing committed yet on this branch)
DONE in working tree (code written; last `npm run check` + `npx vite build` rerun still PENDING – run them first):
- Student attendance hides Present (`.neq('status','Present')`).
- Grading scale buttons: new `.scale-actions` row (html + CSS in `shared/ui/ui-theme.js`).
- Full-month dates (subjects, schedules, school years).
- Shifting picker sticky thead (CSS `.shift-student-picker thead th`).
- Single-action cells skip the "..." menu (`installTableActionMenus`, `actions.length === 1`).
- Names: helpers `lastFirst`, `byLastName` in `shared/lib/html.js`; applied to faculty (common sorts enrollments, class list, dashboard, attendance, grades, upload template) and registrar (sectioning, shifting, academic). Student ID / Student Name split on Attendance + Grade sheet (html + page js, colspans bumped).
- Grade sheet: minus/e/+ keys blocked, red `:invalid` style on `#grade-table` number inputs.
- Bulk upload: whole-number scores (`shared/lib/grades.js`), roster/duplicate/name checks + "Save anyway / Fix file" dialog in `role-faculty/faculty-upload-page.js` (`warnedNames` set blocks repeats). Updated `check-grade-upload.mjs` and `check-faculty-grades.mjs` expectations.

TODO next: run `npm run check` and `npx vite build`; fix failures; tick boxes above; commit (prefix, no co-author); then Restore Changes UI, subject-code SQL (ask user first), semester copy + switcher, upload/names unit checks.

## Log
- 2026-10-27: branch created, plan agreed.
- 2026-10-27: items under "DONE in working tree" implemented, not yet committed or fully verified.
