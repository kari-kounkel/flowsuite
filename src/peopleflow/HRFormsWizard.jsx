import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import SignaturePad from './SignaturePad.jsx'

// ── HRFormsWizard ─────────────────────────────────────────────────────────────
// HR-initiated forms: Withholding / Deduction / Cash Reimbursement
// Gated to HR_EMAILS. Lives in PaperFlow → Requests tab (HR view)
// Props: orgId, C, user
// ─────────────────────────────────────────────────────────────────────────────

const HR_EMAILS = ['kari@karikounkel.com', 'operationsmanager@mpuptown.com']

const FORM_TYPES = [
  { v: 'withholding',        l: 'Payroll Withholding Notification', i: '📋', desc: 'Notify employee of required payroll withholdings' },
  { v: 'deduction',          l: 'Payroll Deduction Authorization',  i: '✂️',  desc: 'Authorize a voluntary or required deduction' },
  { v: 'cash_reimbursement', l: 'Cash Reimbursement',               i: '💵', desc: 'Acknowledge a cash reimbursement to employee' },
]

const DEDUCTION_TYPES = ['Health Insurance', 'Dental Insurance', 'Vision Insurance', 'Union Dues', 'Pension/Retirement', 'LegalShield', 'Sam\'s Club Membership', 'Other']
const SCHEDULES       = [{ v: 'one_time', l: 'One time, from next paycheck' }, { v: 'two_installments', l: 'Two installments beginning next paycheck' }]
const WITHHOLDING_TYPES = ['Union Dues', 'Pension/Retirement', 'Health Insurance', 'Dental Insurance', 'Vision Insurance', 'Garnishment', 'Child Support', 'Tax Levy', 'Other']
const FREQUENCIES     = ['Per Pay Period', 'Monthly', 'One Time']
const PAYMENT_MODES   = ['Cash', 'Check', 'Direct Deposit']

const inp = (C) => ({
  width: '100%', padding: '8px 10px',
  background: C.ch || '#111827', border: `1px solid ${C.bdr || '#374151'}`,
  borderRadius: 6, color: C.w || '#F9FAFB', fontSize: 12,
  fontFamily: 'inherit', boxSizing: 'border-box',
})

