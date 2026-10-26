-- TCSMS v51: only administrators and registrars may change profile photos.
-- PostgreSQL client roles are shared by every app role, so revoke the student-facing RPC
-- from all Data API roles and expose one role-checked staff update entry point.
begin;

revoke execute on function public.update_own_profile_picture(text) from public, anon, authenticated;

create or replace function public.staff_update_profile_picture(p_user_id integer, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_student_id integer;
  expected_path text;
begin
  if coalesce(current_app_role(), 0) not in (1, 2) then
    raise exception 'Only administrators and registrars may change profile pictures';
  end if;

  select student_id into target_student_id
  from users
  where user_id = p_user_id;
  if not found then raise exception 'Account not found'; end if;

  if target_student_id is not null then
    expected_path := '/storage/v1/object/public/profile-pictures/' || target_student_id::text || '/';
    if p_url is not null and position(expected_path in p_url) = 0 then
      raise exception 'Profile picture must belong to the target account';
    end if;
    update students set profile_picture_url = p_url where student_id = target_student_id;
  else
    expected_path := '/storage/v1/object/public/profile-pictures/users/' || p_user_id::text || '/';
    if p_url is not null and position(expected_path in p_url) = 0 then
      raise exception 'Profile picture must belong to the target account';
    end if;
    update users set profile_picture_url = p_url where user_id = p_user_id;
  end if;
end $$;
revoke all on function public.staff_update_profile_picture(integer, text) from public, anon;
grant execute on function public.staff_update_profile_picture(integer, text) to authenticated;

drop policy if exists profile_pictures_upload on storage.objects;
create policy profile_pictures_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-pictures'
    and (select current_app_role()) in (1, 2)
  );

drop policy if exists profile_pictures_update on storage.objects;
create policy profile_pictures_update on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (select current_app_role()) in (1, 2)
  )
  with check (
    bucket_id = 'profile-pictures'
    and (select current_app_role()) in (1, 2)
  );

notify pgrst, 'reload schema';
commit;
