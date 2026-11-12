-- v67-teaching-records.sql  (branch UIPolishPass)
-- Who taught which class, kept for good. The timetable (subject_schedules) only holds the running semester:
-- Auto-schedule replaces a Senior High section's 1st-semester classes when the 2nd semester starts, and a year's
-- classes are never meant as history. teaching_records keeps one row per teacher + section + subject.
--   1. teaching_records table, filled by a trigger on subject_schedules. A deleted class keeps its record once any
--      grade was entered for it (it was really taught); a class deleted before any grade (a mistake) loses it.
--   2. Backfill: every existing timetable row; and SY 2025-2026, which has grades but no timetable, from its grade
--      records (teacher = this year's teacher of the same section + subject, else a teacher assigned to the subject
--      in Manage Faculty, spreading the load).
--   3. Read-only past-year access for faculty: a subject teacher reads only the grades and attendance of the
--      classes they taught (that subject, that section, that year); an adviser reads their advisory section of any
--      year. Writes are unchanged: they still need the current timetable (faculty_teaches_subject/_student).
-- Safe to run twice.
begin;

-- 1. Table + trigger ------------------------------------------------------------------------------------------
create table if not exists public.teaching_records (
  id                 serial primary key,
  section_id         integer not null references public.sections(section_id) on delete cascade,
  subject_id         integer not null references public.subjects(subject_id) on delete cascade,
  faculty_profile_id integer references public.staff_profiles(profile_id) on delete set null,
  faculty_name       text not null,
  school_year        text not null,
  semester           smallint,
  source             text not null default 'timetable' check (source in ('timetable', 'backfill')),
  created_at         timestamptz not null default now()
);
create unique index if not exists teaching_records_class_teacher
  on public.teaching_records (section_id, subject_id, lower(faculty_name));
create index if not exists idx_teaching_records_profile on public.teaching_records (faculty_profile_id, school_year);
create index if not exists idx_teaching_records_year on public.teaching_records (school_year);

create or replace function public.record_teaching()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and nullif(trim(new.faculty_name), '') is not null then
    insert into teaching_records (section_id, subject_id, faculty_profile_id, faculty_name, school_year, semester)
    select new.section_id, new.subject_id, new.faculty_profile_id, trim(new.faculty_name), sec.academic_year, sub.semester
    from sections sec, subjects sub
    where sec.section_id = new.section_id and sub.subject_id = new.subject_id
    on conflict (section_id, subject_id, lower(faculty_name)) do nothing;
  end if;
  -- The old class is gone (deleted, or moved to another teacher/subject/section): drop its record only if no
  -- timetable row still backs it and nobody entered a grade for it.
  if tg_op in ('DELETE', 'UPDATE') and nullif(trim(old.faculty_name), '') is not null
     and not exists (select 1 from subject_schedules ss where ss.section_id = old.section_id and ss.subject_id = old.subject_id
                     and lower(trim(ss.faculty_name)) = lower(trim(old.faculty_name)))
     and not exists (select 1 from academic_history ah
                     join enrollments e on e.student_id = ah.student_id and e.section_id = old.section_id and e.school_year = ah.school_year
                     join subjects sub on sub.subject_id = old.subject_id and sub.subject_name = ah.subject
                     join sections sec on sec.section_id = old.section_id and sec.academic_year = ah.school_year
                     where coalesce(ah.first_sem_q1, ah.first_sem_q2, ah.second_sem_q1, ah.second_sem_q2, ah.final) is not null) then
    delete from teaching_records
      where section_id = old.section_id and subject_id = old.subject_id and lower(faculty_name) = lower(trim(old.faculty_name));
  end if;
  return null;
end $$;

drop trigger if exists subject_schedules_record_teaching on public.subject_schedules;
create trigger subject_schedules_record_teaching
  after insert or delete or update of faculty_name, faculty_profile_id, subject_id, section_id on public.subject_schedules
  for each row execute function public.record_teaching();

-- 2a. Backfill from every existing timetable row ---------------------------------------------------------------
insert into teaching_records (section_id, subject_id, faculty_profile_id, faculty_name, school_year, semester)
select distinct on (ss.section_id, ss.subject_id, lower(trim(ss.faculty_name)))
  ss.section_id, ss.subject_id, ss.faculty_profile_id, trim(ss.faculty_name), sec.academic_year, sub.semester
from subject_schedules ss
join sections sec on sec.section_id = ss.section_id
join subjects sub on sub.subject_id = ss.subject_id
where nullif(trim(ss.faculty_name), '') is not null
order by ss.section_id, ss.subject_id, lower(trim(ss.faculty_name)), ss.schedule_id
on conflict (section_id, subject_id, lower(faculty_name)) do nothing;

-- 2b. Backfill SY 2025-2026 from its grade records --------------------------------------------------------------
do $$
declare
  c record; pick integer; teacher text;
