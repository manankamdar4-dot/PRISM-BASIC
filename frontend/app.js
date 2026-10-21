// PRISM's browser application is plain JavaScript. Every page uses the same
// functions and CSS, while data-page in its HTML chooses which screen to show.
const pages = [
  ['home', 'Home', 'index.html'],
  ['dashboard', 'Dashboard', 'dashboard.html'],
  ['workspace', 'Workspace', 'workspace.html'],
  ['simulator', 'Simulator', 'simulator.html'],
  ['history', 'History', 'history.html'],
  ['projects', 'Projects', 'projects.html'],
  ['dependencies', 'Dependencies', 'dependencies.html'],
  ['portfolio', 'Portfolio', 'portfolio.html'],
  ['timeline', 'Timeline', 'timeline.html'],
  ['audit', 'Activity log', 'audit.html'],
  ['team', 'Team', 'team.html'],
  ['infrastructure', 'Resources', 'infrastructure.html'],
  ['analytics', 'Insights', 'analytics.html'],
  ['notifications', 'Notifications', 'notifications.html'],
  ['settings', 'Settings', 'settings.html'],
]

const supabaseUrl = window.PRISM_CONFIG?.supabaseUrl || ''
const supabaseAnonKey = window.PRISM_CONFIG?.supabaseAnonKey || ''
const storageKeys = { session: 'prism-session', project: 'prism-project-id' }
let allProjects = []
let currentTasks = []
let currentEdges = []
let lastSimulation = null

function readSession() {
  try { return JSON.parse(localStorage.getItem(storageKeys.session) || 'null') }
  catch { return null }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function showMessage(target, text, kind = 'info') {
  const box = typeof target === 'string' ? document.querySelector(target) : target
  if (!box) return
  box.className = `message show ${kind}`
  box.textContent = text
}

async function api(path, options = {}) {
  const session = readSession()
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  const response = await fetch(`/api${path}`, { ...options, headers })
  if (response.status === 204) return null
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
  return result
}

async function supabaseAuth(path, body) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in backend/.env before signing in.')
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.msg || result.message || result.error_description || 'Could not sign in')
  return result
}

function navMarkup(activePage) {
  return pages.map(([key, label, href]) =>
    `<a class="${key === activePage ? 'active' : ''}" href="/${href}">${label}</a>`).join('')
}

function pageHeading(kicker, title, description, projectPicker = false) {
  return `<header class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="lead">${description}</p></div>${projectPicker ? projectPickerMarkup() : ''}</header>`
}

function projectPickerMarkup() {
  const savedId = localStorage.getItem(storageKeys.project)
  const selected = allProjects.some((project) => project.id === savedId) ? savedId : allProjects[0]?.id || ''
  if (selected && selected !== savedId) localStorage.setItem(storageKeys.project, selected)
  return `<div class="project-picker field"><label for="project-picker">Current project</label><select id="project-picker">
    ${allProjects.length ? allProjects.map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === selected ? 'selected' : ''}>${escapeHtml(project.title)}</option>`).join('') : '<option value="">No projects yet</option>'}
  </select></div>`
}

function layout(page, content) {
  const session = readSession()
  const userText = session?.user?.email ? escapeHtml(session.user.email) : 'Not signed in'
  document.querySelector('#app').innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="/index.html"><span class="brand-mark">P</span><span><strong>PRISM</strong><small>Project impact planner</small></span></a>
        <nav aria-label="Main navigation"><p class="nav-label">Pages</p><div class="nav-links">${navMarkup(page)}</div></nav>
        <div class="sidebar-bottom">Plan tasks, map prerequisites, and see which work may move when a task is delayed.</div>
      </aside>
      <main class="main">
        <div class="topbar"><p>Project Replay and Impact Simulation Model</p><div class="user-tools"><span class="user-label">${userText}</span>${session ? '<button class="button small" id="sign-out">Sign out</button>' : '<a class="button small" href="/index.html#sign-in">Sign in</a>'}</div></div>
        <section class="content" id="page-content">${content}</section>
      </main>
    </div>`
  document.querySelector('#sign-out')?.addEventListener('click', () => {
    localStorage.removeItem(storageKeys.session)
    location.reload()
  })
  document.querySelector('#project-picker')?.addEventListener('change', (event) => {
    localStorage.setItem(storageKeys.project, event.target.value)
    location.reload()
  })
}

