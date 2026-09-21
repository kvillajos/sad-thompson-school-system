-- TCSMS security hardening delta.
-- Run after database/backupsqlmigration.sql.
-- This file contains the security changes folded into backupsqlmigration.sql:
-- ownership checks, scoped profile-picture storage policies, and trusted
-- search paths for SECURITY DEFINER functions.

-- ============================================================
-- 1. Harden SECURITY DEFINER search paths
-- ============================================================
alter function public.review_admission_application(integer, public.admission_status, text) set search_path = public;
alter function public.auto_place_student(integer, integer) set search_path = public;
alter function public.manual_place_student(integer, integer) set search_path = public;
alter function public.batch_promote_students(integer, text, integer[]) set search_path = public;
alter function public.shift_student(integer, integer, text) set search_path = public;
alter function public.current_app_role() set search_path = public;
alter function public.update_own_profile_picture(text) set search_path = public;
alter function public.transfer_student_out(integer, text) set search_path = public;
alter function public.registrar_workflow_actor(integer) set search_path = public;
alter function public.begin_application_edit(integer) set search_path = public;
alter function public.end_application_edit(integer, uuid) set search_path = public;
alter function public.renew_application_edit(integer, uuid) set search_path = public;
alter function public.save_application_edit(integer, uuid, jsonb) set search_path = public;
alter function public.apply_section_assignments(jsonb, text) set search_path = public;
alter function public.faculty_section_ids() set search_path = public;
alter function public.faculty_teaches_subject(integer) set search_path = public;
alter function public.faculty_teaches_student(integer) set search_path = public;
alter function public.save_faculty_grades(integer, text, jsonb) set search_path = public;
alter function public.save_attendance(integer, integer, date, jsonb) set search_path = public;
alter function public.attendance_totals(integer, text) set search_path = public;
alter function public.update_student_profile(integer, jsonb) set search_path = public;
alter function public.set_academic_lock(integer, text, boolean) set search_path = public;
alter function public.audit_promotion_log_insert() set search_path = public;
alter function public.audit_row_change() set search_path = public;
alter function public.archive_audit_logs(date) set search_path = public;
alter function public.update_own_profile(text) set search_path = public;

-- ============================================================
-- 2. Attendance totals: caller must own or be authorized for the student
-- ============================================================
create or replace function public.attendance_totals(p_student_id integer, p_school_year text default null)
returns jsonb language sql stable security definer set search_path = public as $$
	select jsonb_build_object(
		'present', coalesce(sum(case when a.status = 'Present' then 1 else 0 end), 0),
		'late', coalesce(sum(case when a.status = 'Late' then 1 else 0 end), 0),
		'absent', coalesce(sum(case when a.status = 'Absent' then 1 else 0 end), 0),
		'excused', coalesce(sum(case when a.status = 'Excused' then 1 else 0 end), 0),
		'total', count(a.*)
	)
	from attendance a
	left join sections s on s.section_id = a.section_id
	where a.student_id = p_student_id
		and (p_school_year is null or s.academic_year = p_school_year)
		and exists (
			select 1 from users u
			where lower(u.email) = lower(auth.jwt() ->> 'email')
				and u.is_active = true
				and (u.role_id in (1,2) or u.student_id = p_student_id or (u.role_id = 3 and faculty_teaches_student(p_student_id)))
		)
$$;

