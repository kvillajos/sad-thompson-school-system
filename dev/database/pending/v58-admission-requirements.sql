-- v58-admission-requirements.sql  (branch SchoolYearLifecycle)
-- Requirements checklist for admission applications.
--   requirement_types        the admin-editable list (seeded with the DepEd standard set). A code that matches an
--                            upload's application_documents.document_type is ticked by that upload automatically.
--   application_requirements items the registrar marks as received (e.g. paper copies handed in).
--   admission_applications.admission_type  'new' or 'transferee' (null: Grade 7 and 11 count as new).
-- Approving an application is refused while a required item is missing, unless the admin approved a
-- 'requirements_override' request for it (filed with request_requirements_override, reviewed in Pending Approvals).
-- Safe to run twice.
begin;

create table if not exists public.requirement_types (
  id              serial unique,
  code            text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  label           text not null check (length(trim(label)) between 1 and 120),
  grade_levels    integer[],                       -- null = every grade
  transferee_only boolean not null default false,
  required        boolean not null default true,
  sort_order      smallint not null default 0,
  is_active       boolean not null default true
);

insert into public.requirement_types (code, label, grade_levels, transferee_only, sort_order) values
  ('birth_certificate', 'PSA birth certificate', null, false, 1),
  ('report_card', 'Form 138 (report card)', null, false, 2),
  ('good_moral', 'Good moral certificate', null, false, 3),
  ('form_137', 'Form 137 / SF10 (permanent record)', null, true, 4),
  ('jhs_completion', 'Junior High completion certificate', '{11,12}', false, 5)
on conflict (code) do nothing;

alter table public.admission_applications add column if not exists admission_type text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admission_applications_admission_type_check') then
    alter table public.admission_applications add constraint admission_applications_admission_type_check
      check (admission_type is null or admission_type in ('new', 'transferee'));
  end if;
end $$;

create table if not exists public.application_requirements (
  id             serial unique,
  application_id integer not null references public.admission_applications(id) on delete cascade,
  code           text not null references public.requirement_types(code) on update cascade on delete cascade,
  received_at    timestamptz not null default now(),
  received_by    text default (auth.jwt() ->> 'email'),
  note           text check (note is null or length(note) <= 200),
  primary key (application_id, code)
);

-- Labels of the required items an application is still missing (same rule as shared/lib/requirements.js).
create or replace function public.application_missing_requirements(p_application_id integer)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(rt.label order by rt.sort_order, rt.label), '{}')
  from public.admission_applications a
  cross join lateral (select substring(a.grade_level from '\d+')::integer as grade) g
  join public.requirement_types rt
    on rt.is_active and rt.required
   and (rt.grade_levels is null or g.grade = any (rt.grade_levels))
   and (not rt.transferee_only
        or coalesce(a.admission_type, case when g.grade in (7, 11) then 'new' else 'transferee' end) = 'transferee')
  where a.id = p_application_id
    and not exists (select 1 from public.application_requirements r where r.application_id = a.id and r.code = rt.code)
    and not exists (select 1 from public.application_documents d where d.application_id = a.id and d.document_type = rt.code);
$$;
grant execute on function public.application_missing_requirements(integer) to authenticated;

create or replace function public.enforce_admission_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare missing text[];
begin
  if auth.uid() is null or new.status is distinct from 'approved' or old.status = 'approved' then
    return new;
  end if;
  missing := public.application_missing_requirements(new.id);
  if cardinality(missing) > 0 and not exists (
    select 1 from public.approval_requests
    where request_type = 'requirements_override' and status = 'approved' and (payload ->> 'application_id')::integer = new.id
  ) then
    raise exception 'Missing requirements: %. Mark them received, or have the registrar request a requirements override.',
      array_to_string(missing, ', ') using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_admission_requirements on public.admission_applications;
create trigger trg_admission_requirements before update of status on public.admission_applications
  for each row execute function public.enforce_admission_requirements();

-- New approval request type (keeps every type v55 allows).
alter table public.approval_requests drop constraint if exists approval_requests_request_type_check;
alter table public.approval_requests add constraint approval_requests_request_type_check check (
  request_type in ('grade_correction', 'withdrawal', 'promotion', 'account_action', 'override', 'student_profile',
                   'student_portal_request', 'requirements_override')
);

create or replace function public.request_requirements_override(p_application_id integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor record; app public.admission_applications%rowtype; missing text[]; rid integer;
begin
  select user_id as uid, username::text as uname into actor from public.users
    where lower(email) = lower(auth.jwt() ->> 'email') and is_active and role_id in (1, 2) limit 1;
  if actor.uid is null then raise exception 'Not authorized for this request'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'A reason is required'; end if;
  if length(p_reason) > 500 then raise exception 'The reason must be 500 characters or fewer'; end if;
  select * into app from public.admission_applications where id = p_application_id;
  if not found then raise exception 'Application not found'; end if;
  if app.status not in ('submitted', 'under_review') then raise exception 'This application is no longer pending'; end if;
  missing := public.application_missing_requirements(p_application_id);
  if cardinality(missing) = 0 then raise exception 'Nothing is missing, so no override is needed'; end if;
  if exists (select 1 from public.approval_requests where request_type = 'requirements_override'
             and status in ('pending', 'approved') and (payload ->> 'application_id')::integer = p_application_id) then
    raise exception 'This application already has a requirements override request';
  end if;
  insert into public.approval_requests (request_type, payload, summary, reason, requested_by, requester_name)
  values ('requirements_override',
    jsonb_build_object('application_id', p_application_id, 'missing', to_jsonb(missing)),
    format('Requirements override: %s %s (missing %s)', app.first_name, app.last_name, array_to_string(missing, ', ')),
    trim(p_reason), actor.uid, actor.uname)
  returning id into rid;
  return jsonb_build_object('request_id', rid);
end $$;
revoke all on function public.request_requirements_override(integer, text) from public, anon;
grant execute on function public.request_requirements_override(integer, text) to authenticated;

alter table public.requirement_types enable row level security;
alter table public.application_requirements enable row level security;

drop policy if exists requirement_types_read on public.requirement_types;
create policy requirement_types_read on public.requirement_types for select to authenticated
  using ((select current_app_role()) = any (array[1, 2]));
drop policy if exists requirement_types_admin on public.requirement_types;
create policy requirement_types_admin on public.requirement_types for all to authenticated
  using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);

drop policy if exists application_requirements_staff on public.application_requirements;
create policy application_requirements_staff on public.application_requirements for all to authenticated
  using ((select current_app_role()) = any (array[1, 2])) with check ((select current_app_role()) = any (array[1, 2]));

grant select, insert, update, delete on public.requirement_types, public.application_requirements to authenticated;
grant usage on sequence public.requirement_types_id_seq, public.application_requirements_id_seq to authenticated;

select public.attach_change_tracking('requirement_types');
select public.attach_change_tracking('application_requirements');

notify pgrst, 'reload schema';
commit;
