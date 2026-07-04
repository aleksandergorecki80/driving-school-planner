-- Add the per-lesson one-time token and the instructor email field (FR-002/FR-013).
-- Only lessons still awaiting a decision may ever carry a live token.
ALTER TABLE lessons ADD COLUMN token uuid DEFAULT gen_random_uuid();
UPDATE lessons SET token = NULL WHERE status <> 'pending';
CREATE UNIQUE INDEX lessons_token_unique ON lessons (token) WHERE token IS NOT NULL;

ALTER TABLE instructors ADD COLUMN email text;
