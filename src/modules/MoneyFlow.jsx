import { useState } from 'react'

// ─── SEED TASK CARDS ─────────────────────────────────────────────────────────
// Replace or extend this array as needed. Nothing hardwired to MMP forever.
const SEED_TASKS = [
  {
    id: 1,
    entity: 'omega',
    type: 'AP',
    name: 'Property Taxes 2024',
    dueDate: '2026-03-15',
    description: 'Confirm 2024 property taxes were paid. Post payment entry if needed.',
    resources: 'DR 20000 Accounts Payable / CR 10100 Checking Old National',
    docs: 'Hennepin County tax records 2024',
    status: 'open',
  },
  {
    id: 2,
    entity: 'omega',
    type: 'AP',
    name: 'Property Taxes 2025',
    dueDate: '2026-04-01',
    description: 'Obtain Hennepin County bills for 4024 & 4026 Washington. Record expense.',
    resources: 'DR 69060 Property Taxes / CR 20000 Accounts Payable',
    docs: 'Hennepin County bills — 4024 Washington, 4026 Washington',
    status: 'open',
  },
  {
    id: 3,
    entity: 'omega',
    type: 'Admin',
    name: 'Hub COA Cleanup',
    dueDate: '2026-03-31',
    description: 'Audit and clean Omega chart of accounts. Add 66500 Management Fees. Remove orphaned accounts.',
    resources: 'QBO Chart of Accounts — Omega',
    docs: 'Current COA export from QBO',
    status: 'open',
  },
  {
    id: 4,
    entity: 'omega',
    type: 'Admin',
    name: 'Management Agreement',
    dueDate: '2026-04-15',
    description: 'Finalize management agreement between CARES Consulting Inc. and Omega.',
    resources: 'Account 66500 Management Fees (add to COA first)',
    docs: 'Draft management agreement',
    status: 'open',
  },
  {
    id: 5,
    entity: 'iaz',
    type: 'Admin',
    name: 'Remaining Month-End Entries',
    dueDate: '2026-03-31',
    description: 'Complete remaining IAZ month-end journal entries after Omega close is finished.',
    resources: 'QBO — I A Z Corporation dba Minuteman Press Uptown',
    docs: 'Flex AR report, bank statements',
    status: 'open',
  },
]

// ─── RECURRING JE DEFINITIONS ────────────────────────────────────────────────
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

// ─── FLIP CARD ───────────────────────────────────────────────────────────────
function TaskCard({ task, C, onToggleDone }) {
  const [flipped, setFlipped] = useState(false)
  const ec = ENTITY_COLORS[task.entity]
  const tc = TYPE_COLORS[task.type]
  const done = task.status === 'done'

  return (
    <div
      onClick={() => setFlipped(f => !f)}
      style={{
        width: 200, height: 220, cursor: 'pointer', perspective: 800,
        opacity: done ? 0.5 : 1, transition: 'opacity 0.3s',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        transformStyle: 'preserve-3d',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        transition: 'transform 0.45s cubic-bezier(.4,0,.2,1)',
      }}>
        {/* FRONT */}
        <div style={{
          position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
          borderRadius: 12, overflow: 'hidden',
          background: C.bg2,
          border: `1px solid ${C.bdr}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Entity color bar */}
          <div style={{ background: ec.bg, height: 8, width: '100%' }} />
          {/* Type accent stripe */}
          <div style={{
            background: tc, height: 3, width: '100%',
            marginBottom: 2,
          }} />
          <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Entity + type badges */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
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
            {/* Task name */}
            <div style={{
              fontSize: 13, fontWeight: 600, color: C.w,
              lineHeight: 1.3, flex: 1,
            }}>{task.name}</div>
            {/* Due date */}
            <div style={{ fontSize: 10, color: C.g, fontFamily: "'DM Mono', monospace" }}>
              Due {task.dueDate}
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
              onClick={e => { e.stopPropagation(); onToggleDone(task.id) }}
              style={{
                background: done ? C.gD : ec.bg,
                color: done ? C.g : '#fff',
                border: 'none', borderRadius: 6, padding: '5px 0',
                fontSize: 10, fontWeight: 700, cursor: 'pointer', width: '100%',
              }}
            >{done ? '↩ Reopen' : '✓ Mark Done'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── JE DISPLAY ──────────────────────────────────────────────────────────────
function JEOutput({ je, month, year, utilAmounts }) {
  const mm = mmPad(month)
  const journalNum = `KK ${je.code} ${year} ${mm}`
  const monthName = MONTHS[month - 1]

  // Resolve lines (utilities need live amounts)
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
      {/* Header */}
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

      {/* Lines table */}
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
  const [tasks, setTasks] = useState(SEED_TASKS)
  const [filterEntity, setFilterEntity] = useState('all')
  const [filterType, setFilterType] = useState('all')

  // JE Generator state
  const [selectedJE, setSelectedJE] = useState(RECURRING_JES[0].id)
  const [jeMonth, setJeMonth] = useState(new Date().getMonth() + 1)
  const [jeYear, setJeYear] = useState(new Date().getFullYear())
  const [utilAmounts, setUtilAmounts] = useState({ xcel: '', cp: '', water: '' })

  function toggleDone(id) {
    setTasks(ts => ts.map(t => t.id === id
      ? { ...t, status: t.status === 'done' ? 'open' : 'done' }
      : t
    ))
  }

  const filtered = tasks.filter(t => {
    if (filterEntity !== 'all' && t.entity !== filterEntity) return false
    if (filterType !== 'all' && t.type !== filterType) return false
    return true
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate))

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
          {/* Filters */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
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
          </div>

          {/* Cards */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {filtered.length === 0 && (
              <p style={{ color: C.g, fontSize: 13 }}>No tasks match this filter.</p>
            )}
            {filtered.map(task => (
              <TaskCard key={task.id} task={task} C={C} onToggleDone={toggleDone} />
            ))}
          </div>

          {/* Sidebar note */}
          <div style={{
            marginTop: 24, padding: '10px 14px', borderLeft: `3px solid ${C.go}`,
            background: (C.gD), borderRadius: '0 8px 8px 0',
            fontSize: 11, color: C.g, maxWidth: 500,
          }}>
            <strong style={{ color: C.go }}>Sidebar:</strong> Flip a card to see accounts + docs needed. Mark done when posted. Nothing leaves until QBO says so.
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

            {/* JE type selector */}
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

            {/* Month/Year */}
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

            {/* Utility amounts if UTIL selected */}
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