function selectedProjectId() {
  const savedId = localStorage.getItem(storageKeys.project)
  const selected = allProjects.some((project) => project.id === savedId) ? savedId : allProjects[0]?.id || ''
  if (selected && selected !== savedId) localStorage.setItem(storageKeys.project, selected)
  return selected
}

function requireProject() {
  if (allProjects.length) return ''
  return `<div class="panel empty"><strong>No project selected</strong>Create your first project on the <a href="/projects.html">Projects page</a> before adding tasks.</div>`
}

function statusBadge(status) {
  const label = { 'not-started': 'Not started', 'in-progress': 'In progress', completed: 'Completed', delayed: 'Delayed' }[status] || status
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(label)}</span>`
}

function dependencyNames(task) {
  return (task.prerequisiteIds || []).map((id) => currentTasks.find((item) => item.id === id)?.title || id)
}

function taskTable(tasks = currentTasks, editable = false) {
  if (!tasks.length) return '<div class="empty"><strong>No tasks yet</strong>Add a task to start mapping project work.</div>'
  return `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Status</th><th>Duration</th><th>Prerequisites</th>${editable ? '<th>Actions</th>' : ''}</tr></thead><tbody>
    ${tasks.map((task) => `<tr><td><strong>${escapeHtml(task.title)}</strong>${task.description ? `<div class="muted">${escapeHtml(task.description)}</div>` : ''}</td><td>${statusBadge(task.status)}</td><td>${Number(task.durationDays)} days</td><td>${dependencyNames(task).length ? dependencyNames(task).map((name) => `<span class="dependency-chip">${escapeHtml(name)}</span>`).join(' ') : '<span class="muted">None</span>'}</td>${editable ? `<td><div class="actions"><button class="button small" data-edit-task="${escapeHtml(task.id)}">Edit</button><button class="button small danger" data-delete-task="${escapeHtml(task.id)}">Delete</button></div></td>` : ''}</tr>`).join('')}
  </tbody></table></div>`
}

function renderHome() {
  const form = readSession() ? '' : `<div class="panel" id="sign-in"><div class="panel-heading"><h2>Sign in to your project space</h2></div><div id="auth-message" class="message"></div><form id="auth-form" class="form-grid"><div class="field"><label for="auth-email">Email</label><input id="auth-email" type="email" required autocomplete="email"></div><div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" required minlength="6" autocomplete="current-password"></div><div class="actions wide"><button class="button primary" name="auth-action" value="login">Sign in</button><button class="button" name="auth-action" value="signup">Create account</button></div></form><p class="hint">Sign-in uses Supabase Auth. Your tasks and simulations are stored in the project database.</p></div>`
  layout('home', `<section class="hero"><div class="hero-mark">P.R.I.S.M. &nbsp; / &nbsp; PROJECT PLANNING</div><h1>See how a task delay can affect the rest of your project.</h1><p class="lead">Create a project, set task prerequisites, and trace downstream impact with a simple, explainable dependency walk.</p><div class="actions"><a class="button primary" href="/dashboard.html">Open dashboard</a><a class="button" href="/workspace.html">Go to workspace</a></div></section><div class="grid grid-3" style="margin-top:16px"><article class="panel"><p class="eyebrow">01 / Organise</p><h2>Manage project tasks</h2><p class="muted">Track planned duration, status, and which tasks must finish first.</p></article><article class="panel"><p class="eyebrow">02 / Explore</p><h2>Trace downstream work</h2><p class="muted">A breadth-first search follows dependency links and marks reachable tasks.</p></article><article class="panel"><p class="eyebrow">03 / Record</p><h2>Keep simulation history</h2><p class="muted">Save a result when you choose to, then open it again later.</p></article></div>${form}`)
  document.querySelector('#auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const action = event.submitter?.value || 'login'
    const email = String(formData.get('email') || document.querySelector('#auth-email').value).trim()
    const password = document.querySelector('#auth-password').value
    try {
      const result = await supabaseAuth(action === 'signup' ? 'signup' : 'token?grant_type=password', { email, password })
      if (action === 'signup' && !result.access_token) {
        showMessage('#auth-message', 'Account created. Check your email if confirmation is enabled, then sign in.', 'success')
        return
      }
      localStorage.setItem(storageKeys.session, JSON.stringify(result))
      location.href = '/dashboard.html'
    } catch (error) { showMessage('#auth-message', error.message, 'error') }
  })
}

