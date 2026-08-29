-- book_lesson (SECURITY DEFINER, added in 20260829120000_book_lesson_invariants.sql) is now the
-- only path that writes a lessons row for the office flow — createLesson.ts was rewritten in
-- this same commit to call it instead of inserting directly. The permissive policy below let
-- any authenticated request insert any row, completely bypassing category-coherence and
-- double-booking checks (roadmap TD-01 root cause). Safe to drop only now that no code path
-- still depends on it.
DROP POLICY IF EXISTS "office_insert_lessons" ON lessons;
