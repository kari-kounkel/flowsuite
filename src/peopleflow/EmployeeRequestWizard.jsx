import { useState, useEffect } from 'react'
import { supabase } from '../../supabase.js'
import SignaturePad from './SignaturePad.jsx'
import MileageLogRows from './MileageLogRows.jsx'

// ── EmployeeRequestWizard ─────────────────────────────────────────────────────
// Employee-facing request wizard: Expense / Mileage / Payroll Advance
// Lives in PaperFlow → Requests tab
// Props: orgId, C, user
// ─────────────────────────────────────────────────────────────────────────────

const TYPES = [
  { v: 'expense',  l: 'Expense Reimbursement', i: '🧾', desc: 'Submit a receipt for reimbursement' },
  { v: 'mileage',  l: 'Mileage Reimbursement',  i: '🚗', desc: 'Log trips for mileage reimbursement' },
  { v: 'advance',  l: 'Payroll Advance',         i: '💵', desc: 'Request an advance on your paycheck' },
]

const PAYMENT_METHODS = ['Direct Deposit', 'Check', 'Payroll']
const REFUND_METHODS  = [
  { v: 'payroll', l: 'Reimburse on Payroll (default)' },
  { v: 'cash',    l: 'Cash Reimbursement' },
]

const inp = (C) => ({
  width: '100%',
  padding: '8px 10px',
  background: C.ch || '#111827',
  border: `1px solid ${C.bdr || '#374151'}`,
  borderRadius: 6,
  color: C.w || '#F9FAFB',
  fontSize: 12,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
})

