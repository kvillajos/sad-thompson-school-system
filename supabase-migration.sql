-- TCSMS Registry & Student Records extension
-- Run this in Supabase SQL Editor.
-- If your Sprint 1 students/enrollments/sections tables already exist with different
-- columns, map the three canonical tables below to your existing schema before running.

create extension if not exists pgcrypto;

do $$ begin
  create type admission_status as enum ('draft','submitted','under_review','approved','rejected','enrolled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type promotion_result as enum ('promoted','retained','incomplete','held');
exception when duplicate_object then null; end $$;

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  student_no text unique not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  birth_date date,
  sex text,
  address text,
  grade_level text not null,
  special_program text,
  created_at timestamptz not null default now()
);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade_level text not null,
  capacity integer not null check (capacity > 0),
  special_program text,
  age_min integer,
  age_max integer,
  enrolled_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(name, grade_level)
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  school_year text not null,
  grade_level text not null,
  section_id uuid references sections(id),
  status text not null default 'active',
  enrolled_at timestamptz,
  created_at timestamptz not null default now(),
  unique(student_id, school_year)
);

create table if not exists admission_applications (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text,
  last_name text not null,
  birth_date date,
  sex text,
  address text,
  guardian_name text,
  guardian_relationship text,
  guardian_phone text,
  guardian_email text,
  prior_school text,
  prior_grade text,
  grade_level text,
  special_program text,
  status admission_status not null default 'draft',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references admission_applications(id) on delete cascade,
  document_type text not null,
  file_path text not null,
  original_name text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text,
  recipient_user_id uuid,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists academic_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  school_year text not null,
  subject text not null,
  grade numeric(5,2) not null check (grade >= 0 and grade <= 100),
  remarks text,
  prior_school text,
  created_at timestamptz not null default now(),
  unique(student_id, school_year, subject)
);

