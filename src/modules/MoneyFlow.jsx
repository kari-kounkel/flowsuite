import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://keegxjuckohhtxllqxak.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── RECURRING JE DEFINITIONS (unchanged) ────────────────────────────────────
const RECURRING_JES = [
  {
    id: 'depr',
    entity: 'omega',
    label: 'Depreciation & Amortization',
    code: 'DEPR',
    timing: 'Last day of month',
    lines: [
      { dr: true,  acct: '62400', name: 'Depreciation Expense',      amount: 5894.85 },
      { dr: false, acct: '19000', name: 'Accumulated Depreciation',   amount: 5894.85 },
      { dr: true,  acct: '60100', name: 'Amortization Expense',       amount: 561.62  },
      { dr: false, acct: '19500', name: 'Accumulated Amortization',   amount: 561.62  },
    ],
  },
  {
    id: 'int',
    entity: 'omega',
    label: 'MEDA Interest',
    code: 'INT',
    timing: 'Last day of month',
    lines: [
      { dr: true,  acct: '63400', name: 'Interest Expense',           amount: 11714.06 },
      { dr: false, acct: '21750', name: 'MEDA Note 310204 Mortgage',  amount: 11714.06 },
    ],
  },
  {
    id: 'mtg',
    entity: 'omega',
    label: 'MEDA Mortgage Payment',
    code: 'MTG',
    timing: '15th of month',
    lines: [
      { dr: true,  acct: '21750', name: 'MEDA Note 310204 Mortgage',  amount: 11714.06 },
      { dr: false, acct: '10100', name: 'Checking Old National',       amount: 11714.06 },
    ],
  },
  {
    id: 'util',
    entity: 'omega',
    label: 'Utilities Allocation',
    code: 'UTIL',
    timing: 'Last day of month',
    isUtilities: true,
    lines: [
      { dr: true,  acct: '68610', name: 'Electric — Xcel',            amount: 0, editable: true  },
      { dr: true,  acct: '68630', name: 'Gas — CenterPoint',          amount: 0, editable: true  },
      { dr: true,  acct: '68690', name: 'Water/Sewer — Minneapolis',  amount: 0, editable: true  },
      { dr: false, acct: '21000', name: 'Due to I A Z Corporation',   amount: 0, isTotal: true   },
    ],
  },
]

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

