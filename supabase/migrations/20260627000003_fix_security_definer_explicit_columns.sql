-- Fix: replace SELECT * with an explicit column list in get_instructor_lessons.
-- SELECT * silently exposes any future column added to lessons to the anon role.
-- Pinning the list makes the access contract explicit and requires deliberate review
-- when S-02 adds new lesson fields that should (or should not) be instructor-visible.
-- Also re-applies SET search_path = public (supersedes migration 20260627000002).
CREATE OR REPLACE FUNCTION get_instructor_lessons(p_token uuid)
RETURNS SETOF lessons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor_id uuid;
BEGIN
  SELECT id INTO v_instructor_id
  FROM instructors
  WHERE token = p_token;

  IF v_instructor_id IS NULL THEN
    RETURN; -- empty set for unknown or invalid tokens
  END IF;

  RETURN QUERY
  SELECT
    id,
    instructor_id,
    student_id,
    category,
    scheduled_at,
    status,
    rejection_reason,
    created_at
  FROM lessons
  WHERE instructor_id = v_instructor_id;
END;
$$;
