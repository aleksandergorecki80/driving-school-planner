-- Prevent double-booking at the DB level.
-- Two active (pending/confirmed) lessons for the same instructor cannot share a start time.
-- Cancelled/rejected lessons are excluded so a cancelled slot can be rebooked.
CREATE UNIQUE INDEX lessons_instructor_slot_unique
  ON lessons (instructor_id, scheduled_at)
  WHERE status IN ('pending', 'confirmed');
