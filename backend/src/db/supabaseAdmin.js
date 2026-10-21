import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment variables!')
}

// Service role client bypasses RLS and allows administrative operations on behalf of the backend
export const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/*
CODE WALKTHROUGH
1. This module reads the Supabase URL and service-role key from the backend environment.
2. createClient builds one reusable Supabase client for the server's database and token-verification operations.
3. Session persistence and automatic token refresh are disabled because this client runs on the server rather than as an interactive user session.
4. The key bypasses database row-level security, so the API must verify the user's token and project ownership before every protected data operation.
5. This file demonstrates Node environment variables and importing a database client. Never put this key in frontend code.
*/
