import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import SignaturePad from './SignaturePad.jsx'
import MileageLogRows from './MileageLogRows.jsx'

// ── EmployeeRequestWizard ─────────────────────────────────────────────────────
// Employee-facing request wizard: Expense / Mileage / Payroll Advance / 1099
// Lives in PaperFlow → Requests tab
// Props: orgId, C, user
// ─────────────────────────────────────────────────────────────────────────────

const TYPES = [
  { v: 'expense',  l: 'Expense Reimbursement',         i: '🧾', desc: 'Submit a receipt for reimbursement' },
  { v: 'mileage',  l: 'Mileage Reimbursement',          i: '🚗', desc: 'Log trips for mileage reimbursement' },
  { v: 'advance',  l: 'Payroll Advance',                i: '💵', desc: 'Request an advance on your paycheck' },
  { v: '1099',     l: 'Non-Employee Compensation (1099)', i: '📄', desc: 'Invoice for hourly work as a contractor' },
]

const ADVANCE_METHODS = ['Check', 'ACH / Direct Deposit']

const REFUND_METHODS = [
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
  const [employees, setEmployees]         = useState([])
  const [step, setStep]                   = useState(1)   // 1=who, 2=type, 3=details, 4=sign, 5=done
  const [empId, setEmpId]                 = useState('')
  const [type, setType]                   = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [toast, setToast]                 = useState('')
  const [priorRequests, setPriorRequests] = useState([])

  // Expense fields
  const [expAmount, setExpAmount]   = useState('')
  const [expPurpose, setExpPurpose] = useState('')
  const [expRefund, setExpRefund]   = useState('payroll')
  const [expFile, setExpFile]       = useState(null)
  const [expFileUrl, setExpFileUrl] = useState('')

  // Mileage fields
  const [mileageRows, setMileageRows] = useState([{ id: crypto.randomUUID(), log_date: '', destination: '', description: '', miles: '' }])

  // Advance fields
  const [advAmount, setAdvAmount]   = useState('')
  const [advReason, setAdvReason]   = useState('')
  const [advMethod, setAdvMethod]   = useState('')

  // Repayment schedule
  const [repayPlan, setRepayPlan]   = useState('') // 'lump' | 'split' | 'custom'
  const [repayInstallments, setRepayInstallments] = useState([
    { id: 1, amount: '', date: '' },
    { id: 2, amount: '', date: '' },
    { id: 3, amount: '', date: '' },
  ])

  // ACH banking fields (collected only on first ACH request)
  const [bankRoutingNo, setBankRoutingNo] = useState('')
  const [bankAccountNo, setBankAccountNo] = useState('')
  const [bankName, setBankName]           = useState('')
  const [bankAccountType, setBankAccountType] = useState('checking')
  const [hasBankingOnFile, setHasBankingOnFile] = useState(false)
  const [checkingBanking, setCheckingBanking] = useState(false)

  // 1099 / Non-Employee Compensation fields
  const [nec1099HourlyRate, setNec1099HourlyRate]   = useState('')
  const [nec1099Hours, setNec1099Hours]             = useState('')
  const [nec1099Description, setNec1099Description] = useState('')
  const [nec1099PeriodStart, setNec1099PeriodStart] = useState('')
  const [nec1099PeriodEnd, setNec1099PeriodEnd]     = useState('')

  // Signature
  const [sigDataUrl, setSigDataUrl] = useState('')
  const [sigUrl, setSigUrl]         = useState('')

  const sh = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    if (!orgId) return
    supabase.from('employees').select('id,first_name,preferred_name,last_name,email,dept,status')
      .eq('org_id', orgId)
      .not('status', 'in', '("Terminated","Inactive")')
      .order('last_name')
      .then(({ data }) => setEmployees(data || []))
  }, [orgId])

  // When employee changes, check if they have prior ACH requests (banking on file)
  useEffect(() => {
    if (!empId || !orgId) { setHasBankingOnFile(false); setPriorRequests([]); return }
    setCheckingBanking(true)
    supabase
      .from('employee_requests')
      .select('id, type, advance_details(payment_method, bank_routing_no)')
      .eq('org_id', orgId)
      .eq('employee_id', empId)
      .then(({ data }) => {
        const reqs = data || []
        setPriorRequests(reqs)
        // Check if any prior advance used ACH and had banking info saved
        const hasACH = reqs.some(r =>
          r.type === 'advance' &&
          r.advance_details?.some(d => d.payment_method === 'ACH / Direct Deposit' && d.bank_routing_no)
        )
        setHasBankingOnFile(hasACH)
        setCheckingBanking(false)
      })
  }, [empId, orgId])

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
    const blob = await fetch(sigDataUrl).then(r => r.blob())
    const path = `signatures/${orgId}/${Date.now()}.png`
    const { error } = await supabase.storage.from('reimbursement-receipts').upload(path, blob, { contentType: 'image/png' })
    if (error) { sh('Signature upload failed'); return null }
    const { data } = supabase.storage.from('reimbursement-receipts').getPublicUrl(path)
    return data.publicUrl
  }

  const needsBankingInfo = advMethod === 'ACH / Direct Deposit' && !hasBankingOnFile

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
        const amt = parseFloat(advAmount)
        const schedule = repayPlan === 'lump'
          ? [{ amount: amt, date: repayInstallments[0].date }]
          : repayPlan === 'split'
            ? [{ amount: parseFloat(repayInstallments[0].amount), date: repayInstallments[0].date }, { amount: parseFloat(repayInstallments[1].amount), date: repayInstallments[1].date }]
            : repayInstallments.filter(r => r.amount && r.date).map(r => ({ amount: parseFloat(r.amount), date: r.date }))
        await supabase.from('advance_details').insert({
          request_id: req.id,
          amount: amt,
          reason: advReason,
          payment_method: advMethod,
          repayment_plan: repayPlan,
          repayment_schedule: schedule,
          ...(needsBankingInfo ? {
            bank_name: bankName,
            bank_routing_no: bankRoutingNo,
            bank_account_no: bankAccountNo,
            bank_account_type: bankAccountType,
          } : {}),
        })
      } else if (type === '1099') {
        const hours = parseFloat(nec1099Hours) || 0
        const rate  = parseFloat(nec1099HourlyRate) || 0
        await supabase.from('advance_details').insert({
          request_id: req.id,
          amount: parseFloat((hours * rate).toFixed(2)),
          reason: `1099 NEC — ${nec1099Description}`,
          payment_method: 'Check',
          nec_hourly_rate: rate,
          nec_hours: hours,
          nec_period_start: nec1099PeriodStart,
          nec_period_end: nec1099PeriodEnd,
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
    setRepayPlan('')
    setRepayInstallments([{ id: 1, amount: '', date: '' }, { id: 2, amount: '', date: '' }, { id: 3, amount: '', date: '' }])
    setBankRoutingNo(''); setBankAccountNo(''); setBankName(''); setBankAccountType('checking')
    setNec1099HourlyRate(''); setNec1099Hours(''); setNec1099Description(''); setNec1099PeriodStart(''); setNec1099PeriodEnd('')
    setSigDataUrl(''); setSigUrl('')
  }

  const canNext1 = empId !== ''
  const canNext2 = type !== ''
  const canNext3 = (() => {
    if (type === 'expense') return expAmount && expPurpose
    if (type === 'mileage') return mileageRows.some(r => r.miles && r.log_date)
    if (type === 'advance') {
      const baseOk = advAmount && advReason && advMethod
      if (!baseOk) return false
      if (needsBankingInfo && !(bankRoutingNo && bankAccountNo && bankName)) return false
      if (!repayPlan) return false
      const amt = parseFloat(advAmount) || 0
      if (repayPlan === 'lump') {
        const r = repayInstallments[0]
        return r.date !== ''
      }
      if (repayPlan === 'split') {
        const [a, b] = repayInstallments
        const total = (parseFloat(a.amount) || 0) + (parseFloat(b.amount) || 0)
        return a.date && b.date && Math.abs(total - amt) < 0.01
      }
      if (repayPlan === 'custom') {
        const active = repayInstallments.filter(r => r.amount || r.date)
        if (active.length < 2) return false
        const total = active.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
        return active.every(r => r.amount && r.date) && Math.abs(total - amt) < 0.01
      }
      return false
    }
    if (type === '1099') return nec1099HourlyRate && nec1099Hours && nec1099Description && nec1099PeriodStart && nec1099PeriodEnd
    return false
  })()

  const selectedEmp  = employees.find(e => e.id === empId)
  const selectedType = TYPES.find(t => t.v === type)
  const nec1099Total = ((parseFloat(nec1099Hours) || 0) * (parseFloat(nec1099HourlyRate) || 0)).toFixed(2)

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
                {ADVANCE_METHODS.map(m => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="advMethod" value={m} checked={advMethod === m} onChange={() => setAdvMethod(m)} style={{ accentColor: C.go || '#F59E0B' }} />
                    <span style={{ fontSize: 12, color: C.w }}>{m}</span>
                    {m === 'ACH / Direct Deposit' && hasBankingOnFile && (
                      <span style={{ fontSize: 10, color: C.gr, marginLeft: 4 }}>✓ banking on file</span>
                    )}
                  </label>
                ))}
              </Field>

              {/* ACH banking collection — only if first-time ACH */}
              {needsBankingInfo && (
                <div style={{ marginTop: 4, padding: '14px 16px', borderRadius: 8, background: 'rgba(59,130,246,0.07)', border: `1px solid ${C.bl || '#3B82F6'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.bl || '#3B82F6', marginBottom: 10 }}>
                    🏦 First-time ACH — Banking Information Required
                  </div>
                  <div style={{ fontSize: 10, color: C.g, marginBottom: 12, lineHeight: 1.5 }}>
                    We'll save this securely so you won't need to enter it again on future requests.
                  </div>
                  <Field C={C} l="Bank Name" req>
                    <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. Wells Fargo" style={inp(C)} />
                  </Field>
                  <Field C={C} l="Account Type" req>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {['checking', 'savings'].map(t => (
                        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="radio" name="bankAccountType" value={t} checked={bankAccountType === t} onChange={() => setBankAccountType(t)} style={{ accentColor: C.go || '#F59E0B' }} />
                          <span style={{ fontSize: 12, color: C.w, textTransform: 'capitalize' }}>{t}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field C={C} l="Routing Number (9 digits)" req>
                    <input type="text" inputMode="numeric" maxLength={9} value={bankRoutingNo} onChange={e => setBankRoutingNo(e.target.value.replace(/\D/g, ''))} placeholder="123456789" style={inp(C)} />
                  </Field>
                  <Field C={C} l="Account Number" req>
                    <input type="text" inputMode="numeric" value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value.replace(/\D/g, ''))} placeholder="••••••••••" style={inp(C)} />
                  </Field>
                </div>
              )}

              {/* Repayment Schedule */}
              {advAmount && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                    Repayment Plan <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>
                  </div>
                  <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                    {[
                      { v: 'lump',   l: 'Full lump sum',              d: 'Repay the full amount on one date' },
                      { v: 'split',  l: '50 / 50 split',              d: 'Half on one paycheck, half on the next' },
                      { v: 'custom', l: 'Custom (up to 3 payments)',   d: 'Set your own amounts and dates' },
                    ].map(opt => (
                      <div key={opt.v} onClick={() => setRepayPlan(opt.v)} style={{
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        background: repayPlan === opt.v ? 'rgba(245,158,11,0.08)' : C.ch,
                        border: `1.5px solid ${repayPlan === opt.v ? (C.go || '#F59E0B') : (C.bdr || '#374151')}`,
                        display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
                      }}>
                        <div style={{ fontSize: 14, color: repayPlan === opt.v ? (C.go || '#F59E0B') : C.bdr }}>
                          {repayPlan === opt.v ? '◉' : '○'}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: repayPlan === opt.v ? (C.go || '#F59E0B') : C.w }}>{opt.l}</div>
                          <div style={{ fontSize: 10, color: C.g }}>{opt.d}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* LUMP SUM */}
                  {repayPlan === 'lump' && (
                    <div style={{ padding: '12px 14px', borderRadius: 8, background: C.ch, border: `1px solid ${C.bdr}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field C={C} l="Full Amount" req>
                          <input type="number" value={advAmount} disabled style={{ ...inp(C), opacity: 0.6 }} />
                        </Field>
                        <Field C={C} l="Repayment Date" req>
                          <input type="date" value={repayInstallments[0].date}
                            onChange={e => setRepayInstallments(p => p.map((r, i) => i === 0 ? { ...r, date: e.target.value } : r))}
                            style={inp(C)} />
                        </Field>
                      </div>
                    </div>
                  )}

                  {/* 50/50 SPLIT */}
                  {repayPlan === 'split' && (() => {
                    const half = advAmount ? (parseFloat(advAmount) / 2).toFixed(2) : ''
                    const total = (parseFloat(repayInstallments[0].amount) || 0) + (parseFloat(repayInstallments[1].amount) || 0)
                    const advAmt = parseFloat(advAmount) || 0
                    const balanced = Math.abs(total - advAmt) < 0.01
                    return (
                      <div style={{ padding: '12px 14px', borderRadius: 8, background: C.ch, border: `1px solid ${C.bdr}` }}>
                        {[0, 1].map(i => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: i === 0 ? 10 : 0 }}>
                            <Field C={C} l={`Payment ${i + 1} Amount`} req>
                              <input type="number" min="0" step="0.01"
                                value={repayInstallments[i].amount || half}
                                onChange={e => setRepayInstallments(p => p.map((r, idx) => idx === i ? { ...r, amount: e.target.value } : r))}
                                placeholder={half} style={inp(C)} />
                            </Field>
                            <Field C={C} l={`Payment ${i + 1} Date`} req>
                              <input type="date" value={repayInstallments[i].date}
                                onChange={e => setRepayInstallments(p => p.map((r, idx) => idx === i ? { ...r, date: e.target.value } : r))}
                                style={inp(C)} />
                            </Field>
                          </div>
                        ))}
                        {!balanced && repayInstallments[0].amount && repayInstallments[1].amount && (
                          <div style={{ fontSize: 10, color: '#EF4444', marginTop: 6 }}>
                            ⚠ Amounts must total ${parseFloat(advAmount).toFixed(2)} — currently ${total.toFixed(2)}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* CUSTOM */}
                  {repayPlan === 'custom' && (() => {
                    const total = repayInstallments.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
                    const advAmt = parseFloat(advAmount) || 0
                    const balanced = Math.abs(total - advAmt) < 0.01
                    const active = repayInstallments.filter(r => r.amount || r.date)
                    return (
                      <div style={{ padding: '12px 14px', borderRadius: 8, background: C.ch, border: `1px solid ${C.bdr}` }}>
                        {repayInstallments.map((r, i) => (
                          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: i < 2 ? 10 : 0 }}>
                            <Field C={C} l={`Payment ${i + 1} Amount`}>
                              <input type="number" min="0" step="0.01" value={r.amount}
                                onChange={e => setRepayInstallments(p => p.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))}
                                placeholder="0.00" style={inp(C)} />
                            </Field>
                            <Field C={C} l={`Payment ${i + 1} Date`}>
                              <input type="date" value={r.date}
                                onChange={e => setRepayInstallments(p => p.map((x, idx) => idx === i ? { ...x, date: e.target.value } : x))}
                                style={inp(C)} />
                            </Field>
                          </div>
                        ))}
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: C.g }}>
                            Total: <strong style={{ color: balanced ? C.gr : '#EF4444' }}>${total.toFixed(2)}</strong>
                            {' '}/ ${parseFloat(advAmount).toFixed(2)} required
                          </span>
                          {balanced && <span style={{ fontSize: 10, color: C.gr }}>✓ balanced</span>}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* 1099 NON-EMPLOYEE COMPENSATION */}
          {type === '1099' && (
            <div>
              <div style={{ fontSize: 11, color: C.g, marginBottom: 12, padding: '8px 12px', background: C.ch, borderRadius: 6, border: `1px solid ${C.bdr}` }}>
                For contractors and non-employees paid hourly. Payment is by check. A 1099-NEC will be issued if your annual total exceeds $600.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field C={C} l="Hourly Rate (USD)" req>
                  <input type="number" min="0" step="0.01" value={nec1099HourlyRate} onChange={e => setNec1099HourlyRate(e.target.value)} placeholder="0.00" style={inp(C)} />
                </Field>
                <Field C={C} l="Hours Worked" req>
                  <input type="number" min="0" step="0.25" value={nec1099Hours} onChange={e => setNec1099Hours(e.target.value)} placeholder="0.00" style={inp(C)} />
                </Field>
              </div>
              {nec1099HourlyRate && nec1099Hours && (
                <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: `1px solid ${C.go}`, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Due</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.go }}>${nec1099Total}</div>
                  <div style={{ fontSize: 10, color: C.g }}>{nec1099Hours} hrs × ${nec1099HourlyRate}/hr</div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field C={C} l="Work Period Start" req>
                  <input type="date" value={nec1099PeriodStart} onChange={e => setNec1099PeriodStart(e.target.value)} style={inp(C)} />
                </Field>
                <Field C={C} l="Work Period End" req>
                  <input type="date" value={nec1099PeriodEnd} onChange={e => setNec1099PeriodEnd(e.target.value)} style={inp(C)} />
                </Field>
              </div>
              <Field C={C} l="Description of Work" req>
                <textarea value={nec1099Description} onChange={e => setNec1099Description(e.target.value)} rows={3} placeholder="Describe the work performed during this period..." style={{ ...inp(C), resize: 'vertical' }} />
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
              {type === 'expense' && <>
                <div><div style={{ fontSize: 9, color: C.g }}>AMOUNT</div><div style={{ fontSize: 12, color: C.go, fontWeight: 700 }}>${parseFloat(expAmount || 0).toFixed(2)}</div></div>
                <div><div style={{ fontSize: 9, color: C.g }}>REFUND VIA</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{expRefund === 'payroll' ? 'Payroll' : 'Cash'}</div></div>
              </>}
              {type === 'mileage' && <>
                <div><div style={{ fontSize: 9, color: C.g }}>TOTAL MILES</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{mileageRows.reduce((s, r) => s + (parseFloat(r.miles) || 0), 0).toFixed(1)}</div></div>
                <div><div style={{ fontSize: 9, color: C.g }}>REIMBURSEMENT</div><div style={{ fontSize: 12, color: C.go, fontWeight: 700 }}>${(mileageRows.reduce((s, r) => s + (parseFloat(r.miles) || 0), 0) * 0.725).toFixed(2)}</div></div>
              </>}
              {type === 'advance' && <>
                <div><div style={{ fontSize: 9, color: C.g }}>AMOUNT</div><div style={{ fontSize: 12, color: C.go, fontWeight: 700 }}>${parseFloat(advAmount || 0).toFixed(2)}</div></div>
                <div><div style={{ fontSize: 9, color: C.g }}>PAYMENT</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{advMethod}</div></div>
                {needsBankingInfo && bankName && (
                  <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 9, color: C.g }}>BANK</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{bankName} ({bankAccountType}) — routing on file</div></div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 9, color: C.g, marginBottom: 4 }}>REPAYMENT SCHEDULE</div>
                  {repayPlan === 'lump' && (
                    <div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>Full ${parseFloat(advAmount || 0).toFixed(2)} on {repayInstallments[0].date || '—'}</div>
                  )}
                  {repayPlan === 'split' && (
                    <div style={{ fontSize: 12, color: C.w }}>
                      <div>${repayInstallments[0].amount || (parseFloat(advAmount)/2).toFixed(2)} on {repayInstallments[0].date || '—'}</div>
                      <div>${repayInstallments[1].amount || (parseFloat(advAmount)/2).toFixed(2)} on {repayInstallments[1].date || '—'}</div>
                    </div>
                  )}
                  {repayPlan === 'custom' && (
                    <div style={{ fontSize: 12, color: C.w }}>
                      {repayInstallments.filter(r => r.amount && r.date).map((r, i) => (
                        <div key={i}>${parseFloat(r.amount).toFixed(2)} on {r.date}</div>
                      ))}
                    </div>
                  )}
                </div>
              </>}
              {type === '1099' && <>
                <div><div style={{ fontSize: 9, color: C.g }}>HOURS</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{nec1099Hours} hrs @ ${nec1099HourlyRate}/hr</div></div>
                <div><div style={{ fontSize: 9, color: C.g }}>TOTAL DUE</div><div style={{ fontSize: 12, color: C.go, fontWeight: 700 }}>${nec1099Total}</div></div>
                <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: 9, color: C.g }}>PERIOD</div><div style={{ fontSize: 12, color: C.w, fontWeight: 600 }}>{nec1099PeriodStart} → {nec1099PeriodEnd}</div></div>
              </>}
            </div>
          </div>

          {/* Consent text */}
          <div style={{ fontSize: 11, color: C.g, lineHeight: 1.6, marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: C.ch, border: `1px solid ${C.bdr}` }}>
            By signing below, I certify that this {selectedType?.l.toLowerCase()} is accurate and legitimate, submitted in accordance with company policy
            {type === 'advance' ? ', and authorized for advance against my payroll.' : '.'}
            {type === '1099' ? ' I understand that non-employee compensation may be reported on IRS Form 1099-NEC.' : ''}
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
