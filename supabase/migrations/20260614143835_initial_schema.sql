-- lesson_status enum
CREATE TYPE lesson_status AS ENUM ('pending', 'confirmed', 'rejected');

-- instructors table
CREATE TABLE instructors (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  categories  text[]      NOT NULL,
  token       uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- students table
CREATE TABLE students (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  phone       text        NOT NULL,
  category    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- lessons table
CREATE TABLE lessons (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id     uuid          NOT NULL REFERENCES instructors(id),
  student_id        uuid          NOT NULL REFERENCES students(id),
  category          text          NOT NULL,
  scheduled_at      timestamptz   NOT NULL,
  status            lesson_status NOT NULL DEFAULT 'pending',
  rejection_reason  text,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons     ENABLE ROW LEVEL SECURITY;
