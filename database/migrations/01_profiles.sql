-- 01_profiles.sql
-- Synchronizes user signup profiles from Supabase Auth with custom role-based user management.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  role TEXT CHECK (role IN ('admin', 'engineering_manager', 'architect')) DEFAULT 'architect',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger function to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'architect')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to sync profiles on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- CODE WALKTHROUGH
-- 1. profiles stores the app-specific display name and role for each Supabase Auth user.
-- 2. Its id references auth.users and cascades on deletion, keeping the profile tied to its account.
-- 3. handle_new_user copies sign-up metadata into a profile row, with email and architect defaults.
-- 4. The trigger runs that function after each new authentication user is inserted.
