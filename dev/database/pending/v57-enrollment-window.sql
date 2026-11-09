-- v57-enrollment-window.sql  (branch SchoolYearLifecycle)
-- 1. school_years.enrollment_open: a real per-year switch the admin flips on the Year Setup page.
--    While it is off, nobody (admin included) can enroll a student into that year: no new enrollment, no first
--    section placement, no re-enroll and no bulk import. Moves inside the year (shift, swap, transfer, promotion)
--    are not enrollment and still work. Server-side scripts (no logged-in user) are not blocked.
-- 2. school_years.closed_at / closed_by / close_reason: "Close year" on the year-end checklist (v63). A closed
--    year counts as Past, so the v47b Past-year lock makes it read-only right away instead of on its end date.
-- Safe to run twice: the backfill only runs when the column is first added.
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'school_years' and column_name = 'enrollment_open') then
    alter table public.school_years add column enrollment_open boolean not null default false;
    -- Keep today's work going: the year in progress starts open; any other year is opened from Year Setup.
    update public.school_years set enrollment_open = true where label = public.current_school_year();
  end if;
end $$;
alter table public.school_years add column if not exists closed_at timestamptz;
alter table public.school_years add column if not exists closed_by text;
alter table public.school_years add column if not exists close_reason text;

-- As v47, plus: a closed year is Past.
create or replace function public.school_year_status(p_label text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when sy.closed_at is not null then 'Past'
    when (now() at time zone 'Asia/Manila')::date < sy.start_date then 'Upcoming'
    when (now() at time zone 'Asia/Manila')::date > sy.end_date   then 'Past'
    else 'Active'
  end
  from public.school_years sy
  where sy.label = p_label;
$$;

create or replace function public.enrollment_is_open(p_label text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select enrollment_open and closed_at is null from public.school_years where label = p_label), false);
$$;
grant execute on function public.enrollment_is_open(text) to authenticated;

create or replace function public.enrollment_window_error(p_label text)
returns void
language plpgsql
as $$
begin
  raise exception 'Enrollment for % is closed. The admin opens it on the Year Setup page.', p_label
    using errcode = 'check_violation';
end $$;

-- enrollments: a new active enrollment, a re-activated one, or a first section placement needs an open year.
create or replace function public.enforce_enrollment_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.status is distinct from 'active' or public.enrollment_is_open(new.school_year) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active'
     and (old.section_id is not null or new.section_id is not distinct from old.section_id) then
    return new; -- moving a placed student (shift/swap) or editing details is not enrollment
  end if;
  if tg_op = 'INSERT' and exists (
    select 1 from public.enrollments e
    where e.student_id = new.student_id and e.school_year = new.school_year
      and e.status = 'active' and e.section_id is not null
  ) then
    return new; -- insert ... on conflict update of an already placed student (assign_student_to_section)
  end if;
  perform public.enrollment_window_error(new.school_year);
  return new;
end $$;
drop trigger if exists trg_enrollments_window on public.enrollments;
create trigger trg_enrollments_window before insert or update on public.enrollments
  for each row execute function public.enforce_enrollment_window();

-- student_school_years: the registrar's "Enroll for <SY>" (re-enroll) writes here directly. Rows written by the
-- enrollments sync trigger (nested, depth > 1) were already checked above.
create or replace function public.enforce_reenroll_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 or public.enrollment_is_open(new.school_year) then
    return new;
  end if;
  perform public.enrollment_window_error(new.school_year);
  return new;
end $$;
drop trigger if exists trg_student_school_years_window on public.student_school_years;
create trigger trg_student_school_years_window before insert on public.student_school_years
  for each row execute function public.enforce_reenroll_window();

notify pgrst, 'reload schema';
commit;
