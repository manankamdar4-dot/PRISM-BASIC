# P.R.I.S.M.

P.R.I.S.M. (Project Replay and Impact Simulation Model) helps a project manager see how a proposed task delay may affect dependent tasks. It stores projects and tasks, records prerequisites, calculates downstream impact, and saves a simulation only when the user asks.

The interface is made from HTML, CSS, and plain JavaScript. One Node.js and Express server serves the pages and the JSON API. Supabase provides authentication and PostgreSQL storage.

## Pages

The app has 15 separate HTML pages: Home, Dashboard, Workspace, Simulator, History, Projects, Dependencies, Portfolio, Timeline, Activity log, Team, Resources, Insights, Notifications, and Settings. They share `frontend/styles.css` and `frontend/app.js`.

The core workflow is in Dashboard, Workspace, Dependencies, Simulator, and History. The other pages are small account or project views over the same saved data.

## Setup

Use Node.js 20.19 or newer and npm.

1. Install the server dependencies from the repository root:

   ```powershell
   npm install --prefix backend
   ```

2. Copy `backend/.env.example` to `backend/.env`. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Express sends the public key and URL to the browser through `/app-config.js`; the secret key stays on the server. Existing projects can continue using the legacy anon and service-role environment variables as fallbacks.

3. In Supabase, open **Connect** and copy the **Session pooler** connection string. Put it in `SUPABASE_DB_URL` in `backend/.env`, replacing the password placeholder with your database password. Keep this file private; it is ignored by Git.

4. From the repository root, apply the schema with one command:

   ```powershell
   npm run setup:db
   ```

   This runs the existing migration files in order. You do not need to edit or paste SQL. The command only creates or updates the database structure; it does not add sample project data.

## Run

From the repository root, start the Express server:

```powershell
npm run dev
```

Open `http://localhost:5000`. For a non-watch process, use `npm start`.

## Data flow

When a user adds a task:

1. The task form in `frontend/workspace.html` collects the name, duration, status, and notes.
2. `frontend/app.js` validates the fields and uses `fetch()` to send JSON to Express.
3. `backend/src/routes/projects.routes.js` checks the Supabase access token and project ownership, validates the values, and inserts a row into `nodes`.
4. Express returns the saved task as JSON, and the browser reloads the task list from the API.

Dependencies use rows in `edges`. The server uses a breadth-first search to reject a new link if it would create a circular chain. The simulator runs a separate breadth-first search over the saved task links. Each downstream task receives the incoming delay; if paths meet, the largest delay is kept. Simulation results do not change the task schedule. Choosing **Save result** writes the result to `simulations`.

## Learning guide

- `frontend/workspace.html`, `frontend/styles.css`, and `frontend/app.js` show semantic forms, CSS layout, DOM selection, form events, arrays, objects, and `fetch()`.
- `runDelaySimulation` in `frontend/app.js` demonstrates a queue-based breadth-first traversal and a `Map` for tracking task results.
- `backend/src/server.js` shows Express middleware, static files, JSON, and route mounting.
- `backend/src/routes/projects.routes.js` shows REST methods, input validation, ownership checks, database CRUD, and cycle detection.
- `database/migrations/` shows SQL tables, primary and foreign keys, defaults, constraints, and triggers.

Each authored HTML, CSS, JavaScript, and SQL source file ends with a `CODE WALKTHROUGH` comment. JSON files are explained here because JSON does not support comments.

## Current limits

- Task status, duration, and notes are stored in the existing `nodes.details` JSON column.
- Deleting a task also deletes its dependency links through the database foreign keys.
- Account creation may require email confirmation, depending on the Supabase Auth settings.
- The app requires valid Supabase settings and applied SQL migrations. It does not use fake database responses.
- The pages outside the core task workflow are intentionally simple views.
# PRISMDD

