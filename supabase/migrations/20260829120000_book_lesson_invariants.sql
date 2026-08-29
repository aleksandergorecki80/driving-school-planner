-- Closes roadmap TD-01: enforce student-category coherence (previously unchecked anywhere)
-- and back both double-booking invariants (instructor, student) with real DB constraints,
-- replacing the exact-duplicate-only unique index and the non-atomic app-level check-then-insert.
-- See context/domain/02-invariant-aggregate-refactor.md and
-- context/changes/lesson-category-invariant/plan.md for the full design.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Postgres marks `timestamptz + interval` as STABLE (not IMMUTABLE), because an interval with a
-- calendar component (months/days) can shift by a DST transition depending on session timezone.
-- A fixed one-hour interval has no such ambiguity — 3600 seconds is 3600 seconds regardless of
-- timezone — so wrapping it in a function we explicitly mark IMMUTABLE is safe here, and lets it
-- be used in the EXCLUDE constraints' index expressions below (which require IMMUTABLE).
CREATE OR REPLACE FUNCTION lesson_slot_range(p_scheduled_at timestamptz)
RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT tstzrange(p_scheduled_at, p_scheduled_at + interval '1 hour');
$$;

-- ±1h overlap, exclusive boundary — matches the app-level window createLesson.ts already
-- enforced (now enforced atomically at the DB level, not just applied to a single request).
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_instructor_no_overlap;
ALTER TABLE lessons ADD CONSTRAINT lessons_instructor_no_overlap
  EXCLUDE USING gist (instructor_id WITH =, lesson_slot_range(scheduled_at) WITH &&)
  WHERE (status IN ('pending', 'confirmed'));

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_student_no_overlap;
ALTER TABLE lessons ADD CONSTRAINT lessons_student_no_overlap
  EXCLUDE USING gist (student_id WITH =, lesson_slot_range(scheduled_at) WITH &&)
  WHERE (status IN ('pending', 'confirmed'));

-- The one atomic, authoritative write path for office-created lessons. Re-derives
-- instructor/student category data itself rather than trusting the caller. Mirrors
-- respond_to_lesson's structured-result-not-raise idiom (20260704213336_lesson_token_functions.sql).
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
      -- lessons_instructor_no_overlap in Phase 4) still exists and can fire first on an
      -- exact-timestamp duplicate — it only ever guards the instructor side.
      RETURN QUERY SELECT false, 'SLOT_UNAVAILABLE_INSTRUCTOR', NULL::uuid, NULL::uuid; RETURN;
  END;

  RETURN QUERY SELECT true, NULL::text, v_lesson_id, v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION book_lesson(uuid, uuid, text, timestamptz) TO authenticated;

-- office_insert_lessons (the permissive WITH CHECK (true) policy) is intentionally left in
-- place here — createLesson.ts still inserts directly until Phase 3 rewires it onto
-- book_lesson. Dropping the policy now would break every lesson booking in the interim
-- between this phase and Phase 3. Phase 3's migration drops it in the same commit as the
-- createLesson.ts rewrite, so the old write path and the new one are never both broken/absent
-- at once.
