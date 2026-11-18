-- v72-student-email.sql
-- An admission can carry the student's own email (for example their Gmail). Approval uses it as the
-- student's login email; left blank, the login stays username@tcs.edu.ph as before. Login is by username,
-- so a custom email changes nothing about signing in. Emails are stored lowercase (login looks them up
-- lowercase). Safe to run twice.
begin;

alter table public.admission_applications add column if not exists student_email text;
alter table public.admission_applications drop constraint if exists admission_applications_student_email_check;
alter table public.admission_applications add constraint admission_applications_student_email_check
  check (student_email is null or student_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- Registrar corrections: also save student_email (lowercased) and audit it.
CREATE OR REPLACE FUNCTION public.save_application_edit(p_application_id integer, p_token uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a admission_applications%rowtype; merged jsonb; next_status text; editor text; after jsonb; changes text[] := '{}'; f text;
  tracked text[] := array['first_name','middle_name','last_name','birth_date','sex','address','contact_number','guardian_name',
    'guardian_relationship','guardian_phone','guardian_email','student_email','prior_school','prior_grade','grade_level','special_program','remarks'];
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
    student_email = lower(nullif(trim(merged->>'student_email'), '')),
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

-- Approval: the new student login uses the application's student_email when given, else username@tcs.edu.ph.
-- An email another account already uses is refused before anything is saved (users.email is not unique,
-- and provision-account would otherwise take over that account's login).
create or replace function public.review_admission_application(p_application_id integer, p_status admission_status, p_remarks text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a admission_applications%rowtype; new_no text; target_student_id integer; new_username text; new_password text; new_user_id integer;
  new_email text;
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
  new_email := lower(nullif(trim(a.student_email), ''));
  if p_status='approved' and new_email is not null and exists (select 1 from users where lower(email) = new_email) then
    raise exception 'The student email % is already used by another account. Ask the registrar to change it on the application.', new_email;
  end if;
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
      values (new_username, coalesce(new_email, new_username || '@tcs.edu.ph'), extensions.crypt(new_password, extensions.gen_salt('bf')), 4, true, target_student_id, new_password)
      returning user_id into new_user_id;
    end if;
  end if;
  insert into notifications(recipient_email,title,message,entity_type,entity_id) values(a.guardian_email,'Application Status Updated','Your TCSMS admission application is now '||replace(p_status::text,'_',' ')||'.','admission_application',a.id);
  insert into audit_logs(action,entity_type,entity_id,details) values('UPDATE_STATUS','admission_application',a.id,jsonb_build_object('status',p_status,'remarks',p_remarks));
  return jsonb_build_object('id',a.id,'status',p_status,'new_user_id',new_user_id);
end $function$;

notify pgrst, 'reload schema';
commit;
