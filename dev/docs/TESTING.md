# Testing

## Automated checks

```
npm run check        # runs every dev/scripts/checks/check-*.mjs, prints PASS/FAIL, exits 1 on any failure
npm run check:<name> # runs one check
npm run build        # every page must compile
npm run format       # Prettier (run before committing)
```

No frameworks, no network, no live database. Each check is a plain Node script using `node:assert`.

| Kind | Checks | What they prove |
| --- | --- | --- |
| **Pure logic** (Node only) | `copy`, `daytabs`, `edit-lock`, `edit-request`, `errors`, `fetch-all`, `pages`, `schedule-days`, `sectioning`, `semester`, `sort`, `timeout`, `transcript` | The pure helpers in `shared/lib`, `shared/ui` and `shared/documents` behave correctly |
| **Static source / SQL guards** | `attendance`, `audit`, `e2e`, `faculty`, `grades-upload`, `key-boundary`, `print`, `rbac`, `report-card`, `shared-helpers` | Page wiring, RLS/audit policy shape in `dev/database/backupsqlmigration.sql`, no service-role key in browser code, no re-declared `escapeHtml` |
| **Headless browser** (Chrome or Edge) | `admin-lock`, `dialogs`, `pdf`, `registrar`, `registrar-flow` | Real page markup + scripts run with a stubbed Supabase client |

Browser checks use the first installed Chrome/Edge (override with `BROWSER_PATH`). They print
"Browser produced no result" if another Edge window is open under the same Windows user - close it and rerun.

Static checks read source text, so they are written to tolerate Prettier's line wrapping (`\s*`, the `s` regex flag).
If you add one, run `npm run format` and then the check.

## Not covered automatically

- Live Supabase role testing (RLS against the real database) - do it after applying migrations.
- The browser's Print / Save as PDF dialog.
- Visual layout on real phones/tablets.

## Manual acceptance scripts

Sign-off each after a deploy to a staging/preview URL.

### Registrar

Sign in as a registrar.

1. Open Academic History and search a student.
2. Open View History, select a school year, and confirm semester rows and averages.
3. Open Transfer & Shifting and process a valid shift with a reason.
4. Open Transcript and use Print / Save as PDF.

Expected: the record is grouped by semester, the shift is atomic, and the transcript prints in-page.

Sign-off: ____________________ Date: __________

### Faculty grades

Sign in as faculty with an assigned schedule.

1. Open a class grade sheet and enter quarter/final values.
2. Upload a valid CSV, inspect the preview, then save.
3. Lock a registrar record and confirm faculty cannot overwrite it.

Expected: invalid rows block saving, derived grades match the shared scale, and locked records remain unchanged.

Sign-off: ____________________ Date: __________

### Faculty portal

Verify assigned schedules, student roster, attendance entry, grade entry, CSV preview, and save feedback.

Sign-off: ____________________ Date: __________

### Student portal

Verify Dashboard, Grades semester/year filters, Transcript preview/print, Schedule, Profile, and Attendance.

Sign-off: ____________________ Date: __________
