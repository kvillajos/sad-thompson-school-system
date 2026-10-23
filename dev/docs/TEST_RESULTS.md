# Test Results

Date: 2026-09-19
Branch: `feature/semester-transcript-pdf-audit`

Focused checks and the production build passed on this branch:

```text
PASS npm run check:semester
PASS npm run check:transcript
PASS npm run check:print
PASS npm run check:errors
PASS npm run check:rbac
PASS npm run check:audit
PASS npm run check:e2e
PASS npm run check:admin-lock
PASS npm run check:registrar-flow
PASS npm run check:registrar
PASS npm run check:report-card
PASS npx vite build
```

Live Supabase role testing remains a deployment prerequisite after migrations v2-v7 are applied.