const label = (C, text, req) => (
  <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
    {text}{req && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
  </div>
)

const Field = ({ C, l, req, children, style }) => (
  <div style={{ marginBottom: 12, ...style }}>
    {label(C, l, req)}
    {children}
  </div>
)

export default function EmployeeRequestWizard({ orgId, C, user }) {
  const [employees, setEmployees]     = useState([])
  const [step, setStep]               = useState(1)   // 1=who, 2=type, 3=details, 4=sign, 5=done
  const [empId, setEmpId]             = useState('')
  const [type, setType]               = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [toast, setToast]             = useState('')

  // Expense fields
  const [expAmount, setExpAmount]     = useState('')
  const [expPurpose, setExpPurpose]   = useState('')
  const [expRefund, setExpRefund]     = useState('payroll')
  const [expFile, setExpFile]         = useState(null)
  const [expFileUrl, setExpFileUrl]   = useState('')

  // Mileage fields
  const [mileageRows, setMileageRows] = useState([{ id: crypto.randomUUID(), log_date: '', destination: '', description: '', miles: '' }])

  // Advance fields
  const [advAmount, setAdvAmount]     = useState('')
  const [advReason, setAdvReason]     = useState('')
  const [advMethod, setAdvMethod]     = useState('')

  // Signature
  const [sigDataUrl, setSigDataUrl]   = useState('')
  const [sigUrl, setSigUrl]           = useState('')

  const sh = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    if (!orgId) return
    supabase.from('employees').select('id,first_name,preferred_name,last_name,email,dept,status')
      .eq('org_id', orgId)
      .not('status', 'in', '("Terminated","Inactive")')
      .order('last_name')
      .then(({ data }) => setEmployees(data || []))
  }, [orgId])

  const gn = (e) => `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim()

  // ── Upload receipt file ──
  const uploadReceipt = async () => {
    if (!expFile) return null
    const ext  = expFile.name.split('.').pop()
    const path = `receipts/${orgId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('reimbursement-receipts').upload(path, expFile)
    if (error) { sh('Receipt upload failed'); return null }
    const { data } = supabase.storage.from('reimbursement-receipts').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Upload signature ──
  const uploadSignature = async () => {
    if (!sigDataUrl) return null
    const blob   = await fetch(sigDataUrl).then(r => r.blob())
    const path   = `signatures/${orgId}/${Date.now()}.png`
    const { error } = await supabase.storage.from('reimbursement-receipts').upload(path, blob, { contentType: 'image/png' })
    if (error) { sh('Signature upload failed'); return null }
    const { data } = supabase.storage.from('reimbursement-receipts').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Submit ──
  const handleSubmit = async () => {
    if (!sigDataUrl) { sh('Please sign before submitting'); return }
    setSubmitting(true)

    try {
      const sigUrl  = await uploadSignature()
      const fileUrl = type === 'expense' ? await uploadReceipt() : null

      // Parent record
      const { data: req, error: reqErr } = await supabase
        .from('employee_requests')
        .insert({ org_id: orgId, employee_id: empId, type, signature_url: sigUrl, signed_at: new Date().toISOString() })
        .select().single()

      if (reqErr) throw reqErr

      // Child record
      if (type === 'expense') {
        await supabase.from('expense_details').insert({
          request_id: req.id, amount: parseFloat(expAmount), purpose: expPurpose,
          refund_method: expRefund, receipt_url: fileUrl,
        })
      } else if (type === 'mileage') {
        const rows = mileageRows
          .filter(r => r.miles && r.log_date)
          .map(r => ({
            request_id: req.id,
            log_date: r.log_date,
            destination: r.destination,
            description: r.description,
            miles: parseFloat(r.miles),
            rate: 0.725,
          }))
        if (rows.length) await supabase.from('mileage_logs').insert(rows)
      } else if (type === 'advance') {
        await supabase.from('advance_details').insert({
          request_id: req.id, amount: parseFloat(advAmount),
          reason: advReason, payment_method: advMethod,
        })
      }

      setStep(5)
    } catch (e) {
      sh('Submission failed — ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setStep(1); setEmpId(''); setType('')
    setExpAmount(''); setExpPurpose(''); setExpRefund('payroll'); setExpFile(null); setExpFileUrl('')
    setMileageRows([{ id: crypto.randomUUID(), log_date: '', destination: '', description: '', miles: '' }])
    setAdvAmount(''); setAdvReason(''); setAdvMethod('')
    setSigDataUrl(''); setSigUrl('')
  }

  const canNext1 = empId !== ''
  const canNext2 = type !== ''
  const canNext3 = (() => {
    if (type === 'expense') return expAmount && expPurpose
    if (type === 'mileage') return mileageRows.some(r => r.miles && r.log_date)
    if (type === 'advance') return advAmount && advReason && advMethod
    return false
  })()

  const selectedEmp = employees.find(e => e.id === empId)
  const selectedType = TYPES.find(t => t.v === type)

  // ── Step indicator ──
  const StepDot = ({ n }) => (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700,
      background: step > n ? (C.go || '#F59E0B') : step === n ? 'rgba(245,158,11,0.2)' : C.ch,
      border: `1.5px solid ${step >= n ? (C.go || '#F59E0B') : (C.bdr || '#374151')}`,
      color: step > n ? C.bg : step === n ? (C.go || '#F59E0B') : C.g,
      transition: 'all 0.2s',
    }}>{step > n ? '✓' : n}</div>
  )

  const stepLabels = ['Who', 'What', 'Details', 'Sign', 'Done']

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* Step indicator */}
      {step < 5 && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 0 }}>
          {stepLabels.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 4 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <StepDot n={i + 1} />
                <div style={{ fontSize: 9, color: step === i + 1 ? (C.go || '#F59E0B') : C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              </div>
              {i < 4 && <div style={{ flex: 1, height: 1, background: step > i + 1 ? (C.go || '#F59E0B') : (C.bdr || '#374151'), margin: '0 6px 16px', transition: 'background 0.3s' }} />}
            </div>
          ))}
        </div>
      )}

      {/* ── Step 1: Who are you ── */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.w, marginBottom: 4 }}>Who are you?</div>
          <div style={{ fontSize: 12, color: C.g, marginBottom: 18 }}>Select your name to get started.</div>
          <Field C={C} l="Your Name" req>
            <select value={empId} onChange={e => setEmpId(e.target.value)} style={inp(C)}>
              <option value="">— Select your name —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{gn(e)} — {e.dept}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setStep(2)} disabled={!canNext1} style={{
              padding: '8px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: canNext1 ? (C.go || '#F59E0B') : C.bdr, color: canNext1 ? C.bg : C.g,
              border: 'none', cursor: canNext1 ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
            }}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 2: What type ── */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.w, marginBottom: 4 }}>What are you submitting?</div>
          <div style={{ fontSize: 12, color: C.g, marginBottom: 18 }}>
            Hi {selectedEmp ? gn(selectedEmp) : ''}! Choose your request type.
          </div>
          <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
            {TYPES.map(t => (
              <div key={t.v} onClick={() => setType(t.v)} style={{
                padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
                background: type === t.v ? 'rgba(245,158,11,0.08)' : C.ch,
                border: `1.5px solid ${type === t.v ? (C.go || '#F59E0B') : (C.bdr || '#374151')}`,
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ fontSize: 24 }}>{t.i}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: type === t.v ? (C.go || '#F59E0B') : C.w }}>{t.l}</div>
                  <div style={{ fontSize: 11, color: C.g, marginTop: 2 }}>{t.desc}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 16, color: type === t.v ? (C.go || '#F59E0B') : C.bdr }}>
                  {type === t.v ? '◉' : '○'}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(1)} style={{ padding: '8px 18px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, background: 'none', border: `1px solid ${C.bdr}`, color: C.g, cursor: 'pointer' }}>← Back</button>
            <button onClick={() => setStep(3)} disabled={!canNext2} style={{
              padding: '8px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: canNext2 ? (C.go || '#F59E0B') : C.bdr, color: canNext2 ? C.bg : C.g,
              border: 'none', cursor: canNext2 ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
            }}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Details ── */}
      {step === 3 && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.w, marginBottom: 2 }}>{selectedType?.l}</div>
          <div style={{ fontSize: 12, color: C.g, marginBottom: 18 }}>Fill in the details below.</div>

          {/* EXPENSE */}
          {type === 'expense' && (
            <div>
              <Field C={C} l="Amount (USD)" req>
                <input type="number" min="0" step="0.01" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="0.00" style={inp(C)} />
              </Field>
              <Field C={C} l="Purpose / Description" req>
                <textarea value={expPurpose} onChange={e => setExpPurpose(e.target.value)} rows={3} placeholder="Describe the expense and what it was for..." style={{ ...inp(C), resize: 'vertical' }} />
              </Field>
              <Field C={C} l="Reimbursement Method" req>
                {REFUND_METHODS.map(m => (
                  <label key={m.v} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="refund" value={m.v} checked={expRefund === m.v} onChange={() => setExpRefund(m.v)} style={{ accentColor: C.go || '#F59E0B' }} />
                    <span style={{ fontSize: 12, color: C.w }}>{m.l}</span>
                  </label>
                ))}
              </Field>
              <Field C={C} l="Receipt Upload">
                <input type="file" accept="image/*,.pdf" onChange={e => setExpFile(e.target.files[0])} style={{ fontSize: 11, color: C.g, fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: C.g, marginTop: 4 }}>Attach image or PDF. One receipt per submission.</div>
              </Field>
            </div>
          )}

          {/* MILEAGE */}
          {type === 'mileage' && (
            <div>
              <div style={{ fontSize: 11, color: C.g, marginBottom: 12, padding: '8px 12px', background: C.ch, borderRadius: 6, border: `1px solid ${C.bdr}` }}>
                Mileage is reimbursed at the <strong style={{ color: C.go }}>2026 IRS rate of $0.725/mile</strong>. Add each trip as a separate row.
              </div>
              <MileageLogRows C={C} rows={mileageRows} setRows={setMileageRows} rate={0.725} />
            </div>
          )}

          {/* ADVANCE */}
          {type === 'advance' && (
            <div>
              <div style={{ fontSize: 11, color: C.g, marginBottom: 12, padding: '8px 12px', background: C.ch, borderRadius: 6, border: `1px solid ${C.bdr}` }}>
                Advance requests are subject to approval. If approved, the amount will be deducted from your next scheduled paycheck.
              </div>
              <Field C={C} l="Advance Amount Requested (USD)" req>
                <input type="number" min="0" step="0.01" value={advAmount} onChange={e => setAdvAmount(e.target.value)} placeholder="0.00" style={inp(C)} />
              </Field>
              <Field C={C} l="Reason for Request" req>
                <textarea value={advReason} onChange={e => setAdvReason(e.target.value)} rows={3} placeholder="Please explain why you are requesting this advance..." style={{ ...inp(C), resize: 'vertical' }} />
              </Field>
              <Field C={C} l="Preferred Payment Method" req>
                <select value={advMethod} onChange={e => setAdvMethod(e.target.value)} style={inp(C)}>
                  <option value="">— Select method —</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <button onClick={() => setStep(2)} style={{ padding: '8px 18px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, background: 'none', border: `1px solid ${C.bdr}`, color: C.g, cursor: 'pointer' }}>← Back</button>
            <button onClick={() => setStep(4)} disabled={!canNext3} style={{
              padding: '8px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: canNext3 ? (C.go || '#F59E0B') : C.bdr, color: canNext3 ? C.bg : C.g,
              border: 'none', cursor: canNext3 ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
            }}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 4: Sign ── */}
      {step === 4 && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.w, marginBottom: 4 }}>Review & Sign</div>

          {/* Summary */}
          <div style={{ padding: '12px 14px', borderRadius: 8, background: C.ch, border: `1px solid ${C.bdr}`, marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: C.g, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Submission Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><div style={{ fontSize: 9, color: C.g }}>EMPLOYEE</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{selectedEmp ? gn(selectedEmp) : '—'}</div></div>
              <div><div style={{ fontSize: 9, color: C.g }}>TYPE</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{selectedType?.l}</div></div>
              {type === 'expense' && <><div><div style={{ fontSize: 9, color: C.g }}>AMOUNT</div><div style={{ fontSize: 12, color: C.go, fontWeight: 700 }}>${parseFloat(expAmount || 0).toFixed(2)}</div></div><div><div style={{ fontSize: 9, color: C.g }}>REFUND VIA</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{expRefund === 'payroll' ? 'Payroll' : 'Cash'}</div></div></>}
              {type === 'mileage' && <><div><div style={{ fontSize: 9, color: C.g }}>TOTAL MILES</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{mileageRows.reduce((s, r) => s + (parseFloat(r.miles) || 0), 0).toFixed(1)}</div></div><div><div style={{ fontSize: 9, color: C.g }}>REIMBURSEMENT</div><div style={{ fontSize: 12, color: C.go, fontWeight: 700 }}>${(mileageRows.reduce((s, r) => s + (parseFloat(r.miles) || 0), 0) * 0.725).toFixed(2)}</div></div></>}
              {type === 'advance' && <><div><div style={{ fontSize: 9, color: C.g }}>AMOUNT</div><div style={{ fontSize: 12, color: C.go, fontWeight: 700 }}>${parseFloat(advAmount || 0).toFixed(2)}</div></div><div><div style={{ fontSize: 9, color: C.g }}>PAYMENT</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{advMethod}</div></div></>}
            </div>
          </div>

          {/* Consent text */}
          <div style={{ fontSize: 11, color: C.g, lineHeight: 1.6, marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: C.ch, border: `1px solid ${C.bdr}` }}>
            By signing below, I certify that this {selectedType?.l.toLowerCase()} is accurate and legitimate, submitted in accordance with company policy, and authorized for reimbursement or advance against my payroll.
          </div>

          <SignaturePad
            C={C}
            label={`${selectedEmp ? gn(selectedEmp) : 'Employee'} Signature`}
            required
            onSign={setSigDataUrl}
            onClear={() => setSigDataUrl('')}
          />

          {toast && <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 8, fontWeight: 600 }}>{toast}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <button onClick={() => setStep(3)} style={{ padding: '8px 18px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, background: 'none', border: `1px solid ${C.bdr}`, color: C.g, cursor: 'pointer' }}>← Back</button>
            <button onClick={handleSubmit} disabled={!sigDataUrl || submitting} style={{
              padding: '8px 28px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: sigDataUrl && !submitting ? (C.go || '#F59E0B') : C.bdr,
              color: sigDataUrl && !submitting ? C.bg : C.g,
              border: 'none', cursor: sigDataUrl && !submitting ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
            }}>{submitting ? 'Submitting...' : 'Submit Request'}</button>
          </div>
        </div>
      )}

      {/* ── Step 5: Done ── */}
      {step === 5 && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.go || '#F59E0B', marginBottom: 8 }}>Request Submitted</div>
          <div style={{ fontSize: 13, color: C.g, marginBottom: 6 }}>
            Your <strong style={{ color: C.w }}>{selectedType?.l}</strong> has been submitted and is pending approval.
          </div>
          <div style={{ fontSize: 12, color: C.g, marginBottom: 28 }}>
            You'll be notified once it's been reviewed.
          </div>
          <button onClick={reset} style={{
            padding: '10px 28px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            background: C.go || '#F59E0B', color: C.bg, border: 'none', cursor: 'pointer',
          }}>Submit Another Request</button>
        </div>
      )}
    </div>
  )
}
