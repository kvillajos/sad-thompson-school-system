-- TCSMS consolidated database backup.
-- Run this file in Supabase SQL Editor as the single, complete database setup.
-- Source order: base schema, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14.


-- ============================================================
-- BEGIN supabase-migration.sql
-- ============================================================
-- TCSMS Registrar extension for the existing Sprint 1 schema.
-- Existing tables: users(user_id), students(student_id), sections(section_id).
-- Run this in the Supabase SQL Editor.

alter table sections add column if not exists academic_year text default '2025-2026';
alter table sections add column if not exists semester text default '1st Semester';
alter table sections add column if not exists faculty_assigned text;
alter table sections add column if not exists capacity integer default 40;
update sections set capacity = 40 where capacity is null;
alter table sections alter column capacity set default 40;
alter table sections alter column capacity set not null;

do $$ begin
  alter table sections add constraint sections_capacity_positive check (capacity between 1 and 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table sections add constraint sections_grade_level_valid check (grade_level between 0 and 12);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table sections add constraint sections_semester_valid check (semester in ('1st Semester', '2nd Semester'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table sections add constraint sections_academic_year_valid check (academic_year ~ '^[0-9]{4}-[0-9]{4}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table sections add constraint sections_name_grade_term_unique unique (section_name, grade_level, academic_year, semester);
exception when duplicate_object or duplicate_table then null; end $$;

alter table users add column if not exists student_id integer references students(student_id) on delete set null;

alter table students add column if not exists middle_name text;
alter table students add column if not exists date_of_birth date;
alter table students add column if not exists gender text;
alter table students add column if not exists grade_level integer;
alter table students add column if not exists enrollment_status text default 'active';

do $$ begin
  create type admission_status as enum ('draft','submitted','under_review','approved','rejected','enrolled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type promotion_result as enum ('promoted','retained','incomplete','held');
exception when duplicate_object then null; end $$;

create table if not exists admission_applications (
  id serial primary key, first_name text not null, middle_name text, last_name text not null,
  birth_date date, sex text, address text, guardian_name text, guardian_relationship text,
  guardian_phone text, guardian_email text, prior_school text, prior_grade text, grade_level text,
  special_program text, status admission_status not null default 'draft', remarks text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists application_documents (
  id serial primary key, application_id integer not null references admission_applications(id) on delete cascade,
  document_type text not null, file_path text not null, original_name text not null,
  uploaded_at timestamptz not null default now()
);
create table if not exists notifications (
  id serial primary key, recipient_email text, recipient_user_id integer references users(user_id),
  title text not null, message text not null, entity_type text, entity_id integer,
  is_read boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists enrollments (
  id serial primary key, student_id integer not null references students(student_id) on delete cascade,
  school_year text not null, grade_level integer not null, section_id integer references sections(section_id),
  status text not null default 'active', enrolled_at timestamptz, created_at timestamptz not null default now(),
  unique(student_id, school_year)
);
create table if not exists academic_history (
  id serial primary key, student_id integer not null references students(student_id) on delete cascade,
  school_year text not null, subject text not null, grade numeric(5,2) not null check (grade between 0 and 100),
  remarks text, prior_school text, created_at timestamptz not null default now(),
  unique(student_id, school_year, subject)
);
create table if not exists promotion_logs (
  id serial primary key, student_id integer not null references students(student_id) on delete cascade,
  from_grade integer not null, to_grade integer, school_year text not null, result promotion_result not null,
  reason text, processed_by integer references users(user_id), created_at timestamptz not null default now()
);
create table if not exists shift_requests (
  id serial primary key, student_id integer not null references students(student_id) on delete cascade,
  from_section_id integer references sections(section_id), target_section_id integer not null references sections(section_id),
  reason text not null, status text not null default 'completed', requested_by integer references users(user_id),
  created_at timestamptz not null default now()
);
create table if not exists registrar_feedback (
  id serial primary key, area text not null, priority text not null, pain_point text not null,
  suggested_fix text, submitted_by text, created_at timestamptz not null default now()
);
create table if not exists audit_logs (
  id serial primary key, actor text, action text not null, entity_type text, entity_id integer,
  details jsonb, created_at timestamptz not null default now()
);
create table if not exists subjects (
  subject_id serial primary key, subject_code text not null unique, subject_name text not null,
  description text, grade_level integer, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (grade_level is null or grade_level between 0 and 12)
);
create table if not exists subject_schedules (
  schedule_id serial primary key, subject_id integer not null references subjects(subject_id) on delete cascade,
  section_id integer not null references sections(section_id) on delete cascade,
  faculty_name text, room text, day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null, end_time time not null, created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create table if not exists staff_profiles (
  profile_id serial primary key, user_id integer not null unique references users(user_id) on delete cascade,
  employee_no text not null unique, first_name text not null, middle_name text,
  last_name text not null, department text not null, specialization text,
  phone text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists admins (
  admin_id bigint generated always as identity primary key,
  user_id bigint not null unique references users(user_id) on delete cascade,
  employee_code varchar not null unique,
  first_name varchar not null,
  last_name varchar not null,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;
drop policy if exists admins_read_self_or_admin on admins;
create policy admins_read_self_or_admin on admins for select to authenticated
  using ((select current_app_role()) = 1 or user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active));

create index if not exists idx_academic_student_year on academic_history(student_id, school_year);
create index if not exists idx_enrollment_student_year on enrollments(student_id, school_year);
create index if not exists idx_admission_status on admission_applications(status);
create index if not exists idx_subject_schedules_section_day on subject_schedules(section_id, day_of_week, start_time);

create or replace function check_schedule_conflicts(
  p_section_id integer, p_subject_id integer, p_day_of_week smallint,
  p_start_time time, p_end_time time, p_faculty_name text default null,
  p_room text default null, p_exclude_schedule_id integer default null
) returns table(schedule_id integer, conflict_type text, conflict_with text)
language sql stable as $$
  select s.schedule_id,
    case when s.section_id = p_section_id then 'section'
      when nullif(trim(p_faculty_name), '') is not null and lower(coalesce(s.faculty_name, '')) = lower(trim(p_faculty_name)) then 'faculty'
      else 'room' end,
    sub.subject_name || ' / ' || sec.section_name
  from subject_schedules s
  join subjects sub on sub.subject_id = s.subject_id
  join sections sec on sec.section_id = s.section_id
  where s.day_of_week = p_day_of_week
    and s.start_time < p_end_time and s.end_time > p_start_time
    and (p_exclude_schedule_id is null or s.schedule_id <> p_exclude_schedule_id)
    and (s.section_id = p_section_id
      or (nullif(trim(p_faculty_name), '') is not null and lower(coalesce(s.faculty_name, '')) = lower(trim(p_faculty_name)))
      or (nullif(trim(p_room), '') is not null and lower(coalesce(s.room, '')) = lower(trim(p_room))));
$$;

create or replace function prevent_schedule_conflict() returns trigger language plpgsql as $$
begin
  if exists (select 1 from check_schedule_conflicts(new.section_id, new.subject_id, new.day_of_week, new.start_time, new.end_time, new.faculty_name, new.room, new.schedule_id)) then
    raise exception 'Schedule conflict detected for this section, faculty member, or room';
  end if;
  return new;
end $$;
drop trigger if exists subject_schedule_conflict on subject_schedules;
create trigger subject_schedule_conflict before insert or update on subject_schedules
for each row execute function prevent_schedule_conflict();

create or replace function enforce_enrollment_capacity() returns trigger language plpgsql as $$
declare target sections%rowtype; student_grade integer;
begin
  if new.status <> 'active' or new.section_id is null then return new; end if;
  select * into target from sections where section_id = new.section_id for update;
  if not found then raise exception 'Section not found'; end if;
  select grade_level into student_grade from students where student_id = new.student_id;
  if student_grade is not null and student_grade <> target.grade_level then raise exception 'Student grade level is not eligible for this section'; end if;
  if (select count(*) from enrollments where section_id = new.section_id and status = 'active' and id <> coalesce(new.id, -1)) >= target.capacity then
    raise exception 'Target section is full';
  end if;
  return new;
end $$;
drop trigger if exists enrollment_capacity_guard on enrollments;
create trigger enrollment_capacity_guard before insert or update on enrollments
for each row execute function enforce_enrollment_capacity();

create or replace function validate_admission(p jsonb) returns void language plpgsql as $$
declare email text := p->>'guardian_email'; phone text := p->>'guardian_phone';
begin
  if nullif(trim(p->>'first_name'),'') is null or nullif(trim(p->>'last_name'),'') is null then raise exception 'Student first and last name are required'; end if;
  if nullif(trim(p->>'guardian_name'),'') is null then raise exception 'Guardian name is required'; end if;
  if email is null or email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid guardian email'; end if;
  if phone is null or phone !~ '^\+?[0-9 ()-]{7,20}$' then raise exception 'Invalid guardian phone'; end if;
  if nullif(trim(p->>'grade_level'),'') is null then raise exception 'Grade level is required'; end if;
end $$;

create sequence if not exists student_number_seq start 1;

create or replace function review_admission_application(p_application_id integer,p_status admission_status,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a admission_applications%rowtype; new_no text;
begin
  select * into a from admission_applications where id=p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if p_status in ('under_review','approved') then perform validate_admission(to_jsonb(a)); end if;
  update admission_applications set status=p_status, remarks=p_remarks, updated_at=now() where id=p_application_id;
  if p_status='approved' and not exists(select 1 from students where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date) then
    new_no := 'TCS-' || to_char(now(),'YY') || '-' || lpad(nextval('student_number_seq')::text,5,'0');
    insert into students(lrn_number,first_name,last_name,date_of_birth,gender,enrollment_status)
    values(new_no,a.first_name,a.last_name,a.birth_date,a.sex,'active');
  end if;
  if p_status='approved' then
    insert into enrollments(student_id, school_year, grade_level, status, enrolled_at)
    select student_id, extract(year from current_date)::text || '-' || (extract(year from current_date)+1)::text,
      a.grade_level::integer, 'active', now()
    from students
    where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date
    on conflict(student_id, school_year) do update set grade_level=excluded.grade_level, status='active', enrolled_at=excluded.enrolled_at;
  end if;
  insert into notifications(recipient_email,title,message,entity_type,entity_id) values(a.guardian_email,'Application Status Updated','Your TCSMS admission application is now '||replace(p_status::text,'_',' ')||'.','admission_application',a.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('UPDATE_STATUS','admission_application',a.id,jsonb_build_object('status',p_status,'remarks',p_remarks));
  return jsonb_build_object('id',a.id,'status',p_status);
end $$;

create or replace function auto_place_student(p_student_id integer,p_grade_level integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target sections%rowtype; old_section integer;
begin
  if not exists(select 1 from students where student_id=p_student_id) then raise exception 'Student not found'; end if;
  select section_id into old_section from enrollments where student_id=p_student_id and status='active' order by created_at desc limit 1;
  select s.* into target from sections s where s.grade_level=p_grade_level and (select count(*) from enrollments e where e.section_id=s.section_id and e.status='active')<s.capacity order by (select count(*) from enrollments e where e.section_id=s.section_id and e.status='active'),s.section_name limit 1 for update;
  if not found then raise exception 'No eligible section has available capacity'; end if;
  if old_section=target.section_id then return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name); end if;
  insert into enrollments(student_id,school_year,grade_level,section_id,status,enrolled_at) values(p_student_id,extract(year from current_date)::text||'-'||(extract(year from current_date)+1)::text,p_grade_level,target.section_id,'active',now()) on conflict(student_id,school_year) do update set section_id=excluded.section_id,grade_level=excluded.grade_level,status='active';
  insert into audit_logs(action,entity_type,entity_id,details) values('AUTO_PLACE','student',p_student_id,jsonb_build_object('section_id',target.section_id));
  return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name);
end $$;

create or replace function manual_place_student(p_student_id integer,p_section_id integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target sections%rowtype; student_grade integer;
begin
  select * into target from sections where section_id=p_section_id for update; if not found then raise exception 'Section not found'; end if;
  select grade_level into student_grade from students where student_id=p_student_id; if not found then raise exception 'Student not found'; end if;
  if target.grade_level<>student_grade then raise exception 'Grade level is not eligible for this section'; end if;
  if (select count(*) from enrollments where section_id=p_section_id and status='active')>=target.capacity then raise exception 'Target section is full'; end if;
  insert into enrollments(student_id,school_year,grade_level,section_id,status,enrolled_at) values(p_student_id,extract(year from current_date)::text||'-'||(extract(year from current_date)+1)::text,student_grade,p_section_id,'active',now()) on conflict(student_id,school_year) do update set section_id=excluded.section_id,status='active';
  insert into audit_logs(action,entity_type,entity_id,details) values('MANUAL_PLACE','student',p_student_id,jsonb_build_object('section_id',p_section_id));
  return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name);
end $$;

drop function if exists batch_promote_students(integer,text);
create or replace function batch_promote_students(p_grade_level integer,p_school_year text,p_excluded_student_ids integer[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; processed int:=0; promoted int:=0; avg_grade numeric; target integer;
begin
  for r in select student_id,grade_level from students where grade_level=p_grade_level and not (student_id = any(p_excluded_student_ids)) loop
    processed:=processed+1; select avg(grade) into avg_grade from academic_history where student_id=r.student_id and school_year=p_school_year;
    if exists(select 1 from academic_history where student_id=r.student_id and school_year=p_school_year and grade<75) then
      insert into promotion_logs(student_id,from_grade,to_grade,school_year,result,reason) values(r.student_id,r.grade_level,r.grade_level,p_school_year,'retained','At least one subject below passing criteria');
    elsif avg_grade is null then
      insert into promotion_logs(student_id,from_grade,to_grade,school_year,result,reason) values(r.student_id,r.grade_level,r.grade_level,p_school_year,'incomplete','No completed grades');
    else
      target:=r.grade_level+1; update students set grade_level=target where student_id=r.student_id; promoted:=promoted+1;
      insert into promotion_logs(student_id,from_grade,to_grade,school_year,result,reason) values(r.student_id,r.grade_level,target,p_school_year,'promoted','Passing criteria met');
    end if;
  end loop;
  return jsonb_build_object('processed',processed,'promoted',promoted);
end $$;

create or replace function shift_student(p_student_id integer,p_target_section_id integer,p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare old_section integer; old_name text; new_name text; student_grade integer;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'Shift reason is required'; end if;
  select grade_level into student_grade from students where student_id=p_student_id for update; if not found then raise exception 'Student not found'; end if;
  select section_name into new_name from sections where section_id=p_target_section_id and grade_level=student_grade; if not found then raise exception 'Target section is not eligible'; end if;
  if (select count(*) from enrollments where section_id=p_target_section_id and status='active') >= (select capacity from sections where section_id=p_target_section_id) then raise exception 'Target section is full'; end if;
  select section_id into old_section from enrollments where student_id=p_student_id and status='active' order by created_at desc limit 1;
  if old_section=p_target_section_id then raise exception 'Student is already in the target section'; end if;
  if old_section is not null then select section_name into old_name from sections where section_id=old_section; end if;
  update enrollments set section_id=p_target_section_id where student_id=p_student_id and status='active';
  insert into shift_requests(student_id,from_section_id,target_section_id,reason) values(p_student_id,old_section,p_target_section_id,p_reason);
  insert into notifications(title,message,entity_type,entity_id) values('Student Section Shift','Student shifted from '||coalesce(old_name,'Unassigned')||' to '||new_name||'.','student',p_student_id);
  insert into audit_logs(action,entity_type,entity_id,details) values('SHIFT_STUDENT','student',p_student_id,jsonb_build_object('from_section',old_section,'target_section',p_target_section_id,'reason',p_reason));
  return jsonb_build_object('student_id',p_student_id,'from_section',old_name,'to_section',new_name);
end $$;

insert into storage.buckets(id,name,public) values('admission-documents','admission-documents',false) on conflict(id) do nothing;

alter table admission_applications enable row level security;
alter table application_documents enable row level security;
alter table notifications enable row level security;
alter table enrollments enable row level security;
alter table academic_history enable row level security;
alter table promotion_logs enable row level security;
alter table shift_requests enable row level security;
alter table registrar_feedback enable row level security;
alter table audit_logs enable row level security;

alter table students enable row level security;
alter table sections enable row level security;
alter table users enable row level security;
alter table subjects enable row level security;
alter table subject_schedules enable row level security;
alter table staff_profiles enable row level security;

create or replace function current_app_role() returns integer language sql stable security definer set search_path = public as $$
  select role_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active = true limit 1;
$$;

drop policy if exists registrar_applications on admission_applications;
drop policy if exists registrar_documents on application_documents;
drop policy if exists registrar_notifications on notifications;
drop policy if exists registrar_enrollments on enrollments;
drop policy if exists registrar_academic on academic_history;
drop policy if exists registrar_promotion on promotion_logs;
drop policy if exists registrar_shifts on shift_requests;
drop policy if exists registrar_feedback_policy on registrar_feedback;
drop policy if exists registrar_audit on audit_logs;
drop policy if exists registrar_students on students;
drop policy if exists admin_sections on sections;
drop policy if exists authenticated_subjects on subjects;
drop policy if exists authenticated_subject_schedules on subject_schedules;
drop policy if exists authenticated_staff_profiles on staff_profiles;
drop policy if exists users_self_or_admin on users;
drop policy if exists users_admin_modify on users;

create policy users_self_or_admin on users for select to authenticated using ((select current_app_role()) = 1 or lower(email) = lower(auth.jwt() ->> 'email'));
create policy users_admin_modify on users for all to authenticated using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);

create policy admin_registrar_applications on admission_applications for all to authenticated using ((select current_app_role()) in (1,2)) with check ((select current_app_role()) in (1,2));
create policy admin_registrar_documents on application_documents for all to authenticated using ((select current_app_role()) in (1,2)) with check ((select current_app_role()) in (1,2));
create policy user_notifications on notifications for select to authenticated using ((select current_app_role()) in (1,2) or lower(recipient_email) = lower(auth.jwt() ->> 'email'));
create policy admin_registrar_notifications on notifications for insert to authenticated with check ((select current_app_role()) in (1,2));
create policy role_enrollments on enrollments for all to authenticated using ((select current_app_role()) in (1,2) or exists (select 1 from users u where u.email = auth.jwt() ->> 'email' and u.student_id = enrollments.student_id)) with check ((select current_app_role()) in (1,2));
create policy faculty_enrollment_roster on enrollments for select to authenticated using ((select current_app_role()) = 3 and exists (select 1 from subject_schedules ss join staff_profiles sp on lower(trim(ss.faculty_name)) = lower(trim(sp.first_name || ' ' || sp.last_name)) where ss.section_id = enrollments.section_id and sp.user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email'))));
create policy role_academic on academic_history for all to authenticated using ((select current_app_role()) in (1,2) or exists (select 1 from users u where u.email = auth.jwt() ->> 'email' and u.student_id = academic_history.student_id)) with check ((select current_app_role()) in (1,2));
create policy admin_registrar_promotion on promotion_logs for all to authenticated using ((select current_app_role()) in (1,2)) with check ((select current_app_role()) in (1,2));
create policy admin_registrar_shifts on shift_requests for all to authenticated using ((select current_app_role()) in (1,2)) with check ((select current_app_role()) in (1,2));
create policy admin_registrar_feedback on registrar_feedback for all to authenticated using ((select current_app_role()) in (1,2)) with check ((select current_app_role()) in (1,2));
create policy admin_audit on audit_logs for select to authenticated using ((select current_app_role()) = 1);
create policy admin_registrar_students on students for all to authenticated using ((select current_app_role()) in (1,2) or exists (select 1 from users u where u.email = auth.jwt() ->> 'email' and u.student_id = students.student_id)) with check ((select current_app_role()) in (1,2));
create policy faculty_students on students for select to authenticated using ((select current_app_role()) = 3 and exists (select 1 from enrollments e join subject_schedules ss on ss.section_id = e.section_id join staff_profiles sp on lower(trim(ss.faculty_name)) = lower(trim(sp.first_name || ' ' || sp.last_name)) where e.student_id = students.student_id and sp.user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email'))));
create policy section_read_by_role on sections for select to authenticated using ((select current_app_role()) in (1,2,3,4));
create policy admin_registrar_sections on sections for all to authenticated using ((select current_app_role()) in (1,2)) with check ((select current_app_role()) in (1,2));
create policy subjects_read_by_role on subjects for select to authenticated using ((select current_app_role()) in (1,2,3,4));
create policy admin_subjects on subjects for all to authenticated using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);
create policy schedules_read_by_role on subject_schedules for select to authenticated using ((select current_app_role()) in (1,2,3,4));
create policy admin_schedules on subject_schedules for all to authenticated using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);
create policy staff_profiles_read on staff_profiles for select to authenticated using ((select current_app_role()) in (1,2) or exists (select 1 from users u where u.email = auth.jwt() ->> 'email' and u.user_id = staff_profiles.user_id));
create policy admin_staff_profiles on staff_profiles for all to authenticated using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);
-- END supabase-migration.sql


-- ============================================================
-- BEGIN migration-v2-features.sql
-- ============================================================
-- TCSMS v2 feature migration: account auto-provisioning, faculty-subject
-- assignment, and student portal content tables.
-- Run this in the Supabase SQL Editor AFTER supabase-migration.sql.

-- ============================================================
-- 1. Account auto-provisioning on admission approval
-- ============================================================
-- students.user_id predates the users.student_id link and is never populated by
-- review_admission_application(); it must be nullable or every approval fails.
alter table students alter column user_id drop not null;
-- original default ('active') never satisfied students_enrollment_status_check.
alter table students alter column enrollment_status set default 'Enrolled';

-- Forced password-change on first login was removed; login now just shows a dismissible
-- reminder popup instead, so the flag is dropped rather than tracked in the schema.
alter table users drop column if exists must_change_password;
-- initial_password holds the plaintext temp password only until scripts/provision-accounts.mjs
-- creates the real Supabase Auth login and clears it. Never displayed to students directly.
alter table users add column if not exists initial_password text;

create or replace function generate_username(p_first_name text, p_last_name text)
returns text language plpgsql stable as $$
declare initials text; surname text; base text; candidate text; suffix int := 0;
begin
  initials := lower(regexp_replace(coalesce(p_first_name, ''), '[^a-zA-Z ]', '', 'g'));
  initials := (select string_agg(left(part, 1), '') from unnest(string_to_array(trim(initials), ' ')) part where part <> '');
  surname := lower(regexp_replace(coalesce(p_last_name, ''), '[^a-zA-Z]', '', 'g'));
  base := coalesce(initials, '') || surname;
  if nullif(base, '') is null then base := 'student'; end if;
  candidate := base;
  while exists (select 1 from users where lower(username) = candidate) loop
    suffix := suffix + 1;
    candidate := base || suffix::text;
  end loop;
  return candidate;
end $$;

create or replace function review_admission_application(p_application_id integer,p_status admission_status,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a admission_applications%rowtype; new_no text; target_student_id integer; new_username text; new_password text; new_user_id integer;
begin
  if length(coalesce(p_remarks, '')) > 500 then raise exception 'Remarks must be 500 characters or fewer'; end if;
  select * into a from admission_applications where id=p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if p_status in ('under_review','approved') then perform validate_admission(to_jsonb(a)); end if;
  update admission_applications set status=p_status, remarks=p_remarks, updated_at=now() where id=p_application_id;
  if p_status='approved' and not exists(select 1 from students where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date) then
    new_no := 'TCS-' || to_char(now(),'YY') || '-' || lpad(nextval('student_number_seq')::text,5,'0');
    insert into students(lrn_number,first_name,last_name,date_of_birth,gender,enrollment_status)
    values(new_no,a.first_name,a.last_name,a.birth_date,a.sex,'Enrolled');
  end if;
  if p_status='approved' then
    select student_id into target_student_id from students
      where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date
      limit 1;
    insert into enrollments(student_id, school_year, grade_level, status, enrolled_at)
    select target_student_id, extract(year from current_date)::text || '-' || (extract(year from current_date)+1)::text,
      a.grade_level::integer, 'active', now()
    on conflict(student_id, school_year) do update set grade_level=excluded.grade_level, status='active', enrolled_at=excluded.enrolled_at;

    if target_student_id is not null and not exists (select 1 from users where student_id = target_student_id) then
      new_username := generate_username(a.first_name, a.last_name);
      new_password := new_username || '123';
      insert into users(username, email, password_hash, role_id, is_active, student_id, initial_password)
      values (new_username, new_username || '@tcs.edu.ph', crypt(new_password, gen_salt('bf')), 4, true, target_student_id, new_password)
      returning user_id into new_user_id;
    end if;
  end if;
  insert into notifications(recipient_email,title,message,entity_type,entity_id) values(a.guardian_email,'Application Status Updated','Your TCSMS admission application is now '||replace(p_status::text,'_',' ')||'.','admission_application',a.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('UPDATE_STATUS','admission_application',a.id,jsonb_build_object('status',p_status,'remarks',p_remarks));
  return jsonb_build_object('id',a.id,'status',p_status,'new_user_id',new_user_id);
end $$;

create extension if not exists pgcrypto;

-- ============================================================
-- 2. Payment confirmations feature was removed; drop it if it was applied before.
-- ============================================================
drop function if exists review_payment(integer, boolean, text);
drop table if exists payments cascade;
drop type if exists payment_status cascade;
alter table students drop column if exists balance_due;
alter table students drop column if exists balance_due_date;

-- ============================================================
-- 3. Faculty-to-subject assignment
-- ============================================================
create table if not exists faculty_subjects (
  id serial primary key,
  profile_id integer not null references staff_profiles(profile_id) on delete cascade,
  subject_id integer not null references subjects(subject_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, subject_id)
);

-- ============================================================
-- 4. Student portal content: announcements, attendance
-- Upcoming deadlines feature was removed; drop it if it was applied before.
-- ============================================================
create table if not exists announcements (
  id serial primary key,
  title text not null,
  message text,
  posted_at timestamptz not null default now(),
  created_by integer references users(user_id)
);
drop table if exists deadlines cascade;
create table if not exists attendance (
  id serial primary key,
  student_id integer not null references students(student_id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('Present','Absent','Late')),
  created_at timestamptz not null default now(),
  unique (student_id, attendance_date)
);

alter table students add column if not exists profile_picture_url text;
alter table students add column if not exists address text;
alter table students add column if not exists contact_number text;
insert into storage.buckets(id,name,public) values('profile-pictures','profile-pictures',true) on conflict(id) do nothing;

drop function if exists mark_password_changed();

create or replace function update_own_profile_picture(p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare target_student_id integer; expected_path text;
begin
  select student_id into target_student_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active = true;
  if target_student_id is null then raise exception 'No linked student record'; end if;
  expected_path := '/storage/v1/object/public/profile-pictures/' || target_student_id::text || '/';
  if coalesce(p_url, '') not like '%' || expected_path || '%' then
    raise exception 'Profile picture must belong to your account';
  end if;
  update students set profile_picture_url = p_url where student_id = target_student_id;
end $$;


-- ============================================================
-- 5. RLS
-- ============================================================
alter table faculty_subjects enable row level security;
alter table announcements enable row level security;
alter table attendance enable row level security;

drop policy if exists faculty_subjects_read on faculty_subjects;
drop policy if exists admin_faculty_subjects on faculty_subjects;
create policy faculty_subjects_read on faculty_subjects for select to authenticated using ((select current_app_role()) in (1,2,3,4));
create policy admin_faculty_subjects on faculty_subjects for all to authenticated using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);

drop policy if exists announcements_read on announcements;
drop policy if exists admin_announcements on announcements;
create policy announcements_read on announcements for select to authenticated using ((select current_app_role()) in (1,2,3,4));
create policy admin_announcements on announcements for all to authenticated using ((select current_app_role()) in (1,2)) with check ((select current_app_role()) in (1,2));

drop policy if exists role_attendance on attendance;
create policy role_attendance on attendance for all to authenticated
  using ((select current_app_role()) in (1,2,3) or exists (select 1 from users u where u.email = auth.jwt() ->> 'email' and u.student_id = attendance.student_id))
  with check ((select current_app_role()) in (1,2,3));

drop policy if exists profile_pictures_read on storage.objects;
drop policy if exists profile_pictures_upload on storage.objects;
drop policy if exists profile_pictures_update on storage.objects;
create policy profile_pictures_read on storage.objects for select to public using (bucket_id = 'profile-pictures');
create policy profile_pictures_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'profile-pictures'
  and (
    ((select current_app_role()) in (1,2) and name like 'applications/%')
    or (name like (select student_id::text || '/%' from users where lower(email) = lower(auth.jwt() ->> 'email') and student_id is not null))
  )
);
create policy profile_pictures_update on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (
      ((select current_app_role()) in (1,2) and name like 'applications/%')
      or (name like (select student_id::text || '/%' from users where lower(email) = lower(auth.jwt() ->> 'email') and student_id is not null))
    )
  )
  with check (
    bucket_id = 'profile-pictures'
    and (
      ((select current_app_role()) in (1,2) and name like 'applications/%')
      or (name like (select student_id::text || '/%' from users where lower(email) = lower(auth.jwt() ->> 'email') and student_id is not null))
    )
  );
-- END migration-v2-features.sql


-- ============================================================
-- BEGIN migration-v3-registrar-ui.sql
-- ============================================================
-- TCSMS v3: registrar UI additions.
-- Run this in the Supabase SQL Editor AFTER supabase-migration.sql and
-- migration-v2-features.sql (the profile-pictures bucket and its storage
-- policies are created there).

-- ============================================================
-- 1. Profile picture captured with an admission application
-- ============================================================
alter table admission_applications add column if not exists profile_picture_url text;

-- Approval now copies the applicant's photo onto the student record so the new
-- "View" details popup and the student portal show the same picture.
-- Everything else is unchanged from migration-v2-features.sql.
create or replace function review_admission_application(p_application_id integer,p_status admission_status,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a admission_applications%rowtype; new_no text; target_student_id integer; new_username text; new_password text; new_user_id integer;
begin
  if length(coalesce(p_remarks, '')) > 500 then raise exception 'Remarks must be 500 characters or fewer'; end if;
  select * into a from admission_applications where id=p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if p_status in ('under_review','approved') then perform validate_admission(to_jsonb(a)); end if;
  update admission_applications set status=p_status, remarks=p_remarks, updated_at=now() where id=p_application_id;
  if p_status='approved' and not exists(select 1 from students where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date) then
    new_no := 'TCS-' || to_char(now(),'YY') || '-' || lpad(nextval('student_number_seq')::text,5,'0');
    insert into students(lrn_number,first_name,last_name,date_of_birth,gender,enrollment_status)
    values(new_no,a.first_name,a.last_name,a.birth_date,a.sex,'Enrolled');
  end if;
  if p_status='approved' then
    select student_id into target_student_id from students
      where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date
      limit 1;
    insert into enrollments(student_id, school_year, grade_level, status, enrolled_at)
    select target_student_id, extract(year from current_date)::text || '-' || (extract(year from current_date)+1)::text,
      a.grade_level::integer, 'active', now()
    on conflict(student_id, school_year) do update set grade_level=excluded.grade_level, status='active', enrolled_at=excluded.enrolled_at;

    if a.profile_picture_url is not null then
      update students set profile_picture_url = a.profile_picture_url where student_id = target_student_id;
    end if;

    if target_student_id is not null and not exists (select 1 from users where student_id = target_student_id) then
      new_username := generate_username(a.first_name, a.last_name);
      new_password := new_username || '123';
      insert into users(username, email, password_hash, role_id, is_active, student_id, initial_password)
      values (new_username, new_username || '@tcs.edu.ph', crypt(new_password, gen_salt('bf')), 4, true, target_student_id, new_password)
      returning user_id into new_user_id;
    end if;
  end if;
  insert into notifications(recipient_email,title,message,entity_type,entity_id) values(a.guardian_email,'Application Status Updated','Your TCSMS admission application is now '||replace(p_status::text,'_',' ')||'.','admission_application',a.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('UPDATE_STATUS','admission_application',a.id,jsonb_build_object('status',p_status,'remarks',p_remarks));
  return jsonb_build_object('id',a.id,'status',p_status,'new_user_id',new_user_id);
end $$;

-- ============================================================
-- 2. Transfer out (leaving the school) as one transaction
-- ============================================================
-- Closing the enrollments and setting students.enrollment_status must succeed or
-- fail together, so both run inside this function instead of as two client calls.
--
-- existing students_enrollment_status_check constraint, for the record:
--   CHECK (enrollment_status = ANY (ARRAY['Enrolled','Pending','Graduated','Transferred']))
-- 'Transferred' is therefore valid, and 'Inactive'/'Dropped' are NOT. Nothing in the app
-- writes those, but adding a new status later means updating this constraint too:
--   alter table students drop constraint students_enrollment_status_check;
--   alter table students add constraint students_enrollment_status_check
--     check (enrollment_status in ('Enrolled','Pending','Graduated','Transferred'));
create or replace function transfer_student_out(p_student_id integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target_name text; closed_count integer := 0;
begin
  if nullif(trim(p_reason), '') is null then raise exception 'Transfer reason is required'; end if;
  select first_name || ' ' || last_name into target_name from students where student_id = p_student_id for update;
  if not found then raise exception 'Student not found'; end if;
  update enrollments set status = 'inactive' where student_id = p_student_id and status = 'active';
  get diagnostics closed_count = row_count;
  update students set enrollment_status = 'Transferred' where student_id = p_student_id;
  insert into audit_logs(action,entity_type,entity_id,details)
    values('TRANSFER_OUT','student',p_student_id,jsonb_build_object('reason',p_reason,'closed_enrollments',closed_count));
  return jsonb_build_object('student_id',p_student_id,'student_name',target_name,'closed_enrollments',closed_count);
end $$;
-- END migration-v3-registrar-ui.sql


-- ============================================================
-- BEGIN migration-v4-registrar-workflows.sql
-- ============================================================
-- TCSMS v4: registrar workflows.
-- Run this in the Supabase SQL Editor AFTER supabase-migration.sql,
-- migration-v2-features.sql and migration-v3-registrar-ui.sql.

-- ============================================================
-- 1. Admission application edit lock
-- ============================================================
-- A registrar who opens an application for correction holds a short-lived lock so an
-- administrator cannot approve/decline the same file mid-edit. Locks older than 10
-- minutes are ignored, so a closed tab can never block approvals forever.
alter table admission_applications add column if not exists editing_by text;
alter table admission_applications add column if not exists editing_since timestamptz;
alter table admission_applications add column if not exists editing_token uuid;

-- All workflow RPCs check the authenticated staff role on the server.
create or replace function registrar_workflow_actor(p_role integer)
returns text language plpgsql security definer set search_path = public as $$
declare actor text;
begin
  select username into actor from users where lower(email)=lower(auth.jwt()->>'email')
    and is_active and role_id=p_role limit 1;
  if actor is null then raise exception 'Not authorized for this workflow'; end if;
  return actor;
end $$;


create or replace function begin_application_edit(p_application_id integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a admission_applications%rowtype; editor text;
begin
  editor := registrar_workflow_actor(2);
  select * into a from admission_applications where id = p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if a.status not in ('draft','submitted','under_review') then
    raise exception 'Only pending applications can be corrected';
  end if;
  if a.editing_token is not null
     and a.editing_since is not null
     and a.editing_since > now() - interval '10 minutes' then
    raise exception 'This application is already being edited by % since %. Try again after they save or close it.', a.editing_by, to_char(a.editing_since, 'HH24:MI');
  end if;
  update admission_applications
    set editing_by = editor,
        editing_since = now(),
        editing_token = gen_random_uuid(),
        status = case when status = 'submitted' then 'under_review' else status end,
        updated_at = now()
    where id = p_application_id
    returning * into a;
  return to_jsonb(a);
end $$;
create or replace function end_application_edit(p_application_id integer, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare released integer;
begin
  perform registrar_workflow_actor(2);
  update admission_applications
    set editing_by = null, editing_since = null, editing_token = null
    where id = p_application_id and p_token is not null and editing_token = p_token
      and editing_by = registrar_workflow_actor(2);
  get diagnostics released = row_count;
  return jsonb_build_object('released', released > 0);
end $$;

create or replace function renew_application_edit(p_application_id integer, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare renewed integer;
begin
  update admission_applications set editing_since=now()
  where id=p_application_id and p_token is not null and editing_token=p_token
    and editing_by=registrar_workflow_actor(2)
    and editing_since > now()-interval '10 minutes'
    and status in ('draft','submitted','under_review');
  get diagnostics renewed = row_count;
  if renewed=0 then raise exception 'Edit session expired or was replaced'; end if;
  return jsonb_build_object('renewed',true);
end $$;

create or replace function save_application_edit(p_application_id integer, p_token uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a admission_applications%rowtype; merged jsonb; next_status text;
begin
  select * into a from admission_applications where id = p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  perform registrar_workflow_actor(2);
  if p_token is null or a.editing_token is distinct from p_token
    or a.editing_since is null or a.editing_since <= now() - interval '10 minutes'
    or a.editing_by is distinct from registrar_workflow_actor(2)
    or a.status not in ('draft','submitted','under_review') then
    raise exception 'This edit session is no longer active. Close the form and open the application again.';
  end if;
  merged := to_jsonb(a) || coalesce(p_payload, '{}'::jsonb);
  next_status := a.status::text;
  if p_payload ? 'status' and p_payload->>'status' is distinct from next_status then
    raise exception 'Corrections cannot change the approval decision';
  end if;
  if (merged->>'grade_level')::integer not between 1 and 12 then raise exception 'Choose grade 1-12'; end if;
  if next_status <> 'draft' then perform validate_admission(merged); end if;
  update admission_applications set
    first_name = merged->>'first_name',
    middle_name = nullif(merged->>'middle_name', ''),
    last_name = merged->>'last_name',
    birth_date = nullif(merged->>'birth_date', '')::date,
    sex = nullif(merged->>'sex', ''),
    address = nullif(merged->>'address', ''),
    guardian_name = nullif(merged->>'guardian_name', ''),
    guardian_relationship = nullif(merged->>'guardian_relationship', ''),
    guardian_phone = nullif(merged->>'guardian_phone', ''),
    guardian_email = nullif(merged->>'guardian_email', ''),
    prior_school = nullif(merged->>'prior_school', ''),
    prior_grade = nullif(merged->>'prior_grade', ''),
    grade_level = nullif(merged->>'grade_level', ''),
    special_program = nullif(merged->>'special_program', ''),
    remarks = nullif(merged->>'remarks', ''),
    status = next_status::admission_status,
    editing_by = null, editing_since = null, editing_token = null,
    updated_at = now()
  where id = p_application_id;
  insert into audit_logs(action,entity_type,entity_id,details) values('REGISTRAR_EDIT','admission_application',p_application_id,jsonb_build_object('status',next_status));
  return jsonb_build_object('id', p_application_id, 'status', next_status, 'edit_released', true);
end $$;

-- Supersedes migration-v3: keeps the profile-picture copy and refuses to review an
-- application while a registrar holds a fresh edit lock.
create or replace function review_admission_application(p_application_id integer,p_status admission_status,p_remarks text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a admission_applications%rowtype; new_no text; target_student_id integer; new_username text; new_password text; new_user_id integer;
begin
  perform registrar_workflow_actor(1);
  if p_status not in ('approved','rejected') then raise exception 'Choose Approve or Decline'; end if;
  if length(coalesce(p_remarks, '')) > 500 then raise exception 'Remarks must be 500 characters or fewer'; end if;
  select * into a from admission_applications where id=p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if a.status not in ('submitted','under_review') then raise exception 'This application is no longer pending'; end if;
  if a.editing_by is not null and a.editing_since is not null and a.editing_since > now() - interval '10 minutes' then
    raise exception 'Registrar % is editing this application right now. Ask them to save or close the form before reviewing it.', a.editing_by;
  end if;
  if p_status in ('under_review','approved') then perform validate_admission(to_jsonb(a)); end if;
  update admission_applications set status=p_status, remarks=p_remarks, updated_at=now(), editing_by=null, editing_since=null, editing_token=null where id=p_application_id;
  if p_status='approved' and not exists(select 1 from students where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date) then
    new_no := 'TCS-' || to_char(now(),'YY') || '-' || lpad(nextval('student_number_seq')::text,5,'0');
    insert into students(lrn_number,first_name,last_name,date_of_birth,gender,enrollment_status)
    values(new_no,a.first_name,a.last_name,a.birth_date,a.sex,'Enrolled');
  end if;
  if p_status='approved' then
    select student_id into target_student_id from students
      where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date
      limit 1;
    insert into enrollments(student_id, school_year, grade_level, status, enrolled_at)
    select target_student_id, extract(year from current_date)::text || '-' || (extract(year from current_date)+1)::text,
      a.grade_level::integer, 'active', now()
    on conflict(student_id, school_year) do update set grade_level=excluded.grade_level, status='active', enrolled_at=excluded.enrolled_at;

    update students set grade_level=a.grade_level::integer, enrollment_status='Enrolled' where student_id=target_student_id;
    if a.profile_picture_url is not null then
      update students set profile_picture_url = a.profile_picture_url where student_id = target_student_id;
    end if;

    if target_student_id is not null and not exists (select 1 from users where student_id = target_student_id) then
      new_username := generate_username(a.first_name, a.last_name);
      new_password := new_username || '123';
      insert into users(username, email, password_hash, role_id, is_active, student_id, initial_password)
      values (new_username, new_username || '@tcs.edu.ph', crypt(new_password, gen_salt('bf')), 4, true, target_student_id, new_password)
      returning user_id into new_user_id;
    end if;
  end if;
  insert into notifications(recipient_email,title,message,entity_type,entity_id) values(a.guardian_email,'Application Status Updated','Your TCSMS admission application is now '||replace(p_status::text,'_',' ')||'.','admission_application',a.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('UPDATE_STATUS','admission_application',a.id,jsonb_build_object('status',p_status,'remarks',p_remarks));
  return jsonb_build_object('id',a.id,'status',p_status,'new_user_id',new_user_id);
end $$;

-- ============================================================
-- 2. Detailed academic record columns
-- ============================================================
-- Mirrors the registrar's "Detailed Academic Record" view. academic_history.grade is
-- kept and stays the value promotion/transcript logic reads; the client fills it from
-- final, then the quarter average, then midterm.
alter table academic_history add column if not exists first_sem_q1 numeric(5,2) check (first_sem_q1 between 0 and 100);
alter table academic_history add column if not exists first_sem_q2 numeric(5,2) check (first_sem_q2 between 0 and 100);
alter table academic_history add column if not exists second_sem_q1 numeric(5,2) check (second_sem_q1 between 0 and 100);
alter table academic_history add column if not exists second_sem_q2 numeric(5,2) check (second_sem_q2 between 0 and 100);
alter table academic_history add column if not exists letter_grade text;
alter table academic_history add column if not exists midterm numeric(5,2) check (midterm between 0 and 100);
alter table academic_history add column if not exists final numeric(5,2) check (final between 0 and 100);
alter table academic_history add column if not exists locked boolean not null default false;

-- Prevent changes/deletions to locked rows, including CSV/upsert paths.
create or replace function protect_locked_academic_record()
returns trigger language plpgsql as $$
begin
  if old.locked then
    if tg_op='DELETE' then raise exception 'Unlock the academic record before deleting it'; end if;
    if (to_jsonb(new)-'locked') is distinct from (to_jsonb(old)-'locked') then
      raise exception 'Unlock the academic record before changing its grades';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protect_locked_academic_record on academic_history;
create trigger protect_locked_academic_record before update or delete on academic_history
for each row execute function protect_locked_academic_record();

-- ============================================================
-- 3. Section placement / auto-assignment
-- ============================================================
-- One validated writer for both the manual multi-select placement tool and the
-- grade 1-10 auto-assignment. Any invalid row aborts the whole batch.
create or replace function apply_section_assignments(p_assignments jsonb, p_school_year text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  yr text; r record; target sections%rowtype; seats integer; requested integer; placed integer := 0;
begin
  perform registrar_workflow_actor(2);
  if coalesce(jsonb_typeof(p_assignments), 'null') <> 'array' or jsonb_array_length(p_assignments) = 0 then
    raise exception 'Select at least one student before placing them';
  end if;
  yr := coalesce(nullif(trim(p_school_year), ''), extract(year from current_date)::text || '-' || (extract(year from current_date)+1)::text);

  if (select count(distinct value->>'student_id') from jsonb_array_elements(p_assignments)) <> jsonb_array_length(p_assignments) then
    raise exception 'The same student was selected more than once';
  end if;

  for r in
    select (value->>'section_id')::integer as section_id, array_agg((value->>'student_id')::integer) as student_ids
    from jsonb_array_elements(p_assignments)
    group by 1
  loop
    select * into target from sections where section_id = r.section_id for update;
    if not found then raise exception 'Target section % was not found', r.section_id; end if;

    if exists (select 1 from students s where s.student_id = any(r.student_ids) and s.grade_level is distinct from target.grade_level) then
      raise exception 'Every selected student must belong to grade level % of %', target.grade_level, target.section_name;
    end if;

    requested := coalesce(array_length(r.student_ids, 1), 0);
    select count(*) into seats from enrollments e
      where e.section_id = r.section_id and e.status = 'active' and not (e.student_id = any(r.student_ids));
    if requested > (target.capacity - seats) then
      raise exception '% has % seat(s) left but % student(s) were selected', target.section_name, target.capacity - seats, requested;
    end if;

    insert into enrollments (student_id, school_year, grade_level, section_id, status, enrolled_at)
    select sid, yr, target.grade_level, r.section_id, 'active', now() from unnest(r.student_ids) sid
    on conflict (student_id, school_year) do update
      set section_id = excluded.section_id, grade_level = excluded.grade_level, status = 'active';

    placed := placed + requested;
    insert into audit_logs(action, entity_type, entity_id, details)
      values('ASSIGN_SECTIONS', 'section', r.section_id, jsonb_build_object('students', r.student_ids, 'school_year', yr));
  end loop;

  return jsonb_build_object('placed', placed, 'school_year', yr);
end $$;
-- END migration-v4-registrar-workflows.sql


-- ============================================================
-- BEGIN migration-v5-faculty-grades.sql
-- ============================================================
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
-- END migration-v5-faculty-grades.sql


-- ============================================================
-- BEGIN migration-v6-attendance-reports.sql
-- ============================================================
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
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_session_unique'
  ) then
    alter table attendance add constraint attendance_session_unique
      unique (student_id, attendance_date, section_id, subject_id);
  end if;
end $$;

alter table attendance drop constraint if exists attendance_status_check;
do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_status_check'
  ) then
    alter table attendance add constraint attendance_status_check
      check (status in ('Present','Late','Absent','Excused'));
  end if;
end $$;

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
  where a.student_id = p_student_id
    and (p_school_year is null or s.academic_year = p_school_year)
    and exists (
      select 1 from users u
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and u.is_active = true
        and (u.role_id in (1,2) or u.student_id = p_student_id or (u.role_id = 3 and faculty_teaches_student(p_student_id)))
    )
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

-- END migration-v6-attendance-reports.sql


-- ============================================================
-- BEGIN migration-v7-audit-coverage.sql
-- ============================================================
-- TCSMS v7: audit coverage for promotion writes.
-- Run after migration-v6-attendance-reports.sql.

create or replace function audit_promotion_log_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(action, entity_type, entity_id, details)
  values ('BATCH_PROMOTION_RESULT', 'student', new.student_id,
    jsonb_build_object('from_grade', new.from_grade, 'to_grade', new.to_grade,
      'school_year', new.school_year, 'result', new.result, 'reason', new.reason));
  return new;
end $$;

drop trigger if exists promotion_log_audit on promotion_logs;
create trigger promotion_log_audit
after insert on promotion_logs
for each row execute function audit_promotion_log_insert();
-- END migration-v7-audit-coverage.sql


-- ============================================================
-- BEGIN migration-v8-audit-archives.sql
-- ============================================================
-- TCSMS v8: daily audit archive and dated audit export support.
-- Run after migration-v7-audit-coverage.sql.

create table if not exists audit_log_archives (
  archive_date date primary key,
  events jsonb not null default '[]'::jsonb,
  archived_at timestamptz not null default now()
);

alter table audit_log_archives enable row level security;
drop policy if exists admin_audit_archives on audit_log_archives;
create policy admin_audit_archives on audit_log_archives
  for all to authenticated
  using ((select current_app_role()) = 1)
  with check ((select current_app_role()) = 1);

create or replace function audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare row_data jsonb; key_value text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  key_value := nullif(coalesce(row_data ->> TG_ARGV[0], row_data ->> 'id'), '');
  insert into audit_logs(actor, action, entity_type, entity_id, details)
  values (auth.jwt() ->> 'email', TG_TABLE_NAME || '_' || TG_OP, TG_TABLE_NAME,
    case when key_value ~ '^[0-9]+$' then key_value::integer else null end,
    jsonb_build_object('operation', TG_OP));
  return case when TG_OP = 'DELETE' then old else new end;
end $$;

drop trigger if exists admission_application_audit on admission_applications;
create trigger admission_application_audit after insert or update or delete on admission_applications
for each row execute function audit_row_change('id');
drop trigger if exists application_document_audit on application_documents;
create trigger application_document_audit after insert or update or delete on application_documents
for each row execute function audit_row_change('id');
drop trigger if exists enrollment_audit on enrollments;
create trigger enrollment_audit after insert or update or delete on enrollments
for each row execute function audit_row_change('id');
drop trigger if exists section_audit on sections;
create trigger section_audit after insert or update or delete on sections
for each row execute function audit_row_change('section_id');
drop trigger if exists faculty_subject_audit on faculty_subjects;
create trigger faculty_subject_audit after insert or update or delete on faculty_subjects
for each row execute function audit_row_change('id');
drop trigger if exists subject_audit on subjects;
create trigger subject_audit after insert or update or delete on subjects
for each row execute function audit_row_change('subject_id');
drop trigger if exists schedule_audit on subject_schedules;
create trigger schedule_audit after insert or update or delete on subject_schedules
for each row execute function audit_row_change('schedule_id');
drop trigger if exists announcement_audit on announcements;
create trigger announcement_audit after insert or update or delete on announcements
for each row execute function audit_row_change('id');
drop trigger if exists staff_profile_audit on staff_profiles;
create trigger staff_profile_audit after insert or update or delete on staff_profiles
for each row execute function audit_row_change('profile_id');
drop trigger if exists feedback_audit on registrar_feedback;
create trigger feedback_audit after insert or update or delete on registrar_feedback
for each row execute function audit_row_change('id');

create or replace function archive_audit_logs(p_archive_date date default (current_date - 1))
returns integer language plpgsql security definer set search_path = public as $$
declare archived_count integer;
begin
  insert into audit_log_archives(archive_date, events, archived_at)
  select p_archive_date, coalesce(jsonb_agg(to_jsonb(row) order by row.created_at), '[]'::jsonb), now()
  from (
    select id, actor, action, entity_type, entity_id, details, created_at
    from audit_logs
    where created_at >= p_archive_date::timestamptz
      and created_at < (p_archive_date + 1)::timestamptz
  ) row
  on conflict (archive_date) do update
    set events = excluded.events, archived_at = excluded.archived_at;

  delete from audit_logs
  where created_at >= p_archive_date::timestamptz
    and created_at < (p_archive_date + 1)::timestamptz;
  get diagnostics archived_count = row_count;
  return archived_count;
end $$;

-- Supabase projects provide pg_cron when it is enabled in Database > Extensions.
-- Enable it there first if this statement is not permitted in your project.
create extension if not exists pg_cron;
select cron.unschedule('tcsms-daily-audit-archive')
where exists (select 1 from cron.job where jobname = 'tcsms-daily-audit-archive');
select cron.schedule('tcsms-daily-audit-archive', '5 0 * * *', $$select public.archive_audit_logs(current_date - 1);$$);
-- END migration-v8-audit-archives.sql


-- ============================================================
-- BEGIN migration-v9-profile-edit.sql
-- ============================================================
-- TCSMS v9: self-service profile editing.
-- Run after migration-v8-audit-archives.sql.
-- Only the display username is editable here; email and role remain controlled account fields.

create or replace function update_own_profile(p_username text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id integer;
  username_text text;
  duplicate_username boolean;
begin
  select user_id into actor_id
  from users
  where lower(email) = lower(auth.jwt() ->> 'email') and is_active = true;

  if actor_id is null then raise exception 'Active account not found'; end if;
  username_text := nullif(trim(coalesce(p_username, '')), '');
  if username_text is null then raise exception 'Username is required'; end if;
  if length(username_text) > 80 then raise exception 'Username is too long'; end if;

  select exists(
    select 1 from users
    where lower(username) = lower(username_text) and user_id <> actor_id
  ) into duplicate_username;
  if duplicate_username then raise exception 'That username is already in use'; end if;

  update users set username = username_text where user_id = actor_id;
  insert into audit_logs(action, entity_type, entity_id, details)
  values ('UPDATE_OWN_PROFILE', 'user', actor_id, jsonb_build_object('username', username_text));
  return jsonb_build_object('user_id', actor_id, 'username', username_text);
end $$;
-- END migration-v9-profile-edit.sql

-- BEGIN migration-v10-data-api-grants.sql
-- Supabase stops auto-granting Data API access to new public tables on 2026-10-30.
-- Run AFTER backupsqlmigration.sql. Safe to re-run (grants are idempotent).
-- Row access is still enforced by RLS (enabled on every table); anon gets no table
-- access because no policy targets it and login goes through the find_login_email RPC.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Future tables/sequences created by migrations get the same grants automatically.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
-- END migration-v10-data-api-grants.sql

-- BEGIN migration-v11-faculty-grade-lock.sql
-- Faculty "Submit & lock": locks the grades a teacher submitted for one subject/year.
-- The v4 trigger then rejects edits until the registrar unlocks via set_academic_lock().
-- Run after backupsqlmigration.sql. Safe to re-run.
create or replace function lock_faculty_grades(p_subject_id integer, p_school_year text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; subject_label text; affected integer;
begin
  actor := registrar_workflow_actor(3);
  select subject_name into subject_label from subjects where subject_id = p_subject_id;
  if subject_label is null then raise exception 'Subject not found'; end if;
  if not faculty_teaches_subject(p_subject_id) then raise exception 'You do not teach this subject'; end if;
  update academic_history set locked = true
  where subject = subject_label and school_year = trim(p_school_year)
    and faculty_teaches_student(student_id) and not locked;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'No unlocked grades to submit for this class'; end if;
  insert into audit_logs(action, entity_type, entity_id, details)
  values ('LOCK_FACULTY_GRADES', 'subject', p_subject_id,
    jsonb_build_object('school_year', p_school_year, 'affected', affected, 'actor', actor));
  return jsonb_build_object('locked', affected);
end $$;

grant execute on function lock_faculty_grades(integer, text) to authenticated;
-- END migration-v11-faculty-grade-lock.sql


-- ============================================================
-- BEGIN migration-v12-approval-requests.sql
-- ============================================================
-- One approval queue for sensitive actions. Staff file a request; only an admin can approve it.
-- Covers: grade corrections (faculty), withdrawal/transfer-out (registrar), batch promotion
-- (registrar), account actions (registrar). Also notifies faculty when their teaching load changes.
-- Run after backupsqlmigration.sql. Safe to re-run.
create table if not exists approval_requests (
  id serial primary key,
  request_type text not null check (request_type in ('grade_correction','withdrawal','promotion','account_action','override')),
  payload jsonb not null,
  summary text not null,
  reason text not null,
  requested_by integer references users(user_id),
  requester_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  remarks text,
  reviewed_by integer references users(user_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table approval_requests drop constraint if exists approval_requests_request_type_check;
alter table approval_requests add constraint approval_requests_request_type_check
  check (request_type in ('grade_correction','withdrawal','promotion','account_action','override'));
create index if not exists idx_approval_status on approval_requests(status, created_at desc);
alter table approval_requests enable row level security;
drop policy if exists approval_read on approval_requests;
-- Read-only from the browser: every write goes through the functions below.
create policy approval_read on approval_requests for select to authenticated
  using ((select current_app_role()) = 1 or requested_by = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active));
revoke insert, update, delete on approval_requests from authenticated;

-- The old direct entry points would bypass the queue, so only the review function may call them.
revoke execute on function transfer_student_out(integer, text) from public, authenticated;
revoke execute on function batch_promote_students(integer, text, integer[]) from public, authenticated;

create or replace function approval_actor(p_role integer)
returns table(uid integer, uname text) language plpgsql security definer set search_path = public as $$
begin
  return query select user_id, username::text from users
    where lower(email) = lower(auth.jwt() ->> 'email') and is_active and role_id = p_role limit 1;
  if not found then raise exception 'Not authorized for this request'; end if;
end $$;

create or replace function request_grade_correction(p_subject_id integer, p_school_year text, p_student_id integer, p_new_grade numeric, p_letter text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; subj text; old_grade numeric; is_locked boolean; sname text; rid integer;
begin
  select * into a from approval_actor(3);
  if nullif(trim(p_reason), '') is null then raise exception 'A reason is required'; end if;
  if p_new_grade is null or p_new_grade < 0 or p_new_grade > 100 then raise exception 'Grade must be between 0 and 100'; end if;
  select subject_name into subj from subjects where subject_id = p_subject_id;
  if subj is null then raise exception 'Subject not found'; end if;
  if not faculty_teaches_subject(p_subject_id) or not faculty_teaches_student(p_student_id) then raise exception 'This class is not assigned to you'; end if;
  select grade, locked into old_grade, is_locked from academic_history where student_id = p_student_id and school_year = p_school_year and subject = subj;
  if not found then raise exception 'No grade on record for that student'; end if;
  if not is_locked then raise exception 'Grades are not locked; edit them directly'; end if;
  if exists (select 1 from approval_requests where status = 'pending' and request_type = 'grade_correction'
      and (payload->>'student_id')::int = p_student_id and payload->>'subject' = subj and payload->>'school_year' = p_school_year) then
    raise exception 'A correction for this grade is already awaiting approval';
  end if;
  select first_name || ' ' || last_name into sname from students where student_id = p_student_id;
  insert into approval_requests(request_type, payload, summary, reason, requested_by, requester_name)
  values ('grade_correction',
    jsonb_build_object('student_id', p_student_id, 'subject', subj, 'school_year', p_school_year, 'old_grade', old_grade, 'new_grade', p_new_grade, 'letter_grade', nullif(trim(p_letter), '')),
    format('%s, %s (%s): %s → %s', sname, subj, p_school_year, old_grade, p_new_grade), trim(p_reason), a.uid, a.uname)
  returning id into rid;
  return jsonb_build_object('request_id', rid);
end $$;

create or replace function request_withdrawal(p_student_id integer, p_kind text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; sname text; rid integer;
begin
  select * into a from approval_actor(2);
  if p_kind not in ('Transferred','Withdrawn') then raise exception 'Unknown request kind'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A reason is required'; end if;
  select first_name || ' ' || last_name into sname from students where student_id = p_student_id;
  if sname is null then raise exception 'Student not found'; end if;
  if exists (select 1 from approval_requests where status = 'pending' and request_type = 'withdrawal' and (payload->>'student_id')::int = p_student_id) then
    raise exception 'This student already has a pending request';
  end if;
  insert into approval_requests(request_type, payload, summary, reason, requested_by, requester_name)
  values ('withdrawal', jsonb_build_object('student_id', p_student_id, 'kind', p_kind),
    format('%s: %s', case when p_kind = 'Transferred' then 'Transfer out' else 'Withdrawal' end, sname), trim(p_reason), a.uid, a.uname)
  returning id into rid;
  return jsonb_build_object('request_id', rid);
end $$;

create or replace function request_promotion(p_grade_level integer, p_school_year text, p_excluded integer[], p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; total integer; rid integer;
begin
  select * into a from approval_actor(2);
  if nullif(trim(p_school_year), '') is null then raise exception 'A school year is required'; end if;
  select count(*) into total from students where grade_level = p_grade_level and not (student_id = any(coalesce(p_excluded, '{}')));
  if total = 0 then raise exception 'No students to promote in that grade level'; end if;
  insert into approval_requests(request_type, payload, summary, reason, requested_by, requester_name)
  values ('promotion', jsonb_build_object('grade_level', p_grade_level, 'school_year', p_school_year, 'excluded', coalesce(p_excluded, '{}')),
    format('Promote Grade %s to next year (%s): %s student(s), %s excluded', p_grade_level, p_school_year, total, coalesce(array_length(p_excluded, 1), 0)),
    coalesce(nullif(trim(p_reason), ''), 'Year-end promotion'), a.uid, a.uname)
  returning id into rid;
  return jsonb_build_object('request_id', rid, 'students', total);
end $$;

create or replace function request_account_action(p_username text, p_action text, p_new_role integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; target record; rid integer;
begin
  select * into a from approval_actor(2);
  if p_action not in ('reset','deactivate','activate','role_change') then raise exception 'Unknown account action'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A reason is required'; end if;
  select user_id, username, role_id into target from users where lower(username) = lower(trim(p_username));
  if not found then raise exception 'No account with that username'; end if;
  if target.user_id = a.uid or target.role_id = 1 then raise exception 'That account cannot be targeted from a registrar request'; end if;
  if p_action = 'role_change' and (target.role_id = 4 or p_new_role not in (2,3) or p_new_role = target.role_id) then
    raise exception 'Role change must move a staff account to a different staff role';
  end if;
  if exists (select 1 from approval_requests where status = 'pending' and request_type = 'account_action' and (payload->>'target_user_id')::int = target.user_id) then
    raise exception 'This account already has a pending request';
  end if;
  insert into approval_requests(request_type, payload, summary, reason, requested_by, requester_name)
  values ('account_action', jsonb_build_object('target_user_id', target.user_id, 'username', target.username, 'action', p_action, 'new_role', p_new_role),
    format('%s: %s', case p_action when 'reset' then 'Reset password' when 'deactivate' then 'Deactivate account' when 'activate' then 'Reactivate account' else 'Change role to ' || case p_new_role when 2 then 'Registrar' else 'Faculty' end end, target.username),
    trim(p_reason), a.uid, a.uname)
  returning id into rid;
  return jsonb_build_object('request_id', rid);
end $$;

-- Admin decision. Database-only actions run here in one transaction; password reset and
-- activate/deactivate touch Supabase Auth, so the browser runs the provision-account Edge
-- Function first and then records the approval here.
create or replace function review_approval(p_id integer, p_approve boolean, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; r approval_requests%rowtype; pl jsonb; requester_email text; outcome jsonb := '{}'::jsonb;
begin
  select * into a from approval_actor(1);
  select * into r from approval_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'This request is no longer pending'; end if;
  pl := r.payload;
  if p_approve then
    if r.request_type = 'grade_correction' then
      -- The lock trigger allows only the lock flag to change on a locked row, so unlock, edit, relock.
      update academic_history set locked = false where student_id = (pl->>'student_id')::int and school_year = pl->>'school_year' and subject = pl->>'subject';
      update academic_history set final = (pl->>'new_grade')::numeric, grade = (pl->>'new_grade')::numeric, letter_grade = pl->>'letter_grade'
        where student_id = (pl->>'student_id')::int and school_year = pl->>'school_year' and subject = pl->>'subject';
      update academic_history set locked = true where student_id = (pl->>'student_id')::int and school_year = pl->>'school_year' and subject = pl->>'subject';
    elsif r.request_type = 'withdrawal' then
      perform transfer_student_out((pl->>'student_id')::int, r.reason);
      update students set enrollment_status = pl->>'kind' where student_id = (pl->>'student_id')::int;
    elsif r.request_type = 'promotion' then
      outcome := batch_promote_students((pl->>'grade_level')::int, pl->>'school_year', array(select jsonb_array_elements_text(pl->'excluded')::int));
    elsif r.request_type = 'override' then
      perform place_with_override((pl->>'student_id')::int, (pl->>'section_id')::int, r.reason, r.requester_name);
    elsif r.request_type = 'account_action' and pl->>'action' = 'role_change' then
      update users set role_id = (pl->>'new_role')::int where user_id = (pl->>'target_user_id')::int;
    end if;
  end if;
  update approval_requests set status = case when p_approve then 'approved' else 'rejected' end,
    remarks = nullif(trim(p_remarks), ''), reviewed_by = a.uid, reviewed_at = now() where id = p_id;
  insert into audit_logs(action, entity_type, entity_id, details)
  values (case when p_approve then 'APPROVE_REQUEST' else 'REJECT_REQUEST' end, r.request_type, p_id,
    jsonb_build_object('summary', r.summary, 'requested_by', r.requester_name, 'reviewed_by', a.uname, 'remarks', p_remarks));
  select email into requester_email from users where user_id = r.requested_by;
  insert into notifications(recipient_email, recipient_user_id, title, message, entity_type, entity_id)
  values (requester_email, r.requested_by, 'Request ' || case when p_approve then 'approved' else 'rejected' end,
    r.summary || coalesce(' — ' || nullif(trim(p_remarks), ''), ''), 'approval_request', p_id);
  return outcome || jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end $$;

grant execute on function request_grade_correction(integer, text, integer, numeric, text, text) to authenticated;
grant execute on function request_withdrawal(integer, text, text) to authenticated;
grant execute on function request_promotion(integer, text, integer[], text) to authenticated;
grant execute on function request_account_action(text, text, integer, text) to authenticated;
grant execute on function review_approval(integer, boolean, text) to authenticated;

-- Faculty load changes need no approval: the affected teacher is just notified and taps "I see".
create or replace function notify_faculty_load_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare subj text; sec text; note text;
begin
  select subject_name into subj from subjects where subject_id = coalesce(new.subject_id, old.subject_id);
  select section_name into sec from sections where section_id = coalesce(new.section_id, old.section_id);
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.faculty_name is distinct from new.faculty_name) then
    insert into notifications(recipient_email, recipient_user_id, title, message, entity_type, entity_id)
    select u.email, u.user_id, 'Teaching load updated', format('You are no longer assigned to %s (%s).', subj, sec), 'schedule', old.schedule_id
    from staff_profiles sp join users u on u.user_id = sp.user_id
    where lower(trim(sp.first_name || ' ' || sp.last_name)) = lower(trim(old.faculty_name));
  end if;
  if tg_op <> 'DELETE' and new.faculty_name is not null
     and (tg_op = 'INSERT' or (old.faculty_name, old.day_of_week, old.start_time, old.end_time, old.room, old.section_id, old.subject_id)
          is distinct from (new.faculty_name, new.day_of_week, new.start_time, new.end_time, new.room, new.section_id, new.subject_id)) then
    note := case when tg_op = 'INSERT' or old.faculty_name is distinct from new.faculty_name
      then format('You were assigned to %s (%s).', subj, sec)
      else format('Your schedule for %s (%s) was changed.', subj, sec) end;
    insert into notifications(recipient_email, recipient_user_id, title, message, entity_type, entity_id)
    select u.email, u.user_id, 'Teaching load updated', note, 'schedule', new.schedule_id
    from staff_profiles sp join users u on u.user_id = sp.user_id
    where lower(trim(sp.first_name || ' ' || sp.last_name)) = lower(trim(new.faculty_name));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists faculty_load_notify on subject_schedules;
create trigger faculty_load_notify after insert or update or delete on subject_schedules
for each row execute function notify_faculty_load_change();

create or replace function acknowledge_notification(p_id integer) returns void
language sql security definer set search_path = public as $$
  update notifications set is_read = true where id = p_id and lower(recipient_email) = lower(auth.jwt() ->> 'email');
$$;
grant execute on function acknowledge_notification(integer) to authenticated;

-- Capacity override: a section that is full can take one more student, but only with a reason and
-- an admin's say-so (approval of a registrar request, or the admin acting directly). Grade-level
-- eligibility is never bypassed. The trigger honours a transaction-local flag that only
-- place_with_override sets.
create or replace function enforce_enrollment_capacity() returns trigger language plpgsql as $$
declare target sections%rowtype; student_grade integer;
begin
  if new.status <> 'active' or new.section_id is null then return new; end if;
  select * into target from sections where section_id = new.section_id for update;
  if not found then raise exception 'Section not found'; end if;
  select grade_level into student_grade from students where student_id = new.student_id;
  if student_grade is not null and student_grade <> target.grade_level then raise exception 'Student grade level is not eligible for this section'; end if;
  if coalesce(current_setting('app.capacity_override', true), '') <> 'on'
     and (select count(*) from enrollments where section_id = new.section_id and status = 'active' and id <> coalesce(new.id, -1)) >= target.capacity then
    raise exception 'Target section is full';
  end if;
  return new;
end $$;

create or replace function place_with_override(p_student_id integer, p_section_id integer, p_reason text, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target sections%rowtype; student_grade integer; yr text; seats integer;
begin
  select * into target from sections where section_id = p_section_id for update;
  if not found then raise exception 'Section not found'; end if;
  select grade_level into student_grade from students where student_id = p_student_id;
  if not found then raise exception 'Student not found'; end if;
  if target.grade_level <> student_grade then raise exception 'Grade level is not eligible for this section'; end if;
  yr := extract(year from current_date)::text || '-' || (extract(year from current_date) + 1)::text;
  perform set_config('app.capacity_override', 'on', true);
  insert into enrollments(student_id, school_year, grade_level, section_id, status, enrolled_at)
  values (p_student_id, yr, student_grade, p_section_id, 'active', now())
  on conflict (student_id, school_year) do update set section_id = excluded.section_id, grade_level = excluded.grade_level, status = 'active';
  perform set_config('app.capacity_override', 'off', true);
  select count(*) into seats from enrollments where section_id = p_section_id and status = 'active';
  insert into audit_logs(action, entity_type, entity_id, details)
  values ('OVERRIDE_PLACE', 'student', p_student_id, jsonb_build_object('section_id', p_section_id, 'section', target.section_name, 'enrolled_now', seats, 'capacity', target.capacity, 'reason', p_reason, 'approved_by', p_actor));
  return jsonb_build_object('section_name', target.section_name, 'enrolled_now', seats, 'capacity', target.capacity);
end $$;
revoke execute on function place_with_override(integer, integer, text, text) from public, authenticated;

create or replace function request_capacity_override(p_student_id integer, p_section_id integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; target sections%rowtype; s record; seats integer; rid integer;
begin
  select * into a from approval_actor(2);
  if nullif(trim(p_reason), '') is null then raise exception 'A reason is required'; end if;
  select * into target from sections where section_id = p_section_id;
  if not found then raise exception 'Section not found'; end if;
  select first_name || ' ' || last_name as name, grade_level into s from students where student_id = p_student_id;
  if not found then raise exception 'Student not found'; end if;
  if s.grade_level is distinct from target.grade_level then raise exception 'Grade level is not eligible for this section'; end if;
  if exists (select 1 from enrollments where student_id = p_student_id and section_id = p_section_id and status = 'active') then raise exception 'Student is already in this section'; end if;
  select count(*) into seats from enrollments where section_id = p_section_id and status = 'active';
  if seats < target.capacity then raise exception 'This section still has open seats; place the student normally'; end if;
  if exists (select 1 from approval_requests where status = 'pending' and request_type = 'override' and (payload->>'student_id')::int = p_student_id) then
    raise exception 'This student already has a pending override request';
  end if;
  insert into approval_requests(request_type, payload, summary, reason, requested_by, requester_name)
  values ('override', jsonb_build_object('student_id', p_student_id, 'section_id', p_section_id),
    format('Capacity override: %s into %s (%s/%s seats, would be %s)', s.name, target.section_name, seats, target.capacity, seats + 1), trim(p_reason), a.uid, a.uname)
  returning id into rid;
  return jsonb_build_object('request_id', rid);
end $$;

create or replace function admin_place_override(p_student_id integer, p_section_id integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from approval_actor(1);
  if nullif(trim(p_reason), '') is null then raise exception 'A reason is required'; end if;
  return place_with_override(p_student_id, p_section_id, trim(p_reason), a.uname);
end $$;
grant execute on function request_capacity_override(integer, integer, text) to authenticated;
grant execute on function admin_place_override(integer, integer, text) to authenticated;
-- END migration-v12-approval-requests.sql


-- ============================================================
-- BEGIN migration-v13-announcement-kinds.sql
-- ============================================================
-- Announcements get an audience (which dashboard shows them), a kind, an expiry and a pin. A 'maintenance'
-- announcement also appears on the public login screen, so the login page can read it
-- without signing in; anon may read only the columns granted below, never created_by.
-- Run after backupsqlmigration.sql. Safe to re-run.
alter table announcements add column if not exists kind text not null default 'notice';
alter table announcements add column if not exists audience text not null default 'all';
alter table announcements add column if not exists expires_at timestamptz;
alter table announcements add column if not exists pinned boolean not null default false;
alter table announcements drop constraint if exists announcements_kind_check;
alter table announcements add constraint announcements_kind_check check (kind in ('notice','maintenance'));
alter table announcements drop constraint if exists announcements_audience_check;
alter table announcements add constraint announcements_audience_check check (audience in ('all','admin','registrar','faculty','student'));

drop policy if exists announcements_read on announcements;
create policy announcements_read on announcements for select to authenticated
  using ((expires_at is null or expires_at > now())
    and (audience = 'all' or (select current_app_role()) = case audience when 'admin' then 1 when 'registrar' then 2 when 'faculty' then 3 else 4 end));

drop policy if exists announcements_public_maintenance on announcements;
create policy announcements_public_maintenance on announcements for select to anon
  using (kind = 'maintenance' and (expires_at is null or expires_at > now()));
grant select (id, title, message, kind, audience, pinned, posted_at, expires_at) on announcements to anon;
-- END migration-v13-announcement-kinds.sql


-- ============================================================
-- BEGIN migration-v14-student-edit-notifications.sql
-- ============================================================
-- Admin edits to a student's record: the admin must re-enter their password in the app, the
-- change is applied and audited in one transaction, and the student gets a notification
-- with before/after values. Notifications visible to non-staff expire after 7 days.
-- Also lets 'Withdrawn' be a student status (request_withdrawal sets it on approval).
-- Run after backupsqlmigration.sql. Safe to re-run.
alter table notifications add column if not exists details jsonb;

drop policy if exists user_notifications on notifications;
create policy user_notifications on notifications for select to authenticated
  using ((select current_app_role()) in (1,2)
    or (lower(recipient_email) = lower(auth.jwt() ->> 'email') and created_at > now() - interval '7 days'));

alter table students drop constraint if exists students_enrollment_status_check;
alter table students add constraint students_enrollment_status_check
  check (enrollment_status in ('Enrolled','Pending','Graduated','Transferred','Withdrawn'));

create or replace function admin_update_student(p_student_id integer, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a record; old_row jsonb; k text; newval text; diff jsonb := '{}'::jsonb; sets text := '';
  student_email text; student_user integer;
  allowed text[] := array['first_name','middle_name','last_name','date_of_birth','gender','grade_level','enrollment_status',
    'address','contact_number','guardian_name','guardian_relationship','guardian_phone','guardian_email','medical_notes'];
begin
  select * into a from approval_actor(1);
  select to_jsonb(s) into old_row from students s where s.student_id = p_student_id for update;
  if old_row is null then raise exception 'Student not found'; end if;
  foreach k in array allowed loop
    if p_changes ? k then
      newval := nullif(trim(p_changes->>k), '');
      if (old_row->>k) is distinct from newval then
        if k in ('first_name','last_name') and newval is null then raise exception '% is required', replace(k, '_', ' '); end if;
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_row->k, 'to', to_jsonb(newval)));
        sets := sets || format('%I = %L, ', k, newval);
      end if;
    end if;
  end loop;
  if diff = '{}'::jsonb then raise exception 'No changes to save'; end if;
  execute format('update students set %s updated_at = now() where student_id = %L', sets, p_student_id);
  select user_id, email into student_user, student_email from users where student_id = p_student_id limit 1;
  if student_email is not null then
    insert into notifications(recipient_email, recipient_user_id, title, message, entity_type, entity_id, details)
    values (student_email, student_user, 'Your student record was updated',
      'An administrator updated: ' || (select string_agg(replace(key, '_', ' '), ', ') from jsonb_object_keys(diff) as key) || '.',
      'student_update', p_student_id, diff);
  end if;
  insert into audit_logs(action, entity_type, entity_id, details)
  values ('ADMIN_UPDATE_STUDENT', 'student', p_student_id, jsonb_build_object('actor', a.uname, 'changes', diff));
  return diff;
end $$;
grant execute on function admin_update_student(integer, jsonb) to authenticated;
-- END migration-v14-student-edit-notifications.sql


-- ============================================================
-- BEGIN migration-v15-security-hardening.sql
-- Security audit fixes: shift_student / manual_place_student / auto_place_student had no role check
-- and were callable by anyone holding the public anon key; archive_audit_logs (which deletes audit
-- rows) was callable by anyone; every SECURITY DEFINER function was executable by anon.
-- ============================================================
create or replace function shift_student(p_student_id integer,p_target_section_id integer,p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare old_section integer; old_name text; new_name text; student_grade integer;
begin
  if coalesce((select current_app_role()), 0) not in (1, 2) then raise exception 'Not authorized'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Shift reason is required'; end if;
  select grade_level into student_grade from students where student_id=p_student_id for update; if not found then raise exception 'Student not found'; end if;
  select section_name into new_name from sections where section_id=p_target_section_id and grade_level=student_grade; if not found then raise exception 'Target section is not eligible'; end if;
  if (select count(*) from enrollments where section_id=p_target_section_id and status='active') >= (select capacity from sections where section_id=p_target_section_id) then raise exception 'Target section is full'; end if;
  select section_id into old_section from enrollments where student_id=p_student_id and status='active' order by created_at desc limit 1;
  if old_section=p_target_section_id then raise exception 'Student is already in the target section'; end if;
  if old_section is not null then select section_name into old_name from sections where section_id=old_section; end if;
  update enrollments set section_id=p_target_section_id where student_id=p_student_id and status='active';
  insert into shift_requests(student_id,from_section_id,target_section_id,reason) values(p_student_id,old_section,p_target_section_id,p_reason);
  insert into notifications(title,message,entity_type,entity_id) values('Student Section Shift','Student shifted from '||coalesce(old_name,'Unassigned')||' to '||new_name||'.','student',p_student_id);
  insert into audit_logs(action,entity_type,entity_id,details) values('SHIFT_STUDENT','student',p_student_id,jsonb_build_object('from_section',old_section,'target_section',p_target_section_id,'reason',p_reason));
  return jsonb_build_object('student_id',p_student_id,'from_section',old_name,'to_section',new_name);
end $$;
create or replace function manual_place_student(p_student_id integer,p_section_id integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target sections%rowtype; student_grade integer;
begin
  if coalesce((select current_app_role()), 0) not in (1, 2) then raise exception 'Not authorized'; end if;
  select * into target from sections where section_id=p_section_id for update; if not found then raise exception 'Section not found'; end if;
  select grade_level into student_grade from students where student_id=p_student_id; if not found then raise exception 'Student not found'; end if;
  if target.grade_level<>student_grade then raise exception 'Grade level is not eligible for this section'; end if;
  if (select count(*) from enrollments where section_id=p_section_id and status='active')>=target.capacity then raise exception 'Target section is full'; end if;
  insert into enrollments(student_id,school_year,grade_level,section_id,status,enrolled_at) values(p_student_id,extract(year from current_date)::text||'-'||(extract(year from current_date)+1)::text,student_grade,p_section_id,'active',now()) on conflict(student_id,school_year) do update set section_id=excluded.section_id,status='active';
  insert into audit_logs(action,entity_type,entity_id,details) values('MANUAL_PLACE','student',p_student_id,jsonb_build_object('section_id',p_section_id));
  return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name);
end $$;
create or replace function auto_place_student(p_student_id integer,p_grade_level integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target sections%rowtype; old_section integer;
begin
  if coalesce((select current_app_role()), 0) not in (1, 2) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from students where student_id=p_student_id) then raise exception 'Student not found'; end if;
  select section_id into old_section from enrollments where student_id=p_student_id and status='active' order by created_at desc limit 1;
  select s.* into target from sections s where s.grade_level=p_grade_level and (select count(*) from enrollments e where e.section_id=s.section_id and e.status='active')<s.capacity order by (select count(*) from enrollments e where e.section_id=s.section_id and e.status='active'),s.section_name limit 1 for update;
  if not found then raise exception 'No eligible section has available capacity'; end if;
  if old_section=target.section_id then return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name); end if;
  insert into enrollments(student_id,school_year,grade_level,section_id,status,enrolled_at) values(p_student_id,extract(year from current_date)::text||'-'||(extract(year from current_date)+1)::text,p_grade_level,target.section_id,'active',now()) on conflict(student_id,school_year) do update set section_id=excluded.section_id,grade_level=excluded.grade_level,status='active';
  insert into audit_logs(action,entity_type,entity_id,details) values('AUTO_PLACE','student',p_student_id,jsonb_build_object('section_id',target.section_id));
  return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name);
end $$;

-- Audit-log archiving is a maintenance job (runs as postgres/service role), never a browser call.
revoke execute on function archive_audit_logs(date) from public, anon, authenticated;

-- Nothing except the login lookup needs to run before sign-in. Strip the default anon/public grant from
-- every function in public, then give the one exception back.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'find_login_email'
  loop execute format('grant execute on function %s to anon, authenticated', f.sig); end loop;
end $$;

-- roles had RLS off (advisor ERROR): allow read-only for signed-in users.
alter table public.roles enable row level security;
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using ((select current_app_role()) in (1,2,3,4));

notify pgrst, 'reload schema';
-- END migration-v15-security-hardening.sql


-- ============================================================
-- BEGIN migration-v16-announcement-author.sql
-- Recipients cannot read other users' rows, so the author's display name ("First Last", first word of
-- the first name only) is stored on the announcement when it is posted.
-- ============================================================
alter table announcements add column if not exists author_name text;
update announcements a
set author_name = split_part(trim(ad.first_name), ' ', 1) || ' ' || trim(ad.last_name)
from admins ad
where ad.user_id = a.created_by and a.author_name is null;
-- One-off data fix: the two demo announcements were reassigned to the admin account gkhan.
update announcements set created_by = (select user_id from users where username = 'gkhan'), author_name = 'Genghis Khan' where id in (2, 3);
notify pgrst, 'reload schema';
-- END migration-v16-announcement-author.sql


-- ============================================================
-- BEGIN migration-v17-revoke-unused-definer-functions.sql
-- Security audit round 2: these SECURITY DEFINER functions have no role check inside them and no code in
-- the app calls them, yet any signed-in user (including students) could run them over /rest/v1/rpc.
-- Internal calls between them still work because they run as the function owner.
-- ============================================================
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('save_class_schedule','assign_student_to_section','bulk_assign_students',
                               'validate_section_assignment','check_schedule_conflict','rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
notify pgrst, 'reload schema';
-- END migration-v17-revoke-unused-definer-functions.sql


-- ============================================================
-- BEGIN migration-v18-attendance-legacy-columns.sql
-- The live attendance table still had two legacy NOT NULL columns (schedule_id -> class_schedules, "date").
-- save_attendance() never sets them, so every faculty attendance save failed. Relax them.
-- ============================================================
alter table attendance alter column schedule_id drop not null;
alter table attendance alter column "date" drop not null;
notify pgrst, 'reload schema';
-- END migration-v18-attendance-legacy-columns.sql


-- ============================================================
-- BEGIN migration-v19-sample-data.sql   (OPTIONAL demo data; safe to skip on a real restore)
-- Sections relabelled to 2026-2027 (matches the enrollments), rooms, full Mon-Fri timetables with teachers,
-- faculty_subjects, Q1 grades (Masungit G6, Marumi G9) and one week of attendance (Masungit, Marumi, Mapayapa).
-- The timetable was generated conflict-free (section / teacher / shared room) and the DB conflict trigger re-checks it.
-- Idempotent. Run in one transaction. UNDO notes at the bottom.
-- ============================================================
alter table subject_schedules disable trigger faculty_load_notify;  -- no notification per generated row

update sections set academic_year = '2026-2027';
update sections set room = case section_id when 7 then 'Room 101' when 6 then 'Room 201' when 5 then 'Room 202' when 4 then 'Room 301' when 1 then 'Room 302' when 2 then 'Room 303' when 3 then 'Room 304' end;
update sections set faculty_assigned = 'Irene Sofia Navarro' where section_id = 2;  -- was a registrar

-- existing schedule rows: fill teacher + room (times untouched)
update subject_schedules set faculty_name = 'Bernardo Luis Reyes', room = 'Room 301' where schedule_id in (12,13,14,15,16);
update subject_schedules set faculty_name = 'Althea Marie Santos', room = 'Room 101' where schedule_id in (21,22,23,24,25);
update subject_schedules set faculty_name = 'Eunice Grace Villanueva', room = 'Room 101' where schedule_id in (26,27,28,29,30);
update subject_schedules set faculty_name = 'Irene Sofia Navarro', room = 'Room 302' where schedule_id in (2);
update subject_schedules set faculty_name = 'Irene Sofia Navarro', room = 'Room 303' where schedule_id in (3,8,9,10,11);
update subject_schedules set faculty_name = 'Francis Miguel Torres', room = 'Room 301' where schedule_id in (5,17,18,19,20);

-- new timetable blocks, repeated Monday-Friday (a day that already exists is skipped)
insert into subject_schedules (subject_id, section_id, faculty_name, room, day_of_week, start_time, end_time)
select b.subject_id, b.section_id, b.fac, b.room, d.day, b.st::time, b.en::time
from (values
  (1, 1, 'Hector Paolo Ramos', 'Room 302', '08:15', '09:00'),
  (1, 2, 'Hector Paolo Ramos', 'Room 303', '13:45', '14:30'),
  (1, 3, 'Hector Paolo Ramos', 'Room 304', '10:45', '11:30'),
  (2, 1, 'Irene Sofia Navarro', 'Room 302', '09:00', '10:30'),
  (2, 3, 'Irene Sofia Navarro', 'Room 304', '11:30', '12:15'),
  (2, 4, 'Althea Marie Santos', 'Room 301', '15:15', '16:00'),
  (2, 5, 'Althea Marie Santos', 'Room 202', '13:00', '13:45'),
  (2, 6, 'Althea Marie Santos', 'Room 201', '14:30', '15:15'),
  (3, 1, 'Bernardo Luis Reyes', 'Room 302', '10:45', '11:30'),
  (3, 2, 'Bernardo Luis Reyes', 'Room 303', '15:15', '16:00'),
  (3, 3, 'Bernardo Luis Reyes', 'Room 304', '14:30', '15:15'),
  (3, 5, 'Bernardo Luis Reyes', 'Room 202', '07:30', '08:15'),
  (3, 6, 'Bernardo Luis Reyes', 'Room 201', '08:15', '09:00'),
  (3, 7, 'Bernardo Luis Reyes', 'Room 101', '13:45', '14:30'),
  (4, 1, 'Eunice Grace Villanueva', 'Room 302', '13:00', '13:45'),
  (4, 2, 'Francis Miguel Torres', 'Room 303', '09:00', '09:45'),
  (4, 3, 'Eunice Grace Villanueva', 'Room 304', '13:45', '14:30'),
  (4, 5, 'Eunice Grace Villanueva', 'Room 202', '14:30', '15:15'),
  (4, 6, 'Francis Miguel Torres', 'Room 201', '13:00', '13:45'),
  (5, 1, 'Carla Denise Garcia', 'Room 302', '11:30', '12:15'),
  (5, 2, 'Carla Denise Garcia', 'Room 303', '10:00', '10:45'),
  (5, 3, 'Carla Denise Garcia', 'Room 304', '13:00', '13:45'),
  (5, 4, 'Carla Denise Garcia', 'Room 301', '07:30', '08:15'),
  (5, 5, 'Carla Denise Garcia', 'Room 202', '15:15', '16:00'),
  (5, 6, 'Carla Denise Garcia', 'Room 201', '09:00', '09:45'),
  (5, 7, 'Carla Denise Garcia', 'Room 101', '14:30', '15:15'),
  (6, 1, 'Francis Miguel Torres', 'Room 302', '13:45', '14:30'),
  (6, 2, 'Francis Miguel Torres', 'Room 303', '11:30', '12:15'),
  (6, 3, 'Francis Miguel Torres', 'Room 304', '07:30', '08:15'),
  (6, 4, 'Francis Miguel Torres', 'Room 301', '08:15', '09:00'),
  (6, 5, 'Diego Rafael Mendoza', 'Room 202', '08:15', '09:00'),
  (6, 6, 'Diego Rafael Mendoza', 'Room 201', '10:45', '11:30'),
  (6, 7, 'Francis Miguel Torres', 'Room 101', '15:15', '16:00'),
  (7, 1, 'Gloria Mae Dela Peña', 'Gym', '15:15', '16:00'),
  (7, 2, 'Gloria Mae Dela Peña', 'Gym', '14:30', '15:15'),
  (7, 3, 'Gloria Mae Dela Peña', 'Gym', '09:00', '09:45'),
  (7, 4, 'Gloria Mae Dela Peña', 'Gym', '13:45', '14:30'),
  (7, 5, 'Gloria Mae Dela Peña', 'Gym', '11:30', '12:15'),
  (7, 6, 'Gloria Mae Dela Peña', 'Gym', '07:30', '08:15'),
  (7, 7, 'Gloria Mae Dela Peña', 'Gym', '13:00', '13:45'),
  (8, 4, 'Julio Andres Castro', 'Computer Lab', '14:30', '15:15'),
  (8, 5, 'Julio Andres Castro', 'Computer Lab', '13:45', '14:30'),
  (8, 6, 'Julio Andres Castro', 'Computer Lab', '15:15', '16:00'),
  (9, 4, 'Diego Rafael Mendoza', 'Room 301', '09:00', '09:45'),
  (9, 5, 'Diego Rafael Mendoza', 'Room 202', '10:00', '10:45'),
  (9, 6, 'Diego Rafael Mendoza', 'Room 201', '11:30', '12:15'),
  (10, 1, 'Julio Andres Castro', 'Computer Lab', '07:30', '08:15'),
  (10, 2, 'Julio Andres Castro', 'Computer Lab', '13:00', '13:45'),
  (10, 3, 'Julio Andres Castro', 'Computer Lab', '10:00', '10:45')
) as b(subject_id, section_id, fac, room, st, en)
cross join generate_series(1, 5) as d(day)
where not exists (select 1 from subject_schedules x where x.section_id = b.section_id and x.subject_id = b.subject_id
                  and x.day_of_week = d.day and x.start_time = b.st::time)
order by b.section_id, b.st, d.day;

alter table subject_schedules enable trigger faculty_load_notify;

-- faculty_subjects: one row per teacher/subject pair in the timetable; a registrar is no longer listed as a teacher
delete from faculty_subjects where profile_id = 12;
insert into faculty_subjects (profile_id, subject_id) values (1, 2), (2, 3), (3, 5), (4, 6), (4, 9), (5, 4), (6, 4), (6, 6), (7, 7), (8, 1), (9, 2), (10, 8), (10, 10)
on conflict (profile_id, subject_id) do nothing;

-- grades: first quarter of 2026-2027 for the students of Masungit (G6) and Marumi (G9), one row per timetable subject.
-- Deterministic scores 78.0-96.9 derived from the ids, letter grade from the usual DepEd-style bands.
insert into academic_history (student_id, school_year, subject, grade, first_sem_q1, letter_grade, remarks)
select e.student_id, '2026-2027', sub.subject_name, g.score, g.score,
       case when g.score >= 97 then 'A+' when g.score >= 92 then 'A' when g.score >= 87 then 'B+' when g.score >= 82 then 'B'
            when g.score >= 78 then 'C+' when g.score >= 75 then 'C' else 'F' end,
       'Sample: Q1 in progress'
from enrollments e
join (select distinct section_id, subject_id from subject_schedules) t on t.section_id = e.section_id
join subjects sub on sub.subject_id = t.subject_id
cross join lateral (select round(78 + ((e.student_id * 37 + sub.subject_id * 53) % 190) / 10.0, 2) as score) g
where e.status = 'active' and e.section_id in (4, 7)
on conflict (student_id, school_year, subject) do nothing;

-- attendance: Mon 2026-09-21 .. Fri 2026-09-25 for Masungit, Marumi and Mapayapa, first-period subject of each section.
-- About 88% Present, 6% Late, 4% Absent, 2% Excused (deterministic).
insert into attendance (student_id, attendance_date, status, section_id, subject_id, recorded_by)
select e.student_id, d::date,
       case when h < 88 then 'Present' when h < 94 then 'Late' when h < 98 then 'Absent' else 'Excused' end,
       e.section_id,
       (select s.subject_id from subject_schedules s where s.section_id = e.section_id order by s.start_time, s.day_of_week limit 1),
       'sample-data'
from enrollments e
cross join generate_series('2026-09-21'::date, '2026-09-25'::date, interval '1 day') as d
cross join lateral (select (e.student_id * 31 + extract(day from d)::int * 17) % 100 as h) x
where e.status = 'active' and e.section_id in (4, 6, 7)
on conflict (student_id, attendance_date, section_id, subject_id) do nothing;

insert into audit_logs (action, entity_type, details)
values ('SEED_SAMPLE_DATA', 'system', jsonb_build_object('version', 'v19', 'note', 'demo schedules, grades and attendance'));
notify pgrst, 'reload schema';

-- UNDO (only to remove the demo data again; schedule rows added have schedule_id > 30):
--   delete from attendance where recorded_by = 'sample-data';
--   delete from academic_history where remarks = 'Sample: Q1 in progress';
--   delete from subject_schedules where schedule_id > 30;
--   (teacher/room on the 26 original schedule rows, section year/rooms and faculty_subjects were also changed; restore from backups/ if needed)
-- END migration-v19-sample-data.sql


-- ============================================================
-- BEGIN migration-v20-school-year-settings.sql
-- Lunch and break times are set per school year (the school changes them), not hard-coded.
-- Everyone signed in can read them (schedule pages show the gap); only admins can change them.
-- ============================================================
create table if not exists school_year_settings (
  school_year text primary key,
  lunch_start time not null,
  lunch_end time not null,
  break_start time,
  break_end time,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint school_year_settings_lunch_check check (lunch_end > lunch_start),
  constraint school_year_settings_break_check check ((break_start is null and break_end is null) or (break_start is not null and break_end > break_start))
);
insert into school_year_settings (school_year, lunch_start, lunch_end, break_start, break_end)
values ('2026-2027', '11:00', '12:00', '09:45', '10:00')
on conflict (school_year) do nothing;

alter table school_year_settings enable row level security;
revoke all on school_year_settings from anon;
drop policy if exists school_year_settings_read on school_year_settings;
create policy school_year_settings_read on school_year_settings for select to authenticated
  using ((select current_app_role()) in (1, 2, 3, 4));
drop policy if exists school_year_settings_admin on school_year_settings;
create policy school_year_settings_admin on school_year_settings for all to authenticated
  using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);
drop trigger if exists school_year_settings_audit on school_year_settings;
create trigger school_year_settings_audit after insert or update or delete on school_year_settings
  for each row execute function audit_row_change('school_year');
notify pgrst, 'reload schema';
-- END migration-v20-school-year-settings.sql


-- ============================================================
-- BEGIN migration-v21-move-classes-out-of-lunch.sql
-- Lunch for 2026-2027 is 11:00-12:00. Classes that started before lunch are cut at 11:00; classes that sat inside
-- lunch move to the nearest free slot (same teacher / room, no section, teacher or shared-room clash, not in
-- lunch or break, ending by 16:00). All-or-nothing: raises if any class cannot be placed.
-- ============================================================
do $$
declare
  ls time; le time; bs time; be time;
  blk record; cand time; dur interval; moved boolean; total int := 0; tname text;
  slots time[] := array['07:30','08:15','09:00','10:00','12:00','13:00','13:45','14:30','15:15']::time[];
begin
  select lunch_start, lunch_end, break_start, break_end into ls, le, bs, be from school_year_settings where school_year = '2026-2027';
  if ls is null then raise exception 'No lunch settings for 2026-2027'; end if;
  alter table subject_schedules disable trigger faculty_load_notify;  -- no notification per moved row

  -- 1) long classes that start well before lunch stop when lunch starts
  update subject_schedules set end_time = ls where start_time <= ls - interval '45 minutes' and start_time < ls and end_time > ls;

  -- 2) everything else that touches lunch moves as a whole block (all its days at once). Same teacher first; if that
  --    teacher has no free slot, the next free faculty member (one who already teaches the subject first).
  for blk in
    select section_id, subject_id, faculty_name, room, start_time, end_time, array_agg(schedule_id) as ids
    from subject_schedules where start_time < le and end_time > ls
    group by 1, 2, 3, 4, 5, 6 order by 1, 5
  loop
    dur := blk.end_time - blk.start_time;
    moved := false;
    for tname in
      select nm from (
        select blk.faculty_name as nm, 0 as pri where blk.faculty_name is not null
        union all
        select sp.first_name || ' ' || sp.last_name, 1 + case when exists (select 1 from faculty_subjects fs where fs.profile_id = sp.profile_id and fs.subject_id = blk.subject_id) then 0 else 1 end
        from staff_profiles sp join users u on u.user_id = sp.user_id
        where u.role_id = 3 and u.is_active and (sp.first_name || ' ' || sp.last_name) is distinct from blk.faculty_name
      ) q order by pri, nm
    loop
      for cand in select s from unnest(slots) s order by abs(extract(epoch from (s - blk.start_time))), s loop
        continue when cand < le and cand + dur > ls;
        continue when bs is not null and cand < be and cand + dur > bs;
        continue when cand + dur > time '16:00';
        if not exists (
          select 1 from subject_schedules x
          where x.schedule_id <> all (blk.ids) and x.start_time < cand + dur and x.end_time > cand
            and (x.section_id = blk.section_id
                 or lower(coalesce(x.faculty_name, '')) = lower(tname)
                 or (x.room = blk.room and blk.room in ('Gym', 'Computer Lab')))
        ) then
          update subject_schedules set faculty_name = tname, start_time = cand, end_time = cand + dur where schedule_id = any (blk.ids);
          moved := true; total := total + 1;
          exit;
        end if;
      end loop;
      exit when moved;
    end loop;
    if not moved then raise exception 'Could not move section % subject % out of lunch', blk.section_id, blk.subject_id; end if;
  end loop;

  alter table subject_schedules enable trigger faculty_load_notify;
  -- keep the faculty eligibility list in step with who now teaches what
  insert into faculty_subjects (profile_id, subject_id)
  select distinct sp.profile_id, ss.subject_id from subject_schedules ss
  join staff_profiles sp on lower(trim(ss.faculty_name)) = lower(trim(sp.first_name || ' ' || sp.last_name))
  join users u on u.user_id = sp.user_id and u.role_id = 3
  on conflict (profile_id, subject_id) do nothing;
  insert into audit_logs (action, entity_type, details)
  values ('MOVE_CLASSES_OUT_OF_LUNCH', 'system', jsonb_build_object('lunch', ls || '-' || le, 'blocks_moved', total));
end $$;
notify pgrst, 'reload schema';
-- END migration-v21-move-classes-out-of-lunch.sql


-- ============================================================
-- BEGIN migration-v22-student-profile-edit-requests.sql
-- Students request edits to their own profile (name, birth date, address, contact, guardian, medical notes).
-- Nothing changes until an administrator approves it in the existing approvals queue (approval_requests).
-- ============================================================
alter table approval_requests drop constraint if exists approval_requests_request_type_check;
alter table approval_requests add constraint approval_requests_request_type_check
  check (request_type in ('grade_correction','withdrawal','promotion','account_action','override','student_profile'));

create or replace function request_student_profile(p_changes jsonb, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  a record; sid int; s students%rowtype; k text; cur text; nv text; changed jsonb := '{}'::jsonb; parts text[] := '{}'; rid int; lim int;
  labels jsonb := '{"first_name":"First name","middle_name":"Middle name","last_name":"Last name","date_of_birth":"Date of birth","address":"Address","contact_number":"Contact number","guardian_name":"Guardian","guardian_relationship":"Relationship","guardian_phone":"Guardian phone","guardian_email":"Guardian email","medical_notes":"Medical notes"}';
begin
  select * into a from approval_actor(4);
  select student_id into sid from users where user_id = a.uid;
  select * into s from students where student_id = sid;
  if not found then raise exception 'No student record is linked to this account'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not labels ? k then raise exception 'You cannot request a change to %', k; end if;
    nv := nullif(trim(p_changes->>k), '');
    lim := case when k = 'medical_notes' then 1000 else 200 end;
    if length(coalesce(nv, '')) > lim then raise exception '% is too long', labels->>k; end if;
    if k in ('first_name','last_name') and nv is null then raise exception '% cannot be empty', labels->>k; end if;
    if k = 'date_of_birth' then
      if nv is null then raise exception 'Date of birth cannot be empty'; end if;
      if nv::date > current_date then raise exception 'Date of birth cannot be in the future'; end if;
    end if;
    if k = 'guardian_email' and nv is not null and nv !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Guardian email is not valid'; end if;
    execute format('select %I::text from students where student_id = $1', k) into cur using sid;
    if nv is distinct from nullif(cur, '') then
      changed := changed || jsonb_build_object(k, nv);
      parts := parts || format('%s: %s -> %s', labels->>k, coalesce(cur, '(blank)'), coalesce(nv, '(blank)'));
    end if;
  end loop;
  if changed = '{}'::jsonb then raise exception 'Nothing was changed'; end if;
  if exists (select 1 from approval_requests where status = 'pending' and request_type = 'student_profile' and (payload->>'student_id')::int = sid) then
    raise exception 'You already have a profile edit waiting for approval';
  end if;
  insert into approval_requests(request_type, payload, summary, reason, requested_by, requester_name)
  values ('student_profile', jsonb_build_object('student_id', sid, 'changes', changed),
    format('%s %s - %s', s.first_name, s.last_name, array_to_string(parts, '; ')),
    coalesce(nullif(trim(p_reason), ''), 'Student requested a profile update'), a.uid, a.uname)
  returning id into rid;
  return jsonb_build_object('request_id', rid);
end $$;
revoke all on function request_student_profile(jsonb, text) from public, anon;
grant execute on function request_student_profile(jsonb, text) to authenticated;

-- review_approval: same as before plus the student_profile branch
create or replace function review_approval(p_id integer, p_approve boolean, p_remarks text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a record; r approval_requests%rowtype; pl jsonb; requester_email text; outcome jsonb := '{}'::jsonb; ch jsonb;
begin
  select * into a from approval_actor(1);
  select * into r from approval_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'This request is no longer pending'; end if;
  pl := r.payload;
  if p_approve then
    if r.request_type = 'grade_correction' then
      update academic_history set locked = false where student_id = (pl->>'student_id')::int and school_year = pl->>'school_year' and subject = pl->>'subject';
      update academic_history set final = (pl->>'new_grade')::numeric, grade = (pl->>'new_grade')::numeric, letter_grade = pl->>'letter_grade'
        where student_id = (pl->>'student_id')::int and school_year = pl->>'school_year' and subject = pl->>'subject';
      update academic_history set locked = true where student_id = (pl->>'student_id')::int and school_year = pl->>'school_year' and subject = pl->>'subject';
    elsif r.request_type = 'withdrawal' then
      perform transfer_student_out((pl->>'student_id')::int, r.reason);
      update students set enrollment_status = pl->>'kind' where student_id = (pl->>'student_id')::int;
    elsif r.request_type = 'promotion' then
      outcome := batch_promote_students((pl->>'grade_level')::int, pl->>'school_year', array(select jsonb_array_elements_text(pl->'excluded')::int));
    elsif r.request_type = 'override' then
      perform place_with_override((pl->>'student_id')::int, (pl->>'section_id')::int, r.reason, r.requester_name);
    elsif r.request_type = 'account_action' and pl->>'action' = 'role_change' then
      update users set role_id = (pl->>'new_role')::int where user_id = (pl->>'target_user_id')::int;
    elsif r.request_type = 'student_profile' then
      ch := pl->'changes';
      update students set
        first_name = case when ch ? 'first_name' then ch->>'first_name' else first_name end,
        middle_name = case when ch ? 'middle_name' then ch->>'middle_name' else middle_name end,
        last_name = case when ch ? 'last_name' then ch->>'last_name' else last_name end,
        date_of_birth = case when ch ? 'date_of_birth' then (ch->>'date_of_birth')::date else date_of_birth end,
        address = case when ch ? 'address' then ch->>'address' else address end,
        contact_number = case when ch ? 'contact_number' then ch->>'contact_number' else contact_number end,
        guardian_name = case when ch ? 'guardian_name' then ch->>'guardian_name' else guardian_name end,
        guardian_relationship = case when ch ? 'guardian_relationship' then ch->>'guardian_relationship' else guardian_relationship end,
        guardian_phone = case when ch ? 'guardian_phone' then ch->>'guardian_phone' else guardian_phone end,
        guardian_email = case when ch ? 'guardian_email' then ch->>'guardian_email' else guardian_email end,
        medical_notes = case when ch ? 'medical_notes' then ch->>'medical_notes' else medical_notes end,
        updated_at = now()
      where student_id = (pl->>'student_id')::int;
    end if;
  end if;
  update approval_requests set status = case when p_approve then 'approved' else 'rejected' end,
    remarks = nullif(trim(p_remarks), ''), reviewed_by = a.uid, reviewed_at = now() where id = p_id;
  insert into audit_logs(action, entity_type, entity_id, details)
  values (case when p_approve then 'APPROVE_REQUEST' else 'REJECT_REQUEST' end, r.request_type, p_id,
    jsonb_build_object('summary', r.summary, 'requested_by', r.requester_name, 'reviewed_by', a.uname, 'remarks', p_remarks));
  select email into requester_email from users where user_id = r.requested_by;
  insert into notifications(recipient_email, recipient_user_id, title, message, entity_type, entity_id)
  values (requester_email, r.requested_by, 'Request ' || case when p_approve then 'approved' else 'rejected' end,
    r.summary || coalesce(' - ' || nullif(trim(p_remarks), ''), ''), 'approval_request', p_id);
  return outcome || jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end $$;
notify pgrst, 'reload schema';
-- END migration-v22-student-profile-edit-requests.sql


-- ============================================================
-- BEGIN migration-v23-replace-demo-accounts.sql
-- Removes the four demo accounts (admin, registrar, faculty, student) and creates five real ones:
--   mjlatip (admin), jtalaba (registrar), asomido (faculty), sdeguzman (student, Grade 10), kvillajos (student, Grade 11).
-- Each account was given a starting password when this ran (not recorded here; change it after the demo). Other profile columns are placeholder data.
-- Sign-in accounts are created straight in auth.users / auth.identities with a bcrypt hash (same shape GoTrue writes).
-- The old test student "Khyle Christian Villajos" (LRN-TEST-001, no enrollments/grades/attendance) is kept and becomes kvillajos.
-- Grade 11 has no section yet, so kvillajos has no section until the registrar creates one and places him.
-- UNDO: restore from backups/tcsms-full-backup-*.sql (public data) and re-create auth accounts with the provision-account function.
-- ============================================================
do $$
declare a record; uid uuid; nid int; sid int;
begin
  -- 1) remove the old demo accounts (legacy faculty row has no cascade; admins/registrars/staff_profiles/profile_change_requests cascade)
  delete from faculty where user_id = 6;
  update students set user_id = null where user_id = 7;
  delete from users where username in ('admin', 'registrar', 'faculty', 'student');
  delete from auth.users where lower(email) in ('jvcubillan@addu.edu.ph', 'mjmlatip@addu.edu.ph', 'asomido@addu.edu.ph', 'kvillajos@addu.edu.ph');

  -- 2) sign-in accounts + users rows
  for a in select * from (values
    ('mjlatip',   'mjmlatip@addu.edu.ph',    1),
    ('sdeguzman', 'stcdeguzman@addu.edu.ph', 4),
    ('kvillajos', 'kvillajos@addu.edu.ph',   4),
    ('jtalaba',   'jotalaba@addu.edu.ph',    2),
    ('asomido',   'asomido@addu.edu.ph',     3)
  ) as v(username, email, role_id)
  loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change_token_current, email_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', a.email, extensions.crypt(<starting password>, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', false, false);
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', a.email, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now());
    insert into users (username, email, password_hash, role_id, is_active)
    values (a.username, a.email, extensions.crypt(<starting password>, extensions.gen_salt('bf')), a.role_id, true);
  end loop;

  -- 3) profiles
  insert into admins (user_id, employee_code, first_name, middle_name, last_name)
  select user_id, 'ADM-MJLATIP', 'Mj', 'Mallari', 'Latip' from users where username = 'mjlatip';

  insert into staff_profiles (user_id, employee_no, first_name, middle_name, last_name, department, specialization, phone)
  select user_id, 'REG-004', 'John', 'Reyes', 'Talaba', 'Registrar Office', 'Student Records', '09170000104' from users where username = 'jtalaba';
  insert into staff_profiles (user_id, employee_no, first_name, middle_name, last_name, department, specialization, phone)
  select user_id, 'FAC-011', 'Angela', 'Marie', 'Somido', 'Senior High School', 'English', '09170000111' from users where username = 'asomido';

  -- Sam De Guzman, Grade 10, placed in Malaya (Grade 10, 2026-2027) if it still has room
  insert into students (lrn_number, first_name, middle_name, last_name, date_of_birth, gender, enrollment_status, grade_level, address, contact_number,
                        guardian_name, guardian_relationship, guardian_phone, guardian_email, medical_notes)
  values ('TCS-26-10041', 'Sam', 'Cruz', 'De Guzman', '2010-03-18', 'Male', 'Enrolled', 10, '27 Roxas Ave., Davao City', '09175550141',
          'Roberto De Guzman', 'Father', '09175550142', 'deguzman.guardian@example.com', 'None reported')
  returning student_id into sid;
  update users set student_id = sid where username = 'sdeguzman';
  if (select count(*) from enrollments where section_id = 2 and status = 'active') >= (select capacity from sections where section_id = 2) then
    raise exception 'Malaya is full';
  end if;
  insert into enrollments (student_id, school_year, grade_level, section_id, status, enrolled_at) values (sid, '2026-2027', 10, 2, 'active', now());

  -- Khyle Villajos, Grade 11: reuse the old test student record (no enrollments, grades or attendance)
  update students set lrn_number = 'TCS-26-10042', first_name = 'Khyle', middle_name = 'Christian', last_name = 'Villajos', date_of_birth = '2009-05-14',
    gender = 'Male', enrollment_status = 'Enrolled', grade_level = 11, address = '13 Bonifacio St., Davao City', contact_number = '09173000137',
    guardian_name = 'Ricardo Villajos', guardian_relationship = 'Father', guardian_phone = '09284000211', guardian_email = 'villajos.guardian@example.com',
    medical_notes = 'None reported', updated_at = now()
  where student_id = 1;
  update users set student_id = 1 where username = 'kvillajos';

  insert into audit_logs (action, entity_type, details)
  values ('REPLACE_DEMO_ACCOUNTS', 'system', jsonb_build_object('removed', array['admin','registrar','faculty','student'], 'created', array['mjlatip','jtalaba','asomido','sdeguzman','kvillajos']));
end $$;
notify pgrst, 'reload schema';
-- END migration-v23-replace-demo-accounts.sql


-- ============================================================
-- BEGIN migration-v24-new-accounts-classes-grades.sql
-- Fills in the v23 accounts: a Grade 11 section (Mabait) with a full Mon-Fri timetable, a new subject (Creative Writing),
-- Angela Somido's classes, Khyle's enrollment, and Q1 grades + one week of attendance for Sam De Guzman and Khyle Villajos.
-- The timetable is placed by the same rule as v21: no section / teacher / shared-room clash, never inside lunch or break, ends by 16:00.
-- ============================================================
do $$
declare
  ls time; le time; bs time; be time; sec int; ang text := 'Angela Marie Somido'; cw int;
  blk record; cand time; n int := 0; slots time[] := array['07:30','08:15','09:00','10:00','12:00','13:00','13:45','14:30','15:15']::time[];
  dur interval := interval '45 minutes'; placed boolean;
begin
  select lunch_start, lunch_end, break_start, break_end into ls, le, bs, be from school_year_settings where school_year = '2026-2027';

  -- new subject
  insert into subjects (subject_code, title, subject_name, units, grade_level, description, is_active)
  values ('CW-101', 'Creative Writing', 'Creative Writing', 3, 11, 'Fiction, poetry and personal essay writing', true)
  on conflict do nothing;
  select subject_id into cw from subjects where subject_code = 'CW-101';

  -- Grade 11 section
  insert into sections (section_name, grade_level, academic_year, capacity, status, min_capacity, room, semester, faculty_assigned)
  select 'Mabait', 11, '2026-2027', 40, 'active', 10, 'Room 401', '1st Semester', ang
  where not exists (select 1 from sections where section_name = 'Mabait' and academic_year = '2026-2027');
  select section_id into sec from sections where section_name = 'Mabait' and academic_year = '2026-2027';

  -- timetable: one 45-minute block per subject, repeated Monday-Friday
  alter table subject_schedules disable trigger faculty_load_notify;
  for blk in
    select * from (values
      (2,  ang,                       'Room 401'),
      (cw, ang,                       'Room 401'),
      (11, 'Irene Sofia Navarro',     'Room 401'),
      (4,  'Eunice Grace Villanueva', 'Room 401'),
      (5,  'Carla Denise Garcia',     'Room 401'),
      (6,  'Francis Miguel Torres',   'Room 401'),
      (10, 'Julio Andres Castro',     'Computer Lab'),
      (7,  'Gloria Mae Dela Peña',    'Gym')
    ) as t(subject_id, fac, room)
  loop
    placed := false;
    for cand in select s from unnest(slots) s order by s loop
      continue when cand < le and cand + dur > ls;
      continue when bs is not null and cand < be and cand + dur > bs;
      continue when cand + dur > time '16:00';
      if not exists (
        select 1 from subject_schedules x
        where x.start_time < cand + dur and x.end_time > cand
          and (x.section_id = sec or lower(coalesce(x.faculty_name, '')) = lower(blk.fac) or (x.room = blk.room and blk.room in ('Gym', 'Computer Lab')))
      ) then
        insert into subject_schedules (subject_id, section_id, faculty_name, room, day_of_week, start_time, end_time)
        select blk.subject_id, sec, blk.fac, blk.room, d, cand, cand + dur from generate_series(1, 5) d;
        placed := true; n := n + 1;
        exit;
      end if;
    end loop;
    if not placed then raise exception 'No free slot for subject % in Mabait', blk.subject_id; end if;
  end loop;
  alter table subject_schedules enable trigger faculty_load_notify;

  -- eligibility list follows the timetable
  insert into faculty_subjects (profile_id, subject_id)
  select distinct sp.profile_id, ss.subject_id from subject_schedules ss
  join staff_profiles sp on lower(trim(ss.faculty_name)) = lower(trim(sp.first_name || ' ' || sp.last_name))
  join users u on u.user_id = sp.user_id and u.role_id = 3
  on conflict (profile_id, subject_id) do nothing;

  -- Khyle joins Mabait
  insert into enrollments (student_id, school_year, grade_level, section_id, status, enrolled_at)
  select u.student_id, '2026-2027', 11, sec, 'active', now() from users u where u.username = 'kvillajos'
  on conflict (student_id, school_year) do update set section_id = excluded.section_id, grade_level = 11, status = 'active';

  -- Q1 grades for the two new students, one row per subject in their section's timetable
  insert into academic_history (student_id, school_year, subject, grade, first_sem_q1, letter_grade, remarks)
  select e.student_id, '2026-2027', sub.subject_name, g.score, g.score,
         case when g.score >= 97 then 'A+' when g.score >= 92 then 'A' when g.score >= 87 then 'B+' when g.score >= 82 then 'B'
              when g.score >= 78 then 'C+' when g.score >= 75 then 'C' else 'F' end,
         'Sample: Q1 in progress'
  from enrollments e
  join users u on u.student_id = e.student_id and u.username in ('sdeguzman', 'kvillajos')
  join (select distinct section_id, subject_id from subject_schedules) t on t.section_id = e.section_id
  join subjects sub on sub.subject_id = t.subject_id
  cross join lateral (select round(78 + ((e.student_id * 37 + sub.subject_id * 53) % 190) / 10.0, 2) as score) g
  where e.status = 'active'
  on conflict (student_id, school_year, subject) do nothing;

  -- attendance: Mon 2026-09-21 .. Fri 2026-09-25, first-period subject of the section
  insert into attendance (student_id, attendance_date, status, section_id, subject_id, recorded_by)
  select e.student_id, d::date,
         case when h < 88 then 'Present' when h < 94 then 'Late' when h < 98 then 'Absent' else 'Excused' end,
         e.section_id,
         (select s.subject_id from subject_schedules s where s.section_id = e.section_id order by s.start_time, s.day_of_week limit 1),
         'sample-data'
  from enrollments e
  join users u on u.student_id = e.student_id and u.username in ('sdeguzman', 'kvillajos')
  cross join generate_series('2026-09-21'::date, '2026-09-25'::date, interval '1 day') as d
  cross join lateral (select (e.student_id * 31 + extract(day from d)::int * 17) % 100 as h) x
  where e.status = 'active'
  on conflict (student_id, attendance_date, section_id, subject_id) do nothing;

  insert into audit_logs (action, entity_type, details)
  values ('SEED_NEW_ACCOUNT_DATA', 'system', jsonb_build_object('version', 'v24', 'section', 'Mabait', 'blocks', n));
end $$;
notify pgrst, 'reload schema';
-- END migration-v24-new-accounts-classes-grades.sql


-- ============================================================
-- STATUS: NOT YET APPLIED to the live database (run it in the Supabase SQL editor)
-- BEGIN migration-v25-schedule-teacher-id.sql
-- Teachers were tied to classes by name text ("first last" compared with subject_schedules.faculty_name), so a renamed
-- teacher lost every class and two teachers with one name shared them. Schedules now carry faculty_profile_id.
--   * faculty_name stays as the display name and is kept in sync (typing/picking a name still works: it is resolved to an id).
--   * renaming a staff profile renames it on their schedule rows; staff full names are unique.
--   * faculty_section_ids(), faculty_teaches_subject(), the two faculty RLS policies and the teaching-load notices use the id.
-- Also: Angela Somido's profile name matches the convention used by the other faculty ("first + middle" in first_name).
-- ============================================================
update staff_profiles set first_name = 'Angela Marie', middle_name = null
where user_id = (select user_id from users where username = 'asomido');

alter table subject_schedules add column if not exists faculty_profile_id integer references staff_profiles(profile_id) on delete set null;
create index if not exists subject_schedules_faculty_profile_idx on subject_schedules(faculty_profile_id);
create unique index if not exists staff_profiles_full_name_key on staff_profiles (lower(trim(first_name || ' ' || last_name)));

update subject_schedules ss set faculty_profile_id = sp.profile_id
from staff_profiles sp
where ss.faculty_profile_id is null and lower(trim(ss.faculty_name)) = lower(trim(sp.first_name || ' ' || sp.last_name));

create or replace function sync_schedule_faculty() returns trigger language plpgsql set search_path to 'public' as $$
declare pid int; pname text;
begin
  if new.faculty_profile_id is not null and (tg_op = 'INSERT' or new.faculty_profile_id is distinct from old.faculty_profile_id) then
    select trim(first_name || ' ' || last_name) into pname from staff_profiles where profile_id = new.faculty_profile_id;
    new.faculty_name := pname;
  elsif tg_op = 'INSERT' or new.faculty_profile_id is null or new.faculty_name is distinct from old.faculty_name then
    if nullif(trim(coalesce(new.faculty_name, '')), '') is null then
      new.faculty_profile_id := null;
    else
      select profile_id into pid from staff_profiles where lower(trim(first_name || ' ' || last_name)) = lower(trim(new.faculty_name));
      new.faculty_profile_id := pid;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists a_sync_schedule_faculty on subject_schedules;
create trigger a_sync_schedule_faculty before insert or update on subject_schedules for each row execute function sync_schedule_faculty();

create or replace function propagate_staff_rename() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update subject_schedules set faculty_name = trim(new.first_name || ' ' || new.last_name) where faculty_profile_id = new.profile_id;
  return new;
end $$;
drop trigger if exists staff_rename_schedules on staff_profiles;
create trigger staff_rename_schedules after update of first_name, last_name on staff_profiles for each row
  when (old.first_name is distinct from new.first_name or old.last_name is distinct from new.last_name) execute function propagate_staff_rename();

create or replace function faculty_section_ids() returns setof integer language sql stable security definer set search_path to 'public' as $$
  select distinct ss.section_id
  from subject_schedules ss
  join staff_profiles sp on sp.profile_id = ss.faculty_profile_id
  where sp.user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active)
$$;

create or replace function faculty_teaches_subject(p_subject_id integer) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from subject_schedules ss
    join staff_profiles sp on sp.profile_id = ss.faculty_profile_id
    where ss.subject_id = p_subject_id
      and sp.user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active)
  )
$$;

drop policy if exists faculty_enrollment_roster on enrollments;
create policy faculty_enrollment_roster on enrollments for select to authenticated
  using ((select current_app_role()) = 3 and exists (
    select 1 from subject_schedules ss join staff_profiles sp on sp.profile_id = ss.faculty_profile_id
    where ss.section_id = enrollments.section_id
      and sp.user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email'))));
drop policy if exists faculty_students on students;
create policy faculty_students on students for select to authenticated
  using ((select current_app_role()) = 3 and exists (
    select 1 from enrollments e join subject_schedules ss on ss.section_id = e.section_id join staff_profiles sp on sp.profile_id = ss.faculty_profile_id
    where e.student_id = students.student_id
      and sp.user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email'))));

create or replace function notify_faculty_load_change() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare subj text; sec text; note text;
begin
  select subject_name into subj from subjects where subject_id = coalesce(new.subject_id, old.subject_id);
  select section_name into sec from sections where section_id = coalesce(new.section_id, old.section_id);
  if old.faculty_profile_id is not null and (tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.faculty_profile_id is distinct from new.faculty_profile_id)) then
    insert into notifications(recipient_email, recipient_user_id, title, message, entity_type, entity_id)
    select u.email, u.user_id, 'Teaching load updated', format('You are no longer assigned to %s (%s).', subj, sec), 'schedule', old.schedule_id
    from staff_profiles sp join users u on u.user_id = sp.user_id where sp.profile_id = old.faculty_profile_id;
  end if;
  if tg_op <> 'DELETE' and new.faculty_profile_id is not null
     and (tg_op = 'INSERT' or (old.faculty_profile_id, old.day_of_week, old.start_time, old.end_time, old.room, old.section_id, old.subject_id)
          is distinct from (new.faculty_profile_id, new.day_of_week, new.start_time, new.end_time, new.room, new.section_id, new.subject_id)) then
    note := case when tg_op = 'INSERT' or old.faculty_profile_id is distinct from new.faculty_profile_id
      then format('You were assigned to %s (%s).', subj, sec)
      else format('Your schedule for %s (%s) was changed.', subj, sec) end;
    insert into notifications(recipient_email, recipient_user_id, title, message, entity_type, entity_id)
    select u.email, u.user_id, 'Teaching load updated', note, 'schedule', new.schedule_id
    from staff_profiles sp join users u on u.user_id = sp.user_id where sp.profile_id = new.faculty_profile_id;
  end if;
  return coalesce(new, old);
end $$;
notify pgrst, 'reload schema';
-- END migration-v25-schedule-teacher-id.sql


-- ============================================================
-- STATUS: NOT YET APPLIED (run after v25)
-- BEGIN migration-v26-student-edit-request-status.sql
-- (1) request_student_profile now records the values the student saw ("before"), so the admin can be warned when the record
--     changed after the request was made. (2) my_pending_profile_request() lets a student see whether an edit is waiting.
-- ============================================================
create or replace function request_student_profile(p_changes jsonb, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  a record; sid int; s students%rowtype; k text; cur text; nv text; changed jsonb := '{}'::jsonb; before jsonb := '{}'::jsonb; parts text[] := '{}'; rid int; lim int;
  labels jsonb := '{"first_name":"First name","middle_name":"Middle name","last_name":"Last name","date_of_birth":"Date of birth","address":"Address","contact_number":"Contact number","guardian_name":"Guardian","guardian_relationship":"Relationship","guardian_phone":"Guardian phone","guardian_email":"Guardian email","medical_notes":"Medical notes"}';
begin
  select * into a from approval_actor(4);
  select student_id into sid from users where user_id = a.uid;
  select * into s from students where student_id = sid;
  if not found then raise exception 'No student record is linked to this account'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not labels ? k then raise exception 'You cannot request a change to %', k; end if;
    nv := nullif(trim(p_changes->>k), '');
    lim := case when k = 'medical_notes' then 1000 else 200 end;
    if length(coalesce(nv, '')) > lim then raise exception '% is too long', labels->>k; end if;
    if k in ('first_name','last_name') and nv is null then raise exception '% cannot be empty', labels->>k; end if;
    if k = 'date_of_birth' then
      if nv is null then raise exception 'Date of birth cannot be empty'; end if;
      if nv::date > current_date then raise exception 'Date of birth cannot be in the future'; end if;
    end if;
    if k = 'guardian_email' and nv is not null and nv !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Guardian email is not valid'; end if;
    execute format('select %I::text from students where student_id = $1', k) into cur using sid;
    if nv is distinct from nullif(cur, '') then
      changed := changed || jsonb_build_object(k, nv);
      before := before || jsonb_build_object(k, nullif(cur, ''));
      parts := parts || format('%s: %s -> %s', labels->>k, coalesce(cur, '(blank)'), coalesce(nv, '(blank)'));
    end if;
  end loop;
  if changed = '{}'::jsonb then raise exception 'Nothing was changed'; end if;
  if exists (select 1 from approval_requests where status = 'pending' and request_type = 'student_profile' and (payload->>'student_id')::int = sid) then
    raise exception 'You already have a profile edit waiting for approval';
  end if;
  insert into approval_requests(request_type, payload, summary, reason, requested_by, requester_name)
  values ('student_profile', jsonb_build_object('student_id', sid, 'changes', changed, 'before', before),
    format('%s %s - %s', s.first_name, s.last_name, array_to_string(parts, '; ')),
    coalesce(nullif(trim(p_reason), ''), 'Student requested a profile update'), a.uid, a.uname)
  returning id into rid;
  return jsonb_build_object('request_id', rid);
end $$;

create or replace function my_pending_profile_request() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare a record; r approval_requests%rowtype;
begin
  select * into a from approval_actor(4);
  select * into r from approval_requests where requested_by = a.uid and request_type = 'student_profile' and status = 'pending' order by created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id', r.id, 'created_at', r.created_at, 'summary', r.summary);
end $$;
revoke all on function my_pending_profile_request() from public, anon;
grant execute on function my_pending_profile_request() to authenticated;
notify pgrst, 'reload schema';
-- END migration-v26-student-edit-request-status.sql
