# TCSMS Registry & Student Records – Sprint Extension

This version extends the existing Thompson Christian School Management System login-screen project with the requested Registry & Student Records workflow.

## Included

1. Admission Application Intake
   - Responsive application form
   - Browser validation
   - Supabase/database validation
   - Birth certificate/report card/other document uploads
   - Draft save + resume later
   - Submit confirmation

2. Enrollment Processing
   - Submitted → Under Review → Approved/Rejected → Enrolled workflow support
   - Registrar review screen
   - Approval/rejection remarks
   - Notifications and audit entries
   - Approved applications create official student records

3. Sectioning & Automatic Placement
   - Grade-level eligibility
   - Capacity checking
   - Age cutoff checking
   - Special-program matching
   - Balanced automatic placement
   - Manual override
   - Full-section/waitlist error handling

4. Academic History
   - CRUD-style entry
   - CSV import
   - Indexed student/year/subject lookups

5. Transcript
   - Dynamic student + academic-history data
   - Official-looking print template
   - Browser print / Save as PDF

6. Batch Promotion
   - Grade-level bulk processing
   - Passing threshold of 75
   - Retained/incomplete handling
   - Promotion audit logging

7. Student Shifting
   - Target section validation
   - Capacity/grade checks
   - Atomic database function
   - Shift history + notification + audit log

8. Registrar Feedback
   - Structured pain-point/priority/fix log

## Setup

1. Open the project folder in VS Code.
2. Run `npm install`.
3. In Supabase SQL Editor, run `supabase-migration.sql`.
4. Make sure `.env` contains your existing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values.
5. Create/configure the private `admission-documents` storage bucket (the migration creates it).
6. Run `npm run dev`.

## Important schema note

The SQL migration defines canonical `students`, `enrollments`, and `sections` tables. If Sprint 1 already created these tables with different column names/types, do not blindly duplicate them. Map the functions/UI queries to the existing Sprint 1 schema first so the foreign keys remain consistent.

## Security note

The migration uses authenticated RLS policies as a baseline. For production, restrict policies to the registrar/admin roles rather than allowing every authenticated account to access registrar data. Do not commit real Supabase secrets or service-role keys.
