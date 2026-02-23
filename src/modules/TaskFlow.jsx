// ═══════════════════════════════════════════════════════
// TASKFLOW MODULE — Tasks, priorities, team visibility
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase.js'
import { Card, Tag, Btn } from '../theme.jsx'

export default function TaskFlowModule({ orgId, C, user, userRole }) {
  const [tasks, setTasks] = useState([])
  const [employees, setEmployees] = useState([])
  const [currentEmp, setCurrentEmp] = useState(null)
  const [view, setView] = useState('my')        // my | team | all
  const [filter, setFilter] = useState('active') // active | completed | all
  const [toast, setToast] = useState('')
  const [newTask, setNewTask] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newPriority, setNewPriority] = useState('normal')
  const [newDueDate, setNewDueDate] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [dragId, setDragId] = useState(null)
  const [collabs, setCollabs] = useState({})      // { taskId: [{ id, user_email, status }] }
  const [showCollabPicker, setShowCollabPicker] = useState(null) // taskId or null
  const inputRef = useRef(null)

  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // ── Load data ──
  useEffect(() => {
    if (!orgId) return
    loadEmployees()
  }, [orgId])

  useEffect(() => {
    if (currentEmp) loadTasks()
  }, [currentEmp, filter, view])

  async function loadEmployees() {
    const { data } = await supabase.from('employees')
      .select('id, first_name, last_name, preferred_name, email, status, reports_to')
      .eq('org_id', orgId)
    if (!data) return

    const emps = data.map(e => ({
      id: e.id,
      status: e.status,
      reports_to: e.reports_to,
      name: `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim(),
      email: e.email || ''
    }))
    setEmployees(emps)

    // Find current user in employee list
    const me = emps.find(e => e.email?.toLowerCase() === user?.email?.toLowerCase())
    if (me) {
      setCurrentEmp(me)
    } else if (userRole === 'super_admin' || userRole === 'admin') {
      // Admin/consultant not in employees table — create virtual top-level user
      setCurrentEmp({
        id: '__admin__',
        name: user?.email?.split('@')[0] || 'Admin',
        email: user?.email,
        status: 'active',
        reports_to: null  // null = top level = sees everything
      })
    } else {
      setCurrentEmp(null)
    }
  }

  // ── Tree walk: get all employees visible to current user ──
  function getVisibleEmployeeIds() {
    if (!currentEmp) return []

    // Collect direct and indirect reports
    function getReports(managerId) {
      const directs = employees.filter(e => e.reports_to === managerId && e.status !== 'Terminated')
      let all = [...directs]
      directs.forEach(d => {
        all = [...all, ...getReports(d.id)]
      })
      return all
    }

    const reports = getReports(currentEmp.id)
    const ids = [currentEmp.id, ...reports.map(r => r.id)]

    // If view is 'my', just self
    if (view === 'my') return [currentEmp.id]
    // If view is 'team', self + reports tree
    if (view === 'team') return ids
    // If view is 'all' and user has no manager (upper mgmt), show everything
    if (view === 'all' && !currentEmp.reports_to) {
      return employees.filter(e => e.status !== 'Terminated').map(e => e.id)
    }
    return ids
  }

  async function loadTasks() {
    const visibleIds = getVisibleEmployeeIds()
    if (visibleIds.length === 0) return

    // 1. Load tasks assigned to visible employees
    let query = supabase.from('tasks')
      .select('*')
      .eq('org_id', orgId)
      .in('assigned_to', visibleIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (filter === 'active') query = query.eq('is_complete', false)
    else if (filter === 'completed') query = query.eq('is_complete', true)

    const { data: assignedTasks } = await query

    // 2. Load tasks where current user is an accepted collaborator (for My Tasks view)
    let collabTasks = []
    if (view === 'my' && currentEmp?.email) {
      const { data: myCollabs } = await supabase.from('task_collaborators')
        .select('task_id')
        .eq('user_email', currentEmp.email.toLowerCase())
        .eq('status', 'accepted')

      if (myCollabs?.length) {
        const collabTaskIds = myCollabs.map(c => c.task_id)
        let cq = supabase.from('tasks')
          .select('*')
          .eq('org_id', orgId)
          .in('id', collabTaskIds)

        if (filter === 'active') cq = cq.eq('is_complete', false)
        else if (filter === 'completed') cq = cq.eq('is_complete', true)

        const { data: ct } = await cq
        if (ct) collabTasks = ct
      }
    }

    // 3. Also load pending invitations for My Tasks
    let pendingTasks = []
    if (view === 'my' && currentEmp?.email) {
      const { data: pendingCollabs } = await supabase.from('task_collaborators')
        .select('task_id')
        .eq('user_email', currentEmp.email.toLowerCase())
        .eq('status', 'pending')

      if (pendingCollabs?.length) {
        const pendingIds = pendingCollabs.map(c => c.task_id)
        let pq = supabase.from('tasks')
          .select('*')
          .in('id', pendingIds)
          .eq('is_complete', false)

        const { data: pt } = await pq
        if (pt) pendingTasks = pt
      }
    }

    // Merge & dedupe
    const allTasks = assignedTasks || []
    const existingIds = new Set(allTasks.map(t => t.id))
    collabTasks.forEach(t => { if (!existingIds.has(t.id)) { allTasks.push({ ...t, _isCollab: true }); existingIds.add(t.id) } })
    pendingTasks.forEach(t => { if (!existingIds.has(t.id)) { allTasks.push({ ...t, _isPending: true }); existingIds.add(t.id) } })

    setTasks(allTasks)

    // 4. Load all collaborators for these tasks
    if (allTasks.length > 0) {
      const taskIds = allTasks.map(t => t.id)
      const { data: allCollabs } = await supabase.from('task_collaborators')
        .select('*')
        .in('task_id', taskIds)

      if (allCollabs) {
        const grouped = {}
        allCollabs.forEach(c => {
          if (!grouped[c.task_id]) grouped[c.task_id] = []
          grouped[c.task_id].push(c)
        })
        setCollabs(grouped)
      } else {
        setCollabs({})
      }
    }
  }

  // ── Active employees for assignment dropdown ──
  const activeEmps = employees.filter(e => e.status !== 'Terminated' && e.status !== 'Inactive')

  // ── Create task ──
  async function addTask() {
    if (!newTask.trim()) return
    const assignTo = newAssignee || currentEmp?.id
    if (!assignTo) { sh('⚠️ No assignee'); return }

    // Get max sort_order for this assignee
    const { data: existing } = await supabase.from('tasks')
      .select('sort_order')
      .eq('org_id', orgId)
      .eq('assigned_to', assignTo)
      .eq('is_complete', false)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSort = (existing?.[0]?.sort_order || 0) + 1

    const { error } = await supabase.from('tasks').insert({
      org_id: orgId,
      title: newTask.trim(),
      assigned_to: assignTo,
      created_by: currentEmp?.id || null,
      priority: newPriority,
      due_date: newDueDate || null,
      sort_order: nextSort,
      is_complete: false
    })

    if (error) { sh(`❌ ${error.message}`); return }

    const assigneeName = assignTo === currentEmp?.id ? 'you' : employees.find(e => e.id === assignTo)?.name || 'someone'
    sh(`✓ Task added for ${assigneeName}`)
    setNewTask('')
    setNewAssignee('')
    setNewPriority('normal')
    setNewDueDate('')
    loadTasks()
    inputRef.current?.focus()
  }

  // ── Toggle complete ──
  async function toggleComplete(task) {
    const { error } = await supabase.from('tasks').update({
      is_complete: !task.is_complete,
      completed_at: !task.is_complete ? new Date().toISOString() : null
    }).eq('id', task.id)
    if (!error) loadTasks()
  }

  // ── Edit task title ──
  async function saveEdit(taskId) {
    if (!editText.trim()) return
    await supabase.from('tasks').update({ title: editText.trim() }).eq('id', taskId)
    setEditingId(null)
    setEditText('')
    loadTasks()
  }

  // ── Delete task ──
  async function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', taskId)
    sh('🗑️ Task deleted')
    loadTasks()
  }

  // ── Add collaborator ──
  async function addCollaborator(taskId, emp) {
    const existing = collabs[taskId] || []
    if (existing.some(c => c.user_email === emp.email.toLowerCase())) {
      sh('⚠️ Already added')
      return
    }

    const { error } = await supabase.from('task_collaborators').insert({
      task_id: taskId,
      user_email: emp.email.toLowerCase(),
      status: 'pending',
      added_by: currentEmp?.email || user?.email
    })

    if (error) { sh(`❌ ${error.message}`); return }
    sh(`✓ ${emp.name} invited`)
    setShowCollabPicker(null)
    loadTasks()
  }

  // ── Accept / Decline collaboration ──
  async function respondToCollab(taskId, accept) {
    const { error } = await supabase.from('task_collaborators')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('task_id', taskId)
      .eq('user_email', currentEmp.email.toLowerCase())

    if (error) { sh(`❌ ${error.message}`); return }
    sh(accept ? '✓ Task accepted' : '✓ Task declined')
    loadTasks()
  }

  // ── Remove collaborator ──
  async function removeCollaborator(collabId) {
    await supabase.from('task_collaborators').delete().eq('id', collabId)
    sh('✓ Removed')
    loadTasks()
  }

  // ── Drag & drop reorder ──
  async function handleDrop(targetId) {
    if (!dragId || dragId === targetId) return

    const ordered = tasks.filter(t => !t.is_complete)
    const dragIdx = ordered.findIndex(t => t.id === dragId)
    const targetIdx = ordered.findIndex(t => t.id === targetId)
    if (dragIdx === -1 || targetIdx === -1) return

    const item = ordered.splice(dragIdx, 1)[0]
    ordered.splice(targetIdx, 0, item)

    // Optimistic update
    setTasks(prev => {
      const completed = prev.filter(t => t.is_complete)
      return [...ordered.map((t, i) => ({ ...t, sort_order: i })), ...completed]
    })

    // Persist new order
    const updates = ordered.map((t, i) =>
      supabase.from('tasks').update({ sort_order: i }).eq('id', t.id)
    )
    await Promise.all(updates)
    setDragId(null)
  }

  // ── Priority config ──
  const priorityConfig = {
    urgent: { label: '🔴 Urgent', color: '#C62828', bg: C.bg === '#1a1512' ? '#2e1515' : '#FFEBEE' },
    high: { label: '🟠 High', color: '#E65100', bg: C.bg === '#1a1512' ? '#2e2015' : '#FFF3E0' },
    normal: { label: '🔵 Normal', color: '#1565C0', bg: 'transparent' },
    low: { label: '⚪ Low', color: C.g, bg: 'transparent' },
  }

  // ── Group tasks by assignee when viewing team ──
  function groupedTasks() {
    if (view === 'my') return { [currentEmp?.id]: tasks }
    const groups = {}
    tasks.forEach(t => {
      if (!groups[t.assigned_to]) groups[t.assigned_to] = []
      groups[t.assigned_to].push(t)
    })
    return groups
  }

  const getName = (empId) => {
    if (empId === currentEmp?.id) return 'My Tasks'
    return employees.find(e => e.id === empId)?.name || empId
  }

  // ── Check if user has reports (show team tab) ──
  const hasReports = employees.some(e => e.reports_to === currentEmp?.id)
  const isUpperMgmt = currentEmp && !currentEmp.reports_to

  // ── No employee match ──
  if (!currentEmp && employees.length > 0) {
    return (
      <Card C={C} style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>⚠️ Account Not Linked</div>
        <div style={{ fontSize: 12, color: C.g }}>
          Your login ({user?.email}) doesn't match any employee record. Ask your admin to update your employee email.
        </div>
      </Card>
    )
  }

  if (!currentEmp) return <div style={{ textAlign: 'center', color: C.g, padding: 40 }}>Loading...</div>

  const groups = groupedTasks()

  // ── Collab status helpers ──
  const getCollabStatus = (taskId) => {
    if (!currentEmp?.email) return null
    const taskCollabs = collabs[taskId] || []
    return taskCollabs.find(c => c.user_email === currentEmp.email.toLowerCase())
  }

  return (
    <div>
      {/* ── View Toggle ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          <span style={{ color: C.go }}>✅ Task</span>Flow
        </h2>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <Btn small ghost={view !== 'my'} gold={view === 'my'} onClick={() => setView('my')} C={C}>My Tasks</Btn>
          {(hasReports || isUpperMgmt) && (
            <Btn small ghost={view !== 'team'} gold={view === 'team'} onClick={() => setView('team')} C={C}>Team</Btn>
          )}
          {isUpperMgmt && (
            <Btn small ghost={view !== 'all'} gold={view === 'all'} onClick={() => setView('all')} C={C}>All</Btn>
          )}
        </div>
      </div>

      {/* ── Filter ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['active', 'completed', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: filter === f ? 700 : 400,
            background: filter === f ? C.gD : 'transparent',
            color: filter === f ? C.go : C.g,
            border: `1px solid ${filter === f ? C.go : C.bdrF}`,
            cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit'
          }}>{f}</button>
        ))}
        <span style={{ fontSize: 10, color: C.g, marginLeft: 'auto', alignSelf: 'center' }}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Add Task ── */}
      <Card C={C} style={{ marginBottom: 16, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            ref={inputRef}
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTask() }}
            placeholder="Add a task..."
            style={{
              flex: 1, padding: '8px 12px', background: C.ch, border: `1px solid ${C.bdr}`,
              borderRadius: 6, color: C.w, fontSize: 13, fontFamily: 'inherit', outline: 'none'
            }}
          />
          <Btn gold onClick={addTask} C={C}>+ Add</Btn>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Priority */}
          <select value={newPriority} onChange={e => setNewPriority(e.target.value)} style={{
            padding: '4px 8px', background: C.ch, border: `1px solid ${C.bdr}`,
            borderRadius: 6, color: C.w, fontSize: 10, fontFamily: 'inherit'
          }}>
            <option value="urgent">🔴 Urgent</option>
            <option value="high">🟠 High</option>
            <option value="normal">🔵 Normal</option>
            <option value="low">⚪ Low</option>
          </select>

          {/* Assign to */}
          <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)} style={{
            padding: '4px 8px', background: C.ch, border: `1px solid ${C.bdr}`,
            borderRadius: 6, color: C.w, fontSize: 10, fontFamily: 'inherit', maxWidth: 180
          }}>
            <option value="">Assign to me</option>
            {activeEmps.filter(e => e.id !== currentEmp.id).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          {/* Due date */}
          <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} style={{
            padding: '4px 8px', background: C.ch, border: `1px solid ${C.bdr}`,
            borderRadius: 6, color: C.w, fontSize: 10, fontFamily: 'inherit'
          }} />
        </div>
      </Card>

      {/* ── Task Groups ── */}
      {Object.entries(groups).map(([empId, empTasks]) => (
        <div key={empId} style={{ marginBottom: 20 }}>
          {view !== 'my' && (
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.go, marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>
              {getName(empId)} ({empTasks.length})
            </h3>
          )}

          {empTasks.length === 0 && (
            <div style={{ fontSize: 12, color: C.g, padding: 16, textAlign: 'center' }}>
              {view === 'my' ? 'No tasks — nice work! 🎉' : 'No tasks'}
            </div>
          )}

          {empTasks.map(task => {
            const pc = priorityConfig[task.priority] || priorityConfig.normal
            const isOverdue = task.due_date && !task.is_complete && new Date(task.due_date) < new Date()
            const isEditing = editingId === task.id
            const isPending = task._isPending
            const isCollab = task._isCollab
            const taskCollabs = collabs[task.id] || []
            const isOwner = task.assigned_to === currentEmp?.id || task.created_by === currentEmp?.id
            const isPickerOpen = showCollabPicker === task.id

            return (
              <div key={task.id} style={{ marginBottom: 4 }}>
                {/* ── Pending invitation banner ── */}
                {isPending && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px', borderRadius: '8px 8px 0 0',
                    background: C.bg === '#1a1512' ? '#2a2518' : '#FFF8E1',
                    border: `1px solid ${C.go}`, borderBottom: 'none',
                    fontSize: 11, color: C.go, fontWeight: 600
                  }}>
                    <span>📨 {employees.find(e => e.id === task.assigned_to)?.name || 'Someone'} added you to this task</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button onClick={() => respondToCollab(task.id, true)} style={{
                        padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: '#2E7D32', color: '#fff', border: 'none', cursor: 'pointer'
                      }}>Accept</button>
                      <button onClick={() => respondToCollab(task.id, false)} style={{
                        padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer'
                      }}>Decline</button>
                    </div>
                  </div>
                )}

                <div
                  draggable={!task.is_complete && view === 'my' && !isPending}
                  onDragStart={() => setDragId(task.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(task.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 14px',
                    borderRadius: isPending ? '0 0 8px 8px' : 8,
                    background: task.is_complete ? `${C.ch}88` : isCollab ? (C.bg === '#1a1512' ? '#1a2015' : '#E8F5E9') : pc.bg,
                    border: `1px solid ${isOverdue ? '#C62828' : isPending ? C.go : C.bdr}`,
                    opacity: task.is_complete ? 0.6 : 1,
                    cursor: !task.is_complete && view === 'my' && !isPending ? 'grab' : 'default',
                    transition: 'all 0.15s'
                  }}
                >
                  {/* Checkbox */}
                  <button onClick={() => toggleComplete(task)} style={{
                    width: 20, height: 20, minWidth: 20, borderRadius: 4, cursor: 'pointer',
                    background: task.is_complete ? C.go : 'transparent',
                    border: `2px solid ${task.is_complete ? C.go : C.bdr}`,
                    color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: 2, padding: 0
                  }}>
                    {task.is_complete ? '✓' : ''}
                  </button>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(task.id); if (e.key === 'Escape') setEditingId(null) }}
                        onBlur={() => saveEdit(task.id)}
                        autoFocus
                        style={{
                          width: '100%', padding: '4px 8px', background: C.ch, border: `1px solid ${C.go}`,
                          borderRadius: 4, color: C.w, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    ) : (
                      <div
                        onClick={() => { setEditingId(task.id); setEditText(task.title) }}
                        style={{
                          fontSize: 13, fontWeight: 500, cursor: 'text',
                          textDecoration: task.is_complete ? 'line-through' : 'none',
                          color: task.is_complete ? C.g : C.w,
                          wordBreak: 'break-word'
                        }}
                      >
                        {task.title}
                      </div>
                    )}

                    {/* Meta row */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      {task.priority !== 'normal' && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: pc.color }}>
                          {pc.label}
                        </span>
                      )}
                      {task.due_date && (
                        <span style={{
                          fontSize: 9, fontWeight: isOverdue ? 700 : 400,
                          color: isOverdue ? '#C62828' : C.g
                        }}>
                          📅 {new Date(task.due_date).toLocaleDateString()}
                          {isOverdue && ' ⚠️'}
                        </span>
                      )}
                      {view !== 'my' && task.assigned_to !== currentEmp?.id && (
                        <span style={{ fontSize: 9, color: C.g }}>
                          → {employees.find(e => e.id === task.assigned_to)?.name || '?'}
                        </span>
                      )}
                      {(isCollab || isPending) && (
                        <span style={{ fontSize: 9, color: C.go, fontWeight: 600 }}>
                          👥 shared by {employees.find(e => e.id === task.assigned_to)?.name || '?'}
                        </span>
                      )}
                      {task.created_by && task.created_by !== task.assigned_to && !isCollab && !isPending && (
                        <span style={{ fontSize: 9, color: C.g, fontStyle: 'italic' }}>
                          from {employees.find(e => e.id === task.created_by)?.name || '?'}
                        </span>
                      )}

                      {/* Collab avatars */}
                      {taskCollabs.length > 0 && (
                        <span style={{ fontSize: 9, color: C.g, display: 'flex', gap: 4, alignItems: 'center' }}>
                          👥
                          {taskCollabs.map(c => {
                            const emp = employees.find(e => e.email?.toLowerCase() === c.user_email)
                            const statusIcon = c.status === 'pending' ? '⏳' : c.status === 'accepted' ? '✓' : '✕'
                            const statusColor = c.status === 'pending' ? C.go : c.status === 'accepted' ? '#2E7D32' : '#C62828'
                            return (
                              <span key={c.id} title={`${emp?.name || c.user_email} (${c.status})`} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 2,
                                padding: '1px 5px', borderRadius: 4, fontSize: 8,
                                background: `${statusColor}22`, color: statusColor, fontWeight: 600
                              }}>
                                {emp?.name?.split(' ')[0] || c.user_email.split('@')[0]} {statusIcon}
                                {isOwner && (
                                  <button onClick={(e) => { e.stopPropagation(); removeCollaborator(c.id) }} style={{
                                    background: 'none', border: 'none', color: statusColor, cursor: 'pointer',
                                    fontSize: 8, padding: 0, marginLeft: 2, opacity: 0.7
                                  }} title="Remove">✕</button>
                                )}
                              </span>
                            )
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    {/* Add person button */}
                    {!task.is_complete && (isOwner || task.assigned_to === currentEmp?.id) && (
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setShowCollabPicker(isPickerOpen ? null : task.id)}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            fontSize: 14, padding: '2px 4px', opacity: 0.6,
                            color: C.go
                          }}
                          title="Add someone"
                        >👤+</button>

                        {/* Collaborator picker dropdown */}
                        {isPickerOpen && (
                          <div style={{
                            position: 'absolute', right: 0, top: '100%', zIndex: 100,
                            background: C.c, border: `1px solid ${C.bdr}`, borderRadius: 8,
                            padding: 8, minWidth: 180, boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.go, marginBottom: 6 }}>
                              Add to task:
                            </div>
                            {activeEmps
                              .filter(e => e.id !== task.assigned_to && !taskCollabs.some(c => c.user_email === e.email?.toLowerCase()))
                              .map(emp => (
                                <button
                                  key={emp.id}
                                  onClick={() => addCollaborator(task.id, emp)}
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '6px 8px', background: 'transparent', border: 'none',
                                    color: C.w, fontSize: 11, cursor: 'pointer', borderRadius: 4,
                                    fontFamily: 'inherit'
                                  }}
                                  onMouseOver={e => e.target.style.background = C.ch}
                                  onMouseOut={e => e.target.style.background = 'transparent'}
                                >
                                  {emp.name}
                                </button>
                              ))
                            }
                            {activeEmps.filter(e => e.id !== task.assigned_to && !taskCollabs.some(c => c.user_email === e.email?.toLowerCase())).length === 0 && (
                              <div style={{ fontSize: 10, color: C.g, padding: 4 }}>Everyone's already on it</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete */}
                    <button onClick={() => deleteTask(task.id)} style={{
                      background: 'transparent', border: 'none', color: C.g,
                      cursor: 'pointer', fontSize: 12, padding: '2px 4px', opacity: 0.5
                    }} title="Delete">✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* ── Click-away to close picker ── */}
      {showCollabPicker && (
        <div
          onClick={() => setShowCollabPicker(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: toast.includes('❌') || toast.includes('⚠️') ? '#C62828' : '#2E7D32',
          color: '#fff', padding: '10px 20px', borderRadius: 8,
          fontWeight: 700, fontSize: 13, zIndex: 1000,
          fontFamily: "'DM Mono', monospace"
        }}>{toast}</div>
      )}
    </div>
  )
}
