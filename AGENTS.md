# Rules for AI assistants working on this repository

These rules apply to every AI coding assistant (Claude Code, Codex, Cursor, Copilot, Gemini, and so on) and to the
people directing them.

## Never test or demo the database backup download

The admin **Download backup** feature (Reports & Audit) exports a copy of the whole live database: student
records, grades, attendance and account data. Running it copies real personal data out of the system, and every run is
written to the audit log.

**Any demo, test, test case, test plan, automated check, browser script (Playwright, Selenium, and so on) or seed run
SHALL exclude it.** In particular:

- Do not click, automate or script the `#download-backup` button.
- Do not call the database functions `backup_catalog`, `backup_table_sql` or `log_backup_download`, through the app,
  the Supabase API, the SQL editor or the CLI.
- Do not add steps that use it to `dev/docs/TEST-CASES.md`, `dev/docs/SYSTEM-TEST-CASES.md`,
  `dev/docs/DEFENSE-DEMO.md` or any new test or demo plan. If a plan lists features, mark it "excluded from testing".
- Static checks that only read the source code (no live database, no download) are allowed.

If a task seems to need a real backup, stop and ask the project lead (the repository owner) instead.
