-- v69-seed-q1-complete-q2-few-missing.sql  (branch StrandsAndPastYears) - TEST DATA
-- Follows v68. SY 2026-2027 Grade Tracker:
--   * Q1: every class complete (every missing first_sem_q1 filled).
--   * Q2: every class complete except 3, which keep the gaps v68 left (they show as Late).
-- Same rules as v68: classes from teaching_records, the 1st-semester and whole-year subjects only; roster =
-- active/completed 2026-2027 enrollments; existing scores never overwritten; locked rows skipped; same
-- deterministic scores. One transaction = one entry in Restore Changes.
begin;

with classes as (
  select distinct tr.section_id, tr.subject_id, sub.subject_name
  from teaching_records tr
  join subjects sub on sub.subject_id = tr.subject_id
  where tr.school_year = '2026-2027' and coalesce(sub.semester, 1) = 1
),
roster as (
  select c.section_id, c.subject_id, c.subject_name, e.student_id,
         78 + abs(hashtext('level:' || e.student_id)) % 15 as level
  from classes c
  join enrollments e on e.section_id = c.section_id and e.school_year = '2026-2027' and e.status in ('active', 'completed')
),
-- The 3 classes that stay unfinished for Q2: picked (deterministically) among those still missing a Q2 score.
keep_q2_gaps as (
  select r.section_id, r.subject_id
  from roster r
  left join academic_history ah on ah.student_id = r.student_id and ah.school_year = '2026-2027' and ah.subject = r.subject_name
  where ah.first_sem_q2 is null
  group by r.section_id, r.subject_id
  order by abs(hashtext('keep:' || r.section_id || ':' || r.subject_id))
  limit 3
),
scores as (
  select r.student_id, r.subject_name,
    least(99, greatest(75, r.level + abs(hashtext('g1:' || r.student_id || ':' || r.subject_id)) % 9 - 4)) as q1,
    case when k.section_id is not null then null
         else least(99, greatest(75, r.level + abs(hashtext('g2:' || r.student_id || ':' || r.subject_id)) % 9 - 4)) end as q2
  from roster r
  left join keep_q2_gaps k on k.section_id = r.section_id and k.subject_id = r.subject_id
)
-- grade (required) follows save_faculty_grades: the typed final if any, else the average of the quarters entered.
insert into academic_history (student_id, school_year, subject, first_sem_q1, first_sem_q2, grade)
select student_id, '2026-2027', subject_name, q1, q2, round((q1 + coalesce(q2, q1)) / 2.0, 2)
from scores
on conflict (student_id, school_year, subject) do update set
  first_sem_q1 = coalesce(academic_history.first_sem_q1, excluded.first_sem_q1),
  first_sem_q2 = coalesce(academic_history.first_sem_q2, excluded.first_sem_q2),
  grade = coalesce(academic_history.final, (
    select round(avg(q), 2) from unnest(array[
      coalesce(academic_history.first_sem_q1, excluded.first_sem_q1),
      coalesce(academic_history.first_sem_q2, excluded.first_sem_q2),
      academic_history.second_sem_q1, academic_history.second_sem_q2]) q))
where not academic_history.locked
  and (academic_history.first_sem_q1 is null or academic_history.first_sem_q2 is null);

commit;

-- Check (run separately): q1_complete should equal classes; q2_complete should be classes - 3. A class still short
-- after this has a LOCKED grade row with the quarter missing (locked rows cannot change); the second query lists them.
-- with classes as (
--   select distinct tr.section_id, sub.subject_name from teaching_records tr join subjects sub using (subject_id)
--   where tr.school_year = '2026-2027' and coalesce(sub.semester, 1) = 1),
-- r as (
--   select c.section_id, c.subject_name, count(*) total, count(ah.first_sem_q1) q1, count(ah.first_sem_q2) q2
--   from classes c
--   join enrollments e on e.section_id = c.section_id and e.school_year = '2026-2027' and e.status in ('active', 'completed')
--   left join academic_history ah on ah.student_id = e.student_id and ah.school_year = '2026-2027' and ah.subject = c.subject_name
--   group by 1, 2)
-- select count(*) classes, count(*) filter (where q1 = total) q1_complete, count(*) filter (where q2 = total) q2_complete from r;
--
-- select ah.subject, count(*) from academic_history ah
-- where ah.school_year = '2026-2027' and ah.locked and (ah.first_sem_q1 is null or ah.first_sem_q2 is null) group by 1;
