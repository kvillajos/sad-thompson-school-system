# Security hardening plan (handoff, written 2026-10-22)

For the next AI agent session on TCSMS. Four fixes from a deployment security checklist review, all
approved by the user. Read the ground rules first, then work the tasks in order. Delete this file when every
task is done (or move what is still open into `ARCHITECTURE.md` → Known limits).

## Ground rules (from the user, non-negotiable)

- **Ask whenever unsure** (scope, wording, design). Use the question tool; do not guess.
- **Never run SQL on the live database yourself.** Write each change as a new numbered block at the end of
  `dev/database/backupsqlmigration.sql` (`-- BEGIN migration-vNN-....sql (written <date>, NOT yet applied live)`
  ... `-- END ...`, wrapped in `begin; ... commit;`, ending with `notify pgrst, 'reload schema';`), update the
  "migrations v2-vNN" count on line 3 and in `dev/docs/ARCHITECTURE.md` → Database, then hand the block to
  the user to run in the Supabase SQL Editor. When they confirm, verify it (see "Verifying live" below) and
  change the header to `(applied live <date>)`.
- **Suggest a snapshot first** for anything that deletes or rewrites data:
  `dev/backups/snapshot-2026-10-22.sql` / `restore-2026-10-22.sql` are the template (copy, replace the date).
  `dev/backups/` is git-ignored. None of the tasks below should need one.
- **Do not commit or push until the user says so.** The working tree already holds uncommitted work the user
  is still reviewing (grades 7-12 offered switch + v40, ⋯ menu icons, single Remove on Manage Subjects).
  When asked to commit: branch `Refractored-Version`, message prefix `Refractored-Version/main - `, no
  Co-Authored-By/Claude lines, push the branch and `Refractored-Version:main` to both remotes `origin` and
  `destination`, then fast-forward local `main`. Leave `.claude/` and `.mcp.json` untracked.
- Before finishing any task: `npm run check` (all pass), `npx prettier --check .`, `npm run build`, then
  delete `dist/`. Keep code in the surrounding style (no semicolons, single quotes, 140 cols).
- Explain to the user in plain words; they are a student, this is a school project with no real users yet.

## Task 1 - Server-side upload limits + stop listing profile pictures (SQL only)

**Why:** file type and size are only checked in the browser; anyone calling Storage directly can upload any
file of any size. The `profile-pictures` bucket also has a `select` policy for `public`, which lets anyone
**list** every file in it (public URLs do not need that policy).

**Current state**
- Buckets created in the base schema: `admission-documents` (private) line ~289, `profile-pictures` (public)
  line ~478 of the SQL file. No `file_size_limit` / `allowed_mime_types` anywhere.
- Policies: `profile_pictures_read` (`for select to public`), `profile_pictures_upload`, `profile_pictures_update`
  (lines ~518-531); `admission_documents_upload` / `_read` (v38, lines ~3705-3711).
- Browser limits to mirror: photos PNG/JPEG/WebP up to 3 MB (`role-registrar/registrar-admissions.js:98,215`,
  `role-student/student-dashboard-page.js:327`); the profile modal crops to a PNG `File`
  (`shared/ui/shell.js:521-523`); admission documents PDF/JPEG/PNG up to 5 MB (`registrar-admissions.js:235`).
- No code calls `.list()`, `.remove()` or `upsert: true` on Storage (grep confirmed), so dropping the public
  select policy should not break uploads. Admission document links use `createSignedUrl` (10 minutes), keep them.

**Do**
1. New block (next free number, v41 if nobody used it):
   ```sql
   update storage.buckets set file_size_limit = 3145728, allowed_mime_types = array['image/png','image/jpeg','image/webp']
     where id = 'profile-pictures';
   update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['application/pdf','image/jpeg','image/png']
     where id = 'admission-documents';
   drop policy if exists profile_pictures_read on storage.objects;
   ```
   Check first whether anything reads `profile-pictures` through the API instead of the public URL
   (grep `from('profile-pictures')`); `getPublicUrl` is fine.
