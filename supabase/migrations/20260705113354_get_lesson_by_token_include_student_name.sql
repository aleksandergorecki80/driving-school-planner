-- The instructor-responds Phase 4 page needs to display the student's name, but
-- get_lesson_by_token (Phase 1) only returns lessons columns, and there is no anon
-- grant on `students` for the page to look the name up separately. Extend the function
-- to join students and return the name directly — still one RPC call, one access path.
DROP FUNCTION IF EXISTS get_lesson_by_token(uuid);

CREATE FUNCTION get_lesson_by_token(p_token uuid)
RETURNS TABLE(
  category text,
  scheduled_at timestamptz,
  student_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lessons.category, lessons.scheduled_at, students.name
  FROM lessons
  JOIN students ON students.id = lessons.student_id
  WHERE lessons.token = p_token;
$$;

GRANT EXECUTE ON FUNCTION get_lesson_by_token(uuid) TO anon;