// ─── COLOR SYSTEM ────────────────────────────────────────────────────────────
const ENTITY_COLORS = {
  omega: { bg: '#7a4f3a', light: '#c4956a', label: 'Omega' },
  iaz:   { bg: '#3a5c7a', light: '#6a9ec4', label: 'I A Z' },
}
const TYPE_COLORS = {
  AP:    '#c4956a',
  AR:    '#6ab87a',
  PR:    '#9a6ac4',
  Admin: '#a0a0a0',
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function mmPad(n) { return String(n).padStart(2, '0') }

// ─── ADVANCE DATE HELPER ──────────────────────────────────────────────────────
// When a recurring task is marked done, advance due_date by recur_interval days
function advanceDueDate(dueDateStr, intervalDays) {
  if (!intervalDays || intervalDays <= 0) return dueDateStr
  const d = new Date(dueDateStr + 'T00:00:00')
  d.setDate(d.getDate() + intervalDays)
  return d.toISOString().split('T')[0]
}

// ─── TASK FORM MODAL ─────────────────────────────────────────────────────────
const BLANK_FORM = {
  entity: 'omega',
  type: 'AP',
  name: '',
  due_date: new Date().toISOString().split('T')[0],
  description: '',
  resources: '',
  docs: '',
  status: 'open',
  is_recurring: false,
  recur_interval: 30,
}

function TaskFormModal({ task, orgId, C, onSave, onClose, onDelete }) {
  const isEdit = !!task?.id
  const [form, setForm] = useState(isEdit ? {
    entity: task.entity || 'omega',
    type: task.type || 'AP',
    name: task.name || '',
    due_date: task.due_date || '',
    description: task.description || '',
    resources: task.resources || '',
    docs: task.docs || '',
    status: task.status || 'open',
    is_recurring: task.is_recurring || false,
    recur_interval: task.recur_interval || 30,
  } : { ...BLANK_FORM })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    if (isEdit) {
      const { error } = await supabase
        .from('moneyflow_tasks')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', task.id)
      if (!error) onSave()
    } else {
      const { error } = await supabase
        .from('moneyflow_tasks')
        .insert([{ ...form, org_id: orgId }])
      if (!error) onSave()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const { error } = await supabase
      .from('moneyflow_tasks')
      .delete()
      .eq('id', task.id)
    if (!error) onDelete()
    setDeleting(false)
  }

  const inputStyle = {
    width: '100%', background: C.bg, border: `1px solid ${C.bdr}`,
    color: C.w, borderRadius: 6, padding: '7px 10px',
    fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const labelStyle = {
    fontSize: 10, color: C.g, display: 'block', marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: '0.8px',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 14,
        width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto',
        padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: C.go, fontSize: 15, fontWeight: 700 }}>
            {isEdit ? '✏️ Edit Task' : '➕ New Task'}
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.g, fontSize: 18,
            cursor: 'pointer', lineHeight: 1, padding: '0 4px',
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Entity</label>
            <select value={form.entity} onChange={e => set('entity', e.target.value)} style={inputStyle}>
              <option value="omega">Omega</option>
              <option value="iaz">I A Z</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
              {['AP','AR','PR','Admin'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Task Name *</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Property Taxes 2025"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Due Date</label>
          <input
            type="date"
            value={form.due_date}
            onChange={e => set('due_date', e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={3}
            placeholder="What needs to happen..."
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Accounts / Resources</label>
          <input
            value={form.resources}
            onChange={e => set('resources', e.target.value)}
            placeholder="DR 20000 AP / CR 10100 Checking..."
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Docs Needed</label>
          <input
            value={form.docs}
            onChange={e => set('docs', e.target.value)}
            placeholder="Bank statement, Hennepin County bill..."
            style={inputStyle}
          />
        </div>

        {/* Recurring toggle */}
        <div style={{
          marginBottom: 16, padding: '12px 14px',
          background: C.bg, borderRadius: 8, border: `1px solid ${C.bdr}`,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={e => set('is_recurring', e.target.checked)}
              style={{ accentColor: C.go, width: 15, height: 15 }}
            />
            <span style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>Recurring task</span>
          </label>
          {form.is_recurring && (
            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>Advance due date by (days) when marked done</label>
              <input
                type="number"
                value={form.recur_interval}
                onChange={e => set('recur_interval', parseInt(e.target.value) || 30)}
                min={1}
                style={{ ...inputStyle, width: 100 }}
              />
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isEdit && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  background: confirmDelete ? '#c04040' : 'transparent',
                  border: `1px solid ${confirmDelete ? '#c04040' : '#c04040'}`,
                  color: confirmDelete ? '#fff' : '#c04040',
                  padding: '7px 16px', borderRadius: 7, cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                {deleting ? 'Deleting…' : confirmDelete ? 'Confirm Delete' : '🗑 Delete'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              background: 'transparent', border: `1px solid ${C.bdr}`,
              color: C.g, padding: '7px 16px', borderRadius: 7,
              cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            }}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              style={{
                background: C.go, border: 'none', color: '#fff',
                padding: '7px 20px', borderRadius: 7, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                opacity: (!form.name.trim()) ? 0.5 : 1,
              }}
            >{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Task'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FLIP CARD ───────────────────────────────────────────────────────────────
function TaskCard({ task, C, onToggleDone, onEdit }) {
  const [flipped, setFlipped] = useState(false)
  const ec = ENTITY_COLORS[task.entity] || ENTITY_COLORS.omega
  const tc = TYPE_COLORS[task.type] || '#a0a0a0'
  const done = task.status === 'done'

  return (
    <div style={{
      width: 200, height: 220, cursor: 'pointer', perspective: 800,
      opacity: done ? 0.5 : 1, transition: 'opacity 0.3s',
      flexShrink: 0,
    }}>
      <div
        onClick={() => setFlipped(f => !f)}
        style={{
          position: 'relative', width: '100%', height: '100%',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: 'transform 0.45s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* FRONT */}
        <div style={{
          position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
          borderRadius: 12, overflow: 'hidden',
          background: C.bg2,
          border: `1px solid ${C.bdr}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ background: ec.bg, height: 8, width: '100%' }} />
          <div style={{ background: tc, height: 3, width: '100%', marginBottom: 2 }} />
          <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <span style={{
                  background: ec.bg, color: '#fff', fontSize: 9, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 4, letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}>{ec.label}</span>
                <span style={{
                  background: tc + '33', color: tc, fontSize: 9, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 4, letterSpacing: '0.5px',
                }}>{task.type}</span>
              </div>
              {/* Edit button — stops propagation so card doesn't flip */}
              <button
                onClick={e => { e.stopPropagation(); onEdit(task) }}
                style={{
                  background: 'none', border: 'none', color: C.g, cursor: 'pointer',
                  fontSize: 12, padding: '0 2px', lineHeight: 1, opacity: 0.7,
                }}
                title="Edit task"
              >✏️</button>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 600, color: C.w,
              lineHeight: 1.3, flex: 1,
            }}>{task.name}</div>
            <div style={{ fontSize: 10, color: C.g, fontFamily: "'DM Mono', monospace" }}>
              Due {task.due_date}
              {task.is_recurring && <span style={{ marginLeft: 5, color: C.go, fontSize: 9 }}>↻</span>}
            </div>
            <div style={{ fontSize: 9, color: C.g, opacity: 0.6 }}>tap to flip →</div>
          </div>
        </div>

        {/* BACK */}
        <div style={{
          position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          borderRadius: 12, overflow: 'hidden',
          background: C.ch,
          border: `1px solid ${C.bdr}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ background: ec.light, height: 5, width: '100%' }} />
          <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: ec.light, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              What to do
            </div>
            <div style={{ fontSize: 11, color: C.w, lineHeight: 1.4, flex: 1, overflow: 'hidden' }}>
              {task.description}
            </div>
            <div style={{ fontSize: 10, color: C.g, borderTop: `1px solid ${C.bdr}`, paddingTop: 6 }}>
              <strong style={{ color: ec.light }}>Accounts:</strong><br />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9 }}>{task.resources}</span>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onToggleDone(task) }}
              style={{
                background: done ? C.gD : ec.bg,
                color: done ? C.g : '#fff',
                border: 'none', borderRadius: 6, padding: '5px 0',
                fontSize: 10, fontWeight: 700, cursor: 'pointer', width: '100%',
              }}
            >{done ? '↩ Reopen' : task.is_recurring ? '✓ Done — advance date' : '✓ Mark Done'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── JE DISPLAY (unchanged) ───────────────────────────────────────────────────
function JEOutput({ je, month, year, utilAmounts, C }) {
  const mm = mmPad(month)
  const journalNum = `KK ${je.code} ${year} ${mm}`
  const monthName = MONTHS[month - 1]

  const lines = je.lines.map(l => {
    if (l.isTotal) {
      const total = (utilAmounts.xcel || 0) + (utilAmounts.cp || 0) + (utilAmounts.water || 0)
      return { ...l, amount: total }
    }
    if (l.acct === '68610') return { ...l, amount: utilAmounts.xcel || 0 }
    if (l.acct === '68630') return { ...l, amount: utilAmounts.cp || 0 }
    if (l.acct === '68690') return { ...l, amount: utilAmounts.water || 0 }
    return l
  })

  const totalDr = lines.filter(l => l.dr).reduce((s, l) => s + l.amount, 0)
  const totalCr = lines.filter(l => !l.dr).reduce((s, l) => s + l.amount, 0)
  const balanced = Math.abs(totalDr - totalCr) < 0.01

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10,
      padding: '16px 20px', fontFamily: "'DM Mono', monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.go, letterSpacing: '1px' }}>
            {journalNum}
          </div>
          <div style={{ fontSize: 10, color: C.g, marginTop: 2 }}>
            {je.timing === 'Last day of month'
              ? `Last day of ${monthName} ${year}`
              : `15th of ${monthName} ${year}`}
          </div>
        </div>
        <div style={{ fontSize: 10, color: balanced ? '#6ab87a' : '#e07070', fontWeight: 700 }}>
          {balanced ? '✓ BALANCED' : '⚠ UNBALANCED'}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.bdr}` }}>
            <th style={{ textAlign: 'left', color: C.g, padding: '4px 0', width: 60 }}>Acct #</th>
            <th style={{ textAlign: 'left', color: C.g, padding: '4px 8px' }}>Account Name</th>
            <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 90 }}>Debit</th>
            <th style={{ textAlign: 'right', color: C.g, padding: '4px 0 4px 12px', width: 90 }}>Credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.bdrF}` }}>
              <td style={{ color: C.go, padding: '5px 0', fontSize: 10 }}>{l.acct}</td>
              <td style={{ color: C.w, padding: '5px 8px', paddingLeft: l.dr ? 8 : 24 }}>
                {l.name}
              </td>
              <td style={{ textAlign: 'right', color: C.w, padding: '5px 0' }}>
                {l.dr && l.amount > 0 ? fmt(l.amount) : ''}
              </td>
              <td style={{ textAlign: 'right', color: C.w, padding: '5px 0 5px 12px' }}>
                {!l.dr && l.amount > 0 ? fmt(l.amount) : ''}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `1px solid ${C.bdr}` }}>
            <td colSpan={2} style={{ color: C.g, fontSize: 10, padding: '5px 0' }}>TOTALS</td>
            <td style={{ textAlign: 'right', color: C.go, fontWeight: 700, padding: '5px 0' }}>{fmt(totalDr)}</td>
            <td style={{ textAlign: 'right', color: C.go, fontWeight: 700, padding: '5px 0 5px 12px' }}>{fmt(totalCr)}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ fontSize: 10, color: C.g, marginTop: 10, borderTop: `1px solid ${C.bdr}`, paddingTop: 8 }}>
        Memo: {je.label} — {monthName} {year} — Enter manually in QBO
      </div>
    </div>
  )
}

// ─── MAIN MODULE ─────────────────────────────────────────────────────────────
export default function MoneyFlowModule({ orgId, C }) {
  const [tab, setTab] = useState('tasks')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterType, setFilterType] = useState('all')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null) // null = new task

  // JE Generator state
  const [selectedJE, setSelectedJE] = useState(RECURRING_JES[0].id)
  const [jeMonth, setJeMonth] = useState(new Date().getMonth() + 1)
  const [jeYear, setJeYear] = useState(new Date().getFullYear())
  const [utilAmounts, setUtilAmounts] = useState({ xcel: '', cp: '', water: '' })

  // ── LOAD TASKS ──
  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('moneyflow_tasks')
        .select('*')
        .eq('org_id', orgId)
        .order('due_date', { ascending: true })
      if (err) throw err
      setTasks(data || [])
    } catch (e) {
      setError(e.message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { loadTasks() }, [loadTasks])

  // ── TOGGLE DONE ──
  // If recurring + marking done → advance due_date by recur_interval, keep status 'open'
  // If not recurring → toggle between open/done
  async function toggleDone(task) {
    const isDone = task.status === 'done'

    if (!isDone && task.is_recurring && task.recur_interval > 0) {
      // Advance the date, keep open
      const newDate = advanceDueDate(task.due_date, task.recur_interval)
      const { error: err } = await supabase
        .from('moneyflow_tasks')
        .update({ due_date: newDate, updated_at: new Date().toISOString() })
        .eq('id', task.id)
      if (!err) {
        setTasks(ts => ts.map(t =>
          t.id === task.id ? { ...t, due_date: newDate } : t
        ))
      }
    } else {
      // Toggle status
      const newStatus = isDone ? 'open' : 'done'
      const { error: err } = await supabase
        .from('moneyflow_tasks')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', task.id)
      if (!err) {
        setTasks(ts => ts.map(t =>
          t.id === task.id ? { ...t, status: newStatus } : t
        ))
      }
    }
  }

  function openNewTask() {
    setEditingTask(null)
    setModalOpen(true)
  }

  function openEditTask(task) {
    setEditingTask(task)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingTask(null)
  }

  function handleSaved() {
    closeModal()
    loadTasks()
  }

  function handleDeleted() {
    closeModal()
    loadTasks()
  }

  const filtered = tasks.filter(t => {
    if (filterEntity !== 'all' && t.entity !== filterEntity) return false
    if (filterType !== 'all' && t.type !== filterType) return false
    return true
  })

  const activeJE = RECURRING_JES.find(j => j.id === selectedJE)

  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{
      background: active ? (C.gD) : 'transparent',
      border: `1px solid ${active ? (C.go) : (C.bdrF)}`,
      color: active ? (C.go) : (C.g),
      padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    }}>{label}</button>
  )

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Modal */}
      {modalOpen && (
        <TaskFormModal
          task={editingTask}
          orgId={orgId}
          C={C}
          onSave={handleSaved}
          onClose={closeModal}
          onDelete={handleDeleted}
        />
      )}

      {/* Module header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.go }}>
            💰 MoneyFlow
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g }}>
            Accounting tasks &amp; journal entry generator
          </p>
        </div>
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 6 }}>
          {pill('Task Cards', tab === 'tasks', () => setTab('tasks'))}
          {pill('JE Generator', tab === 'je', () => setTab('je'))}
        </div>
      </div>

      {/* ── TASK CARDS TAB ── */}
      {tab === 'tasks' && (
        <div>
          {/* Filters + Add button */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {['all','omega','iaz'].map(e => pill(
              e === 'all' ? 'All Entities' : ENTITY_COLORS[e].label,
              filterEntity === e,
              () => setFilterEntity(e)
            ))}
            <span style={{ width: 1, background: C.bdr, margin: '0 4px' }} />
            {['all','AP','AR','PR','Admin'].map(t => pill(
              t === 'all' ? 'All Types' : t,
              filterType === t,
              () => setFilterType(t)
            ))}
            <span style={{ flex: 1 }} />
            <button onClick={openNewTask} style={{
              background: C.go, border: 'none', color: '#fff',
              padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
            }}>+ Add Task</button>
          </div>

          {/* Loading / Error */}
          {loading && (
            <p style={{ color: C.g, fontSize: 13 }}>Loading tasks…</p>
          )}
          {error && (
            <div style={{ color: '#e07070', fontSize: 12, marginBottom: 12 }}>
              ⚠ {error}
            </div>
          )}

          {/* Cards */}
          {!loading && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {filtered.length === 0 && (
                <p style={{ color: C.g, fontSize: 13 }}>No tasks match this filter.</p>
              )}
              {filtered.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  C={C}
                  onToggleDone={toggleDone}
                  onEdit={openEditTask}
                />
              ))}
            </div>
          )}

          {/* Sidebar note */}
          <div style={{
            marginTop: 24, padding: '10px 14px', borderLeft: `3px solid ${C.go}`,
            background: (C.gD), borderRadius: '0 8px 8px 0',
            fontSize: 11, color: C.g, maxWidth: 500,
          }}>
            <strong style={{ color: C.go }}>Sidebar:</strong> Flip a card to see accounts + docs needed. Mark done when posted. Recurring tasks advance their own due date. Nothing leaves until QBO says so.
          </div>
        </div>
      )}

      {/* ── JE GENERATOR TAB ── */}
      {tab === 'je' && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Left: controls */}
          <div style={{
            background: C.bg2, border: `1px solid ${C.bdr}`,
            borderRadius: 10, padding: 16, minWidth: 220, maxWidth: 280, flex: '0 0 auto',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.go, marginBottom: 12, letterSpacing: '0.5px' }}>
              GENERATE JE
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Entry Type</label>
              {RECURRING_JES.map(j => (
                <button key={j.id} onClick={() => setSelectedJE(j.id)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: selectedJE === j.id ? (C.gD) : 'transparent',
                  border: `1px solid ${selectedJE === j.id ? (C.go) : (C.bdrF)}`,
                  color: selectedJE === j.id ? (C.go) : (C.w),
                  padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                  fontSize: 11, fontFamily: 'inherit', marginBottom: 5,
                }}>
                  <div style={{ fontWeight: 600 }}>{j.label}</div>
                  <div style={{ fontSize: 9, color: C.g, marginTop: 2 }}>{j.timing}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Month</label>
                <select value={jeMonth} onChange={e => setJeMonth(Number(e.target.value))} style={{
                  width: '100%', background: C.bg, border: `1px solid ${C.bdr}`,
                  color: C.w, borderRadius: 6, padding: '6px 8px', fontSize: 11, fontFamily: 'inherit',
                }}>
                  {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Year</label>
                <select value={jeYear} onChange={e => setJeYear(Number(e.target.value))} style={{
                  width: '100%', background: C.bg, border: `1px solid ${C.bdr}`,
                  color: C.w, borderRadius: 6, padding: '6px 8px', fontSize: 11, fontFamily: 'inherit',
                }}>
                  {[2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {activeJE?.isUtilities && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Actual Utility Amounts</label>
                {[
                  { key: 'xcel', label: 'Xcel Electric' },
                  { key: 'cp',   label: 'CenterPoint Gas' },
                  { key: 'water',label: 'Water/Sewer' },
                ].map(u => (
                  <div key={u.key} style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 3 }}>{u.label}</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={utilAmounts[u.key]}
                      onChange={e => setUtilAmounts(prev => ({ ...prev, [u.key]: parseFloat(e.target.value) || 0 }))}
                      style={{
                        width: '100%', background: C.bg,
                        border: `1px solid ${C.bdr}`,
                        color: C.w, borderRadius: 6, padding: '6px 8px',
                        fontSize: 11, fontFamily: "'DM Mono', monospace", boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 10, color: C.g, borderTop: `1px solid ${C.bdr}`, paddingTop: 10, lineHeight: 1.6 }}>
              No CSV. No import.<br/>Key directly into QBO.
            </div>
          </div>

          {/* Right: JE output */}
          <div style={{ flex: 1, minWidth: 320 }}>
            {activeJE && (
              <JEOutput
                je={activeJE}
                month={jeMonth}
                year={jeYear}
                utilAmounts={utilAmounts}
                C={C}
              />
            )}
            <div style={{
              marginTop: 12, padding: '10px 14px',
              borderLeft: `3px solid ${C.go}`,
              background: (C.gD), borderRadius: '0 8px 8px 0',
              fontSize: 11, color: C.g,
            }}>
              <strong style={{ color: C.go }}>Sidebar:</strong> QBO recurring entries are OFF. FlowSuite is the source. Generate here, key there.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
