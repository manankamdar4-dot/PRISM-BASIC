-- 03_nodes.sql
-- Stores task, person, and infrastructure nodes per project.

CREATE TABLE IF NOT EXISTS public.nodes (
  id TEXT NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  category TEXT CHECK (category IN ('task', 'person', 'infra')) NOT NULL,
  position_x DOUBLE PRECISION NOT NULL,
  position_y DOUBLE PRECISION NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (id, project_id)
);

-- CODE WALKTHROUGH
-- 1. A node is an item inside a project; the simplified application stores each task as a node with category 'task'.
-- 2. The composite primary key (id, project_id) allows a task id to be checked within its project.
-- 3. label is the task name, while details JSONB stores its status, planned duration, and optional notes.
-- 4. position columns remain for compatibility with earlier graph views; the simple task list does not depend on them.
