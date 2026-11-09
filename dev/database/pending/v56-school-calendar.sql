-- v56-school-calendar.sql  (branch SchoolYearLifecycle)
-- School calendar: quarter dates, grade submission deadlines and holidays per school year.
-- Also adds link_school_year_column(), the v47b treatment (FK to school_years + Past-year lock trigger)
-- as a reusable function, so every new table with a school_year column gets the same protection.
-- Safe to run twice.
begin;

-- Same FK name and trigger name v47b uses, so re-running v47b skips them.
create or replace function public.link_school_year_column(p_table text, p_column text default 'school_year')
returns void
language plpgsql
set search_path = public
as $$
declare
  fk_name  text := left(p_table || '_' || p_column || '_school_year_fkey', 63);
  trg_name text := left('trg_' || p_table || '_' || p_column || '_lock_past', 63);
begin
  if not exists (select 1 from pg_constraint where conname = fk_name and conrelid = format('public.%I', p_table)::regclass) then
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.school_years(label) on update cascade',
      p_table, fk_name, p_column);
  end if;
  if not exists (select 1 from pg_trigger where tgname = trg_name and tgrelid = format('public.%I', p_table)::regclass and not tgisinternal) then
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.block_past_school_year_changes(%L)',
      trg_name, p_table, p_column);
  end if;
end $$;

create table if not exists public.school_quarters (
  id             serial unique,
  school_year    text not null,
  quarter        smallint not null check (quarter between 1 and 4),
  start_date     date not null,
  end_date       date not null,
  grade_deadline date,
  updated_at     timestamptz not null default now(),
  primary key (school_year, quarter),
  constraint school_quarters_dates check (end_date >= start_date),
  constraint school_quarters_deadline check (grade_deadline is null or grade_deadline >= start_date)
);

create table if not exists public.school_holidays (
  id           serial primary key,
  school_year  text not null,
  holiday_date date not null,
  name         text not null check (length(trim(name)) between 1 and 120),
  created_at   timestamptz not null default now(),
  unique (school_year, holiday_date)
);

select public.link_school_year_column('school_quarters');
select public.link_school_year_column('school_holidays');

-- Audit trail + Restore Changes, like every other admin-edited table (single-column key: id).
create or replace function public.attach_change_tracking(p_table text, p_pk text default 'id')
returns void
language plpgsql
set search_path = public
as $$
begin
  execute format('drop trigger if exists %I on public.%I', p_table || '_audit', p_table);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function audit_row_change(%L)',
    p_table || '_audit', p_table, p_pk);
  execute format('drop trigger if exists zz_snapshot_change on public.%I', p_table);
  execute format('create trigger zz_snapshot_change after insert or update or delete on public.%I for each row execute function snapshot_row_change(%L)',
    p_table, p_pk);
end $$;
select public.attach_change_tracking('school_quarters');
select public.attach_change_tracking('school_holidays');

-- Quarters must sit inside their school year (the page checks this too; this stops direct API writes).
create or replace function public.school_quarters_inside_year()
returns trigger
language plpgsql
set search_path = public
as $$
declare y school_years%rowtype;
begin
  select * into y from school_years where label = new.school_year;
  if new.start_date < y.start_date or new.end_date > y.end_date then
    raise exception 'Q% must fall inside % (% to %)', new.quarter, y.label, y.start_date, y.end_date
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_school_quarters_inside_year on public.school_quarters;
create trigger trg_school_quarters_inside_year before insert or update on public.school_quarters
  for each row execute function public.school_quarters_inside_year();

alter table public.school_quarters enable row level security;
alter table public.school_holidays enable row level security;

drop policy if exists school_quarters_read on public.school_quarters;
create policy school_quarters_read on public.school_quarters for select to authenticated
  using ((select current_app_role()) = any (array[1, 2, 3, 4]));
drop policy if exists school_quarters_admin on public.school_quarters;
create policy school_quarters_admin on public.school_quarters for all to authenticated
  using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);

drop policy if exists school_holidays_read on public.school_holidays;
create policy school_holidays_read on public.school_holidays for select to authenticated
  using ((select current_app_role()) = any (array[1, 2, 3, 4]));
drop policy if exists school_holidays_admin on public.school_holidays;
create policy school_holidays_admin on public.school_holidays for all to authenticated
  using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);

grant select, insert, update, delete on public.school_quarters, public.school_holidays to authenticated;
grant usage on sequence public.school_holidays_id_seq to authenticated;

notify pgrst, 'reload schema';
commit;
