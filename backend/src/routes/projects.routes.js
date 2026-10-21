import express from 'express'
import { randomUUID } from 'node:crypto'
import { requireAuth } from '../middleware/auth.middleware.js'
import { supabaseAdmin } from '../db/supabaseAdmin.js'

const router = express.Router()
router.use(requireAuth)

// Inputs are a project ID and user ID; the query returns the project only if that user owns it.
async function findOwnedProject(projectId, userId) {
  return supabaseAdmin
    .from('projects')
    .select('id, title, owner_id, created_at, updated_at')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .maybeSingle()
}

// Shared database-error response: logs details on the server and sends a safe message to the browser.
function sendDatabaseError(res, error, message) {
  console.error(message, error)
  return res.status(500).json({ error: message })
}

// GET /api/projects returns this signed-in user's saved projects as JSON.
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, title, created_at, updated_at')
    .eq('owner_id', req.userId)
    .order('created_at', { ascending: false })

  if (error) return sendDatabaseError(res, error, 'Could not load projects')
  return res.json(data)
})

// POST /api/projects validates a title, records the authenticated owner, and returns HTTP 201 with the new project.
router.post('/', async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
  if (!title) return res.status(400).json({ error: 'Project name is required' })

  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({ title, owner_id: req.userId })
    .select('id, title, created_at, updated_at')
    .single()

  if (error) return sendDatabaseError(res, error, 'Could not create project')
  return res.status(201).json(data)
})

// GET /:projectId/tasks combines task nodes with their incoming dependency edges for the browser.
router.get('/:projectId/tasks', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const [nodesResult, edgesResult] = await Promise.all([
    supabaseAdmin.from('nodes').select('*').eq('project_id', project.id).eq('category', 'task').order('label'),
    supabaseAdmin.from('edges').select('id, source, target').eq('project_id', project.id),
  ])
  if (nodesResult.error) return sendDatabaseError(res, nodesResult.error, 'Could not load tasks')
  if (edgesResult.error) return sendDatabaseError(res, edgesResult.error, 'Could not load dependencies')

  const taskIds = new Set(nodesResult.data.map((node) => node.id))
  const taskEdges = edgesResult.data.filter((edge) => taskIds.has(edge.source) && taskIds.has(edge.target))
  const tasks = nodesResult.data.map((node) => ({
    id: node.id,
    projectId: node.project_id,
    title: node.label,
    status: node.details?.status || 'not-started',
    durationDays: Number(node.details?.durationDays || 1),
    description: node.details?.description || '',
    prerequisiteIds: taskEdges.filter((edge) => edge.target === node.id).map((edge) => edge.source),
  }))
  return res.json(tasks)
})

// POST /:projectId/tasks validates and stores one task in nodes.details, then returns its browser-friendly shape.
router.post('/:projectId/tasks', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
  const durationDays = Number(req.body.durationDays)
  const status = req.body.status || 'not-started'
  if (!title) return res.status(400).json({ error: 'Task name is required' })
  if (!Number.isFinite(durationDays) || durationDays < 1) {
    return res.status(400).json({ error: 'Duration must be a positive number of days' })
  }
  if (!['not-started', 'in-progress', 'completed', 'delayed'].includes(status)) {
    return res.status(400).json({ error: 'Choose a valid task status' })
  }

  const id = `task-${randomUUID()}`
  const { data, error } = await supabaseAdmin
    .from('nodes')
    .insert({
      id,
      project_id: project.id,
      label: title,
      category: 'task',
      position_x: 0,
      position_y: 0,
      details: { status, durationDays, description: String(req.body.description || '').trim() },
    })
    .select('*')
    .single()

  if (error) return sendDatabaseError(res, error, 'Could not create task')
  return res.status(201).json({
    id: data.id,
    projectId: data.project_id,
    title: data.label,
    status: data.details.status,
    durationDays: data.details.durationDays,
    description: data.details.description,
    prerequisiteIds: [],
  })
})

