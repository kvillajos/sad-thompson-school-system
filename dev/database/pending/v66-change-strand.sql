-- v66-change-strand.sql  (branch UIPolishPass)
-- change_student_strand: the registrar corrects a Senior High student's strand. A student who is already in a
-- section must be moved to a section of the new strand in the same call, so they are never left in a section of
-- another strand (placement_guard) or half-moved. Unsectioned students just get the new strand.
-- Safe to run twice.
begin;

create or replace function public.change_student_strand(p_student_id integer, p_strand text, p_section_id integer default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor text; s students%rowtype; current_section integer; target sections%rowtype;
begin
  actor := registrar_workflow_actor(2);
  if nullif(trim(p_reason), '') is null then raise exception 'Give a reason for changing the strand'; end if;
  select * into s from students where student_id = p_student_id for update;
  if not found then raise exception 'Student not found'; end if;
  if s.grade_level not in (11, 12) then raise exception 'Only Grade 11-12 students have a strand'; end if;
  if not exists (select 1 from strands where code = p_strand) then raise exception 'Choose a strand'; end if;
  if s.strand is not distinct from p_strand then raise exception 'This student is already %', p_strand; end if;

  select e.section_id into current_section from enrollments e
    where e.student_id = p_student_id and e.status = 'active' and e.section_id is not null
    order by e.id desc limit 1;
  if current_section is not null and p_section_id is null then
    raise exception 'This student is in a section; choose a % section to move them to', p_strand;
  end if;
  if p_section_id is not null then
    select * into target from sections where section_id = p_section_id;
    if not found then raise exception 'Section not found'; end if;
    if target.strand is distinct from p_strand then raise exception '% is not a % section', target.section_name, p_strand; end if;
  end if;

  update students set strand = p_strand where student_id = p_student_id;
  -- Same placement path as Placement Tool: grade, capacity, closed-section and strand checks all apply.
  if p_section_id is not null then
    perform apply_section_assignments(jsonb_build_array(jsonb_build_object('student_id', p_student_id, 'section_id', p_section_id)));
  end if;

  insert into audit_logs(action, entity_type, entity_id, details)
  values ('CHANGE_STRAND', 'student', p_student_id, jsonb_build_object(
    'from', s.strand, 'to', p_strand, 'from_section', current_section, 'to_section', p_section_id,
    'reason', trim(p_reason), 'by', actor));
  return jsonb_build_object('strand', p_strand, 'section_id', p_section_id);
end $$;

revoke all on function public.change_student_strand(integer, text, integer, text) from public, anon;
grant execute on function public.change_student_strand(integer, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
commit;
