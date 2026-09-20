# Test Plan

| Item | Command | Proves | Limitation |
| --- | --- | --- | --- |
| 60 | `npm run check:semester` | Semester grouping, averages, and table output | Pure helper only |
| 61 | `npm run check:transcript` | Official/unofficial transcript contracts | Pure builder only |
| 55 | `npm run check:print` | Shared print helper and A4 rules | Browser print dialog remains manual |
| 64 | `npm run check:e2e` | Registrar, faculty, and student wiring | Static, no live database |
| 65 | `npm run check:rbac` | RLS and role policy shape | Static, no live probe |
| 66 | `npm run check:audit` | Audit actions and append-only policy | Static, no live database |
| 67 | `npm run check:errors` | Error classification | Browser event flow requires manual check |
| 70 | `npx vite build` | All pages compile | Does not replace acceptance review |
