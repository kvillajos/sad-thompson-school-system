-- TCSMS v6: attendance, guardian/medical profile fields, academic lock RPC, and reporting views.
-- Run this in the Supabase SQL Editor AFTER supabase-migration.sql, migration-v2-features.sql,
-- migration-v3-registrar-ui.sql, migration-v4-registrar-workflows.sql and
-- migration-v5-faculty-grades.sql.

-- ============================================================
-- 1. Attendance: per-session records instead of one row per day
-- ============================================================
-- migration-v2 only ever recorded one Present/Absent/Late row per student per day with no
-- link to which class took it. Faculty now record attendance per section + subject, so the
-- same student can have independent attendance for different subjects on the same date.
-- attendance_date/status are added defensively too: some projects' `attendance` table
-- predates migration-v2-features.sql and never picked up those columns.
alter table attendance add column if not exists attendance_date date;
alter table attendance add column if not exists status text;
alter table attendance add column if not exists section_id integer references sections(section_id) on delete cascade;
alter table attendance add column if not exists subject_id integer references subjects(subject_id) on delete cascade;
alter table attendance add column if not exists recorded_by text;
alter table attendance add column if not exists remarks text;
alter table attendance add column if not exists updated_at timestamptz not null default now();

alter table attendance drop constraint if exists attendance_student_id_attendance_date_key;
do $$ begin
  alter table attendance add constraint attendance_session_unique unique (student_id, attendance_date, section_id, subject_id);
exception when duplicate_object then null; end $$;

alter table attendance drop constraint if exists attendance_status_check;
do $$ begin
  alter table attendance add constraint attendance_status_check check (status in ('Present','Late','Absent','Excused'));
exception when duplicate_object then null; end $$;

-- ============================================================
-- 2. RLS: faculty read/write is scoped to the sections they teach
-- ============================================================
-- Reuses faculty_section_ids()/faculty_teaches_student() from migration-v5 instead of a
-- new pair of helpers. Direct writes stay admin/registrar-only; faculty write through
-- save_attendance() below so every insert is validated and audit-logged.
drop policy if exists role_attendance on attendance;
drop policy if exists attendance_read on attendance;
drop policy if exists attendance_admin_write on attendance;
create policy attendance_read on attendance for select to authenticated using (
  (select current_app_role()) in (1,2)
  or ((select current_app_role()) = 3 and faculty_teaches_student(attendance.student_id))
  or exists (select 1 from users u where u.email = auth.jwt() ->> 'email' and u.student_id = attendance.student_id)
);
create policy attendance_admin_write on attendance for all to authenticated
  using ((select current_app_role()) in (1,2))
  with check ((select current_app_role()) in (1,2));

