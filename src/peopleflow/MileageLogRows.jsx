import { useState } from 'react'

// ── MileageLogRows ────────────────────────────────────────────────────────────
// Reusable repeating mileage entry rows for FlowSuite
// Props:
//   C       — FlowSuite theme object (required)
//   rows    — array of mileage row objects (controlled)
//   setRows — setter for rows array
//   rate    — mileage rate per mile (default: 0.725)
//   disabled — locks all inputs
// Row shape: { id, log_date, destination, description, miles }
// ─────────────────────────────────────────────────────────────────────────────

const RATE = 0.725 // 2026 IRS rate

const emptyRow = () => ({
  id: crypto.randomUUID(),
  log_date: '',
  destination: '',
  description: '',
  miles: '',
})

const inp = (C) => ({
  width: '100%',
  padding: '6px 8px',
  background: C.bg || '#0D1117',
  border: `1px solid ${C.bdr || '#374151'}`,
  borderRadius: 5,
  color: C.w || '#F9FAFB',
  fontSize: 11,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
})

export default function MileageLogRows({ C, rows, setRows, rate = RATE, disabled = false }) {

  const addRow = () => setRows(p => [...p, emptyRow()])

  const updateRow = (id, field, value) => {
    setRows(p => p.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const removeRow = (id) => {
    if (rows.length <= 1) return // always keep at least one
    setRows(p => p.filter(r => r.id !== id))
  }

  const totalMiles = rows.reduce((sum, r) => sum + (parseFloat(r.miles) || 0), 0)
  const totalReimbursement = totalMiles * rate

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr 1fr 80px 90px 28px',
        gap: 6,
        marginBottom: 4,
        paddingBottom: 4,
        borderBottom: `1px solid ${C.bdr || '#374151'}`,
      }}>
        {['Date', 'Destination/Event', 'Description', 'Miles', 'Total', ''].map((h, i) => (
          <div key={i} style={{ fontSize: 9, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row, idx) => {
        const rowTotal = (parseFloat(row.miles) || 0) * rate
        return (
          <div key={row.id} style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr 1fr 80px 90px 28px',
            gap: 6,
            marginBottom: 6,
            alignItems: 'center',
          }}>
            <input
              type="date"
              value={row.log_date}
              onChange={e => updateRow(row.id, 'log_date', e.target.value)}
              disabled={disabled}
              style={inp(C)}
            />
            <input
              type="text"
              value={row.destination}
              onChange={e => updateRow(row.id, 'destination', e.target.value)}
              placeholder="e.g. Home Depot - Burnsville"
              disabled={disabled}
              style={inp(C)}
            />
            <input
              type="text"
              value={row.description}
              onChange={e => updateRow(row.id, 'description', e.target.value)}
              placeholder="Brief description"
              disabled={disabled}
              style={inp(C)}
            />
            <input
              type="number"
              value={row.miles}
              onChange={e => updateRow(row.id, 'miles', e.target.value)}
              placeholder="0"
              min="0"
              step="0.1"
              disabled={disabled}
              style={{ ...inp(C), textAlign: 'right' }}
            />
            <div style={{
              fontSize: 11, color: rowTotal > 0 ? (C.go || '#F59E0B') : C.g,
              fontWeight: rowTotal > 0 ? 700 : 400,
              textAlign: 'right', padding: '6px 8px',
              background: C.ch || '#111827',
              border: `1px solid ${C.bdr || '#374151'}`,
              borderRadius: 5,
            }}>
              {rowTotal > 0 ? `$${rowTotal.toFixed(2)}` : '—'}
            </div>
            {!disabled && rows.length > 1
              ? <button
                  onClick={() => removeRow(row.id)}
                  style={{
                    background: 'none', border: 'none',
                    color: C.g, cursor: 'pointer', fontSize: 14,
                    padding: 0, lineHeight: 1, fontFamily: 'inherit',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.target.style.color = C.rd || '#EF4444'}
                  onMouseLeave={e => e.target.style.color = C.g}
                  title="Remove row"
                >✕</button>
              : <div />
            }
          </div>
        )
      })}

      {/* Add row + totals */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.bdr || '#374151'}` }}>
        {!disabled
          ? <button
              onClick={addRow}
              style={{
                fontSize: 11, color: C.go || '#F59E0B',
                background: 'none', border: `1px solid ${C.go || '#F59E0B'}`,
                borderRadius: 5, padding: '4px 12px',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.target.style.background = C.gD || 'rgba(245,158,11,0.1)' }}
              onMouseLeave={e => { e.target.style.background = 'none' }}
            >+ Add Trip</button>
          : <div />
        }

        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Miles</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.w || '#F9FAFB' }}>{totalMiles.toFixed(1)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>@ ${rate}/mi</div>
            <div style={{ fontSize: 9, color: C.g }}>2026 IRS rate</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reimbursement</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.go || '#F59E0B' }}>${totalReimbursement.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
