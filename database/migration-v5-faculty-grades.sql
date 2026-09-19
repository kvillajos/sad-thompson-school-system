-- TCSMS v5: faculty grade entry.
-- Run this in the Supabase SQL Editor AFTER supabase-migration.sql, migration-v2-features.sql,
-- migration-v3-registrar-ui.sql and migration-v4-registrar-workflows.sql.
--
-- The registrar's Academic History panel is read-only, so the faculty who teach a section
-- record the grades. Reading stays role-based: role 3 already sees the rosters and schedules,
-- and this file adds the academic records of the students in those sections.

-- ============================================================
-- 1. Who a faculty member may read and grade
-- ============================================================
-- Mirrors faculty_enrollment_roster / faculty_students: the faculty member named on a
-- subject_schedules row sees the students enrolled in that section. All three helpers are
-- security definer so a policy using them does not re-enter RLS.
create or replace function faculty_section_ids()
returns setof integer language sql stable security definer set search_path = public as $$
  select distinct ss.section_id
  from subject_schedules ss
  join staff_profiles sp on lower(trim(ss.faculty_name)) = lower(trim(sp.first_name || ' ' || sp.last_name))
  where sp.user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active)
$$;

create or replace function faculty_teaches_subject(p_subject_id integer)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subject_schedules ss
    join staff_profiles sp on lower(trim(ss.faculty_name)) = lower(trim(sp.first_name || ' ' || sp.last_name))
    where ss.subject_id = p_subject_id
      and sp.user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active)
  )
$$;

create or replace function faculty_teaches_student(p_student_id integer)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e
    where e.student_id = p_student_id
      and e.status = 'active'
      and e.section_id in (select faculty_section_ids())
  )
$$;

-- The grade sheet prefill and any faculty review read this way; writes go through the RPC below.
drop policy if exists faculty_academic_read on academic_history;
create policy faculty_academic_read on academic_history for select to authenticated
  using (faculty_teaches_student(academic_history.student_id));

-- ============================================================
-- 2. One validated writer for grade entry
-- ============================================================
-- registrar_workflow_actor() is role-generic (it checks role_id = p_role), so role 3 reuses it.
-- The function rejects a subject the caller does not teach, students outside the caller sections,
-- and a row with no grade to record. academic_history.grade stays the value promotion,
-- transcripts and the registrar card read: final, else the average of the four quarters, else
-- midterm. A row locked by the registrar is still protected by the v4 trigger.
create or replace function save_faculty_grades(p_subject_id integer, p_school_year text, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor text; subject_name text; year_text text; r record; saved integer := 0; grade_value numeric(5,2);
begin
  actor := registrar_workflow_actor(3);
  year_text := trim(coalesce(p_school_year, ''));
  if year_text = '' then raise exception 'A school year is required'; end if;
  if coalesce(jsonb_typeof(p_records), 'null') <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'No grade rows were submitted';
  end if;
  select subject_name into subject_name from subjects where subject_id = p_subject_id;
  if subject_name is null then raise exception 'Subject not found'; end if;
  if not faculty_teaches_subject(p_subject_id) then raise exception 'You do not teach this subject'; end if;

  for r in select * from jsonb_to_recordset(p_records) as x(
      student_id integer, first_sem_q1 numeric, first_sem_q2 numeric, second_sem_q1 numeric,
      second_sem_q2 numeric, midterm numeric, final numeric, letter_grade text, remarks text) loop
    if not faculty_teaches_student(r.student_id) then
      raise exception 'Student % is not enrolled in one of your sections', r.student_id;
    end if;
    -- The same order the grade sheet previews, so faculty see what will be stored.
    grade_value := coalesce(
      r.final,
      case when r.first_sem_q1 is not null and r.first_sem_q2 is not null
                and r.second_sem_q1 is not null and r.second_sem_q2 is not null
           then round((r.first_sem_q1 + r.first_sem_q2 + r.second_sem_q1 + r.second_sem_q2) / 4, 2)
      end,
      r.midterm);
    if grade_value is null then
      raise exception 'Student % needs a Final, a Midterm, or all four quarter scores', r.student_id;
    end if;
    insert into academic_history(student_id, school_year, subject, grade, remarks, first_sem_q1,
        first_sem_q2, second_sem_q1, second_sem_q2, midterm, final, letter_grade)
    values (r.student_id, year_text, subject_name, grade_value, r.remarks, r.first_sem_q1,
        r.first_sem_q2, r.second_sem_q1, r.second_sem_q2, r.midterm, r.final, r.letter_grade)
    on conflict (student_id, school_year, subject) do update set
      grade = excluded.grade, remarks = excluded.remarks, first_sem_q1 = excluded.first_sem_q1,
      first_sem_q2 = excluded.first_sem_q2, second_sem_q1 = excluded.second_sem_q1,
      second_sem_q2 = excluded.second_sem_q2, midterm = excluded.midterm, final = excluded.final,
      letter_grade = excluded.letter_grade;
    saved := saved + 1;
  end loop;

  insert into audit_logs(action, entity_type, entity_id, details)
  values ('SAVE_FACULTY_GRADES', 'subject', p_subject_id,
    jsonb_build_object('school_year', year_text, 'subject', subject_name, 'records', saved, 'actor', actor));
  return jsonb_build_object('saved', saved, 'subject', subject_name, 'school_year', year_text);
end $$;