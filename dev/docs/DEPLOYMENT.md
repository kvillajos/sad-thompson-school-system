# Deployment

Static site on **Vercel** (Vite build → `dist/`), data and auth on **Supabase**.

## 1. Before every deploy

```
npm install
npm run check    # all automated checks must PASS
npm run build    # all 19 pages must compile
```

Then run the manual acceptance scripts in [TESTING.md](TESTING.md) on the Vercel preview URL.

## 2. Database (Supabase)

1. Back up first (Supabase dashboard → Database → Backups, or `pg_dump`). Local backups go in `dev/backups/` (git-ignored).
2. Run [`dev/database/backupsqlmigration.sql`](../database/backupsqlmigration.sql) in the Supabase SQL Editor. It is the single,
   complete schema (base + migrations v2-v38) and is safe to re-run.
   - It drops the legacy `student_enrollments` table if it still exists. Check that it holds no data you need.
   - Supabase stops auto-granting Data API access to new tables on **2026-10-30**. Migration v10 already covers
     this: it grants existing tables to `authenticated` and sets default privileges so future tables get the same.
     A new table that must be readable **before login** also needs an explicit `grant select ... to anon`.
3. Run `notify pgrst, 'reload schema';` so the API sees new tables and functions.
4. New database changes: append a new numbered `BEGIN/END migration-vNN` block to the end of that same file.

## 3. Edge Function (`supabase/functions/provision-account`)

It handles account provisioning, deactivate/activate, and password reset from Manage Accounts.

```
supabase secrets set APP_ORIGIN=https://<your-production-domain>
supabase functions deploy provision-account
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically.
`APP_ORIGIN` must match the deployed site exactly (CORS).

## 4. Supabase Auth settings

- **Site URL**: the production origin.
- **Redirect URLs**: add `https://<your-production-domain>/verify-reset-code.html` (forgot-password sends users there).
- **Password recovery email template**: must include the 6-digit code (`{{ .Token }}`); the reset flow is
  `forgot-password.html` → `verify-reset-code.html` (OTP) → `reset-password.html`.

## 5. Vercel project

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Env `VITE_SUPABASE_URL` | Supabase project URL |
| Env `VITE_SUPABASE_ANON_KEY` | Supabase **anon / publishable** key only |

Never put the service-role key in a `VITE_` variable: anything prefixed `VITE_` is shipped to the browser
(`npm run check:key-boundary` guards this).

The login screen shows a build label (`<branch> · <build time>`), taken from the commit message prefix
`<branch>/main - ...` (see `vite.config.js`). Use it to confirm which build is live.

Security headers live in [`vercel.json`](../../vercel.json). The Content-Security-Policy is still **Report-Only**.
After a clean run through every role with no CSP violations in the browser console, rename the header to
`Content-Security-Policy` to enforce it.

## 6. After the first production deploy

- Test every role (administrator, registrar, faculty, student) against the live database.
- Rotate the Supabase JWT/API keys if they were ever shared during development, then update the Vercel env vars.
- Seed scripts (`npm run seed:*`, `provision:accounts`) need `SUPABASE_SERVICE_ROLE_KEY` in the **local** shell only.
