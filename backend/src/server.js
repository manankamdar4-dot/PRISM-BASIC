import express from 'express'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRouter from './routes/auth.routes.js'
import projectsRouter from './routes/projects.routes.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const frontendDirectory = path.join(projectRoot, 'frontend')

app.use(express.json())

// Register routes
app.use('/api/auth', authRouter)
app.use('/api/projects', projectsRouter)

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// Send the public browser key and project URL. The private service key stays on the server.
app.get('/app-config.js', (req, res) => {
  res.type('application/javascript').send(`window.PRISM_CONFIG = ${JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  })}`)
})

// Serve all HTML pages, stylesheets, and browser scripts from this same Express process.
app.use(express.static(frontendDirectory))

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err)
  res.status(500).json({ error: 'Internal Server Error', message: err.message })
})

app.listen(port, () => {
  console.log(`PRISM Backend server running on port ${port}`)
})

/*
CODE WALKTHROUGH
1. dotenv loads server settings such as the port and Supabase credentials from the backend environment file.
2. Express creates the HTTP server. express.json lets route handlers read JSON request bodies.
3. The auth and projects routers group related API endpoints under /api/auth and /api/projects.
4. /api/health is a small endpoint that reports whether the server process is responding.
5. The final error handler turns unexpected route errors into a JSON 500 response.
6. /app-config.js gives the browser only the public Supabase URL and anon key; the service-role key never leaves this server.
7. express.static serves the frontend files from the sibling frontend folder, so browser pages and the API share one origin.
8. app.listen starts the server. This file demonstrates Node modules, Express middleware, static files, HTTP endpoints, and JSON communication.
*/
