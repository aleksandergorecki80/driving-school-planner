-- lessons_instructor_slot_unique (exact-duplicate-timestamp only) is now fully subsumed by
-- lessons_instructor_no_overlap (±1h window, EXCLUDE USING gist, added in
-- 20260829120000_book_lesson_invariants.sql and proven via book-lesson.test.ts including a
-- real concurrency case) — keeping both is redundant.
DROP INDEX IF EXISTS lessons_instructor_slot_unique;