-- ============================================================
-- 3. Profile pictures: caller may only update their own URL
-- ============================================================
create or replace function public.update_own_profile_picture(p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare target_student_id integer; expected_path text;
begin
	select student_id into target_student_id
	from users
	where lower(email) = lower(auth.jwt() ->> 'email') and is_active = true;
	if target_student_id is null then raise exception 'No linked student record'; end if;
	expected_path := '/storage/v1/object/public/profile-pictures/' || target_student_id::text || '/';
	if coalesce(p_url, '') not like '%' || expected_path || '%' then
		raise exception 'Profile picture must belong to your account';
	end if;
	update students set profile_picture_url = p_url where student_id = target_student_id;
end $$;

create or replace function public.remove_own_profile_picture()
returns void language plpgsql security definer set search_path = public as $$
declare actor_id integer; target_student_id integer;
begin
	select user_id, student_id into actor_id, target_student_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active;
	if actor_id is null then raise exception 'Active account not found'; end if;
	update users set profile_picture_url = null where user_id = actor_id;
	if target_student_id is not null then update students set profile_picture_url = null where student_id = target_student_id; end if;
end $$;

-- ============================================================
-- 4. Profile-picture storage paths are role/owner scoped
-- ============================================================
drop policy if exists profile_pictures_read on storage.objects;
drop policy if exists profile_pictures_upload on storage.objects;
drop policy if exists profile_pictures_update on storage.objects;
create policy profile_pictures_read on storage.objects
	for select to public using (bucket_id = 'profile-pictures');
create policy profile_pictures_upload on storage.objects
	for insert to authenticated with check (
		bucket_id = 'profile-pictures'
		and (
			((select current_app_role()) in (1,2) and name like 'applications/%')
			or (name like 'users/' || (select user_id::text from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active) || '/%')
			or (name like (select student_id::text || '/%' from users where lower(email) = lower(auth.jwt() ->> 'email') and student_id is not null))
		)
	);
create policy profile_pictures_update on storage.objects
	for update to authenticated
	using (
		bucket_id = 'profile-pictures'
		and (
			((select current_app_role()) in (1,2) and name like 'applications/%')
			or (name like 'users/' || (select user_id::text from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active) || '/%')
			or (name like (select student_id::text || '/%' from users where lower(email) = lower(auth.jwt() ->> 'email') and student_id is not null))
		)
	)
	with check (
		bucket_id = 'profile-pictures'
		and (
			((select current_app_role()) in (1,2) and name like 'applications/%')
			or (name like 'users/' || (select user_id::text from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active) || '/%')
			or (name like (select student_id::text || '/%' from users where lower(email) = lower(auth.jwt() ->> 'email') and student_id is not null))
		)
	);

-- APP_ORIGIN is an Edge Function environment variable, not a SQL setting:
-- supabase secrets set APP_ORIGIN=https://your-production-domain.example

-- ============================================================
-- 5. Section rooms
-- ============================================================
alter table sections add column if not exists room text;

-- ============================================================
-- Profile change approval and user profile pictures
-- ============================================================
alter table users add column if not exists profile_picture_url text;
create table if not exists admins (
	admin_id bigint generated always as identity primary key,
	user_id bigint not null unique references users(user_id) on delete cascade,
	employee_code varchar not null unique,
	first_name varchar not null,
	middle_name varchar,
	last_name varchar not null,
	created_at timestamptz not null default now()
);
alter table admins add column if not exists middle_name varchar;
alter table admins enable row level security;
drop policy if exists admins_read_self_or_admin on admins;
create policy admins_read_self_or_admin on admins for select to authenticated
	using ((select current_app_role()) = 1 or user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active));
create table if not exists profile_change_requests (
	request_id bigserial primary key,
	user_id integer not null references users(user_id) on delete cascade,
	before_data jsonb not null,
	after_data jsonb not null,
	status text not null default 'pending' check (status in ('pending','approved','rejected')),
	reviewed_by integer references users(user_id),
	reviewed_at timestamptz,
	created_at timestamptz not null default now()
);
alter table profile_change_requests enable row level security;
drop policy if exists profile_change_requests_admin on profile_change_requests;
drop policy if exists profile_change_requests_self_insert on profile_change_requests;
create policy profile_change_requests_admin on profile_change_requests for all to authenticated
	using ((select current_app_role()) = 1) with check ((select current_app_role()) = 1);
create policy profile_change_requests_self_insert on profile_change_requests for insert to authenticated
	with check (user_id = (select user_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active));

create or replace function public.submit_profile_change(p_first_name text, p_middle_name text, p_last_name text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor users%rowtype; before_data jsonb; after_data jsonb; new_request_id bigint;
begin
	select * into actor from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active;
	if actor.user_id is null then raise exception 'Active account not found'; end if;
	if nullif(trim(p_first_name), '') is null or nullif(trim(p_last_name), '') is null then raise exception 'First and last name are required'; end if;
	if nullif(trim(p_email), '') is null then raise exception 'Email is required'; end if;
	if exists (select 1 from users where lower(email) = lower(trim(p_email)) and user_id <> actor.user_id) then raise exception 'That email is already in use'; end if;
	select jsonb_build_object('first_name', coalesce(ad.first_name, sp.first_name, st.first_name, ''), 'middle_name', coalesce(ad.middle_name, sp.middle_name, st.middle_name, ''), 'last_name', coalesce(ad.last_name, sp.last_name, st.last_name, ''), 'email', actor.email)
		into before_data from (select 1) x left join admins ad on ad.user_id = actor.user_id left join staff_profiles sp on sp.user_id = actor.user_id left join students st on st.student_id = actor.student_id;
	after_data := jsonb_build_object('first_name', trim(p_first_name), 'middle_name', coalesce(nullif(trim(p_middle_name), ''), ''), 'last_name', trim(p_last_name), 'email', lower(trim(p_email)));
	insert into profile_change_requests(user_id, before_data, after_data) values (actor.user_id, before_data, after_data) returning profile_change_requests.request_id into new_request_id;
	return jsonb_build_object('request_id', new_request_id);
end $$;

create or replace function public.update_own_profile_picture(p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare actor_id integer; target_student_id integer;
begin
	select user_id, student_id into actor_id, target_student_id from users where lower(email) = lower(auth.jwt() ->> 'email') and is_active;
	if actor_id is null then raise exception 'Active account not found'; end if;
	if coalesce(p_url, '') like '%/storage/v1/object/public/profile-pictures/users/' || actor_id::text || '/%' then
		update users set profile_picture_url = p_url where user_id = actor_id;
	elsif target_student_id is not null and coalesce(p_url, '') like '%/storage/v1/object/public/profile-pictures/' || target_student_id::text || '/%' then
		update students set profile_picture_url = p_url where student_id = target_student_id;
	else
		raise exception 'Profile picture must belong to your account';
	end if;
end $$;
