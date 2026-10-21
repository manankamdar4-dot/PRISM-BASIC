-- 04_edges.sql
-- Stores relationships/dependencies between nodes, with simulation metadata.

CREATE TABLE IF NOT EXISTS public.edges (
  id TEXT NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  buffer_days DOUBLE PRECISION DEFAULT 0 NOT NULL,
  factor DOUBLE PRECISION DEFAULT 1.0 NOT NULL,
  transmits_breaking_change BOOLEAN DEFAULT FALSE NOT NULL,
  note TEXT,
  PRIMARY KEY (id, project_id),
  FOREIGN KEY (source, project_id) REFERENCES public.nodes(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (target, project_id) REFERENCES public.nodes(id, project_id) ON DELETE CASCADE
);

-- CODE WALKTHROUGH
-- 1. Each edge records a directed relationship from source to target within one project.
-- 2. In the simplified task workflow, source is a prerequisite and target is the task that depends on it.
-- 3. Composite foreign keys ensure both endpoint nodes belong to the same project; deleting a node cascades to its edges.
-- 4. Buffer and factor fields are retained from the former advanced simulator; the simple delay rule does not use them.