const Field = ({ C, l, req, children, half }) => (
  <div style={{ marginBottom: 12, ...(half ? { flex: 1 } : {}) }}>
    <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
      {l}{req && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
    </div>
    {children}
  </div>
)

const emptyWHRow = () => ({ id: crypto.randomUUID(), type: '', amount: '', frequency: '', effective_date: '' })

export default function HRFormsWizard({ orgId, C, user }) {
  const isHR = HR_EMAILS.includes(user?.email)

  const [employees, setEmployees]   = useState([])
  const [step, setStep]             = useState(1)
  const [empId, setEmpId]           = useState('')
  const [formType, setFormType]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast]           = useState('')

  // Withholding fields
  const [whRows, setWhRows]           = useState([emptyWHRow()])
  const [unionDues, setUnionDues]     = useState('')
  const [pension, setPension]         = useState('')
  const [garnishment, setGarnishment] = useState('')
  const [childSupport, setChildSupport] = useState('')
  const [taxLevy, setTaxLevy]         = useState('')
  const [otherDesc, setOtherDesc]     = useState('')
  const [otherAmt, setOtherAmt]       = useState('')

  // Deduction fields
  const [dedType, setDedType]       = useState('')
  const [dedAmount, setDedAmount]   = useState('')
  const [dedSchedule, setDedSchedule] = useState('')

  // Cash reimbursement fields
  const [cashAmount, setCashAmount]   = useState('')
  const [cashPurpose, setCashPurpose] = useState('')
  const [cashMode, setCashMode]       = useState('payroll')

  // Signatures
  const [empSigUrl, setEmpSigUrl]   = useState('')
  const [hrSigUrl, setHrSigUrl]     = useState('')

  const sh = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    if (!orgId || !isHR) return
    supabase.from('employees').select('id,first_name,preferred_name,last_name,dept,email,status')
      .eq('org_id', orgId).not('status', 'in', '("Terminated","Inactive")').order('last_name')
      .then(({ data }) => setEmployees(data || []))
  }, [orgId, isHR])

  const gn = (e) => `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim()
  const selectedEmp = employees.find(e => e.id === empId)
  const selectedForm = FORM_TYPES.find(f => f.v === formType)

  const totalWithholdings = [unionDues, pension, garnishment, childSupport, taxLevy, otherAmt]
    .reduce((s, v) => s + (parseFloat(v) || 0), 0)

  const updateWHRow = (id, field, val) => setWhRows(p => p.map(r => r.id === id ? { ...r, [field]: val } : r))
  const addWHRow    = () => setWhRows(p => [...p, emptyWHRow()])
  const removeWHRow = (id) => whRows.length > 1 && setWhRows(p => p.filter(r => r.id !== id))

  const canNext1 = empId !== ''
  const canNext2 = formType !== ''
  const canNext3 = (() => {
    if (formType === 'withholding') return totalWithholdings > 0 || whRows.some(r => r.type && r.amount)
    if (formType === 'deduction') return dedType && dedAmount && dedSchedule
    if (formType === 'cash_reimbursement') return cashAmount && cashPurpose
    return false
  })()
  const canSubmit = empSigUrl && hrSigUrl

  // ── Upload signature ──
  const uploadSig = async (dataUrl, role) => {
    const blob = await fetch(dataUrl).then(r => r.blob())
    const path = `signatures/${orgId}/hr_${role}_${Date.now()}.png`
    const { error } = await supabase.storage.from('reimbursement-receipts').upload(path, blob, { contentType: 'image/png' })
    if (error) { sh('Signature upload failed'); return null }
    const { data } = supabase.storage.from('reimbursement-receipts').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSubmit = async () => {
    if (!canSubmit) { sh('Both signatures required'); return }
    setSubmitting(true)
    try {
      const empSig = await uploadSig(empSigUrl, 'employee')
      const hrSig  = await uploadSig(hrSigUrl, 'hr')
      const now    = new Date().toISOString()

      const { data: form, error: formErr } = await supabase.from('hr_forms').insert({
        org_id: orgId, employee_id: empId, form_type: formType,
        created_by: user.email, status: 'complete',
        employee_signature_url: empSig, employee_signed_at: now,
        hr_signature_url: hrSig, hr_signed_at: now,
      }).select().single()

      if (formErr) throw formErr

      if (formType === 'withholding') {
        await supabase.from('withholding_details').insert({
          hr_form_id: form.id,
          union_dues: parseFloat(unionDues) || 0,
          pension: parseFloat(pension) || 0,
          garnishment: parseFloat(garnishment) || 0,
          child_support: parseFloat(childSupport) || 0,
          tax_levy: parseFloat(taxLevy) || 0,
          other_description: otherDesc,
          other_amount: parseFloat(otherAmt) || 0,
          total_withholdings: totalWithholdings,
          withholding_rows: whRows.filter(r => r.type && r.amount),
        })
      } else if (formType === 'deduction') {
        await supabase.from('deduction_details').insert({
          hr_form_id: form.id, deduction_type: dedType,
          amount: parseFloat(dedAmount), schedule: dedSchedule,
        })
      } else if (formType === 'cash_reimbursement') {
        await supabase.from('cash_reimbursement_details').insert({
          hr_form_id: form.id, amount: parseFloat(cashAmount),
          purpose: cashPurpose, refund_method: cashMode,
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
    setStep(1); setEmpId(''); setFormType('')
    setWhRows([emptyWHRow()]); setUnionDues(''); setPension(''); setGarnishment('')
    setChildSupport(''); setTaxLevy(''); setOtherDesc(''); setOtherAmt('')
    setDedType(''); setDedAmount(''); setDedSchedule('')
    setCashAmount(''); setCashPurpose(''); setCashMode('payroll')
    setEmpSigUrl(''); setHrSigUrl('')
  }

  if (!isHR) return (
    <div style={{ padding: 30, textAlign: 'center', color: C.g }}>
      HR access required to initiate these forms.
    </div>
  )

  const StepDot = ({ n }) => (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 700,
      background: step > n ? (C.go || '#F59E0B') : step === n ? 'rgba(245,158,11,0.2)' : C.ch,
      border: `1.5px solid ${step >= n ? (C.go || '#F59E0B') : (C.bdr || '#374151')}`,
      color: step > n ? C.bg : step === n ? (C.go || '#F59E0B') : C.g,
    }}>{step > n ? '✓' : n}</div>
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* HR badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '6px 12px', borderRadius: 6, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', width: 'fit-content' }}>
        <span style={{ fontSize: 10, color: '#0EA5E9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>HR Form</span>
        <span style={{ fontSize: 10, color: C.g }}>Initiated by {user?.email}</span>
      </div>

      {/* Step indicator */}
      {step < 5 && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          {['Employee', 'Form', 'Details', 'Sign'].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <StepDot n={i + 1} />
                <div style={{ fontSize: 9, color: step === i + 1 ? (C.go || '#F59E0B') : C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 1, background: step > i + 1 ? (C.go || '#F59E0B') : (C.bdr || '#374151'), margin: '0 6px 16px', transition: 'background 0.3s' }} />}
            </div>
          ))}
        </div>
      )}

      {/* ── Step 1: Select employee ── */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.w, marginBottom: 4 }}>Select Employee</div>
          <div style={{ fontSize: 12, color: C.g, marginBottom: 18 }}>Which employee is this form for?</div>
          <Field C={C} l="Employee" req>
            <select value={empId} onChange={e => setEmpId(e.target.value)} style={inp(C)}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{gn(e)} — {e.dept}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setStep(2)} disabled={!canNext1} style={{
              padding: '8px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: canNext1 ? (C.go || '#F59E0B') : C.bdr, color: canNext1 ? C.bg : C.g,
              border: 'none', cursor: canNext1 ? 'pointer' : 'not-allowed',
            }}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 2: Form type ── */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.w, marginBottom: 4 }}>Select Form Type</div>
          <div style={{ fontSize: 12, color: C.g, marginBottom: 18 }}>For {selectedEmp ? gn(selectedEmp) : '—'}</div>
          <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
            {FORM_TYPES.map(f => (
              <div key={f.v} onClick={() => setFormType(f.v)} style={{
                padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
                background: formType === f.v ? 'rgba(245,158,11,0.08)' : C.ch,
                border: `1.5px solid ${formType === f.v ? (C.go || '#F59E0B') : (C.bdr || '#374151')}`,
                display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 22 }}>{f.i}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: formType === f.v ? (C.go || '#F59E0B') : C.w }}>{f.l}</div>
                  <div style={{ fontSize: 11, color: C.g, marginTop: 2 }}>{f.desc}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 16, color: formType === f.v ? (C.go || '#F59E0B') : C.bdr }}>{formType === f.v ? '◉' : '○'}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(1)} style={{ padding: '8px 18px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, background: 'none', border: `1px solid ${C.bdr}`, color: C.g, cursor: 'pointer' }}>← Back</button>
            <button onClick={() => setStep(3)} disabled={!canNext2} style={{
              padding: '8px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: canNext2 ? (C.go || '#F59E0B') : C.bdr, color: canNext2 ? C.bg : C.g,
              border: 'none', cursor: canNext2 ? 'pointer' : 'not-allowed',
            }}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Form details ── */}
      {step === 3 && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.w, marginBottom: 2 }}>{selectedForm?.l}</div>
          <div style={{ fontSize: 12, color: C.g, marginBottom: 18 }}>For {selectedEmp ? gn(selectedEmp) : '—'}</div>

          {/* WITHHOLDING */}
          {formType === 'withholding' && (
            <div>
              {/* Withholding table */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.go, marginBottom: 8 }}>Withholding Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 110px 28px', gap: 6, marginBottom: 4 }}>
                  {['Type', 'Amount/Period', 'Frequency', 'Effective Date', ''].map((h, i) => (
                    <div key={i} style={{ fontSize: 9, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                  ))}
                </div>
                {whRows.map(row => (
                  <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 110px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <select value={row.type} onChange={e => updateWHRow(row.id, 'type', e.target.value)} style={inp(C)}>
                      <option value="">— Type —</option>
                      {WITHHOLDING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="number" value={row.amount} onChange={e => updateWHRow(row.id, 'amount', e.target.value)} placeholder="0.00" style={{ ...inp(C), textAlign: 'right' }} />
                    <select value={row.frequency} onChange={e => updateWHRow(row.id, 'frequency', e.target.value)} style={inp(C)}>
                      <option value="">— Freq —</option>
                      {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <input type="date" value={row.effective_date} onChange={e => updateWHRow(row.id, 'effective_date', e.target.value)} style={inp(C)} />
                    {whRows.length > 1
                      ? <button onClick={() => removeWHRow(row.id)} style={{ background: 'none', border: 'none', color: C.g, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>✕</button>
                      : <div />
                    }
                  </div>
                ))}
                <button onClick={addWHRow} style={{ fontSize: 11, color: C.go, background: 'none', border: `1px solid ${C.go}`, borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>+ Add Row</button>
              </div>

              {/* Additional fields */}
              <div style={{ fontSize: 11, fontWeight: 600, color: C.go, marginBottom: 8 }}>Additional Amounts (per pay period)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Union Dues', unionDues, setUnionDues],
                  ['Pension/Retirement', pension, setPension],
                  ['Garnishment', garnishment, setGarnishment],
                  ['Child Support', childSupport, setChildSupport],
                  ['Tax Levy', taxLevy, setTaxLevy],
                ].map(([lbl, val, setter]) => (
                  <Field key={lbl} C={C} l={lbl}>
                    <input type="number" min="0" step="0.01" value={val} onChange={e => setter(e.target.value)} placeholder="0.00" style={inp(C)} />
                  </Field>
                ))}
                <Field C={C} l="Other Description">
                  <input type="text" value={otherDesc} onChange={e => setOtherDesc(e.target.value)} placeholder="Describe" style={inp(C)} />
                </Field>
              </div>
              <Field C={C} l="Other Amount">
                <input type="number" min="0" step="0.01" value={otherAmt} onChange={e => setOtherAmt(e.target.value)} placeholder="0.00" style={{ ...inp(C), width: 160 }} />
              </Field>
              <div style={{ padding: '10px 14px', borderRadius: 6, background: C.ch, border: `1px solid ${C.bdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.g }}>Total Withholdings per Pay Period</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.go }}>${totalWithholdings.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* DEDUCTION */}
          {formType === 'deduction' && (
            <div>
              <div style={{ fontSize: 11, color: C.g, marginBottom: 14, padding: '8px 12px', background: C.ch, borderRadius: 6, border: `1px solid ${C.bdr}` }}>
                This form is not required for garnishments or child support withholding.
              </div>
              <Field C={C} l="Deduction Type" req>
                <select value={dedType} onChange={e => setDedType(e.target.value)} style={inp(C)}>
                  <option value="">— Select type —</option>
                  {DEDUCTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field C={C} l="Total Amount to Deduct (USD)" req>
                <input type="number" min="0" step="0.01" value={dedAmount} onChange={e => setDedAmount(e.target.value)} placeholder="0.00" style={inp(C)} />
              </Field>
              <Field C={C} l="Deduction Schedule" req>
                {SCHEDULES.map(s => (
                  <label key={s.v} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="schedule" value={s.v} checked={dedSchedule === s.v} onChange={() => setDedSchedule(s.v)} style={{ accentColor: C.go || '#F59E0B' }} />
                    <span style={{ fontSize: 12, color: C.w }}>{s.l}</span>
                  </label>
                ))}
              </Field>
            </div>
          )}

          {/* CASH REIMBURSEMENT */}
          {formType === 'cash_reimbursement' && (
            <div>
              <Field C={C} l="Employee Full Name">
                <input value={selectedEmp ? gn(selectedEmp) : ''} disabled style={{ ...inp(C), opacity: 0.6 }} />
              </Field>
              <Field C={C} l="Amount of Reimbursement (USD)" req>
                <input type="number" min="0" step="0.01" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="0.00" style={inp(C)} />
              </Field>
              <Field C={C} l="Purpose of Reimbursement" req>
                <textarea value={cashPurpose} onChange={e => setCashPurpose(e.target.value)} rows={3} placeholder="Describe what is being reimbursed..." style={{ ...inp(C), resize: 'vertical' }} />
              </Field>
              <Field C={C} l="Refund Method" req>
                <div style={{ fontSize: 11, color: C.g, marginBottom: 8, fontStyle: 'italic' }}>
                  Will be reimbursed on payroll unless cash is requested.
                </div>
                {[{ v: 'payroll', l: 'Reimburse on Payroll (default)' }, { v: 'cash', l: 'Cash Reimbursement' }].map(m => (
                  <label key={m.v} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <input type="radio" name="cashmode" value={m.v} checked={cashMode === m.v} onChange={() => setCashMode(m.v)} style={{ accentColor: C.go || '#F59E0B' }} />
                    <span style={{ fontSize: 12, color: C.w }}>{m.l}</span>
                  </label>
                ))}
              </Field>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button onClick={() => setStep(2)} style={{ padding: '8px 18px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, background: 'none', border: `1px solid ${C.bdr}`, color: C.g, cursor: 'pointer' }}>← Back</button>
            <button onClick={() => setStep(4)} disabled={!canNext3} style={{
              padding: '8px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: canNext3 ? (C.go || '#F59E0B') : C.bdr, color: canNext3 ? C.bg : C.g,
              border: 'none', cursor: canNext3 ? 'pointer' : 'not-allowed',
            }}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Step 4: Sign ── */}
      {step === 4 && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.w, marginBottom: 4 }}>Signatures Required</div>
          <div style={{ fontSize: 12, color: C.g, marginBottom: 18 }}>Both employee and HR must sign to complete this form.</div>

          {/* Consent text */}
          <div style={{ fontSize: 11, color: C.g, lineHeight: 1.6, marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: C.ch, border: `1px solid ${C.bdr}` }}>
            {formType === 'withholding' && 'I have been notified of the above payroll withholdings. I understand these deductions are either legally required or previously authorized. By signing, I acknowledge receipt and authorize Minuteman Press to withhold the specified amounts.'}
            {formType === 'deduction' && 'By signing this Payroll Deduction Authorization electronically, I agree that: my signature is being collected digitally; this deduction is being made with my full knowledge and consent; this authorization is revocable in writing except for amounts already deducted; deductions will not reduce my pay below any applicable minimum wage or overtime required by law.'}
            {formType === 'cash_reimbursement' && 'I acknowledge that I have received the above-described reimbursement from Minuteman Press. I confirm that the amount and purpose stated above are accurate.'}
          </div>

          <SignaturePad C={C} label={`${selectedEmp ? gn(selectedEmp) : 'Employee'} Signature`} required onSign={setEmpSigUrl} onClear={() => setEmpSigUrl('')} />
          <div style={{ marginTop: 16 }}>
            <SignaturePad C={C} label="HR / Payroll Representative Signature" required onSign={setHrSigUrl} onClear={() => setHrSigUrl('')} />
          </div>

          {toast && <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 8, fontWeight: 600 }}>{toast}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <button onClick={() => setStep(3)} style={{ padding: '8px 18px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, background: 'none', border: `1px solid ${C.bdr}`, color: C.g, cursor: 'pointer' }}>← Back</button>
            <button onClick={handleSubmit} disabled={!canSubmit || submitting} style={{
              padding: '8px 28px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: canSubmit && !submitting ? (C.go || '#F59E0B') : C.bdr,
              color: canSubmit && !submitting ? C.bg : C.g,
              border: 'none', cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
            }}>{submitting ? 'Saving...' : 'Complete Form'}</button>
          </div>
        </div>
      )}

      {/* ── Step 5: Done ── */}
      {step === 5 && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.go || '#F59E0B', marginBottom: 8 }}>Form Complete</div>
          <div style={{ fontSize: 13, color: C.g, marginBottom: 6 }}>
            <strong style={{ color: C.w }}>{selectedForm?.l}</strong> for <strong style={{ color: C.w }}>{selectedEmp ? gn(selectedEmp) : '—'}</strong> has been saved with both signatures.
          </div>
          <button onClick={reset} style={{
            padding: '10px 28px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            background: C.go || '#F59E0B', color: C.bg, border: 'none', cursor: 'pointer', marginTop: 20,
          }}>Start Another Form</button>
        </div>
      )}
    </div>
  )
}
