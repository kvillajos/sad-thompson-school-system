# Thompson Christian School Management System (TCSMS)

Vite + vanilla JavaScript + Supabase, deployed on Vercel. Roles: administrator, registrar, faculty, student.

| Read | When |
| --- | --- |
| [dev/docs/ARCHITECTURE.md](dev/docs/ARCHITECTURE.md) | Before changing code. **AI assistants: read this first.** |
| [dev/docs/DEPLOYMENT.md](dev/docs/DEPLOYMENT.md) | Setting up Supabase / Vercel, or shipping a release |
| [dev/docs/TESTING.md](dev/docs/TESTING.md) | What the checks cover, plus manual acceptance scripts |

## Run it

```
npm install
cp .env.example .env   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (never commit .env)
npm run dev            # local site
npm run build          # production build -> dist/
npm run preview        # serve the production build locally
npm run check          # run every automated check
npm run format         # Prettier
```

## Layout

```
index.html + 3 password-reset pages   root entry pages (stable URLs)
auth/                                 scripts for those pages
role-admin/  role-registrar/  role-faculty/  role-student/   one folder per role: pages + their scripts
shared/ui/  shared/lib/  shared/documents/                   used by more than one role
public/                               static assets and CSS (served at the site root)
supabase/functions/                   Edge Function (provision-account)
dev/                                  development only: database/, scripts/checks/, scripts/seed/, docs/, backups/
```

Full map in [ARCHITECTURE.md](dev/docs/ARCHITECTURE.md#folder-layout).
