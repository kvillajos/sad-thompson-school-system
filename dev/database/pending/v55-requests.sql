-- Assigned student portal request workflow.
-- Version 55 follows the existing v51 through v54 migrations.
BEGIN;

ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_request_type_check;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_request_type_check
  CHECK (
    request_type IN (
      'grade_correction',
      'withdrawal',
      'promotion',
      'account_action',
      'override',
      'student_profile',
      'student_portal_request'
    )
  );

CREATE OR REPLACE FUNCTION public.submit_student_portal_request(
  p_category text,
  p_details text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor record;
  student_key integer;
  student_name text;
  category text := lower(trim(coalesce(p_category, '')));
  details text := trim(coalesce(p_details, ''));
  category_label text;
  request_id integer;
BEGIN
  SELECT * INTO actor FROM public.approval_actor(4);

  SELECT u.student_id
  INTO student_key
  FROM public.users u
  WHERE u.user_id = actor.uid;

  IF student_key IS NULL THEN
    RAISE EXCEPTION 'No student record is linked to this account';
  END IF;

  category_label := CASE category
    WHEN 'lrn_update' THEN 'LRN update'
    WHEN 'account_fix' THEN 'Account fix'
    WHEN 'section_transfer' THEN 'Section transfer'
    ELSE NULL
  END;

  IF category_label IS NULL THEN
    RAISE EXCEPTION 'Choose a valid request type';
  END IF;
  IF details = '' THEN
    RAISE EXCEPTION 'Describe the requested change';
  END IF;
  IF length(details) > 1000 THEN
    RAISE EXCEPTION 'Request details must be 1000 characters or fewer';
  END IF;

  SELECT concat_ws(' ', s.first_name, s.last_name)
  INTO student_name
  FROM public.students s
  WHERE s.student_id = student_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The linked student record could not be found';
  END IF;

  INSERT INTO public.approval_requests (
    request_type,
    payload,
    summary,
    reason,
    requested_by,
    requester_name
  )
  VALUES (
    'student_portal_request',
    jsonb_build_object(
      'student_id', student_key,
      'category', category,
      'details', details
    ),
    format('%s request - %s', category_label, student_name),
    details,
    actor.uid,
    actor.uname
  )
  RETURNING id INTO request_id;

  RETURN jsonb_build_object('request_id', request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_student_portal_request(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_portal_request(text, text)
  TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'approval_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.approval_requests;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
