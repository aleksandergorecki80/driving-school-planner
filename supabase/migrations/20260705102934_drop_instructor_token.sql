-- Retire the superseded per-instructor token mechanism now that lessons.token +
-- get_lesson_by_token/respond_to_lesson (instructor-responds Phase 1) replace it.
DROP FUNCTION IF EXISTS get_instructor_lessons(uuid);
ALTER TABLE instructors DROP COLUMN token;