2. After the user runs it, verify in the browser: registrar admission photo + document upload, student
   dashboard photo, profile modal photo (any role) still work; an oversized file is refused by Storage too.

## Task 2 - Protect the login username lookup

**Why:** the login page turns a username into an email with the RPC `find_login_email`, callable by anyone
without signing in (`grant execute ... to anon`, SQL ~line 1866). Usernames are predictable (first initial +
last name, e.g. `jtalaba`), so a script could harvest real emails, with no attempt limit.

**Current state**
- Caller: `auth/login-page.js:97-100` (an email typed into the box is used as-is, without the RPC).
- The function's **body is not in `backupsqlmigration.sql`** (only its grants are). First ask the user to run
  `select pg_get_functiondef('public.find_login_email'::regproc);` in the SQL Editor and paste the result,
  then add the full current definition to the new block so the file matches live.

**Recommended design (confirm with the user before writing it):** throttle inside the database function.
- New table `login_lookup_attempts (id bigserial, username text, ip text, at timestamptz default now())`,
  RLS enabled with **no** policies (only the security-definer function writes it).
- In `find_login_email`: read the caller IP from
  `split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)`;
  delete rows older than 1 day; if this username had > 10 lookups in 15 minutes, or this IP > 30 lookups in
  15 minutes, `raise exception 'Too many sign-in attempts. Try again in 15 minutes.'`; otherwise insert a row and
  return the email as today. Keep `security definer set search_path = public` (check-rbac requires it).
- `login-page.js` must show that message (check how it renders RPC errors today; reuse `describeError` if so).
- Rejected alternative: a login Edge Function that signs in server-side never exposes the email, but every
  sign-in would then come from the function's IP, so Supabase Auth's per-IP limit would hit all users at once.
- Also tell the user to review **Dashboard → Authentication → Rate Limits** (sign-in, password reset emails,
  OTP verification). That is where "max failed attempts per IP" lives; it cannot be set from SQL.
- Verify live: 11 quick lookups for one test username return the throttle error; a normal login still works.
  Use a throwaway username, not a real account, and tell the user it will clear itself after 15 minutes.

## Task 3 - User ID + IP address on every audit entry

**Why:** `audit_logs` (base schema, line ~96: `actor text, action, entity_type, entity_id, details, created_at`)
records who by username only, with no IP address.

**Do**
1. SQL: `alter table audit_logs add column if not exists actor_user_id integer, add column if not exists ip_address text;`
   plus a `before insert` trigger on `audit_logs` that fills them when empty:
   - `actor_user_id`: `select user_id from users where lower(email) = lower(auth.jwt() ->> 'email')`
     (works inside security-definer RPCs because the request JWT is still set; null for cron/archive jobs).
   - `ip_address`: same `x-forwarded-for` expression as Task 2.
   Rows are written only by database functions and triggers (users have a select policy only, line ~342), so
   no policy changes are needed. `archive_audit_logs()` stores `to_jsonb(row)`, so archives pick up the
   new columns automatically; confirm by reading it (~line 1311).
2. UI: `role-admin/admin-audit-page.js:20` builds each row (`auditRow`). **Ask the user** whether the IP
   should be a new table column or only appear in the row's details; the table is already wide on mobile.
   `dev/scripts/checks/check-audit-trail.mjs` matches `const auditRow = row =>.*data-label="When"...data-label="Details"`,
   so keep those labels in that order.
3. Only new entries get the values; old rows stay null. Say so to the user.

## Task 4 - Enforce the Content-Security-Policy

**Why:** `vercel.json` sends `Content-Security-Policy-Report-Only`, which reports but blocks nothing.
`dev/docs/DEPLOYMENT.md:62-63` says to enforce it after a clean run through every role.