begin
  for c in
    select distinct o.section_id, o.section_name, o.grade_level, o.strand, sub.subject_id, sub.subject_name, sub.semester
    from sections o
    join enrollments e on e.section_id = o.section_id and e.school_year = o.academic_year
    join academic_history ah on ah.student_id = e.student_id and ah.school_year = o.academic_year
    join subjects sub on sub.subject_name = ah.subject and o.grade_level = any(sub.grade_level)
                     and (sub.strands is null or o.strand = any(sub.strands))
    where o.academic_year = '2025-2026'
      and not exists (select 1 from teaching_records tr where tr.section_id = o.section_id and tr.subject_id = sub.subject_id)
    order by o.grade_level, o.section_name, sub.subject_name
  loop
    -- Same teacher as this year's same section and subject, when there is one.
    select ss.faculty_profile_id into pick
    from sections n
    join subject_schedules ss on ss.section_id = n.section_id and ss.subject_id = c.subject_id
    where n.academic_year = '2026-2027' and n.section_name = c.section_name and n.grade_level = c.grade_level
      and n.strand is not distinct from c.strand
    order by ss.schedule_id limit 1;
    -- Otherwise an active teacher assigned to the subject, the one with the fewest 2025-2026 classes so far.
    if pick is null then
      select fs.profile_id into pick
      from faculty_subjects fs
      join staff_profiles sp on sp.profile_id = fs.profile_id
      join users u on u.user_id = sp.user_id and u.is_active and u.role_id = 3
      where fs.subject_id = c.subject_id
      order by (select count(*) from teaching_records tr where tr.faculty_profile_id = fs.profile_id and tr.school_year = '2025-2026'),
               fs.profile_id
      limit 1;
    end if;
    if pick is null then
      raise notice 'No teacher for % / %', c.section_name, c.subject_name;
      continue;
    end if;
    select sp.first_name || ' ' || sp.last_name into teacher from staff_profiles sp where sp.profile_id = pick;
    insert into teaching_records (section_id, subject_id, faculty_profile_id, faculty_name, school_year, semester, source)
    values (c.section_id, c.subject_id, pick, teacher, '2025-2026', c.semester, 'backfill')
    on conflict (section_id, subject_id, lower(faculty_name)) do nothing;
  end loop;
end $$;

-- 3. Read access ----------------------------------------------------------------------------------------------
-- The signed-in faculty member's staff profile.
create or replace function public.my_faculty_profile_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select sp.profile_id from staff_profiles sp join users u on u.user_id = sp.user_id
  where lower(u.email) = lower(auth.jwt() ->> 'email') and u.is_active and u.role_id = 3
  limit 1;
$$;

-- Sections the faculty member taught (any year) or advised (any year).
create or replace function public.faculty_record_section_ids()
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select tr.section_id from teaching_records tr where tr.faculty_profile_id = public.my_faculty_profile_id()
  union
  select s.section_id from sections s join staff_profiles sp on lower(trim(s.faculty_assigned)) = lower(sp.first_name || ' ' || sp.last_name)
  where sp.profile_id = public.my_faculty_profile_id();
$$;

-- Advised section of that year.
create or replace function public.faculty_advised_section(p_section_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from sections s join staff_profiles sp on lower(trim(s.faculty_assigned)) = lower(sp.first_name || ' ' || sp.last_name)
                 where s.section_id = p_section_id and sp.profile_id = public.my_faculty_profile_id());
$$;

-- A grade row: the teacher taught that subject to the student's section that year, or advised that section.
create or replace function public.faculty_can_read_grade(p_student_id integer, p_school_year text, p_subject text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join sections sec on sec.section_id = e.section_id and sec.academic_year = p_school_year
    where e.student_id = p_student_id and e.school_year = p_school_year
      and (public.faculty_advised_section(e.section_id)
           or exists (select 1 from teaching_records tr join subjects sub on sub.subject_id = tr.subject_id
                      where tr.section_id = e.section_id and sub.subject_name = p_subject
                        and tr.faculty_profile_id = public.my_faculty_profile_id()))
  );
$$;

-- An attendance row: the teacher's own class (section + subject), or any row of a section they advised.
create or replace function public.faculty_can_read_attendance(p_section_id integer, p_subject_id integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.faculty_advised_section(p_section_id)
      or exists (select 1 from teaching_records tr where tr.section_id = p_section_id and tr.subject_id = p_subject_id
                 and tr.faculty_profile_id = public.my_faculty_profile_id());
$$;

revoke all on function public.my_faculty_profile_id() from public, anon;
revoke all on function public.faculty_record_section_ids() from public, anon;
revoke all on function public.faculty_advised_section(integer) from public, anon;
revoke all on function public.faculty_can_read_grade(integer, text, text) from public, anon;
revoke all on function public.faculty_can_read_attendance(integer, integer) from public, anon;
grant execute on function public.my_faculty_profile_id() to authenticated;
grant execute on function public.faculty_record_section_ids() to authenticated;
grant execute on function public.faculty_advised_section(integer) to authenticated;
grant execute on function public.faculty_can_read_grade(integer, text, text) to authenticated;
grant execute on function public.faculty_can_read_attendance(integer, integer) to authenticated;

alter table public.teaching_records enable row level security;
drop policy if exists teaching_records_read on public.teaching_records;
create policy teaching_records_read on public.teaching_records for select to authenticated using (
  (select current_app_role()) in (1, 2)
  or ((select current_app_role()) = 3 and faculty_profile_id = (select public.my_faculty_profile_id()))
);
grant select on public.teaching_records to authenticated;

-- Added to the existing faculty/adviser policies (policies OR together); all SELECT only.
drop policy if exists faculty_record_enrollments_read on public.enrollments;
create policy faculty_record_enrollments_read on public.enrollments for select to authenticated
  using ((select current_app_role()) = 3 and section_id in (select public.faculty_record_section_ids()));

drop policy if exists faculty_record_students_read on public.students;
create policy faculty_record_students_read on public.students for select to authenticated
  using ((select current_app_role()) = 3 and exists (
    select 1 from public.enrollments e where e.student_id = students.student_id
      and e.section_id in (select public.faculty_record_section_ids())));

drop policy if exists faculty_record_academic_read on public.academic_history;
create policy faculty_record_academic_read on public.academic_history for select to authenticated
  using ((select current_app_role()) = 3 and public.faculty_can_read_grade(student_id, school_year, subject));

drop policy if exists faculty_record_attendance_read on public.attendance;
create policy faculty_record_attendance_read on public.attendance for select to authenticated
  using ((select current_app_role()) = 3 and public.faculty_can_read_attendance(section_id, subject_id));

notify pgrst, 'reload schema';
commit;