create table if not exists promotion_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  from_grade text not null,
  to_grade text,
  school_year text not null,
  result promotion_result not null,
  reason text,
  processed_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists shift_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  from_section_id uuid references sections(id),
  target_section_id uuid not null references sections(id),
  reason text not null,
  status text not null default 'completed',
  requested_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists registrar_feedback (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  priority text not null,
  pain_point text not null,
  suggested_fix text,
  submitted_by text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_academic_student_year on academic_history(student_id, school_year);
create index if not exists idx_academic_subject on academic_history(subject);
create index if not exists idx_enrollment_student_year on enrollments(student_id, school_year);
create index if not exists idx_admission_status on admission_applications(status);
create index if not exists idx_shift_student on shift_requests(student_id);
create index if not exists idx_promotion_student_year on promotion_logs(student_id, school_year);

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

create or replace function review_admission_application(p_application_id uuid,p_status admission_status,p_remarks text default null)
returns jsonb language plpgsql security definer as $$
declare a admission_applications%rowtype; s students%rowtype; new_no text;
begin
  select * into a from admission_applications where id=p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if p_status in ('under_review','approved') then perform validate_admission(to_jsonb(a)); end if;
  update admission_applications set status=p_status, remarks=p_remarks, updated_at=now() where id=p_application_id;
  if p_status='approved' then
    if not exists(select 1 from students where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and birth_date=a.birth_date) then
      new_no := 'TCS-' || to_char(now(),'YY') || '-' || lpad(nextval('student_number_seq')::text,5,'0');
      insert into students(student_no,first_name,middle_name,last_name,birth_date,sex,address,grade_level,special_program)
      values(new_no,a.first_name,a.middle_name,a.last_name,a.birth_date,a.sex,a.address,a.grade_level,a.special_program);
    end if;
  end if;
  insert into notifications(recipient_email,title,message,entity_type,entity_id) values(a.guardian_email,'Application Status Updated','Your TCSMS admission application is now '||replace(p_status::text,'_',' ')||'.','admission_application',a.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('UPDATE_STATUS','admission_application',a.id,jsonb_build_object('status',p_status,'remarks',p_remarks));
  return jsonb_build_object('id',a.id,'status',p_status);
end $$;

create or replace function auto_place_student(p_student_id uuid,p_grade_level text)
returns jsonb language plpgsql security definer as $$
declare st students%rowtype; sec sections%rowtype; age integer; old_section uuid;
begin
  select * into st from students where id=p_student_id; if not found then raise exception 'Student not found'; end if;
  if st.grade_level <> p_grade_level then update students set grade_level=p_grade_level where id=p_student_id; end if;
  age := case when st.birth_date is null then null else extract(year from age(current_date,st.birth_date))::int end;
  select * into sec from sections x where x.grade_level=p_grade_level and x.enrolled_count<x.capacity and (x.special_program is null or x.special_program=st.special_program) and (x.age_min is null or age is null or age>=x.age_min) and (x.age_max is null or age is null or age<=x.age_max) order by x.enrolled_count,x.name limit 1 for update;
  if not found then raise exception 'No eligible section has available capacity; student should be waitlisted'; end if;
  select section_id into old_section from enrollments where student_id=p_student_id and status='active' order by created_at desc limit 1;
  if old_section is not null and old_section=sec.id then return jsonb_build_object('section_id',sec.id,'section_name',sec.name); end if;
  if old_section is not null then update sections set enrolled_count=greatest(enrolled_count-1,0) where id=old_section; end if;
  insert into enrollments(student_id,school_year,grade_level,section_id,status,enrolled_at) values(p_student_id,extract(year from current_date)::text||'-'||(extract(year from current_date)+1)::text,p_grade_level,sec.id,'active',now()) on conflict(student_id,school_year) do update set section_id=excluded.section_id,grade_level=excluded.grade_level,status='active';
  update sections set enrolled_count=enrolled_count+1 where id=sec.id;
  insert into audit_logs(action,entity_type,entity_id,details) values('AUTO_PLACE','student',p_student_id,jsonb_build_object('section_id',sec.id,'section_name',sec.name));
  return jsonb_build_object('section_id',sec.id,'section_name',sec.name);
end $$;

create or replace function manual_place_student(p_student_id uuid,p_section_id uuid)
returns jsonb language plpgsql security definer as $$
declare sec sections%rowtype; st students%rowtype; old_section uuid;
begin
  select * into sec from sections where id=p_section_id for update; if not found then raise exception 'Section not found'; end if;
  select * into st from students where id=p_student_id; if not found then raise exception 'Student not found'; end if;
  if sec.grade_level<>st.grade_level then raise exception 'Grade level is not eligible for this section'; end if;
  if sec.enrolled_count>=sec.capacity then raise exception 'Target section is full'; end if;
  select section_id into old_section from enrollments where student_id=p_student_id and status='active' order by created_at desc limit 1;
  if old_section is not null and old_section<>sec.id then update sections set enrolled_count=greatest(enrolled_count-1,0) where id=old_section; end if;
  insert into enrollments(student_id,school_year,grade_level,section_id,status,enrolled_at) values(p_student_id,extract(year from current_date)::text||'-'||(extract(year from current_date)+1)::text,st.grade_level,sec.id,'active',now()) on conflict(student_id,school_year) do update set section_id=excluded.section_id,status='active';
  update sections set enrolled_count=enrolled_count+1 where id=sec.id and (old_section is null or old_section<>sec.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('MANUAL_PLACE','student',p_student_id,jsonb_build_object('section_id',sec.id));
  return jsonb_build_object('section_id',sec.id,'section_name',sec.name);
end $$;

create or replace function batch_promote_students(p_grade_level text,p_school_year text)
returns jsonb language plpgsql security definer as $$
declare r record; processed int:=0; promoted int:=0; avg_grade numeric; target text;
begin
  for r in select * from students where grade_level=p_grade_level loop
    processed:=processed+1;
    select avg(grade) into avg_grade from academic_history where student_id=r.id and school_year=p_school_year;
    if exists(select 1 from academic_history where student_id=r.id and school_year=p_school_year and grade<75) then
      insert into promotion_logs(student_id,from_grade,to_grade,school_year,result,reason) values(r.id,r.grade_level,r.grade_level,p_school_year,'retained','At least one subject below passing criteria');
    elsif avg_grade is null then
      insert into promotion_logs(student_id,from_grade,to_grade,school_year,result,reason) values(r.id,r.grade_level,r.grade_level,p_school_year,'incomplete','No completed grades');
    elsif avg_grade>=75 then
      target:=case when r.grade_level='Grade 11' then 'Grade 12' when r.grade_level='Grade 12' then r.grade_level else 'Grade '||(split_part(r.grade_level,' ',2)::int+1) end;
      update students set grade_level=target where id=r.id; promoted:=promoted+1;
      insert into promotion_logs(student_id,from_grade,to_grade,school_year,result,reason) values(r.id,r.grade_level,target,p_school_year,'promoted','Passing criteria met');
    end if;
  end loop;
  insert into audit_logs(action,entity_type,details) values('BATCH_PROMOTION','promotion',jsonb_build_object('grade_level',p_grade_level,'school_year',p_school_year,'processed',processed,'promoted',promoted));
  return jsonb_build_object('processed',processed,'promoted',promoted);
end $$;

create or replace function shift_student(p_student_id uuid,p_target_section_id uuid,p_reason text)
returns jsonb language plpgsql security definer as $$
declare st students%rowtype; target sections%rowtype; old_section uuid; old_name text; new_name text;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'Shift reason is required'; end if;
  select * into st from students where id=p_student_id for update; if not found then raise exception 'Student not found'; end if;
  select * into target from sections where id=p_target_section_id for update; if not found then raise exception 'Target section not found'; end if;
  if target.grade_level<>st.grade_level then raise exception 'Target section is not eligible for the student grade level'; end if;
  if target.enrolled_count>=target.capacity then raise exception 'Target section is full'; end if;
  select section_id into old_section from enrollments where student_id=p_student_id and status='active' order by created_at desc limit 1 for update;
  if old_section is not null then select name into old_name from sections where id=old_section; end if;
  if old_section=target.id then raise exception 'Student is already in the target section'; end if;
  new_name:=target.name;
  if old_section is not null then update sections set enrolled_count=greatest(enrolled_count-1,0) where id=old_section; end if;
  update enrollments set section_id=target.id where student_id=p_student_id and status='active';
  update sections set enrolled_count=enrolled_count+1 where id=target.id;
  insert into shift_requests(student_id,from_section_id,target_section_id,reason,status) values(p_student_id,old_section,target.id,p_reason,'completed');
  insert into notifications(title,message,entity_type,entity_id) values('Student Section Shift','Student '||st.student_no||' shifted from '||coalesce(old_name,'Unassigned')||' to '||new_name||'.','student',st.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('STUDENT_SHIFT','student',st.id,jsonb_build_object('from_section',old_section,'to_section',target.id,'reason',p_reason));
  return jsonb_build_object('student_id',st.id,'from_section',old_name,'to_section',new_name);
end $$;

-- Storage bucket for birth certificates/report cards. Keep this bucket private.
insert into storage.buckets(id,name,public) values('admission-documents','admission-documents',false) on conflict(id) do nothing;

-- Basic authenticated access policies. Tighten these further to your role/department model.
alter table admission_applications enable row level security;
alter table application_documents enable row level security;
alter table students enable row level security;
alter table sections enable row level security;
alter table enrollments enable row level security;
alter table academic_history enable row level security;
alter table registrar_feedback enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;

do $$ begin
  create policy registrar_applications on admission_applications for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy registrar_documents on application_documents for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy registrar_students on students for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy registrar_sections on sections for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy registrar_enrollments on enrollments for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy registrar_academic on academic_history for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy registrar_feedback_policy on registrar_feedback for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy registrar_notifications on notifications for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy registrar_audit on audit_logs for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
