-- v53-hardcoded-fixes.sql
-- 1. The school year was built from the calendar year (this year - next year), which is wrong from January to May.
--    current_school_year() reads school_years (the year whose dates include today, Manila time) and falls back to
--    the June-to-May rule. Placement uses the target section's own year; approvals and other fallbacks use it.
-- 3. Applications accepted any grade 1-12; they now must be a grade the school offers (grade_levels.offered).
-- 4. The passing mark (75) lives in one function, passing_grade(), used by batch promotion.
-- Safe to run twice.
begin;

create or replace function public.current_school_year()
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(
    (select label from school_years
      where (now() at time zone 'Asia/Manila')::date between start_date and end_date
      order by start_date desc limit 1),
    case when extract(month from (now() at time zone 'Asia/Manila')) >= 6
      then extract(year from (now() at time zone 'Asia/Manila'))::int || '-' || (extract(year from (now() at time zone 'Asia/Manila'))::int + 1)
      else (extract(year from (now() at time zone 'Asia/Manila'))::int - 1) || '-' || extract(year from (now() at time zone 'Asia/Manila'))::int
    end)
$function$;
grant execute on function public.current_school_year() to authenticated;

-- DepEd passing mark; the grading scale's passing band starts here (shared/lib/grades.js PASSING_GRADE).
create or replace function public.passing_grade()
 returns numeric
 language sql
 immutable
as $function$ select 75::numeric $function$;
grant execute on function public.passing_grade() to authenticated;

CREATE OR REPLACE FUNCTION public.auto_place_student(p_student_id integer, p_grade_level integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare target sections%rowtype; old_section integer;
begin
  if coalesce((select current_app_role()), 0) not in (1, 2) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from students where student_id=p_student_id) then raise exception 'Student not found'; end if;
  select section_id into old_section from enrollments where student_id=p_student_id and status='active' order by created_at desc limit 1;
  select s.* into target from sections s where s.grade_level=p_grade_level and (select count(*) from enrollments e where e.section_id=s.section_id and e.status='active')<s.capacity order by (select count(*) from enrollments e where e.section_id=s.section_id and e.status='active'),s.section_name limit 1 for update;
  if not found then raise exception 'No eligible section has available capacity'; end if;
  if old_section=target.section_id then return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name); end if;
  insert into enrollments(student_id,school_year,grade_level,section_id,status,enrolled_at) values(p_student_id,coalesce(target.academic_year, current_school_year()),p_grade_level,target.section_id,'active',now()) on conflict(student_id,school_year) do update set section_id=excluded.section_id,grade_level=excluded.grade_level,status='active';
  insert into audit_logs(action,entity_type,entity_id,details) values('AUTO_PLACE','student',p_student_id,jsonb_build_object('section_id',target.section_id));
  return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name);
end $function$;

