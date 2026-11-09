-- v60-adviser-access.sql  (branch SchoolYearLifecycle)
-- A class adviser (the faculty named in sections.faculty_assigned for the current school year) may READ their
-- advisory section's students, roster, every subject's grades, attendance, and the requests those students
-- filed. Faculty already read the students they teach; this adds the adviser's whole-section view.
-- Read-only: grades stay editable only by the subject teacher. Safe to run twice.
begin;

-- Advisory sections of the signed-in faculty member, this school year. Matched by name, as the Manage
-- Sections page stores the adviser ("First Last" of the staff profile).
create or replace function public.adviser_section_ids()
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select s.section_id
  from public.sections s
  join public.staff_profiles sp on lower(trim(s.faculty_assigned)) = lower(sp.first_name || ' ' || sp.last_name)
  join public.users u on u.user_id = sp.user_id
  where lower(u.email) = lower(auth.jwt() ->> 'email') and u.is_active and u.role_id = 3
    and s.academic_year = public.current_school_year();
$$;

create or replace function public.adviser_of_student(p_student_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student_id and e.status in ('active', 'completed')
      and e.section_id in (select public.adviser_section_ids())
  );
$$;
grant execute on function public.adviser_section_ids() to authenticated;
grant execute on function public.adviser_of_student(integer) to authenticated;

drop policy if exists adviser_students_read on public.students;
create policy adviser_students_read on public.students for select to authenticated
  using ((select current_app_role()) = 3 and public.adviser_of_student(student_id));

drop policy if exists adviser_enrollments_read on public.enrollments;
create policy adviser_enrollments_read on public.enrollments for select to authenticated
  using ((select current_app_role()) = 3 and section_id in (select public.adviser_section_ids()));

drop policy if exists adviser_academic_read on public.academic_history;
create policy adviser_academic_read on public.academic_history for select to authenticated
  using ((select current_app_role()) = 3 and public.adviser_of_student(student_id));

drop policy if exists adviser_attendance_read on public.attendance;
create policy adviser_attendance_read on public.attendance for select to authenticated
  using ((select current_app_role()) = 3 and public.adviser_of_student(student_id));

-- Requests filed by the adviser's students (profile edits, LRN/account/section requests, ...). The users
-- lookup runs as definer: faculty cannot read other people's users rows.
create or replace function public.adviser_of_user(p_user_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.user_id = p_user_id and u.role_id = 4 and public.adviser_of_student(u.student_id)
  );
$$;
grant execute on function public.adviser_of_user(integer) to authenticated;

drop policy if exists adviser_requests_read on public.approval_requests;
create policy adviser_requests_read on public.approval_requests for select to authenticated
  using ((select current_app_role()) = 3 and public.adviser_of_user(requested_by));

notify pgrst, 'reload schema';
commit;
