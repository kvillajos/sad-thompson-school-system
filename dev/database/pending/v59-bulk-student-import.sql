-- v59-bulk-student-import.sql  (branch SchoolYearLifecycle)
-- bulk_import_students(): the registrar (or admin) imports a spreadsheet of new students for one school year.
-- Each row becomes, exactly as an approved admission does (review_admission_application):
--   a students row (Enrolled), an enrollments row for the year (no section yet: auto-assign places them),
--   and a users row with a pending initial_password (username + '123'); the admin turns those into real logins
--   with "Provision pending logins" on Manage Accounts.
-- All or nothing: one bad row stops the whole import with its row number. Enrollment for the year must be open
-- (v57). Rows that match an existing student (same last name, first name and birth date) are refused: those
-- students are re-enrolled instead. Safe to run twice.
begin;

create or replace function public.bulk_import_students(p_school_year text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  r jsonb;
  n integer := 0;
  grade integer;
  strand_code text;
  birth date;
  student_no text;
  new_student integer;
  new_username text;
  created jsonb := '[]'::jsonb;
begin
  select username into actor from users
    where lower(email) = lower(auth.jwt() ->> 'email') and is_active and role_id in (1, 2) limit 1;
  if actor is null then raise exception 'Not authorized to import students'; end if;
  if not exists (select 1 from school_years where label = p_school_year) then
    raise exception 'School year % does not exist', p_school_year;
  end if;
  if not enrollment_is_open(p_school_year) then perform enrollment_window_error(p_school_year); end if;
  if coalesce(jsonb_typeof(p_rows), '') <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The file has no student rows';
  end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'Import at most 500 students at a time'; end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    if nullif(trim(r ->> 'first_name'), '') is null or nullif(trim(r ->> 'last_name'), '') is null then
      raise exception 'Row %: first and last name are required', n + 1;
    end if;
    begin
      birth := (r ->> 'birth_date')::date;
    exception when others then
      raise exception 'Row %: birth date is not a valid date', n + 1;
    end;
    if birth is null then raise exception 'Row %: birth date is required', n + 1; end if;
    if coalesce(r ->> 'sex', '') not in ('Male', 'Female') then raise exception 'Row %: sex must be Male or Female', n + 1; end if;
    grade := nullif(r ->> 'grade_level', '')::integer;
    if grade is null or not exists (select 1 from grade_levels where grade_level = grade and offered) then
      raise exception 'Row %: grade level % is not offered', n + 1, coalesce(grade::text, '(blank)');
    end if;
    strand_code := nullif(trim(r ->> 'strand'), '');
    if grade >= 11 and (strand_code is null or not exists (select 1 from strands where code = strand_code)) then
      raise exception 'Row %: choose a valid strand for Grade %', n + 1, grade;
    end if;
    if grade < 11 then strand_code := null; end if;
    if exists (select 1 from students where lower(first_name) = lower(trim(r ->> 'first_name'))
               and lower(last_name) = lower(trim(r ->> 'last_name')) and date_of_birth = birth) then
      raise exception 'Row %: % % (born %) is already a student; re-enroll them instead', n + 1,
        trim(r ->> 'first_name'), trim(r ->> 'last_name'), birth;
    end if;
    student_no := nullif(trim(r ->> 'student_no'), '');
    if student_no is not null and exists (select 1 from students where lower(lrn_number) = lower(student_no)) then
      raise exception 'Row %: student no. % is already used', n + 1, student_no;
    end if;
    if student_no is null then
      student_no := 'TCS-' || to_char(now(), 'YY') || '-' || lpad(nextval('student_number_seq')::text, 5, '0');
    end if;

    insert into students (lrn_number, first_name, middle_name, last_name, date_of_birth, gender, enrollment_status,
      grade_level, strand, address, contact_number, guardian_name, guardian_relationship, guardian_phone, guardian_email)
    values (student_no, trim(r ->> 'first_name'), nullif(trim(r ->> 'middle_name'), ''), trim(r ->> 'last_name'), birth,
      r ->> 'sex', 'Enrolled', grade, strand_code, nullif(trim(r ->> 'address'), ''), nullif(trim(r ->> 'contact_number'), ''),
      nullif(trim(r ->> 'guardian_name'), ''), nullif(trim(r ->> 'guardian_relationship'), ''),
      nullif(trim(r ->> 'guardian_phone'), ''), nullif(trim(r ->> 'guardian_email'), ''))
    returning student_id into new_student;

    insert into enrollments (student_id, school_year, grade_level, status, enrolled_at)
    values (new_student, p_school_year, grade, 'active', now());

    new_username := generate_username(trim(r ->> 'first_name'), trim(r ->> 'last_name'));
    insert into users (username, email, password_hash, role_id, is_active, student_id, initial_password)
    values (new_username, new_username || '@tcs.edu.ph',
      extensions.crypt(new_username || '123', extensions.gen_salt('bf')), 4, true, new_student, new_username || '123');

    created := created || jsonb_build_object('row', n + 1, 'student_id', new_student, 'student_no', student_no,
      'username', new_username, 'name', trim(r ->> 'last_name') || ', ' || trim(r ->> 'first_name'));
  end loop;

  insert into audit_logs (action, entity_type, entity_id, details)
  values ('BULK_IMPORT_STUDENTS', 'school_year', null,
    jsonb_build_object('school_year', p_school_year, 'count', n, 'actor', actor));
  return jsonb_build_object('created', created, 'count', n);
end $$;

revoke all on function public.bulk_import_students(text, jsonb) from public, anon;
grant execute on function public.bulk_import_students(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
