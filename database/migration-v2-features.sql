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
returns jsonb language plpgsql security definer as $$
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
returns void language plpgsql security definer as $$
declare target_student_id integer;
begin
  select student_id into target_student_id from users where lower(email) = lower(auth.jwt() ->> 'email');
  if target_student_id is null then raise exception 'No linked student record'; end if;
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
create policy profile_pictures_upload on storage.objects for insert to authenticated with check (bucket_id = 'profile-pictures');
create policy profile_pictures_update on storage.objects for update to authenticated using (bucket_id = 'profile-pictures') with check (bucket_id = 'profile-pictures');