async function renderDashboard() {
  if (!readSession()) {
    layout('dashboard', `${pageHeading('Overview', 'Dashboard', 'Sign in to load your saved projects and task counts.')}<div class="panel empty"><strong>Your project data is protected</strong><a href="/index.html#sign-in">Sign in</a> to continue.</div>`)
    return
  }
  allProjects = await api('/projects')
  if (!localStorage.getItem(storageKeys.project) && allProjects[0]) localStorage.setItem(storageKeys.project, allProjects[0].id)
  layout('dashboard', `${pageHeading('Overview', 'Dashboard', 'A current view of the work in your selected project.', true)}<div id="page-message" class="message"></div>${requireProject()}<div class="grid grid-4" id="dashboard-stats"></div><div class="panel"><div class="panel-heading"><h2>Recent simulations</h2><a href="/history.html">View history</a></div><div id="recent-simulations" class="muted">Loading saved records…</div></div><div class="actions" style="margin-top:16px"><a class="button primary" href="/workspace.html">Open workspace</a><a class="button" href="/simulator.html">Run a simulation</a></div>`)
  if (!allProjects.length) return
  currentTasks = await api(`/projects/${encodeURIComponent(selectedProjectId())}/tasks`)
  const counts = { total: currentTasks.length, completed: currentTasks.filter((task) => task.status === 'completed').length, delayed: currentTasks.filter((task) => task.status === 'delayed').length, active: currentTasks.filter((task) => task.status === 'in-progress').length }
  document.querySelector('#dashboard-stats').innerHTML = Object.entries(counts).map(([label, value]) => `<article class="stat"><span>${label[0].toUpperCase() + label.slice(1)} tasks</span><strong>${value}</strong><small>From saved project tasks</small></article>`).join('')
  const history = await api(`/projects/${encodeURIComponent(selectedProjectId())}/simulations`)
  document.querySelector('#recent-simulations').innerHTML = history.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Target task</th><th>Proposed delay</th><th>Affected tasks</th></tr></thead><tbody>${history.slice(0, 5).map(simulationRow).join('')}</tbody></table></div>` : '<div class="empty">No simulations have been saved for this project.</div>'
}

function simulationRow(record) {
  const task = currentTasks.find((item) => item.id === record.start_node_id)
  return `<tr><td>${new Date(record.created_at).toLocaleString()}</td><td>${escapeHtml(task?.title || record.start_node_id)}</td><td>${escapeHtml(record.payload?.delayDays ?? '—')} days</td><td>${Object.keys(record.results || {}).length}</td></tr>`
}

async function loadProjectTasks() {
  if (!selectedProjectId()) { currentTasks = []; currentEdges = []; return }
  currentTasks = await api(`/projects/${encodeURIComponent(selectedProjectId())}/tasks`)
  currentEdges = currentTasks.flatMap((task) => (task.prerequisiteIds || []).map((source) => ({ source, target: task.id })))
}

async function renderWorkspace() {
  allProjects = await api('/projects')
  if (!allProjects.length) {
    layout('workspace', `${pageHeading('Project / work area', 'Project workspace', 'Create a project before adding tasks.')}<div class="panel empty"><strong>No project exists yet</strong><a class="button primary" href="/projects.html">Create a project</a></div>`)
    return
  }
  await loadProjectTasks()
  layout('workspace', `${pageHeading('Project / work area', 'Project workspace', 'Add and update tasks, then choose prerequisite tasks for each dependency.', true)}<div id="page-message" class="message"></div>${requireProject()}<div class="split"><div class="panel"><div class="panel-heading"><h2>Project tasks</h2><span class="badge">${currentTasks.length} total</span></div><div id="task-table">${taskTable(currentTasks, true)}</div></div><div class="panel"><div class="panel-heading"><h2 id="task-form-title">Add a task</h2><button type="button" class="text-button" id="clear-task-form">Clear form</button></div><form id="task-form" class="form-grid"><input type="hidden" id="task-id"><div class="field wide"><label for="task-title">Task name</label><input id="task-title" maxlength="100" required></div><div class="field"><label for="task-duration">Planned duration in days</label><input id="task-duration" type="number" min="1" step="1" value="1" required></div><div class="field"><label for="task-status">Status</label><select id="task-status"><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="delayed">Delayed</option></select></div><div class="field wide"><label for="task-description">Notes (optional)</label><textarea id="task-description"></textarea></div><div class="actions wide"><button class="button primary">Save task</button></div></form><p class="hint">Set prerequisites in the Dependencies page after saving a task.</p></div></div>`)
  document.querySelector('#task-form')?.addEventListener('submit', saveTask)
  document.querySelector('#clear-task-form')?.addEventListener('click', clearTaskForm)
  document.querySelectorAll('[data-edit-task]').forEach((button) => button.addEventListener('click', () => editTask(button.dataset.editTask)))
  document.querySelectorAll('[data-delete-task]').forEach((button) => button.addEventListener('click', () => deleteTask(button.dataset.deleteTask)))
}

function clearTaskForm() {
  document.querySelector('#task-form')?.reset()
  document.querySelector('#task-id').value = ''
  document.querySelector('#task-duration').value = 1
  document.querySelector('#task-form-title').textContent = 'Add a task'
}

function editTask(id) {
  const task = currentTasks.find((item) => item.id === id)
  if (!task) return
  document.querySelector('#task-id').value = task.id
  document.querySelector('#task-title').value = task.title
  document.querySelector('#task-duration').value = task.durationDays
  document.querySelector('#task-status').value = task.status
  document.querySelector('#task-description').value = task.description || ''
  document.querySelector('#task-form-title').textContent = 'Edit task'
  document.querySelector('#task-title').focus()
}

async function saveTask(event) {
  event.preventDefault()
  const id = document.querySelector('#task-id').value
  const body = { title: document.querySelector('#task-title').value.trim(), durationDays: Number(document.querySelector('#task-duration').value), status: document.querySelector('#task-status').value, description: document.querySelector('#task-description').value.trim() }
  try {
    const path = `/projects/${encodeURIComponent(selectedProjectId())}/tasks${id ? `/${encodeURIComponent(id)}` : ''}`
    await api(path, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) })
    await renderWorkspace()
    showMessage('#page-message', id ? 'Task updated.' : 'Task added.', 'success')
  } catch (error) { showMessage('#page-message', error.message, 'error') }
}

async function deleteTask(id) {
  if (!confirm('Delete this task? Its dependency links will be removed by the database.')) return
  try {
    await api(`/projects/${encodeURIComponent(selectedProjectId())}/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
    await renderWorkspace()
    showMessage('#page-message', 'Task deleted.', 'success')
  } catch (error) { showMessage('#page-message', error.message, 'error') }
}

