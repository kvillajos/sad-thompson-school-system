# Thompson Christian School Management System (TCSMS)

Vite + vanilla JavaScript + Supabase, deployed on Vercel. Roles: administrator, registrar, faculty, student.

## Run it

```
npm install
cp .env.example .env   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (never commit .env)
npm run dev            # local site
npm run build          # production build -> dist/
npm run preview        # serve the production build locally
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
dev/                                  development only: database/ (SQL migrations)
```
