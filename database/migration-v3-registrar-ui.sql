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
returns jsonb language plpgsql security definer as $$
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