-- ============================================================
-- 3. One validated writer for attendance entry
-- ============================================================
-- Modelled line-for-line on save_faculty_grades (migration-v5-faculty-grades.sql:56-104):
-- rejects a section/subject the caller does not teach and a student outside their roster.
create or replace function save_attendance(p_section_id integer, p_subject_id integer, p_date date, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; r record; saved integer := 0;
begin
  actor := registrar_workflow_actor(3);
  if p_date is null then raise exception 'A date is required'; end if;
  if coalesce(jsonb_typeof(p_records), 'null') <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'No attendance rows were submitted';
  end if;
  if p_section_id not in (select faculty_section_ids()) then raise exception 'You do not teach this section'; end if;
  if not faculty_teaches_subject(p_subject_id) then raise exception 'You do not teach this subject'; end if;

  for r in select * from jsonb_to_recordset(p_records) as x(student_id integer, status text, remarks text) loop
    if not faculty_teaches_student(r.student_id) then
      raise exception 'Student % is not enrolled in one of your sections', r.student_id;
    end if;
    if r.status not in ('Present','Late','Absent','Excused') then
      raise exception 'Status must be Present, Late, Absent or Excused';
    end if;
    insert into attendance(student_id, attendance_date, status, section_id, subject_id, recorded_by, remarks)
    values (r.student_id, p_date, r.status, p_section_id, p_subject_id, actor, r.remarks)
    on conflict (student_id, attendance_date, section_id, subject_id) do update set
      status = excluded.status, remarks = excluded.remarks, recorded_by = excluded.recorded_by, updated_at = now();
    saved := saved + 1;
  end loop;

  insert into audit_logs(action, entity_type, entity_id, details)
  values ('SAVE_ATTENDANCE', 'section', p_section_id,
    jsonb_build_object('subject_id', p_subject_id, 'date', p_date, 'records', saved, 'actor', actor));
  return jsonb_build_object('saved', saved, 'date', p_date);
end $$;

-- ============================================================
-- 4. Attendance reporting: one summary view, one RPC
-- ============================================================
-- school_year is not stored on attendance itself; it comes from the section's
-- academic_year so a session always belongs to the year it was actually taken in.
create or replace view attendance_summary as
select a.student_id, s.academic_year as school_year,
  count(*) filter (where a.status = 'Present') as present_count,
  count(*) filter (where a.status = 'Late') as late_count,
  count(*) filter (where a.status = 'Absent') as absent_count,
  count(*) filter (where a.status = 'Excused') as excused_count,
  count(*) as total_count
from attendance a
left join sections s on s.section_id = a.section_id
group by a.student_id, s.academic_year;

create or replace function attendance_totals(p_student_id integer, p_school_year text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'present', coalesce(sum(case when a.status = 'Present' then 1 else 0 end), 0),
    'late', coalesce(sum(case when a.status = 'Late' then 1 else 0 end), 0),
    'absent', coalesce(sum(case when a.status = 'Absent' then 1 else 0 end), 0),
    'excused', coalesce(sum(case when a.status = 'Excused' then 1 else 0 end), 0),
    'total', count(a.*)
  )
  from attendance a
  left join sections s on s.section_id = a.section_id
  where a.student_id = p_student_id and (p_school_year is null or s.academic_year = p_school_year)
$$;

-- ============================================================
-- 5. Guardian contact and medical profile fields
-- ============================================================
alter table students add column if not exists guardian_name text;
alter table students add column if not exists guardian_relationship text;
alter table students add column if not exists guardian_phone text;
alter table students add column if not exists guardian_email text;
alter table students add column if not exists medical_notes text;
alter table students add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- 6. One validated writer for the student profile fields above
-- ============================================================
-- Pattern mirrors save_application_edit (migration-v4-registrar-workflows.sql): role-checked,
-- audit-logged, and only touches the columns this migration introduced.
create or replace function update_student_profile(p_student_id integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text;
begin
  select username into actor from users where lower(email) = lower(auth.jwt() ->> 'email')
    and is_active and role_id in (1,2) limit 1;
  if actor is null then raise exception 'Not authorized to edit student profiles'; end if;
  if not exists (select 1 from students where student_id = p_student_id) then raise exception 'Student not found'; end if;
  update students set
    guardian_name = nullif(trim(p_payload->>'guardian_name'), ''),
    guardian_relationship = nullif(trim(p_payload->>'guardian_relationship'), ''),
    guardian_phone = nullif(trim(p_payload->>'guardian_phone'), ''),
    guardian_email = nullif(trim(p_payload->>'guardian_email'), ''),
    medical_notes = nullif(trim(p_payload->>'medical_notes'), ''),
    updated_at = now()
  where student_id = p_student_id;
  insert into audit_logs(action, entity_type, entity_id, details)
  values ('UPDATE_STUDENT_PROFILE', 'student', p_student_id, jsonb_build_object('actor', actor));
  return jsonb_build_object('student_id', p_student_id);
end $$;

-- ============================================================
-- 7. Academic record lock/unlock RPC
-- ============================================================
-- migration-v4 added academic_history.locked and the protect_locked_academic_record()
-- trigger, but nothing could ever set the flag from the app. This is that missing half;
-- the trigger itself is untouched.
create or replace function set_academic_lock(p_student_id integer, p_school_year text, p_locked boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; affected integer;
begin
  actor := registrar_workflow_actor(2);
  update academic_history set locked = p_locked
  where student_id = p_student_id and school_year = p_school_year;
  get diagnostics affected = row_count;
  insert into audit_logs(action, entity_type, entity_id, details)
  values (case when p_locked then 'LOCK_ACADEMIC_RECORD' else 'UNLOCK_ACADEMIC_RECORD' end, 'student', p_student_id,
    jsonb_build_object('school_year', p_school_year, 'affected', affected, 'actor', actor));
  return jsonb_build_object('student_id', p_student_id, 'school_year', p_school_year, 'locked', p_locked, 'affected', affected);
end $$;

-- ============================================================
-- 8. Single source of truth for a student's general average
-- ============================================================
create or replace view student_general_average as
select student_id, school_year, round(avg(grade), 2) as general_average, count(*) as subject_count
from academic_history
group by student_id, school_year;

-- ============================================================
-- 9. Reconcile the legacy `student_enrollments` table
-- ============================================================
-- The app has only ever read/written `enrollments` (see migration-v2-features.sql); a
-- Supabase project created from an earlier draft schema can still have `student_enrollments`
-- sitting alongside it, unused and out of sync. Drop it once it is confirmed unused.
do $$ begin
  if to_regclass('public.student_enrollments') is not null then
    raise notice 'Dropping unused legacy table student_enrollments (superseded by enrollments)';
    execute 'drop table public.student_enrollments cascade';
  end if;
end $$;

