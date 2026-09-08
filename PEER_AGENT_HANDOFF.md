# TCSMS Peer Agent Handoff

You are continuing work on the Thompson Christian School Management System.

## Repository

- Repository: `https://github.com/kvillajos/sad-thompson-school-system.git`
- Working branch: `registrar-ui-updates`
- Stack: Vite, vanilla HTML, JavaScript modules, Supabase
- Do not commit `.env`, passwords, service-role keys, or other secrets.

## Setup

Run these commands from a new empty folder:

```powershell
git clone -b registrar-ui-updates https://github.com/kvillajos/sad-thompson-school-system.git .
npm install
Copy-Item .env.example .env
```

Edit `.env` and obtain the Supabase values from the project owner. It should contain two unindented lines:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Start the development server:

```powershell
npm run dev
```

Open the localhost URL printed by Vite, normally `http://localhost:5173`.

If the login page is unstyled or displays a Supabase configuration warning, check that `.env` exists in the project root and restart Vite.

## Project Map

- `index.html`: login page
- `main.js`: login flow and role-based redirects
- `auth-client.js`: Supabase client, authentication, role checks, and sign-out
- `ui-theme.js`: shared runtime UI theme and profile menu
- `loading-screen.js`: loading overlay
- `student-records.html`: registrar interface and inline base styles
- `registrar.js`: registrar data operations and workflows
- `admin-dashboard.html`: administrator dashboard
- `admin-sections.html`: section management
- `faculty-dashboard.html`: faculty dashboard placeholder
- `student-dashboard.html`: student dashboard placeholder
- `supabase-migration.sql`: database schema and functions
- `vite.config.js`: multi-page Vite build entries
- `.env.example`: safe environment-variable template

## Development Rules

1. Pull the latest branch before starting:

   ```powershell
   git pull origin registrar-ui-updates
   ```

2. Create a separate feature branch before editing:

   ```powershell
   git switch -c describe-your-change
   ```

3. Inspect nearby code and existing patterns before changing behavior.
4. Keep changes focused. Do not rewrite unrelated files or remove existing user changes.
5. Preserve the existing vanilla JavaScript and Vite approach unless the owner requests a framework change.
6. Use the existing Supabase helpers and database functions instead of duplicating authentication or data-access logic.
7. Never place Supabase secrets directly in source files.
8. Run validation after changes:

   ```powershell
   npx vite build
   git diff --check
   ```

9. Check that `.env` is not staged:

   ```powershell
   git status
   ```

## Saving Work

After testing:

```powershell
git add .
git commit -m "Describe the change"
git push -u origin describe-your-change
```

Open a pull request from the feature branch into `registrar-ui-updates`. Do not force-push or reset shared branches.

## Troubleshooting

- `npm` is not recognized: install Node.js, then reopen PowerShell.
- `npm install` fails: confirm internet access and that `package.json` is present.
- Supabase errors: confirm `.env` values, restart Vite, and verify the required migration has been run in Supabase.
- A page is unstyled: check the browser console for a module error, confirm `.env` exists, and run `npx vite build`.
- Do not fix unrelated failures without documenting them in the final response.
