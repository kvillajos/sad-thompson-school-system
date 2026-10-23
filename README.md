# Thompson Christian School Management System

Vite + vanilla JavaScript + Supabase. Roles: administrator, registrar, faculty, student.

> **WORKING ON A TASK? READ THESE FIRST**
> 1. [dev/docs/readmeasAI.md](dev/docs/readmeasAI.md) - how the project is built. **If you use an AI assistant (Claude, Copilot, ...), make it read this file before it edits anything.**
> 2. [dev/docs/TEAM_TASKS.md](dev/docs/TEAM_TASKS.md) - which branch and files are yours. Stay inside them so merges do not collide.

## Run it

```
npm install
npm run dev      # local site
npm run build    # production build
npm run          # lists the check scripts (npm run check:<name>)
```

The Supabase keys go in a local `.env` (never commit it).

## Layout

```
index.html, forgot-password.html, verify-reset-code.html, reset-password.html   login + password-reset entry pages (root = stable URLs)
auth/            scripts for those pages (login-page.js, ...)
role-admin/      administrator pages + scripts
role-registrar/  registrar page (student-records.html) + modules
role-faculty/    faculty pages + scripts
role-student/    student dashboard + scripts
shared/          used by more than one role: ui/ (theme, shell, dialogs, tables), lib/ (auth, data, grades, errors), documents/ (report card, transcript, print/PDF)
public/          static assets and CSS
supabase/        edge function (provision-account)

dev/             development only - not part of the production build
  database/      SQL schema + migrations
  scripts/       checks/ (npm run check:*), seed/ (account seeding)
  docs/          project docs and handoff notes
  backups/       SQL backups (git-ignored)
```
