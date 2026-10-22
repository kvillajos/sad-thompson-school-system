# Ideas for later

Possible additions to TCSMS, gathered 2026-10-22. Nothing here is planned or built yet; pick from it when
deciding what to do next.

## Next steps that build on what exists

1. **Honor roll and awards.** List students automatically from their general average using the DepEd
   brackets: With Honors 90-94, With High Honors 95-97, With Highest Honors 98-100. Printable per section
   or grade level. The grades are already stored.
2. **DepEd grade components.** DepEd computes each quarter grade from Written Works, Performance Tasks and
   the Quarterly Assessment, weighted by subject (for example 30/50/20). Faculty would enter the parts and
   the quarter grade would be calculated, like the Final Grade and the grading scale are now.
3. **School-year rollover.** One guided screen to start a new year: copy sections, carry over lunch times and
   the grading scale, promote students and open enrollment. Today these steps are spread across pages.
4. **Document requests.** A student requests a Form 137, Good Moral certificate or Certificate of
   Enrollment; the registrar approves, prints and marks it ready. Same request-and-status pattern as
   feedback.

## Reports

5. **DepEd School Forms export.** SF1 (class register) and SF2 (daily attendance) as Excel files, which
   teachers have to submit anyway.
6. **Attendance alerts.** Flag students with repeated absences for faculty and the registrar.
7. **Section and subject analytics.** Pass and fail rates, averages per section and subject, and each
   teacher's class load.
8. **CSV export** of the audit trail and the feedback list.

## Usability for the handover

9. **In-app help.** A short "How do I..." page per role (for example: bring back a grade level, change
   the grading scale), for people new to the system.
10. **Bulk student import** from a spreadsheet at the start of a school year.
11. **Announcement improvements.** Schedule a post for later, and see who has read it.

## Suggested first picks

Honor roll, in-app help and school-year rollover: they are visible, need no outside services, and make the
system easier for the next people to run.

## Still open

- Login lookup throttle (SQL v46): needs the live `find_login_email` definition first (see
  `SECURITY-PLAN.md`).
- Student role pages have not been checked in a browser under the enforced Content-Security-Policy.
