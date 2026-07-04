-- Token-gated read/write RPCs for the unauthenticated instructor-response flow.
-- Mirrors the existing get_instructor_lessons SECURITY DEFINER pattern: explicit
-- column list, pinned search_path, explicit anon grant — no permissive RLS policy.
CREATE OR REPLACE FUNCTION get_lesson_by_token(p_token uuid)
RETURNS SETOF lessons
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, instructor_id, student_id, category, scheduled_at, status, rejection_reason,
         created_at, token
  FROM lessons
  WHERE token = p_token;
$$;

-- Records an approve/reject decision and invalidates the token in the same statement —
-- the status write and the token nulling must never be observable as two separate steps.
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
  SET status = p_decision::lesson_status, rejection_reason = p_reason, token = NULL
  WHERE id = v_lesson_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION get_lesson_by_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION respond_to_lesson(uuid, text, text) TO anon;
