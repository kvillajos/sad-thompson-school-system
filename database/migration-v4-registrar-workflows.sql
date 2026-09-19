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
returns jsonb language plpgsql security definer as $$
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
returns jsonb language plpgsql security definer as $$
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
returns jsonb language plpgsql security definer as $$
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
returns jsonb language plpgsql security definer as $$
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
returns jsonb language plpgsql security definer as $$
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