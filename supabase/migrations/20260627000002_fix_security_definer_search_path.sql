-- Fix: pin search_path on get_instructor_lessons to prevent search_path hijacking.
-- SECURITY DEFINER functions run as the postgres superuser role; without a fixed
-- search_path a caller with CREATE SCHEMA privileges could shadow public.lessons or
-- public.instructors. SET search_path = public locks the function to the correct schema.
ALTER FUNCTION get_instructor_lessons(uuid) SET search_path = public;
