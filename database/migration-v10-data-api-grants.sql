-- Supabase stops auto-granting Data API access to new public tables on 2026-10-30.
-- Run AFTER backupsqlmigration.sql. Safe to re-run (grants are idempotent).
-- Row access is still enforced by RLS (enabled on every table); anon gets no table
-- access because no policy targets it and login goes through the find_login_email RPC.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Future tables/sequences created by migrations get the same grants automatically.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
