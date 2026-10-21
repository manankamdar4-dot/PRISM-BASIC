-- 06_snapshots.sql
-- Stores point-in-time states of nodes for the Timeline Replay view.

CREATE TABLE IF NOT EXISTS public.snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  state JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  FOREIGN KEY (node_id, project_id) REFERENCES public.nodes(id, project_id) ON DELETE CASCADE
);

-- CODE WALKTHROUGH
-- 1. A snapshot stores a JSON copy of a node's state at a point in time for the earlier timeline replay feature.
-- 2. The composite foreign key ties it to a node in the same project.
-- 3. The current simplified pages do not create snapshots; the table is retained in the existing database schema.
