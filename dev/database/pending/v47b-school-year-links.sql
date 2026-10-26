-- v47b-school-year-links.sql
-- Task: Khyle / branch khyle-school-years
-- Runs LAST, after v47-v51. Discovers every school_year / academic_year column
-- in the public schema (so it also covers tables other members just created),
-- then for each one:
--   1. makes sure every year value exists in school_years
--   2. adds a foreign key -> school_years(label) on update cascade
--   3. attaches a trigger that blocks insert/update/delete on Past years (admins excepted)
-- Safe to run twice.

-- Admin check. Admins (and server-side roles with no logged-in user) may change past years.
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

-- Generic guard. The column to check is passed as the trigger argument.
create or replace function public.block_past_school_year_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col        text := tg_argv[0];
  old_year   text;
  new_year   text;
begin
  if public.school_year_user_is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    old_year := to_jsonb(old) ->> col;
    if old_year is not null and public.school_year_status(old_year) = 'Past' then
      raise exception 'School year % is Past and read-only (% on %.%)',
        old_year, tg_op, tg_table_schema, tg_table_name
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_year := to_jsonb(new) ->> col;
    if new_year is not null and public.school_year_status(new_year) = 'Past' then
      raise exception 'School year % is Past and read-only (% on %.%)',
        new_year, tg_op, tg_table_schema, tg_table_name
        using errcode = 'check_violation';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  r         record;
  y         text;
  fk_name   text;
  trg_name  text;
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
    order by c.table_name, c.column_name
  loop
    fk_name  := left(r.table_name || '_' || r.column_name || '_school_year_fkey', 63);
    trg_name := left('trg_' || r.table_name || '_' || r.column_name || '_lock_past', 63);

    -- 1. Make sure every existing year value has a row in school_years.
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

    -- 2. Foreign key with on update cascade (skip if it already exists).
    if not exists (
      select 1
      from pg_constraint con
      where con.conname  = fk_name
        and con.conrelid = format('public.%I', r.table_name)::regclass
    ) then
      begin
        execute format(
          'alter table public.%I add constraint %I foreign key (%I) references public.school_years(label) on update cascade',
          r.table_name, fk_name, r.column_name
        );
      exception when others then
        raise notice 'Could not add FK on %.%: % (check for values not in YYYY-YYYY format)',
          r.table_name, r.column_name, sqlerrm;
      end;
    end if;

    -- 3. Past-year lock trigger (skip if it already exists).
    if not exists (
      select 1
      from pg_trigger tg
      where tg.tgname   = trg_name
        and tg.tgrelid  = format('public.%I', r.table_name)::regclass
        and not tg.tgisinternal
    ) then
      execute format(
        'create trigger %I before insert or update or delete on public.%I for each row execute function public.block_past_school_year_changes(%L)',
        trg_name, r.table_name, r.column_name
      );
    end if;
  end loop;
end $$;
