# TCSMS Project Context

## Stack

- Vite with vanilla HTML and JavaScript modules
- Supabase Auth, Postgres, RLS, and Storage
- Role IDs: `1` administrator, `2` registrar, `3` faculty, `4` student

## Organization

- Root HTML files are the stable browser entry points.
- Shared runtime modules remain in the root: `auth-client.js`, `ui-theme.js`, `loading-screen.js`, `main.js`, and `registrar.js`.
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

## Remaining Work

- Reconcile the legacy database table name `student_enrollments` with the application table name `enrollments` if both exist in the Supabase project.
- Add richer faculty actions such as attendance and grade entry if required.
- Add account creation/editing actions if administrators need to provision accounts from the UI.
- Test every role after applying the latest migration and rotating Supabase JWT/API keys.

## Required Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set the Vite Supabase values.
3. Run `database/supabase-migration.sql` in Supabase SQL Editor.
4. Run `npm run dev`.
5. Use the service-role key only in a local terminal for seed scripts. Never commit or share it.

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
