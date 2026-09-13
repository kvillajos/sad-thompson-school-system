# TCSMS Peer Agent Handoff

## Clone This Branch

From a new empty folder:

```powershell
git clone --branch registrar-ui-updates --single-branch https://github.com/kvillajos/sad-thompson-school-system.git .
npm install
Copy-Item .env.example .env
```

Set the local `.env` values, then run:

```powershell
npm run dev
```

## Fetch Updates

Before making changes:

```powershell
git fetch origin
git pull --ff-only origin registrar-ui-updates
```

If local work exists, inspect `git status` before pulling. Do not reset or discard user changes without explicit approval.

## Create and Upload a Feature Branch

```powershell
git switch -c describe-your-change
git status
npx vite build
git diff --check
git add .
git commit -m "Describe the change"
git push --set-upstream origin describe-your-change
```

Open a pull request from that branch into `registrar-ui-updates`. Never force-push shared work.

## Mandatory Output-Reading Protocol

The agent must read the complete output of every command it runs. Do not claim success from a command that has not returned its final output.

- If a command says `Unauthorized`, `not logged in`, `PGRST`, `RLS`, `relation does not exist`, or `schema cache`, stop and report the exact error before changing unrelated code.
- If a browser page redirects to `/index.html`, treat that as an authentication/session failure, not as a successful page load.
- If a table says `Loading...`, inspect the browser console and network/data error before concluding the UI is empty.
- After any edit, run the narrowest available validation and read its result.
- Never replace an error with a success statement. Include the command output and the next concrete repair.

## Project Rules

- Read `docs/readmeasAI.md` before changing architecture.
- Keep root page URLs stable unless all redirects and links are updated together.
- Use `ui-theme.js` for shared sidebar and profile changes.
- Use `auth-client.js` for role checks and sign-out.
- Do not put Supabase service-role keys, passwords, or `.env` files in Git.
- Apply `database/supabase-migration.sql` before testing newly added tables or policies.
- If Supabase reports a legacy table such as `student_enrollments` while the app uses `enrollments`, stop and reconcile the schema instead of guessing.

## Validation

```powershell
npx vite build
git diff --check
git status --short
```
