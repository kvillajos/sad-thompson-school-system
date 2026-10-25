
begin;

create table if not exists public.school_days (
  school_year text not null,
  month integer not null check (month between 1 and 12),
  days integer not null check (days between 0 and 31),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (school_year, month)
);

alter table public.school_days enable row level security;

revoke all on public.school_days from anon;

drop policy if exists school_days_read on public.school_days;
create policy school_days_read
  on public.school_days
  for select
  to authenticated
  using ((select current_app_role()) in (1, 2, 3, 4));

drop policy if exists school_days_admin on public.school_days;
create policy school_days_admin
  on public.school_days
  for all
  to authenticated
  using ((select current_app_role()) = 1)
  with check ((select current_app_role()) = 1);

notify pgrst, 'reload schema';

commit;
