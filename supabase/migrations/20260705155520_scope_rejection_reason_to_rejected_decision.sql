-- respond_to_lesson previously set rejection_reason from p_reason unconditionally, even when
-- p_decision = 'confirmed'. Since this function is GRANT EXECUTE ... TO anon (directly callable
-- by anyone holding a valid token, bypassing the app's UI), a confirmed lesson could end up with
-- a stray rejection_reason — a domain state the schema shouldn't allow. Scope it to 'rejected'.
CREATE OR REPLACE FUNCTION respond_to_lesson(p_token uuid, p_decision text, p_reason text DEFAULT NULL)
RETURNS TABLE(ok boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson_id uuid;
BEGIN
  IF p_decision NOT IN ('confirmed', 'rejected') THEN
    RETURN QUERY SELECT false, 'Invalid decision'; RETURN;
  END IF;

  SELECT id INTO v_lesson_id FROM lessons
  WHERE token = p_token AND status = 'pending'
  FOR UPDATE;

  IF v_lesson_id IS NULL THEN
    RETURN QUERY SELECT false, 'Link is no longer valid'; RETURN;
  END IF;

  UPDATE lessons
  SET status = p_decision::lesson_status,
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_reason ELSE NULL END,
      token = NULL
  WHERE id = v_lesson_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;
