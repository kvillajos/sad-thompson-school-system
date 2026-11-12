-- v68-seed-q1q2-grades.sql  (branch StrandsAndPastYears) - TEST DATA. NOT APPLIED: fails on the required grade column; use v69.
-- Fills SY 2026-2027 Q1 and Q2 grades (first_sem_q1 / first_sem_q2) so the Grade Tracker looks like a school
-- partway through the year: most classes complete, a few still in progress (and so late, as both deadlines
-- have passed).
--   * Classes come from teaching_records (v67): every 2026-2027 class whose subject is taught in the 1st
--     semester or the whole year. Senior High 2nd-semester subjects are graded in Q3/Q4 and are left alone.
--   * Roster: the section's active/completed 2026-2027 enrollments, as the tracker counts them.
--   * Existing scores are never overwritten (coalesce), and locked rows are skipped (they cannot change).
--   * Left in progress on purpose: about 1 class in 25 for Q1 and 1 in 12 for Q2, where roughly 40% of the
--     students still have no score. Everything else is complete.
--   * Scores 75-99: each student has a steady level (78-92) with a small per-subject, per-quarter spread.
--     Deterministic (hashtext), so running it twice gives the same result.
-- One transaction = one entry in Restore Changes, so the whole seed can be undone there.
begin;

with classes as (
  select distinct tr.section_id, tr.subject_id, sub.subject_name
  from teaching_records tr
  join subjects sub on sub.subject_id = tr.subject_id
  where tr.school_year = '2026-2027' and coalesce(sub.semester, 1) = 1
),
roster as (
  select c.section_id, c.subject_id, c.subject_name, e.student_id,
         abs(hashtext('q1:' || c.section_id || ':' || c.subject_id)) % 25 = 0 as q1_partial,
         abs(hashtext('q2:' || c.section_id || ':' || c.subject_id)) % 12 = 0 as q2_partial,
         78 + abs(hashtext('level:' || e.student_id)) % 15 as level
  from classes c
  join enrollments e on e.section_id = c.section_id and e.school_year = '2026-2027' and e.status in ('active', 'completed')
),
scores as (
  select student_id, subject_name,
    case when q1_partial and abs(hashtext('m1:' || student_id || ':' || subject_id)) % 10 < 4 then null
         else least(99, greatest(75, level + abs(hashtext('g1:' || student_id || ':' || subject_id)) % 9 - 4)) end as q1,
    case when q2_partial and abs(hashtext('m2:' || student_id || ':' || subject_id)) % 10 < 4 then null
         else least(99, greatest(75, level + abs(hashtext('g2:' || student_id || ':' || subject_id)) % 9 - 4)) end as q2
  from roster
)
insert into academic_history (student_id, school_year, subject, first_sem_q1, first_sem_q2)
select student_id, '2026-2027', subject_name, q1, q2
from scores
where q1 is not null or q2 is not null
on conflict (student_id, school_year, subject) do update set
  first_sem_q1 = coalesce(academic_history.first_sem_q1, excluded.first_sem_q1),
  first_sem_q2 = coalesce(academic_history.first_sem_q2, excluded.first_sem_q2)
where not academic_history.locked
  and (academic_history.first_sem_q1 is null or academic_history.first_sem_q2 is null);

commit;

-- Check (run separately): classes and how many are complete per quarter, the way the Grade Tracker counts.
-- with classes as (
--   select distinct tr.section_id, sub.subject_name from teaching_records tr join subjects sub using (subject_id)
--   where tr.school_year = '2026-2027' and coalesce(sub.semester, 1) = 1),
-- r as (
--   select c.section_id, c.subject_name, count(*) total,
--          count(ah.first_sem_q1) q1, count(ah.first_sem_q2) q2
--   from classes c
--   join enrollments e on e.section_id = c.section_id and e.school_year = '2026-2027' and e.status in ('active', 'completed')
--   left join academic_history ah on ah.student_id = e.student_id and ah.school_year = '2026-2027' and ah.subject = c.subject_name
--   group by 1, 2)
-- select count(*) classes, count(*) filter (where q1 = total) q1_complete, count(*) filter (where q2 = total) q2_complete from r;
