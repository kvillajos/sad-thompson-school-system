-- v73-username-accents.sql  (branch main)
-- generate_username() dropped every letter outside a-z, so "Juan Peña" became "jpea". Accented letters are now
-- converted to plain ones first (ñ -> n, á -> a, ü -> u, ...), so he gets "jpena". Usernames stay plain a-z because
-- they are also the login email (username@tcs.edu.ph). Existing usernames do not change. Same callers as before:
-- review_admission_application(), bulk import and the provision-account Edge Function.
-- Safe to run twice.
begin;

create or replace function public.generate_username(p_first_name text, p_last_name text)
 returns text language plpgsql stable as $function$
declare initials text; surname text; base text; candidate text; suffix int := 0;
  accents constant text := 'ñÑáéíóúüÁÉÍÓÚÜàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛäëïöÄËÏÖçÇ';
  plain   constant text := 'nNaeiouuAEIOUUaeiouAEIOUaeiouAEIOUaeioAEIOcC';
begin
  initials := lower(regexp_replace(translate(coalesce(p_first_name, ''), accents, plain), '[^a-zA-Z ]', '', 'g'));
  initials := (select string_agg(left(part, 1), '') from unnest(string_to_array(trim(initials), ' ')) part where part <> '');
  surname := lower(regexp_replace(translate(coalesce(p_last_name, ''), accents, plain), '[^a-zA-Z]', '', 'g'));
  base := coalesce(initials, '') || surname;
  if nullif(base, '') is null then base := 'student'; end if;
  candidate := base;
  while exists (select 1 from users where lower(username) = candidate) loop
    suffix := suffix + 1;
    candidate := base || suffix::text;
  end loop;
  return candidate;
end $function$;

notify pgrst, 'reload schema';
commit;
-- Check: select generate_username('Juan', 'Peña');  -- jpena