**Do**
1. `npm run build` then `npx vite preview --port 4173 --strictPort` (run in the background; stop it after).
2. With the Playwright tools: add the policy as an **enforced** header to every document response
   (`page.route('**/*', ...)` fulfilling with the original response plus
   `content-security-policy: <the value from vercel.json>`), and an init script that records
   `securitypolicyviolation` events into `window.__csp`. Then sign in as each role and visit every page in
   `vite.config.js` → `pages`, exercising at least: Download PDF and Print in the PDF preview
   (`shared/documents/pdf-preview.js`, uses html2pdf.js, whose bundle contains an `eval`/`new Function`
   reference, the most likely thing to break), admission camera capture and photo crop (blob/data images),
   profile picture change, announcements, dark-mode toggle, every ⋯ action menu (icons are `data:` SVG
   masks set as inline styles; `style-src 'unsafe-inline'` should cover them, confirm).
3. Fix violations by changing code where reasonable; widen the policy only when unavoidable, and tell the user
   exactly what was widened and why. Then rename the header key to `Content-Security-Policy` in `vercel.json`
   and update `DEPLOYMENT.md` (lines 62-63) and `ARCHITECTURE.md` → Known limits (the "Report-Only" line).
4. After the user deploys: open the live site in the browser once per role and confirm no CSP errors.

## Decided, do not reopen

- Off-site automated backups: **skipped for now**; the user keeps taking manual snapshots before risky changes.
- Per-user API rate limits (60-100/min): not possible, because the browser talks to Supabase directly. Access
  rules (RLS) are the protection.
- Export rate limits: PDFs are generated in the browser, so there is no server cost.
- Parent role: not part of this system.
- HttpOnly cookies: Supabase keeps the session in browser storage; changing that needs a server layer.
  Enforcing the CSP (Task 4) is the mitigation.

## Verifying live (how this project does it)

- Test logins are in `.env.test` (`TEST_ADMIN_USER/PASS`, `TEST_REGISTRAR_*`, `TEST_FACULTY_*`, `TEST_STUDENT_*`);
  the Supabase URL and anon key are in `.env`. Never print their values.
- Read-only checks: a temporary `zz-*.mjs` script in the repo root (so `@supabase/supabase-js` resolves) that
  parses both files, signs in via `rpc('find_login_email')` + `auth.signInWithPassword`, queries, signs out;
  run it with `node`, then delete it. (After Task 2, lookups count toward the throttle, so sign in by email.)
- Browser checks: Playwright MCP. Its `run_code` sandbox has no `fs`/`process`/`import`, so read `.env.test`
  by navigating to `file:///C:/Users/Acer/OneDrive/Documents/VSCode/sad-thompson-school-system-main/.env.test`
  and reading `document.body.innerText`. Screenshots may only be saved inside the repo; use `.playwright-mcp/`
  (git-ignored) and delete it afterwards. The dev server: `npx vite --port 5179 --strictPort` in the background.
- Never leave test data behind on the live database; if a test must write, ask the user first.

## Done when

Progress 2026-10-22: v41 (Task 1), v42 (Task 3) and v43 (feedback fixed/proof, not a security task) were run live
by the user; columns, bucket and the admin read were checked through the API. The v41 upload limits themselves
were not tested (an oversized upload needs a write). Task 2 will be v45 (limits chosen:
20 per username / 60 per IP in 15 minutes; `login-page.js` already shows the message), waiting for the live
function definition. Task 3: user chose a "By" column (actor · IP) and having the trigger fill an empty `actor`;
`archive_audit_logs()` lists its columns, so v42 updates it. **Do not deploy before v42 is live**: the Audit Trail
now selects `ip_address`. Task 4: admin, registrar, faculty and the sign-in pages are clean under an enforced
copy (PDF download/print, camera, crop, menus, theme); `TEST_STUDENT_*` login failed, so the student
dashboard was not checked; `vercel.json` switched.

- [x] Task 1 block written, run by the user, header marked applied (upload limits not yet tried with a real oversized file)
- [ ] Task 2 function definition captured, throttle written, run, verified; user told about Auth rate limits
- [x] Task 3 columns + trigger run and verified; Audit Trail shows the new data the way the user chose
- [ ] Task 4 every role clean under the enforced policy (student pending); `vercel.json` switched; docs updated
- [ ] `npm run check`, Prettier, build all pass; nothing committed until the user asks
