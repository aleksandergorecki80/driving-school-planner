-- Add 'cancelled' to lesson_status enum.
-- PostgreSQL 14 allows ALTER TYPE ... ADD VALUE inside a transaction, but the
-- new value must not be referenced in the same migration file.
ALTER TYPE lesson_status ADD VALUE 'cancelled';

-- Grant INSERT and UPDATE on lessons to authenticated (office) users.
-- SELECT already exists from 20260627000001_add_access_policies.sql.
-- Hard-delete is not used; cancellation sets status = 'cancelled'.
CREATE POLICY "office_insert_lessons"
  ON lessons FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "office_update_lessons"
  ON lessons FOR UPDATE TO authenticated USING (true);