async function renderDependencies() {
  allProjects = await api('/projects')
  if (!allProjects.length) {
    layout('dependencies', `${pageHeading('Project / relationships', 'Dependencies', 'Create a project and tasks before connecting prerequisites.')}<div class="panel empty"><strong>No project exists yet</strong><a class="button primary" href="/projects.html">Create a project</a></div>`)
    return
  }
  await loadProjectTasks()
  const savedEdges = selectedProjectId() ? await api(`/projects/${encodeURIComponent(selectedProjectId())}/dependencies`) : []
  const rows = savedEdges.map((edge) => {
    const prerequisite = currentTasks.find((task) => task.id === edge.source)
    const dependent = currentTasks.find((task) => task.id === edge.target)
    return `<tr><td>${escapeHtml(prerequisite?.title || edge.source)}</td><td>must finish before</td><td>${escapeHtml(dependent?.title || edge.target)}</td><td><button class="button small danger" data-delete-edge="${escapeHtml(edge.id)}">Remove</button></td></tr>`
  }).join('')
  const choices = currentTasks.map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`).join('')
  layout('dependencies', `${pageHeading('Project / relationships', 'Dependencies', 'A dependency points from a prerequisite task to the task that waits for it.', true)}<div id="page-message" class="message"></div>${requireProject()}<div class="split"><div class="panel"><div class="panel-heading"><h2>Current task links</h2><span class="badge">${savedEdges.length} links</span></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>Prerequisite</th><th>Relationship</th><th>Dependent task</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">No task dependencies have been added.</div>'}</div><form id="dependency-form" class="panel"><h2>Add a dependency</h2><p class="muted">For example, choose “Design” as the prerequisite and “Build” as the dependent task.</p><div class="field"><label for="dependency-source">Prerequisite task</label><select id="dependency-source" required>${choices}</select></div><div class="field" style="margin-top:12px"><label for="dependency-target">Task that depends on it</label><select id="dependency-target" required>${choices}</select></div><button class="button primary" style="margin-top:15px">Save dependency</button></form></div>`)
  document.querySelector('#dependency-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      await api(`/projects/${encodeURIComponent(selectedProjectId())}/dependencies`, { method: 'POST', body: JSON.stringify({ source: document.querySelector('#dependency-source').value, target: document.querySelector('#dependency-target').value }) })
      await renderDependencies()
      showMessage('#page-message', 'Dependency saved. The server checked that it does not create a cycle.', 'success')
    } catch (error) { showMessage('#page-message', error.message, 'error') }
  })
  document.querySelectorAll('[data-delete-edge]').forEach((button) => button.addEventListener('click', async () => {
    try {
      await api(`/projects/${encodeURIComponent(selectedProjectId())}/dependencies/${encodeURIComponent(button.dataset.deleteEdge)}`, { method: 'DELETE' })
      await renderDependencies()
      showMessage('#page-message', 'Dependency removed.', 'success')
    } catch (error) { showMessage('#page-message', error.message, 'error') }
  }))
}

