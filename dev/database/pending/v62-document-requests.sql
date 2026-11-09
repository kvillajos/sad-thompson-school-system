-- v62-document-requests.sql  (branch SchoolYearLifecycle)
-- Document requests: a student (graduates included) asks for a Form 137, Good Moral certificate or Certificate
-- of Enrollment; the registrar moves it Pending -> Approved / Rejected -> Ready for pickup -> Released.
-- Writes go through two functions only (no direct insert/update), and each status change notifies the student.
-- Safe to run twice.
begin;

create table if not exists public.document_requests (
  id            serial primary key,
  student_id    integer not null references public.students(student_id) on delete cascade,
  document_type text not null check (document_type in ('form_137', 'good_moral', 'coe')),
  purpose       text not null check (length(trim(purpose)) between 1 and 300),
  copies        smallint not null default 1 check (copies between 1 and 5),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'ready', 'released')),
  remarks       text check (remarks is null or length(remarks) <= 500),
  requested_by  integer references public.users(user_id) on delete set null,
  processed_by  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  released_at   timestamptz
);
create index if not exists idx_document_requests_student on public.document_requests(student_id);
create index if not exists idx_document_requests_status on public.document_requests(status);

select public.attach_change_tracking('document_requests');

create or replace function public.document_type_label(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'form_137' then 'Form 137 (SF10)'
    when 'good_moral' then 'Good Moral Certificate'
    when 'coe' then 'Certificate of Enrollment'
    else p_type end;
$$;

create or replace function public.submit_document_request(p_document_type text, p_purpose text, p_copies integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare me record; rid integer;
begin
  select user_id, student_id into me from users
    where lower(email) = lower(auth.jwt() ->> 'email') and is_active and role_id = 4 limit 1;
  if me.student_id is null then raise exception 'Only a student account can request documents'; end if;
  if p_document_type not in ('form_137', 'good_moral', 'coe') then raise exception 'Choose a document'; end if;
  if nullif(trim(p_purpose), '') is null then raise exception 'Say what the document is for'; end if;
  if length(p_purpose) > 300 then raise exception 'The purpose must be 300 characters or fewer'; end if;
  if coalesce(p_copies, 0) not between 1 and 5 then raise exception 'Request 1 to 5 copies'; end if;
  if exists (select 1 from document_requests where student_id = me.student_id and document_type = p_document_type
             and status in ('pending', 'approved', 'ready')) then
    raise exception 'You already have an open request for this document';
  end if;
  insert into document_requests (student_id, document_type, purpose, copies, requested_by)
  values (me.student_id, p_document_type, trim(p_purpose), p_copies, me.user_id)
  returning id into rid;
  return jsonb_build_object('id', rid);
end $$;

-- Registrar (or admin) moves a request one step: pending -> approved | rejected, approved -> ready | rejected,
-- ready -> released. Rejecting needs remarks.
create or replace function public.set_document_request_status(p_id integer, p_status text, p_remarks text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor text; r document_requests%rowtype; student_user record; message text;
begin
  select username into actor from users
    where lower(email) = lower(auth.jwt() ->> 'email') and is_active and role_id in (1, 2) limit 1;
  if actor is null then raise exception 'Not authorized to process document requests'; end if;
  select * into r from document_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not ((r.status = 'pending' and p_status in ('approved', 'rejected'))
       or (r.status = 'approved' and p_status in ('ready', 'rejected'))
       or (r.status = 'ready' and p_status = 'released')) then
    raise exception 'A % request cannot be marked %', r.status, p_status;
  end if;
  if p_status = 'rejected' and nullif(trim(p_remarks), '') is null then raise exception 'Give a reason for rejecting'; end if;
  if length(coalesce(p_remarks, '')) > 500 then raise exception 'Remarks must be 500 characters or fewer'; end if;

  update document_requests
     set status = p_status, remarks = coalesce(nullif(trim(p_remarks), ''), remarks), processed_by = actor,
         updated_at = now(), released_at = case when p_status = 'released' then now() else released_at end
   where id = p_id;

  message := document_type_label(r.document_type) || case p_status
    when 'approved' then ' request approved. We will tell you when it is ready.'
    when 'rejected' then ' request was not approved: ' || trim(p_remarks)
    when 'ready' then ' is ready for pickup at the Registrar''s Office.'
    else ' was released. Thank you.' end;
  select user_id, email into student_user from users where student_id = r.student_id and role_id = 4 limit 1;
  if student_user.user_id is not null then
    insert into notifications (recipient_email, recipient_user_id, title, message, entity_type, entity_id)
    values (student_user.email, student_user.user_id, 'Document request update', message, 'document_request', r.id);
  end if;
  return jsonb_build_object('id', p_id, 'status', p_status);
end $$;

revoke all on function public.submit_document_request(text, text, integer) from public, anon;
revoke all on function public.set_document_request_status(integer, text, text) from public, anon;
grant execute on function public.submit_document_request(text, text, integer) to authenticated;
grant execute on function public.set_document_request_status(integer, text, text) to authenticated;

alter table public.document_requests enable row level security;
drop policy if exists document_requests_read on public.document_requests;
create policy document_requests_read on public.document_requests for select to authenticated using (
  (select current_app_role()) = any (array[1, 2])
  or ((select current_app_role()) = 3 and public.adviser_of_student(student_id))
  or exists (select 1 from public.users u
             where lower(u.email) = lower(auth.jwt() ->> 'email') and u.is_active and u.student_id = document_requests.student_id)
);
grant select on public.document_requests to authenticated;

notify pgrst, 'reload schema';
commit;
