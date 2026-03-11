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

    if (rowType === '!TRNS') { trnsColMap = colMap(cols); continue }
    if (rowType === '!SPL')  { splColMap  = colMap(cols); continue }
    if (rowType === '!ENDTRNS') continue

    if (rowType === 'ENDTRNS') {
      if (current) { transactions.push(current); current = null }
      continue
    }

    if (rowType === 'TRNS') {
      const accnt  = pick(trnsColMap, cols, 'ACCNT')
      const amount = parseFloat(pick(trnsColMap, cols, 'AMOUNT')) || 0
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
      const amount = parseFloat(pick(splColMap, cols, 'AMOUNT')) || 0
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
                  onChange={e => set('recur_interval', parseInt(e.target.value) || 30)}
                  min={1}
                  style={inputStyle}
                />
              </div>
            </div>
          )}
        </div>

        {/* Linked Resources */}
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
function TaskCard({ task, C, onToggleDone, onEdit, allResources }) {
  const [flipped, setFlipped] = useState(false)
  const ec = ENTITY_COLORS[task.entity] || ENTITY_COLORS.omega
  const tc = TYPE_COLORS[task.type] || '#a0a0a0'
  const done = task.status === 'done'
  const linkedResources = (allResources || []).filter(r => (task.resource_ids || []).includes(r.id))

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
  const [accountMap, setAccountMap] = useState([])      // rows from iif_account_map
  const [history, setHistory] = useState([])            // rows from iif_je_history
  const [coaAccounts, setCoaAccounts] = useState([])   // rows from coa_accounts
  const [loadingMap, setLoadingMap] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postMsg, setPostMsg] = useState(null)
  const [newMappings, setNewMappings] = useState({})    // { source_account: qbo_account } for inline adds
  const [mapSearch, setMapSearch] = useState({})        // { source_account: search string } for dropdown filter
  const [showMapEditor, setShowMapEditor] = useState(false)
  const [showCoaImport, setShowCoaImport] = useState(false)
  const [coaImporting, setCoaImporting] = useState(false)

  // Load account map + history + COA for this org + period
  useEffect(() => {
    async function load() {
      setLoadingMap(true)
      const [{ data: mapData }, { data: histData }, { data: coaData }] = await Promise.all([
        supabase.from('iif_account_map').select('*').eq('org_id', orgId),
        supabase.from('iif_je_history').select('*').eq('org_id', orgId).eq('period', period),
        supabase.from('coa_accounts').select('account_name,account_type').eq('org_id', orgId).order('account_name'),
      ])
      setAccountMap(mapData || [])
      setHistory(histData || [])
      setCoaAccounts(coaData || [])
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

  // Build JE lines from parsed IIF, applying account map + delta calc
  // IIF convention: TRNS amount is positive (DR), SPL amounts are negative (CR)
  // We track debit totals and credit totals separately per account
  function buildJELines() {
    if (!parsedData) return []
    const mapLookup = {}
    accountMap.forEach(r => { mapLookup[r.source_account] = r.qbo_account })
    Object.entries(newMappings).forEach(([src, qbo]) => { if (qbo.trim()) mapLookup[src] = qbo.trim() })

    // Sum raw IIF amounts per account (preserving sign: DR positive, CR negative)
    const rawTotals = {}
    parsedData.transactions.forEach(tx => {
      const a = tx.trns.accnt
      if (a) rawTotals[a] = (rawTotals[a] || 0) + tx.trns.amount
      tx.spls.forEach(s => {
        if (s.accnt) rawTotals[s.accnt] = (rawTotals[s.accnt] || 0) + s.amount
      })
    })

    // Subtract already-posted signed amounts for same org+period
    const postedTotals = {}
    history.forEach(r => {
      postedTotals[r.source_account] = (postedTotals[r.source_account] || 0) + r.amount
    })

    const lines = []
    Object.entries(rawTotals).forEach(([srcAcct, rawAmt]) => {
      if (Math.abs(rawAmt) < 0.005) return  // skip zero-amount accounts
      const delta = rawAmt - (postedTotals[srcAcct] || 0)
      if (Math.abs(delta) < 0.005) return   // already fully posted
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

    // Insert history rows
    const historyRows = jeLines.map(l => ({
      org_id: orgId,
      period,
      source_account: l.source_account,
      qbo_account: l.acct,
      amount: l.dr ? l.amount : -l.amount,
      file_name: fileName,
      posted_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('iif_je_history').insert(historyRows)
    if (error) {
      setPostMsg({ ok: false, msg: error.message })
    } else {
      // ── Write unposted entry to close checklist for this period ──
      await supabase.from('moneyflow_close_log').upsert([{
        org_id: orgId,
        period,
        entry_type: 'iif',
        template_id: null,
        label: `AR/Sales IIF — ${fileName || period}`,
        amount: totalDr,
        source: 'iif',
        posted_at: null,
      }], { onConflict: 'org_id,period,source,label' })

      setPostMsg({ ok: true, msg: `Posted ${historyRows.length} lines to history for ${period}. Entry added to Close Checklist.` })
      const { data: newHist } = await supabase.from('iif_je_history').select('*').eq('org_id', orgId).eq('period', period)
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
      {/* Controls row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Period (YYYY-MM)</label>
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={{ ...inputStyle, width: 150 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Upload .IIF File</label>
          <input type="file" accept=".iif,.IIF" onChange={handleFileUpload} style={{ fontSize: 11, color: C.w }} />
          {fileName && (
            <div style={{ fontSize: 10, color: C.go, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
              📄 {fileName}
            </div>
          )}
        </div>
        {parsedData && (
          <div style={{ fontSize: 10, color: C.g }}>
            {parsedData.transactions.length} transactions · {parsedData.accounts.size} accounts · {history.length} lines already posted this period
          </div>
        )}
      </div>

      {loadingMap && <p style={{ fontSize: 12, color: C.g }}>Loading account map…</p>}

      {/* Unmapped account inline resolver */}
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

      {/* JE Preview */}
      {jeLines.length > 0 && (
        <>
          <JETable
            lines={jeLines}
            C={C}
            journalNum={`IIF ${period} — ${fileName || 'upload'}`}
            dateLabel={`Delta vs. prior postings · Period ${period}`}
            memo={`IIF import · ${fileName} · org ${orgId} · ${period}`}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={handlePost}
              disabled={hasUnmapped || posting}
              style={{
                background: hasUnmapped ? C.bdr : C.go, border: 'none', color: '#fff',
                padding: '8px 24px', borderRadius: 7, cursor: hasUnmapped ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                opacity: hasUnmapped ? 0.5 : 1,
              }}
            >{posting ? 'Posting…' : 'Post to History'}</button>
            {postMsg && (
              <span style={{ fontSize: 11, color: postMsg.ok ? '#6ab87a' : '#e07070' }}>
                {postMsg.ok ? '✓' : '⚠'} {postMsg.msg}
              </span>
            )}
          </div>
        </>
      )}

      {parsedData && jeLines.length === 0 && (
        <div style={{ fontSize: 12, color: '#6ab87a', padding: '12px 0' }}>
          ✓ All accounts fully posted for period {period}. Nothing new to post.
        </div>
      )}

      {/* Account map viewer toggle */}
      {accountMap.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowMapEditor(v => !v)}
            style={{
              background: 'transparent', border: `1px solid ${C.bdrF}`,
              color: C.g, padding: '5px 14px', borderRadius: 20,
              cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            }}
          >{showMapEditor ? '▲ Hide' : '▼ View'} Account Map ({accountMap.length} entries)</button>
          {showMapEditor && (
            <div style={{
              marginTop: 10, background: C.bg2, border: `1px solid ${C.bdr}`,
              borderRadius: 8, overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <th style={{ textAlign: 'left', color: C.g, padding: '8px 12px' }}>IIF Source Account</th>
                    <th style={{ textAlign: 'left', color: C.g, padding: '8px 12px' }}>QBO Account</th>
                  </tr>
                </thead>
                <tbody>
                  {accountMap.map((r, i) => (
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

      {/* COA Import */}
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
      {/* Left panel */}
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

        {/* UTIL session inputs */}
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

      {/* Right panel */}
      <div style={{ flex: 1, minWidth: 320 }}>
        {activeTemplate && (
          <JETable
            lines={displayLines} C={C}
            journalNum={journalNum} dateLabel={dateLabel}
            memo={`${activeTemplate.label} — ${monthName} ${jeYear} — Enter manually in QBO`}
          />
        )}

        {/* ── Fixed-amount line editor ── */}
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
  function getIIFEntry() { return log.find(r => r.source === 'iif' || r.entry_type === 'iif') }
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
  const oneoffEntries = log.filter(r => r.entry_type === 'oneoff')
  const totalItems    = activeTemplates.length + (iifEntry ? 1 : 0) + oneoffEntries.length
  const postedCount   = activeTemplates.filter(t => !!getLogEntry('recurring', t.id)).length
    + (iifEntry?.posted_at ? 1 : 0)
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
      {/* Period picker + progress */}
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

      {/* Progress bar */}
      {totalItems > 0 && (
        <div style={{ background: C.bdr, borderRadius: 4, height: 6, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4, background: C.go,
            width: `${(postedCount / totalItems) * 100}%`, transition: 'width 0.4s ease',
          }} />
        </div>
      )}

      {/* ── STALE PERIOD WARNINGS ── */}
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

      {/* ── RECURRING ENTRIES ── */}
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
        const fixedAmt  = lines.filter(l => l.template_id === t.id && !l.is_editable && !l.is_total)
          .reduce((s, l) => s + Math.abs(l.amount || 0), 0)
        const utilAmt   = utilLines.reduce((s, l) => s + (parseFloat(utilAmounts[l.id]) || 0), 0)
        const displayAmt = isUtil ? utilAmt : fixedAmt
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
                {displayAmt > 0 && (
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
            {/* UTIL inline amount entry */}
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

      {/* ── IIF ENTRY (auto-populated from IIF Factory) ── */}
      {iifEntry && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.go, margin: '20px 0 10px', letterSpacing: '0.5px' }}>
            IIF / AR SALES
            <span style={{ fontSize: 10, color: C.g, fontWeight: 400, marginLeft: 8 }}>Auto-populated when IIF file is posted</span>
          </div>
          <div style={{
            background: iifEntry.posted_at ? `${C.go}11` : C.bg2,
            border: `1px solid ${iifEntry.posted_at ? C.go : C.bdr}`,
            borderRadius: 10, padding: '12px 16px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: iifEntry.posted_at ? '#6ab87a' : '#e0a050' }} />
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: iifEntry.posted_at ? '#6ab87a' : C.w }}>{iifEntry.label}</div>
                {!iifEntry.posted_at && <div style={{ fontSize: 10, color: '#e0a050' }}>IIF uploaded — confirm when entered in QBO</div>}
                {iifEntry.amount && <div style={{ fontSize: 11, color: C.go, fontFamily: "'DM Mono', monospace" }}>${fmt(iifEntry.amount)}</div>}
              </div>
              <PostControls
                entryKey={logKey('iif', iifEntry.id)}
                posted={!!iifEntry.posted_at}
                postedAt={iifEntry.posted_at}
                postedNote={iifEntry.note}
                onPost={() => markIIFPosted(iifEntry)}
                onUnpost={() => unpostUpdate(iifEntry.id)}
              />
            </div>
          </div>
        </>
      )}

      {/* ── ONE-OFF ENTRIES ── */}
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
function AmortizationTab({ C }) {
  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{
        background: C.bg2, border: `2px dashed ${C.bdr}`,
        borderRadius: 12, padding: '40px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.go, marginBottom: 8 }}>
          Amortization Schedule Import
        </div>
        <div style={{ fontSize: 12, color: C.g, lineHeight: 1.6, marginBottom: 20 }}>
          Drop your schedule here when it arrives.<br/>
          This tab will parse loan schedules and generate<br/>
          principal/interest split JEs for each payment period.
        </div>
        <div style={{
          border: `2px dashed ${C.bdrF}`, borderRadius: 8,
          padding: '20px 24px', color: C.g, fontSize: 11,
        }}>
          Upload zone coming soon — waiting on schedules
        </div>
      </div>
      <div style={{
        marginTop: 16, padding: '10px 14px', borderLeft: `3px solid ${C.go}`,
        background: C.gD, borderRadius: '0 8px 8px 0', fontSize: 11, color: C.g,
      }}>
        <strong style={{ color: C.go }}>Sidebar:</strong> When the MEDA schedule lands, this tab will split every payment into principal vs. interest without you doing the math. It's waiting patiently.
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
      padding: '14px 16px', minWidth: 220, maxWidth: 280, flex: '0 0 auto',
    }}>
      {/* Header */}
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

      {/* URL button */}
      {res.url && (
        <a href={res.url} target="_blank" rel="noreferrer" style={{
          display: 'inline-block', background: C.go, color: '#fff',
          borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 700,
          textDecoration: 'none', marginBottom: 10,
        }}>{res.label} ↗</a>
      )}

      {/* Creds toggle + copy buttons */}
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

      {res.notes && (
        <div style={{ fontSize: 10, color: C.g, marginTop: 8, borderTop: `1px solid ${C.bdrF}`, paddingTop: 6 }}>
          {res.notes}
        </div>
      )}
    </div>
  )
}

const BLANK_RES = { label: '', url: '', username: '', password: '', pin: '', notes: '' }

function ResourceFormModal({ res, orgId, C, onSave, onClose }) {
  const isEdit = !!res?.id
  const [form, setForm] = useState(isEdit ? {
    label: res.label || '', url: res.url || '',
    username: res.username || '', password: res.password || '',
    pin: res.pin || '', notes: res.notes || '',
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
          { key: 'username', label: 'Username',     placeholder: '' },
          { key: 'pin',   label: 'PIN',             placeholder: '' },
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.g }}>
          Login links, credentials, and vendor portals — all in one place.
        </div>
        <button onClick={handleNew} style={{
          background: C.go, border: 'none', color: '#fff',
          padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
          fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
        }}>+ Add Resource</button>
      </div>

      {loading && <p style={{ fontSize: 12, color: C.g }}>Loading…</p>}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {!loading && resources.length === 0 && (
          <p style={{ fontSize: 12, color: C.g }}>No resources yet. Add your first one — Xcel, CenterPoint, QBO, wherever you log in.</p>
        )}
        {resources.map(res => (
          <ResourceCard key={res.id} res={res} C={C} onEdit={handleEdit} onDelete={handleDelete} />
        ))}
      </div>

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
function WithholdingProcessorTab({ orgId, C, orders: propOrders = null, allResources = [] }) {
  const [orders, setOrders]       = useState(propOrders || [])
  const [rows, setRows]           = useState([])   // parsed deduction rows from upload
  const [payPeriod, setPayPeriod] = useState('')
  const [payDate, setPayDate]     = useState('')
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
      {/* Upload */}
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

        {/* Summary banner */}
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

        {/* ── PAYMENTS TO SEND ── */}
        {paymentRows.length > 0 && (<>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e07070', marginBottom: 10, letterSpacing: '0.5px' }}>
            SEND PAYMENTS
          </div>
          {paymentRows.map((r, i) => {
            const order = matchOrder(r)
            return (
              <div key={i} style={{
                background: C.bg2, border: `1px solid ${order ? C.go : C.bdr}`,
                borderRadius: 10, padding: '12px 16px', marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.w }}>{r.desc}</div>
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
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                        {allResources.filter(res => (order.resource_ids || []).includes(res.id)).map(res => (
                          <a key={res.id} href={res.url} target="_blank" rel="noreferrer"
                            style={{ fontSize: 10, color: '#7ab0e0', textDecoration: 'none', border: '1px solid #7ab0e0', padding: '2px 8px', borderRadius: 4 }}>
                            🔑 {res.label}
                          </a>
                        ))}
                      </div>
                    )}
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

        {/* ── INTERNAL / BENEFIT DEDUCTIONS ── */}
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

        {/* ── ZERO AMOUNT ROWS ── */}
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

      {/* No orders warning */}
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

      {/* Checklist template manager */}
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

      {/* Employee filter + status filter */}
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

      {/* Per-employee checklist rows */}
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
            {/* Employee header */}
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

            {/* Checklist items */}
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
                  {/* Status toggle button */}
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
    const payload = {
      ...form,
      org_id: orgId,
      amount_per_period: parseFloat(form.amount_per_period) || 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
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

function PayrollPaymentsTab({ orgId, C, employees = [], allResources = [] }) {
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
  function handleSaved() { setModalOpen(false); setEditing(null); load() }

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

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: `1px solid ${C.bdr}`, paddingBottom: 12 }}>
        {subPill2('Payment Orders', payrollSubTab === 'orders', () => setPayrollSubTab('orders'))}
        {subPill2('Withholding Processor', payrollSubTab === 'withholding', () => setPayrollSubTab('withholding'))}
        {subPill2('New Hire Checklist', payrollSubTab === 'checklist', () => setPayrollSubTab('checklist'))}
      </div>

      {payrollSubTab === 'withholding' && <WithholdingProcessorTab orgId={orgId} C={C} allResources={allResources} orders={orders} />}
      {payrollSubTab === 'checklist' && <NewHireChecklistTab orgId={orgId} C={C} />}

      {payrollSubTab === 'orders' && <div>

      {/* Header */}
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {['active', 'suspended', 'closed', 'all'].map(s => pill(s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1), filterStatus === s, () => setFilterStatus(s)))}
        {allTypes.length > 1 && <>
          <span style={{ width: 1, background: C.bdr, margin: '0 4px' }} />
          {pill('All Types', filterType === 'all', () => setFilterType('all'))}
          {allTypes.map(t => pill(t, filterType === t, () => setFilterType(t)))}
        </>}
      </div>

      {loading && <p style={{ fontSize: 12, color: C.g }}>Loading…</p>}

      {/* Order rows */}
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
                {/* Left accent */}
                <div style={{ width: 4, alignSelf: 'stretch', background: typeColor, borderRadius: 2, flexShrink: 0 }} />

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.w }}>{o.employee_name}</span>
                    <span style={{ fontSize: 10, background: typeColor + '33', color: typeColor, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>{o.payment_type}</span>
                    <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>● {o.status}</span>
                  </div>
                  {o.case_number && <div style={{ fontSize: 11, color: C.g, marginTop: 3 }}>Case: {o.case_number}</div>}
                  {o.destination && <div style={{ fontSize: 11, color: C.g, marginTop: 2 }}>→ {o.destination}</div>}
                  {o.notes && <div style={{ fontSize: 10, color: C.g, marginTop: 4, fontStyle: 'italic' }}>{o.notes}</div>}
                </div>

                {/* Right: amount + portal */}
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
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reference links */}
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
// Reads all iif_je_history rows for this org, groups by period,
// shows per-account totals, quarter rollups, and YTD summary.
function JEHistoryTab({ orgId, C }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [expanded, setExpanded] = useState({})   // { period: bool }
  const [filterYear, setFilterYear] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('iif_je_history')
        .select('*')
        .eq('org_id', orgId)
        .order('period', { ascending: true })
      if (err) { setError(err.message); setLoading(false); return }
      setRows(data || [])
      setLoading(false)
    }
    load()
  }, [orgId])

  // ── Derived data ──────────────────────────────────────────────────────────
  // Group rows by period → { period: { qbo_account: { dr, cr } } }
  const byPeriod = {}
  rows.forEach(r => {
    if (!byPeriod[r.period]) byPeriod[r.period] = {}
    const acct = r.qbo_account || r.source_account || '(unknown)'
    if (!byPeriod[r.period][acct]) byPeriod[r.period][acct] = { dr: 0, cr: 0 }
    if (r.amount >= 0) byPeriod[r.period][acct].dr += r.amount
    else               byPeriod[r.period][acct].cr += Math.abs(r.amount)
  })

  const periods = Object.keys(byPeriod).sort()

  // Available years for filter
  const years = [...new Set(periods.map(p => p.slice(0, 4)))].sort()

  const filteredPeriods = filterYear === 'all'
    ? periods
    : periods.filter(p => p.startsWith(filterYear))

  // Quarter buckets: Q1=01-03, Q2=04-06, Q3=07-09, Q4=10-12
  function getQuarter(period) {
    const m = parseInt(period.slice(5, 7))
    return `${period.slice(0, 4)}-Q${Math.ceil(m / 3)}`
  }

  // Build quarter → { acct: { dr, cr } } from filtered periods
  const byQuarter = {}
  filteredPeriods.forEach(p => {
    const q = getQuarter(p)
    if (!byQuarter[q]) byQuarter[q] = {}
    Object.entries(byPeriod[p]).forEach(([acct, v]) => {
      if (!byQuarter[q][acct]) byQuarter[q][acct] = { dr: 0, cr: 0 }
      byQuarter[q][acct].dr += v.dr
      byQuarter[q][acct].cr += v.cr
    })
  })

  // YTD (all filtered periods)
  const ytd = {}
  filteredPeriods.forEach(p => {
    Object.entries(byPeriod[p]).forEach(([acct, v]) => {
      if (!ytd[acct]) ytd[acct] = { dr: 0, cr: 0 }
      ytd[acct].dr += v.dr
      ytd[acct].cr += v.cr
    })
  })
  const ytdDr = Object.values(ytd).reduce((s, v) => s + v.dr, 0)
  const ytdCr = Object.values(ytd).reduce((s, v) => s + v.cr, 0)

  function toggle(p) { setExpanded(e => ({ ...e, [p]: !e[p] })) }

  const inputStyle = {
    background: C.bg, border: `1px solid ${C.bdr}`, color: C.w,
    borderRadius: 6, padding: '5px 10px', fontSize: 11,
    fontFamily: 'inherit',
  }

  // ── Reusable account breakdown table ──
  function AcctTable({ accts }) {
    const totalDr = Object.values(accts).reduce((s, v) => s + v.dr, 0)
    const totalCr = Object.values(accts).reduce((s, v) => s + v.cr, 0)
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.bdr}` }}>
            <th style={{ textAlign: 'left', color: C.g, padding: '4px 8px 4px 0', fontWeight: 600 }}>Account</th>
            <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 100 }}>Debit</th>
            <th style={{ textAlign: 'right', color: C.g, padding: '4px 0 4px 12px', width: 100 }}>Credit</th>
            <th style={{ textAlign: 'right', color: C.g, padding: '4px 0', width: 110 }}>Net</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(accts).sort(([a], [b]) => a.localeCompare(b)).map(([acct, v]) => {
            const net = v.dr - v.cr
            return (
              <tr key={acct} style={{ borderBottom: `1px solid ${C.bdrF}` }}>
                <td style={{ color: C.w, padding: '5px 8px 5px 0', wordBreak: 'break-word' }}>{acct}</td>
                <td style={{ textAlign: 'right', color: C.w, padding: '5px 0' }}>{v.dr > 0 ? fmt(v.dr) : ''}</td>
                <td style={{ textAlign: 'right', color: C.w, padding: '5px 0 5px 12px' }}>{v.cr > 0 ? fmt(v.cr) : ''}</td>
                <td style={{
                  textAlign: 'right', padding: '5px 0',
                  color: net > 0 ? '#6ab87a' : net < 0 ? '#e07070' : C.g,
                  fontWeight: 600,
                }}>{fmt(net)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `1px solid ${C.bdr}` }}>
            <td style={{ color: C.g, fontSize: 10, padding: '5px 0' }}>TOTALS</td>
            <td style={{ textAlign: 'right', color: C.go, fontWeight: 700, padding: '5px 0' }}>{fmt(totalDr)}</td>
            <td style={{ textAlign: 'right', color: C.go, fontWeight: 700, padding: '5px 0 5px 12px' }}>{fmt(totalCr)}</td>
            <td style={{
              textAlign: 'right', fontWeight: 700, padding: '5px 0',
              color: Math.abs(totalDr - totalCr) < 0.01 ? '#6ab87a' : '#e07070',
            }}>
              {fmt(totalDr - totalCr)} {Math.abs(totalDr - totalCr) < 0.01 ? '✓' : '⚠'}
            </td>
          </tr>
        </tfoot>
      </table>
    )
  }

  if (loading) return <p style={{ color: C.g, fontSize: 13 }}>Loading history…</p>
  if (error)   return <div style={{ color: '#e07070', fontSize: 12 }}>⚠ {error}</div>
  if (rows.length === 0) return (
    <div style={{ color: C.g, fontSize: 13, padding: 20, textAlign: 'center' }}>
      No posted history yet. Upload an IIF file in the JE Generator → IIF Factory tab to get started.
    </div>
  )

  return (
    <div>
      {/* Header bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 10, color: C.g, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Filter Year</label>
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={inputStyle}>
            <option value="all">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 11, color: C.g, paddingTop: 18 }}>
          {filteredPeriods.length} period{filteredPeriods.length !== 1 ? 's' : ''} · {rows.filter(r => filterYear === 'all' || r.period.startsWith(filterYear)).length} rows
        </div>
      </div>

      {/* ── YTD SUMMARY BANNER ── */}
      <div style={{
        background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10,
        padding: '14px 18px', marginBottom: 20,
        display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>
            {filterYear === 'all' ? 'All-Time' : filterYear} Total Debits
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6ab87a', fontFamily: "'DM Mono', monospace" }}>${fmt(ytdDr)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>
            {filterYear === 'all' ? 'All-Time' : filterYear} Total Credits
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e07070', fontFamily: "'DM Mono', monospace" }}>${fmt(ytdCr)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Net</div>
          <div style={{
            fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace",
            color: Math.abs(ytdDr - ytdCr) < 0.01 ? '#6ab87a' : C.go,
          }}>
            ${fmt(ytdDr - ytdCr)} {Math.abs(ytdDr - ytdCr) < 0.01 ? '✓ Balanced' : ''}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Periods Posted</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.go, fontFamily: "'DM Mono', monospace" }}>{filteredPeriods.length}</div>
        </div>
      </div>

      {/* ── QUARTER ROLLUPS ── */}
      {Object.keys(byQuarter).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.go, marginBottom: 12, letterSpacing: '0.5px' }}>
            QUARTER ROLLUPS
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(byQuarter).sort(([a], [b]) => a.localeCompare(b)).map(([q, accts]) => {
              const qDr = Object.values(accts).reduce((s, v) => s + v.dr, 0)
              const qCr = Object.values(accts).reduce((s, v) => s + v.cr, 0)
              const balanced = Math.abs(qDr - qCr) < 0.01
              return (
                <div key={q} style={{
                  background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10,
                  padding: '12px 16px', minWidth: 180, flex: '1 1 180px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.go, marginBottom: 6 }}>{q}</div>
                  <div style={{ fontSize: 11, color: C.g }}>DR: <span style={{ color: '#6ab87a', fontFamily: "'DM Mono', monospace" }}>${fmt(qDr)}</span></div>
                  <div style={{ fontSize: 11, color: C.g }}>CR: <span style={{ color: '#e07070', fontFamily: "'DM Mono', monospace" }}>${fmt(qCr)}</span></div>
                  <div style={{ fontSize: 10, color: balanced ? '#6ab87a' : '#e07070', marginTop: 6, fontWeight: 700 }}>
                    {balanced ? '✓ Balanced' : `⚠ Off by ${fmt(Math.abs(qDr - qCr))}`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PERIOD-BY-PERIOD DETAIL ── */}
      <div style={{ fontSize: 12, fontWeight: 700, color: C.go, marginBottom: 12, letterSpacing: '0.5px' }}>
        PERIOD DETAIL
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredPeriods.map(p => {
          const accts = byPeriod[p]
          const pDr = Object.values(accts).reduce((s, v) => s + v.dr, 0)
          const pCr = Object.values(accts).reduce((s, v) => s + v.cr, 0)
          const balanced = Math.abs(pDr - pCr) < 0.01
          const isOpen = expanded[p]
          const [year, month] = p.split('-')
          const monthName = MONTHS[parseInt(month) - 1]

          return (
            <div key={p} style={{
              background: C.bg2, border: `1px solid ${C.bdr}`, borderRadius: 10, overflow: 'hidden',
            }}>
              {/* Period header row — click to expand */}
              <div
                onClick={() => toggle(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', cursor: 'pointer',
                  background: isOpen ? C.gD : 'transparent',
                  borderBottom: isOpen ? `1px solid ${C.bdr}` : 'none',
                }}
              >
                <span style={{ fontSize: 12, color: C.g, width: 16 }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.go, minWidth: 130 }}>
                  {monthName} {year}
                </span>
                <span style={{ fontSize: 11, color: C.g, fontFamily: "'DM Mono', monospace" }}>
                  DR: <span style={{ color: '#6ab87a' }}>${fmt(pDr)}</span>
                  &nbsp;&nbsp;CR: <span style={{ color: '#e07070' }}>${fmt(pCr)}</span>
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  color: balanced ? '#6ab87a' : '#e07070',
                }}>
                  {balanced ? '✓ BALANCED' : `⚠ OFF ${fmt(Math.abs(pDr - pCr))}`}
                </span>
                <span style={{ fontSize: 10, color: C.g }}>
                  {getQuarter(p)}
                </span>
              </div>

              {/* Expanded account breakdown */}
              {isOpen && (
                <div style={{ padding: '12px 16px' }}>
                  <AcctTable accts={accts} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Sidebar note */}
      <div style={{
        marginTop: 24, padding: '10px 14px', borderLeft: `3px solid ${C.go}`,
        background: C.gD, borderRadius: '0 8px 8px 0',
        fontSize: 11, color: C.g, maxWidth: 560,
      }}>
        <strong style={{ color: C.go }}>Sidebar:</strong> Upload oldest period first — delta logic builds on what's already here. A balanced ✓ means debits equal credits for that period. Verify each period against your Excel before uploading the next one.
      </div>
    </div>
  )
}

export default function MoneyFlowModule({ orgId, C }) {
  const [tab, setTab] = useState('tasks')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterType, setFilterType] = useState('all')
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

  // JE Generator sub-tab
  const [jeSubTab, setJeSubTab] = useState('checklist')

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
      {/* Modal */}
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
          {pill('Monthly Close', tab === 'je', () => setTab('je'))}
          {pill('📋 JE History', tab === 'history', () => setTab('history'))}
          {pill('🔗 Resources', tab === 'resources', () => setTab('resources'))}
          {pill('💸 Payroll Payments', tab === 'payroll', () => setTab('payroll'))}
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

          {loading && <p style={{ color: C.g, fontSize: 13 }}>Loading tasks…</p>}
          {error && <div style={{ color: '#e07070', fontSize: 12, marginBottom: 12 }}>⚠ {error}</div>}

          {!loading && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {filtered.length === 0 && <p style={{ color: C.g, fontSize: 13 }}>No tasks match this filter.</p>}
              {filtered.map(task => (
                <TaskCard
                  key={task.id} task={task} C={C}
                  onToggleDone={toggleDone} onEdit={openEditTask}
                  allResources={allResources}
                />
              ))}
            </div>
          )}

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
        <div>
          {/* Sub-tab bar */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: `1px solid ${C.bdr}`, paddingBottom: 12 }}>
            {subPill('Close Checklist', jeSubTab === 'checklist', () => setJeSubTab('checklist'))}
            {subPill('IIF Factory', jeSubTab === 'iif', () => setJeSubTab('iif'))}
            {subPill('Recurring JEs', jeSubTab === 'recurring', () => setJeSubTab('recurring'))}
            {subPill('Amortization', jeSubTab === 'amort', () => setJeSubTab('amort'))}
          </div>

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
          {jeSubTab === 'amort' && <AmortizationTab C={C} />}
        </div>
      )}

      {/* ── RESOURCES TAB ── */}
      {tab === 'resources' && <ResourceLibraryTab orgId={orgId} C={C} />}

      {/* ── JE HISTORY TAB ── */}
      {tab === 'history' && <JEHistoryTab orgId={orgId} C={C} />}

      {/* ── PAYROLL PAYMENTS TAB ── */}
      {tab === 'payroll' && (
        <div style={{ position: 'relative' }}>
          <PayrollPaymentsTab orgId={orgId} C={C} employees={employees} allResources={allResources} />
          {!isAdmin && userEmail && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(10,14,22,0.82)',
              backdropFilter: 'blur(4px)',
              borderRadius: 10,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 28 }}>🔒</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.w }}>Admin Access Required</div>
              <div style={{ fontSize: 11, color: C.g }}>Payroll payment orders are restricted to administrators.</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
