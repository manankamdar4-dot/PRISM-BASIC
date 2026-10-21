-- 08_notifications.sql
-- Alert notifications populated automatically by PostgreSQL triggers.

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger function for simulation insertion
CREATE OR REPLACE FUNCTION public.on_simulation_created()
RETURNS trigger AS $$
DECLARE
  affected_count INT;
  message_text TEXT;
  severity_val TEXT := 'info';
  start_node_label TEXT;
BEGIN
  -- Retrieve start node label
  SELECT label INTO start_node_label
  FROM public.nodes
  WHERE id = new.start_node_id AND project_id = new.project_id;

  IF start_node_label IS NULL THEN
    start_node_label := new.start_node_id;
  END IF;

  -- Count affected nodes by retrieving keys from the results JSONB
  SELECT count(*) INTO affected_count
  FROM jsonb_object_keys(new.results);

  IF affected_count > 0 THEN
    IF new.change_type = 'delay' THEN
      message_text := 'Simulation run: Delay on "' || start_node_label || '" affects ' || affected_count || ' downstream items.';
      severity_val := 'warning';
    ELSE
      message_text := 'Simulation run: Breaking change/removal on "' || start_node_label || '" blocks ' || affected_count || ' downstream items.';
      severity_val := 'critical';
    END IF;

    INSERT INTO public.notifications (project_id, user_id, message, severity, is_read)
    VALUES (new.project_id, new.user_id, message_text, severity_val, FALSE);
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Set up the trigger for simulations
DROP TRIGGER IF EXISTS trigger_simulation_notifications ON public.simulations;
CREATE TRIGGER trigger_simulation_notifications
  AFTER INSERT ON public.simulations
  FOR EACH ROW EXECUTE PROCEDURE public.on_simulation_created();

-- Trigger function for audit event insertion
CREATE OR REPLACE FUNCTION public.on_event_created()
RETURNS trigger AS $$
DECLARE
  message_text TEXT;
  severity_val TEXT := 'info';
BEGIN
  message_text := 'Event: ' || new.action || ' - ' || coalesce(new.details->>'description', 'Action performed');

  IF new.action LIKE '%delete%' OR new.action LIKE '%remove%' OR new.action LIKE '%critical%' THEN
    severity_val := 'warning';
  END IF;

  INSERT INTO public.notifications (project_id, user_id, message, severity, is_read)
  VALUES (new.project_id, new.user_id, message_text, severity_val, FALSE);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Set up the trigger for events
DROP TRIGGER IF EXISTS trigger_event_notifications ON public.events;
CREATE TRIGGER trigger_event_notifications
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE PROCEDURE public.on_event_created();

-- CODE WALKTHROUGH
-- 1. notifications stores readable messages attached to a project and, when available, its user.
-- 2. on_simulation_created reads the starting task name and counts affected result keys after a simulation is saved.
-- 3. It creates a warning for a delay simulation or a critical notification for the older breaking-change types.
-- 4. on_event_created turns an activity row into a notification and marks delete/remove/critical actions as warnings.
-- 5. The two AFTER INSERT triggers call those functions automatically. The current browser page only displays notifications; it does not change read state.
