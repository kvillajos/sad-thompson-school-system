# Team tasks - who touches what

**Read first:** [readmeasAI.md](readmeasAI.md) (how the project is built). If you use an AI assistant, tell it to read that file before it changes anything.

Five tasks run at the same time. Each has its own branch and its own files. Staying inside your files is what keeps the merge painless.

| # | Task | Branch | Your files (edit freely) |
|---|------|--------|--------------------------|
| 1 | Dark mode | `dark-mode` | `public/css/theme-dark.css` |
| 2 | Mobile mode | `mobile-mode` | `public/css/responsive-mobile.css` |
| 3 | Tablet mode | `tablet-mode` | `public/css/responsive-tablet.css` |
| 4 | Forgot password | `forgot-password` | new `forgot-password.html/.js`, new `reset-password.html/.js`; one link line in `index.html`; entries in `vite.config.js` |
| 5 | Report card and transcript format | `report-card-transcript-format` | `report-card.js`, `transcript.js`, `pdf-preview.js`, `public/css/documents.css`, `scripts/check-report-card.mjs`, `scripts/check-transcript.mjs` |

## Rules

1. Start from the latest `main`: `git checkout main`, `git pull`, then `git checkout -b <your branch>` (or switch to your existing branch).
2. Put CSS in **your** file only. Do not edit `ui-theme.js`. The four `public/css` files load after it, so your rules win.
3. If you truly must change a shared file (`ui-theme.js`, `shell.js`, `html.js`, any `*-page.js`), keep it to a few lines and tell the lead first. Two people editing one file is where merges break.
4. Do not touch `database/backupsqlmigration.sql`, `package.json` or `package-lock.json`. Ask the lead: database changes need approval and go in one file in order.
5. Before you push, run `npm run build` and the check scripts for your area (`npm run` lists them). Fix anything you broke.
6. Commit small and often. Push your branch to **both** remotes:
   `git push origin <branch>` and `git push destination <branch>`.
   No pull requests, and never push to `main`. The lead merges the branches.
7. Do not commit passwords, keys or `backups/`.

## Notes per task

- **Dark mode:** use `html[data-theme="dark"]` (and optionally `prefers-color-scheme`). Colours are CSS variables at the top of `ui-theme.js` (`--ui-*`); override them in your file rather than restyling every element. A toggle button will need one small hook in `shell.js` - agree that edit with the lead.
- **Mobile / tablet:** keep every rule inside the media query already in your file. The sidebar and tables are the hard parts. A hamburger menu needs some JavaScript: put it in a new file (for example `responsive-nav.js`) and ask the lead to wire it, so mobile and tablet do not both edit `shell.js`.
- **Forgot password:** uses Supabase Auth (`resetPasswordForEmail`, then `updateUser` on the reset page). The redirect URL and email template are set in the Supabase dashboard - ask the lead. Follow the password rule (8+ characters, upper and lower case, a digit; see `passwordRules` in `shell.js`).
- **Report card / transcript:** builders are pure functions with checks in `scripts/`; keep them that way. The PDF preview window is `pdf-preview.js`; print rules for these documents live in `ui-theme.js` (`printing-*`) and new styling goes in `documents.css`.
