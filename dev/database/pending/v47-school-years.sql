-- v47-school-years.sql
-- Task: Khyle / branch khyle-school-years
-- School Years table. One row per year, status computed from dates (never stored).
-- Safe to run twice.

create table if not exists public.school_years (
  label      text primary key check (label ~ '^\d{4}-\d{4}$'),
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now(),
  constraint school_years_end_after_start check (end_date > start_date)
);

-- Same helper as in v47b (create or replace, so running both is harmless).
-- Admins, and server-side sessions with no logged-in user, may change past years.
-- ADJUST if your project defines admins differently. It calls public.is_admin() when that
-- function exists; otherwise it falls back to the role claim in the JWT.
create or replace function public.school_year_user_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return true;
  end if;
  return coalesce(public.current_app_role(), 0) = 1;
end;
$$;

-- Status is computed from the dates: Upcoming / Active / Past.
create or replace function public.school_year_status(p_label text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (now() at time zone 'Asia/Manila')::date < sy.start_date then 'Upcoming'
    when (now() at time zone 'Asia/Manila')::date > sy.end_date   then 'Past'
    else 'Active'
  end
  from public.school_years sy
  where sy.label = p_label;
$$;

-- Two years' dates may not overlap.
create or replace function public.school_years_no_overlap()
returns trigger
language plpgsql
as $$
declare
  clash text;
begin
  select sy.label into clash
  from public.school_years sy
  where sy.label <> case when tg_op = 'UPDATE' then old.label else new.label end
    and sy.start_date <= new.end_date
    and sy.end_date   >= new.start_date
  limit 1;

  if clash is not null then
    raise exception 'School year % overlaps % (dates may not overlap)', new.label, clash
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_school_years_no_overlap on public.school_years;
create trigger trg_school_years_no_overlap
  before insert or update on public.school_years
  for each row execute function public.school_years_no_overlap();

-- Backfill: every distinct YYYY-YYYY value found in any school_year / academic_year
-- text column in the public schema. Default dates: June 1 to May 31.
-- A value that cannot be inserted (for example overlapping dates) is reported and skipped.
do $$
declare
  r record;
  y text;
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name   = c.table_name
     and t.table_type   = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('school_year', 'academic_year')
      and c.data_type in ('text', 'character varying')
      and not (c.table_name = 'school_years' and c.column_name = 'label')
  loop
    for y in
      execute format(
        'select distinct %I from public.%I where %I ~ %L',
        r.column_name, r.table_name, r.column_name, '^\d{4}-\d{4}$'
      )
    loop
      begin
        insert into public.school_years (label, start_date, end_date)
        values (
          y,
          make_date(split_part(y, '-', 1)::int, 6, 1),
          make_date(split_part(y, '-', 2)::int, 5, 31)
        )
        on conflict (label) do nothing;
      exception when others then
        raise notice 'Skipped year % from %.%: %', y, r.table_name, r.column_name, sqlerrm;
      end;
    end loop;
  end loop;
end $$;

-- Access: everyone signed in can read; only admins can add, rename or edit years.
alter table public.school_years enable row level security;

drop policy if exists school_years_read on public.school_years;
create policy school_years_read on public.school_years
  for select to authenticated using (true);

drop policy if exists school_years_admin_write on public.school_years;
create policy school_years_admin_write on public.school_years
  for all to authenticated
  using (public.school_year_user_is_admin())
  with check (public.school_year_user_is_admin());

-- ---------------------------------------------------------------------------
-- Swap two students between sections (fixes "override should switch with a full classroom").
-- Both students must have an active enrollment in the same school year and grade level, in
-- different sections. Each moves into the other's section in one transaction, so no section
-- gains or loses a student and capacity is respected without admin approval. Writes an audit entry.
-- ---------------------------------------------------------------------------
create or replace function public.swap_student_sections(p_student_a integer, p_student_b integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ea       enrollments%rowtype;
  eb       enrollments%rowtype;
  sec_a    sections%rowtype;
  sec_b    sections%rowtype;
  name_a   text;
  name_b   text;
  actor_name text;
begin
  if coalesce(current_app_role(), 0) not in (1, 2) then
    raise exception 'Not authorized';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required';
  end if;
  if p_student_a is null or p_student_b is null or p_student_a = p_student_b then
    raise exception 'Choose two different students';
  end if;

  -- Lock both students in a fixed order so two swaps at the same time cannot deadlock.
  perform 1 from students where student_id in (p_student_a, p_student_b) order by student_id for update;

  select first_name || ' ' || last_name into name_a from students where student_id = p_student_a;
  if not found then raise exception 'Student not found'; end if;
  select first_name || ' ' || last_name into name_b from students where student_id = p_student_b;
  if not found then raise exception 'Student not found'; end if;

  select * into ea from enrollments
    where student_id = p_student_a and status = 'active' order by created_at desc limit 1;
  if not found or ea.section_id is null then raise exception '% is not placed in a section', name_a; end if;
  select * into eb from enrollments
    where student_id = p_student_b and status = 'active' order by created_at desc limit 1;
  if not found or eb.section_id is null then raise exception '% is not placed in a section', name_b; end if;

  if ea.section_id = eb.section_id then
    raise exception 'Both students are already in the same section';
  end if;
  if ea.school_year is distinct from eb.school_year then
    raise exception 'Both students must be enrolled in the same school year';
  end if;
  if public.school_year_status(ea.school_year) = 'Past' then
    raise exception 'School year % is Past and read-only', ea.school_year;
  end if;

  -- Lock both sections in a fixed order, then read them.
  perform 1 from sections where section_id in (ea.section_id, eb.section_id) order by section_id for update;
  select * into sec_a from sections where section_id = ea.section_id;
  select * into sec_b from sections where section_id = eb.section_id;

  if sec_a.grade_level is distinct from sec_b.grade_level or ea.grade_level is distinct from eb.grade_level then
    raise exception 'Both students must be in the same grade level';
  end if;
  perform public.placement_guard(p_student_a, sec_b);
  perform public.placement_guard(p_student_b, sec_a);

  -- Moving the first student briefly fills the other section; the swap as a whole keeps every
  -- section at the same size, so the capacity guard is switched off for this transaction only.
  perform set_config('app.capacity_override', 'on', true);
  update enrollments
     set section_id = case when id = ea.id then eb.section_id else ea.section_id end
   where id in (ea.id, eb.id);
  perform set_config('app.capacity_override', 'off', true);

  select username::text into actor_name from users
    where lower(email) = lower(auth.jwt() ->> 'email') and is_active limit 1;

  insert into audit_logs(actor, action, entity_type, entity_id, details)
  values (actor_name, 'SWAP_SECTIONS', 'student', p_student_a, jsonb_build_object(
    'student_a', p_student_a,
    'student_b', p_student_b,
    'section_a_before', ea.section_id,
    'section_a_before_name', sec_a.section_name,
    'section_b_before', eb.section_id,
    'section_b_before_name', sec_b.section_name,
    'school_year', ea.school_year,
    'reason', trim(p_reason)
  ));

  insert into notifications(title, message, entity_type, entity_id)
  values ('Student Section Swap',
          format('%s (%s) and %s (%s) swapped sections.', name_a, sec_a.section_name, name_b, sec_b.section_name),
          'student', p_student_a);

  return jsonb_build_object(
    'student_a', name_a, 'now_in_a', sec_b.section_name,
    'student_b', name_b, 'now_in_b', sec_a.section_name
  );
end;
$$;

grant execute on function public.swap_student_sections(integer, integer, text) to authenticated;