CREATE OR REPLACE FUNCTION public.manual_place_student(p_student_id integer, p_section_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare target sections%rowtype; student_grade integer;
begin
  if coalesce((select current_app_role()), 0) not in (1, 2) then raise exception 'Not authorized'; end if;
  select * into target from sections where section_id=p_section_id for update; if not found then raise exception 'Section not found'; end if;
  select grade_level into student_grade from students where student_id=p_student_id; if not found then raise exception 'Student not found'; end if;
  if target.grade_level<>student_grade then raise exception 'Grade level is not eligible for this section'; end if;
  if (select count(*) from enrollments where section_id=p_section_id and status='active')>=target.capacity then raise exception 'Target section is full'; end if;
  insert into enrollments(student_id,school_year,grade_level,section_id,status,enrolled_at) values(p_student_id,coalesce(target.academic_year, current_school_year()),student_grade,p_section_id,'active',now()) on conflict(student_id,school_year) do update set section_id=excluded.section_id,status='active';
  insert into audit_logs(action,entity_type,entity_id,details) values('MANUAL_PLACE','student',p_student_id,jsonb_build_object('section_id',p_section_id));
  return jsonb_build_object('section_id',target.section_id,'section_name',target.section_name);
end $function$;

CREATE OR REPLACE FUNCTION public.validate_section_assignment(p_student_id integer, p_section_id integer, p_override boolean DEFAULT false, p_justification text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare sg integer; target public.sections%rowtype; enrolled integer; active_year text;
begin
  select grade_level into sg from public.students where student_id=p_student_id;
  if not found then raise exception 'Student not found'; end if;
  if sg is null then raise exception 'Student grade level is not set'; end if;

  select * into target from public.sections where section_id=p_section_id for update;
  if not found then raise exception 'Section not found'; end if;
  if coalesce(target.status,'active')='archived' then raise exception 'Cannot assign a student to an archived section'; end if;
  if target.grade_level<>sg then raise exception 'Grade level % is not eligible for %',sg,target.section_name; end if;
  if coalesce(target.min_capacity,0)<0 or coalesce(target.min_capacity,0)>coalesce(target.capacity,0) then raise exception 'Section minimum capacity is invalid'; end if;

  select count(*) into enrolled from public.enrollments where section_id=p_section_id and status='active';
  if enrolled>=coalesce(target.capacity,0) and not p_override then raise exception 'Target section is full (%/%).',enrolled,target.capacity; end if;
  if p_override and enrolled>=coalesce(target.capacity,0) and nullif(trim(p_justification),'') is null then raise exception 'Admin override requires a justification'; end if;

  active_year:=coalesce(target.academic_year, current_school_year());
  return jsonb_build_object('valid',true,'student_id',p_student_id,'section_id',p_section_id,'section_name',target.section_name,'current_enrollment',enrolled,'capacity',target.capacity,'school_year',active_year,'override',p_override);
end $function$;

CREATE OR REPLACE FUNCTION public.save_application_edit(p_application_id integer, p_token uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a admission_applications%rowtype; merged jsonb; next_status text; editor text; after jsonb; changes text[] := '{}'; f text;
  tracked text[] := array['first_name','middle_name','last_name','birth_date','sex','address','contact_number','guardian_name',
    'guardian_relationship','guardian_phone','guardian_email','prior_school','prior_grade','grade_level','special_program','remarks'];
begin
  select * into a from admission_applications where id = p_application_id for update;
  if not found then raise exception 'Application not found'; end if;
  editor := registrar_workflow_actor(2);
  if p_token is null or a.editing_token is distinct from p_token
    or a.editing_since is null or a.editing_since <= now() - interval '10 minutes'
    or a.editing_by is distinct from editor
    or a.status not in ('draft','submitted','under_review') then
    raise exception 'This edit session is no longer active. Close the form and open the application again.';
  end if;
  merged := to_jsonb(a) || coalesce(p_payload, '{}'::jsonb);
  next_status := a.status::text;
  if p_payload ? 'status' and p_payload->>'status' is distinct from next_status then
    raise exception 'Corrections cannot change the approval decision';
  end if;
  if not exists (select 1 from grade_levels where grade_level = (merged->>'grade_level')::integer and offered) then raise exception 'Choose a grade level the school offers'; end if;
  if next_status <> 'draft' then perform validate_admission(merged); end if;
  update admission_applications set
    first_name = merged->>'first_name',
    middle_name = nullif(merged->>'middle_name', ''),
    last_name = merged->>'last_name',
    birth_date = nullif(merged->>'birth_date', '')::date,
    sex = nullif(merged->>'sex', ''),
    address = nullif(merged->>'address', ''),
    contact_number = nullif(merged->>'contact_number', ''),
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
  where id = p_application_id
  returning to_jsonb(admission_applications.*) into after;
  foreach f in array tracked loop
    if (to_jsonb(a)->>f) is distinct from (after->>f) then
      changes := changes || format('%s: %s -> %s', f, coalesce('"' || (to_jsonb(a)->>f) || '"', '(blank)'), coalesce('"' || (after->>f) || '"', '(blank)'));
    end if;
  end loop;
  insert into audit_logs(actor, action, entity_type, entity_id, details)
  values (auth.jwt() ->> 'email', 'REGISTRAR_EDIT', 'admission_application', p_application_id,
    jsonb_build_object('editor', editor, 'status', next_status,
      'changes', case when cardinality(changes) = 0 then 'no field changed' else array_to_string(changes, '; ') end));
  return jsonb_build_object('id', p_application_id, 'status', next_status, 'edit_released', true, 'changed', cardinality(changes));
end $function$;

CREATE OR REPLACE FUNCTION public.batch_promote_students(p_grade_level integer, p_school_year text, p_excluded_student_ids integer[] DEFAULT '{}'::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  graded_year text := promotion_graded_year(p_school_year);
  processed int := 0; promoted int := 0; graduated int := 0; retained int := 0; incomplete int := 0; skipped int := 0;
  avg_grade numeric; target integer;
begin
  for r in select student_id, grade_level from students
           where grade_level = p_grade_level
             and coalesce(enrollment_status, 'Enrolled') not in ('Graduated', 'Transferred', 'Withdrawn')
             and not (student_id = any(coalesce(p_excluded_student_ids, '{}')))
  loop
    if exists (select 1 from promotion_logs where student_id = r.student_id and school_year = p_school_year and result = 'promoted') then
      skipped := skipped + 1;
      continue;
    end if;
    processed := processed + 1;
    select avg(grade) into avg_grade from academic_history where student_id = r.student_id and school_year = graded_year;
    if exists (select 1 from academic_history where student_id = r.student_id and school_year = graded_year and grade < passing_grade()) then
      insert into promotion_logs(student_id, from_grade, to_grade, school_year, result, reason)
      values (r.student_id, r.grade_level, r.grade_level, p_school_year, 'retained', 'At least one subject below passing criteria');
      retained := retained + 1;
    elsif avg_grade is null then
      insert into promotion_logs(student_id, from_grade, to_grade, school_year, result, reason)
      values (r.student_id, r.grade_level, r.grade_level, p_school_year, 'incomplete', 'No completed grades');
      incomplete := incomplete + 1;
    elsif r.grade_level >= 12 then
      update students set enrollment_status = 'Graduated' where student_id = r.student_id;
      update enrollments set status = 'completed' where student_id = r.student_id and status = 'active';
      insert into promotion_logs(student_id, from_grade, to_grade, school_year, result, reason)
      values (r.student_id, r.grade_level, null, p_school_year, 'promoted', 'Graduated');
      graduated := graduated + 1;
    else
      target := r.grade_level + 1;
      update students set grade_level = target where student_id = r.student_id;
      update enrollments set status = 'completed' where student_id = r.student_id and status = 'active';
      insert into promotion_logs(student_id, from_grade, to_grade, school_year, result, reason)
      values (r.student_id, r.grade_level, target, p_school_year, 'promoted', 'Passing criteria met');
      promoted := promoted + 1;
    end if;
  end loop;
  return jsonb_build_object('processed', processed, 'promoted', promoted, 'graduated', graduated,
    'retained', retained, 'incomplete', incomplete, 'skipped', skipped);
end $function$;

create or replace function public.review_admission_application(p_application_id integer, p_status admission_status, p_remarks text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    insert into students(lrn_number,first_name,last_name,date_of_birth,gender,enrollment_status,
      address,contact_number,guardian_name,guardian_relationship,guardian_phone,guardian_email)
    values(new_no,a.first_name,a.last_name,a.birth_date,a.sex,'Enrolled',
      a.address,a.contact_number,a.guardian_name,a.guardian_relationship,a.guardian_phone,a.guardian_email);
  end if;
  if p_status='approved' then
    select student_id into target_student_id from students
      where lower(first_name)=lower(a.first_name) and lower(last_name)=lower(a.last_name) and date_of_birth=a.birth_date
      limit 1;
    insert into enrollments(student_id, school_year, grade_level, status, enrolled_at)
    select target_student_id, current_school_year(),
      a.grade_level::integer, 'active', now()
    on conflict(student_id, school_year) do update set grade_level=excluded.grade_level, status='active', enrolled_at=excluded.enrolled_at;

    -- coalesce: an already-enrolled sibling record's saved details are not blanked out by an application that left a field empty.
    update students set grade_level=a.grade_level::integer, enrollment_status='Enrolled',
      strand=case when a.grade_level::integer >= 11 then coalesce(a.strand, strand) end,
      address=coalesce(a.address, address), contact_number=coalesce(a.contact_number, contact_number),
      guardian_name=coalesce(a.guardian_name, guardian_name), guardian_relationship=coalesce(a.guardian_relationship, guardian_relationship),
      guardian_phone=coalesce(a.guardian_phone, guardian_phone), guardian_email=coalesce(a.guardian_email, guardian_email)
      where student_id=target_student_id;
    if a.profile_picture_url is not null then
      update students set profile_picture_url = a.profile_picture_url where student_id = target_student_id;
    end if;

    if target_student_id is not null and not exists (select 1 from users where student_id = target_student_id) then
      new_username := generate_username(a.first_name, a.last_name);
      new_password := new_username || '123';
      insert into users(username, email, password_hash, role_id, is_active, student_id, initial_password)
      values (new_username, new_username || '@tcs.edu.ph', extensions.crypt(new_password, extensions.gen_salt('bf')), 4, true, target_student_id, new_password)
      returning user_id into new_user_id;
    end if;
  end if;
  insert into notifications(recipient_email,title,message,entity_type,entity_id) values(a.guardian_email,'Application Status Updated','Your TCSMS admission application is now '||replace(p_status::text,'_',' ')||'.','admission_application',a.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('UPDATE_STATUS','admission_application',a.id,jsonb_build_object('status',p_status,'remarks',p_remarks));
  return jsonb_build_object('id',a.id,'status',p_status,'new_user_id',new_user_id);
end $function$;

notify pgrst, 'reload schema';
commit;
