-- 05_events.sql
-- Stores an append-only audit trail logging all modifications to project structures.

CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CODE WALKTHROUGH
-- 1. events is an append-style activity record containing the project, acting user, action name, and extra JSON details.
-- 2. UUID and timestamp defaults are assigned by PostgreSQL when an event is inserted.
-- 3. Foreign keys tie each event to a real project and profile and clean up dependent rows if those records are deleted.
