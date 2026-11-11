-- v64-year-end-scope.sql  (branch SchoolYearLifecycle)
-- Year-end checklist follow-up to v63:
--   1. Section shift requests count only shifts out of the year's own sections.
--      Approvals, admissions and document requests have no school year column, so they stay system-wide;
--      their detail text now says so instead of reading as if they belonged to the year.
--   2. close_school_year refuses a year that has not started yet.
-- Safe to run twice.
begin;

create or replace function public.year_end_checklist(p_label text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  next_label text := (split_part(p_label, '-', 1)::int + 1) || '-' || (split_part(p_label, '-', 2)::int + 1);
  grades_missing integer; classes_missing integer; not_promoted integer;
  approvals integer; admissions integer; documents integer; shifts integer;
begin
  if coalesce(current_app_role(), 0) not in (1, 2) then raise exception 'Not authorized'; end if;

  -- Every enrolled student of every class (section + subject) needs a submitted (locked) final grade.
  with classes as (
    select distinct ss.section_id, sub.subject_name
    from subject_schedules ss
    join sections s on s.section_id = ss.section_id and s.academic_year = p_label
    join subjects sub on sub.subject_id = ss.subject_id
  ), missing as (
    select c.section_id, c.subject_name
    from classes c
    join enrollments e on e.section_id = c.section_id and e.school_year = p_label and e.status in ('active', 'completed')
    where not exists (
      select 1 from academic_history ah
      where ah.student_id = e.student_id and ah.school_year = p_label and ah.subject = c.subject_name
        and ah.locked and coalesce(ah.final, ah.grade) is not null
    )
  )
  select count(*), count(distinct (section_id, subject_name)) into grades_missing, classes_missing from missing;

  -- Promotion is logged under the next school year (batch_promote_students); a promoted student's enrollment
  -- turns 'completed', so anyone still 'active' without a log has not been through promotion.
  select count(*) into not_promoted from enrollments e
  where e.school_year = p_label and e.status = 'active'
    and not exists (select 1 from promotion_logs pl where pl.student_id = e.student_id and pl.school_year = next_label);

  select count(*) into approvals from approval_requests where status = 'pending';
  select count(*) into admissions from admission_applications where status in ('submitted', 'under_review');
  select count(*) into documents from document_requests where status in ('pending', 'approved', 'ready');
  select count(*) into shifts from shift_requests sr
    join sections s on s.section_id = sr.from_section_id and s.academic_year = p_label
    where sr.status = 'pending';

  return jsonb_build_array(
    jsonb_build_object('key', 'grades', 'label', 'All grades submitted', 'count', grades_missing,
      'detail', format('%s student grade(s) in %s class(es) not submitted', grades_missing, classes_missing)),
    jsonb_build_object('key', 'promotion', 'label', 'Promotion done', 'count', not_promoted,
      'detail', format('%s enrolled student(s) not yet promoted, retained or graduated', not_promoted)),
    jsonb_build_object('key', 'approvals', 'label', 'Pending approvals handled', 'count', approvals,
      'detail', format('%s request(s) waiting in Pending Approvals (all school years)', approvals)),
    jsonb_build_object('key', 'admissions', 'label', 'Applications decided', 'count', admissions,
      'detail', format('%s admission application(s) not yet approved or declined (all school years)', admissions)),
    jsonb_build_object('key', 'documents', 'label', 'Document requests finished', 'count', documents,
      'detail', format('%s document request(s) not yet released or rejected (all school years)', documents)),
    jsonb_build_object('key', 'shifts', 'label', 'Section shift requests handled', 'count', shifts,
      'detail', format('%s shift request(s) pending', shifts))
  );
end $$;

create or replace function public.close_school_year(p_label text, p_override_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor text; open_items text; starts date;
begin
  select username into actor from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active and role_id = 1 limit 1;
  if actor is null then raise exception 'Only the admin can close a school year'; end if;
  select start_date into starts from school_years where label = p_label;
  if not found then raise exception 'School year % does not exist', p_label; end if;
  if starts > (now() at time zone 'Asia/Manila')::date then
    raise exception '% has not started yet (it starts %). Only a year that has started can be closed.', p_label, starts;
  end if;
  if exists (select 1 from school_years where label = p_label and closed_at is not null) then raise exception '% is already closed', p_label; end if;
  select string_agg(item ->> 'detail', '; ') into open_items
    from jsonb_array_elements(year_end_checklist(p_label)) item where (item ->> 'count')::int > 0;
  if open_items is not null and nullif(trim(p_override_reason), '') is null then
    raise exception 'The year-end checklist is not complete: %. Finish it, or close anyway with a reason.', open_items;
  end if;
  if length(coalesce(p_override_reason, '')) > 500 then raise exception 'The reason must be 500 characters or fewer'; end if;

  perform set_config('app.closing_year', 'on', true);
  update school_years
     set closed_at = now(), closed_by = actor, enrollment_open = false,
         close_reason = case when open_items is null then null else trim(p_override_reason) end
   where label = p_label;
  insert into audit_logs (action, entity_type, entity_id, details)
  values ('CLOSE_SCHOOL_YEAR', 'school_year', null,
    jsonb_build_object('school_year', p_label, 'override_reason', p_override_reason, 'open_items', open_items, 'actor', actor));
  return jsonb_build_object('closed', p_label, 'overridden', open_items is not null);
end $$;

grant execute on function public.year_end_checklist(text) to authenticated;
grant execute on function public.close_school_year(text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