// PUT /:projectId/tasks/:taskId replaces the editable fields of one task the user owns.
router.put('/:projectId/tasks/:taskId', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
  const durationDays = Number(req.body.durationDays)
  const status = req.body.status
  if (!title) return res.status(400).json({ error: 'Task name is required' })
  if (!Number.isFinite(durationDays) || durationDays < 1) {
    return res.status(400).json({ error: 'Duration must be a positive number of days' })
  }
  if (!['not-started', 'in-progress', 'completed', 'delayed'].includes(status)) {
    return res.status(400).json({ error: 'Choose a valid task status' })
  }

  const { data, error } = await supabaseAdmin
    .from('nodes')
    .update({ label: title, details: { status, durationDays, description: String(req.body.description || '').trim() } })
    .eq('project_id', project.id)
    .eq('id', req.params.taskId)
    .eq('category', 'task')
    .select('*')
    .maybeSingle()

  if (error) return sendDatabaseError(res, error, 'Could not update task')
  if (!data) return res.status(404).json({ error: 'Task not found' })
  return res.json({
    id: data.id,
    projectId: data.project_id,
    title: data.label,
    status: data.details.status,
    durationDays: data.details.durationDays,
    description: data.details.description,
  })
})

// DELETE /:projectId/tasks/:taskId removes one task; database foreign keys also remove its links.
router.delete('/:projectId/tasks/:taskId', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const { data, error } = await supabaseAdmin
    .from('nodes')
    .delete()
    .eq('project_id', project.id)
    .eq('id', req.params.taskId)
    .eq('category', 'task')
    .select('id')
    .maybeSingle()
  if (error) return sendDatabaseError(res, error, 'Could not delete task')
  if (!data) return res.status(404).json({ error: 'Task not found' })
  return res.status(204).end()
})

// BFS helper: checks whether a path exists from one task to another, using a queue and a visited set.
// The inputs are a project and two task IDs; the output is true or false and is used to reject cycles.
async function canReach(projectId, fromTaskId, searchedTaskId) {
  const { data, error } = await supabaseAdmin.from('edges').select('source, target').eq('project_id', projectId)
  if (error) throw error

  const seen = new Set()
  const queue = [fromTaskId]
  while (queue.length) {
    const current = queue.shift()
    if (current === searchedTaskId) return true
    if (seen.has(current)) continue
    seen.add(current)
    data.filter((edge) => edge.source === current).forEach((edge) => queue.push(edge.target))
  }
  return false
}

// GET /:projectId/dependencies returns saved task-to-task links, excluding legacy people/resource links.
router.get('/:projectId/dependencies', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const [{ data: nodes, error: nodeError }, { data: edges, error: edgeError }] = await Promise.all([
    supabaseAdmin.from('nodes').select('id').eq('project_id', project.id).eq('category', 'task'),
    supabaseAdmin.from('edges').select('id, source, target').eq('project_id', project.id).order('id'),
  ])
  if (nodeError) return sendDatabaseError(res, nodeError, 'Could not load project tasks')
  if (edgeError) return sendDatabaseError(res, edgeError, 'Could not load dependencies')
  const taskIds = new Set(nodes.map((node) => node.id))
  return res.json(edges.filter((edge) => taskIds.has(edge.source) && taskIds.has(edge.target)))
})

// POST /:projectId/dependencies verifies both tasks, rejects duplicate/circular links, then stores the edge.
router.post('/:projectId/dependencies', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const { source, target } = req.body
  if (typeof source !== 'string' || typeof target !== 'string' || source === target) {
    return res.status(400).json({ error: 'Choose two different tasks for the dependency' })
  }

  const { data: tasks, error: taskError } = await supabaseAdmin
    .from('nodes').select('id').eq('project_id', project.id).eq('category', 'task').in('id', [source, target])
  if (taskError) return sendDatabaseError(res, taskError, 'Could not validate dependency tasks')
  if (tasks.length !== 2) return res.status(400).json({ error: 'Both dependency tasks must exist in this project' })

  try {
    if (await canReach(project.id, target, source)) {
      return res.status(400).json({ error: 'This dependency would create a circular task chain' })
    }
  } catch (error) {
    return sendDatabaseError(res, error, 'Could not validate dependency graph')
  }

  const { data: existingEdge, error: existingError } = await supabaseAdmin.from('edges')
    .select('id').eq('project_id', project.id).eq('source', source).eq('target', target).maybeSingle()
  if (existingError) return sendDatabaseError(res, existingError, 'Could not check existing dependencies')
  if (existingEdge) return res.status(409).json({ error: 'That dependency already exists' })

  const { data, error } = await supabaseAdmin
    .from('edges')
    .insert({ id: `edge-${randomUUID()}`, project_id: project.id, source, target })
    .select('id, source, target')
    .single()
  if (error?.code === '23505') return res.status(409).json({ error: 'That dependency already exists' })
  if (error) return sendDatabaseError(res, error, 'Could not save dependency')
  return res.status(201).json(data)
})