function runDelaySimulation(startId, delayDays, tasks, edges) {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  if (!taskById.has(startId)) throw new Error('Choose a task that exists in this project.')
  if (!Number.isFinite(delayDays) || delayDays < 0) throw new Error('Delay must be zero or more days.')
  // The Map stores the best delay found per task; the queue is the BFS work list.
  const delayById = new Map([[startId, delayDays]])
  const queue = [startId]
  while (queue.length) {
    const currentId = queue.shift()
    const incomingDelay = delayById.get(currentId)
    // Follow only outgoing prerequisite links: source is the prerequisite, target waits on it.
    for (const edge of edges) {
      if (edge.source !== currentId || !taskById.has(edge.target)) continue
      const oldDelay = delayById.get(edge.target)
      if (oldDelay === undefined || incomingDelay > oldDelay) {
        delayById.set(edge.target, incomingDelay)
        queue.push(edge.target)
      }
    }
  }
  // Ignore the starting task and zero-day estimates; those descendants have no delay to report.
  return [...delayById.entries()]
    .filter(([taskId, delay]) => taskId !== startId && delay > 0)
    .map(([taskId, estimatedDelayDays]) => ({ task: taskById.get(taskId), estimatedDelayDays }))
}

async function renderSimulator() {
  allProjects = await api('/projects')
  if (!allProjects.length) {
    layout('simulator', `${pageHeading('Project / what if', 'Impact simulator', 'Create a project and tasks before estimating a delay.')}<div class="panel empty"><strong>No project exists yet</strong><a class="button primary" href="/projects.html">Create a project</a></div>`)
    return
  }
  await loadProjectTasks()
  const choices = currentTasks.map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`).join('')
  layout('simulator', `${pageHeading('Project / what if', 'Impact simulator', 'Try a proposed delay. This calculation does not change task dates or status.', true)}<div id="page-message" class="message"></div>${requireProject()}<div class="split"><form class="panel" id="simulation-form"><h2>Propose a delay</h2><div class="field" style="margin-top:14px"><label for="simulation-task">Delayed task</label><select id="simulation-task" required>${choices}</select></div><div class="field" style="margin-top:12px"><label for="simulation-delay">Delay in days</label><input id="simulation-delay" type="number" min="0" step="0.5" value="3" required></div><div class="actions" style="margin-top:15px"><button class="button primary">Run simulation</button><button class="button" type="button" id="save-simulation" disabled>Save result</button></div><p class="hint">Rule: each downstream task receives the same incoming delay. If paths meet, the largest delay is kept.</p></form><section class="panel"><div class="panel-heading"><h2>Estimated impact</h2><span id="impact-count" class="badge">Not run yet</span></div><div id="simulation-results" class="empty">Choose a task and run a simulation to see affected work.</div></section></div>`)
  document.querySelector('#simulation-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const taskId = document.querySelector('#simulation-task').value
    const delayDays = Number(document.querySelector('#simulation-delay').value)
    try {
      const affected = runDelaySimulation(taskId, delayDays, currentTasks, currentEdges)
      lastSimulation = { taskId, delayDays, affected }
      document.querySelector('#impact-count').textContent = `${affected.length} affected`
      document.querySelector('#simulation-results').innerHTML = affected.length ? `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Estimated delay</th></tr></thead><tbody>${affected.map((item) => `<tr><td>${escapeHtml(item.task.title)}</td><td><span class="badge affected">${item.estimatedDelayDays} days</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>No downstream tasks</strong>Other project tasks remain unaffected by this proposal.</div>'
      document.querySelector('#save-simulation').disabled = false
      showMessage('#page-message', 'Simulation complete. The project schedule has not been changed.', 'success')
    } catch (error) { showMessage('#page-message', error.message, 'error') }
  })
  document.querySelector('#save-simulation')?.addEventListener('click', async (event) => {
    if (!lastSimulation) return
    const results = Object.fromEntries(lastSimulation.affected.map((item) => [item.task.id, item.estimatedDelayDays]))
    try {
      await api(`/projects/${encodeURIComponent(selectedProjectId())}/simulations`, { method: 'POST', body: JSON.stringify({ taskId: lastSimulation.taskId, delayDays: lastSimulation.delayDays, results }) })
      event.currentTarget.disabled = true
      showMessage('#page-message', 'Simulation saved to history.', 'success')
    } catch (error) { showMessage('#page-message', error.message, 'error') }
  })
}

async function renderHistory() {
  allProjects = await api('/projects')
  if (!allProjects.length) {
    layout('history', `${pageHeading('Project / saved records', 'Simulation history', 'Saved simulations appear here after you create a project.')}<div class="panel empty"><strong>No project exists yet</strong><a class="button primary" href="/projects.html">Create a project</a></div>`)
    return
  }
  await loadProjectTasks()
  const history = selectedProjectId() ? await api(`/projects/${encodeURIComponent(selectedProjectId())}/simulations`) : []
  layout('history', `${pageHeading('Project / saved records', 'Simulation history', 'Saved simulations are loaded from the database and remain available after refresh.', true)}<div class="panel"><div class="panel-heading"><h2>Saved impact checks</h2><span class="badge">${history.length} records</span></div>${history.length ? `<div class="table-wrap"><table><thead><tr><th>Simulation ID</th><th>Target task</th><th>Proposed delay</th><th>Affected tasks</th><th>Saved at</th></tr></thead><tbody>${history.map((record) => `<tr><td>${escapeHtml(record.id.slice(0, 8))}</td><td>${escapeHtml(currentTasks.find((task) => task.id === record.start_node_id)?.title || record.start_node_id)}</td><td>${escapeHtml(record.payload?.delayDays ?? '—')} days</td><td>${Object.keys(record.results || {}).length}</td><td>${new Date(record.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>No saved simulations</strong>Run a simulation and choose “Save result” to create a history record.</div>'}</div>`)
}

async function renderProjects() {
  allProjects = await api('/projects')
  layout('projects', `${pageHeading('Project / setup', 'Projects', 'Create and select the project whose tasks you want to plan.')}<div id="page-message" class="message"></div><div class="split"><form id="project-form" class="panel"><h2>Create a project</h2><div class="field" style="margin-top:14px"><label for="project-title">Project name</label><input id="project-title" maxlength="120" required></div><button class="button primary" style="margin-top:14px">Create project</button></form><div class="panel"><div class="panel-heading"><h2>Your projects</h2><span class="badge">${allProjects.length}</span></div>${allProjects.length ? `<div class="steps">${allProjects.map((project) => `<div class="step"><p><strong>${escapeHtml(project.title)}</strong><br><span class="muted">Created ${new Date(project.created_at).toLocaleDateString()}</span><br><a href="/workspace.html" data-select-project="${escapeHtml(project.id)}">Open workspace</a></p></div>`).join('')}</div>` : '<div class="empty">No projects yet. Create one to begin.</div>'}</div></div>`)
  document.querySelector('#project-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      const project = await api('/projects', { method: 'POST', body: JSON.stringify({ title: document.querySelector('#project-title').value.trim() }) })
      localStorage.setItem(storageKeys.project, project.id)
      location.reload()
    } catch (error) { showMessage('#page-message', error.message, 'error') }
  })
  document.querySelectorAll('[data-select-project]').forEach((link) => link.addEventListener('click', () => localStorage.setItem(storageKeys.project, link.dataset.selectProject)))
}

async function renderPortfolio() {
  allProjects = await api('/projects')
  const rows = []
  for (const project of allProjects) {
    const tasks = await api(`/projects/${encodeURIComponent(project.id)}/tasks`)
    rows.push(`<tr><td><a href="/workspace.html" data-select-project="${escapeHtml(project.id)}">${escapeHtml(project.title)}</a></td><td>${tasks.length}</td><td>${tasks.filter((task) => task.status === 'completed').length}</td><td>${tasks.filter((task) => task.status === 'delayed').length}</td></tr>`)
  }
  layout('portfolio', `${pageHeading('Projects / overview', 'Project portfolio', 'Compare saved task counts across your projects.')}<div class="panel">${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Tasks</th><th>Completed</th><th>Delayed</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<div class="empty">Create a project to see it here.</div>'}</div>`)
  document.querySelectorAll('[data-select-project]').forEach((link) => link.addEventListener('click', () => localStorage.setItem(storageKeys.project, link.dataset.selectProject)))
}

async function renderTimeline() {
  allProjects = await api('/projects')
  await loadProjectTasks()
  const statusOrder = ['not-started', 'in-progress', 'delayed', 'completed']
  const rows = statusOrder.flatMap((status) => currentTasks.filter((task) => task.status === status).map((task) => `<div class="step"><p>${statusBadge(task.status)} &nbsp; <strong>${escapeHtml(task.title)}</strong><br><span class="muted">Planned duration: ${task.durationDays} day(s). This view groups work by current status; no dates are invented.</span></p></div>`)).join('')
  layout('timeline', `${pageHeading('Project / task sequence', 'Task timeline', 'A simple status-ordered view of the project tasks and their planned durations.', true)}<div class="panel"><div class="steps">${rows || '<div class="empty">No tasks are available in this project.</div>'}</div></div>`)
}

async function renderAnalytics() {
  allProjects = await api('/projects')
  await loadProjectTasks()
  const total = currentTasks.length || 1
  const stats = [['Completion', `${Math.round(currentTasks.filter((task) => task.status === 'completed').length / total * 100)}%`, 'Completed tasks divided by total tasks'], ['Average duration', `${currentTasks.length ? (currentTasks.reduce((sum, task) => sum + task.durationDays, 0) / currentTasks.length).toFixed(1) : 0} days`, 'Mean of planned task durations'], ['Dependencies', currentEdges.length, 'Saved prerequisite links'], ['Delayed tasks', currentTasks.filter((task) => task.status === 'delayed').length, 'Tasks marked delayed']]
  layout('analytics', `${pageHeading('Project / summary', 'Project insights', 'Small summary values calculated from the selected project’s saved tasks.', true)}<div class="grid grid-4">${stats.map(([label, value, note]) => `<article class="stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('')}</div><p class="hint footer-note">These are descriptive counts and averages, not forecasts or AI predictions.</p>`)
}

async function renderInfrastructure() {
  allProjects = await api('/projects')
  await loadProjectTasks()
  layout('infrastructure', `${pageHeading('Project / supporting view', 'Resources', 'This version models project tasks. Resource and infrastructure nodes from the earlier prototype are not part of the task workflow.', true)}<div class="panel"><div class="empty"><strong>Task-only model</strong>The current project data contains ${currentTasks.length} task(s). Add prerequisites in the <a href="/dependencies.html">Dependencies</a> page and review their effects in the <a href="/simulator.html">Simulator</a>.</div></div>`)
}

async function renderTeam() {
  let profile = null
  try { profile = await api('/auth/profile') } catch (error) { layout('team', `${pageHeading('Account / access', 'Team', 'PRISM currently keeps project data scoped to the signed-in owner.')}<div class="panel"><div class="empty">${escapeHtml(error.message)}</div></div>`); return }
  layout('team', `${pageHeading('Account / access', 'Team', 'A small account view for the signed-in project owner. Shared team roles are not enabled in this simplified version.')}<div class="panel"><p><strong>${escapeHtml(profile.display_name || 'Project owner')}</strong></p><p class="muted">${escapeHtml(readSession()?.user?.email || '')}</p><span class="badge">${escapeHtml(profile.role || 'member')}</span></div>`)
}

async function renderNotifications() {
  allProjects = await api('/projects')
  const records = selectedProjectId() ? await api(`/projects/${encodeURIComponent(selectedProjectId())}/notifications`) : []
  layout('notifications', `${pageHeading('Project / updates', 'Notifications', 'Database messages linked to saved simulations and project activity.', true)}<div class="panel">${records.length ? `<div class="steps">${records.map((item) => `<div class="step"><p><span class="badge ${item.severity === 'critical' ? 'delayed' : ''}">${escapeHtml(item.severity)}</span> &nbsp; ${escapeHtml(item.message)}<br><span class="muted">${new Date(item.created_at).toLocaleString()}</span></p></div>`).join('')}</div>` : '<div class="empty">No notifications have been recorded for this project.</div>'}</div>`)
}

async function renderAudit() {
  allProjects = await api('/projects')
  const records = selectedProjectId() ? await api(`/projects/${encodeURIComponent(selectedProjectId())}/events`) : []
  layout('audit', `${pageHeading('Project / activity', 'Activity log', 'A read-only list of recorded project events.', true)}<div class="panel">${records.length ? `<div class="table-wrap"><table><thead><tr><th>Action</th><th>Details</th><th>When</th></tr></thead><tbody>${records.map((item) => `<tr><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.details?.description || JSON.stringify(item.details || {}))}</td><td>${new Date(item.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No activity events are available.</div>'}</div>`)
}

async function renderSettings() {
  const profile = await api('/auth/profile')
  layout('settings', `${pageHeading('Account / preferences', 'Settings', 'Update the display name saved with your Supabase account.')}<div id="page-message" class="message"></div><form id="profile-form" class="panel" style="max-width:540px"><div class="field"><label for="display-name">Display name</label><input id="display-name" maxlength="80" value="${escapeHtml(profile.display_name || '')}" required></div><button class="button primary" style="margin-top:14px">Save profile</button></form>`)
  document.querySelector('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      await api('/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: document.querySelector('#display-name').value.trim() }) })
      showMessage('#page-message', 'Profile saved.', 'success')
    } catch (error) { showMessage('#page-message', error.message, 'error') }
  })
}

