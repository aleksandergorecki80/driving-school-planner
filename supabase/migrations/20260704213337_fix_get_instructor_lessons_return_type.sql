-- Phase 1 (instructor-responds) widened the `lessons` composite type by adding a `token`
-- column. get_instructor_lessons's `RETURNS SETOF lessons` now expects 9 columns, but its
-- RETURN QUERY still selects only the original 8 — this broke at runtime (SQLSTATE 42804).
-- This function is retired entirely in the next migration set (Phase 2 of instructor-responds);
-- this is a minimal compatibility fix for the transition window, not a redesign: pin the return
-- type to an explicit TABLE(...) shape matching its historical columns, decoupled from lessons'
-- evolving column list, and never exposing the new per-lesson token through this old RPC.
DROP FUNCTION IF EXISTS get_instructor_lessons(uuid);

CREATE FUNCTION get_instructor_lessons(p_token uuid)
RETURNS TABLE(
  id uuid,
  instructor_id uuid,
  student_id uuid,
  category text,
  scheduled_at timestamptz,
  status lesson_status,
  rejection_reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor_id uuid;
BEGIN
  SELECT instructors.id INTO v_instructor_id
  FROM instructors
  WHERE instructors.token = p_token;

  IF v_instructor_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lessons.id,
    lessons.instructor_id,
    lessons.student_id,
    lessons.category,
    lessons.scheduled_at,
    lessons.status,
    lessons.rejection_reason,
    lessons.created_at
  FROM lessons
  WHERE lessons.instructor_id = v_instructor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_instructor_lessons(uuid) TO anon;
