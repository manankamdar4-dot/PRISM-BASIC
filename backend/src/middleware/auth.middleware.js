import { supabaseAdmin } from '../db/supabaseAdmin.js'

/**
 * Middleware to check if the incoming request has a valid Supabase JWT.
 * Attaches req.userId and req.user object to the request.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' })
  }

  const token = authHeader.split(' ')[1]

  try {
    // Validate the JWT using Supabase Auth
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token', details: error?.message })
    }

    // Attach user information to the request
    req.userId = user.id
    req.user = user
    next()
  } catch (err) {
    console.error('Error verifying token:', err)
    return res.status(500).json({ error: 'Internal server error during auth verification' })
  }
}

/*
CODE WALKTHROUGH
1. Express calls this middleware before protected route handlers.
2. It reads the Authorization header and requires the standard Bearer token format.
3. Supabase checks that token and returns its user identity.
4. The middleware places the user ID and user object on the request so later routes can restrict database queries to that account.
5. Missing or invalid tokens receive HTTP 401. Unexpected verification errors receive HTTP 500. A valid token continues through next().
6. This demonstrates request headers, conditional validation, asynchronous API calls, and Express middleware.
*/
