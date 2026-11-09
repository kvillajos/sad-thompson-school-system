-- v61-student-sanctions.sql  (branch SchoolYearLifecycle)
-- Discipline and sanctions records. Replaces Sam's unapplied v50-sanctions.sql (same idea, now with a school
-- year, RLS and an audit trail).
--   admin, registrar: read and write every record (only they may delete)
--   adviser (faculty): read and write records for students in their advisory section (v60 helpers)
--   student: read their own records
-- Safe to run twice.
begin;

create table if not exists public.student_sanctions (
  sanction_id      serial primary key,
  student_id       integer not null references public.students(student_id) on delete cascade,
  school_year      text not null default public.current_school_year(),
  incident_date    date not null default current_date,
  violation_type   text not null check (length(trim(violation_type)) between 1 and 120),
  description      text not null check (length(trim(description)) between 1 and 1000),
  sanction_type    text not null check (length(trim(sanction_type)) between 1 and 120),
  sanction_details text check (sanction_details is null or length(sanction_details) <= 1000),
  status           text not null default 'active' check (status in ('active', 'resolved', 'dismissed')),
  issued_by        integer references public.users(user_id) on delete set null,
  issued_by_name   text,
  resolution_notes text check (resolution_notes is null or length(resolution_notes) <= 1000),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_student_sanctions_student on public.student_sanctions(student_id);
create index if not exists idx_student_sanctions_year on public.student_sanctions(school_year);

select public.link_school_year_column('student_sanctions');
select public.attach_change_tracking('student_sanctions', 'sanction_id');

-- Who filed it comes from the session, not the client; resolved_at follows the status.
create or replace function public.student_sanctions_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare me record;
begin
  select user_id, username::text as username into me from users
    where lower(email) = lower(auth.jwt() ->> 'email') and is_active limit 1;
  if tg_op = 'INSERT' then
    new.issued_by := me.user_id;
    new.issued_by_name := coalesce(me.username, 'system');
    new.created_at := now();
  else
    new.issued_by := old.issued_by;
    new.issued_by_name := old.issued_by_name;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.resolved_at := case when new.status = 'active' then null else coalesce(old.resolved_at, now()) end;
  return new;
end $$;
drop trigger if exists trg_student_sanctions_stamp on public.student_sanctions;
create trigger trg_student_sanctions_stamp before insert or update on public.student_sanctions
  for each row execute function public.student_sanctions_stamp();

alter table public.student_sanctions enable row level security;

drop policy if exists sanctions_read on public.student_sanctions;
create policy sanctions_read on public.student_sanctions for select to authenticated using (
  (select current_app_role()) = any (array[1, 2])
  or ((select current_app_role()) = 3 and public.adviser_of_student(student_id))
  or exists (select 1 from public.users u
             where lower(u.email) = lower(auth.jwt() ->> 'email') and u.is_active and u.student_id = student_sanctions.student_id)
);
drop policy if exists sanctions_insert on public.student_sanctions;
create policy sanctions_insert on public.student_sanctions for insert to authenticated with check (
  (select current_app_role()) = any (array[1, 2])
  or ((select current_app_role()) = 3 and public.adviser_of_student(student_id))
);
drop policy if exists sanctions_update on public.student_sanctions;
create policy sanctions_update on public.student_sanctions for update to authenticated
  using ((select current_app_role()) = any (array[1, 2]) or ((select current_app_role()) = 3 and public.adviser_of_student(student_id)))
  with check ((select current_app_role()) = any (array[1, 2]) or ((select current_app_role()) = 3 and public.adviser_of_student(student_id)));
drop policy if exists sanctions_delete on public.student_sanctions;
create policy sanctions_delete on public.student_sanctions for delete to authenticated
  using ((select current_app_role()) = any (array[1, 2]));

grant select, insert, update, delete on public.student_sanctions to authenticated;
grant usage on sequence public.student_sanctions_sanction_id_seq to authenticated;

notify pgrst, 'reload schema';
commit;
