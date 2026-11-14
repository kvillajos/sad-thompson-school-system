-- v70-database-backup.sql  (branch ImportLoginFix)
-- Admin "Download backup" (Reports & Audit > Audit Trail): the browser asks these functions for the data, builds the
-- .sql files and zips them. Admin-only (active, not deleted, role 1); everything else is refused.
--   backup_catalog()            tables (columns, primary key, row count), ID counters, uploaded-file list
--   backup_table_sql(t, o, n)   one INSERT statement for n rows of table t from offset o, ordered by its primary key.
--                               Postgres writes every value itself (quote_nullable(col::text)), so arrays, jsonb, dates
--                               and text are quoted exactly as the database reads them back.
--   log_backup_download(info)   audit entry DOWNLOAD_BACKUP
-- Never exported: password hashes and pending passwords (users.password_hash -> 'supabase-auth' placeholder,
-- users.initial_password -> NULL), the transient admission edit lock token, and those same fields inside the
-- Restore Changes history (change_snapshots.old_row / new_row). Logins (auth schema) are not exported at all.
-- AGENTS.md: never call these in a test or a demo.
begin;

create or replace function public.backup_admin() returns text
language sql stable security definer set search_path = public as $$
  select username from users
  where lower(email) = lower(auth.jwt() ->> 'email') and is_active and role_id = 1 and deleted_at is null
  limit 1
$$;
revoke all on function public.backup_admin() from public, anon, authenticated;

-- Blanks password fields inside a stored copy of a row (Restore Changes history); keeps the keys so restoring a change still works.
create or replace function public.backup_scrub_row(r jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case when r is null then null else r
    || case when r ? 'password_hash' then jsonb_build_object('password_hash', 'supabase-auth') else '{}'::jsonb end
    || case when r ? 'initial_password' then jsonb_build_object('initial_password', null) else '{}'::jsonb end
    || case when r ? 'editing_token' then jsonb_build_object('editing_token', null) else '{}'::jsonb end
  end
$$;
revoke all on function public.backup_scrub_row(jsonb) from public, anon, authenticated;

create or replace function public.backup_catalog() returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  t record;
  n bigint;
  tables jsonb := '[]'::jsonb;
begin
  if public.backup_admin() is null then raise exception 'Only an administrator can download a backup'; end if;
  for t in
    select c.oid, c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'r' order by c.relname
  loop
    execute format('select count(*) from public.%I', t.relname) into n;
    tables := tables || jsonb_build_object(
      'name', t.relname,
      'rows', n,
      'columns', (select jsonb_agg(a.attname order by a.attnum) from pg_attribute a
                  where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''),
      'primary_key', (select jsonb_agg(a.attname order by array_position(i.indkey::int2[], a.attnum))
                      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                      where i.indrelid = t.oid and i.indisprimary));
  end loop;
  return jsonb_build_object(
    'generated_at', now(),
    'postgres', current_setting('server_version'),
    'tables', tables,
    'sequences', coalesce((select jsonb_agg(jsonb_build_object('name', sequencename, 'last_value', last_value, 'start', start_value)
                           order by sequencename) from pg_sequences where schemaname = 'public'), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'name', name,
                         'size', (metadata ->> 'size')::bigint, 'created_at', created_at) order by bucket_id, name)
                       from storage.objects), '[]'::jsonb));
end $$;

create or replace function public.backup_table_sql(p_table text, p_offset integer default 0, p_limit integer default 1000)
returns text
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  rel oid;
  cols text;
  vals text;
  pk text;
  body text;
begin
  if public.backup_admin() is null then raise exception 'Only an administrator can download a backup'; end if;
  select c.oid into rel from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r' and c.relname = p_table;
  if rel is null then raise exception 'Unknown table %', p_table; end if;
  if p_limit is null or p_limit < 1 or p_limit > 2000 then raise exception 'Ask for 1 to 2000 rows at a time'; end if;

  select string_agg(format('%I', a.attname), ', ' order by a.attnum),
         string_agg(
           case
             when p_table = 'users' and a.attname = 'password_hash' then quote_literal(quote_literal('supabase-auth'))
             when p_table = 'users' and a.attname = 'initial_password' then quote_literal('NULL')
             when p_table = 'admission_applications' and a.attname = 'editing_token' then quote_literal('NULL')
             when p_table = 'change_snapshots' and a.attname in ('old_row', 'new_row')
               then format('quote_nullable(public.backup_scrub_row(t.%I)::text)', a.attname)
             else format('quote_nullable(t.%I::text)', a.attname)
           end, $sep$ || ', ' || $sep$ order by a.attnum)
    into cols, vals
  from pg_attribute a where a.attrelid = rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';

  select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum)) into pk
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = rel and i.indisprimary;

  execute format($q$select string_agg('(' || %s || ')', E',\n') from (select * from public.%I order by %s offset %s limit %s) t$q$,
                 vals, p_table, coalesce(pk, '1'), greatest(p_offset, 0), p_limit)
    into body;
  if body is null then return ''; end if;
  return format(E'insert into public.%I (%s) overriding system value values\n%s\non conflict do nothing;\n', p_table, cols, body);
end $$;

create or replace function public.log_backup_download(p_details jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare actor text := public.backup_admin();
begin
  if actor is null then raise exception 'Only an administrator can download a backup'; end if;
  insert into audit_logs (actor, action, entity_type, entity_id, details)
  values (actor, 'DOWNLOAD_BACKUP', 'database', null, coalesce(p_details, '{}'::jsonb));
end $$;

revoke all on function public.backup_catalog() from public, anon;
revoke all on function public.backup_table_sql(text, integer, integer) from public, anon;
revoke all on function public.log_backup_download(jsonb) from public, anon;
grant execute on function public.backup_catalog() to authenticated;
grant execute on function public.backup_table_sql(text, integer, integer) to authenticated;
grant execute on function public.log_backup_download(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
