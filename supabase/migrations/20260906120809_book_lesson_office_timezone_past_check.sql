-- Fixes a confirmed live bug (context/changes/past-lesson-timezone-check/plan.md, 2026-09-05):
-- the past-scheduled-time check compared p_scheduled_at (a naive-local-wall-clock-time value
-- labeled UTC, per this app's convention — see src/lib/format-lesson-datetime.ts and
-- src/lib/office-time.ts) against the true UTC instant (now()), instead of against the office's
-- actual current wall-clock time. Poland is UTC+2 (CEST) in summer, so a lesson up to ~2 hours in
-- the past could slip through. Coupled to src/lib/office-time.ts's OFFICE_TIMEZONE constant — if
-- that ever changes, update the literal below too.
--
-- p_scheduled_at AT TIME ZONE 'UTC' strips the tz label back to the original naive digits (since
-- the value was constructed as if Warsaw wall-clock time were UTC); now() AT TIME ZONE
-- 'Europe/Warsaw' gives the current naive Warsaw wall-clock reading. Comparing the two naive
-- timestamps directly is correct and DST-aware.

CREATE OR REPLACE FUNCTION book_lesson(
  p_instructor_id uuid,
  p_student_id uuid,
  p_category text,
  p_scheduled_at timestamptz
)
RETURNS TABLE(ok boolean, error_code text, lesson_id uuid, token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor_categories text[];
  v_student_category text;
  v_lesson_id uuid;
  v_token uuid;
  v_constraint text;
BEGIN
  IF (p_scheduled_at AT TIME ZONE 'UTC') < (now() AT TIME ZONE 'Europe/Warsaw') THEN
    RETURN QUERY SELECT false, 'SCHEDULED_AT_IN_PAST', NULL::uuid, NULL::uuid; RETURN;
  END IF;

  SELECT categories INTO v_instructor_categories FROM instructors WHERE id = p_instructor_id;
  IF v_instructor_categories IS NULL THEN
    RETURN QUERY SELECT false, 'INSTRUCTOR_NOT_FOUND', NULL::uuid, NULL::uuid; RETURN;
  END IF;

  SELECT category INTO v_student_category FROM students WHERE id = p_student_id;
  IF v_student_category IS NULL THEN
    RETURN QUERY SELECT false, 'STUDENT_NOT_FOUND', NULL::uuid, NULL::uuid; RETURN;
  END IF;

  IF NOT (p_category = ANY(v_instructor_categories)) THEN
    RETURN QUERY SELECT false, 'INSTRUCTOR_CATEGORY_MISMATCH', NULL::uuid, NULL::uuid; RETURN;
  END IF;

  IF v_student_category != p_category THEN
    RETURN QUERY SELECT false, 'STUDENT_CATEGORY_MISMATCH', NULL::uuid, NULL::uuid; RETURN;
  END IF;

  BEGIN
    INSERT INTO lessons (instructor_id, student_id, category, scheduled_at, status)
    VALUES (p_instructor_id, p_student_id, p_category, p_scheduled_at, 'pending')
    RETURNING lessons.id, lessons.token INTO v_lesson_id, v_token;
  EXCEPTION
    WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'lessons_instructor_no_overlap' THEN
        RETURN QUERY SELECT false, 'SLOT_UNAVAILABLE_INSTRUCTOR', NULL::uuid, NULL::uuid; RETURN;
      ELSE
        RETURN QUERY SELECT false, 'SLOT_UNAVAILABLE_STUDENT', NULL::uuid, NULL::uuid; RETURN;
      END IF;
    WHEN unique_violation THEN
      -- lessons_instructor_slot_unique (exact-duplicate-only, superseded by
      -- lessons_instructor_no_overlap) still exists and can fire first on an exact-timestamp
      -- duplicate — it only ever guards the instructor side.
      RETURN QUERY SELECT false, 'SLOT_UNAVAILABLE_INSTRUCTOR', NULL::uuid, NULL::uuid; RETURN;
  END;

  RETURN QUERY SELECT true, NULL::text, v_lesson_id, v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION book_lesson(uuid, uuid, text, timestamptz) TO authenticated;