// DELETE /:projectId/dependencies/:edgeId removes one saved prerequisite relationship.
router.delete('/:projectId/dependencies/:edgeId', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const { data, error } = await supabaseAdmin.from('edges').delete()
    .eq('project_id', project.id).eq('id', req.params.edgeId).select('id').maybeSingle()
  if (error) return sendDatabaseError(res, error, 'Could not delete dependency')
  if (!data) return res.status(404).json({ error: 'Dependency not found' })
  return res.status(204).end()
})

// GET /:projectId/events reads the latest 100 activity records for the owned project.
router.get('/:projectId/events', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const { data, error } = await supabaseAdmin.from('events').select('*')
    .eq('project_id', project.id).order('created_at', { ascending: false }).limit(100)
  if (error) return sendDatabaseError(res, error, 'Could not load activity')
  return res.json(data)
})

// GET /:projectId/notifications reads the latest user-specific notifications for the owned project.
router.get('/:projectId/notifications', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const { data, error } = await supabaseAdmin.from('notifications').select('*')
    .eq('project_id', project.id).eq('user_id', req.userId)
    .order('created_at', { ascending: false }).limit(100)
  if (error) return sendDatabaseError(res, error, 'Could not load notifications')
  return res.json(data)
})

// GET /:projectId/simulations returns saved simulation history newest first.
router.get('/:projectId/simulations', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const { data, error } = await supabaseAdmin.from('simulations').select('*')
    .eq('project_id', project.id).order('created_at', { ascending: false })
  if (error) return sendDatabaseError(res, error, 'Could not load simulation history')
  return res.json(data)
})

// POST /:projectId/simulations validates the proposed delay and result object, then saves history without changing tasks.
router.post('/:projectId/simulations', async (req, res) => {
  const { data: project, error: projectError } = await findOwnedProject(req.params.projectId, req.userId)
  if (projectError) return sendDatabaseError(res, projectError, 'Could not check project access')
  if (!project) return res.status(404).json({ error: 'Project not found' })
  const { taskId, delayDays, results } = req.body
  if (typeof taskId !== 'string' || !Number.isFinite(delayDays) || delayDays < 0 || !results || typeof results !== 'object') {
    return res.status(400).json({ error: 'A valid task, non-negative delay, and result object are required' })
  }
  const { data, error } = await supabaseAdmin.from('simulations').insert({
    project_id: project.id,
    user_id: req.userId,
    start_node_id: taskId,
    change_type: 'delay',
    payload: { delayDays },
    results,
  }).select('*').single()
  if (error) return sendDatabaseError(res, error, 'Could not save simulation')
  return res.status(201).json(data)
})

export default router

/*
CODE WALKTHROUGH
1. Every route first checks the user's Supabase token with requireAuth.
2. findOwnedProject limits data access to projects owned by that signed-in user.
3. Project and task routes validate submitted text, status, and duration before writing rows.
4. Tasks use the existing nodes table; status and duration are stored in its JSON details field.
5. Dependency edges point from prerequisite task to dependent task. canReach walks those edges before insertion; if the proposed edge can reach back to its source, it would create a cycle and is rejected.
6. Simulation routes save and retrieve results in the existing simulations table. They do not update task schedules.
7. Supabase errors become JSON HTTP responses so the browser can show useful failure messages.
8. This file demonstrates Express routes, HTTP methods, validation, asynchronous database calls, arrays, objects, and breadth-first search.
*/
