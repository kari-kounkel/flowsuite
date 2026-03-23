import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://keegxjuckohhtxllqxak.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── ACCESS CONTROL ──────────────────────────────────────────────────────────
const ADMIN_EMAILS = ['kari@karikounkel.com','accounting@mpuptown.com','fbrown@mpuptown.com','operationsmanager@mpuptown.com']

// ─── IIF PARSER ──────────────────────────────────────────────────────────────
// Parses a raw IIF file string into transaction groups.
// Reads column positions dynamically from !TRNS / !SPL header rows.
// Returns: { transactions: [{trns, spls}], accounts: Set<string> }
function parseIIFAmount(raw) {
  // Handle multiple formats:
  // Plain: -1442.44
  // Accounting: " $(1,442.44)" or " $55,613.84 " or " $-   "
  const s = (raw || '').replace(/"/g, '').replace(/\$/g, '').replace(/,/g, '').trim()
  if (!s || s === '-' || s.match(/^-?\s*$/) || s === '$-') return 0
  // Parentheses = negative: (1442.44) → -1442.44
  const parens = s.match(/^\((.+)\)$/)
  if (parens) return -(parseFloat(parens[1]) || 0)
  return parseFloat(s) || 0
}

function parseIIF(raw) {
  // Normalize line endings
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  const transactions = []
  const accounts = new Set()
  let current = null
  let trnsColMap = {}  // field name → col index for TRNS rows
  let splColMap  = {}  // field name → col index for SPL rows

  function colMap(cols) {
    const map = {}
    cols.forEach((c, i) => { map[c.trim().toUpperCase()] = i })
    return map
  }
  function pick(map, cols, field) {
    const idx = map[field]
    return idx !== undefined ? (cols[idx] || '').trim() : ''
  }

  for (const line of lines) {
    const cols = line.split('\t')
    const rowType = cols[0].trim().toUpperCase()

    // Handle both "!TRNS" header and numeric variant (e.g. "11072	TRNSID	...")
    if (rowType === '!TRNS' || (cols[1] && cols[1].trim().toUpperCase() === 'TRNSID')) { trnsColMap = colMap(cols); continue }
    if (rowType === '!SPL')  { splColMap  = colMap(cols); continue }
    if (rowType === '!ENDTRNS') continue

    if (rowType === 'ENDTRNS') {
      if (current) { transactions.push(current); current = null }
      continue
    }

    if (rowType === 'TRNS') {
      const accnt  = pick(trnsColMap, cols, 'ACCNT')
      const amount = parseIIFAmount(pick(trnsColMap, cols, 'AMOUNT'))
      current = {
        trns: {
          trnstype: pick(trnsColMap, cols, 'TRNSTYPE'),
          date:     pick(trnsColMap, cols, 'DATE'),
          accnt, amount,
          memo:     pick(trnsColMap, cols, 'MEMO'),
          docnum:   pick(trnsColMap, cols, 'DOCNUM'),
        },
        spls: [],
      }
      if (accnt) accounts.add(accnt)
    } else if (rowType === 'SPL' && current) {
      const accnt  = pick(splColMap, cols, 'ACCNT')
      const amount = parseIIFAmount(pick(splColMap, cols, 'AMOUNT'))
      current.spls.push({
        trnstype: pick(splColMap, cols, 'TRNSTYPE'),
        date:     pick(splColMap, cols, 'DATE'),
        accnt, amount,
        memo:     pick(splColMap, cols, 'MEMO'),
      })
      if (accnt) accounts.add(accnt)
    }
  }
  if (current) transactions.push(current)
  return { transactions, accounts }
}

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

// ─── LETTER TEMPLATE MODAL (MoneyFlow) ────────────────────────────────────────

function rollupPaymentOrders(orders) {
  const buckets = {}
  for (const o of orders) {
    if (o.status !== 'active') continue
    const key = o.payment_type
    if (!buckets[key]) {
      buckets[key] = {
        payment_type_key: key,
        total: 0,
        frequency: o.frequency || 'Per payroll',
        resource_ids: [],
        employees: [],
        destinations: new Set(),
      }
    }
    buckets[key].total += parseFloat(o.amount_per_period) || 0
    buckets[key].employees.push(o.employee_name)
    if (o.destination) buckets[key].destinations.add(o.destination)
    ;(o.resource_ids || []).forEach(id => {
      if (!buckets[key].resource_ids.includes(id)) buckets[key].resource_ids.push(id)
    })
  }
  return Object.values(buckets)
}

// Upsert auto-generated payroll task cards into moneyflow_tasks
// Uses source='payroll_auto' + payment_type_key as the unique identity
// Never overwrites a card that's already been manually edited (name changed)
async function generatePayrollTasks(orgId, orders) {
  const rolled = rollupPaymentOrders(orders)
  if (!rolled.length) return

  // Load existing auto-generated tasks for this org
  const { data: existing } = await supabase
    .from('moneyflow_tasks')
    .select('*')
    .eq('org_id', orgId)
    .eq('source', 'payroll_auto')

  const existingMap = {}
  ;(existing || []).forEach(t => { existingMap[t.payment_type_key] = t })

  const today = new Date().toISOString().split('T')[0]

  for (const bucket of rolled) {
    const isOneTime = ONE_TIME_TYPES.includes(bucket.payment_type_key)
    const freqConfig = FREQ_MAP[bucket.frequency] || FREQ_MAP['Per payroll']
    const recurring  = isOneTime ? false : freqConfig.recurring
    const interval   = isOneTime ? 0 : freqConfig.interval

    const empList = [...new Set(bucket.employees)].join(', ')
    const destList = [...bucket.destinations].join(' / ')
    const name = `${bucket.payment_type_key} — $${bucket.total.toFixed(2)}`
    const description = `${empList}${destList ? '\n→ ' + destList : ''}`

    const existing = existingMap[bucket.payment_type_key]

    if (existing) {
      // Update amount + resource_ids + description, but only if not done (done = waiting for next cycle)
      await supabase.from('moneyflow_tasks').update({
        name,
        description,
        resource_ids: bucket.resource_ids,
        is_recurring: recurring,
        recur_interval: interval,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      // Create new card
      await supabase.from('moneyflow_tasks').insert([{
        org_id: orgId,
        entity: 'iaz',
        type: 'PR',
        source: 'payroll_auto',
        payment_type_key: bucket.payment_type_key,
        name,
        description,
        due_date: today,
        status: 'open',
        is_recurring: recurring,
        recur_interval: interval,
        resource_ids: bucket.resource_ids,
      }])
    }
  }
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
  recur_interval: 7,
  resource_ids: [],
}

function TaskFormModal({ task, orgId, C, allResources, onSave, onClose, onDelete }) {
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
    resource_ids: task.resource_ids || [],
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
            <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={labelStyle}>Next due date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => set('due_date', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={labelStyle}>Repeat every (days)</label>
                <input
                  type="number"
                  value={form.recur_interval}
                  onChange={e => set('recur_interval', Math.max(1, parseInt(e.target.value) || 7))}
                  min={1}
                  style={inputStyle}
                />
              </div>
            </div>
          )}
        </div>
        {allResources.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Linked Resources</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allResources.map(r => {
                const linked = (form.resource_ids || []).includes(r.id)
                return (
                  <button
                    key={r.id}
                    onClick={() => set('resource_ids', linked
                      ? (form.resource_ids || []).filter(id => id !== r.id)
                      : [...(form.resource_ids || []), r.id]
                    )}
                    style={{
                      background: linked ? C.gD : 'transparent',
                      border: `1px solid ${linked ? C.go : C.bdrF}`,
                      color: linked ? C.go : C.g,
                      borderRadius: 6, padding: '4px 10px',
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{linked ? '✓ ' : ''}{r.label}</button>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: C.g, marginTop: 4 }}>
              Selected resources appear as login buttons on the card back.
            </div>
          </div>
        )}
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
function TaskCard({ task, C, onToggleDone, onEdit, allResources }) {
  const [flipped, setFlipped] = useState(false)
  const ec = ENTITY_COLORS[task.entity] || ENTITY_COLORS.omega
  const tc = TYPE_COLORS[task.type] || '#a0a0a0'
  const done = task.status === 'done'
  const linkedResources = (allResources || []).filter(r => (task.resource_ids || []).includes(r.id))

  return (
    <div style={{
      width: 200, height: 160, cursor: 'pointer', perspective: 800,
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
            <div style={{ fontSize: 10, color: task._justAdvanced ? '#6ab87a' : C.g, fontFamily: "'DM Mono', monospace", transition: 'color 0.3s' }}>
              {task._justAdvanced ? '✓ Advanced → ' : 'Due '}{task.due_date}
              {task.is_recurring && <span style={{ marginLeft: 5, color: C.go, fontSize: 9 }}>↻</span>}
            </div>
            <div style={{ fontSize: 9, color: C.g, opacity: 0.6 }}>tap to flip →</div>
          </div>
        </div>
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
            {linkedResources.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {linkedResources.map(r => r.url ? (
                  <a key={r.id} href={r.url} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      background: ec.bg, color: '#fff', borderRadius: 5,
                      padding: '3px 8px', fontSize: 9, fontWeight: 700,
                      textDecoration: 'none', display: 'inline-block',
                    }}>{r.label} ↗</a>
                ) : (
                  <span key={r.id} style={{
                    background: C.bg, color: C.g, borderRadius: 5,
                    padding: '3px 8px', fontSize: 9, border: `1px solid ${C.bdrF}`,
                  }}>{r.label}</span>
                ))}
              </div>
            )}
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

// ─── JE TABLE (shared display) ───────────────────────────────────────────────
function JETable({ lines, C, memo, journalNum, dateLabel }) {
  const totalDr = lines.filter(l => l.dr).reduce((s, l) => s + (l.amount || 0), 0)
  const totalCr = lines.filter(l => !l.dr).reduce((s, l) => s + (l.amount || 0), 0)
  const balanced = Math.abs(totalDr - totalCr) < 0.01

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10,
      padding: '16px 20px', fontFamily: "'DM Mono', monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.go, letterSpacing: '1px' }}>{journalNum}</div>
          <div style={{ fontSize: 10, color: C.g, marginTop: 2 }}>{dateLabel}</div>
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
              <td style={{ color: C.go, padding: '5px 0', fontSize: 10 }}>{l.acct || l.source_account || ''}</td>
              <td style={{ color: l.unmapped ? '#e07070' : C.w, padding: '5px 8px', paddingLeft: l.dr ? 8 : 24, fontSize: 11 }}>
                {l.unmapped ? `⚠ UNMAPPED: ${l.acct || l.source_account}` : l.name}
              </td>
              <td style={{ textAlign: 'right', color: C.w, padding: '5px 0' }}>
                {l.dr && (l.amount || 0) > 0 ? fmt(l.amount) : ''}
              </td>
              <td style={{ textAlign: 'right', color: C.w, padding: '5px 0 5px 12px' }}>
                {!l.dr && (l.amount || 0) > 0 ? fmt(l.amount) : ''}
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
      {memo && (
        <div style={{ fontSize: 10, color: C.g, marginTop: 10, borderTop: `1px solid ${C.bdr}`, paddingTop: 8 }}>
          Memo: {memo}
        </div>
      )}
    </div>
  )
}

// ─── IIF FACTORY TAB ─────────────────────────────────────────────────────────
function IIFFactory({ orgId, C, parsedData, setParsedData, fileName, setFileName, period, setPeriod }) {
  const [accountMap, setAccountMap] = useState([])
  const [history, setHistory] = useState([])
  const [coaAccounts, setCoaAccounts] = useState([])
  const [loadingMap, setLoadingMap] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postMsg, setPostMsg] = useState(null)
  const [newMappings, setNewMappings] = useState({})
  const [mapSearch, setMapSearch] = useState({})
  const [showMapEditor, setShowMapEditor] = useState(false)
  const [showCoaImport, setShowCoaImport] = useState(false)
  const [coaImporting, setCoaImporting] = useState(false)
  const [expandedInline, setExpandedInline] = useState({})
  const [acctNumMapInline, setAcctNumMapInline] = useState({})

  // ── Upload mode: weekly straight post vs period-end true-up ──
  const [uploadMode, setUploadMode] = useState('weekly') // 'weekly' | 'periodend'
  const [weeklyEndDate, setWeeklyEndDate] = useState('')  // e.g. "Oct 11" 
  const [periodEndType, setPeriodEndType] = useState('monthly') // 'monthly' | 'quarterly' | 'annual'
  const [periodEndQuarter, setPeriodEndQuarter] = useState('Q4')
  const [periodEndYear, setPeriodEndYear] = useState(new Date().getFullYear().toString())

  // Derive date range label from filename e.g. "UpTown_2025-Oct-05_to_2025-Oct-11.IIF" → "Oct 5–11"
  function getDateRangeLabel() { return weeklyEndDate.trim() }

  // Get all period months covered by the period-end selection
  function getPeriodEndMonths() {
    if (periodEndType === 'monthly') return [period] // e.g. ['2025-10']
    if (periodEndType === 'quarterly') {
      const yr = periodEndYear
      const qMap = { Q1:['01','02','03'], Q2:['04','05','06'], Q3:['07','08','09'], Q4:['10','11','12'] }
      return (qMap[periodEndQuarter] || []).map(m => `${yr}-${m}`)
    }
    if (periodEndType === 'annual') {
      return Array.from({length:12},(_,i)=>`${periodEndYear}-${String(i+1).padStart(2,'0')}`)
    }
    return [period]
  }

  // Build JE number: KK YYYY MM AR FLEX Weekly / KK YYYY Q4 AR FLEX Quarterly / etc
  function getJENumber() {
    if (uploadMode === 'weekly') {
      if (!period) return ''
      const [yr, mo] = period.split('-')
      const range = getDateRangeLabel()
      return range ? `KK ${yr} ${mo} AR FLEX Weekly · ${range}` : `KK ${yr} ${mo} AR FLEX Weekly`  // range = period end date
    }
    if (periodEndType === 'monthly') {
      const [yr, mo] = (period || '').split('-')
      return `KK ${yr} ${mo} AR FLEX Monthly`
    }
    if (periodEndType === 'quarterly') return `KK ${periodEndYear} ${periodEndQuarter} AR FLEX Quarterly`
    if (periodEndType === 'annual') return `KK ${periodEndYear} AR FLEX Annual`
    return ''
  }

  // Build the auto-generated note/memo
  function getLineMemo() {
    const jeNum = getJENumber()
    if (uploadMode === 'weekly') {
      return jeNum  // JE number already contains the date range
    }
    if (periodEndType === 'monthly') {
      const [yr, mo] = (period || '').split('-')
      const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][parseInt(mo)-1] || ''
      return `${jeNum} · ${monthName} ${yr}`
    }
    if (periodEndType === 'quarterly') return `${jeNum} · ${periodEndQuarter} ${periodEndYear}`
    if (periodEndType === 'annual') return `${jeNum} · Full Year ${periodEndYear}`
    return jeNum
  }

  // Load account map + history + COA for this org + period
  useEffect(() => {
    async function load() {
      setLoadingMap(true)
      const [{ data: mapData }, { data: histData }, { data: coaData }] = await Promise.all([
        supabase.from('iif_account_map').select('*').eq('org_id', orgId),
        supabase.from('iif_je_history').select('*').eq('org_id', orgId),  // load all — period-end needs cross-period history
        supabase.from('coa_accounts').select('account_name,account_type,account_number').eq('org_id', orgId).order('account_name'),
      ])
      setAccountMap(mapData || [])
      setHistory(histData || [])
      setCoaAccounts(coaData || [])
      // Build source_account -> account_number for inline history display
      const qboToNum = {}
      ;(coaData || []).forEach(r => { if (r.account_number) qboToNum[r.account_name] = r.account_number })
      const srcToNum = {}
      ;(mapData || []).forEach(r => { const n = qboToNum[r.qbo_account]; if (n) srcToNum[r.source_account] = n })
      setAcctNumMapInline(srcToNum)
      setLoadingMap(false)
    }
    load()
  }, [orgId, period])

  async function importCOA(csvText) {
    setCoaImporting(true)
    const lines = csvText.split(/\r?\n/).filter(Boolean)
    const rows = []
    for (const line of lines) {
      const cols = line.split(',')
      const name = cols[0]?.trim().replace(/^"|"$/g, '')
      const type = cols[1]?.trim().replace(/^"|"$/g, '')
      if (!name || name === 'Full name' || name === 'Account List' || name.startsWith('I A Z') || name === 'TOTAL') continue
      rows.push({ org_id: orgId, account_name: name, account_type: type || '' })
    }
    if (rows.length) {
      await supabase.from('coa_accounts').delete().eq('org_id', orgId)
      await supabase.from('coa_accounts').insert(rows)
      const { data } = await supabase.from('coa_accounts').select('account_name,account_type').eq('org_id', orgId).order('account_name')
      setCoaAccounts(data || [])
    }
    setCoaImporting(false)
    setShowCoaImport(false)
  }

  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const result = parseIIF(ev.target.result)
      setParsedData(result)
      setPostMsg(null)
      setNewMappings({})
    }
    reader.readAsText(file)
  }

  // Build JE lines from parsed IIF
  // Weekly: straight post — full amounts, no delta
  // Period-end: delta against all weekly posts for the covered period(s)
  function buildJELines() {
    if (!parsedData) return []
    const mapLookup = {}
    accountMap.forEach(r => { mapLookup[r.source_account] = r.qbo_account })
    Object.entries(newMappings).forEach(([src, qbo]) => { if (qbo.trim()) mapLookup[src] = qbo.trim() })

    const rawTotals = {}
    parsedData.transactions.forEach(tx => {
      const a = tx.trns.accnt
      if (a) rawTotals[a] = (rawTotals[a] || 0) + tx.trns.amount
      tx.spls.forEach(s => {
        if (s.accnt) rawTotals[s.accnt] = (rawTotals[s.accnt] || 0) + s.amount
      })
    })

    const lines = []

    if (uploadMode === 'weekly') {
      // Straight post — no delta at all
      Object.entries(rawTotals).forEach(([srcAcct, rawAmt]) => {
        if (Math.abs(rawAmt) < 0.005) return
        const qboAcct = mapLookup[srcAcct]
        lines.push({
          source_account: srcAcct,
          acct: qboAcct || srcAcct,
          name: qboAcct || srcAcct,
          dr: rawAmt > 0,
          amount: Math.abs(rawAmt),
          unmapped: !qboAcct,
        })
      })
    } else {
      // Period-end true-up — delta against weekly posts covering the selected period(s)
      const coveredPeriods = new Set(getPeriodEndMonths())
      const postedTotals = {}
      history.filter(r => coveredPeriods.has(r.period) && (r.upload_mode === 'weekly' || !r.upload_mode)).forEach(r => {
        postedTotals[r.source_account] = (postedTotals[r.source_account] || 0) + r.amount
      })
      const allAccounts = new Set([...Object.keys(rawTotals), ...Object.keys(postedTotals)])
      allAccounts.forEach(srcAcct => {
        const rawAmt = rawTotals[srcAcct] || 0
        const posted = postedTotals[srcAcct] || 0
        const delta = rawAmt - posted
        if (Math.abs(delta) < 0.005) return
        const qboAcct = mapLookup[srcAcct]
        lines.push({
          source_account: srcAcct,
          acct: qboAcct || srcAcct,
          name: qboAcct || srcAcct,
          dr: delta > 0,
          amount: Math.abs(delta),
          unmapped: !qboAcct,
        })
      })
    }
    return lines
  }

  const jeLines = buildJELines()
  const hasUnmapped = jeLines.some(l => l.unmapped)
  const unmappedAccounts = [...new Set(jeLines.filter(l => l.unmapped).map(l => l.source_account))]

  async function handlePost() {
    if (hasUnmapped) return

    // ── Balance check — must balance before posting ──
    const totalDr = jeLines.filter(l => l.dr).reduce((s, l) => s + l.amount, 0)
    const totalCr = jeLines.filter(l => !l.dr).reduce((s, l) => s + l.amount, 0)
    if (Math.abs(totalDr - totalCr) >= 0.01) {
      setPostMsg({ ok: false, msg: `Cannot post — unbalanced by $${fmt(Math.abs(totalDr - totalCr))}. DR ${fmt(totalDr)} ≠ CR ${fmt(totalCr)}.` })
      return
    }

    setPosting(true)
    setPostMsg(null)

    // Save any inline new mappings to iif_account_map
    const newMapRows = Object.entries(newMappings)
      .filter(([, qbo]) => qbo.trim())
      .map(([src, qbo]) => ({ org_id: orgId, source_account: src, qbo_account: qbo.trim() }))
    if (newMapRows.length) {
      await supabase.from('iif_account_map').upsert(newMapRows, { onConflict: 'org_id,source_account' })
    }

    const jeNumber = getJENumber()
    const lineMemo = getLineMemo()
    const postPeriod = uploadMode === 'weekly' ? period : (periodEndType === 'monthly' ? period : getPeriodEndMonths()[getPeriodEndMonths().length - 1])

    // Insert history rows
    const historyRows = jeLines.map(l => ({
      org_id: orgId,
      period: postPeriod,
      source_account: l.source_account,
      qbo_account: l.acct,
      amount: l.dr ? l.amount : -l.amount,
      file_name: fileName,
      upload_mode: uploadMode,
      je_number: jeNumber,
      memo: lineMemo,
      posted_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('iif_je_history').insert(historyRows)
    if (error) {
      setPostMsg({ ok: false, msg: error.message })
    } else {
      // ── Write entry to close checklist — INSERT (not upsert) so each week gets its own row ──
      const clLabel = `${jeNumber}${getDateRangeLabel() ? ' · ' + getDateRangeLabel() : ` · ${fileName}`}`
      // Only insert if this exact label+period doesn't already exist
      const { data: existingLog } = await supabase.from('moneyflow_close_log')
        .select('id').eq('org_id', orgId).eq('period', postPeriod).eq('label', clLabel).single()
      if (!existingLog) {
        await supabase.from('moneyflow_close_log').insert([{
          org_id: orgId,
          period: postPeriod,
          entry_type: 'iif',
          template_id: null,
          label: clLabel,
          amount: totalDr,
          source: 'iif',
          posted_at: null,
        }])
      }

      // ── One task card per file — je_number is unique per upload ──
      const taskName = `${jeNumber} — Enter in QBO`
      const taskDesc = `DR $${fmt(totalDr)} · ${historyRows.length} accounts\nFile: ${fileName}`
      const { data: existingTask } = await supabase.from('moneyflow_tasks')
        .select('id').eq('org_id', orgId).eq('name', taskName).maybeSingle()
      if (!existingTask) {
        await supabase.from('moneyflow_tasks').insert([{
          org_id: orgId,
          entity: 'iaz',
          type: 'AR',
          source: 'iif_auto',
          name: taskName,
          description: taskDesc,
          due_date: new Date().toISOString().split('T')[0],
          status: 'open',
          is_recurring: false,
          recur_interval: 0,
        }])
      }

      setPostMsg({ ok: true, msg: `✓ Posted ${historyRows.length} lines · ${jeNumber} · $${fmt(totalDr)}` })
      const { data: newHist } = await supabase.from('iif_je_history').select('*').eq('org_id', orgId)
      setHistory(newHist || [])
    }
    setPosting(false)
  }

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
    borderRadius: 6, padding: '6px 10px', fontSize: 11,
    fontFamily: "'DM Mono', monospace", boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['weekly','📅 Weekly Upload'],['periodend','📊 Period-End True-Up']].map(([mode, label]) => (
          <button key={mode} onClick={() => { setUploadMode(mode); setParsedData(null); setFileName(''); setPostMsg(null); setWeeklyEndDate('') }} style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: uploadMode === mode ? 700 : 400,
            background: uploadMode === mode ? C.go : 'transparent',
            border: `1px solid ${uploadMode === mode ? C.go : C.bdr}`,
            color: uploadMode === mode ? '#000' : C.g,
          }}>{label}</button>
        ))}
        <span style={{ fontSize: 10, color: C.g, marginLeft: 4 }}>
          {uploadMode === 'weekly' ? 'Straight post — full amounts, no delta. Tag each file to its accounting period.' : 'True-up — posts the variance between this period summary and all weekly posts already recorded.'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        {uploadMode === 'weekly' && (
          <div>
            <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Accounting Period</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ ...inputStyle, width: 150 }} />
            <div style={{ fontSize: 9, color: C.g, marginTop: 3 }}>Tag this file to its month (e.g. Oct 26–Nov 1 → October)</div>
          </div>
        )}
        {uploadMode === 'periodend' && (
          <>
            <div>
              <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Period Type</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {['monthly','quarterly','annual'].map(t => (
                  <button key={t} onClick={() => setPeriodEndType(t)} style={{
                    padding: '5px 10px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                    background: periodEndType === t ? C.go : 'transparent',
                    border: `1px solid ${periodEndType === t ? C.go : C.bdr}`,
                    color: periodEndType === t ? '#000' : C.g, fontWeight: periodEndType === t ? 700 : 400,
                  }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
            </div>

            {periodEndType === 'monthly' && (
              <div>
                <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Closing Month</label>
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ ...inputStyle, width: 150 }} />
              </div>
            )}
            {periodEndType === 'quarterly' && (
              <>
                <div>
                  <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Quarter</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['Q1','Q2','Q3','Q4'].map(q => (
                      <button key={q} onClick={() => setPeriodEndQuarter(q)} style={{
                        padding: '5px 10px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                        background: periodEndQuarter === q ? C.go : 'transparent',
                        border: `1px solid ${periodEndQuarter === q ? C.go : C.bdr}`,
                        color: periodEndQuarter === q ? '#000' : C.g, fontWeight: periodEndQuarter === q ? 700 : 400,
                      }}>{q}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Year</label>
                  <input value={periodEndYear} onChange={e => setPeriodEndYear(e.target.value)} style={{ ...inputStyle, width: 80 }} maxLength={4} />
                </div>
                <div style={{ fontSize: 10, color: C.g, alignSelf: 'flex-end', paddingBottom: 6 }}>
                  Covers: {getPeriodEndMonths().join(', ')}
                </div>
              </>
            )}
            {periodEndType === 'annual' && (
              <>
                <div>
                  <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Year</label>
                  <input value={periodEndYear} onChange={e => setPeriodEndYear(e.target.value)} style={{ ...inputStyle, width: 80 }} maxLength={4} />
                </div>
                <div style={{ fontSize: 10, color: C.g, alignSelf: 'flex-end', paddingBottom: 6 }}>
                  Covers all 12 months of {periodEndYear}
                </div>
              </>
            )}
          </>
        )}

        {uploadMode === 'weekly' && (
          <div>
            <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Period End Date</label>
            <input
              type="date"
              onChange={e => {
                const d = new Date(e.target.value + 'T00:00:00')
                const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
                setWeeklyEndDate(`${mon} ${d.getDate()}`)
              }}
              style={{ ...inputStyle, width: 150 }}
            />
            {weeklyEndDate && <div style={{ fontSize: 10, color: C.go, marginTop: 3 }}>→ {weeklyEndDate}</div>}
          </div>
        )}
        <div>
          <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            {uploadMode === 'weekly' ? 'Upload Weekly .IIF File' : `Upload ${periodEndType.charAt(0).toUpperCase()+periodEndType.slice(1)} Summary .IIF`}
          </label>
          <input type="file" accept=".iif,.IIF" onChange={handleFileUpload} style={{ fontSize: 11, color: C.w }} />
          {fileName && (
            <div style={{ fontSize: 10, color: C.go, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
              📄 {fileName}{uploadMode === 'weekly' && getDateRangeLabel() ? ` · ${getDateRangeLabel()}` : ''}
            </div>
          )}
        </div>

        {parsedData && (
          <div style={{ fontSize: 10, color: C.g, alignSelf: 'flex-end', paddingBottom: 6 }}>
            {parsedData.transactions.length} txns · {parsedData.accounts.size} accounts
            {uploadMode === 'periodend' && (() => {
              const wLines = history.filter(r => getPeriodEndMonths().includes(r.period) && (r.upload_mode==='weekly'||!r.upload_mode))
              const wDR = wLines.filter(r => r.amount > 0).reduce((s,r)=>s+r.amount,0)
              return ` · ${wLines.length} weekly lines · $${fmt(wDR)} DR posted`
            })()}
          </div>
        )}
      </div>
      {period && (
        <div style={{ fontSize: 11, color: C.go, fontFamily: "'DM Mono', monospace", marginBottom: 12, padding: '7px 12px', background: C.bg2, borderRadius: 6, border: `1px solid ${C.bdr}`, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>JE: <b>{getJENumber()}</b></span>
          <span>Note: <b>{getLineMemo()}</b></span>
        </div>
      )}

      {loadingMap && <p style={{ fontSize: 12, color: C.g }}>Loading account map…</p>}
      {unmappedAccounts.length > 0 && (
        <div style={{
          background: '#3a1a1a', border: '1px solid #c04040', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, color: '#e07070', fontWeight: 700, marginBottom: 8 }}>
            ⚠ {unmappedAccounts.length} unmapped account{unmappedAccounts.length > 1 ? 's' : ''} — map them here to proceed
          </div>
          {unmappedAccounts.map(src => {
            const search = mapSearch[src] || newMappings[src] || ''
            const filtered = coaAccounts.filter(a =>
              a.account_name.toLowerCase().includes(search.toLowerCase())
            ).slice(0, 12)
            const matched = coaAccounts.find(a => a.account_name === newMappings[src])
            return (
              <div key={src} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, color: '#e07070', fontFamily: "'DM Mono', monospace", minWidth: 260, paddingTop: 6 }}>{src}</span>
                  <span style={{ fontSize: 11, color: C.g, paddingTop: 6 }}>→</span>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      placeholder={coaAccounts.length ? 'Type to search QBO accounts…' : 'Type QBO account name (import COA for dropdown)'}
                      value={matched ? newMappings[src] : search}
                      onChange={e => {
                        setMapSearch(m => ({ ...m, [src]: e.target.value }))
                        setNewMappings(m => ({ ...m, [src]: '' }))
                      }}
                      style={{ ...inputStyle, width: '100%', boxSizing: 'border-box',
                        border: matched ? '1px solid #4caf50' : undefined }}
                    />
                    {matched && (
                      <span style={{ position: 'absolute', right: 8, top: 6, fontSize: 11, color: '#4caf50' }}>✓</span>
                    )}
                    {search && !matched && filtered.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                        background: '#1e2a3a', border: '1px solid #3a5070', borderRadius: '0 0 6px 6px',
                        maxHeight: 200, overflowY: 'auto',
                      }}>
                        {filtered.map(a => (
                          <div key={a.account_name}
                            onClick={() => {
                              setNewMappings(m => ({ ...m, [src]: a.account_name }))
                              setMapSearch(m => ({ ...m, [src]: '' }))
                            }}
                            style={{
                              padding: '6px 12px', cursor: 'pointer', fontSize: 11,
                              color: '#cce', borderBottom: '1px solid #2a3a50',
                              display: 'flex', justifyContent: 'space-between',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#2a3a50'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <span>{a.account_name}</span>
                            <span style={{ color: '#7a9ab0', fontSize: 10 }}>{a.account_type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {search && !matched && filtered.length === 0 && coaAccounts.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: '#1e2a3a', border: '1px solid #3a5070', borderRadius: '0 0 6px 6px',
                        padding: '8px 12px', fontSize: 11, color: '#7a9ab0',
                      }}>No matches — will save as typed</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: 10, color: C.g, marginTop: 6 }}>
            Mappings save permanently to iif_account_map when you post.{' '}
            {coaAccounts.length === 0 && <span style={{ color: C.go }}>Import your COA below for dropdown search.</span>}
          </div>
        </div>
      )}
      {jeLines.length > 0 && (
        <>
          <JETable
            lines={jeLines}
            C={C}
            journalNum={getJENumber()}
            dateLabel={uploadMode === 'weekly' ? `FLEX Weekly · ${getDateRangeLabel()} · Period ${period}` : `FLEX ${periodEndType.charAt(0).toUpperCase()+periodEndType.slice(1)} True-Up · ${getLineMemo().split(' · ')[1] || period}`}
            memo={getLineMemo()}
          />
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => handlePost(false)}
                disabled={hasUnmapped || posting}
                style={{
                  background: hasUnmapped ? C.bdr : C.go, border: 'none', color: '#fff',
                  padding: '8px 24px', borderRadius: 7, cursor: hasUnmapped ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  opacity: hasUnmapped ? 0.5 : 1,
                }}
              >{posting ? 'Posting…' : 'Post to History'}</button>
              {postMsg && !postMsg.imbalance && (
                <span style={{ fontSize: 11, color: postMsg.ok ? '#6ab87a' : '#e07070' }}>
                  {postMsg.ok ? '✓' : '⚠'} {postMsg.msg}
                </span>
              )}
            </div>
            {postMsg && postMsg.imbalance && (
              <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 6, background: '#3a1a1a', border: '1px solid #f87171' }}>
                <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>⚠ {postMsg.msg}</div>
                <button onClick={() => handlePost(true)} disabled={posting} style={{
                  background: '#7c3aed', border: 'none', color: '#fff',
                  borderRadius: 6, padding: '6px 16px', fontSize: 11,
                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                }}>⚠ Force Post Anyway</button>
                <span style={{ marginLeft: 10, fontSize: 10, color: '#f87171' }}>
                  Use only if the source file has a known rounding or split difference
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {parsedData && jeLines.length === 0 && uploadMode === 'weekly' && (
        <div style={{ fontSize: 12, color: '#6ab87a', padding: '12px 0' }}>
          ✓ All accounts fully posted for period {period}. Nothing new to post.
        </div>
      )}
      {parsedData && jeLines.length === 0 && uploadMode === 'periodend' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#6ab87a', padding: '8px 0' }}>
            ✓ No delta — period totals match weekly posts exactly.
          </div>
          <button
            onClick={() => handlePost(false)}
            disabled={posting}
            style={{ background: C.go, border: 'none', color: '#fff', padding: '8px 24px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', marginTop: 8 }}
          >{posting ? 'Posting…' : 'Post Period-End to History'}</button>
          {postMsg && (
            <span style={{ fontSize: 11, color: postMsg.ok ? '#6ab87a' : '#e07070', marginLeft: 12 }}>
              {postMsg.ok ? '✓' : '⚠'} {postMsg.msg}
            </span>
          )}
        </div>
      )}
      {accountMap.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowMapEditor(v => !v)}
            style={{ background: 'transparent', border: `1px solid ${C.bdrF}`, color: C.g, padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
          >{showMapEditor ? '▲ Hide' : '▼ View'} Account Map ({accountMap.length} entries)</button>
          {showMapEditor && (
            <div style={{ marginTop: 10, background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 8, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                <thead style={{ position: 'sticky', top: 0, background: C.bg }}>
                  <tr>
                    <th style={{ textAlign: 'left', color: C.g, padding: '8px 12px' }}>IIF Source Account</th>
                    <th style={{ textAlign: 'left', color: C.g, padding: '8px 12px' }}>QBO Account</th>
                  </tr>
                </thead>
                <tbody>
                  {[...accountMap].sort((a, b) => (a.source_account || '').localeCompare(b.source_account || '')).map((r, i) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${C.bdrF}`, background: i % 2 === 0 ? 'transparent' : C.bg + '88' }}>
                      <td style={{ color: '#e07070', padding: '5px 12px' }}>{r.source_account}</td>
                      <td style={{ color: C.w, padding: '5px 12px' }}>{r.qbo_account}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.g }}>
            📋 COA: {coaAccounts.length} accounts loaded
          </span>
          <button
            onClick={() => setShowCoaImport(v => !v)}
            style={{ background: 'transparent', border: `1px solid ${C.bdrF}`, color: C.go,
              padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}
          >{showCoaImport ? '▲ Cancel' : coaAccounts.length ? '↻ Re-import COA' : '⬆ Import COA'}</button>
        </div>
        {showCoaImport && (
          <div style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 12, color: C.w, marginBottom: 8 }}>
              Upload the Account List CSV exported from QBO. Re-import any time the COA changes.
            </div>
            <input type="file" accept=".csv"
              onChange={async e => {
                const file = e.target.files[0]
                if (!file) return
                const text = await file.text()
                await importCOA(text)
              }}
              style={{ fontSize: 11, color: C.w }}
            />
            {coaImporting && <div style={{ fontSize: 11, color: C.go, marginTop: 8 }}>Importing…</div>}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 16, padding: '10px 14px', borderLeft: `3px solid ${C.go}`,
        background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g,
      }}>
        <strong style={{ color: C.go }}>Sidebar:</strong> IIF is cumulative. Delta logic subtracts what's already in history so you don't double-post. Unmapped accounts block posting. Map once, never again.
      </div>

      {/* ── INLINE HISTORY ── oldest first, newest at bottom */}
      {history.length > 0 && (() => {
        // Group by je_number
        const byJE = {}
        history.forEach(r => {
          const key = r.je_number || r.file_name || r.period + '-legacy'
          if (!byJE[key]) byJE[key] = { je_number: r.je_number || key, file_name: r.file_name || '', period: r.period, upload_mode: r.upload_mode || 'weekly', memo: r.memo || '', posted_at: r.posted_at, lines: [] }
          byJE[key].lines.push(r)
        })
        const jeList = Object.entries(byJE).sort(([, a], [, b]) => {
          const pCmp = (b.period || '').localeCompare(a.period || '')
          if (pCmp !== 0) return pCmp
          const aW = a.upload_mode === 'weekly' || !a.upload_mode
          const bW = b.upload_mode === 'weekly' || !b.upload_mode
          if (aW && !bW) return -1
          if (!aW && bW) return 1
          return (b.posted_at || '').localeCompare(a.posted_at || '')
        })
        return (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.go, marginBottom: 10, letterSpacing: '0.5px' }}>
              {'POSTED ENTRIES — ' + jeList.length + ' total'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jeList.map(([key, je]) => {
                const isOpen = expandedInline[key]
                const jeDr = je.lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0)
                const jeCr = je.lines.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0)
                const balanced = Math.abs(jeDr - jeCr) < 0.01
                const isWeekly = je.upload_mode === 'weekly' || !je.upload_mode
                const modeColor = isWeekly ? '#6ab87a' : '#9a6ac4'
                const modeLabel = isWeekly ? 'Weekly' : 'Period-End'
                return (
                  <div key={key} style={{ background: C.bg2, border: '1px solid ' + C.bdr, borderRadius: 10, overflow: 'hidden' }}>
                    <div onClick={() => setExpandedInline(e => ({ ...e, [key]: !e[key] }))} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', cursor: 'pointer', background: isOpen ? C.gD : 'transparent', borderBottom: isOpen ? '1px solid ' + C.bdr : 'none' }}>
                      <span style={{ fontSize: 11, color: C.g, width: 14 }}>{isOpen ? '▼' : '▶'}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.go, flex: 1, minWidth: 200 }}>{je.je_number}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: modeColor, border: '1px solid ' + modeColor, borderRadius: 4, padding: '1px 6px' }}>{modeLabel}</span>
                      <span style={{ fontSize: 10, color: C.g, fontFamily: "'DM Mono', monospace" }}>
                        {'DR: '}<span style={{ color: '#6ab87a' }}>{'$' + fmt(jeDr)}</span>
                        {'  CR: '}<span style={{ color: '#e07070' }}>{'$' + fmt(jeCr)}</span>
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: balanced ? '#6ab87a' : '#e07070' }}>{balanced ? '✓' : '⚠ OFF $' + fmt(Math.abs(jeDr - jeCr))}</span>
                      <span style={{ fontSize: 9, color: C.g }}>{je.period}</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '12px 16px' }}>
                        {je.memo && <div style={{ fontSize: 10, color: C.g, marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>{'Note: ' + je.memo}</div>}
                        {je.file_name && <div style={{ fontSize: 10, color: C.g, marginBottom: 10 }}>{'File: ' + je.file_name}</div>}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid ' + C.bdr }}>
                              <th style={{ textAlign: 'left', color: C.g, padding: '4px 0', fontWeight: 600, width: 60 }}>Acct #</th>
                              <th style={{ textAlign: 'left', color: C.g, padding: '4px 8px', fontWeight: 600 }}>Account Name</th>
                              <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 110 }}>Debit</th>
                              <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 110 }}>Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...je.lines].sort((a, b) => {
                              const na = acctNumMapInline[a.source_account] || '99999'
                              const nb = acctNumMapInline[b.source_account] || '99999'
                              return parseFloat(na) - parseFloat(nb)
                            }).map((l, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid ' + C.bdrF }}>
                                <td style={{ color: C.go, padding: '4px 0', fontSize: 10, fontFamily: "'DM Mono', monospace" }}>{acctNumMapInline[l.source_account] || ''}</td>
                                <td style={{ color: C.w, padding: '4px 8px', wordBreak: 'break-word' }}>{l.qbo_account || l.source_account}</td>
                                <td style={{ textAlign: 'right', color: '#6ab87a', padding: '4px 0' }}>{l.amount > 0 ? fmt(l.amount) : ''}</td>
                                <td style={{ textAlign: 'right', color: '#e07070', padding: '4px 0' }}>{l.amount < 0 ? fmt(Math.abs(l.amount)) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: '1px solid ' + C.bdr }}>
                              <td></td>
                              <td style={{ color: C.g, fontSize: 10, padding: '4px 8px' }}>TOTALS</td>
                              <td style={{ textAlign: 'right', color: '#6ab87a', fontWeight: 700, padding: '4px 0' }}>{'$' + fmt(jeDr)}</td>
                              <td style={{ textAlign: 'right', color: '#e07070', fontWeight: 700, padding: '4px 0' }}>{'$' + fmt(jeCr)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        {je.posted_at && <div style={{ fontSize: 9, color: C.g, marginTop: 8 }}>{'Posted: ' + new Date(je.posted_at).toLocaleString()}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── RECURRING JE TAB (Supabase-live) ────────────────────────────────────────
function RecurringJETab({ orgId, C }) {
  const [templates, setTemplates]   = useState([])
  const [lines, setLines]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [jeMonth, setJeMonth]       = useState(new Date().getMonth() + 1)
  const [jeYear, setJeYear]         = useState(new Date().getFullYear())
  const [utilOverrides, setUtilOverrides] = useState({})
  // ── Pencil edit for fixed-amount lines ──
  const [editingLine, setEditingLine] = useState(null)
  const [editAmt, setEditAmt]         = useState('')
  const [savingLine, setSavingLine]   = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: tmplData }, { data: lineData }] = await Promise.all([
        supabase.from('recurring_je_templates').select('*').eq('org_id', orgId).order('code'),
        supabase.from('recurring_je_lines').select('*').eq('org_id', orgId).order('sort_order'),
      ])
      setTemplates(tmplData || [])
      setLines(lineData || [])
      if (tmplData?.length) setSelectedId(tmplData[0].id)
      setLoading(false)
    }
    load()
  }, [orgId])

  const activeTemplate = templates.find(t => t.id === selectedId)
  const activeLines    = lines.filter(l => l.template_id === selectedId)

  const displayLines = activeLines.map(l => ({
    acct:     l.acct_number,
    name:     l.acct_name,
    dr:       l.is_debit,
    amount:   l.is_editable
      ? (parseFloat(utilOverrides[l.id]) || 0)
      : l.is_total
        ? activeLines.filter(x => x.is_editable).reduce((s, x) => s + (parseFloat(utilOverrides[x.id]) || 0), 0)
        : (l.amount || 0),
    editable: l.is_editable,
    is_total: l.is_total,
    id:       l.id,
  }))

  const mm        = mmPad(jeMonth)
  const monthName = MONTHS[jeMonth - 1]
  const journalNum = activeTemplate ? `KK ${activeTemplate.code} ${jeYear} ${mm}` : ''
  const timing     = activeTemplate?.timing || ''
  const dateLabel  = timing === 'Last day of month'
    ? `Last day of ${monthName} ${jeYear}`
    : `15th of ${monthName} ${jeYear}`

  async function saveLineEdit(lineId) {
    setSavingLine(true)
    const newAmt = parseFloat(editAmt)
    if (!isNaN(newAmt)) {
      const { error } = await supabase
        .from('recurring_je_lines')
        .update({ amount: newAmt })
        .eq('id', lineId)
      if (!error) setLines(prev => prev.map(l => l.id === lineId ? { ...l, amount: newAmt } : l))
    }
    setEditingLine(null)
    setEditAmt('')
    setSavingLine(false)
  }

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
    borderRadius: 6, padding: '6px 8px', fontSize: 11,
    fontFamily: "'DM Mono', monospace", width: '100%', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }

  if (loading) return <p style={{ fontSize: 12, color: C.g }}>Loading recurring entries…</p>

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{
        background: C.bg2, border: `1px solid ${C.bdr}`,
        borderRadius: 10, padding: 16, minWidth: 220, maxWidth: 280, flex: '0 0 auto',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.go, marginBottom: 12, letterSpacing: '0.5px' }}>GENERATE JE</div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Entry Type</label>
          {templates.map(t => (
            <button key={t.id} onClick={() => setSelectedId(t.id)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: selectedId === t.id ? C.gD : 'transparent',
              border: `1px solid ${selectedId === t.id ? C.go : C.bdrF}`,
              color: selectedId === t.id ? C.go : C.w,
              padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
              fontSize: 11, fontFamily: 'inherit', marginBottom: 5,
            }}>
              <div style={{ fontWeight: 600 }}>{t.label}</div>
              <div style={{ fontSize: 9, color: C.g, marginTop: 2 }}>{t.timing}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 2 }}>
            <label style={labelStyle}>Month</label>
            <select value={jeMonth} onChange={e => setJeMonth(Number(e.target.value))} style={inputStyle}>
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Year</label>
            <select value={jeYear} onChange={e => setJeYear(Number(e.target.value))} style={inputStyle}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        {activeLines.some(l => l.is_editable) && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>This Month's Allocation</label>
            <div style={{ fontSize: 9, color: C.g, marginBottom: 6, lineHeight: 1.5 }}>From your monthly FLEX export.</div>
            {activeLines.filter(l => l.is_editable).map(l => (
              <div key={l.id} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 3 }}>{l.acct_name}</label>
                <input
                  type="number" placeholder="0.00" inputMode="decimal"
                  value={utilOverrides[l.id] || ''}
                  onChange={e => setUtilOverrides(prev => ({ ...prev, [l.id]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: C.g, borderTop: `1px solid ${C.bdr}`, paddingTop: 10, lineHeight: 1.6 }}>
          No CSV. No import.<br />Key directly into QBO.
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 320 }}>
        {activeTemplate && (
          <JETable
            lines={displayLines} C={C}
            journalNum={journalNum} dateLabel={dateLabel}
            memo={`${activeTemplate.label} — ${monthName} ${jeYear} — Enter manually in QBO`}
          />
        )}
        {activeLines.filter(l => !l.is_editable && !l.is_total).length > 0 && (
          <div style={{
            marginTop: 14, background: C.bg2, border: `1px solid ${C.bdr}`,
            borderRadius: 10, padding: '12px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.go, marginBottom: 6 }}>✏️ Edit Fixed Amounts</div>
            <div style={{ fontSize: 10, color: C.g, marginBottom: 10, lineHeight: 1.5 }}>
              Saves to Supabase permanently — update when CPA gives you new numbers.
            </div>
            {activeLines.filter(l => !l.is_editable && !l.is_total).map(l => (
              <div key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 0', borderBottom: `1px solid ${C.bdrF}`,
              }}>
                <span style={{ flex: 1, fontSize: 11, color: C.w }}>{l.acct_name}</span>
                {editingLine === l.id ? (
                  <>
                    <input
                      type="number" step="0.01"
                      value={editAmt}
                      onChange={e => setEditAmt(e.target.value)}
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveLineEdit(l.id)
                        if (e.key === 'Escape') { setEditingLine(null); setEditAmt('') }
                      }}
                      style={{ ...inputStyle, width: 110, padding: '4px 8px' }}
                    />
                    <button onClick={() => saveLineEdit(l.id)} disabled={savingLine} style={{
                      background: C.go, border: 'none', color: '#fff',
                      borderRadius: 5, padding: '4px 10px', fontSize: 10,
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                    }}>{savingLine ? '…' : 'Save'}</button>
                    <button onClick={() => { setEditingLine(null); setEditAmt('') }} style={{
                      background: 'transparent', border: `1px solid ${C.bdr}`, color: C.g,
                      borderRadius: 5, padding: '4px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                    }}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: C.go, fontFamily: "'DM Mono', monospace", minWidth: 90, textAlign: 'right' }}>
                      ${fmt(l.amount || 0)}
                    </span>
                    <button onClick={() => { setEditingLine(l.id); setEditAmt(String(l.amount || 0)) }} style={{
                      background: 'transparent', border: `1px solid ${C.bdrF}`, color: C.g,
                      borderRadius: 5, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                    }}>✏️</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{
          marginTop: 12, padding: '10px 14px',
          borderLeft: `3px solid ${C.go}`,
          background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g,
        }}>
          <strong style={{ color: C.go }}>Sidebar:</strong> QBO recurring entries are OFF. FlowSuite is the source. Fixed amounts save to Supabase — no deploy needed to change a number.
        </div>
      </div>
    </div>
  )
}

// ─── MONTHLY CLOSE CHECKLIST TAB ─────────────────────────────────────────────
function CloseChecklistTab({ orgId, C }) {
  const [templates, setTemplates] = useState([])
  const [lines, setLines]         = useState([])
  const [log, setLog]             = useState([])
  const [allLog, setAllLog]       = useState([])  // all periods — for stale detection
  const [loading, setLoading]     = useState(true)
  const [period, setPeriod]       = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [utilOpen, setUtilOpen]       = useState({})   // template_id → bool
  const [utilAmounts, setUtilAmounts] = useState({})   // line_id → amount
  const [postState, setPostState]     = useState({})   // key → {posting, noteOpen, noteText}
  const [addingOneoff, setAddingOneoff] = useState(false)
  const [oneoffForm, setOneoffForm]   = useState({ label: '', amount: '', note: '' })
  const [savingOneoff, setSavingOneoff] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: tmplData }, { data: lineData }, { data: logData }, { data: allLogData }] = await Promise.all([
        supabase.from('recurring_je_templates').select('*').eq('org_id', orgId).order('code'),
        supabase.from('recurring_je_lines').select('*').eq('org_id', orgId).order('sort_order'),
        supabase.from('moneyflow_close_log').select('*').eq('org_id', orgId).eq('period', period).order('created_at'),
        supabase.from('moneyflow_close_log').select('id,period,entry_type,label,posted_at').eq('org_id', orgId).order('period'),
      ])
      setTemplates(tmplData || [])
      setLines(lineData || [])
      setLog(logData || [])
      setAllLog(allLogData || [])
      setLoading(false)
    }
    load()
  }, [orgId, period])

  // ── Does this template apply to the selected period? ──
  function templateApplies(t) {
    if (t.start_period && period < t.start_period) return false
    if (t.end_period && period > t.end_period) return false
    return true
  }

  const activeTemplates = templates.filter(templateApplies)

  // ── Stale periods: prior periods with unposted items ──
  function getStalePeriods() {
    const allPeriods = [...new Set(allLog.map(r => r.period))].filter(p => p < period).sort()
    return allPeriods.filter(p => {
      const periodEntries = allLog.filter(r => r.period === p)
      return periodEntries.some(r => !r.posted_at)
    })
  }
  const stalePeriods = getStalePeriods()

  // ── Helpers ──
  function logKey(type, id) { return `${type}::${id || 'x'}` }
  function getLogEntry(type, templateId) {
    return log.find(r => r.entry_type === type &&
      (templateId ? r.template_id === templateId : !r.template_id))
  }
  function getIIFEntries() { return log.filter(r => r.source === 'iif' || r.entry_type === 'iif') }
  function getIIFEntry() { return getIIFEntries()[0] || null } // keep for backward compat
  function ps(key) { return postState[key] || {} }
  function setPs(key, patch) { setPostState(prev => ({ ...prev, [key]: { ...ps(key), ...patch } })) }

  async function markPosted(entryType, templateId, label, amount) {
    const key = logKey(entryType, templateId)
    const note = ps(key).noteText || ''
    setPs(key, { posting: true })
    const row = {
      org_id: orgId, period, entry_type: entryType,
      template_id: templateId || null, label,
      amount: amount || null, note: note.trim() || null,
      posted_at: new Date().toISOString(), source: 'manual',
    }
    const { data, error } = await supabase.from('moneyflow_close_log').insert([row]).select()
    if (!error && data) {
      setLog(prev => [...prev, data[0]])
      setAllLog(prev => [...prev, data[0]])
      setPs(key, { posting: false, noteOpen: false, noteText: '' })
    } else {
      setPs(key, { posting: false })
    }
  }

  async function markIIFPosted(entry) {
    const key = logKey('iif', entry.id)
    const note = ps(key).noteText || ''
    setPs(key, { posting: true })
    const { error } = await supabase
      .from('moneyflow_close_log')
      .update({ posted_at: new Date().toISOString(), note: note.trim() || null })
      .eq('id', entry.id)
    if (!error) {
      setLog(prev => prev.map(r => r.id === entry.id ? { ...r, posted_at: new Date().toISOString(), note: note.trim() || null } : r))
      setAllLog(prev => prev.map(r => r.id === entry.id ? { ...r, posted_at: new Date().toISOString() } : r))
      setPs(key, { posting: false, noteOpen: false, noteText: '' })
    } else {
      setPs(key, { posting: false })
    }
  }

  async function unpost(logId) {
    await supabase.from('moneyflow_close_log').delete().eq('id', logId)
    setLog(prev => prev.filter(r => r.id !== logId))
    setAllLog(prev => prev.filter(r => r.id !== logId))
  }

  async function unpostUpdate(logId) {
    await supabase.from('moneyflow_close_log').update({ posted_at: null, note: null }).eq('id', logId)
    setLog(prev => prev.map(r => r.id === logId ? { ...r, posted_at: null, note: null } : r))
    setAllLog(prev => prev.map(r => r.id === logId ? { ...r, posted_at: null } : r))
  }

  async function saveOneoff() {
    if (!oneoffForm.label.trim()) return
    setSavingOneoff(true)
    const row = {
      org_id: orgId, period, entry_type: 'oneoff', template_id: null,
      label: oneoffForm.label.trim(),
      amount: oneoffForm.amount ? parseFloat(oneoffForm.amount) : null,
      note: oneoffForm.note.trim() || null, posted_at: null, source: 'manual',
    }
    const { data, error } = await supabase.from('moneyflow_close_log').insert([row]).select()
    if (!error && data) {
      setLog(prev => [...prev, data[0]])
      setAllLog(prev => [...prev, data[0]])
      setOneoffForm({ label: '', amount: '', note: '' })
      setAddingOneoff(false)
    }
    setSavingOneoff(false)
  }

  // ── Derived counts ──
  const iifEntry      = getIIFEntry()
  const iifEntries    = getIIFEntries()
  const oneoffEntries = log.filter(r => r.entry_type === 'oneoff')
  const totalItems    = activeTemplates.length + iifEntries.length + oneoffEntries.length
  const postedCount   = activeTemplates.filter(t => !!getLogEntry('recurring', t.id)).length
    + iifEntries.filter(e => e.posted_at).length
    + oneoffEntries.filter(r => r.posted_at).length

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
    borderRadius: 6, padding: '6px 10px', fontSize: 11,
    fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }

  // ── Reusable post/unpost row controls ──
  function PostControls({ entryKey, posted, postedAt, postedNote, onPost, onUnpost }) {
    const state = ps(entryKey)
    if (posted) return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, color: '#6ab87a' }}>
          ✓ {new Date(postedAt).toLocaleDateString()}
          {postedNote && <span style={{ color: C.g }}> · {postedNote}</span>}
        </div>
        <button onClick={onUnpost} style={{
          background: 'transparent', border: `1px solid ${C.bdrF}`, color: C.g,
          borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
        }}>↩ Undo</button>
      </div>
    )
    if (state.noteOpen) return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Note (optional)"
          value={state.noteText || ''}
          onChange={e => setPs(entryKey, { noteText: e.target.value })}
          style={{ ...inputStyle, width: 180, padding: '4px 8px' }}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') onPost() }}
        />
        <button onClick={onPost} disabled={state.posting} style={{
          background: C.go, border: 'none', color: '#fff',
          borderRadius: 5, padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
        }}>{state.posting ? '…' : '✓ Post'}</button>
        <button onClick={() => setPs(entryKey, { noteOpen: false, noteText: '' })} style={{
          background: 'transparent', border: `1px solid ${C.bdr}`, color: C.g,
          borderRadius: 5, padding: '5px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
        }}>✕</button>
      </div>
    )
    return (
      <button onClick={() => setPs(entryKey, { noteOpen: true })} style={{
        background: C.go, border: 'none', color: '#fff',
        borderRadius: 6, padding: '5px 14px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
      }}>Mark Posted</button>
    )
  }

  if (loading) return <p style={{ fontSize: 12, color: C.g }}>Loading close checklist…</p>

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Period</label>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            style={{ ...inputStyle, width: 160 }} />
        </div>
        <div style={{
          background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 8,
          padding: '10px 16px', display: 'flex', gap: 20, alignItems: 'center',
        }}>
          <div>
            <div style={labelStyle}>Progress</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: postedCount === totalItems && totalItems > 0 ? '#6ab87a' : C.go }}>
              {postedCount} of {totalItems} posted
            </div>
          </div>
          {postedCount === totalItems && totalItems > 0 && (
            <div style={{ fontSize: 13, color: '#6ab87a', fontWeight: 700 }}>✓ Period closed!</div>
          )}
        </div>
      </div>
      {totalItems > 0 && (
        <div style={{ background: C.bdr, borderRadius: 4, height: 6, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4, background: C.go,
            width: `${(postedCount / totalItems) * 100}%`, transition: 'width 0.4s ease',
          }} />
        </div>
      )}
      {iifEntries.length > 0 && (() => {
        const periodDr = iifEntries.reduce((s, e) => s + (e.amount || 0), 0)
        const weekCount = iifEntries.filter(e => e.source === 'iif').length
        return (
          <div style={{
            background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 8,
            padding: '10px 16px', marginBottom: 16,
            display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              IIF / AR Sales This Period
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace" }}>
              <span style={{ fontSize: 10, color: C.g }}>DR Total: </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#6ab87a' }}>${fmt(periodDr)}</span>
            </div>
            <div style={{ fontSize: 10, color: C.g }}>
              {weekCount} file{weekCount !== 1 ? 's' : ''} posted
            </div>
          </div>
        )
      })()}
      {stalePeriods.length > 0 && (
        <div style={{
          background: '#3a2a10', border: '1px solid #c4956a', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, color: '#c4956a', fontWeight: 700, marginBottom: 6 }}>
            ⚠ {stalePeriods.length} prior period{stalePeriods.length > 1 ? 's' : ''} with unposted items
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stalePeriods.map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                background: '#c4956a22', border: '1px solid #c4956a', color: '#c4956a',
                borderRadius: 5, padding: '3px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
              }}>{p} →</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.go, marginBottom: 10, letterSpacing: '0.5px' }}>RECURRING ENTRIES</div>
      {activeTemplates.length === 0 && (
        <div style={{ fontSize: 11, color: C.g, marginBottom: 12 }}>
          No recurring entries apply to this period. Check start/end months in Recurring JEs tab.
        </div>
      )}
      {activeTemplates.map(t => {
        const posted    = getLogEntry('recurring', t.id)
        const isUtil    = lines.filter(l => l.template_id === t.id).some(l => l.is_editable)
        const utilLines = lines.filter(l => l.template_id === t.id && l.is_editable)
        const fixedLines = lines.filter(l => l.template_id === t.id && !l.is_editable && !l.is_total)
        const fixedDr   = fixedLines.filter(l => l.is_debit).reduce((s, l) => s + Math.abs(l.amount || 0), 0)
        const fixedCr   = fixedLines.filter(l => !l.is_debit).reduce((s, l) => s + Math.abs(l.amount || 0), 0)
        const fixedAmt  = fixedDr || fixedCr  // show whichever side has value (they should match)
        const utilAmt   = utilLines.reduce((s, l) => s + (parseFloat(utilAmounts[l.id]) || 0), 0)
        const displayAmt = isUtil ? utilAmt : fixedDr  // show DR side (= CR side for balanced JE)
        const displayDr = fixedDr
        const displayCr = fixedCr
        const key = logKey('recurring', t.id)
        const isUtilOpen = utilOpen[t.id]

        return (
          <div key={t.id} style={{
            background: posted ? `${C.go}11` : C.bg2,
            border: `1px solid ${posted ? C.go : C.bdr}`,
            borderRadius: 10, padding: '12px 16px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: posted ? '#6ab87a' : '#555' }} />
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: posted ? '#6ab87a' : C.w }}>{t.label}</div>
                <div style={{ fontSize: 10, color: C.g }}>{t.timing}
                  {t.start_period && <span> · {t.start_period}{t.end_period ? ` – ${t.end_period}` : ' – ongoing'}</span>}
                </div>
                {isUtil && !posted && utilAmt === 0 && (
                  <div style={{ fontSize: 10, color: '#e0a050', marginTop: 2 }}>⚠ Enter amounts below before posting</div>
                )}
                {!isUtil && (displayDr > 0 || displayCr > 0) && (
                  <div style={{ fontSize: 11, color: C.go, fontFamily: "'DM Mono', monospace", display:'flex', gap:12 }}>
                    {displayDr > 0 && <span>DR ${fmt(displayDr)}</span>}
                    {displayCr > 0 && <span>CR ${fmt(displayCr)}</span>}
                  </div>
                )}
                {isUtil && displayAmt > 0 && (
                  <div style={{ fontSize: 11, color: C.go, fontFamily: "'DM Mono', monospace" }}>${fmt(displayAmt)}</div>
                )}
              </div>
              <PostControls
                entryKey={key}
                posted={!!posted}
                postedAt={posted?.posted_at}
                postedNote={posted?.note}
                onPost={() => markPosted('recurring', t.id, t.label, displayAmt || null)}
                onUnpost={() => unpost(posted.id)}
              />
            </div>
            {isUtil && !posted && (
              <div style={{ marginTop: 10 }}>
                <button onClick={() => setUtilOpen(prev => ({ ...prev, [t.id]: !prev[t.id] }))} style={{
                  background: 'transparent', border: `1px solid ${C.bdrF}`, color: C.go,
                  borderRadius: 5, padding: '3px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                }}>{isUtilOpen ? '▲ Hide' : '▼ Enter Amounts'}</button>
                {isUtilOpen && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {utilLines.map(l => (
                      <div key={l.id} style={{ minWidth: 140 }}>
                        <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 3 }}>{l.acct_name}</label>
                        <input
                          type="number" placeholder="0.00" inputMode="decimal"
                          value={utilAmounts[l.id] || ''}
                          onChange={e => setUtilAmounts(prev => ({ ...prev, [l.id]: e.target.value }))}
                          style={{ ...inputStyle, width: '100%' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {iifEntries.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.go, margin: '20px 0 10px', letterSpacing: '0.5px' }}>
            IIF / AR SALES
            <span style={{ fontSize: 10, color: C.g, fontWeight: 400, marginLeft: 8 }}>Auto-populated when IIF file is posted · {iifEntries.length} file{iifEntries.length !== 1 ? 's' : ''} this period</span>
          </div>
          {iifEntries.map(entry => (
            <div key={entry.id} style={{
              background: entry.posted_at ? `${C.go}11` : C.bg2,
              border: `1px solid ${entry.posted_at ? C.go : C.bdr}`,
              borderRadius: 10, padding: '12px 16px', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: entry.posted_at ? '#6ab87a' : '#e0a050' }} />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: entry.posted_at ? '#6ab87a' : C.w }}>{entry.label}</div>
                  {!entry.posted_at && <div style={{ fontSize: 10, color: '#e0a050' }}>IIF uploaded — confirm when entered in QBO</div>}
                  {entry.amount && <div style={{ fontSize: 11, color: C.go, fontFamily: "'DM Mono', monospace" }}>${fmt(entry.amount)}</div>}
                </div>
                <PostControls
                  entryKey={logKey('iif', entry.id)}
                  posted={!!entry.posted_at}
                  postedAt={entry.posted_at}
                  postedNote={entry.note}
                  onPost={() => markIIFPosted(entry)}
                  onUnpost={() => unpostUpdate(entry.id)}
                />
              </div>
            </div>
          ))}
        </>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.go, margin: '20px 0 10px', letterSpacing: '0.5px' }}>
        ONE-OFF ENTRIES
        <span style={{ fontSize: 10, color: C.g, fontWeight: 400, marginLeft: 8 }}>CPA adjustments, FLEX surprises, anything extra</span>
      </div>

      {oneoffEntries.length === 0 && !addingOneoff && (
        <div style={{ fontSize: 11, color: C.g, marginBottom: 10 }}>No one-off entries this period.</div>
      )}

      {oneoffEntries.map(entry => {
        const key = logKey('oneoff-post', entry.id)
        const state = ps(key)
        return (
          <div key={entry.id} style={{
            background: entry.posted_at ? `${C.go}11` : C.bg2,
            border: `1px solid ${entry.posted_at ? C.go : C.bdr}`,
            borderRadius: 10, padding: '12px 16px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: entry.posted_at ? '#6ab87a' : '#555' }} />
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: entry.posted_at ? '#6ab87a' : C.w }}>{entry.label}</div>
                {entry.amount && <div style={{ fontSize: 11, color: C.go, fontFamily: "'DM Mono', monospace" }}>${fmt(entry.amount)}</div>}
                {entry.note && !entry.posted_at && <div style={{ fontSize: 10, color: C.g }}>{entry.note}</div>}
              </div>
              {entry.posted_at ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: '#6ab87a' }}>
                    ✓ {new Date(entry.posted_at).toLocaleDateString()}
                    {entry.note && <span style={{ color: C.g }}> · {entry.note}</span>}
                  </div>
                  <button onClick={() => unpost(entry.id)} style={{
                    background: 'transparent', border: `1px solid ${C.bdrF}`, color: C.g,
                    borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                  }}>↩ Undo</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {state.noteOpen ? (
                    <>
                      <input placeholder="Note (optional)" value={state.noteText || ''}
                        onChange={e => setPs(key, { noteText: e.target.value })}
                        style={{ ...inputStyle, width: 180, padding: '4px 8px' }} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') {
                          supabase.from('moneyflow_close_log')
                            .update({ posted_at: new Date().toISOString(), note: state.noteText || null })
                            .eq('id', entry.id).then(() => {
                              setLog(prev => prev.map(r => r.id === entry.id ? { ...r, posted_at: new Date().toISOString() } : r))
                              setPs(key, { noteOpen: false, noteText: '' })
                            })
                        }}}
                      />
                      <button onClick={async () => {
                        setPs(key, { posting: true })
                        await supabase.from('moneyflow_close_log')
                          .update({ posted_at: new Date().toISOString(), note: state.noteText || null })
                          .eq('id', entry.id)
                        setLog(prev => prev.map(r => r.id === entry.id ? { ...r, posted_at: new Date().toISOString() } : r))
                        setAllLog(prev => prev.map(r => r.id === entry.id ? { ...r, posted_at: new Date().toISOString() } : r))
                        setPs(key, { posting: false, noteOpen: false, noteText: '' })
                      }} disabled={state.posting} style={{
                        background: C.go, border: 'none', color: '#fff',
                        borderRadius: 5, padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                      }}>{state.posting ? '…' : '✓ Post'}</button>
                      <button onClick={() => setPs(key, { noteOpen: false, noteText: '' })} style={{
                        background: 'transparent', border: `1px solid ${C.bdr}`, color: C.g,
                        borderRadius: 5, padding: '5px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                      }}>✕</button>
                    </>
                  ) : (
                    <button onClick={() => setPs(key, { noteOpen: true })} style={{
                      background: C.go, border: 'none', color: '#fff',
                      borderRadius: 6, padding: '5px 14px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                    }}>Mark Posted</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {addingOneoff ? (
        <div style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: '14px 16px', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.go, marginBottom: 12 }}>+ New One-Off Entry</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: 160 }}>
              <label style={labelStyle}>Label *</label>
              <input placeholder="e.g. CPA year-end adjustment" value={oneoffForm.label}
                onChange={e => setOneoffForm(f => ({ ...f, label: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ minWidth: 110 }}>
              <label style={labelStyle}>Amount</label>
              <input type="number" placeholder="0.00" inputMode="decimal" value={oneoffForm.amount}
                onChange={e => setOneoffForm(f => ({ ...f, amount: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ flex: 2, minWidth: 160 }}>
              <label style={labelStyle}>Note</label>
              <input placeholder="Optional" value={oneoffForm.note}
                onChange={e => setOneoffForm(f => ({ ...f, note: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            <button onClick={saveOneoff} disabled={savingOneoff || !oneoffForm.label.trim()} style={{
              background: C.go, border: 'none', color: '#fff', borderRadius: 6, padding: '7px 16px',
              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
              opacity: !oneoffForm.label.trim() ? 0.5 : 1,
            }}>{savingOneoff ? 'Adding…' : 'Add Entry'}</button>
            <button onClick={() => setAddingOneoff(false)} style={{
              background: 'transparent', border: `1px solid ${C.bdr}`, color: C.g,
              borderRadius: 6, padding: '7px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddingOneoff(true)} style={{
          background: 'transparent', border: `1px dashed ${C.bdrF}`, color: C.go,
          borderRadius: 8, padding: '8px 18px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, marginBottom: 8,
        }}>+ Add One-Off Entry</button>
      )}

      <div style={{
        marginTop: 20, padding: '10px 14px', borderLeft: `3px solid ${C.go}`,
        background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g, maxWidth: 560,
      }}>
        <strong style={{ color: C.go }}>Sidebar:</strong> Everything flows in automatically. IIF uploads land here unposted until you confirm QBO entry. Stale prior periods show as amber warnings at the top. Nothing is truly closed until every row has a checkmark.
      </div>
    </div>
  )
}

// ─── AMORTIZATION TAB (placeholder) ──────────────────────────────────────────
// ─── AMORTIZATION TAB ────────────────────────────────────────────────────────
// Loan/lease schedule generator + combined monthly JE builder

const AMORT_DEFAULTS = {
  loan: {
    principal_acct: 'Notes Payable',
    interest_acct: 'Interest Expense',
    cash_acct: 'Checking',
  },
  lease: {
    principal_acct: 'Lease Liability',
    interest_acct: 'Interest on Lease Liability',
    cash_acct: 'ROU Asset Amortization',
  },
}

function calcAmortSchedule({ principal, annualRate, termMonths, firstPaymentDate, paymentAmt }) {
  const monthlyRate = annualRate / 100 / 12
  const pmt = paymentAmt || (monthlyRate === 0
    ? principal / termMonths
    : principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)))

  const rows = []
  let balance = principal
  let date = new Date(firstPaymentDate + 'T00:00:00')

  for (let i = 0; i < termMonths; i++) {
    const interest = balance * monthlyRate
    const principalPmt = Math.min(pmt - interest, balance)
    balance = Math.max(0, balance - principalPmt)
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    rows.push({
      payment_num: i + 1,
      period,
      date: date.toISOString().split('T')[0],
      payment: pmt,
      interest: parseFloat(interest.toFixed(2)),
      principal: parseFloat(principalPmt.toFixed(2)),
      balance: parseFloat(balance.toFixed(2)),
    })
    date = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate())
  }
  return rows
}

const BLANK_SCHEDULE = {
  name: '', type: 'loan',
  principal: '', annual_rate: '', term_months: '', first_payment_date: '', payment_amt: '',
  principal_acct: '', interest_acct: '', cash_acct: '', notes: '',
}

function AmortizationTab({ orgId, C }) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSched, setEditingSched] = useState(null)
  const [form, setForm] = useState({ ...BLANK_SCHEDULE })
  const [preview, setPreview] = useState(null)       // schedule rows for preview
  const [expandedId, setExpandedId] = useState(null) // which schedule is expanded
  const [jeMonth, setJeMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [jeDesc, setJeDesc] = useState('LOANS')
  const [generatedJE, setGeneratedJE] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadSchedules() }, [orgId])

  async function loadSchedules() {
    setLoading(true)
    const { data } = await supabase.from('amortization_schedules').select('*').eq('org_id', orgId).order('name')
    setSchedules(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm({ ...BLANK_SCHEDULE })
    setPreview(null)
    setEditingSched(null)
    setShowForm(true)
  }

  function openEdit(s) {
    setForm({
      name: s.name, type: s.type,
      principal: s.principal, annual_rate: s.annual_rate,
      term_months: s.term_months, first_payment_date: s.first_payment_date,
      payment_amt: s.payment_amt || '', notes: s.notes || '',
      principal_acct: s.principal_acct || '', interest_acct: s.interest_acct || '',
      cash_acct: s.cash_acct || '',
    })
    setPreview(null)
    setEditingSched(s)
    setShowForm(true)
  }

  function generatePreview() {
    if (!form.principal || !form.term_months || !form.first_payment_date) return
    const rows = calcAmortSchedule({
      principal: parseFloat(form.principal),
      annualRate: parseFloat(form.annual_rate) || 0,
      termMonths: parseInt(form.term_months),
      firstPaymentDate: form.first_payment_date,
      paymentAmt: form.payment_amt ? parseFloat(form.payment_amt) : null,
    })
    setPreview(rows)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.principal || !form.term_months || !form.first_payment_date) return
    setSaving(true)
    const defaults = AMORT_DEFAULTS[form.type] || AMORT_DEFAULTS.loan
    const payload = {
      org_id: orgId,
      name: form.name.trim(),
      type: form.type,
      principal: parseFloat(form.principal),
      annual_rate: parseFloat(form.annual_rate) || 0,
      term_months: parseInt(form.term_months),
      first_payment_date: form.first_payment_date,
      payment_amt: form.payment_amt ? parseFloat(form.payment_amt) : null,
      principal_acct: form.principal_acct || defaults.principal_acct,
      interest_acct: form.interest_acct || defaults.interest_acct,
      cash_acct: form.cash_acct || defaults.cash_acct,
      notes: form.notes || null,
    }
    if (editingSched) {
      await supabase.from('amortization_schedules').update(payload).eq('id', editingSched.id)
    } else {
      await supabase.from('amortization_schedules').insert([payload])
    }
    setSaving(false)
    setShowForm(false)
    loadSchedules()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this schedule?')) return
    await supabase.from('amortization_schedules').delete().eq('id', id)
    setSchedules(s => s.filter(x => x.id !== id))
  }

  function buildCombinedJE() {
    const [yr, mo] = jeMonth.split('-')
    const lines = []
    schedules.forEach(s => {
      const rows = calcAmortSchedule({
        principal: s.principal,
        annualRate: s.annual_rate,
        termMonths: s.term_months,
        firstPaymentDate: s.first_payment_date,
        paymentAmt: s.payment_amt,
      })
      const row = rows.find(r => r.period === jeMonth)
      if (!row) return
      const defaults = AMORT_DEFAULTS[s.type] || AMORT_DEFAULTS.loan
      const pAcct = s.principal_acct || defaults.principal_acct
      const iAcct = s.interest_acct || defaults.interest_acct
      const cAcct = s.cash_acct || defaults.cash_acct
      if (row.interest > 0) lines.push({ acct: iAcct, dr: true, amount: row.interest, memo: s.name })
      if (row.principal > 0) lines.push({ acct: pAcct, dr: true, amount: row.principal, memo: s.name })
      lines.push({ acct: cAcct, dr: false, amount: row.payment, memo: s.name })
    })
    if (!lines.length) return null
    const totalDr = lines.filter(l => l.dr).reduce((s, l) => s + l.amount, 0)
    const totalCr = lines.filter(l => !l.dr).reduce((s, l) => s + l.amount, 0)
    return {
      je_number: `KK ${yr} ${mo} AMORT ${jeDesc}`,
      period: jeMonth,
      lines,
      totalDr,
      totalCr,
      balanced: Math.abs(totalDr - totalCr) < 0.01,
    }
  }

  const inp = {
    background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
    borderRadius: 6, padding: '6px 10px', fontSize: 11,
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  }
  const lbl = { fontSize: 10, color: C.g, display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.8px' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.g }}>Loan and lease amortization schedules — generates combined monthly JE</div>
        <button onClick={openNew} style={{ background: C.go, border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>+ Add Schedule</button>
      </div>
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderRadius: 14, padding: 24, width: 520, maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.bdr}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: C.go, fontSize: 15 }}>{editingSched ? '✏️ Edit Schedule' : '+ New Schedule'}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: C.g, fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {['loan','lease'].map(t => (
                <button key={t} onClick={() => set('type', t)} style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  background: form.type === t ? C.go : 'transparent',
                  border: `1px solid ${form.type === t ? C.go : C.bdr}`,
                  color: form.type === t ? '#000' : C.g, fontWeight: form.type === t ? 700 : 400,
                }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Schedule Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. MEDA Loan" style={inp} />
              </div>
              <div>
                <label style={lbl}>Original Principal *</label>
                <input type="number" value={form.principal} onChange={e => set('principal', e.target.value)} placeholder="e.g. 50000" style={inp} />
              </div>
              <div>
                <label style={lbl}>Annual Interest Rate (%)</label>
                <input type="number" value={form.annual_rate} onChange={e => set('annual_rate', e.target.value)} placeholder="e.g. 5.25" style={inp} />
              </div>
              <div>
                <label style={lbl}>Term (months) *</label>
                <input type="number" value={form.term_months} onChange={e => set('term_months', e.target.value)} placeholder="e.g. 60" style={inp} />
              </div>
              <div>
                <label style={lbl}>First Payment Date *</label>
                <input type="date" value={form.first_payment_date} onChange={e => set('first_payment_date', e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Monthly Payment (leave blank to calculate)</label>
                <input type="number" value={form.payment_amt} onChange={e => set('payment_amt', e.target.value)} placeholder="auto-calculated" style={inp} />
              </div>
            </div>
            <div style={{ marginBottom: 12, padding: '10px 12px', background: C.bg, borderRadius: 8, border: `1px solid ${C.bdrF}` }}>
              <div style={{ fontSize: 10, color: C.go, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Account Names (defaults shown)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  ['principal_acct', form.type === 'lease' ? 'Lease Liability' : 'Notes Payable', 'Principal Acct'],
                  ['interest_acct', form.type === 'lease' ? 'Interest on Lease Liability' : 'Interest Expense', 'Interest Acct'],
                  ['cash_acct', form.type === 'lease' ? 'ROU Asset Amortization' : 'Checking', 'Cash / CR Acct'],
                ].map(([key, placeholder, label]) => (
                  <div key={key}>
                    <label style={lbl}>{label}</label>
                    <input value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} style={{ ...inp, fontSize: 10 }} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Lender, account #, etc." style={inp} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: preview ? 16 : 0 }}>
              <button onClick={generatePreview} style={{ background: 'transparent', border: `1px solid ${C.go}`, color: C.go, borderRadius: 6, padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                👁 Preview Schedule
              </button>
              <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.principal || !form.term_months || !form.first_payment_date} style={{
                background: C.go, border: 'none', color: '#000', borderRadius: 6, padding: '6px 20px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                opacity: (!form.name.trim() || !form.principal) ? 0.5 : 1,
              }}>{saving ? 'Saving…' : 'Save Schedule'}</button>
            </div>
            {preview && (
              <div style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto', borderRadius: 8, border: `1px solid ${C.bdr}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: "'DM Mono', monospace" }}>
                  <thead style={{ position: 'sticky', top: 0, background: C.bg2 }}>
                    <tr>
                      {['#','Period','Payment','Interest','Principal','Balance'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'right', color: C.g, fontWeight: 600, borderBottom: `1px solid ${C.bdr}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.bdrF}`, background: i % 2 === 0 ? C.bg : 'transparent' }}>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: C.g }}>{row.payment_num}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: C.w }}>{row.period}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: C.go }}>{fmt(row.payment)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#e07070' }}>{fmt(row.interest)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#6ab87a' }}>{fmt(row.principal)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: C.w }}>{fmt(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {loading && <p style={{ color: C.g, fontSize: 12 }}>Loading…</p>}
      {!loading && schedules.length === 0 && (
        <div style={{ color: C.g, fontSize: 12, padding: 20, textAlign: 'center' }}>No schedules yet. Add your loans and leases above.</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
        {schedules.map(s => {
          const rows = calcAmortSchedule({ principal: s.principal, annualRate: s.annual_rate, termMonths: s.term_months, firstPaymentDate: s.first_payment_date, paymentAmt: s.payment_amt })
          const thisMonth = rows.find(r => r.period === jeMonth)
          const isExpanded = expandedId === s.id
          return (
            <div key={s.id} style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.go }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: C.g, marginTop: 2 }}>
                      <span style={{ background: s.type === 'lease' ? '#7D3C98' : '#2D5A8E', color: '#fff', borderRadius: 4, padding: '1px 6px', marginRight: 6, fontSize: 9 }}>{s.type.toUpperCase()}</span>
                      {s.annual_rate}% · {s.term_months}mo · ${fmt(s.principal)} original
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', color: C.g, cursor: 'pointer', fontSize: 12 }}>✏️</button>
                    <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', color: C.g, cursor: 'pointer', fontSize: 12 }}>🗑</button>
                  </div>
                </div>
                {thisMonth && (
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: "'DM Mono', monospace", marginTop: 6 }}>
                    <span style={{ color: C.g }}>This month:</span>
                    <span style={{ color: '#e07070' }}>INT ${fmt(thisMonth.interest)}</span>
                    <span style={{ color: '#6ab87a' }}>PRIN ${fmt(thisMonth.principal)}</span>
                    <span style={{ color: C.go }}>BAL ${fmt(thisMonth.balance)}</span>
                  </div>
                )}
                {!thisMonth && <div style={{ fontSize: 10, color: C.g, marginTop: 4 }}>No payment for {jeMonth}</div>}
              </div>
              <div style={{ borderTop: `1px solid ${C.bdrF}` }}>
                <button onClick={() => setExpandedId(isExpanded ? null : s.id)} style={{
                  width: '100%', background: 'transparent', border: 'none', color: C.g,
                  padding: '6px 14px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}>{isExpanded ? '▲ Hide schedule' : '▶ View full schedule'}</button>
                {isExpanded && (
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: "'DM Mono', monospace" }}>
                      <thead>
                        <tr style={{ background: C.bg }}>
                          {['Period','Payment','Interest','Principal','Balance'].map(h => (
                            <th key={h} style={{ padding: '4px 8px', textAlign: 'right', color: C.g, fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${C.bdrF}`, background: row.period === jeMonth ? `${C.go}22` : 'transparent' }}>
                            <td style={{ padding: '3px 8px', color: row.period === jeMonth ? C.go : C.w, fontWeight: row.period === jeMonth ? 700 : 400 }}>{row.period}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right', color: C.go }}>{fmt(row.payment)}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right', color: '#e07070' }}>{fmt(row.interest)}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right', color: '#6ab87a' }}>{fmt(row.principal)}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right', color: C.w }}>{fmt(row.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {schedules.length > 0 && (
        <div style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.go, marginBottom: 12 }}>📋 Generate Combined Monthly JE</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <label style={lbl}>Period</label>
              <input type="month" value={jeMonth} onChange={e => setJeMonth(e.target.value)} style={{ ...inp, width: 150 }} />
            </div>
            <div>
              <label style={lbl}>JE Description</label>
              <input value={jeDesc} onChange={e => setJeDesc(e.target.value)} placeholder="LOANS" style={{ ...inp, width: 120 }} />
            </div>
            <button onClick={() => setGeneratedJE(buildCombinedJE())} style={{
              background: C.go, border: 'none', color: '#000', borderRadius: 6,
              padding: '7px 20px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>Generate JE</button>
          </div>

          {generatedJE && (
            <div>
              <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: C.go, marginBottom: 8 }}>
                <b>{generatedJE.je_number}</b>
                <span style={{ marginLeft: 12, color: generatedJE.balanced ? '#6ab87a' : '#e07070', fontSize: 10 }}>
                  {generatedJE.balanced ? '✓ Balanced' : '⚠ Unbalanced'}
                  {' '} DR ${fmt(generatedJE.totalDr)} · CR ${fmt(generatedJE.totalCr)}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.bdr}` }}>
                    <th style={{ textAlign: 'left', color: C.g, padding: '4px 0', fontWeight: 600 }}>Account</th>
                    <th style={{ textAlign: 'left', color: C.g, padding: '4px 0', fontWeight: 600 }}>Schedule</th>
                    <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 100 }}>Debit</th>
                    <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 100 }}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedJE.lines.map((l, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.bdrF}` }}>
                      <td style={{ padding: '4px 0', color: C.w }}>{l.acct}</td>
                      <td style={{ padding: '4px 0', color: C.g, fontSize: 10 }}>{l.memo}</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', color: '#6ab87a' }}>{l.dr ? fmt(l.amount) : ''}</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', color: '#e07070' }}>{!l.dr ? fmt(l.amount) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `1px solid ${C.bdr}` }}>
                    <td colSpan={2} style={{ color: C.g, fontSize: 10, padding: '4px 0' }}>TOTALS</td>
                    <td style={{ textAlign: 'right', color: '#6ab87a', fontWeight: 700, padding: '4px 0' }}>${fmt(generatedJE.totalDr)}</td>
                    <td style={{ textAlign: 'right', color: '#e07070', fontWeight: 700, padding: '4px 0' }}>${fmt(generatedJE.totalCr)}</td>
                  </tr>
                </tfoot>
              </table>
              <div style={{ fontSize: 10, color: C.g, fontStyle: 'italic' }}>
                Enter this JE in QBO for {generatedJE.period} — one entry with {generatedJE.lines.length} lines covering all active schedules.
              </div>
            </div>
          )}
          {generatedJE && generatedJE.lines.length === 0 && (
            <div style={{ fontSize: 11, color: C.g }}>No active payments found for {jeMonth}. Check your schedule dates.</div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '10px 14px', borderLeft: `3px solid ${C.go}`, background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g }}>
        <strong style={{ color: C.go }}>Sidebar:</strong> Add each loan and lease once. FlowSuite calculates every payment split automatically. Generate the combined JE at month-end — one entry, all lines, no math.
      </div>
    </div>
  )
}

// ─── RESOURCE LIBRARY ────────────────────────────────────────────────────────
function CopyBtn({ value, label, C }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} style={{
      background: copied ? '#6ab87a22' : C.bg,
      border: `1px solid ${copied ? '#6ab87a' : C.bdrF}`,
      color: copied ? '#6ab87a' : C.g,
      borderRadius: 5, padding: '3px 8px', fontSize: 10,
      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
    }}>
      {copied ? '✓ Copied' : `Copy ${label}`}
    </button>
  )
}

function ResourceCard({ res, C, onEdit, onDelete }) {
  const [showCreds, setShowCreds] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10,
      padding: '14px 16px', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.go }}>{res.label}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onEdit(res)} style={{
            background: 'none', border: 'none', color: C.g, cursor: 'pointer', fontSize: 12, padding: '0 2px',
          }}>✏️</button>
          <button onClick={() => {
            if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000) }
            else onDelete(res.id)
          }} style={{
            background: 'none', border: 'none',
            color: confirmDel ? '#e07070' : C.g,
            cursor: 'pointer', fontSize: 11, padding: '0 2px',
          }}>{confirmDel ? '✓ sure?' : '🗑'}</button>
        </div>
      </div>
      {res.url && (
        <a href={res.url} target="_blank" rel="noreferrer" style={{
          display: 'inline-block', background: C.go, color: '#fff',
          borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 700,
          textDecoration: 'none', marginBottom: 10,
        }}>{res.label} ↗</a>
      )}
      {(res.username || res.password || res.pin) && (
        <div>
          <button onClick={() => setShowCreds(v => !v)} style={{
            background: 'transparent', border: `1px solid ${C.bdrF}`,
            color: C.g, borderRadius: 5, padding: '3px 10px',
            fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8,
          }}>{showCreds ? '🙈 Hide' : '👁 Show'} credentials</button>

          {showCreds && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {res.username && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.g, minWidth: 60 }}>Username</span>
                  <span style={{ fontSize: 11, color: C.w, fontFamily: "'DM Mono', monospace", flex: 1, wordBreak: 'break-all' }}>{res.username}</span>
                  <CopyBtn value={res.username} label="User" C={C} />
                </div>
              )}
              {res.password && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.g, minWidth: 60 }}>Password</span>
                  <span style={{ fontSize: 11, color: C.w, fontFamily: "'DM Mono', monospace", flex: 1 }}>••••••••</span>
                  <CopyBtn value={res.password} label="Pass" C={C} />
                </div>
              )}
              {res.pin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.g, minWidth: 60 }}>PIN</span>
                  <span style={{ fontSize: 11, color: C.w, fontFamily: "'DM Mono', monospace", flex: 1 }}>••••</span>
                  <CopyBtn value={res.pin} label="PIN" C={C} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {res.phone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, borderTop: `1px solid ${C.bdrF}`, paddingTop: 6 }}>
          <span style={{ fontSize: 10, color: C.g, minWidth: 52, flexShrink: 0 }}>Phone</span>
          <span style={{ fontSize: 11, color: C.w, flex: 1, fontFamily: "'DM Mono', monospace" }}>{res.phone}</span>
          <CopyBtn value={res.phone} label="Phone" C={C} />
        </div>
      )}
      {res.email && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: res.phone ? 4 : 8, borderTop: res.phone ? 'none' : `1px solid ${C.bdrF}`, paddingTop: res.phone ? 0 : 6 }}>
          <span style={{ fontSize: 10, color: C.g, minWidth: 52, flexShrink: 0 }}>Email</span>
          <span style={{ fontSize: 11, color: C.w, flex: 1, wordBreak: 'break-all' }}>{res.email}</span>
          <CopyBtn value={res.email} label="Email" C={C} />
        </div>
      )}
      {res.mailing_address && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: (res.phone||res.email) ? 4 : 8, borderTop: (res.phone||res.email) ? 'none' : `1px solid ${C.bdrF}`, paddingTop: (res.phone||res.email) ? 0 : 6 }}>
          <span style={{ fontSize: 10, color: C.g, minWidth: 52, flexShrink: 0 }}>Address</span>
          <span style={{ fontSize: 11, color: C.w, flex: 1, lineHeight: 1.4 }}>{res.mailing_address}</span>
          <CopyBtn value={res.mailing_address} label="Addr" C={C} />
        </div>
      )}
      {res.notes && (
        <div style={{ fontSize: 10, color: C.g, marginTop: 8, borderTop: `1px solid ${C.bdrF}`, paddingTop: 6 }}>
          {res.notes}
        </div>
      )}
    </div>
  )
}

const BLANK_RES = { label: '', url: '', username: '', password: '', pin: '', notes: '', email: '', phone: '' }

function ResourceFormModal({ res, orgId, C, onSave, onClose }) {
  const isEdit = !!res?.id
  const [form, setForm] = useState(isEdit ? {
    label: res.label || '', url: res.url || '',
    username: res.username || '', password: res.password || '',
    pin: res.pin || '', notes: res.notes || '', mailing_address: res.mailing_address || '',
    email: res.email || '', phone: res.phone || '',
  } : { ...BLANK_RES })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.label.trim()) return
    setSaving(true)
    const payload = {
      label: form.label.trim(),
      url: form.url.trim(),
      username: form.username,
      password: form.password,
      pin: form.pin,
      notes: form.notes,
      mailing_address: form.mailing_address || '',
    }
    if (isEdit) {
      const { error } = await supabase
        .from('moneyflow_resources')
        .update(payload)
        .eq('id', res.id)
      if (error) { console.error('Resource update error:', error); setSaving(false); return }
    } else {
      const { error } = await supabase
        .from('moneyflow_resources')
        .insert([{ ...payload, org_id: orgId }])
      if (error) { console.error('Resource insert error:', error); setSaving(false); return }
    }
    setSaving(false)
    onSave()
  }

  const iStyle = {
    width: '100%', background: C.bg, border: `1px solid ${C.bdr}`,
    color: C.w, borderRadius: 6, padding: '7px 10px',
    fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const lStyle = { fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 14, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: C.go, fontSize: 15, fontWeight: 700 }}>{isEdit ? '✏️ Edit Resource' : '➕ New Resource'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.g, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {[
          { key: 'label', label: 'Display Name *', placeholder: 'e.g. Xcel Energy' },
          { key: 'url',   label: 'URL',             placeholder: 'https://...' },
          { key: 'phone', label: 'Phone',           placeholder: 'e.g. 612-555-0100' },
          { key: 'email', label: 'Email',           placeholder: 'e.g. payments@vendor.com' },
          { key: 'username', label: 'Username',     placeholder: '' },
          { key: 'pin',   label: 'PIN',             placeholder: '' },
          { key: 'mailing_address', label: 'Mailing Address', placeholder: 'e.g. PO Box 64306, St Paul MN 55164' },
          { key: 'notes', label: 'Notes',           placeholder: 'Account #, tips...' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={lStyle}>{f.label}</label>
            <input value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} style={iStyle} />
          </div>
        ))}

        <div style={{ marginBottom: 16 }}>
          <label style={lStyle}>Password</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              style={{ ...iStyle, flex: 1 }}
            />
            <button onClick={() => setShowPass(v => !v)} style={{
              background: C.bg, border: `1px solid ${C.bdr}`, color: C.g,
              borderRadius: 6, padding: '0 10px', cursor: 'pointer', fontSize: 11,
            }}>{showPass ? '🙈' : '👁'}</button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.bdr}`, color: C.g, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.label.trim()} style={{ background: C.go, border: 'none', color: '#fff', padding: '7px 20px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', opacity: !form.label.trim() ? 0.5 : 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Resource'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResourceLibraryTab({ orgId, C }) {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('moneyflow_resources').select('*').eq('org_id', orgId).order('label')
    setResources(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  async function handleDelete(id) {
    await supabase.from('moneyflow_resources').delete().eq('id', id)
    setResources(r => r.filter(x => x.id !== id))
  }

  function handleEdit(res) { setEditing(res); setModalOpen(true) }
  function handleNew()     { setEditing(null); setModalOpen(true) }
  function handleSaved()   { setModalOpen(false); setEditing(null); load() }

  return (
    <div>
      {modalOpen && (
        <ResourceFormModal res={editing} orgId={orgId} C={C} onSave={handleSaved} onClose={() => { setModalOpen(false); setEditing(null) }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: C.g }}>
          Login links, credentials, and vendor portals — all in one place.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resources…"
            style={{
              background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
              borderRadius: 20, padding: '5px 14px', fontSize: 11,
              fontFamily: 'inherit', width: 180, outline: 'none',
            }}
          />
          <button onClick={handleNew} style={{
            background: C.go, border: 'none', color: '#fff',
            padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
            fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
          }}>+ Add Resource</button>
        </div>
      </div>

      {loading && <p style={{ fontSize: 12, color: C.g }}>Loading…</p>}

      {!loading && (() => {
        const filtered = resources.filter(r =>
          !search.trim() ||
          (r.label || '').toLowerCase().includes(search.toLowerCase()) ||
          (r.notes || '').toLowerCase().includes(search.toLowerCase()) ||
          (r.email || '').toLowerCase().includes(search.toLowerCase()) ||
          (r.phone || '').toLowerCase().includes(search.toLowerCase())
        )
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {filtered.length === 0 && (
              <p style={{ fontSize: 12, color: C.g, gridColumn: '1/-1' }}>
                {resources.length === 0 ? 'No resources yet. Add your first one — Xcel, CenterPoint, QBO, wherever you log in.' : `No results for "${search}"`}
              </p>
            )}
            {filtered.map(res => (
              <ResourceCard key={res.id} res={res} C={C} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        )
      })()}

      <div style={{ marginTop: 24, padding: '10px 14px', borderLeft: `3px solid ${C.go}`, background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g, maxWidth: 500 }}>
        <strong style={{ color: C.go }}>Sidebar:</strong> Passwords never display on screen — copy-only. Credentials live in Supabase behind your org_id. You can also attach resources to task cards so the login button lives right on the back of the card.
      </div>
    </div>
  )
}


// ─── NEW HIRE CHECKLIST ───────────────────────────────────────────────────────
// Configurable per-org compliance checklist pulled from employees table
// Templates are org-managed — we seed defaults, they own the list

const DEFAULT_CHECKLIST_ITEMS = [
  { item_name: 'Federal New Hire Report', applies_to: 'new_hire', due_days_from_hire: 20 },
  { item_name: 'MN State New Hire Report', applies_to: 'new_hire', due_days_from_hire: 20 },
  { item_name: 'Benefits Enrollment', applies_to: 'new_hire', due_days_from_hire: 30 },
  { item_name: 'Union Enrollment / Dues Setup', applies_to: 'new_hire', due_days_from_hire: 14 },
]

function addDays(dateStr, days) {
  if (!dateStr || !days) return null
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Template editor modal
function TemplateItemModal({ item, orgId, C, onSave, onClose }) {
  const isEdit = !!item?.id
  const [form, setForm] = useState(isEdit ? {
    item_name: item.item_name || '',
    due_days_from_hire: item.due_days_from_hire || '',
    active: item.active !== false,
  } : { item_name: '', due_days_from_hire: '', active: true })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.item_name.trim()) return
    setSaving(true)
    const payload = {
      item_name: form.item_name.trim(),
      due_days_from_hire: form.due_days_from_hire ? parseInt(form.due_days_from_hire) : null,
      active: form.active,
      org_id: orgId,
      applies_to: 'new_hire',
    }
    if (isEdit) {
      await supabase.from('payroll_checklist_templates').update(payload).eq('id', item.id)
    } else {
      await supabase.from('payroll_checklist_templates').insert([payload])
    }
    setSaving(false)
    onSave()
  }

  const iStyle = { width: '100%', background: C.bg, border: `1px solid ${C.bdr}`, color: C.w, borderRadius: 6, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }
  const lStyle = { fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 14, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: C.go, fontSize: 15, fontWeight: 700 }}>{isEdit ? '✏️ Edit Checklist Item' : '➕ New Checklist Item'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.g, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lStyle}>Item Name *</label>
          <input value={form.item_name} onChange={e => set('item_name', e.target.value)} placeholder="e.g. Direct Deposit Setup" style={iStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lStyle}>Due Days From Hire Date (optional)</label>
          <input type="number" value={form.due_days_from_hire} onChange={e => set('due_days_from_hire', e.target.value)} min={1} placeholder="e.g. 20" style={iStyle} />
          <div style={{ fontSize: 10, color: C.g, marginTop: 4 }}>Leave blank if no deadline applies.</div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} style={{ accentColor: C.go }} />
            <span style={{ fontSize: 12, color: C.w }}>Active (show on new hire checklists)</span>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.bdr}`, color: C.g, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.item_name.trim()} style={{ background: C.go, border: 'none', color: '#fff', padding: '7px 20px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', opacity: !form.item_name.trim() ? 0.5 : 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── WITHHOLDING PROCESSOR ────────────────────────────────────────────────────
function WithholdingProcessorTab({ orgId, C, orders: propOrders = null, allResources = [], onPaymentSent }) {
  const [orders, setOrders]       = useState(propOrders || [])
  const [rows, setRows]           = useState([])   // parsed deduction rows from upload
  const [payPeriod, setPayPeriod] = useState('')
  const [payDate, setPayDate]     = useState('')
  const [sentKeys, setSentKeys]   = useState({})   // payment_type_key → true when marked sent
  const [fileName, setFileName]   = useState('')
  const [loading, setLoading]     = useState(true)
  const [parseError, setParseError] = useState(null)

  // Load active payment orders (skip if passed as prop)
  useEffect(() => {
    if (propOrders !== null) { setLoading(false); return }
    supabase.from('payroll_payment_orders')
      .select('*').eq('org_id', orgId).eq('status', 'active').order('employee_name')
      .then(({ data }) => { setOrders(data || []); setLoading(false) })
  }, [orgId])

  // ── Parse uploaded XLS/XLSX ──
  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setParseError(null)
    setRows([])
    setFileName(file.name)

    try {
      const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs')
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array' })

      // Find the deductions sheet — look for sheet whose name contains "Deduction"
      const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('deduction')) || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Find header row: row containing "Description" in first column
      const headerIdx = raw.findIndex(r => String(r[0]).trim() === 'Description')
      if (headerIdx === -1) { setParseError('Could not find "Description" header row in sheet.'); return }

      // Extract pay period from rows above header — look for "From ... to ..." pattern
      for (let i = 0; i < headerIdx; i++) {
        const cell = String(raw[i][0]).trim()
        const m = cell.match(/From\s+(.+?)\s+to\s+(.+)/i)
        if (m) { setPayPeriod(m[0]); setPayDate(m[2].trim()); break }
      }

      // Parse data rows — stop at Total row
      const dataRows = []
      for (let i = headerIdx + 1; i < raw.length; i++) {
        const r = raw[i]
        const desc = String(r[0]).trim()
        if (!desc || desc.toLowerCase() === 'total') break
        const empDed  = parseFloat(String(r[2]).replace(/[$,]/g, '')) || 0
        const coContrib = parseFloat(String(r[3]).replace(/[$,]/g, '')) || 0
        const total   = parseFloat(String(r[4]).replace(/[$,]/g, '')) || 0
        const type    = String(r[1]).trim()
        dataRows.push({ desc, type, empDed, coContrib, total })
      }

      setRows(dataRows)
    } catch (err) {
      setParseError(`Parse error: ${err.message}`)
    }
  }

  // ── Match parsed rows to payment orders ──
  // A row matches an order if the order's payment_type or description loosely matches
  function matchOrder(row) {
    return orders.find(o => {
      const orderLabel = (o.description || o.label || '').toLowerCase()
      const rowDesc    = row.desc.toLowerCase()
      const rowType    = row.type.toLowerCase()
      // Match by description substring or type substring
      return rowDesc.includes(orderLabel) || orderLabel.includes(rowDesc) ||
             rowType.includes((o.payment_type || '').toLowerCase()) ||
             (o.payment_type || '').toLowerCase().includes(rowType)
    })
  }

  // Filter to only rows that are actionable (employee deduction > 0 or company contrib > 0)
  const actionableRows = rows.filter(r => r.empDed > 0 || r.coContrib > 0)
  const zeroRows       = rows.filter(r => r.empDed === 0 && r.coContrib === 0)

  // Identify payment order rows — types that indicate external payments needed
  const PAYMENT_TYPES = ['child/spousal support', 'garnishment', 'levy', 'creditor', 'cash advance']
  const paymentRows = actionableRows.filter(r =>
    PAYMENT_TYPES.some(t => r.type.toLowerCase().includes(t) || r.desc.toLowerCase().includes(t))
  )
  const internalRows = actionableRows.filter(r =>
    !PAYMENT_TYPES.some(t => r.type.toLowerCase().includes(t) || r.desc.toLowerCase().includes(t))
  )

  const totalPayments = paymentRows.reduce((s, r) => s + r.empDed, 0)

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
    borderRadius: 6, padding: '6px 10px', fontSize: 11,
    fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }

  if (loading) return <p style={{ fontSize: 12, color: C.g }}>Loading payment orders…</p>

  return (
    <div>
      <div style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.go, marginBottom: 8 }}>Upload QBO Payroll Export</div>
        <div style={{ fontSize: 11, color: C.g, marginBottom: 12 }}>
          Upload the Aggregated Payroll Report (.xls or .xlsx) from QBO. The processor reads the Deductions and Contributions sheet automatically.
        </div>
        <input type="file" accept=".xls,.xlsx" onChange={handleUpload} style={{ fontSize: 11, color: C.w }} />
        {fileName && <div style={{ fontSize: 10, color: C.go, marginTop: 6, fontFamily: "'DM Mono', monospace" }}>📄 {fileName}</div>}
        {payPeriod && <div style={{ fontSize: 10, color: C.g, marginTop: 4 }}>Period: {payPeriod}</div>}
        {parseError && <div style={{ fontSize: 11, color: '#e07070', marginTop: 8 }}>⚠ {parseError}</div>}
      </div>

      {rows.length > 0 && (<>
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20,
          background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: '14px 18px',
        }}>
          <div>
            <div style={labelStyle}>Pay Date</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.w }}>{payDate || '—'}</div>
          </div>
          <div>
            <div style={labelStyle}>Payments to Send</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e07070' }}>{paymentRows.length}</div>
          </div>
          <div>
            <div style={labelStyle}>Total Amount Due</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.go }}>${fmt(totalPayments)}</div>
          </div>
          <div>
            <div style={labelStyle}>Orders on File</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.w }}>{orders.length} active</div>
          </div>
        </div>
        {paymentRows.length > 0 && (<>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e07070', marginBottom: 10, letterSpacing: '0.5px' }}>
            SEND PAYMENTS
          </div>
          {paymentRows.map((r, i) => {
            const order = matchOrder(r)
            const typeKey = order?.payment_type || r.desc
            const sent = !!sentKeys[typeKey]

            async function markSent() {
              // Find the matching auto-generated task card and advance/complete it
              const { data: tasks } = await supabase
                .from('moneyflow_tasks')
                .select('*')
                .eq('org_id', orgId)
                .eq('source', 'payroll_auto')
                .eq('payment_type_key', typeKey)
                .single()
              if (tasks) {
                if (tasks.is_recurring && tasks.recur_interval > 0) {
                  const newDate = advanceDueDate(tasks.due_date, tasks.recur_interval)
                  await supabase.from('moneyflow_tasks').update({ due_date: newDate, updated_at: new Date().toISOString() }).eq('id', tasks.id)
                } else {
                  await supabase.from('moneyflow_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', tasks.id)
                }
              }
              // Bump times_paid on matching garnishment orders
              if (order?.payment_type === 'Wage Garnishment') {
                const matchingOrders = (orders || []).filter(o => o.payment_type === 'Wage Garnishment' && o.status === 'active')
                for (const mo of matchingOrders) {
                  const newTimesPaid = (parseInt(mo.times_paid) || 0) + 1
                  // Auto-close if limit reached
                  let newStatus = mo.status
                  if (mo.withhold_limit_type === 'times' && mo.withhold_max_times && newTimesPaid >= parseInt(mo.withhold_max_times)) newStatus = 'closed'
                  if (mo.withhold_limit_type === 'amount' && mo.withhold_until_amount && mo.amount_per_period) {
                    const withheld = newTimesPaid * parseFloat(mo.amount_per_period)
                    if (withheld >= parseFloat(mo.withhold_until_amount)) newStatus = 'closed'
                  }
                  await supabase.from('payroll_payment_orders').update({ times_paid: newTimesPaid, status: newStatus, updated_at: new Date().toISOString() }).eq('id', mo.id)
                }
              }
              setSentKeys(prev => ({ ...prev, [typeKey]: true }))
              if (onPaymentSent) onPaymentSent()
            }

            return (
              <div key={i} style={{
                background: sent ? `${C.go}11` : C.bg2,
                border: `1px solid ${sent ? C.go : order ? C.go : C.bdr}`,
                borderRadius: 10, padding: '12px 16px', marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: sent ? '#6ab87a' : C.w }}>{r.desc}</div>
                    <div style={{ fontSize: 10, color: C.g, marginTop: 2 }}>{r.type}</div>
                    {order && (
                      <div style={{ fontSize: 10, color: C.go, marginTop: 4 }}>
                        ✓ Matched order · {order.employee_name}
                        {order.case_number && <span> · Case {order.case_number}</span>}
                      </div>
                    )}
                    {!order && (
                      <div style={{ fontSize: 10, color: '#c4956a', marginTop: 4 }}>
                        ⚠ No matching payment order on file
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.go, fontFamily: "'DM Mono', monospace" }}>
                      ${fmt(r.empDed)}
                    </div>
                    {order?.destination && (
                      <div style={{ fontSize: 10, color: C.g, marginTop: 2 }}>{order.destination}</div>
                    )}
                    {order?.destination_url && (
                      <a href={order.destination_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: C.go, display: 'block', marginTop: 4 }}>
                        Pay online →
                      </a>
                    )}
                    {order && (order.resource_ids || []).length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, justifyContent: 'flex-end' }}>
                        {allResources.filter(res => (order.resource_ids || []).includes(res.id)).map(res => (
                          <a key={res.id} href={res.url} target="_blank" rel="noreferrer"
                            style={{ fontSize: 10, color: '#7ab0e0', textDecoration: 'none', border: '1px solid #7ab0e0', padding: '2px 8px', borderRadius: 4 }}>
                            🔑 {res.label}
                          </a>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      {sent ? (
                        <span style={{ fontSize: 10, color: '#6ab87a', fontWeight: 700 }}>✓ Sent</span>
                      ) : (
                        <button onClick={markSent} style={{
                          background: C.go, border: 'none', color: '#fff',
                          borderRadius: 6, padding: '4px 12px', fontSize: 10,
                          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                        }}>Mark Sent ✓</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          <div style={{
            background: C.gD, border: `1px solid ${C.go}`, borderRadius: 8,
            padding: '10px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.go }}>Total to remit this pay period</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.go, fontFamily: "'DM Mono', monospace" }}>${fmt(totalPayments)}</span>
          </div>
        </>)}
        {internalRows.length > 0 && (<>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.g, margin: '20px 0 10px', letterSpacing: '0.5px' }}>
            INTERNAL DEDUCTIONS <span style={{ fontSize: 10, fontWeight: 400 }}>(benefits, union, insurance — no external payment needed)</span>
          </div>
          {internalRows.map((r, i) => (
            <div key={i} style={{
              background: C.bg2, border: `1px solid ${C.bdrF}`,
              borderRadius: 8, padding: '8px 14px', marginBottom: 6,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, color: C.w }}>{r.desc}</div>
                <div style={{ fontSize: 10, color: C.g }}>{r.type}</div>
              </div>
              <div style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                {r.empDed > 0 && <div style={{ color: C.w }}>EE: ${fmt(r.empDed)}</div>}
                {r.coContrib > 0 && <div style={{ color: C.g }}>ER: ${fmt(r.coContrib)}</div>}
              </div>
            </div>
          ))}
        </>)}
        {zeroRows.length > 0 && (
          <div style={{ fontSize: 10, color: C.g, marginTop: 16 }}>
            {zeroRows.length} deduction line{zeroRows.length > 1 ? 's' : ''} with $0 this period: {zeroRows.map(r => r.desc).join(', ')}
          </div>
        )}

        <div style={{
          marginTop: 20, padding: '10px 14px', borderLeft: `3px solid ${C.go}`,
          background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g, maxWidth: 560,
        }}>
          <strong style={{ color: C.go }}>Sidebar:</strong> Upload a new file each payroll run. Amounts come from the QBO export — nothing is hardwired. Payment orders on file add the destination and case number so you know exactly where each dollar goes.
        </div>

      </>)}
      {orders.length === 0 && (
        <div style={{ fontSize: 11, color: '#c4956a', marginTop: 8 }}>
          ⚠ No active payment orders on file. Add them in the Payment Orders tab so destinations and case numbers show here.
        </div>
      )}
    </div>
  )
}

function NewHireChecklistTab({ orgId, C }) {
  const [templates, setTemplates] = useState([])
  const [employees, setEmployees] = useState([])
  const [checklistItems, setChecklistItems] = useState([]) // payroll_checklist_items rows
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [templateModal, setTemplateModal] = useState(null) // null | 'new' | item object
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState('all')
  const [filterStatus, setFilterStatus] = useState('pending')

  async function load() {
    setLoading(true)
    const [{ data: tmpl }, { data: emps }, { data: items }] = await Promise.all([
      supabase.from('payroll_checklist_templates').select('*').eq('org_id', orgId).order('item_name'),
      supabase.from('employees').select('id, first_name, last_name, preferred_name, hire_date, status').eq('org_id', orgId).eq('status', 'Active').order('last_name'),
      supabase.from('payroll_checklist_items').select('*').eq('org_id', orgId),
    ])
    setTemplates(tmpl || [])
    setEmployees(emps || [])
    setChecklistItems(items || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  async function seedDefaults() {
    if (!orgId) { alert('No org ID — cannot seed defaults.'); return }
    setSeeding(true)
    const rows = DEFAULT_CHECKLIST_ITEMS.map(d => ({ ...d, org_id: orgId, active: true }))
    const { error } = await supabase.from('payroll_checklist_templates').insert(rows)
    if (error) {
      console.error('seedDefaults error:', error)
      alert('Seed failed: ' + error.message)
    }
    setSeeding(false)
    load()
  }

  async function deleteTemplate(id) {
    await supabase.from('payroll_checklist_templates').delete().eq('id', id)
    load()
  }

  // Generate checklist items for an employee (all active templates)
  async function generateForEmployee(empId) {
    const activeTemplates = templates.filter(t => t.active !== false)
    const existing = checklistItems.filter(i => i.employee_id === empId).map(i => i.template_id)
    const toInsert = activeTemplates
      .filter(t => !existing.includes(t.id))
      .map(t => ({
        org_id: orgId,
        employee_id: empId,
        template_id: t.id,
        status: 'pending',
      }))
    if (toInsert.length) {
      await supabase.from('payroll_checklist_items').insert(toInsert)
      load()
    }
  }

  // Toggle item status: pending → complete → na → pending
  async function cycleStatus(item) {
    const next = item.status === 'pending' ? 'complete' : item.status === 'complete' ? 'na' : 'pending'
    const updates = {
      status: next,
      completed_by: next === 'complete' ? 'admin' : null,
      completed_at: next === 'complete' ? new Date().toISOString() : null,
    }
    await supabase.from('payroll_checklist_items').update(updates).eq('id', item.id)
    setChecklistItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i))
  }

  const empName = (e) => `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim()

  const STATUS_CONFIG = {
    pending:  { label: 'Pending',  color: '#c4956a', icon: '○' },
    complete: { label: 'Complete', color: '#6ab87a', icon: '✓' },
    na:       { label: 'N/A',      color: '#a0a0a0', icon: '—' },
  }

  const today = new Date().toISOString().split('T')[0]

  // Build display: per employee, per template item
  const activeTemplates = templates.filter(t => t.active !== false)

  const displayEmps = selectedEmp === 'all' ? employees : employees.filter(e => e.id === selectedEmp)

  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{
      background: active ? C.gD : 'transparent',
      border: `1px solid ${active ? C.go : C.bdrF}`,
      color: active ? C.go : C.g,
      padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    }}>{label}</button>
  )

  if (loading) return <p style={{ fontSize: 12, color: C.g }}>Loading…</p>

  return (
    <div>
      {templateModal && (
        <TemplateItemModal
          item={templateModal === 'new' ? null : templateModal}
          orgId={orgId} C={C}
          onSave={() => { setTemplateModal(null); load() }}
          onClose={() => setTemplateModal(null)}
        />
      )}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.go }}>
            📋 Checklist Template ({activeTemplates.length} active items)
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {templates.length === 0 && (
              <button onClick={seedDefaults} disabled={seeding} style={{ background: 'transparent', border: `1px solid ${C.go}`, color: C.go, padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                {seeding ? 'Seeding…' : '⚡ Load Defaults'}
              </button>
            )}
            <button onClick={() => setShowTemplateEditor(v => !v)} style={{ background: 'transparent', border: `1px solid ${C.bdrF}`, color: C.g, padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
              {showTemplateEditor ? '▲ Hide' : '▼ Manage'} Template
            </button>
            <button onClick={() => setTemplateModal('new')} style={{ background: C.go, border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>+ Add Item</button>
          </div>
        </div>

        {showTemplateEditor && (
          <div style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            {templates.length === 0 && (
              <div style={{ padding: '16px', fontSize: 12, color: C.g, textAlign: 'center' }}>
                No checklist items yet. Load defaults or add your own.
              </div>
            )}
            {templates.map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderBottom: i < templates.length - 1 ? `1px solid ${C.bdrF}` : 'none',
                opacity: t.active === false ? 0.5 : 1,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{t.item_name}</div>
                  <div style={{ fontSize: 10, color: C.g, marginTop: 2 }}>
                    {t.due_days_from_hire ? `Due ${t.due_days_from_hire} days from hire` : 'No deadline'} &nbsp;·&nbsp;
                    <span style={{ color: t.active !== false ? '#6ab87a' : '#a0a0a0' }}>{t.active !== false ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <button onClick={() => setTemplateModal(t)} style={{ background: 'none', border: 'none', color: C.g, cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>✏️</button>
                <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', color: '#e07070', cursor: 'pointer', fontSize: 11, padding: '0 4px' }}>🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} style={{
          background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
          borderRadius: 6, padding: '5px 10px', fontSize: 11, fontFamily: 'inherit',
        }}>
          <option value="all">All Active Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{empName(e)}</option>)}
        </select>
        <span style={{ width: 1, background: C.bdr, margin: '0 4px' }} />
        {['pending', 'complete', 'na', 'all'].map(s => pill(
          s === 'all' ? 'All' : STATUS_CONFIG[s]?.label || s,
          filterStatus === s,
          () => setFilterStatus(s)
        ))}
      </div>
      {activeTemplates.length === 0 && (
        <div style={{ fontSize: 12, color: C.g, padding: '20px 0', textAlign: 'center' }}>
          No active checklist items. Add items to the template above.
        </div>
      )}

      {activeTemplates.length > 0 && displayEmps.length === 0 && (
        <div style={{ fontSize: 12, color: C.g, padding: '20px 0', textAlign: 'center' }}>
          No active employees found. Make sure employees are in PeopleFlow with status Active.
        </div>
      )}

      {activeTemplates.length > 0 && displayEmps.map(emp => {
        const empItems = checklistItems.filter(i => i.employee_id === emp.id)
        const hasItems = empItems.length > 0

        // Filter by status
        const visibleTemplates = activeTemplates.filter(t => {
          if (filterStatus === 'all') return true
          const item = empItems.find(i => i.template_id === t.id)
          const status = item?.status || 'pending'
          return status === filterStatus
        })

        if (visibleTemplates.length === 0) return null

        const pendingCount = activeTemplates.filter(t => {
          const item = empItems.find(i => i.template_id === t.id)
          return !item || item.status === 'pending'
        }).length

        const overdueCount = activeTemplates.filter(t => {
          const item = empItems.find(i => i.template_id === t.id)
          if (item?.status === 'complete' || item?.status === 'na') return false
          if (!t.due_days_from_hire || !emp.hire_date) return false
          const due = addDays(emp.hire_date, t.due_days_from_hire)
          return due && due < today
        }).length

        return (
          <div key={emp.id} style={{ background: C.bg2, border: `1px solid ${overdueCount > 0 ? '#c04040' : C.bdr}`, borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.bdrF}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.w }}>{empName(emp)}</span>
                {emp.hire_date && <span style={{ fontSize: 10, color: C.g, marginLeft: 10 }}>Hired {fmtDate(emp.hire_date)}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {overdueCount > 0 && <span style={{ fontSize: 10, color: '#e07070', fontWeight: 700 }}>⚠ {overdueCount} overdue</span>}
                {pendingCount > 0 && <span style={{ fontSize: 10, color: '#c4956a' }}>{pendingCount} pending</span>}
                {!hasItems && (
                  <button onClick={() => generateForEmployee(emp.id)} style={{ background: 'transparent', border: `1px solid ${C.go}`, color: C.go, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 10, fontFamily: 'inherit' }}>
                    ⚡ Generate Checklist
                  </button>
                )}
              </div>
            </div>
            {hasItems && visibleTemplates.map((t, i) => {
              const item = empItems.find(ci => ci.template_id === t.id)
              const status = item?.status || 'pending'
              const sc = STATUS_CONFIG[status] || STATUS_CONFIG.pending
              const dueDate = t.due_days_from_hire && emp.hire_date ? addDays(emp.hire_date, t.due_days_from_hire) : null
              const isOverdue = dueDate && dueDate < today && status === 'pending'

              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
                  borderBottom: i < visibleTemplates.length - 1 ? `1px solid ${C.bdrF}` : 'none',
                  background: isOverdue ? 'rgba(192,64,64,0.07)' : 'transparent',
                }}>
                  <button
                    onClick={() => item ? cycleStatus(item) : null}
                    disabled={!item}
                    title={item ? 'Click to cycle: Pending → Complete → N/A' : 'Generate checklist first'}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: status === 'complete' ? '#6ab87a' : status === 'na' ? '#3a3a3a' : 'transparent',
                      border: `2px solid ${sc.color}`,
                      color: status === 'complete' ? '#fff' : sc.color,
                      cursor: item ? 'pointer' : 'default',
                      fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >{sc.icon}</button>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: status === 'complete' ? C.g : C.w, textDecoration: status === 'complete' ? 'line-through' : 'none', fontWeight: 600 }}>
                      {t.item_name}
                    </div>
                    {dueDate && (
                      <div style={{ fontSize: 10, color: isOverdue ? '#e07070' : C.g, marginTop: 2 }}>
                        {isOverdue ? '⚠ Overdue — ' : 'Due '}
                        {fmtDate(dueDate)}
                        {t.due_days_from_hire && ` (${t.due_days_from_hire} days from hire)`}
                      </div>
                    )}
                    {item?.completed_at && status === 'complete' && (
                      <div style={{ fontSize: 10, color: '#6ab87a', marginTop: 2 }}>✓ Completed {fmtDate(item.completed_at.split('T')[0])}</div>
                    )}
                  </div>

                  <span style={{ fontSize: 10, color: sc.color, fontWeight: 600, flexShrink: 0 }}>{sc.label}</span>
                </div>
              )
            })}

            {!hasItems && (
              <div style={{ padding: '12px 14px', fontSize: 11, color: C.g, fontStyle: 'italic' }}>
                No checklist generated yet — click Generate Checklist to create items from your template.
              </div>
            )}
          </div>
        )
      })}

      <div style={{ marginTop: 20, padding: '10px 14px', borderLeft: `3px solid ${C.go}`, background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g, maxWidth: 500 }}>
        <strong style={{ color: C.go }}>Sidebar:</strong> Template is yours — add, remove, or deactivate any item. Click the circle to cycle status: Pending → Complete → N/A. Overdue items turn red. Generate a checklist per employee from your active template.
      </div>
    </div>
  )
}

// ─── PAYROLL PAYMENTS TAB ────────────────────────────────────────────────
// Wage garnishments, child support, tax levies, creditor orders
// Each payment type links to a resource (SDU portal, court system, etc.)
// Per-employee, per-order tracking with remittance deadlines

const PAYMENT_TYPE_DEFAULTS = [
  { name: 'Child Support', destination: 'MN Child Support Payment Center', url: 'https://childsupportmn.org', frequency: 'Per payroll', color: '#9a6ac4' },
  { name: 'Wage Garnishment', destination: 'Issuing Court / Creditor', url: '', frequency: 'Per payroll', color: '#c4956a' },
  { name: 'Tax Levy (IRS)', destination: 'IRS', url: 'https://eftps.gov', frequency: 'Per payroll', color: '#e07070' },
  { name: 'Tax Levy (State)', destination: 'MN Dept of Revenue', url: 'https://www.revenue.state.mn.us', frequency: 'Per payroll', color: '#e07070' },
  { name: 'Student Loan', destination: 'Dept of Education / Servicer', url: '', frequency: 'Per payroll', color: '#6ab87a' },
]

const BLANK_ORDER = {
  employee_name: '',
  payment_type: 'Child Support',
  case_number: '',
  destination: '',
  destination_url: '',
  amount_per_period: '',
  frequency: 'Per payroll',
  start_date: '',
  end_date: '',
  status: 'active',
  notes: '',
  // Garnishment calculator
  balance_owed: '',
  withhold_limit_type: 'none', // 'none' | 'times' | 'amount'
  withhold_max_times: '',
  withhold_until_amount: '',
  times_paid: 0,
}

function PayrollOrderModal({ order, orgId, C, employees = [], allResources = [], onSave, onClose }) {
  const isEdit = !!order?.id
  const [form, setForm] = useState(isEdit ? {
    employee_name: order.employee_name || '',
    payment_type: order.payment_type || 'Child Support',
    case_number: order.case_number || '',
    destination: order.destination || '',
    destination_url: order.destination_url || '',
    amount_per_period: order.amount_per_period || '',
    frequency: order.frequency || 'Per payroll',
    start_date: order.start_date || '',
    end_date: order.end_date || '',
    status: order.status || 'active',
    notes: order.notes || '',
    resource_ids: order.resource_ids || [],
    balance_owed: order.balance_owed || '',
    withhold_limit_type: order.withhold_limit_type || 'none',
    withhold_max_times: order.withhold_max_times || '',
    withhold_until_amount: order.withhold_until_amount || '',
    times_paid: order.times_paid || 0,
  } : { ...BLANK_ORDER, resource_ids: [] })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-fill destination when payment type changes
  function handleTypeChange(type) {
    const def = PAYMENT_TYPE_DEFAULTS.find(d => d.name === type)
    set('payment_type', type)
    if (def && !isEdit) {
      setForm(f => ({
        ...f,
        payment_type: type,
        destination: def.destination,
        destination_url: def.url,
        frequency: def.frequency,
      }))
    }
  }

  async function handleSave() {
    if (!form.employee_name || !form.payment_type) return
    setSaving(true)
    setSaveError(null)
    // Auto-close garnishment if limit reached
    let autoStatus = form.status
    if (form.payment_type === 'Wage Garnishment') {
      const timesPaid = parseInt(form.times_paid) || 0
      if (form.withhold_limit_type === 'times' && form.withhold_max_times && timesPaid >= parseInt(form.withhold_max_times)) {
        autoStatus = 'closed'
      }
      if (form.withhold_limit_type === 'amount' && form.withhold_until_amount && form.amount_per_period) {
        const totalWithheld = timesPaid * (parseFloat(form.amount_per_period) || 0)
        if (totalWithheld >= parseFloat(form.withhold_until_amount)) autoStatus = 'closed'
      }
    }
    const payload = {
      ...form,
      org_id: orgId,
      amount_per_period: parseFloat(form.amount_per_period) || 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: autoStatus,
      balance_owed: parseFloat(form.balance_owed) || null,
      withhold_max_times: parseInt(form.withhold_max_times) || null,
      withhold_until_amount: parseFloat(form.withhold_until_amount) || null,
      times_paid: parseInt(form.times_paid) || 0,
    }
    let error
    if (isEdit) {
      ({ error } = await supabase.from('payroll_payment_orders').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', order.id))
    } else {
      ({ error } = await supabase.from('payroll_payment_orders').insert([payload]))
    }
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    onSave()
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    await supabase.from('payroll_payment_orders').delete().eq('id', order.id)
    setDeleting(false)
    onSave()
  }

  const iStyle = {
    width: '100%', background: C.bg, border: `1px solid ${C.bdr}`,
    color: C.w, borderRadius: 6, padding: '7px 10px',
    fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const lStyle = { fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 14, width: '100%', maxWidth: 500, maxHeight: '92vh', overflowY: 'auto', padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: C.go, fontSize: 15, fontWeight: 700 }}>{isEdit ? '✏️ Edit Payment Order' : '➕ New Payment Order'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.g, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lStyle}>Employee *</label>
          <select value={form.employee_name} onChange={e => set('employee_name', e.target.value)} style={iStyle}>
            <option value="">— Select employee —</option>
            {employees.map(e => {
              const name = `${e.last_name}, ${e.first_name}`
              return <option key={e.id} value={name}>{name}</option>
            })}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={lStyle}>Payment Type *</label>
            <select value={form.payment_type} onChange={e => handleTypeChange(e.target.value)} style={iStyle}>
              {PAYMENT_TYPE_DEFAULTS.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
              <option value="Other">Other</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lStyle}>Frequency</label>
            <select value={form.frequency} onChange={e => set('frequency', e.target.value)} style={iStyle}>
              {['Per payroll', 'Monthly', 'Weekly', 'Bi-weekly'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lStyle}>Case / Order Number</label>
          <input value={form.case_number} onChange={e => set('case_number', e.target.value)} placeholder="e.g. 27-FA-24-001234" style={iStyle} />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 2 }}>
            <label style={lStyle}>Destination / Payee</label>
            <input value={form.destination} onChange={e => set('destination', e.target.value)} placeholder="MN Child Support Payment Center..." style={iStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lStyle}>Amount Per Period ($)</label>
            <input type="number" value={form.amount_per_period} onChange={e => set('amount_per_period', e.target.value)} min={0} step="0.01" style={iStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lStyle}>Portal / Website URL</label>
          <input value={form.destination_url} onChange={e => set('destination_url', e.target.value)} placeholder="https://..." style={iStyle} />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={lStyle}>Start Date</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={iStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lStyle}>End Date (if known)</label>
            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} style={iStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lStyle}>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} style={iStyle}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        {form.payment_type === 'Wage Garnishment' && (
          <div style={{ background: `rgba(201,168,76,0.08)`, border: `1px solid ${C.go}`, borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.go, marginBottom: 10 }}>Garnishment Calculator</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={lStyle}>Total Balance Owed ($)</label>
                <input type="number" value={form.balance_owed} onChange={e => set('balance_owed', e.target.value)} min={0} placeholder="e.g. 4500.00" style={iStyle} inputMode="decimal" />
              </div>
              <div>
                <label style={lStyle}>Times Paid (auto-tracked)</label>
                <input type="number" value={form.times_paid || 0} onChange={e => set('times_paid', parseInt(e.target.value) || 0)} min={0} style={iStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={lStyle}>Stop Withholding When</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[{v:'none',l:'No limit'},{v:'times',l:'After N times'},{v:'amount',l:'Balance reached'}].map(opt => (
                  <button key={opt.v} onClick={() => set('withhold_limit_type', opt.v)} style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    background: form.withhold_limit_type === opt.v ? C.gD : 'transparent',
                    border: `1px solid ${form.withhold_limit_type === opt.v ? C.go : C.bdrF}`,
                    color: form.withhold_limit_type === opt.v ? C.go : C.g,
                  }}>{opt.l}</button>
                ))}
              </div>
            </div>
            {form.withhold_limit_type === 'times' && (
              <div style={{ marginBottom: 6 }}>
                <label style={lStyle}>Stop After How Many Payrolls?</label>
                <input type="number" value={form.withhold_max_times} onChange={e => set('withhold_max_times', e.target.value)} min={1} placeholder="e.g. 12" style={iStyle} inputMode="numeric" />
                {form.times_paid > 0 && form.withhold_max_times && (
                  <div style={{ fontSize: 10, color: C.go, marginTop: 4 }}>
                    {form.times_paid} of {form.withhold_max_times} paid — {Math.max(0, parseInt(form.withhold_max_times) - parseInt(form.times_paid))} remaining
                  </div>
                )}
              </div>
            )}
            {form.withhold_limit_type === 'amount' && (
              <div style={{ marginBottom: 6 }}>
                <label style={lStyle}>Stop When Total Withheld Reaches ($)</label>
                <input type="number" value={form.withhold_until_amount} onChange={e => set('withhold_until_amount', e.target.value)} min={0} placeholder="e.g. 4500.00" style={iStyle} inputMode="decimal" />
                {form.times_paid > 0 && form.amount_per_period && form.withhold_until_amount && (
                  <div style={{ fontSize: 10, color: C.go, marginTop: 4 }}>
                    ~${(parseFloat(form.times_paid) * parseFloat(form.amount_per_period)).toFixed(2)} withheld of ${parseFloat(form.withhold_until_amount).toFixed(2)} target
                  </div>
                )}
              </div>
            )}
            {form.balance_owed && form.amount_per_period && (
              <div style={{ fontSize: 10, color: C.g, marginTop: 4, fontStyle: 'italic' }}>
                At ${parseFloat(form.amount_per_period).toFixed(2)}/period — estimated {Math.ceil(parseFloat(form.balance_owed) / parseFloat(form.amount_per_period))} payrolls to satisfy
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={lStyle}>Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Court info, account numbers, remittance instructions..." style={{ ...iStyle, resize: 'vertical', lineHeight: 1.5 }} />
        </div>

        {allResources.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <label style={lStyle}>Linked Resources</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allResources.map(r => {
                const linked = (form.resource_ids || []).includes(r.id)
                return (
                  <button key={r.id}
                    onClick={() => set('resource_ids', linked
                      ? (form.resource_ids || []).filter(id => id !== r.id)
                      : [...(form.resource_ids || []), r.id]
                    )}
                    style={{
                      background: linked ? C.gD : 'transparent',
                      border: `1px solid ${linked ? C.go : C.bdrF}`,
                      color: linked ? C.go : C.g,
                      borderRadius: 6, padding: '4px 10px',
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{linked ? '✓ ' : ''}{r.label}</button>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: C.g, marginTop: 4 }}>
              Linked resources appear as login buttons on the payment row.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isEdit && (
              <button onClick={handleDelete} disabled={deleting} style={{ background: confirmDelete ? '#c04040' : 'transparent', border: `1px solid #c04040`, color: confirmDelete ? '#fff' : '#c04040', padding: '7px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                {deleting ? 'Deleting…' : confirmDelete ? 'Confirm Delete' : '🗑 Delete'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {saveError && (
              <span style={{ fontSize: 11, color: '#e07070' }}>⚠ {saveError}</span>
            )}
            <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${C.bdr}`, color: C.g, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.employee_name} style={{ background: C.go, border: 'none', color: '#fff', padding: '7px 20px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', opacity: !form.employee_name ? 0.5 : 1 }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PayrollPaymentsTab({ orgId, C, employees = [], allResources = [], onOrdersChanged }) {
  const [payrollSubTab, setPayrollSubTab] = useState('orders')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterStatus, setFilterStatus] = useState('active')
  const [filterType, setFilterType] = useState('all')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('payroll_payment_orders').select('*').eq('org_id', orgId).order('employee_name')
    setOrders(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  function handleNew() { setEditing(null); setModalOpen(true) }
  function handleEdit(o) { setEditing(o); setModalOpen(true) }
  function handleSaved() { setModalOpen(false); setEditing(null); load(); if (onOrdersChanged) onOrdersChanged() }

  const STATUS_COLORS = { active: '#6ab87a', suspended: '#c4956a', closed: '#a0a0a0' }

  const filtered = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false
    if (filterType !== 'all' && o.payment_type !== filterType) return false
    return true
  })

  const allTypes = [...new Set(orders.map(o => o.payment_type))].sort()
  const totalActive = orders.filter(o => o.status === 'active').reduce((s, o) => s + (o.amount_per_period || 0), 0)

  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{
      background: active ? C.gD : 'transparent',
      border: `1px solid ${active ? C.go : C.bdrF}`,
      color: active ? C.go : C.g,
      padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    }}>{label}</button>
  )

  const subPill2 = (label, active, onClick) => (
    <button onClick={onClick} style={{
      background: active ? C.go : 'transparent',
      border: `1px solid ${active ? C.go : C.bdrF}`,
      color: active ? '#fff' : C.g,
      padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    }}>{label}</button>
  )

  return (
    <div>
      {modalOpen && <PayrollOrderModal order={editing} orgId={orgId} C={C} employees={employees} allResources={allResources} onSave={handleSaved} onClose={() => { setModalOpen(false); setEditing(null) }} />}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: `1px solid ${C.bdr}`, paddingBottom: 12 }}>
        {subPill2('Payment Orders', payrollSubTab === 'orders', () => setPayrollSubTab('orders'))}
        {subPill2('Withholding Processor', payrollSubTab === 'withholding', () => setPayrollSubTab('withholding'))}
        {subPill2('New Hire Checklist', payrollSubTab === 'checklist', () => setPayrollSubTab('checklist'))}
      </div>

      {payrollSubTab === 'withholding' && <WithholdingProcessorTab orgId={orgId} C={C} allResources={allResources} orders={orders} onPaymentSent={() => { if (onOrdersChanged) onOrdersChanged() }} />}
      {payrollSubTab === 'checklist' && <NewHireChecklistTab orgId={orgId} C={C} />}

      {payrollSubTab === 'orders' && <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: C.g }}>Garnishments, child support, levies — one place to track what goes where and when.</div>
          {totalActive > 0 && (
            <div style={{ fontSize: 11, color: C.go, marginTop: 4, fontWeight: 600 }}>
              Active per-period total: ${fmt(totalActive)} &nbsp;&bull;&nbsp; {orders.filter(o => o.status === 'active').length} active order{orders.filter(o => o.status === 'active').length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <button onClick={handleNew} style={{ background: C.go, border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>+ Add Order</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {['active', 'suspended', 'closed', 'all'].map(s => pill(s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1), filterStatus === s, () => setFilterStatus(s)))}
        {allTypes.length > 1 && <>
          <span style={{ width: 1, background: C.bdr, margin: '0 4px' }} />
          {pill('All Types', filterType === 'all', () => setFilterType('all'))}
          {allTypes.map(t => pill(t, filterType === t, () => setFilterType(t)))}
        </>}
      </div>

      {loading && <p style={{ fontSize: 12, color: C.g }}>Loading…</p>}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 && <p style={{ fontSize: 12, color: C.g }}>No orders match this filter.</p>}
          {filtered.map(o => {
            const typeDef = PAYMENT_TYPE_DEFAULTS.find(d => d.name === o.payment_type)
            const typeColor = typeDef?.color || '#a0a0a0'
            const statusColor = STATUS_COLORS[o.status] || '#a0a0a0'
            return (
              <div key={o.id} onClick={() => handleEdit(o)} style={{
                background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10,
                padding: '12px 16px', cursor: 'pointer', display: 'flex', gap: 12,
                alignItems: 'flex-start', flexWrap: 'wrap',
                transition: 'border-color 0.15s',
              }}
                onMouseOver={e => e.currentTarget.style.borderColor = C.go}
                onMouseOut={e => e.currentTarget.style.borderColor = C.bdr}
              >
                <div style={{ width: 4, alignSelf: 'stretch', background: typeColor, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.w }}>{o.employee_name}</span>
                    <span style={{ fontSize: 10, background: typeColor + '33', color: typeColor, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>{o.payment_type}</span>
                    <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>● {o.status}</span>
                  </div>
                  {o.case_number && <div style={{ fontSize: 11, color: C.g, marginTop: 3 }}>Case: {o.case_number}</div>}
                  {o.destination && <div style={{ fontSize: 11, color: C.g, marginTop: 2 }}>→ {o.destination}</div>}
                  {o.notes && <div style={{ fontSize: 10, color: C.g, marginTop: 4, fontStyle: 'italic' }}>{o.notes}</div>}
                  {o.payment_type === 'Wage Garnishment' && o.withhold_limit_type && o.withhold_limit_type !== 'none' && (() => {
                    const paid = parseInt(o.times_paid) || 0
                    if (o.withhold_limit_type === 'times' && o.withhold_max_times) {
                      const pct = Math.min(100, Math.round((paid / parseInt(o.withhold_max_times)) * 100))
                      return <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 10, color: C.g, marginBottom: 3 }}>{paid} / {o.withhold_max_times} payrolls</div>
                        <div style={{ height: 4, background: C.bdr, borderRadius: 2, overflow: 'hidden', width: 120 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#6ab87a' : C.go, borderRadius: 2, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    }
                    if (o.withhold_limit_type === 'amount' && o.withhold_until_amount && o.amount_per_period) {
                      const withheld = paid * parseFloat(o.amount_per_period)
                      const target = parseFloat(o.withhold_until_amount)
                      const pct = Math.min(100, Math.round((withheld / target) * 100))
                      return <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 10, color: C.g, marginBottom: 3 }}>${withheld.toFixed(0)} / ${target.toFixed(0)} withheld</div>
                        <div style={{ height: 4, background: C.bdr, borderRadius: 2, overflow: 'hidden', width: 120 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#6ab87a' : C.go, borderRadius: 2, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    }
                    return null
                  })()}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {o.amount_per_period > 0 && (
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.go }}>${fmt(o.amount_per_period)}</div>
                  )}
                  <div style={{ fontSize: 10, color: C.g }}>{o.frequency}</div>
                  {o.destination_url && (
                    <a href={o.destination_url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ display: 'inline-block', marginTop: 6, fontSize: 10, color: C.go, textDecoration: 'none', border: `1px solid ${C.go}`, padding: '2px 8px', borderRadius: 4 }}>
                      🔗 Portal
                    </a>
                  )}
                  {(o.resource_ids || []).length > 0 && allResources.filter(r => (o.resource_ids || []).includes(r.id)).map(r => (
                    <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ display: 'inline-block', marginTop: 4, marginLeft: 4, fontSize: 10, color: '#7ab0e0', textDecoration: 'none', border: '1px solid #7ab0e0', padding: '2px 8px', borderRadius: 4 }}>
                      🔑 {r.label}
                    </a>
                  ))}
                  {(o.payment_type === 'Wage Garnishment' || o.payment_type === 'Child Support') && (
                    <button onClick={e => { e.stopPropagation(); setLetterModal({ letterType: o.payment_type === 'Wage Garnishment' ? 'garnishment' : 'child_support', record: o }) }} style={{
                      display: 'block', marginTop: 8, background: 'transparent',
                      border: `1px solid ${C.bdrF}`, color: C.g,
                      borderRadius: 5, padding: '3px 10px', fontSize: 10,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>📄 Employee Notice</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div style={{ marginTop: 24, padding: '12px 16px', background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.go, marginBottom: 10 }}>Quick Reference Links</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'MN Child Support', url: 'https://childsupportmn.org' },
            { label: 'MN Child Support Employer Guide', url: 'https://childsupportmn.org/employers/' },
            { label: 'IRS Levy Guidelines', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/levy' },
            { label: 'EFTPS', url: 'https://www.eftps.gov' },
            { label: 'MN Revenue', url: 'https://www.revenue.state.mn.us' },
            { label: 'DOL Garnishment Rules', url: 'https://www.dol.gov/agencies/whd/wage-garnishment' },
          ].map(l => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 10, color: C.go, textDecoration: 'none',
              border: `1px solid ${C.bdrF}`, padding: '4px 10px',
              borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>🔗 {l.label}</a>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '10px 14px', borderLeft: `3px solid ${C.go}`, background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g, maxWidth: 500 }}>
        <strong style={{ color: C.go }}>Sidebar:</strong> Each order lives on its employee record. Portal button goes straight to the remittance site. Click any row to edit. Active orders total updates automatically.
      </div>
      </div>}
    </div>


  )
}

// ─── JE HISTORY TAB ──────────────────────────────────────────────────────────
// JE History — groups by JE number, shows clickable titles with expandable line detail
function JEHistoryTab({ orgId, C }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [expanded, setExpanded] = useState({})   // { jeKey: bool }
  const [filterYear, setFilterYear] = useState('all')
  const [acctNumMap, setAcctNumMap] = useState({}) // source_account -> account_number

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const [{ data, error: err }, { data: mapData }, { data: coaData }] = await Promise.all([
        supabase.from('iif_je_history').select('*').eq('org_id', orgId).order('posted_at', { ascending: true }),
        supabase.from('iif_account_map').select('source_account,qbo_account').eq('org_id', orgId),
        supabase.from('coa_accounts').select('account_name,account_number').eq('org_id', orgId),
      ])
      if (err) { setError(err.message); setLoading(false); return }
      const qboToNum = {}
      ;(coaData || []).forEach(r => { if (r.account_number) qboToNum[r.account_name] = r.account_number })
      const srcToNum = {}
      ;(mapData || []).forEach(r => {
        const num = qboToNum[r.qbo_account]
        if (num) srcToNum[r.source_account] = num
      })
      setAcctNumMap(srcToNum)
      setRows(data || [])
      setLoading(false)
    }
    load()
  }, [orgId])

  // Group rows by je_number (or fall back to file_name for legacy rows)
  const byJE = {}
  rows.forEach(r => {
    const key = r.je_number || r.file_name || `${r.period}-legacy`
    if (!byJE[key]) byJE[key] = {
      je_number: r.je_number || key,
      file_name: r.file_name || '',
      period: r.period,
      upload_mode: r.upload_mode || 'weekly',
      memo: r.memo || '',
      posted_at: r.posted_at,
      lines: [],
    }
    byJE[key].lines.push(r)
  })

  // Group by period for rollups
  const byPeriod = {}
  rows.forEach(r => {
    if (!byPeriod[r.period]) byPeriod[r.period] = {}
    const acct = r.qbo_account || r.source_account || '(unknown)'
    if (!byPeriod[r.period][acct]) byPeriod[r.period][acct] = { dr: 0, cr: 0 }
    if (r.amount >= 0) byPeriod[r.period][acct].dr += r.amount
    else               byPeriod[r.period][acct].cr += Math.abs(r.amount)
  })

  const years = [...new Set(rows.map(r => (r.period || '').slice(0, 4)))].filter(Boolean).sort()
  const allJEs = Object.entries(byJE).sort(([, a], [, b]) => {
    // Sort by period descending (newest first)
    const pCmp = (b.period || '').localeCompare(a.period || '')
    if (pCmp !== 0) return pCmp
    // Within same period: weeklies before period-end
    const aIsWeekly = a.upload_mode === 'weekly' || !a.upload_mode
    const bIsWeekly = b.upload_mode === 'weekly' || !b.upload_mode
    if (aIsWeekly && !bIsWeekly) return -1
    if (!aIsWeekly && bIsWeekly) return 1
    // Within same type: by posted_at ascending
    return (a.posted_at || '').localeCompare(b.posted_at || '')
  })
  const filteredJEs = filterYear === 'all' ? allJEs : allJEs.filter(([, je]) => (je.period || '').startsWith(filterYear))

  // YTD totals
  const filteredRows = filterYear === 'all' ? rows : rows.filter(r => (r.period || '').startsWith(filterYear))
  const ytdDr = filteredRows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const ytdCr = filteredRows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0)

  function toggle(key) { setExpanded(e => ({ ...e, [key]: !e[key] })) }

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
    borderRadius: 6, padding: '5px 10px', fontSize: 11, fontFamily: 'inherit',
  }

  if (loading) return <p style={{ color: C.g, fontSize: 13 }}>Loading history…</p>
  if (error)   return <div style={{ color: '#e07070', fontSize: 12 }}>⚠ {error}</div>
  if (rows.length === 0) return (
    <div style={{ color: C.g, fontSize: 13, padding: 20, textAlign: 'center' }}>
      No posted history yet. Upload IIF files in the IIF Factory tab to get started.
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Filter Year</label>
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={inputStyle}>
            <option value="all">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11, color: C.g, paddingTop: 18 }}>
          {filteredJEs.length} entr{filteredJEs.length !== 1 ? 'ies' : 'y'} · {filteredRows.length} lines
        </div>
      </div>
      <div style={{
        background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10,
        padding: '14px 18px', marginBottom: 20,
        display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>{filterYear === 'all' ? 'All-Time' : filterYear} DR</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6ab87a', fontFamily: "'DM Mono', monospace" }}>${fmt(ytdDr)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>{filterYear === 'all' ? 'All-Time' : filterYear} CR</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e07070', fontFamily: "'DM Mono', monospace" }}>${fmt(ytdCr)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Net</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: Math.abs(ytdDr - ytdCr) < 0.01 ? '#6ab87a' : C.go }}>
            ${fmt(ytdDr - ytdCr)} {Math.abs(ytdDr - ytdCr) < 0.01 ? '✓' : ''}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Entries</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.go, fontFamily: "'DM Mono', monospace" }}>{filteredJEs.length}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.go, marginBottom: 10, letterSpacing: '0.5px' }}>POSTED ENTRIES</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredJEs.map(([key, je]) => {
          const isOpen = expanded[key]
          const jeDr = je.lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0)
          const jeCr = je.lines.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0)
          const balanced = Math.abs(jeDr - jeCr) < 0.01
          const isWeekly = je.upload_mode === 'weekly' || !je.upload_mode
          const modeColor = isWeekly ? '#6ab87a' : '#9a6ac4'
          const modeLabel = isWeekly ? 'Weekly' : 'Period-End'

          return (
            <div key={key} style={{
              background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10, overflow: 'hidden',
            }}>
              <div onClick={() => toggle(key)} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '10px 14px', cursor: 'pointer',
                background: isOpen ? C.gD : 'transparent',
                borderBottom: isOpen ? `1px solid ${C.bdr}` : 'none',
              }}>
                <span style={{ fontSize: 11, color: C.g, width: 14 }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.go, flex: 1, minWidth: 200 }}>{je.je_number}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: modeColor, border: `1px solid ${modeColor}`, borderRadius: 4, padding: '1px 6px' }}>{modeLabel}</span>
                <span style={{ fontSize: 10, color: C.g, fontFamily: "'DM Mono', monospace" }}>
                  DR: <span style={{ color: '#6ab87a' }}>${fmt(jeDr)}</span>
                  &nbsp;&nbsp;CR: <span style={{ color: '#e07070' }}>${fmt(jeCr)}</span>
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: balanced ? '#6ab87a' : '#e07070' }}>
                  {balanced ? '✓' : `⚠ OFF $${fmt(Math.abs(jeDr - jeCr))}`}
                </span>
                <span style={{ fontSize: 9, color: C.g }}>{je.period}</span>
              </div>
              {isOpen && (
                <div style={{ padding: '12px 16px' }}>
                  {je.memo && <div style={{ fontSize: 10, color: C.g, marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>Note: {je.memo}</div>}
                  {je.file_name && <div style={{ fontSize: 10, color: C.g, marginBottom: 10 }}>File: {je.file_name}</div>}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.bdr}` }}>
                        <th style={{ textAlign: 'left', color: C.g, padding: '4px 0', fontWeight: 600, width: 80 }}>Acct #</th>
                        <th style={{ textAlign: 'left', color: C.g, padding: '4px 8px', fontWeight: 600 }}>Account Name</th>
                        <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 110 }}>Debit</th>
                        <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 110 }}>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...je.lines].sort((a, b) => {
                        const na = acctNumMap[a.source_account] || '99999'
                        const nb = acctNumMap[b.source_account] || '99999'
                        return parseFloat(na) - parseFloat(nb)
                      }).map((l, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.bdrF}` }}>
                          <td style={{ color: C.go, padding: '4px 0', fontSize: 10, whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace" }}>{acctNumMap[l.source_account] || ''}</td>
                          <td style={{ color: C.w, padding: '4px 8px', wordBreak: 'break-word' }}>{l.qbo_account || l.source_account}</td>
                          <td style={{ textAlign: 'right', color: '#6ab87a', padding: '4px 0' }}>{l.amount > 0 ? fmt(l.amount) : ''}</td>
                          <td style={{ textAlign: 'right', color: '#e07070', padding: '4px 0' }}>{l.amount < 0 ? fmt(Math.abs(l.amount)) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `1px solid ${C.bdr}` }}>
                        <td style={{ color: C.g, fontSize: 10, padding: '4px 0' }}></td>
                        <td style={{ color: C.g, fontSize: 10, padding: '4px 8px' }}>TOTALS</td>
                        <td style={{ textAlign: 'right', color: '#6ab87a', fontWeight: 700, padding: '4px 0' }}>${fmt(jeDr)}</td>
                        <td style={{ textAlign: 'right', color: '#e07070', fontWeight: 700, padding: '4px 0' }}>${fmt(jeCr)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {je.posted_at && <div style={{ fontSize: 9, color: C.g, marginTop: 8 }}>Posted: {new Date(je.posted_at).toLocaleString()}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}



// ═══════════════════════════════════════════════════════
// CASH DASHBOARD — upload QBO CSVs, view entity panels
// ═══════════════════════════════════════════════════════
function CashDashboard({ orgId, C }) {
  const [snapshots, setSnapshots] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [iazData, setIazData] = useState(null)
  const [omegaData, setOmegaData] = useState(null)
  const [iazAP, setIazAP] = useState([])
  const [iazAR, setIazAR] = useState([])
  const [iazARMeta, setIazARMeta] = useState(null)   // { total_ar, invoice_count, oldest_date, pdf_url, uploaded_at }
  const [omegaAR, setOmegaAR] = useState([])
  const [entityView, setEntityView] = useState('both')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(null)
  const [toast, setToast] = useState('')
  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // Load available snapshot dates on mount
  useEffect(() => {
    if (!orgId) return
    supabase.from('cashflow_snapshots')
      .select('snapshot_date,entity')
      .eq('org_id', orgId)
      .order('snapshot_date', { ascending: false })
      .then(({ data }) => {
        if (!data || !data.length) { setLoading(false); return }
        const dates = [...new Set(data.map(r => r.snapshot_date))].sort((a,b) => b.localeCompare(a))
        setSnapshots(dates)
        setSelectedDate(dates[0])
      })
  }, [orgId])

  // Load data when date changes — find most recent snapshot on or before selected date
  useEffect(() => {
    if (!selectedDate || !orgId) return
    setLoading(true)
    Promise.all([
      supabase.from('cashflow_snapshots').select('*').eq('org_id', orgId).eq('entity', 'iaz').lte('snapshot_date', selectedDate).order('snapshot_date', { ascending: false }).limit(1),
      supabase.from('cashflow_snapshots').select('*').eq('org_id', orgId).eq('entity', 'omega').lte('snapshot_date', selectedDate).order('snapshot_date', { ascending: false }).limit(1),
      supabase.from('cashflow_ap').select('*').eq('org_id', orgId).eq('entity', 'iaz').lte('snapshot_date', selectedDate).order('snapshot_date', { ascending: false }).limit(1).then(async r => {
        if (!r.data || !r.data[0]) return { data: [] }
        return supabase.from('cashflow_ap').select('*').eq('org_id', orgId).eq('entity', 'iaz').eq('snapshot_date', r.data[0].snapshot_date).order('total', { ascending: true })
      }),
      supabase.from('cashflow_ar').select('*').eq('org_id', orgId).eq('entity', 'omega').lte('snapshot_date', selectedDate).order('snapshot_date', { ascending: false }).limit(1).then(async r => {
        if (!r.data || !r.data[0]) return { data: [] }
        return supabase.from('cashflow_ar').select('*').eq('org_id', orgId).eq('entity', 'omega').eq('snapshot_date', r.data[0].snapshot_date).order('total', { ascending: false })
      }),
      // IAZ AR — customer-level rows from cashflow_ar
      supabase.from('cashflow_ar').select('*').eq('org_id', orgId).eq('entity', 'iaz').lte('snapshot_date', selectedDate).order('snapshot_date', { ascending: false }).limit(1).then(async r => {
        if (!r.data || !r.data[0]) return { data: [] }
        return supabase.from('cashflow_ar').select('*').eq('org_id', orgId).eq('entity', 'iaz').eq('snapshot_date', r.data[0].snapshot_date).order('total', { ascending: false })
      }),
      // IAZ AR report meta (PDF summary)
      supabase.from('cashflow_ar_reports').select('*').eq('org_id', orgId).eq('entity', 'iaz').order('uploaded_at', { ascending: false }).limit(1)
    ]).then(([iazSnap, omegaSnap, apR, arR, iazArR, iazArMetaR]) => {
      setIazData((iazSnap.data || [])[0] || null)
      setOmegaData((omegaSnap.data || [])[0] || null)
      setIazAP(apR.data || [])
      setOmegaAR(arR.data || [])
      setIazAR(iazArR.data || [])
      setIazARMeta((iazArMetaR.data || [])[0] || null)
      setLoading(false)
    })
  }, [selectedDate, orgId])

  const fmt = n => {
    if (n == null) return '—'
    const abs = Math.abs(Number(n))
    const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return Number(n) < 0 ? '(' + str + ')' : str
  }

  // Parse date from QBO file header
  const snapToSaturday = (d) => {
    const day = d.getDay()
    const diff = day === 6 ? 0 : day === 0 ? 1 : day + 1
    const sat = new Date(d)
    sat.setDate(d.getDate() - diff)
    return sat.toISOString().split('T')[0]
  }

  const parseDateFromHeader = (text) => {
    const lines = text.split('\n').slice(0, 5).join(' ')
    const asOfRe = new RegExp('As of ([A-Za-z]+ \\d{1,2},? \\d{4})', 'i'); const asOf = lines.match(asOfRe)
    if (asOf) {
      const d = new Date(asOf[1])
      if (!isNaN(d)) return snapToSaturday(d)
    }
    const rangeRe = new RegExp('[A-Za-z]+ \\d{1,2},? \\d{4}[-]([A-Za-z]+ \\d{1,2},? \\d{4})'); const range = lines.match(rangeRe)
    if (range) {
      const d = new Date(range[1])
      if (!isNaN(d)) return snapToSaturday(d)
    }
    return null
  }

  const any = (arr, fn) => arr.some(fn)
  const parseBalanceSheet = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    // Parse into sections — show everything, let user decide what matters
    const cashAccounts = []
    const ccAccounts = []
    const loanAccounts = []
    let loc_balance = null
    let ar_total = 0
    let section = ''

    // Find the last non-empty numeric value in a CSV row
    const parseLastVal = (parts) => {
      for (let i = parts.length - 1; i >= 1; i--) {
        const s = (parts[i] || '').replace(/[$,"]/g, '').trim()
        if (!s || s === '-') continue
        // Handle parenthetical negatives: (1234.56)
        const parens = s.match(/^\((.+)\)$/)
        if (parens) return -(parseFloat(parens[1].replace(/,/g,'')) || 0)
        const n = parseFloat(s.replace(/,/g,''))
        if (!isNaN(n)) return n
      }
      return 0
    }

    lines.forEach(row => {
      const parts = row.split(',').map(s => s.replace(/"/g,'').trim())
      const label = parts[0] || ''
      const val = parseLastVal(parts)
      const low = label.toLowerCase()
      if (!label) return

      // Track section
      if (low === 'bank accounts') { section = 'cash'; return }
      if (low === 'credit cards') { section = 'cc'; return }
      if (low === 'long-term liabilities' || low === 'other long term liabilities') { section = 'loans'; return }
      if (low === 'current liabilities' || low === 'other current liabilities') { section = 'current_liab'; return }
      if (low === 'assets' || low === 'current assets' || low === 'liabilities and equity' || low === 'liabilities' || low === 'equity') { section = ''; return }
      if (low.startsWith('total')) return

      if (val === 0) return

      if (section === 'cash') {
        // Cash should always be stored as-is (positive = good, negative = overdrawn)
        cashAccounts.push({ label, value: val })
      } else if (section === 'cc') {
        // CC balance = what you owe — store as positive (display handles abs)
        ccAccounts.push({ label, value: Math.abs(val) })
      } else if (section === 'loans') {
        // Loan balances = what you owe — store as positive
        loanAccounts.push({ label, value: Math.abs(val) })
      } else if (section === 'current_liab') {
        // LOC goes here
        if (low.includes('loc') || low.includes('cash flow manager') || low.includes('line of credit')) {
          loc_balance = Math.abs(val)
        } else if (low.includes('loan') || low.includes('payable') || low.includes('meda') || low.includes('mortgage')) {
          loanAccounts.push({ label, value: Math.abs(val) })
        }
      } else {
        // Non-section items — pick up AR
        if (label.includes('11000') || (low.includes('accounts receivable') && !low.includes('total'))) {
          ar_total = val
        }
      }
    })
    return { cashAccounts, ccAccounts, loanAccounts, loc_balance, ar_total }
  }

  // Omega AR — simple summary CSV (one row per customer, 7 columns)
  const parseOmegaAR = (text) => {
    const rows = []
    function splitCSV(line) {
      const result = []; let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQ = !inQ }
        else if (line[i] === ',' && !inQ) { result.push(cur.trim()); cur = '' }
        else { cur += line[i] }
      }
      result.push(cur.trim()); return result
    }
    const pv = s => parseFloat((s||'').replace(/['"$, ]/g,'')) || 0
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    // Find header row
    let dataStart = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('customer') && lines[i].toLowerCase().includes('current')) {
        dataStart = i + 1; break
      }
    }
    if (dataStart < 0) dataStart = 1
    for (let i = dataStart; i < lines.length; i++) {
      const parts = splitCSV(lines[i])
      const label = parts[0].replace(/"/g,'').trim()
      if (!label) continue
      const low = label.toLowerCase()
      if (['total','a/r aging','infinity','as of','friday','monday','tuesday','wednesday','thursday','saturday','sunday'].some(x => low.includes(x))) continue
      const curr = pv(parts[1]), d30 = pv(parts[2]), d60 = pv(parts[3]), d90 = pv(parts[4]), over90 = pv(parts[5]), total = pv(parts[6])
      if (total === 0 && curr === 0) continue
      rows.push({ customer: label, current_amt: curr, d30, d60, d90, over90, total })
    }
    rows.sort((a,b) => a.customer.localeCompare(b.customer))
    return { rows, totalAR: rows.reduce((s,r)=>s+r.total,0), invoiceCount: null, oldestDate: null }
  }

  // IAZ AR — invoice-detail CSV (customer header rows + individual invoice rows)
  const parseIAZAR = (text) => {
    function splitCSV(line) {
      const result = []; let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQ = !inQ }
        else if (line[i] === ',' && !inQ) { result.push(cur.trim()); cur = '' }
        else { cur += line[i] }
      }
      result.push(cur.trim()); return result
    }
    const pv = s => { const c = (s||'').replace(/['"$, ]/g,''); if (!c||c==='-') return 0; const p = c.match(/^\((.+)\)$/); if (p) return -(parseFloat(p[1])||0); return parseFloat(c)||0 }
    const isInvoiceNum = s => /^\d{7,}$/.test((s||'').trim())
    const isDate = s => /\d{1,2}\/\d{1,2}\/\d{4}/.test((s||'').trim())

    const lines = text.split('\n')
    const customerMap = {}
    let currentCustomer = null
    let oldestAgeOverall = 0, oldestDateOverall = null

    for (const rawLine of lines) {
      const parts = splitCSV(rawLine)
      const col0 = (parts[0]||'').replace(/"/g,'').trim()
      const col1 = (parts[1]||'').trim()
      const col2 = (parts[2]||'').trim()
      if (!col0 && !col1) continue
      const low0 = col0.toLowerCase()
      if (low0.startsWith('outstanding')||low0.startsWith('totals:')||low0.includes('minuteman press uptown')||low0.includes('page ')) continue
      if (low0.includes('*** customer has a credit')) continue
      // Invoice row: 7-digit number in col0, date in col2
      if (isInvoiceNum(col0) && isDate(col2)) {
        if (!currentCustomer) continue
        const balance = pv(parts[19]||parts[18]||'')
        const age = parseInt(((parts[24]||parts[23]||'')).replace(/\D/g,'')) || 0
        if (!customerMap[currentCustomer]) customerMap[currentCustomer] = { balance: 0, invoiceCount: 0, oldestDate: col2, oldestAge: 0 }
        customerMap[currentCustomer].balance += balance
        customerMap[currentCustomer].invoiceCount++
        if (age > customerMap[currentCustomer].oldestAge) { customerMap[currentCustomer].oldestAge = age; customerMap[currentCustomer].oldestDate = col2 }
        if (age > oldestAgeOverall) { oldestAgeOverall = age; oldestDateOverall = col2 }
        continue
      }
      // Subtotal row: col0 empty, col1 starts with digit
      if (col0 === '' && /^\d/.test(col1)) continue
      // Customer row: has a name, not a total
      if (col0 && !isInvoiceNum(col0) && !low0.startsWith('totals')) { currentCustomer = col0; continue }
    }

    const rows = Object.entries(customerMap)
      .filter(([,v]) => Math.abs(v.balance) > 0.009)
      .map(([customer, v]) => ({
        customer, total: v.balance, invoice_count: v.invoiceCount,
        oldest_date: v.oldestDate, oldest_age: v.oldestAge,
        current_amt: 0, d30: 0, d60: 0, d90: 0, over90: 0,
      }))
      .sort((a,b) => a.customer.localeCompare(b.customer))

    return { rows, totalAR: rows.reduce((s,r)=>s+r.total,0), invoiceCount: Object.values(customerMap).reduce((s,v)=>s+v.invoiceCount,0), oldestDate: oldestDateOverall }
  }

  const parseAPaging = (text) => {
    const rows = []
    // Split respecting quoted fields (commas inside quotes)
    function splitCSV(line) {
      const result = []
      let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQ = !inQ }
        else if (line[i] === ',' && !inQ) { result.push(cur.trim()); cur = '' }
        else { cur += line[i] }
      }
      result.push(cur.trim())
      return result
    }
    const pv = s => {
      const clean = (s||'').replace(/['"$, ]/g,'')
      if (!clean || clean === '-') return 0
      return parseFloat(clean) || 0
    }
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    // Find the header row — contains 'Vendor' or 'VENDOR'
    let dataStart = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('vendor') && lines[i].toLowerCase().includes('current')) {
        dataStart = i + 1; break
      }
    }
    if (dataStart < 0) dataStart = 1
    for (let i = dataStart; i < lines.length; i++) {
      const parts = splitCSV(lines[i])
      const vendor = parts[0].replace(/"/g,'').trim()
      if (!vendor) continue
      const low = vendor.toLowerCase()
      if (['total','totals','a/p aging','as of','friday','monday','tuesday','wednesday','thursday','saturday','sunday'].some(x => low.includes(x))) continue
      const curr = pv(parts[1]), d30 = pv(parts[2]), d60 = pv(parts[3]), d90 = pv(parts[4]), over90 = pv(parts[5])
      const total = curr + d30 + d60 + d90 + over90
      if (total === 0 && !parts.slice(1,6).some(p => p.trim() && p.trim() !== '-')) continue
      rows.push({ vendor, current_amt: curr, d30, d60, d90, over90, total })
    }
    // Sort alphabetically
    rows.sort((a, b) => a.vendor.localeCompare(b.vendor))
    return rows
  }

  const parsePayroll = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const pv = s => parseFloat((s||'').replace(/['"$,]/g,'')) || 0
    let gross = 0, taxes = 0, period = ''
    // Find last period row — date range pattern
    lines.forEach(line => {
      const parts = line.split(',').map(s => s.replace(/"/g,'').trim())
      const dateRe1 = new RegExp('\\d{4}-\\d{2}-\\d{2}'); const dateRe2 = new RegExp('\\d{1,2}/\\d{1,2}/\\d{4}'); if (dateRe1.test(parts[0]) || dateRe2.test(parts[0])) {
        const g = pv(parts[3]) || pv(parts[2])
        if (g > gross) { gross = g; taxes = Math.abs(pv(parts[7]||parts[6]||'0')); period = parts[0] }
      }
    })
    return { payroll_gross: gross, payroll_net: gross - taxes, payroll_taxes: taxes, payroll_period: period }
  }


  const handleUpload = async (entity, type, file) => {
    if (!file) return
    setUploading(entity + '_' + type)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target.result
      const detectedDate = parseDateFromHeader(text)
      const snapDate = detectedDate || selectedDate || new Date().toISOString().split('T')[0]

      try {
        if (type === 'balance') {
          const parsed = parseBalanceSheet(text)
          // Upsert snapshot
          const { data: existing } = await supabase.from('cashflow_snapshots').select('id').eq('org_id',orgId).eq('entity',entity).eq('snapshot_date',snapDate).single()
          if (existing) {
            await supabase.from('cashflow_snapshots').update({
              cash_accounts: parsed.cashAccounts,
              cc_accounts: parsed.ccAccounts,
              loan_accounts: parsed.loanAccounts,
              loc_balance: parsed.loc_balance,
              ar_total: parsed.ar_total,
              uploaded_at: new Date().toISOString()
            }).eq('id', existing.id)
          } else {
            await supabase.from('cashflow_snapshots').insert({
              org_id: orgId, entity, snapshot_date: snapDate,
              cash_accounts: parsed.cashAccounts, cc_accounts: parsed.ccAccounts,
              loan_accounts: parsed.loanAccounts,
              loc_balance: parsed.loc_balance, ar_total: parsed.ar_total
            })
          }
          sh('Balance Sheet loaded' + (detectedDate ? ' — dated ' + snapDate : '') + ' checkmark')
        } else if (type === 'ar') {
          const parsed = entity === 'iaz' ? parseIAZAR(text) : parseOmegaAR(text)
          const rows = parsed.rows
          await supabase.from('cashflow_ar').delete().eq('org_id',orgId).eq('entity',entity).eq('snapshot_date',snapDate)
          if (rows.length) await supabase.from('cashflow_ar').insert(rows.map(r => ({ ...r, org_id: orgId, entity, snapshot_date: snapDate })))
          // For IAZ save/update meta row with totals + oldest date
          if (entity === 'iaz') {
            const metaPayload = { org_id: orgId, entity: 'iaz', report_date: snapDate, total_ar: parsed.totalAR || null, invoice_count: parsed.invoiceCount || null, oldest_date: parsed.oldestDate || null, uploaded_at: new Date().toISOString() }
            const { data: existingMeta } = await supabase.from('cashflow_ar_reports').select('id').eq('org_id',orgId).eq('entity','iaz').order('uploaded_at',{ascending:false}).limit(1).maybeSingle()
            if (existingMeta?.id) {
              const { data: upd } = await supabase.from('cashflow_ar_reports').update(metaPayload).eq('id',existingMeta.id).select().single()
              if (upd) setIazARMeta(upd)
            } else {
              const { data: ins } = await supabase.from('cashflow_ar_reports').insert([metaPayload]).select().single()
              if (ins) setIazARMeta(ins)
            }
          }
          sh(rows.length + ' AR customers loaded ✓')
          const { data: freshAR } = await supabase.from('cashflow_ar').select('*').eq('org_id',orgId).eq('entity',entity).eq('snapshot_date',snapDate).order('total',{ascending:false})
          if (entity === 'iaz') setIazAR(freshAR || [])
          else setOmegaAR(freshAR || [])
          setUploading(null); return
        } else if (type === 'ap') {
          const rows = parseAPaging(text)
          await supabase.from('cashflow_ap').delete().eq('org_id',orgId).eq('entity',entity).eq('snapshot_date',snapDate)
          if (rows.length) await supabase.from('cashflow_ap').insert(rows.map(r => ({ ...r, org_id: orgId, entity, snapshot_date: snapDate })))
          sh(rows.length + ' AP vendors loaded ✓')
          // Reload AP rows directly without changing selected date
          const { data: freshAP } = await supabase.from('cashflow_ap').select('*').eq('org_id',orgId).eq('entity',entity).eq('snapshot_date',snapDate).order('total',{ascending:true})
          setIazAP(freshAP || [])
          setUploading(null); return
        } else if (type === 'payroll') {
          const parsed = parsePayroll(text)
          const { data: existing } = await supabase.from('cashflow_snapshots').select('id').eq('org_id',orgId).eq('entity',entity).eq('snapshot_date',snapDate).single()
          if (existing) {
            await supabase.from('cashflow_snapshots').update({ ...parsed, uploaded_at: new Date().toISOString() }).eq('id', existing.id)
          } else {
            await supabase.from('cashflow_snapshots').insert({ org_id: orgId, entity, snapshot_date: snapDate, ...parsed })
          }
          sh('Payroll loaded — ' + parsed.payroll_period + ' checkmark')
        }
        // Refresh date list — for AP/AR uploads don't change the selected date
        const { data: allSnaps } = await supabase.from('cashflow_snapshots').select('snapshot_date').eq('org_id',orgId).order('snapshot_date',{ascending:false})
        if (allSnaps) {
          const dates = [...new Set(allSnaps.map(r => r.snapshot_date))].sort((a,b)=>b.localeCompare(a))
          setSnapshots(dates)
          // Only move selected date if this upload created a snapshot (balance/payroll/pl)
          if (['balance','payroll','pl'].includes(type)) setSelectedDate(snapDate)
        }
      } catch(err) {
        sh('Error: ' + err.message)
      }
      setUploading(null)
    }
    reader.readAsText(file)
  }

  // ─── PDF upload handler (AR report + Payroll report) ─────────────────────────
  const handlePDFUpload = async (entity, type, file) => {
    if (!file) return
    setUploading(entity + '_' + type)
    try {
      const today = new Date().toISOString().split('T')[0]
      const storageKey = `${orgId}/${entity}_${type}_current.pdf`
      // Upload — always replaces the current file
      const { error: upErr } = await supabase.storage
        .from('flowsuite-files')
        .upload(storageKey, file, { upsert: true, contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('flowsuite-files').getPublicUrl(storageKey)
      const pdf_url = urlData?.publicUrl || null

      if (type === 'ar_report') {
        // Save summary row — one row per upload (history), plus update meta state
        const { data: ins } = await supabase.from('cashflow_ar_reports').insert([{
          org_id: orgId,
          entity,
          report_date: today,
          pdf_url,
          uploaded_at: new Date().toISOString(),
        }]).select().single()
        setIazARMeta(ins || { pdf_url, report_date: today, uploaded_at: new Date().toISOString() })
        sh('AR Report uploaded ✓')
      } else if (type === 'payroll_report') {
        await supabase.from('cashflow_payroll_reports').insert([{
          org_id: orgId,
          entity,
          report_date: today,
          pdf_url,
          uploaded_at: new Date().toISOString(),
        }])
        sh('Payroll Report uploaded ✓')
      }
    } catch(err) {
      sh('Error: ' + err.message)
    }
    setUploading(null)
  }

  const inpStyle = { display:'none' }
  const UpBtn = ({ entity, type, label }) => {
    const key = entity + '_' + type
    const busy = uploading === key
    const isPDF = type === 'ar_report' || type === 'payroll_report'
    return (
      <label style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:5, border:'1px solid '+C.bdr, cursor: busy?'wait':'pointer', fontSize:10, color:C.g, fontFamily:'inherit', background:'transparent' }}>
        {busy ? 'Loading...' : ('↑ ' + label)}
        <input type="file" accept={isPDF ? '.pdf' : '.csv'} style={inpStyle} disabled={busy}
          onChange={ev => isPDF ? handlePDFUpload(entity,type,ev.target.files[0]) : handleUpload(entity,type,ev.target.files[0])} />
      </label>
    )
  }

  const SBox = ({ label, value, color, warn, sub, small }) => (
    <div style={{ background:C.nL, borderRadius:8, padding: small?'10px 12px':'14px 16px', border:'1px solid '+(warn?C.rd:C.bdr), borderLeft:'3px solid '+(color||C.go) }}>
      <div style={{ fontSize:9, color:C.g, textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize: small?18:22, fontWeight:700, color: warn?C.rd:(color||C.go), lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:9, color:C.g, marginTop:3 }}>{sub}</div>}
    </div>
  )

  const SecHead = ({ title, entity, uploads }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, paddingBottom:4, borderBottom:'1px solid '+C.bdr }}>
      <div style={{ fontSize:10, color:C.go, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>{title}</div>
      <div style={{ display:'flex', gap:4 }}>
        {uploads && uploads.map(u => <UpBtn key={u.type} entity={entity} type={u.type} label={u.label} />)}
      </div>
    </div>
  )

  // Muted financial colors — not the loud status colors
  const POS = C.go           // warm gold for positive cash
  const NEG = '#B45055'      // muted rust — readable not alarming
  const WARN = C.am          // amber for CC/LOC owed
  const NEUT = C.g           // grey for neutral labels
  const mColor = (n) => Number(n) >= 0 ? POS : NEG

  const AgedTable = ({ rows, keyField, labelField, defaultSortKey }) => {
    const [sortKey, setSortKey] = useState(defaultSortKey || keyField)
    const [sortDir, setSortDir] = useState('asc')
    const visible = rows.filter(r => r.total !== 0)
    const totCurr  = visible.reduce((s,r) => s + (r.current_amt||0), 0)
    const totD30   = visible.reduce((s,r) => s + (r.d30||0), 0)
    const totD60   = visible.reduce((s,r) => s + (r.d60||0), 0)
    const totD90   = visible.reduce((s,r) => s + (r.d90||0), 0)
    const totO90   = visible.reduce((s,r) => s + (r.over90||0), 0)
    const totTotal = visible.reduce((s,r) => s + (r.total||0), 0)
    const sorted = [...visible].sort((a,b) => {
      const av = sortKey===keyField ? (a[keyField]||'').toLowerCase() : (a[sortKey]||0)
      const bv = sortKey===keyField ? (b[keyField]||'').toLowerCase() : (b[sortKey]||0)
      if (av<bv) return sortDir==='asc'?-1:1
      if (av>bv) return sortDir==='asc'?1:-1
      return 0
    })
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{ maxHeight:300, overflowY:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead><tr style={{ borderBottom:'1px solid '+C.bdr }}>
            {[
              { key:keyField, label:labelField },
              { key:'current_amt', label:'Current' },
              { key:'d30', label:'1-30' },
              { key:'d60', label:'31-60' },
              { key:'d90', label:'61-90' },
              { key:'over90', label:'90+' },
              { key:'total', label:'Total' },
            ].map(c => (
              <th key={c.key} onClick={() => { if (sortKey===c.key) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortKey(c.key); setSortDir('asc') } }}
                style={{ textAlign:'left', padding:'3px 6px', fontSize:9, color:sortKey===c.key?C.go:C.g, textTransform:'uppercase', position:'sticky', top:0, background:C.bg2, cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                {c.label}{sortKey===c.key?(sortDir==='asc'?' ↑':' ↓'):''}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map((r,i) => <tr key={i} style={{ borderBottom:'1px solid '+C.bdrF }}>
              <td style={{ padding:'4px 6px', fontWeight:500, fontSize:11, color:C.w }}>{r[keyField]}</td>
              <td style={{ padding:'4px 6px', fontSize:11, color:C.w }}>{r.current_amt?fmt(r.current_amt):'—'}</td>
              <td style={{ padding:'4px 6px', fontSize:11, color:C.w }}>{r.d30?fmt(r.d30):'—'}</td>
              <td style={{ padding:'4px 6px', fontSize:11, color:C.w }}>{r.d60?fmt(r.d60):'—'}</td>
              <td style={{ padding:'4px 6px', fontSize:11, color:C.w }}>{r.d90?fmt(r.d90):'—'}</td>
              <td style={{ padding:'4px 6px', fontSize:11, color:C.w }}>{r.over90?fmt(r.over90):'—'}</td>
              <td style={{ padding:'4px 6px', fontSize:12, fontWeight:700, color:C.w }}>{fmt(r.total)}</td>
            </tr>)}
          </tbody>

        </table>
        </div>
        {visible.length > 1 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, borderTop:'2px solid '+C.bdr }}>
            <tbody>
              <tr style={{ background:C.bg }}>
                <td style={{ padding:'5px 6px', fontSize:10, fontWeight:700, color:C.g, textTransform:'uppercase', letterSpacing:'0.5px' }}>{'TOTAL'}</td>
                <td style={{ padding:'5px 6px', fontSize:11, fontWeight:700, color:C.w }}>{totCurr?fmt(totCurr):'—'}</td>
                <td style={{ padding:'5px 6px', fontSize:11, fontWeight:700, color:C.w }}>{totD30?fmt(totD30):'—'}</td>
                <td style={{ padding:'5px 6px', fontSize:11, fontWeight:700, color:C.w }}>{totD60?fmt(totD60):'—'}</td>
                <td style={{ padding:'5px 6px', fontSize:11, fontWeight:700, color:C.w }}>{totD90?fmt(totD90):'—'}</td>
                <td style={{ padding:'5px 6px', fontSize:11, fontWeight:700, color:C.w }}>{totO90?fmt(totO90):'—'}</td>
                <td style={{ padding:'5px 6px', fontSize:13, fontWeight:700, color:C.w }}>{fmt(totTotal)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    )
  }

  const EntityCol = ({ title, snap, ap, ar, entity, arMeta, payrollMeta }) => {
    const [arEditOpen, setArEditOpen] = useState(false)
    const [arEditForm, setArEditForm] = useState({ st_month: '', st_amount: '' })
    const [arEditSaving, setArEditSaving] = useState(false)
    const cash = snap ? (snap.cash_accounts || []) : []
    const cc = snap ? (snap.cc_accounts || []) : []
    const loc = snap ? snap.loc_balance : null
    const arTotal = snap ? snap.ar_total : null
    const arFlex = snap ? snap.ar_flex : null
    const arDueOmega = snap ? snap.ar_due_omega : null
    const loans = snap ? (snap.loan_accounts || []) : []
    const totalCash = cash.reduce((s,a) => s + (a.value||0), 0)

    return (
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:15, color:C.go, marginBottom:12 }}>
          {title}
        </div>

        {!snap && <div style={{ fontSize:12, color:C.g, padding:'20px 0', fontStyle:'italic' }}>{'No data for this date.'}</div>}

        {snap && <>
          <div style={{ fontSize:9, color:C.go, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'flex', alignItems:'center', gap:8 }}>
            <span>{'Cash'}</span>
            <UpBtn entity={entity} type="balance" label="Bal Sheet" />
            <UpBtn entity={entity} type="pl" label="P&L" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(148px,1fr))', gap:8, marginBottom:14 }}>
            {cash.map((a,i) => <SBox key={i} label={a.label} value={fmt(a.value)} color={mColor(a.value)} warn={a.value<0} sub={a.value<0?'overdrawn':null} small />)}
            {cash.length > 1 && <SBox label="Total Cash" value={fmt(totalCash)} color={mColor(totalCash)} warn={totalCash<0} sub={totalCash<0?'overdrawn':null} small />}
          </div>
          {cc.length > 0 && <>
            <div style={{ fontSize:9, color:C.rd, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{'Credit Cards'}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(148px,1fr))', gap:8, marginBottom:14 }}>
              {cc.map((a,i) => <SBox key={i} label={a.label} value={fmt(Math.abs(a.value))} color={WARN} warn sub="owed" small />)}
              {cc.length > 1 && <SBox label="Total CC" value={fmt(Math.abs(cc.reduce((s,a)=>s+(a.value||0),0)))} color={WARN} warn sub="total owed" small />}
            </div>
          </>}
          {loc !== null && loc > 0 && <>
            <div style={{ fontSize:9, color:WARN, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{'Line of Credit'}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(148px,1fr))', gap:8, marginBottom:14 }}>
              <SBox label="LOC Balance" value={fmt(loc)} color={WARN} warn sub="amount drawn" small />
            </div>
          </>}
          {loans.length > 0 && <>
            <div style={{ fontSize:9, color:NEG, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{'Loans & Long-term Liabilities'}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(148px,1fr))', gap:8, marginBottom:14 }}>
              {loans.map((a,i) => <SBox key={i} label={a.label} value={fmt(Math.abs(a.value))} color={NEG} sub="owed" small />)}
              {loans.length > 1 && <SBox label="Total Loans" value={fmt(loans.reduce((s,a)=>s+Math.abs(a.value),0))} color={NEG} small />}
            </div>
          </>}
          {entity === 'omega' && <>
            <div style={{ fontSize:9, color:C.g, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'flex', alignItems:'center', gap:8 }}>
              <span>{'Accounts Receivable'}</span>
              <UpBtn entity={entity} type="ar" label="AR Aging" />
            </div>
            {arTotal !== null && arTotal !== 0 && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(148px,1fr))', gap:8, marginBottom:ar.length?6:14 }}>
                  <SBox label="Total AR" value={fmt(arTotal)} color={POS} small />
                </div>
                {ar.length > 0 && <AgedTable rows={ar} keyField="customer" labelField="Customer" />}
              </>
            )}
          </>}

          {entity === 'iaz' && (() => {
            const arRows = ar || []
            const arTotal = arRows.reduce((s,r) => s + (r.total||0), 0)
            const arCount = arRows.length
            const hasAR = arRows.length > 0

            return (
              <div style={{ marginBottom:14 }}>
                {/* Current Payroll */}
                {snap.payroll_gross <= 0 && (
                  <div style={{ background:C.bg2, border:'1px solid '+C.bdr, borderRadius:10, padding:'10px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ fontSize:9, color:C.bl, fontWeight:700, textTransform:'uppercase', letterSpacing:1, flex:1 }}>{'Current Payroll'}</div>
                    <UpBtn entity={entity} type="payroll" label="Payroll CSV" />
                    <UpBtn entity={entity} type="payroll_report" label="PR PDF" />
                  </div>
                )}
                {snap.payroll_gross > 0 && (
                  <div style={{ background:C.bg2, border:'1px solid '+C.bdr, borderRadius:10, padding:'12px 14px', marginBottom:8 }}>
                    <div style={{ fontSize:9, color:C.bl, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
                      <span>{'Current Payroll' + (snap.payroll_period?' — '+snap.payroll_period:'')}</span>
                      <UpBtn entity={entity} type="payroll" label="Payroll CSV" />
                      <UpBtn entity={entity} type="payroll_report" label="PR PDF" />
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                      <SBox label="Gross" value={fmt(snap.payroll_gross)} color={C.bl} small />
                      <SBox label="Taxes + Ded." value={fmt(snap.payroll_taxes)} color={WARN} small />
                      <SBox label="Net Pay" value={fmt(snap.payroll_net)} color={POS} small />
                    </div>
                  </div>
                )}

                {/* Sales Tax Entry */}
                <div style={{ background:C.bg2, border:`1px solid ${C.bdr}`, borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <div style={{ fontSize:9, color:C.am, fontWeight:700, textTransform:'uppercase', letterSpacing:1, flex:1 }}>
                      {'Sales Tax'}
                    </div>
                    <button onClick={() => setArEditOpen(v => !v)} style={{ fontSize:9, color:C.go, background:'transparent', border:`1px solid ${C.bdrF}`, borderRadius:4, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit' }}>
                      {arEditOpen ? '✕ Cancel' : '+ Enter Monthly Total'}
                    </button>
                    {arMeta?.st_history?.length > 0 && (
                      <button onClick={() => setArEditSaving(v => !v)} style={{ fontSize:9, color:C.g, background:'transparent', border:`1px solid ${C.bdrF}`, borderRadius:4, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit' }}>
                        {arEditSaving ? '▲ Hide History' : '▼ History'}
                      </button>
                    )}
                  </div>

                  {/* Current month display */}
                  {arMeta?.st_current_amount && !arEditOpen && (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8, marginBottom: arEditSaving ? 8 : 0 }}>
                      <SBox label={arMeta.st_current_month || 'Current Month'} value={fmt(arMeta.st_current_amount)} color={C.am} small />
                    </div>
                  )}
                  {!arMeta?.st_current_amount && !arEditOpen && (
                    <div style={{ fontSize:11, color:C.g, fontStyle:'italic' }}>{'No sales tax entered yet.'}</div>
                  )}

                  {/* Entry form */}
                  {arEditOpen && (
                    <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap', padding:'10px 12px', background:C.ch, borderRadius:8, border:`1px solid ${C.bdrF}` }}>
                      <div>
                        <div style={{ fontSize:9, color:C.g, marginBottom:3, textTransform:'uppercase', letterSpacing:'0.8px' }}>Month</div>
                        <input type="month"
                          value={arEditForm.st_month || ''}
                          onChange={e => setArEditForm(f => ({ ...f, st_month: e.target.value }))}
                          style={{ background:C.bg, border:`1px solid ${C.bdr}`, color:C.w, borderRadius:5, padding:'5px 8px', fontSize:11, fontFamily:'inherit', width:140 }} />
                      </div>
                      <div>
                        <div style={{ fontSize:9, color:C.g, marginBottom:3, textTransform:'uppercase', letterSpacing:'0.8px' }}>Sales Tax Amount ($)</div>
                        <input type="text" inputMode="decimal" placeholder="e.g. 4450.68"
                          value={arEditForm.st_amount || ''}
                          onChange={e => setArEditForm(f => ({ ...f, st_amount: e.target.value }))}
                          style={{ background:C.bg, border:`1px solid ${C.bdr}`, color:C.w, borderRadius:5, padding:'5px 8px', fontSize:11, fontFamily:'inherit', width:130 }} />
                      </div>
                      <button onClick={async () => {
                        if (!arEditForm.st_month || !arEditForm.st_amount) return
                        const amt = parseFloat(arEditForm.st_amount) || 0
                        const mo = arEditForm.st_month
                        const history = [...(arMeta?.st_history || []).filter(r => r.month !== mo), { month: mo, amount: amt }]
                          .sort((a,b) => b.month.localeCompare(a.month))
                        const payload = { st_current_month: mo, st_current_amount: amt, st_history: history }
                        if (arMeta?.id) {
                          await supabase.from('cashflow_ar_reports').update(payload).eq('id', arMeta.id)
                          setIazARMeta(m => ({ ...m, ...payload }))
                        } else {
                          const { data: ins } = await supabase.from('cashflow_ar_reports').insert([{ org_id: orgId, entity: 'iaz', ...payload }]).select().single()
                          setIazARMeta(ins)
                        }
                        setArEditForm(f => ({ ...f, st_month:'', st_amount:'' }))
                        setArEditOpen(false)
                        sh('Sales tax saved ✓')
                      }} style={{ background:C.go, border:'none', color:'#fff', borderRadius:6, padding:'6px 14px', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                        {'✓ Save'}
                      </button>
                    </div>
                  )}

                  {/* History — toggle with arEditSaving as reused bool */}
                  {arEditSaving && arMeta?.st_history?.length > 0 && (
                    <div style={{ marginTop:8, borderTop:`1px solid ${C.bdrF}`, paddingTop:8 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                        <thead><tr>
                          <th style={{ textAlign:'left', color:C.g, fontSize:9, padding:'3px 0', textTransform:'uppercase' }}>Month</th>
                          <th style={{ textAlign:'right', color:C.g, fontSize:9, padding:'3px 0', textTransform:'uppercase' }}>Sales Tax</th>
                        </tr></thead>
                        <tbody>
                          {arMeta.st_history.map((r,i) => (
                            <tr key={i} style={{ borderBottom:`1px solid ${C.bdrF}` }}>
                              <td style={{ padding:'4px 0', color:C.w }}>{r.month}</td>
                              <td style={{ padding:'4px 0', textAlign:'right', color:C.am, fontFamily:"'DM Mono', monospace" }}>{fmt(r.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* AR — Outstanding Invoices */}
                <div style={{ background:C.bg2, border:'1px solid '+C.bdr, borderRadius:10, padding:'12px 14px', marginTop:8 }}>
                  <div style={{ fontSize:9, color:C.g, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
                    <span>{'Accounts Receivable — Outstanding Invoices'}</span>
                    <UpBtn entity={entity} type="ar" label="AR Aging" />
                  </div>
                  {hasAR ? (
                    <>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8, marginBottom:8 }}>
                        <SBox label="Total AR" value={fmt(arTotal)} color={POS} small />
                        <SBox label="Open Customers" value={String(arCount)} color={POS} small />
                      </div>
                      <AgedTable rows={arRows} keyField="customer" labelField="Customer" defaultSortKey="customer" />
                    </>
                  ) : (
                    <div style={{ fontSize:11, color:C.g, fontStyle:'italic' }}>{'No AR data — upload AR Aging CSV above.'}</div>
                  )}
                  {arMeta?.pdf_url && (
                    <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid '+C.bdrF }}>
                      <a href={arMeta.pdf_url} target="_blank" rel="noreferrer"
                        style={{ fontSize:10, color:C.go, fontWeight:700, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
                        {'View AR Report PDF'}
                      </a>
                      {arMeta.uploaded_at && (
                        <span style={{ fontSize:9, color:C.g, marginLeft:8 }}>
                          {'Uploaded ' + new Date(arMeta.uploaded_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
          <div style={{ fontSize:9, color:C.g, fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6, display:'flex', alignItems:'center', gap:8 }}>
            <span>{ap.length > 0 ? 'Accounts Payable — ' + ap.filter(v=>v.total!==0).length + ' vendors' : 'Accounts Payable'}</span>
            {entity === 'iaz' && <UpBtn entity={entity} type="ap" label="AP Aging" />}
          </div>
          {ap.length > 0 && <AgedTable rows={ap} keyField="vendor" labelField="Vendor" defaultSortKey="vendor" />}

        </>}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ fontSize:11, color:C.g, fontWeight:600 }}>{'View as of:'}</div>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} style={{ padding:'5px 10px', background:C.ch, border:'1px solid '+C.bdr, borderRadius:6, color:C.w, fontSize:12, fontFamily:'inherit' }} />

        <div style={{ flex:1 }} />
        {['both','iaz','omega'].map(e => (
          <button key={e} onClick={()=>setEntityView(e)} style={{ padding:'4px 12px', borderRadius:5, border:'1px solid '+(entityView===e?C.go:C.bdrF), background:entityView===e?C.gD:'transparent', color:entityView===e?C.go:C.g, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
            {e==='both'?'Both':e==='iaz'?'IAZ Only':'Omega Only'}
          </button>
        ))}
      </div>

      {loading && <div style={{ color:C.g, fontSize:13, padding:'20px 0' }}>{'Loading...'}</div>}

      {!loading && (
        <div style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
          {(entityView==='both'||entityView==='iaz') && <EntityCol title="IAZ Corporation" snap={iazData} ap={iazAP} ar={iazAR} entity="iaz" arMeta={iazARMeta} />}
          {entityView==='both' && <div style={{ width:1, background:C.bdr, alignSelf:'stretch', flexShrink:0 }} />}
          {(entityView==='both'||entityView==='omega') && <EntityCol title="Omega LLC" snap={omegaData} ap={[]} ar={omegaAR} entity="omega" />}
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:20, right:20, background:C.go, color:C.bg, padding:'10px 18px', borderRadius:8, fontWeight:600, fontSize:13, zIndex:1000 }}>{toast}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// CASH FLOW FORECASTER — AP aging drag to prioritize
// ═══════════════════════════════════════════════════════
function CashFlowForecaster({ orgId, C, userEmail }) {
  const POS = C.go
  const NEG = '#B45055'
  const WARN = C.am
  const mColor = (n) => Number(n) >= 0 ? POS : NEG
  const [entity, setEntity] = useState('iaz')
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const SCHED_EDITORS = ['kari@karikounkel.com','accounting@mpuptown.com','operationsmanager@mpuptown.com']
  const canEditSched = SCHED_EDITORS.includes((userEmail||'').toLowerCase())
  const ENTITIES = [{ id: 'iaz', label: 'IAZ Corporation' }, { id: 'omega', label: 'Omega LLC' }]

  useEffect(() => {
    if (!orgId) return
    loadScheduled()
    loadSchedPmts()
  }, [orgId, entity])

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    // Get most recent AP snapshot
    supabase.from('cashflow_ap').select('snapshot_date').eq('org_id', orgId).eq('entity', entity).order('snapshot_date', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (!data || !data[0]) { setBills([]); setLoading(false); return }
        const latestDate = data[0].snapshot_date
        supabase.from('cashflow_ap').select('*').eq('org_id', orgId).eq('entity', entity).eq('snapshot_date', latestDate).order('over90', { ascending: false })
          .then(async ({ data: apData }) => {
            const { data: schedData } = await supabase.from('cashflow_ap_notes').select('*').eq('org_id', orgId).eq('entity', entity)
            const schedMap = {}
            if (schedData) schedData.forEach(r => { schedMap[r.vendor] = r })
            setScheduled(schedMap)
            const rows = (apData || []).filter(r => r.total !== 0).map((r, i) => ({
              ...r,
              payAmt: '',
              marked: false,
              priority: i,
              scheduledAmt: schedMap[r.vendor] ? schedMap[r.vendor].scheduled_amt || '' : '',
              notes: schedMap[r.vendor] ? schedMap[r.vendor].notes || '' : ''
            }))
            setBills(rows)
            setLoading(false)
          })
      })
  }, [orgId, entity])

  const [dragIdx, setDragIdx] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [pushing, setPushing] = useState(false)
  const [scheduled, setScheduled] = useState({}) // keyed by vendor name
  const [schedPmts, setSchedPmts] = useState([]) // ap_scheduled_payments rows
  const [schedModal, setSchedModal] = useState(null) // null | { vendor, existing: row|null }

  const loadSchedPmts = async () => {
    const { data } = await supabase.from('ap_scheduled_payments')
      .select('*').eq('org_id', orgId).eq('entity', entity)
      .eq('status', 'pending').order('scheduled_date', { ascending: true })
    setSchedPmts(data || [])
  }

  // keyed by vendor — most recent pending entry
  const schedPmtMap = {}
  schedPmts.forEach(p => {
    if (!schedPmtMap[p.vendor] || p.scheduled_date > schedPmtMap[p.vendor].scheduled_date) {
      schedPmtMap[p.vendor] = p
    }
  })

  const loadScheduled = async () => {
    const { data } = await supabase.from('cashflow_ap_notes')
      .select('*').eq('org_id', orgId).eq('entity', entity)
    if (data) {
      const map = {}
      data.forEach(r => { map[r.vendor] = r })
      setScheduled(map)
    }
  }

  const saveScheduled = async (vendor, field, val) => {
    setScheduled(p => ({ ...p, [vendor]: { ...(p[vendor]||{vendor,org_id:orgId,entity}), [field]: val } }))
    const existing = scheduled[vendor]
    if (existing && existing.id) {
      await supabase.from('cashflow_ap_notes').update({ [field]: val, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      const row = { org_id: orgId, entity, vendor, [field]: val }
      const { data } = await supabase.from('cashflow_ap_notes').insert([row]).select().single()
      if (data) setScheduled(p => ({ ...p, [vendor]: data }))
    }
  }

  const toggleMark = (id) => setBills(p => p.map(b => b.id === id ? { ...b, marked: !b.marked } : b))
  const setPayAmt = (id, val) => setBills(p => p.map(b => b.id === id ? { ...b, payAmt: val } : b))
  const setPayDate = (id, val) => setBills(p => p.map(b => b.id === id ? { ...b, payDate: val } : b))

  const pushToTasks = async () => {
    const toQueue = bills.filter(b => b.marked && !b.queued)
    if (!toQueue.length) { sh('No vendors marked to pay'); return }
    setPushing(true)
    const today = new Date().toISOString().split('T')[0]
    // Earliest due date in the batch
    const dueDates = toQueue.map(b => b.payDate).filter(Boolean).sort()
    const dueDate = dueDates[0] || today
    // Build one description listing all vendors
    const lines = toQueue.map(b => {
      const amt = '$' + (parseFloat(b.payAmt) || Math.abs(b.total)).toFixed(2)
      const sched = b.scheduledAmt ? ' [sched: $'+parseFloat(b.scheduledAmt).toFixed(2)+']' : ''
      const note = b.notes ? ' — '+b.notes : ''
      return b.vendor + ' — ' + amt + (b.payDate ? ' by ' + b.payDate : '') + sched + note
    })
    const total = toQueue.reduce((s,b) => s + (parseFloat(b.payAmt) || Math.abs(b.total)), 0)
    const description = 'AP Payment Run — ' + entity.toUpperCase() + ' | Total: $' + total.toFixed(2) + ' | ' + lines.join(' | ')
    const { error } = await supabase.from('moneyflow_tasks').insert([{
      org_id: orgId,
      entity: entity,
      type: 'AP',
      source: 'cashflow_ap',
      name: 'AP Payment Run — ' + entity.toUpperCase() + ' — $' + total.toFixed(2),
      description,
      due_date: dueDate,
      status: 'open',
      is_recurring: false,
      recur_interval: 0,
    }])
    if (error) { sh('Error: ' + error.message); setPushing(false); return }
    setBills(p => p.map(b => toQueue.find(q => (q.id||q.vendor) === (b.id||b.vendor)) ? { ...b, queued: true } : b))
    setPushing(false)
    sh('Payment run pushed to Tasks — ' + toQueue.length + ' vendors, $' + total.toFixed(2) + ' total')
  }
  const onDragStart = (idx) => setDragIdx(idx)
  const onDragOver = (e, idx) => { e.preventDefault(); setDragOver(idx) }
  const onDrop = (idx) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOver(null); return }
    setBills(p => {
      const a = [...p]
      const item = a.splice(dragIdx, 1)[0]
      a.splice(idx, 0, item)
      return a
    })
    setDragIdx(null)
    setDragOver(null)
  }
  const onDragEnd = () => { setDragIdx(null); setDragOver(null) }

  const fmt = n => {
    if (n == null) return '—'
    const abs = Math.abs(Number(n))
    const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return Number(n) < 0 ? '(' + str + ')' : str
  }

  const markedTotal = bills.filter(b => b.marked).reduce((s, b) => s + (parseFloat(b.payAmt) || Math.abs(b.total)), 0)
  const totalOwed = bills.reduce((s, b) => s + Math.abs(b.total), 0)

  const handleCSVUpload = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target.result
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const parsed = []
      const pv = s => parseFloat((s||'').replace(/['"$,]/g,'')) || 0
      lines.forEach((line, idx) => {
        if (idx === 0) return
        const parts = line.split(',').map(s => s.replace(/"/g,'').trim())
        const vendor = parts[0]
        if (!vendor || ['vendor','total','totals','a/p'].some(x => vendor.toLowerCase().includes(x))) return
        const curr=pv(parts[1]), d30=pv(parts[2]), d60=pv(parts[3]), d90=pv(parts[4]), over90=pv(parts[5])
        const total = curr+d30+d60+d90+over90
        if (total === 0) return
        parsed.push({ vendor, current_amt: curr, d30, d60, d90, over90, total })
      })
      if (!parsed.length) { sh('No vendors found in file'); return }
      // Save to Supabase — use today as snapshot date
      const snapDate = new Date().toISOString().split('T')[0]
      // Archive existing AP + recon notes before replacing
      const { data: existing } = await supabase.from('cashflow_ap').select('*').eq('org_id', orgId).eq('entity', entity).eq('snapshot_date', snapDate)
      if (existing && existing.length) {
        await supabase.from('cashflow_ap_history').insert(existing.map(r => ({ ...r, archived_at: new Date().toISOString() })))
        // Archive recon notes linked to these vendors
        const { data: reconData } = await supabase.from('cashflow_ap_recon').select('*').eq('org_id', orgId).eq('entity', entity)
        if (reconData && reconData.length) {
          const reconRows = reconData.map(r => ({
            org_id: r.org_id, entity: r.entity, vendor: r.vendor,
            total: (existing.find(b => b.vendor === r.vendor)||{}).total || 0,
            recon_status: r.recon_status, recon_note: r.recon_note,
            snapshot_date: snapDate, archived_at: new Date().toISOString(),
            updated_by: r.updated_by
          }))
          await supabase.from('cashflow_ap_recon_history').insert(reconRows)
        }
      }
      await supabase.from('cashflow_ap').delete().eq('org_id', orgId).eq('entity', entity).eq('snapshot_date', snapDate)
      await supabase.from('cashflow_ap').insert(parsed.map(r => ({ ...r, org_id: orgId, entity, snapshot_date: snapDate })))
      // Re-load scheduled notes and merge — scheduled amounts survive the upload
      const { data: schedData } = await supabase.from('cashflow_ap_notes').select('*').eq('org_id', orgId).eq('entity', entity)
      const schedMap = {}
      if (schedData) schedData.forEach(r => { schedMap[r.vendor] = r })
      setScheduled(schedMap)
      const rows = parsed.map((r, i) => ({
        ...r,
        payAmt: '',
        marked: false,
        priority: i,
        scheduledAmt: schedMap[r.vendor] ? schedMap[r.vendor].scheduled_amt || '' : '',
        notes: schedMap[r.vendor] ? schedMap[r.vendor].notes || '' : ''
      }))
      setBills(rows)
      const scheduledCount = Object.values(schedMap).filter(s => s.scheduled_amt).length
      sh(parsed.length + ' vendors loaded' + (scheduledCount ? ' — ' + scheduledCount + ' scheduled amounts carried forward' : ''))
    }
    reader.readAsText(file)
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:4 }}>
          {ENTITIES.map(e => (
            <button key={e.id} onClick={() => setEntity(e.id)} style={{ padding:'6px 16px', borderRadius:6, border:'1px solid '+(entity===e.id?C.go:C.bdrF), background:entity===e.id?C.gD:'transparent', color:entity===e.id?C.go:C.g, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{e.label}</button>
          ))}
        </div>
        <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:5, border:'1px solid '+C.bdr, cursor:'pointer', fontSize:11, color:C.g, fontFamily:'inherit' }}>
          {'Upload AP Aging CSV'}
          <input type="file" accept=".csv" style={{ display:'none' }} onChange={ev => handleCSVUpload(ev.target.files[0])} />
        </label>
      </div>

      {loading && <div style={{ color:C.g, fontSize:13, padding:'20px 0' }}>{'Loading...'}</div>}

      {!loading && bills.length === 0 && <div style={{ padding:'40px 0', textAlign:'center', color:C.g, fontSize:13 }}>{'No AP data for this entity. Upload an AP Aging CSV to get started.'}</div>}

      {!loading && bills.length > 0 && <>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
            <div style={{ fontSize:12, color:C.g }}>{'Total owed: '}<span style={{ fontWeight:700, color:NEG }}>{fmt(totalOwed)}</span></div>
            <div style={{ fontSize:12, color:C.g }}>{'Scheduled in bill pay: '}<span style={{ fontWeight:700, color:WARN }}>{fmt(Object.values(scheduled).reduce((s,r)=>s+(parseFloat(r.scheduled_amt)||0),0))}</span></div>
            <div style={{ fontSize:12, color:C.g }}>{'Marked to pay: '}<span style={{ fontWeight:700, color:POS }}>{fmt(markedTotal)}</span></div>
            <div style={{ fontSize:12, color:C.g }}>{'Net outstanding: '}<span style={{ fontWeight:700, color:NEG }}>{fmt(totalOwed - Object.values(scheduled).reduce((s,r)=>s+(parseFloat(r.scheduled_amt)||0),0) - markedTotal)}</span></div>
            {bills.filter(b=>b.queued).length > 0 && <div style={{ fontSize:12, color:C.g }}>{'Queued to tasks: '}<span style={{ fontWeight:700, color:C.go }}>{bills.filter(b=>b.queued).length+' vendors'}</span></div>}
          </div>
          {bills.filter(b=>b.marked&&!b.queued).length > 0 && (
            <button onClick={pushToTasks} disabled={pushing} style={{ padding:'6px 18px', borderRadius:6, border:'none', background:C.go, color:C.bg, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              {pushing ? 'Pushing...' : ('Push ' + bills.filter(b=>b.marked&&!b.queued).length + ' to Tasks')}
            </button>
          )}
        </div>
        <div style={{ fontSize:10, color:C.g, marginBottom:10 }}>{'Drag to prioritize. Check to mark for payment. Set a pay date per vendor. Push to Tasks when ready.'}</div>

        {bills.map((b, idx) => (
          <div key={b.id||idx}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={() => onDrop(idx)}
            onDragEnd={onDragEnd}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', marginBottom:6, borderRadius:8, background:dragOver===idx?C.gD:b.queued?C.nL:b.marked?C.grD:C.nL, border:'1px solid '+(dragOver===idx?C.go:b.queued?C.go:b.marked?C.gr:C.bdr), cursor:b.queued?'default':'grab', opacity:dragIdx===idx?0.5:b.queued?0.65:1, transition:'border-color 0.1s' }}>
            <span style={{ fontSize:13, color:C.g, flexShrink:0, cursor:'grab', paddingRight:2 }}>{'⠿'}</span>
            <span style={{ fontSize:11, color:C.g, minWidth:20, textAlign:'right', flexShrink:0 }}>{idx+1}</span>
            <input type="checkbox" checked={b.marked} onChange={() => toggleMark(b.id||idx)} style={{ flexShrink:0, cursor:'pointer', width:14, height:14 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:13 }}>{b.vendor}</div>
              <div style={{ fontSize:9, color:C.g, marginTop:2 }}>
                {b.current_amt?'Cur: '+fmt(b.current_amt)+'  ':''}
                {b.d30?'1-30d: '+fmt(b.d30)+'  ':''}
                {b.d60?'31-60d: '+fmt(b.d60)+'  ':''}
                {b.d90?'61-90d: '+fmt(b.d90)+'  ':''}
                {b.over90?'90+: '+fmt(b.over90):''}
              </div>
              {schedPmtMap[b.vendor] && (() => {
                const sp = schedPmtMap[b.vendor]
                const seriesLabel = sp.series_total > 1 ? ' · '+sp.series_num+'/'+sp.series_total : ''
                const amtLabel = sp.amount ? ' · $'+parseFloat(sp.amount).toFixed(2) : ''
                return (
                  <div style={{ marginTop:4, display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:99, background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.35)', fontSize:9, color:WARN, fontWeight:600 }}>
                    {'📅 Sched: '+new Date(sp.scheduled_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+amtLabel+' · '+(sp.payment_type==='partial'?'Partial':'Full')+seriesLabel}
                  </div>
                )
              })()}
            </div>
            <div style={{ textAlign:'right', flexShrink:0, minWidth:80 }}>
              <div style={{ fontSize:13, fontWeight:700, color:b.marked?C.gr:C.w }}>{fmt(b.total)}</div>
              <div style={{ fontSize:9, color:C.g }}>{'total owed'}</div>
            </div>
            {b.marked && !b.queued && (
              <input value={b.payAmt} onChange={ev => setPayAmt(b.id||idx, ev.target.value)} placeholder={Math.abs(b.total).toFixed(2)} style={{ width:90, padding:'4px 8px', background:C.ch, border:'1px solid '+C.bdr, borderRadius:5, color:C.w, fontSize:12, fontFamily:'inherit', flexShrink:0 }} />
            )}
            {b.marked && !b.queued && (
              <input type="date" value={b.payDate||''} onChange={ev => setPayDate(b.id||idx, ev.target.value)} style={{ width:130, padding:'4px 8px', background:C.ch, border:'1px solid '+C.bdr, borderRadius:5, color:C.w, fontSize:12, fontFamily:'inherit', flexShrink:0 }} />
            )}
            {b.queued && <span style={{ fontSize:10, padding:'3px 10px', borderRadius:99, background:C.gD, color:C.go, fontWeight:600, flexShrink:0 }}>{'queued'}</span>}
            {canEditSched
              ? <input value={b.notes||''} onChange={ev=>setBills(p=>p.map(x=>(x.id||x.vendor)===(b.id||b.vendor)?{...x,notes:ev.target.value}:x))} onBlur={ev=>saveScheduled(b.vendor,'notes',ev.target.value)} placeholder="Notes..." style={{ flex:1, minWidth:120, padding:'4px 8px', background:C.ch, border:'1px solid '+C.bdrF, borderRadius:5, color:C.w, fontSize:11, fontFamily:'inherit' }} />
              : (b.notes ? <span style={{ fontSize:11, color:C.g, flex:1 }}>{b.notes}</span> : null)
            }
            {canEditSched
              ? <input value={b.scheduledAmt||''} onChange={ev=>setBills(p=>p.map(x=>(x.id||x.vendor)===(b.id||b.vendor)?{...x,scheduledAmt:ev.target.value}:x))} onBlur={ev=>saveScheduled(b.vendor,'scheduled_amt',ev.target.value)} placeholder="Sched. $" style={{ width:110, padding:'4px 8px', background:C.ch, border:'1px solid '+C.bdrF, borderRadius:5, color:C.w, fontSize:11, fontFamily:'inherit', flexShrink:0 }} />
              : (b.scheduledAmt ? <span style={{ fontSize:11, color:WARN, flexShrink:0 }}>{'Sched: $'+parseFloat(b.scheduledAmt).toFixed(2)}</span> : null)
            }
            {canEditSched && (
              <button onClick={() => setSchedModal({ vendor: b.vendor, existing: schedPmtMap[b.vendor] || null })}
                style={{ flexShrink:0, padding:'3px 9px', borderRadius:5, border:'1px solid '+(schedPmtMap[b.vendor]?WARN:C.bdrF), background:'transparent', color:schedPmtMap[b.vendor]?WARN:C.g, fontSize:10, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                {schedPmtMap[b.vendor] ? '📅 Edit' : '+ Schedule'}
              </button>
            )}
          </div>
        ))}
      </>}

      {toast && <div style={{ position:'fixed', bottom:20, right:20, background:C.go, color:C.bg, padding:'10px 18px', borderRadius:8, fontWeight:600, fontSize:13, zIndex:1000 }}>{toast}</div>}
      {schedModal && <SchedPayModal
        orgId={orgId} entity={entity} C={C}
        vendor={schedModal.vendor} existing={schedModal.existing}
        allPmts={schedPmts.filter(p => p.vendor === schedModal.vendor)}
        onClose={() => setSchedModal(null)}
        onSaved={() => { loadSchedPmts(); setSchedModal(null); sh('Scheduled payment saved ✓') }}
        onExpired={() => { loadSchedPmts(); setSchedModal(null); sh('Marked as paid/expired ✓') }}
      />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// SCHEDULED PAYMENT MODAL — shared by CashFlow + APRecon
// ═══════════════════════════════════════════════════════
function SchedPayModal({ orgId, entity, vendor, existing, allPmts, onClose, onSaved, onExpired, C }) {
  const WARN = C.am
  const today = new Date().toISOString().split('T')[0]
  const blank = { vendor, amount: '', scheduled_date: '', payment_type: 'full', series_num: '', series_total: '', notes: '', status: 'pending' }
  const [form, setForm] = useState(existing ? { ...existing, amount: existing.amount || '', series_num: existing.series_num || '', series_total: existing.series_total || '', notes: existing.notes || '' } : blank)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const isAgreement = parseInt(form.series_total) > 1

  const handleSave = async () => {
    if (!form.scheduled_date) return
    setSaving(true)
    const payload = {
      org_id: orgId, entity, vendor: form.vendor,
      amount: form.amount ? parseFloat(form.amount) : null,
      scheduled_date: form.scheduled_date,
      payment_type: form.payment_type,
      series_num: isAgreement ? parseInt(form.series_num) || null : null,
      series_total: isAgreement ? parseInt(form.series_total) || null : null,
      notes: form.notes || null,
      status: 'pending'
    }
    if (existing?.id) {
      await supabase.from('ap_scheduled_payments').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('ap_scheduled_payments').insert([payload])
    }
    setSaving(false)
    onSaved()
  }

  const handleExpire = async (id) => {
    await supabase.from('ap_scheduled_payments').update({ status: 'paid' }).eq('id', id)
    onExpired()
  }

  const inp = { width:'100%', padding:'6px 8px', background:C.ch, border:'1px solid '+C.bdrF, borderRadius:5, color:C.w, fontSize:12, boxSizing:'border-box', fontFamily:'inherit' }
  const lbl = { fontSize:10, color:C.g, textTransform:'uppercase', display:'block', marginBottom:3 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.bg2||C.bg, borderRadius:12, padding:24, width:460, maxHeight:'85vh', overflowY:'auto', border:'1px solid '+C.bdrF }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:9, color:WARN, textTransform:'uppercase', letterSpacing:2, fontWeight:700 }}>Scheduled Payment</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.w, marginTop:2 }}>{vendor}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:C.g, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <div>
            <label style={lbl}>Scheduled Date</label>
            <input type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Amount</label>
            <input value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" style={inp} />
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <label style={lbl}>Payment Type</label>
          <div style={{ display:'flex', gap:6 }}>
            {['full','partial'].map(t => (
              <button key={t} onClick={() => set('payment_type', t)} style={{ flex:1, padding:'7px', borderRadius:6, border:'1px solid '+(form.payment_type===t?WARN:C.bdrF), background:form.payment_type===t?'rgba(245,158,11,0.12)':'transparent', color:form.payment_type===t?WARN:C.g, fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:600, textTransform:'capitalize' }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <label style={{ ...lbl, display:'flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={isAgreement} onChange={e => { if (!e.target.checked) { set('series_total',''); set('series_num','') } else { set('series_total','3'); set('series_num','1') } }} style={{ accentColor:WARN }} />
            Part of a payment agreement / series
          </label>
          {isAgreement && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
              <div>
                <label style={lbl}>Payment #</label>
                <input value={form.series_num} onChange={e => set('series_num', e.target.value)} placeholder="e.g. 1" style={inp} />
              </div>
              <div>
                <label style={lbl}>Of Total</label>
                <input value={form.series_total} onChange={e => set('series_total', e.target.value)} placeholder="e.g. 3" style={inp} />
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={lbl}>Notes (promise to pay details, ref #, etc.)</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="e.g. agreed to 3 payments, ref call 3/15..." style={{ ...inp, resize:'vertical', lineHeight:1.5 }} />
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'6px 16px', borderRadius:6, border:'1px solid '+C.bdrF, background:'transparent', color:C.g, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.scheduled_date} style={{ padding:'6px 18px', borderRadius:6, border:'none', background:WARN, color:'#000', fontSize:12, fontWeight:700, cursor:saving||!form.scheduled_date?'not-allowed':'pointer', fontFamily:'inherit', opacity:saving||!form.scheduled_date?0.6:1 }}>{saving ? 'Saving...' : existing ? 'Update' : 'Save Payment'}</button>
        </div>

        {/* Existing series entries for this vendor */}
        {allPmts.length > 0 && (
          <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid '+C.bdrF }}>
            <div style={{ fontSize:10, color:C.g, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>All Scheduled — {vendor}</div>
            {allPmts.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, background:C.nL, border:'1px solid '+C.bdrF, marginBottom:4, fontSize:11 }}>
                <span style={{ color:WARN, fontWeight:600 }}>{new Date(p.scheduled_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
                {p.amount && <span style={{ color:C.w }}>${parseFloat(p.amount).toFixed(2)}</span>}
                <span style={{ color:C.g, textTransform:'capitalize' }}>{p.payment_type}</span>
                {p.series_total > 1 && <span style={{ color:C.g }}>{p.series_num+'/'+p.series_total}</span>}
                {p.notes && <span style={{ color:C.g, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.notes}</span>}
                <button onClick={() => handleExpire(p.id)} style={{ marginLeft:'auto', flexShrink:0, padding:'2px 8px', borderRadius:4, border:'1px solid #22C55E', background:'transparent', color:'#22C55E', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>✓ Paid</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BudgetView({ orgId, C }) {
  const POS = C.go
  const NEG = '#B45055'
  const WARN = C.am
  const mColor = (n) => Number(n) >= 0 ? POS : NEG
  const [entity, setEntity] = useState('iaz')
  const [plData, setPlData] = useState([])
  const [budgets, setBudgets] = useState([])
  const [activeVersion, setActiveVersion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [basePeriods, setBasePeriods] = useState(8)
  const [projPeriods, setProjPeriods] = useState(12)
  const [editingCell, setEditingCell] = useState(null) // {date, field}
  const [editVals, setEditVals] = useState({})
  const [versionName, setVersionName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [toast, setToast] = useState('')
  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const ENTITIES = [{ id: 'iaz', label: 'IAZ Corporation' }, { id: 'omega', label: 'Omega LLC' }]

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    Promise.all([
      supabase.from('cashflow_pl').select('*').eq('org_id', orgId).eq('entity', entity).order('period_end', { ascending: true }),
      supabase.from('cashflow_budget').select('*').eq('org_id', orgId).eq('entity', entity).order('created_at', { ascending: false })
    ]).then(([plR, budR]) => {
      setPlData(plR.data || [])
      const bud = budR.data || []
      setBudgets(bud)
      if (bud.length > 0 && !activeVersion) setActiveVersion(bud[0].id)
      setLoading(false)
    })
  }, [orgId, entity])

  const fmt = (n, decimals) => {
    if (n == null || n === 0) return '—'
    const abs = Math.abs(Number(n))
    const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: decimals||0, maximumFractionDigits: decimals||0 })
    return Number(n) < 0 ? '(' + str + ')' : str
  }
  const fmtVar = n => {
    if (!n) return '—'
    const abs = Math.abs(Number(n))
    const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    return (Number(n) >= 0 ? '+' : '-') + str
  }

  // Get all unique line item labels across all periods
  const allLineItems = {}
  plData.forEach(p => {
    (p.line_items || []).forEach(li => {
      if (!allLineItems[li.label]) allLineItems[li.label] = li.section
    })
  })

  // Build averages per line item
  const lineAvgs = {}
  Object.keys(allLineItems).forEach(label => {
    const vals = plData.slice(-basePeriods).map(p => {
      const li = (p.line_items || []).find(l => l.label === label)
      return li ? li.value : 0
    }).filter(v => v !== 0)
    lineAvgs[label] = vals.length ? vals.reduce((s,v) => s+v, 0) / vals.length : 0
  })

  // Build projection periods
  const buildProjection = () => {
    if (!plData.length) return []
    const recent = plData.slice(-basePeriods)
    const avgIncome = recent.reduce((s,p) => s+(p.income||0), 0) / recent.length
    const avgExpenses = recent.reduce((s,p) => s+(p.expenses||0), 0) / recent.length
    const isWeekly = entity === 'iaz'
    const lastDate = new Date(recent[recent.length-1].period_end)
    const rows = []
    for (let i = 1; i <= projPeriods; i++) {
      const d = new Date(lastDate)
      if (isWeekly) d.setDate(d.getDate() + (7 * i))
      else d.setMonth(d.getMonth() + (3 * i))
      const pd = d.toISOString().split('T')[0]
      const ov = editVals[pd] || {}
      const projLines = Object.keys(allLineItems).map(label => ({
        label, section: allLineItems[label],
        value: ov['line_'+label] != null ? parseFloat(ov['line_'+label]) : lineAvgs[label]
      }))
      rows.push({
        period_end: pd,
        income: ov.income != null ? parseFloat(ov.income) : avgIncome,
        expenses: ov.expenses != null ? parseFloat(ov.expenses) : avgExpenses,
        line_items: projLines,
        projected: true,
        edited: Object.keys(ov).length > 0
      })
    }
    return rows
  }

  const projection = buildProjection()
  const activeBudgetData = budgets.find(b => b.id === activeVersion)
  const activePeriods = activeBudgetData ? (activeBudgetData.periods || []) : null

  const saveBudget = async () => {
    if (!versionName.trim()) { sh('Enter a version name first'); return }
    setSaving(true)
    const periods = projection.map(p => ({
      period_end: p.period_end, income: p.income, expenses: p.expenses,
      line_items: p.line_items
    }))
    const { data, error } = await supabase.from('cashflow_budget').insert({
      org_id: orgId, entity, version_name: versionName.trim(),
      base_periods: basePeriods, periods,
      created_at: new Date().toISOString()
    }).select().single()
    if (error) { sh('Error: ' + error.message); setSaving(false); return }
    setBudgets(p => [data, ...p])
    setActiveVersion(data.id)
    setVersionName('')
    setSaving(false)
    sh('Saved as "' + data.version_name + '"')
  }

  const recent = plData.slice(-basePeriods)
  const avgIncome = recent.length ? recent.reduce((s,p)=>s+(p.income||0),0)/recent.length : 0
  const avgExpenses = recent.length ? recent.reduce((s,p)=>s+(p.expenses||0),0)/recent.length : 0

  const inpStyle = { width:80, padding:'2px 6px', background:C.ch, border:'1px solid '+C.go, borderRadius:4, color:C.w, fontSize:11, fontFamily:'inherit' }
  const thStyle = { textAlign:'left', padding:'4px 8px', fontSize:9, color:C.g, textTransform:'uppercase', position:'sticky', top:0, background:C.bg2 }
  const tdStyle = (color) => ({ padding:'5px 8px', fontSize:11, color: color||C.w })

  const allPeriods = [...plData.slice(-basePeriods), ...projection]
  const incomeLines = Object.keys(allLineItems).filter(l => allLineItems[l]==='Income' || allLineItems[l]==='Gross Profit')
  const expenseLines = Object.keys(allLineItems).filter(l => allLineItems[l]==='Expenses' || !incomeLines.includes(l) && allLineItems[l]!=='Income')

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:4 }}>
          {ENTITIES.map(e => (
            <button key={e.id} onClick={() => { setEntity(e.id); setEditVals({}) }} style={{ padding:'6px 16px', borderRadius:6, border:'1px solid '+(entity===e.id?C.go:C.bdrF), background:entity===e.id?C.gD:'transparent', color:entity===e.id?C.go:C.g, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{e.label}</button>
          ))}
        </div>
        <select value={basePeriods} onChange={e=>setBasePeriods(Number(e.target.value))} style={{ padding:'4px 8px', background:C.ch, border:'1px solid '+C.bdr, borderRadius:5, color:C.w, fontSize:11, fontFamily:'inherit' }}>
          {[4,8,12,16,20,24].map(n => <option key={n} value={n}>{'Base: '+n+' periods'}</option>)}
        </select>
        <select value={projPeriods} onChange={e=>setProjPeriods(Number(e.target.value))} style={{ padding:'4px 8px', background:C.ch, border:'1px solid '+C.bdr, borderRadius:5, color:C.w, fontSize:11, fontFamily:'inherit' }}>
          {[6,12,18,24,36,52,78,104].map(n => <option key={n} value={n}>{'Project: '+n+' periods'}</option>)}
        </select>
        <button onClick={()=>setShowDetail(p=>!p)} style={{ padding:'4px 12px', borderRadius:5, border:'1px solid '+(showDetail?C.go:C.bdrF), background:showDetail?C.gD:'transparent', color:showDetail?C.go:C.g, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
          {showDetail ? 'Summary View' : 'Line Item Detail'}
        </button>
      </div>

      {loading && <div style={{ color:C.g, fontSize:13 }}>{'Loading...'}</div>}
      {!loading && !plData.length && <div style={{ color:C.g, fontSize:13, padding:'20px 0' }}>{'No P&L data. Run cashflow_pl_seed.sql in Supabase first.'}</div>}

      {!loading && plData.length > 0 && <>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
          <span style={{ fontSize:10, color:C.g, textTransform:'uppercase', letterSpacing:1 }}>{'Versions:'}</span>
          {budgets.map(b => (
            <button key={b.id} onClick={() => setActiveVersion(activeVersion===b.id?null:b.id)} style={{ padding:'3px 10px', borderRadius:5, border:'1px solid '+(activeVersion===b.id?C.go:C.bdrF), background:activeVersion===b.id?C.gD:'transparent', color:activeVersion===b.id?C.go:C.g, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
              {b.version_name}
            </button>
          ))}
          {!activeVersion && <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <input value={versionName} onChange={e=>setVersionName(e.target.value)} placeholder="Name this budget..." style={{ padding:'3px 10px', background:C.ch, border:'1px solid '+C.bdr, borderRadius:5, color:C.w, fontSize:11, fontFamily:'inherit', width:200 }} />
            <button onClick={saveBudget} disabled={saving} style={{ padding:'3px 12px', borderRadius:5, border:'none', background:C.go, color:C.bg, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{saving?'Saving...':'Save'}</button>
          </div>}
        </div>
        {!showDetail && <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr>
              <th style={thStyle}>Period</th>
              <th style={thStyle}>Income</th>
              <th style={thStyle}>Expenses</th>
              <th style={thStyle}>Net</th>
              {activePeriods && <th style={thStyle}>Bud. Income</th>}
              {activePeriods && <th style={thStyle}>Bud. Net</th>}
              {activePeriods && <th style={thStyle}>Variance</th>}
              <th style={thStyle}></th>
            </tr></thead>
            <tbody>
              {allPeriods.map((p, i) => {
                const net = p.projected ? p.income - p.expenses : (p.income - p.expenses)
                const budP = activePeriods ? activePeriods.find(b => b.period_end === p.period_end) : null
                const variance = budP ? (p.income - budP.income) : null
                const isEditing = editingCell && editingCell.date === p.period_end && !editingCell.field
                return (
                  <tr key={i} style={{ borderBottom:'1px solid '+C.bdr, background:p.edited?'rgba(212,168,83,0.06)':p.projected?'rgba(212,168,83,0.03)':'transparent' }}>
                    <td style={tdStyle(p.projected?C.am:C.w)}>
                      {p.period_end}
                      {p.projected && <span style={{ fontSize:9, color:p.edited?C.am:C.g, marginLeft:6 }}>{p.edited?'edited':'projected'}</span>}
                    </td>
                    {p.projected && isEditing ? <>
                      <td style={{ padding:'3px 4px' }}><input autoFocus value={editVals[p.period_end]?.income ?? p.income.toFixed(0)} onChange={ev=>setEditVals(pv=>({...pv,[p.period_end]:{...(pv[p.period_end]||{}),income:ev.target.value}}))} style={inpStyle} /></td>
                      <td style={{ padding:'3px 4px' }}><input value={editVals[p.period_end]?.expenses ?? p.expenses.toFixed(0)} onChange={ev=>setEditVals(pv=>({...pv,[p.period_end]:{...(pv[p.period_end]||{}),expenses:ev.target.value}}))} style={inpStyle} /></td>
                      <td style={tdStyle(mColor(net))}>{fmt(net)}</td>
                      {activePeriods && <td style={tdStyle(C.g)}>{budP?fmt(budP.income):'—'}</td>}
                      {activePeriods && <td style={tdStyle(C.g)}>{budP?fmt(budP.income-budP.expenses):'—'}</td>}
                      {activePeriods && <td style={{ padding:'5px 8px', fontWeight:700, color:variance!=null?mColor(variance):C.g }}>{variance!=null?fmtVar(variance):'—'}</td>}
                      <td><button onClick={()=>setEditingCell(null)} style={{ padding:'2px 8px', borderRadius:4, border:'none', background:C.go, color:C.bg, fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>{'Done'}</button></td>
                    </> : <>
                      <td style={tdStyle(POS)} onClick={p.projected?()=>setEditingCell({date:p.period_end}):undefined}>{fmt(p.income)}</td>
                      <td style={tdStyle(WARN)} onClick={p.projected?()=>setEditingCell({date:p.period_end}):undefined}>{fmt(p.expenses)}</td>
                      <td style={{ ...tdStyle(mColor(net)), fontWeight:700 }}>{fmt(net)}</td>
                      {activePeriods && <td style={tdStyle(C.g)}>{budP?fmt(budP.income):'—'}</td>}
                      {activePeriods && <td style={tdStyle(C.g)}>{budP?fmt(budP.income-budP.expenses):'—'}</td>}
                      {activePeriods && <td style={{ padding:'5px 8px', fontWeight:700, color:variance!=null?mColor(variance):C.g }}>{variance!=null?fmtVar(variance):'—'}</td>}
                      <td>{p.projected && <button onClick={()=>setEditingCell({date:p.period_end})} style={{ padding:'2px 8px', borderRadius:4, border:'1px solid '+C.bdrF, background:'transparent', color:C.g, fontSize:9, cursor:'pointer', fontFamily:'inherit' }}>{'edit'}</button>}</td>
                    </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>}
        {showDetail && <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead><tr>
              <th style={{...thStyle, minWidth:200}}>Account</th>
              {allPeriods.map((p,i) => <th key={i} style={{...thStyle, minWidth:80, color:p.projected?C.am:C.g}}>{p.period_end.slice(5)}{p.projected?' *':''}</th>)}
            </tr></thead>
            <tbody>
              <tr><td colSpan={allPeriods.length+1} style={{ padding:'6px 8px', fontSize:9, fontWeight:700, color:C.go, textTransform:'uppercase', letterSpacing:1, background:C.nL }}>{'Income'}</td></tr>
              {incomeLines.map(label => (
                <tr key={label} style={{ borderBottom:'1px solid '+C.bdr }}>
                  <td style={{ padding:'4px 8px', fontSize:11, color:C.w, fontWeight:500 }}>{label}</td>
                  {allPeriods.map((p,i) => {
                    const li = (p.line_items||[]).find(l=>l.label===label)
                    const val = li ? li.value : 0
                    const isEdit = editingCell && editingCell.date===p.period_end && editingCell.field===label
                    return (
                      <td key={i} style={{ padding:'3px 6px' }}>
                        {p.projected && isEdit
                          ? <input autoFocus value={editVals[p.period_end]?.['line_'+label] ?? (val||'').toString()} onChange={ev=>setEditVals(pv=>({...pv,[p.period_end]:{...(pv[p.period_end]||{}),['line_'+label]:ev.target.value}}))} onBlur={()=>setEditingCell(null)} style={{...inpStyle, width:70}} />
                          : <span onClick={p.projected?()=>setEditingCell({date:p.period_end,field:label}):undefined} style={{ fontSize:11, color:val?POS:C.g, cursor:p.projected?'pointer':'default' }}>{val?fmt(val):'—'}</span>
                        }
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr style={{ borderTop:'2px solid '+C.bdr, background:C.nL }}>
                <td style={{ padding:'5px 8px', fontWeight:700, fontSize:11 }}>{'Total Income'}</td>
                {allPeriods.map((p,i) => <td key={i} style={{ padding:'5px 8px', fontWeight:700, color:POS, fontSize:11 }}>{fmt(p.income)}</td>)}
              </tr>
              <tr><td colSpan={allPeriods.length+1} style={{ padding:'6px 8px', fontSize:9, fontWeight:700, color:NEG, textTransform:'uppercase', letterSpacing:1, background:C.nL }}>{'Expenses'}</td></tr>
              {expenseLines.slice(0,40).map(label => (
                <tr key={label} style={{ borderBottom:'1px solid '+C.bdr }}>
                  <td style={{ padding:'4px 8px', fontSize:11, color:C.w, fontWeight:500 }}>{label}</td>
                  {allPeriods.map((p,i) => {
                    const li = (p.line_items||[]).find(l=>l.label===label)
                    const val = li ? li.value : 0
                    const isEdit = editingCell && editingCell.date===p.period_end && editingCell.field===label
                    return (
                      <td key={i} style={{ padding:'3px 6px' }}>
                        {p.projected && isEdit
                          ? <input autoFocus value={editVals[p.period_end]?.['line_'+label] ?? (val||'').toString()} onChange={ev=>setEditVals(pv=>({...pv,[p.period_end]:{...(pv[p.period_end]||{}),['line_'+label]:ev.target.value}}))} onBlur={()=>setEditingCell(null)} style={{...inpStyle, width:70}} />
                          : <span onClick={p.projected?()=>setEditingCell({date:p.period_end,field:label}):undefined} style={{ fontSize:11, color:val?WARN:C.g, cursor:p.projected?'pointer':'default' }}>{val?fmt(val):'—'}</span>
                        }
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr style={{ borderTop:'2px solid '+C.bdr, background:C.nL }}>
                <td style={{ padding:'5px 8px', fontWeight:700, fontSize:11 }}>{'Total Expenses'}</td>
                {allPeriods.map((p,i) => <td key={i} style={{ padding:'5px 8px', fontWeight:700, color:WARN, fontSize:11 }}>{fmt(p.expenses)}</td>)}
              </tr>
              <tr style={{ background:C.nL, borderTop:'1px solid '+C.bdr }}>
                <td style={{ padding:'5px 8px', fontWeight:700, fontSize:12, color:C.go }}>{'Net Income'}</td>
                {allPeriods.map((p,i) => {
                  const net = p.income - p.expenses
                  return <td key={i} style={{ padding:'5px 8px', fontWeight:700, fontSize:12, color:mColor(net) }}>{fmt(net)}</td>
                })}
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize:10, color:C.g, marginTop:8 }}>{'* Projected periods — click any cell to edit. Changes apply to summary view too.'}</div>
        </div>}
      </>}

      {toast && <div style={{ position:'fixed', bottom:20, right:20, background:C.go, color:C.bg, padding:'10px 18px', borderRadius:8, fontWeight:600, fontSize:13, zIndex:1000 }}>{toast}</div>}
    </div>
  )
}


function TaskLogView({ orgId, C }) {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    supabase.from('moneyflow_task_log')
      .select('*').eq('org_id', orgId)
      .order('logged_at', { ascending: false })
      .limit(200)
      .then(({ data }) => { setLog(data || []); setLoading(false) })
  }, [orgId])

  const ACTION_COLORS = {
    completed: '#22C55E',
    reopened: C.am,
    advanced: C.go,
  }

  const filtered = filter === 'all' ? log : log.filter(l => l.action === filter)

  const fmtDateTime = (s) => {
    if (!s) return '—'
    const d = new Date(s)
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.go }}>{'Task Activity History'}</div>
        <div style={{ display:'flex', gap:4 }}>
          {['all','completed','advanced','reopened'].map(f => (
            <button key={f} onClick={()=>setFilter(f)} style={{ padding:'3px 10px', borderRadius:5, border:'1px solid '+(filter===f?C.go:C.bdrF), background:filter===f?C.gD:'transparent', color:filter===f?C.go:C.g, fontSize:10, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>{f}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color:C.g, fontSize:13 }}>{'Loading...'}</div>}

      {!loading && !filtered.length && <div style={{ color:C.g, fontSize:13, padding:'20px 0' }}>{'No activity logged yet. Mark tasks done to start building history.'}</div>}

      {!loading && filtered.length > 0 && (
        <div>
          {filtered.map((entry, i) => (
            <div key={entry.id||i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'8px 0', borderBottom:'1px solid '+C.bdr }}>
              <div style={{ width:8, height:8, borderRadius:99, background:ACTION_COLORS[entry.action]||C.g, marginTop:4, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontWeight:600, fontSize:12, color:C.w }}>{entry.task_name}</span>
                  <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:(ACTION_COLORS[entry.action]||C.g)+'22', color:ACTION_COLORS[entry.action]||C.g, fontWeight:600, textTransform:'capitalize' }}>{entry.action}</span>
                  {entry.entity && <span style={{ fontSize:10, color:C.g }}>{entry.entity.toUpperCase()}</span>}
                  {entry.type && <span style={{ fontSize:10, color:C.g }}>{entry.type}</span>}
                </div>
                {entry.note && <div style={{ fontSize:11, color:C.g, marginTop:2 }}>{entry.note}</div>}
              </div>
              <div style={{ fontSize:10, color:C.g, flexShrink:0, textAlign:'right' }}>
                <div>{fmtDateTime(entry.logged_at)}</div>
                {entry.logged_by && entry.logged_by !== 'unknown' && <div style={{ marginTop:2 }}>{entry.logged_by}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function APReconView({ orgId, C, userEmail }) {
  const [entity, setEntity] = useState('iaz')
  const [bills, setBills] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [toast, setToast] = useState('')
  const [schedPmts, setSchedPmts] = useState([])
  const [schedModal, setSchedModal] = useState(null)
  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const SCHED_EDITORS = ['kari@karikounkel.com','accounting@mpuptown.com','operationsmanager@mpuptown.com']
  const canEditSched = SCHED_EDITORS.includes((userEmail||'').toLowerCase())

  const POS = C.go
  const NEG = '#B45055'
  const WARN = C.am

  const RECON_STATUSES = [
    { v: '', l: '— Unreviewed' },
    { v: 'confirmed', l: 'Confirmed' },
    { v: 'disputed', l: 'Disputed' },
    { v: 'paid', l: 'Paid / Clear' },
    { v: 'scheduled', l: 'Scheduled' },
    { v: 'hold', l: 'On Hold' },
  ]

  const ENTITIES = [{ id: 'iaz', label: 'IAZ Corporation' }, { id: 'omega', label: 'Omega LLC' }]

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    Promise.all([
      supabase.from('cashflow_ap').select('*').eq('org_id', orgId).eq('entity', entity)
        .order('snapshot_date', { ascending: false }).limit(1)
        .then(async r => {
          if (!r.data || !r.data[0]) return { data: [] }
          const latestDate = r.data[0].snapshot_date
          return supabase.from('cashflow_ap').select('*').eq('org_id', orgId).eq('entity', entity).eq('snapshot_date', latestDate).order('over90', { ascending: false })
        }),
      supabase.from('cashflow_ap_recon').select('*').eq('org_id', orgId).eq('entity', entity)
    ]).then(([apR, reconR]) => {
      const ap = apR.data || []
      const recon = reconR.data || []
      const merged = ap.map(b => {
        const r = recon.find(x => x.vendor === b.vendor) || {}
        return { ...b, recon_status: r.recon_status || '', recon_note: r.recon_note || '', recon_id: r.id || null }
      })
      setBills(merged)
      setLoading(false)
    })
  }, [orgId, entity])

  useEffect(() => {
    if (!orgId || !showHistory) return
    supabase.from('cashflow_ap_recon_history').select('*').eq('org_id', orgId).eq('entity', entity)
      .order('archived_at', { ascending: false }).limit(100)
      .then(({ data }) => setHistory(data || []))
  }, [orgId, entity, showHistory])

  useEffect(() => {
    if (!orgId) return
    loadSchedPmts()
  }, [orgId, entity])

  const loadSchedPmts = async () => {
    const { data } = await supabase.from('ap_scheduled_payments')
      .select('*').eq('org_id', orgId).eq('entity', entity)
      .eq('status', 'pending').order('scheduled_date', { ascending: true })
    setSchedPmts(data || [])
  }

  const schedPmtMap = {}
  schedPmts.forEach(p => {
    if (!schedPmtMap[p.vendor] || p.scheduled_date > schedPmtMap[p.vendor].scheduled_date) {
      schedPmtMap[p.vendor] = p
    }
  })

  const saveRecon = async (vendor, field, val) => {
    const now = new Date().toISOString()
    setBills(p => p.map(b => b.vendor === vendor ? { ...b, [field]: val, ...(field==='recon_status'&&val?{reviewed_at:now}:{}) } : b))
    const existing = bills.find(b => b.vendor === vendor)
    const payload = {
      org_id: orgId, entity, vendor,
      recon_status: field === 'recon_status' ? val : (existing?.recon_status || ''),
      recon_note: field === 'recon_note' ? val : (existing?.recon_note || ''),
      updated_at: now,
      updated_by: userEmail || 'unknown',
      reviewed_at: field === 'recon_status' && val ? now : (existing?.reviewed_at || null)
    }
    if (existing?.recon_id) {
      await supabase.from('cashflow_ap_recon').update(payload).eq('id', existing.recon_id)
    } else {
      const { data } = await supabase.from('cashflow_ap_recon').insert([payload]).select().single()
      if (data) setBills(p => p.map(b => b.vendor === vendor ? { ...b, recon_id: data.id } : b))
    }
  }

  const fmt = n => {
    if (!n) return '—'
    const abs = Math.abs(Number(n))
    const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return Number(n) < 0 ? '(' + str + ')' : str
  }

  const STATUS_COLORS = {
    confirmed: C.go,
    disputed: NEG,
    paid: '#22C55E',
    scheduled: WARN,
    hold: C.g,
    '': C.g
  }

  const inp = { padding:'3px 7px', background:C.ch, border:'1px solid '+C.bdrF, borderRadius:4, color:C.w, fontSize:11, fontFamily:'inherit' }

  const unreviewed = bills.filter(b => !b.recon_status).length
  const totalOwed = bills.reduce((s,b) => s + Math.abs(b.total||0), 0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:4 }}>
          {ENTITIES.map(e => (
            <button key={e.id} onClick={() => setEntity(e.id)} style={{ padding:'6px 16px', borderRadius:6, border:'1px solid '+(entity===e.id?C.go:C.bdrF), background:entity===e.id?C.gD:'transparent', color:entity===e.id?C.go:C.g, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{e.label}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={()=>setShowHistory(p=>!p)} style={{ padding:'4px 12px', borderRadius:5, border:'1px solid '+(showHistory?C.go:C.bdrF), background:showHistory?C.gD:'transparent', color:showHistory?C.go:C.g, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>{showHistory ? 'Hide History' : 'View History'}</button>
        </div>
      </div>

      {!showHistory && <>
        <div style={{ display:'flex', gap:20, marginBottom:12, flexWrap:'wrap', fontSize:12 }}>
          <span style={{ color:C.g }}>{'Total owed: '}<strong style={{ color:NEG }}>{fmt(totalOwed)}</strong></span>
          <span style={{ color:C.g }}>{'Unreviewed: '}<strong style={{ color:unreviewed>0?WARN:POS }}>{unreviewed}</strong></span>
          {['confirmed','disputed','paid','scheduled','hold'].map(s => {
            const count = bills.filter(b => b.recon_status === s).length
            if (!count) return null
            return <span key={s} style={{ color:C.g }}>{s+': '}<strong style={{ color:STATUS_COLORS[s] }}>{count}</strong></span>
          })}
        </div>

        {loading && <div style={{ color:C.g, fontSize:13 }}>{'Loading...'}</div>}

        {!loading && bills.length === 0 && <div style={{ color:C.g, fontSize:13, padding:'20px 0' }}>{'No AP data loaded. Upload an AP Aging CSV in the Cash Flow tab first.'}</div>}

        {!loading && [...bills].sort((a,b)=>a.vendor.localeCompare(b.vendor)).map((b, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px 140px 1fr 80px', gap:8, alignItems:'center', padding:'8px 10px', marginBottom:4, borderRadius:7, background:C.nL, border:'1px solid '+(b.recon_status?STATUS_COLORS[b.recon_status]+'44':C.bdr) }}>
            <div>
              <div style={{ fontWeight:600, fontSize:12 }}>{b.vendor}</div>
              <div style={{ fontSize:9, color:C.g, marginTop:1 }}>
                {b.current_amt?'Cur: '+fmt(b.current_amt)+'  ':''}
                {b.d30?'1-30: '+fmt(b.d30)+'  ':''}
                {b.d60?'31-60: '+fmt(b.d60)+'  ':''}
                {b.d90?'61-90: '+fmt(b.d90)+'  ':''}
                {b.over90?'90+: '+fmt(b.over90):''}
              </div>
              {schedPmtMap[b.vendor] && (() => {
                const sp = schedPmtMap[b.vendor]
                const seriesLabel = sp.series_total > 1 ? ' · '+sp.series_num+'/'+sp.series_total : ''
                const amtLabel = sp.amount ? ' · $'+parseFloat(sp.amount).toFixed(2) : ''
                return <div style={{ marginTop:4, display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:99, background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.35)', fontSize:9, color:WARN, fontWeight:600 }}>
                  {'📅 '+new Date(sp.scheduled_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+amtLabel+' · '+(sp.payment_type==='partial'?'Partial':'Full')+seriesLabel}
                </div>
              })()}
            </div>
            <div style={{ fontWeight:700, fontSize:13, color:b.total<0?POS:C.w, textAlign:'right' }}>{fmt(b.total)}</div>
            <select value={b.recon_status||''} onChange={ev=>saveRecon(b.vendor,'recon_status',ev.target.value)} style={{ ...inp, width:'100%' }}>
              {RECON_STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
            <input value={b.recon_note||''} onChange={ev=>saveRecon(b.vendor,'recon_note',ev.target.value)} placeholder="Notes..." style={{ ...inp, width:'100%' }} />
            <div style={{ textAlign:'right' }}>
              {canEditSched && (
                <button onClick={() => setSchedModal({ vendor: b.vendor, existing: schedPmtMap[b.vendor] || null })}
                  style={{ display:'block', width:'100%', marginBottom:4, padding:'3px 0', borderRadius:4, border:'1px solid '+(schedPmtMap[b.vendor]?WARN:C.bdrF), background:'transparent', color:schedPmtMap[b.vendor]?WARN:C.g, fontSize:9, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                  {schedPmtMap[b.vendor] ? '📅 Edit' : '+ Sched'}
                </button>
              )}
              {b.recon_status && <span style={{ fontSize:9, padding:'2px 7px', borderRadius:99, background:STATUS_COLORS[b.recon_status]+'22', color:STATUS_COLORS[b.recon_status], fontWeight:600, display:'block', marginBottom:2 }}>{b.recon_status}</span>}
              {b.reviewed_at && <span style={{ fontSize:9, color:C.g, display:'block' }}>{new Date(b.reviewed_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + new Date(b.reviewed_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>}
            </div>
          </div>
        ))}
      </>}

      {showHistory && <>
        <div style={{ fontSize:11, color:C.g, marginBottom:12 }}>{'Reconciliation notes saved from previous AP uploads.'}</div>
        {history.length === 0 && <div style={{ color:C.g, fontSize:13 }}>{'No history yet. History saves automatically when you upload a new AP aging file.'}</div>}
        {history.map((h, i) => (
          <div key={i} style={{ padding:'8px 12px', marginBottom:4, borderRadius:7, background:C.nL, border:'1px solid '+C.bdr, display:'grid', gridTemplateColumns:'1fr 100px 120px 1fr 140px', gap:8, alignItems:'center', fontSize:11 }}>
            <span style={{ fontWeight:600 }}>{h.vendor}</span>
            <span style={{ color:h.total<0?POS:C.w, fontWeight:700 }}>{fmt(h.total)}</span>
            <span style={{ color:STATUS_COLORS[h.recon_status]||C.g, fontWeight:600 }}>{h.recon_status||'unreviewed'}</span>
            <span style={{ color:C.g }}>{h.recon_note||'—'}</span>
            <span style={{ color:C.g, fontSize:10 }}>{h.archived_at ? new Date(h.archived_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</span>
          </div>
        ))}
      </>}

      {toast && <div style={{ position:'fixed', bottom:20, right:20, background:C.go, color:C.bg, padding:'10px 18px', borderRadius:8, fontWeight:600, fontSize:13, zIndex:1000 }}>{toast}</div>}
      {schedModal && <SchedPayModal
        orgId={orgId} entity={entity} C={C}
        vendor={schedModal.vendor} existing={schedModal.existing}
        allPmts={schedPmts.filter(p => p.vendor === schedModal.vendor)}
        onClose={() => setSchedModal(null)}
        onSaved={() => { loadSchedPmts(); setSchedModal(null); sh('Scheduled payment saved ✓') }}
        onExpired={() => { loadSchedPmts(); setSchedModal(null); sh('Marked as paid ✓') }}
      />}
    </div>
  )
}

export default function MoneyFlowModule({ orgId, C }) {
  const [tab, setTab] = useState('dashboard')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [showDone, setShowDone] = useState(false)
  const [allResources, setAllResources] = useState([])
  const [userEmail, setUserEmail] = useState('')
  const [employees, setEmployees] = useState([])

  const isAdmin = ADMIN_EMAILS.includes(userEmail.toLowerCase())

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email)
    })
  }, [])

  useEffect(() => {
    if (!orgId) return
    supabase.from('employees').select('id,first_name,last_name').eq('org_id', orgId).order('last_name').then(({ data }) => {
      setEmployees(data || [])
    })
  }, [orgId])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  // Recurring advance date picker
  const [advanceModal, setAdvanceModal] = useState(null)  // { task } | null
  const [advanceDate, setAdvanceDate] = useState('')

  // JE Generator sub-tab
  const [jeSubTab, setJeSubTab] = useState('tasks')
  const [budgetEntity, setBudgetEntity] = useState('iaz')

  // ── LIFTED IIF STATE (persists across tab switches) ──
  const [iifParsedData, setIifParsedData] = useState(null)
  const [iifFileName, setIifFileName] = useState('')
  const [iifPeriod, setIifPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // ── LOAD RESOURCES (for task attachment) ──
  const loadResources = useCallback(async () => {
    const { data } = await supabase
      .from('moneyflow_resources').select('id,label,url,username,password,pin')
      .eq('org_id', orgId).order('label')
    setAllResources(data || [])
  }, [orgId])

  useEffect(() => { loadResources() }, [loadResources])

  // ── Generate payroll task cards from active payment orders ──
  const syncPayrollTasks = useCallback(async () => {
    const { data: orders } = await supabase
      .from('payroll_payment_orders')
      .select('*').eq('org_id', orgId).eq('status', 'active')
    await generatePayrollTasks(orgId, orders || [])
  }, [orgId])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('moneyflow_tasks')
        .select('*')
        .eq('org_id', orgId)
        .neq('status', 'done')
        .order('due_date', { ascending: true })
      if (err) throw err
      setTasks(data || [])
    } catch (e) {
      setError(e.message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  // On mount: sync payroll cards first, then load all tasks
  // syncPayrollTasks is best-effort — loadTasks always runs regardless
  useEffect(() => {
    syncPayrollTasks().catch(e => console.warn('syncPayrollTasks failed:', e)).finally(() => loadTasks())
  }, [syncPayrollTasks, loadTasks])

  // ── TOGGLE DONE ──
  // If recurring + marking done → advance due_date by recur_interval, keep status 'open'
  // If not recurring → toggle between open/done
  const writeTaskLog = async (task, action, note) => {
    await supabase.from('moneyflow_task_log').insert([{
      org_id: orgId,
      task_id: task.id,
      task_name: task.name,
      entity: task.entity,
      type: task.type,
      action,
      note: note || null,
      logged_at: new Date().toISOString(),
      logged_by: userEmail || 'unknown'
    }])
  }

  async function toggleDone(task) {
    const isDone = task.status === 'done'

    if (!isDone && task.is_recurring) {
      // Open date picker modal — never auto-calculate
      const suggested = advanceDueDate(task.due_date, task.recur_interval || 7)
      setAdvanceDate(suggested)
      setAdvanceModal({ task })
      return
    } else {
      const newStatus = isDone ? 'open' : 'done'
      setTasks(ts => ts.map(t =>
        t.id === task.id ? { ...t, status: newStatus } : t
      ))
      const { error: err } = await supabase
        .from('moneyflow_tasks')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', task.id)
      if (err) {
        setTasks(ts => ts.map(t =>
          t.id === task.id ? { ...t, status: task.status } : t
        ))
      } else {
        writeTaskLog(task, newStatus === 'done' ? 'completed' : 'reopened', null)
      }
    }
  }

  async function confirmAdvance() {
    if (!advanceModal || !advanceDate) return
    const task = advanceModal.task
    setTasks(ts => ts.map(t =>
      t.id === task.id ? { ...t, due_date: advanceDate, _justAdvanced: true } : t
    ))
    const { error: err } = await supabase
      .from('moneyflow_tasks')
      .update({ due_date: advanceDate, updated_at: new Date().toISOString() })
      .eq('id', task.id)
    if (err) {
      setTasks(ts => ts.map(t =>
        t.id === task.id ? { ...t, due_date: task.due_date, _justAdvanced: false } : t
      ))
    } else {
      writeTaskLog(task, 'advanced', 'Advanced from ' + task.due_date + ' to ' + advanceDate)
      setTimeout(() => setTasks(ts => ts.map(t =>
        t.id === task.id ? { ...t, _justAdvanced: false } : t
      )), 2000)
    }
    setAdvanceModal(null)
    setAdvanceDate('')
  }

  function openNewTask() {
    setEditingTask(null)
    loadResources()
    setModalOpen(true)
  }

  function openEditTask(task) {
    setEditingTask(task)
    loadResources()
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
    if (!showDone && t.status === 'done') return false
    if (filterEntity !== 'all' && t.entity !== filterEntity) return false
    if (filterType !== 'all' && t.type !== filterType) return false
    return true
  })

  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{
      background: active ? (C.gD) : 'transparent',
      border: `1px solid ${active ? (C.go) : (C.bdrF)}`,
      color: active ? (C.go) : (C.g),
      padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    }}>{label}</button>
  )

  const subPill = (label, active, onClick) => (
    <button onClick={onClick} style={{
      background: active ? C.go : 'transparent',
      border: `1px solid ${active ? C.go : C.bdrF}`,
      color: active ? '#fff' : C.g,
      padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
    }}>{label}</button>
  )

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {modalOpen && (
        <TaskFormModal
          task={editingTask}
          orgId={orgId}
          C={C}
          allResources={allResources}
          onSave={handleSaved}
          onClose={closeModal}
          onDelete={handleDeleted}
        />
      )}
      {advanceModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:16 }}>
          <div style={{ background:C.bg2, border:'1px solid '+C.bdr, borderRadius:14, padding:28, maxWidth:360, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.go, marginBottom:6 }}>{'↻ Advance Recurring Task'}</div>
            <div style={{ fontSize:12, color:C.w, marginBottom:4, fontWeight:600 }}>{advanceModal.task.name}</div>
            <div style={{ fontSize:11, color:C.g, marginBottom:20 }}>{'Pick the next due date. The suggested date is based on your recur interval — change it to whatever actually makes sense.'}</div>
            <label style={{ fontSize:10, color:C.g, display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.8px' }}>Next Due Date</label>
            <input
              type="date"
              value={advanceDate}
              onChange={e => setAdvanceDate(e.target.value)}
              style={{ width:'100%', background:C.bg, border:'1px solid '+C.bdr, color:C.w, borderRadius:6, padding:'8px 10px', fontSize:13, fontFamily:'inherit', boxSizing:'border-box', marginBottom:20 }}
            />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => { setAdvanceModal(null); setAdvanceDate('') }} style={{ background:'transparent', border:'1px solid '+C.bdr, color:C.g, padding:'8px 18px', borderRadius:8, cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={confirmAdvance} disabled={!advanceDate} style={{ background:C.go, border:'none', color:'#fff', padding:'8px 20px', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit', opacity:advanceDate?1:0.5 }}>
                {'✓ Set Date'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.go }}>
            💰 MoneyFlow
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g }}>
            Accounting tasks &amp; journal entry generator
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {pill('◆ Dashboard', tab === 'dashboard', () => setTab('dashboard'))}
          {pill('Cash Flow', tab === 'cashflow', () => setTab('cashflow'))}
          {pill('Budget', tab === 'budget', () => setTab('budget'))}
          {pill('Accounting', tab === 'accounting', () => setTab('accounting'))}
        </div>
      </div>
      {tab === 'dashboard' && <CashDashboard orgId={orgId} C={C} />}
      {tab === 'cashflow' && <CashFlowForecaster orgId={orgId} C={C} userEmail={userEmail} />}
      {tab === 'budget' && <BudgetView orgId={orgId} C={C} />}
      {tab === 'accounting' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: `1px solid ${C.bdr}`, paddingBottom: 12 }}>
            {subPill('Tasks', jeSubTab === 'tasks', () => setJeSubTab('tasks'))}
            {subPill('Task History', jeSubTab === 'tasklog', () => setJeSubTab('tasklog'))}
            {subPill('AP Recon', jeSubTab === 'aprecon', () => setJeSubTab('aprecon'))}
            {subPill('Close Checklist', jeSubTab === 'checklist', () => setJeSubTab('checklist'))}
            {subPill('IIF Factory', jeSubTab === 'iif', () => setJeSubTab('iif'))}
            {subPill('Recurring JEs', jeSubTab === 'recurring', () => setJeSubTab('recurring'))}
            {subPill('Amortization', jeSubTab === 'amort', () => setJeSubTab('amort'))}

            {subPill('Payroll Orders', jeSubTab === 'payroll', () => setJeSubTab('payroll'))}
            {subPill('Resources', jeSubTab === 'resources', () => setJeSubTab('resources'))}
          </div>
          {jeSubTab === 'tasks' && (
            <div>
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
                <button onClick={()=>setShowDone(p=>!p)} style={{ padding:'4px 10px', borderRadius:5, border:'1px solid '+(showDone?C.go:C.bdrF), background:showDone?C.gD:'transparent', color:showDone?C.go:C.g, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>{showDone?'Hide Done':'Show Done'}</button>
                <button onClick={openNewTask} style={{ background: C.go, border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>{'+ Add Task'}</button>
              </div>
              {loading && <p style={{ color: C.g, fontSize: 13 }}>{'Loading tasks...'}</p>}
              {!loading && (()=>{
                const now = new Date()
                const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0)
                const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); endOfWeek.setHours(23,59,59,999)

                const overdue  = filtered.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date+'T12:00:00') < startOfWeek)
                const thisWeek = filtered.filter(t => { if (t.status === 'done' && !showDone) return false; const d = t.due_date ? new Date(t.due_date+'T12:00:00') : null; return !d || (d >= startOfWeek && d <= endOfWeek) })
                const later    = filtered.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date+'T12:00:00') > endOfWeek)

                const SectionHead = ({label, count, color}) => (
                  <div style={{ display:'flex', alignItems:'center', gap:10, margin:'18px 0 10px' }}>
                    <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:color||C.g }}>{label}</span>
                    <span style={{ fontSize:10, color:color||C.g, fontWeight:600 }}>({count})</span>
                    <div style={{ flex:1, height:1, background:C.bdr }}/>
                  </div>
                )

                return <div>
                  {filtered.length === 0 && <p style={{ color: C.g, fontSize: 13 }}>{'No tasks match this filter.'}</p>}

                  {overdue.length > 0 && <>
                    <SectionHead label="Overdue" count={overdue.length} color={C.rd||'#B45055'} />
                    <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                      {overdue.map(task => <TaskCard key={task.id} task={task} C={C} onToggleDone={toggleDone} onEdit={openEditTask} allResources={allResources} />)}
                    </div>
                  </>}

                  {thisWeek.length > 0 && <>
                    <SectionHead label="This Week" count={thisWeek.length} color={C.go} />
                    <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                      {thisWeek.map(task => <TaskCard key={task.id} task={task} C={C} onToggleDone={toggleDone} onEdit={openEditTask} allResources={allResources} />)}
                    </div>
                  </>}

                  {later.length > 0 && <>
                    <SectionHead label="Coming Up" count={later.length} color={C.g} />
                    <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                      {later.map(task => <TaskCard key={task.id} task={task} C={C} onToggleDone={toggleDone} onEdit={openEditTask} allResources={allResources} />)}
                    </div>
                  </>}
                </div>
              })()}
            </div>
          )}
          {jeSubTab === 'tasklog' && <TaskLogView orgId={orgId} C={C} />}
          {jeSubTab === 'aprecon' && <APReconView orgId={orgId} C={C} userEmail={userEmail} />}
          {jeSubTab === 'checklist' && <CloseChecklistTab orgId={orgId} C={C} />}
          {jeSubTab === 'iif' && (
            <IIFFactory
              orgId={orgId} C={C}
              parsedData={iifParsedData} setParsedData={setIifParsedData}
              fileName={iifFileName} setFileName={setIifFileName}
              period={iifPeriod} setPeriod={setIifPeriod}
            />
          )}
          {jeSubTab === 'recurring' && <RecurringJETab orgId={orgId} C={C} />}
          {jeSubTab === 'amort' && <AmortizationTab orgId={orgId} C={C} />}

          {jeSubTab === 'resources' && <ResourceLibraryTab orgId={orgId} C={C} />}
          {jeSubTab === 'payroll' && (
            <div style={{ position: 'relative' }}>
              <PayrollPaymentsTab orgId={orgId} C={C} employees={employees} allResources={allResources} onOrdersChanged={async () => { await syncPayrollTasks(); loadTasks() }} />
              {!isAdmin && userEmail && (
                <div style={{ position:'absolute', inset:0, zIndex:10, background:'rgba(10,14,22,0.82)', backdropFilter:'blur(4px)', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
                  <div style={{ fontSize:28 }}>{'🔒'}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.w }}>{'Admin Access Required'}</div>
                  <div style={{ fontSize:11, color:C.g }}>{'Payroll payment orders are restricted to administrators.'}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
