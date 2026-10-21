import express from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { supabaseAdmin } from '../db/supabaseAdmin.js'

const router = express.Router()

// Fetch current user profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.userId)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Profile not found', details: error.message })
    }

    res.json(profile)
  } catch (err) {
    console.error('Error fetching profile:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Update user profile
router.put('/profile', requireAuth, async (req, res) => {
  const { displayName } = req.body

  if (!displayName) {
    return res.status(400).json({ error: 'Missing display name field' })
  }

  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('id', req.userId)
      .select()
      .single()

    if (error) {
      return res.status(500).json({ error: 'Error updating profile', details: error.message })
    }

    res.json(profile)
  } catch (err) {
    console.error('Error updating profile:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

/*
CODE WALKTHROUGH
1. This Express router exposes account-profile endpoints under /api/auth.
2. Both routes use requireAuth so the caller must send a valid Supabase access token.
3. GET /profile looks up the profile row whose ID matches the authenticated user's ID and returns it as JSON.
4. PUT /profile checks the submitted display name, updates the matching row and its timestamp, then returns the saved row.
5. Database failures are logged on the server and answered with an HTTP error status. This file demonstrates REST methods, middleware, validation, asynchronous queries, and JSON responses.
*/