const pageRenderers = {
  home: renderHome,
  dashboard: renderDashboard,
  workspace: renderWorkspace,
  simulator: renderSimulator,
  history: renderHistory,
  projects: renderProjects,
  dependencies: renderDependencies,
  portfolio: renderPortfolio,
  timeline: renderTimeline,
  analytics: renderAnalytics,
  infrastructure: renderInfrastructure,
  team: renderTeam,
  notifications: renderNotifications,
  audit: renderAudit,
  settings: renderSettings,
}

async function startApp() {
  const page = document.body.dataset.page || 'home'
  try {
    await (pageRenderers[page] || renderHome)()
  } catch (error) {
    layout(page, `${pageHeading('P.R.I.S.M.', 'Could not load this page', 'The request failed. Check your connection and sign-in, then try again.')}<div class="message show error">${escapeHtml(error.message)}</div><p class="muted">The frontend expects the Express API at <code>/api</code>. Start the backend and check its environment settings.</p>`)
  }
}

startApp()

/*
CODE WALKTHROUGH
1. The pages array maps the 15 ordinary HTML files to their navigation labels. Each file sets body data-page to select its renderer.
2. readSession, escapeHtml, showMessage, and api are shared helpers: they read the saved sign-in token, safely display text, show feedback, and make HTTP requests with fetch.
3. supabaseAuth sends sign-in or account-creation requests to Supabase Auth using the public browser key; the private service-role key never enters this file.
4. layout builds the shared navigation and top bar, then attaches browser event listeners for sign-out and project selection.
5. Page renderers load real project records and create their page markup. The workspace sends task CRUD requests; the dependency page uses server validation; history reads saved simulation records.
6. runDelaySimulation uses a queue and a Map to visit downstream tasks. It only returns estimates; it does not change task records. The Save result button separately sends the result to Express.
7. Projects, dashboard counts, portfolio, timeline, and insights are derived from API data. The team, resource, notifications, and activity pages describe or display the existing account/database information.
8. startApp chooses the page renderer and catches failed requests so the user sees an error instead of a blank page.
9. The server supplies the public Supabase settings through /app-config.js, so this browser script does not rely on a bundler or import-time environment syntax.
10. This file demonstrates variables, arrays, objects, functions, loops, conditions, DOM selection, event handling, form validation, asynchronous JavaScript, fetch, and a breadth-first graph search.
11. Main data flow: form event -> browser validation -> fetch with bearer token -> Express route -> Supabase row -> JSON response -> page re-render or success message.
*/
