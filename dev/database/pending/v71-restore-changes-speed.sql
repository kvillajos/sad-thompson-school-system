-- v71-restore-changes-speed.sql  (branch ImportLoginFix)
-- Restore Changes timed out ("canceling statement due to statement timeout", 8 s limit for signed-in users).
-- Cause: list_change_groups() looks up the caller's role in a small "me" step, but Postgres inlined it and ran
-- current_app_role() once per change_snapshots row (5,588 times, ~0.65 ms each = 3.6 s, more under load).
--   1. "as materialized" makes the role lookup run once per call (34 ms instead of 3.6 s).
--   2. An index on lower(email) makes every current_app_role() call (72 RLS policies, the backup/import RPCs) an
--      index lookup instead of a scan of users.
-- No data changes. Safe to run twice.
begin;

create index if not exists users_lower_email_idx on public.users (lower(email));

create or replace function public.list_change_groups(p_limit integer default 200)
 returns table(change_group bigint, changed_at timestamp with time zone, changed_by text, label text, tables text[], operations text[], row_count integer, restored_at timestamp with time zone, restored_by text, has_newer boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with me as materialized (select current_app_role() as role, lower(auth.jwt() ->> 'email') as email),
  groups as (
    select s.change_group, min(s.changed_at) as changed_at, min(s.changed_by) as changed_by,
      count(*)::integer as row_count, array_agg(distinct s.table_name) as tables,
      array_agg(distinct s.operation) as operations, max(s.restored_at) as restored_at,
      max(s.restored_by) as restored_by, max(s.id) as last_id,
      (array_agg(coalesce(
        nullif(trim(concat_ws(' ', coalesce(s.new_row, s.old_row) ->> 'first_name', coalesce(s.new_row, s.old_row) ->> 'last_name')), ''),
        coalesce(s.new_row, s.old_row) ->> 'section_name', coalesce(s.new_row, s.old_row) ->> 'subject_name',
        coalesce(s.new_row, s.old_row) ->> 'title', coalesce(s.new_row, s.old_row) ->> 'subject',
        coalesce(s.new_row, s.old_row) ->> 'attendance_date', coalesce(s.new_row, s.old_row) ->> 'school_year',
        s.table_name || ' #' || s.pk_value) order by s.id))[1] as label
    from change_snapshots s cross join me
    where s.changed_at > now() - interval '30 days'
      and me.role in (1, 2)
      and (me.role = 1 or lower(s.changed_by) = me.email)
    group by s.change_group
  )
  select g.change_group, g.changed_at, g.changed_by, g.label, g.tables, g.operations, g.row_count,
    g.restored_at, g.restored_by,
    exists (select 1 from change_snapshots mine join change_snapshots later
              on later.table_name = mine.table_name and later.pk_value = mine.pk_value and later.id > g.last_id
            where mine.change_group = g.change_group) as has_newer
  from groups g
  order by g.changed_at desc
  limit greatest(1, least(p_limit, 500));
$function$;

notify pgrst, 'reload schema';
commit;
