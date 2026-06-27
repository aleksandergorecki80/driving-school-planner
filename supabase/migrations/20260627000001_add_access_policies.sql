-- Phase 1: Auth & Access Boundary Policies
-- Office staff (Supabase Auth session) can read all data.
-- These policies are no-ops until F-02 adds authenticated sessions.
CREATE POLICY "office_select_lessons"
  ON lessons FOR SELECT TO authenticated USING (true);

CREATE POLICY "office_select_instructors"
  ON instructors FOR SELECT TO authenticated USING (true);

CREATE POLICY "office_select_students"
  ON students FOR SELECT TO authenticated USING (true);

-- Instructor scoped access: token resolves to instructor_id; returns only their lessons.
-- SECURITY DEFINER runs as the function owner (postgres role), bypassing RLS.
-- Scoping is enforced inside the function body — not by a policy.
CREATE OR REPLACE FUNCTION get_instructor_lessons(p_token uuid)
RETURNS SETOF lessons
LANGUAGE plpgsql
SECURITY DEFINER
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
  SELECT * FROM lessons WHERE instructor_id = v_instructor_id;
END;
$$;

-- Allow the anon role to call this function.
-- Do NOT grant SELECT on lessons to anon — all lesson reads go through this function.
GRANT EXECUTE ON FUNCTION get_instructor_lessons(uuid) TO anon;
