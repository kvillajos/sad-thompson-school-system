-- TCSMS Registrar extension for the existing Sprint 1 schema.
-- Existing tables: users(user_id), students(student_id), sections(section_id).
-- Run this in the Supabase SQL Editor.

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

create index if not exists idx_academic_student_year on academic_history(student_id, school_year);
create index if not exists idx_enrollment_student_year on enrollments(student_id, school_year);
create index if not exists idx_admission_status on admission_applications(status);

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
returns jsonb language plpgsql security definer as $$
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
  insert into notifications(recipient_email,title,message,entity_type,entity_id) values(a.guardian_email,'Application Status Updated','Your TCSMS admission application is now '||replace(p_status::text,'_',' ')||'.','admission_application',a.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('UPDATE_STATUS','admission_application',a.id,jsonb_build_object('status',p_status,'remarks',p_remarks));
  return jsonb_build_object('id',a.id,'status',p_status);
end $$;

create or replace function auto_place_student(p_student_id integer,p_grade_level integer)
returns jsonb language plpgsql security definer as $$
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
returns jsonb language plpgsql security definer as $$
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

create or replace function batch_promote_students(p_grade_level integer,p_school_year text)
returns jsonb language plpgsql security definer as $$
declare r record; processed int:=0; promoted int:=0; avg_grade numeric; target integer;
begin
  for r in select student_id,grade_level from students where grade_level=p_grade_level loop
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
returns jsonb language plpgsql security definer as $$
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

do $$ begin create policy registrar_applications on admission_applications for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy registrar_documents on application_documents for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy registrar_notifications on notifications for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy registrar_enrollments on enrollments for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy registrar_academic on academic_history for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy registrar_promotion on promotion_logs for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy registrar_shifts on shift_requests for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy registrar_feedback_policy on registrar_feedback for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy registrar_audit on audit_logs for all to authenticated using (true) with check (true); exception when duplicate_object then null; end $$;
