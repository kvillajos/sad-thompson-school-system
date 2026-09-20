# Bugfix Log

| Symptom | Root cause | Fix | Verification |
| --- | --- | --- | --- |
| Transcript depended on a pop-up window | Separate-document rendering path | Render into the shared in-page print container | `npm run check:transcript`, `npm run check:print` |
| Semester detail was unavailable to students | Dashboard only selected yearly rows | Added quarter-aware semester expansion and filters | `npm run check:semester`, `npx vite build` |
| Runtime promise failures could leave loading UI visible | No global rejection handler | Install normalized handlers from `applyUiTheme()` | `npm run check:errors` |
| Promotion results lacked a corresponding audit event | Promotion RPC only wrote promotion_logs | Added v7 promotion-log audit trigger | `npm run check:audit` |
