# Bugfix Log

| Symptom | Root cause | Fix | Verification |
| --- | --- | --- | --- |
| Transcript depended on a pop-up window | Separate-document rendering path | Render into the shared in-page print container | `npm run check:transcript`, `npm run check:print` |
| Semester detail was unavailable to students | Dashboard only selected yearly rows | Added quarter-aware semester expansion and filters | `npm run check:semester`, `npx vite build` |
| Runtime promise failures could leave loading UI visible | No global rejection handler | Install normalized handlers from `applyUiTheme()` | `npm run check:errors` |
| Promotion results lacked a corresponding audit event | Promotion RPC only wrote promotion_logs | Added v7 promotion-log audit trigger | `npm run check:audit` |
| Login failures exposed different messages and cleared typed credentials | Unknown usernames and failed passwords used separate inline handling, while failed submits could be repopulated by the browser credential manager | Added one enumeration-safe message and shared failure helper that restores and focuses the typed fields | `npm run check:errors`, `npx vite build` |
| Subject schedules supported only one day and repeated subjects in the table | The form stored one selected day and rendered every database row directly | Added pure day diff/group helpers, atomic multi-day inserts, edit diffs, and grouped schedule rows | `npm run check:schedule-days`, `npx vite build` |
| Sections had no room data for schedule prefill | `sections` had no room column or Manage Sections field | Added `sections.room`, Manage Sections room editing, and schedule room prefill | `npx vite build` |
