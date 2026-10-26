-- v52-curriculum-strands.sql
-- K-12 subject catalog with Senior High strands (old K-12 strands: STEM, ABM, HUMSS, GAS and three TVL programs).
--   1. strands lookup table
--   2. subjects: subject_type (Core / Applied / Specialized / School), semester (1, 2 or null = whole year),
--      strands (null = every strand)
--   3. strand on students, sections and admission applications
--   4. placement_guard refuses placing a student into a section of another strand
--   5. check_schedule_conflicts only compares classes in the same school year (copying a year's schedules
--      forward no longer clashes with the year it was copied from)
--   6. review_admission_application copies the applicant's strand to the student
-- Safe to run twice.
begin;

create table if not exists strands (
  code       text primary key check (code ~ '^[A-Z][A-Z0-9-]{1,19}$'),
  name       text not null,
  track      text not null check (track in ('Academic', 'TVL')),
  sort_order integer not null default 0
);
insert into strands (code, name, track, sort_order) values
  ('STEM', 'Science, Technology, Engineering and Mathematics', 'Academic', 1),
  ('ABM', 'Accountancy, Business and Management', 'Academic', 2),
  ('HUMSS', 'Humanities and Social Sciences', 'Academic', 3),
  ('GAS', 'General Academic Strand', 'Academic', 4),
  ('TVL-CSS', 'TVL - Computer System Servicing NC II', 'TVL', 5),
  ('TVL-MSES', 'TVL - Motorcycle/Small Engine Servicing NC II', 'TVL', 6),
  ('TVL-PLUMB', 'TVL - Plumbing NC I', 'TVL', 7)
on conflict (code) do nothing;
alter table strands enable row level security;
drop policy if exists strands_read on strands;
create policy strands_read on strands for select to authenticated using ((select current_app_role()) in (1,2,3,4));
drop policy if exists strands_admin on strands;
create policy strands_admin on strands for all to authenticated
  using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);
grant select, insert, update, delete on strands to authenticated;

alter table subjects add column if not exists subject_type text;
alter table subjects drop constraint if exists subjects_subject_type_check;
alter table subjects add constraint subjects_subject_type_check
  check (subject_type is null or subject_type in ('Core', 'Applied', 'Specialized', 'School'));
alter table subjects add column if not exists semester smallint;
alter table subjects drop constraint if exists subjects_semester_check;
alter table subjects add constraint subjects_semester_check check (semester is null or semester in (1, 2));
alter table subjects add column if not exists strands text[];
alter table subjects drop constraint if exists subjects_strands_check;
alter table subjects add constraint subjects_strands_check check (strands is null or cardinality(strands) > 0);

alter table students add column if not exists strand text references strands(code) on update cascade;
alter table sections add column if not exists strand text references strands(code) on update cascade;
alter table admission_applications add column if not exists strand text references strands(code) on update cascade;

create or replace function public.placement_guard(p_student_id integer, p_target sections)
 returns void
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare student_strand text;
begin
  if coalesce(p_target.status, 'active') <> 'active' then
    raise exception '% (%) is %, so students cannot be placed in it', p_target.section_name, p_target.academic_year, p_target.status;
  end if;
  if exists (select 1 from students where student_id = p_student_id
             and enrollment_status in ('Graduated', 'Transferred', 'Withdrawn')) then
    raise exception 'This student has left the school (graduated, transferred or withdrawn) and cannot be placed';
  end if;
  if p_target.strand is not null then
    select strand into student_strand from students where student_id = p_student_id;
    if student_strand is distinct from p_target.strand then
      raise exception '% is a % section; this student''s strand is %', p_target.section_name, p_target.strand, coalesce(student_strand, 'not set');
    end if;
  end if;
end $function$;

create or replace function public.check_schedule_conflicts(p_section_id integer, p_subject_id integer, p_day_of_week smallint, p_start_time time without time zone, p_end_time time without time zone, p_faculty_name text default null::text, p_room text default null::text, p_exclude_schedule_id integer default null::integer)
 returns table(schedule_id integer, conflict_type text, conflict_with text)
 language sql
 stable
as $function$
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
    and sec.academic_year is not distinct from (select academic_year from sections where section_id = p_section_id)
    and (s.section_id = p_section_id
      or (nullif(trim(p_faculty_name), '') is not null and lower(coalesce(s.faculty_name, '')) = lower(trim(p_faculty_name)))
      or (nullif(trim(p_room), '') is not null and lower(coalesce(s.room, '')) = lower(trim(p_room))));
$function$;

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
    select target_student_id, extract(year from current_date)::text || '-' || (extract(year from current_date)+1)::text,
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

-- v47 let any signed-in session read school_years with using (true); match every other lookup table instead
-- (an active app role is required).
drop policy if exists school_years_read on school_years;
create policy school_years_read on school_years for select to authenticated using ((select current_app_role()) in (1,2,3,4));

notify pgrst, 'reload schema';
commit;
