import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import SignaturePad from './SignaturePad.jsx'

// ── HRFormsWizard ─────────────────────────────────────────────────────────────
// HR-initiated forms: Withholding / Deduction / Cash Reimbursement
// Gated to HR_EMAILS. Lives in PaperFlow → Requests tab (HR view)
// Props: orgId, C, user
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = ['kari@karikounkel.com','accounting@mpuptown.com','fbrown@mpuptown.com','operationsmanager@mpuptown.com']

const FORM_TYPES = [
  { v: 'withholding',        l: 'Payroll Withholding Notification', i: '📋', desc: 'Notify employee of required payroll withholdings' },
  { v: 'deduction',          l: 'Payroll Deduction Authorization',  i: '✂️',  desc: 'Authorize a voluntary or required deduction' },
  { v: 'cash_reimbursement', l: 'Cash Reimbursement',               i: '💵', desc: 'Acknowledge a cash reimbursement to employee' },
  { v: 'nec_1099',           l: '1099 NEC — Non-Employee Compensation', i: '📄', desc: 'Issue payment to a contractor; collect ACH if needed' },
]

const TYPE_LABELS = {
  expense: '🧾 Expense',
  mileage: '🚗 Mileage',
  advance: '💵 Advance',
  '1099':  '📄 1099 NEC',
}

const STATUS_COLORS = {
  pending:  '#F59E0B',
  approved: '#3B82F6',
  paid:     '#22C55E',
  rejected: '#EF4444',
}

const PAYMENT_MODES_HR = ['Check', 'ACH / Direct Deposit', 'Cash', 'Payroll']

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
  const isHR = ADMIN_EMAILS.includes(user?.email?.toLowerCase())

  const [hrView, setHrView]             = useState('queue') // 'queue' | 'form'
  const [employees, setEmployees]       = useState([])
  const [requests, setRequests]         = useState([])
  const [queueTab, setQueueTab]         = useState('open') // 'open' | 'completed'
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [expandedReq, setExpandedReq]   = useState(null)
  const [empHistory, setEmpHistory]     = useState({}) // { empId: [requests] }
  const [loadingHistory, setLoadingHistory] = useState(null)
  const [approvingId, setApprovingId]   = useState(null)
  const [approveNote, setApproveNote]   = useState('')
  const [payingId, setPayingId]         = useState(null)
  const [payMethod, setPayMethod]       = useState('')
  const [payDate, setPayDate]           = useState('')
  const [payNote, setPayNote]           = useState('')
  const [actionToast, setActionToast]   = useState('')

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

  // 1099 NEC fields
  const [necContacts, setNecContacts]         = useState([])
  const [necContactId, setNecContactId]       = useState('')   // selected existing contact
  const [necMode, setNecMode]                 = useState('existing') // 'existing' | 'new'
  const [necFirstName, setNecFirstName]       = useState('')
  const [necLastName, setNecLastName]         = useState('')
  const [necEmail, setNecEmail]               = useState('')
  const [necAddress1, setNecAddress1]         = useState('')
  const [necCity, setNecCity]                 = useState('')
  const [necState, setNecState]               = useState('')
  const [necZip, setNecZip]                   = useState('')
  const [necSsnLast4, setNecSsnLast4]         = useState('')
  const [necHourlyRate, setNecHourlyRate]     = useState('')
  const [necHours, setNecHours]               = useState('')
  const [necPeriodStart, setNecPeriodStart]   = useState('')
  const [necPeriodEnd, setNecPeriodEnd]       = useState('')
  const [necDescription, setNecDescription]   = useState('')
  const [necTokenUrl, setNecTokenUrl]         = useState('')
  const [generatingToken, setGeneratingToken] = useState(false)
  const [necSavedContactId, setNecSavedContactId] = useState(null)

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

  useEffect(() => {
    if (!orgId || !isHR) return
    supabase.from('nec_contacts').select('*').eq('org_id', orgId).order('last_name')
      .then(({ data }) => setNecContacts(data || []))
  }, [orgId, isHR])

  const loadQueue = async () => {
    if (!orgId) return
    setLoadingQueue(true)
    const { data } = await supabase
      .from('employee_requests')
      .select('*, advance_details(*), expense_details(*), mileage_logs(*)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoadingQueue(false)
  }

  useEffect(() => { if (isHR) loadQueue() }, [orgId, isHR])

  const shA = (msg) => { setActionToast(msg); setTimeout(() => setActionToast(''), 3000) }

  const loadEmpHistory = async (eId) => {
    if (!eId || empHistory[eId]) return
    setLoadingHistory(eId)
    const { data } = await supabase
      .from('employee_requests')
      .select('id,type,status,created_at,approved_at,paid_at,payment_method')
      .eq('org_id', orgId)
      .eq('employee_id', eId)
      .order('created_at', { ascending: false })
      .limit(20)
    setEmpHistory(p => ({ ...p, [eId]: data || [] }))
    setLoadingHistory(null)
  }

  const getEmpName = (empId) => {
    const e = employees.find(x => x.id === empId)
    if (!e) return '—'
    return `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim()
  }

  const getAmount = (req) => {
    if (req.type === 'expense') return req.expense_details?.[0]?.amount
    if (req.type === 'mileage') {
      const total = (req.mileage_logs || []).reduce((s, r) => s + (r.miles || 0), 0)
      return (total * 0.725).toFixed(2)
    }
    if (req.type === 'advance' || req.type === '1099') return req.advance_details?.[0]?.amount
    return null
  }

  const handleApprove = async (reqId) => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('employee_requests')
      .update({ status: 'approved', approved_at: now, approved_by: user.email, approval_note: approveNote })
      .eq('id', reqId)
    if (error) { shA('Approve failed: ' + error.message); return }

    // Create MoneyFlow task
    const req = requests.find(r => r.id === reqId)
    const amt = getAmount(req)
    const empName = getEmpName(req.employee_id)
    await supabase.from('moneyflow_tasks').insert([{
      org_id: orgId,
      entity: 'omega',
      type: 'AP',
      source: 'paperflow_request',
      name: `${TYPE_LABELS[req.type] || req.type} — ${empName}${amt ? ' — $' + parseFloat(amt).toFixed(2) : ''}`,
      description: `Approved by ${user.email}. ${approveNote || ''}`.trim(),
      due_date: new Date().toISOString().split('T')[0],
      status: 'open',
      is_recurring: false,
      recur_interval: 0,
      paperflow_request_id: reqId,
    }])

    setRequests(p => p.map(r => r.id === reqId ? { ...r, status: 'approved', approved_at: now, approved_by: user.email } : r))
    setApprovingId(null)
    setApproveNote('')
    shA('Approved ✓ — task created in MoneyFlow')
  }

  const handleReject = async (reqId) => {
    const now = new Date().toISOString()
    await supabase.from('employee_requests')
      .update({ status: 'rejected', approved_at: now, approved_by: user.email, approval_note: approveNote })
      .eq('id', reqId)
    setRequests(p => p.map(r => r.id === reqId ? { ...r, status: 'rejected' } : r))
    setApprovingId(null)
    setApproveNote('')
    shA('Request rejected')
  }

  const handleMarkPaid = async (reqId) => {
    if (!payMethod || !payDate) { shA('Payment method and date required'); return }
    const now = new Date().toISOString()
    await supabase.from('employee_requests')
      .update({ status: 'paid', paid_at: now, paid_by: user.email, payment_method: payMethod, payment_date: payDate, payment_note: payNote })
      .eq('id', reqId)
    // Also mark the linked moneyflow task done
    await supabase.from('moneyflow_tasks')
      .update({ status: 'done' })
      .eq('paperflow_request_id', reqId)
    setRequests(p => p.map(r => r.id === reqId ? { ...r, status: 'paid', paid_at: now, payment_method: payMethod, payment_date: payDate } : r))
    setPayingId(null); setPayMethod(''); setPayDate(''); setPayNote('')
    shA('Marked paid ✓ — MoneyFlow task closed')
  }

  const gn = (e) => `${e.preferred_name || e.first_name || ''} ${e.last_name || ''}`.trim()
  const selectedEmp = employees.find(e => e.id === empId)
  const selectedForm = FORM_TYPES.find(f => f.v === formType)

  const totalWithholdings = [unionDues, pension, garnishment, childSupport, taxLevy, otherAmt]
    .reduce((s, v) => s + (parseFloat(v) || 0), 0)

  const updateWHRow = (id, field, val) => setWhRows(p => p.map(r => r.id === id ? { ...r, [field]: val } : r))
  const addWHRow    = () => setWhRows(p => [...p, emptyWHRow()])
  const removeWHRow = (id) => whRows.length > 1 && setWhRows(p => p.filter(r => r.id !== id))

  const canNext1 = empId !== '' || formType === 'nec_1099'
  const canNext2 = formType !== ''
  const necTotal = ((parseFloat(necHourlyRate) || 0) * (parseFloat(necHours) || 0)).toFixed(2)
  const selectedNecContact = necContacts.find(c => c.id === necContactId)
  const canNext3 = (() => {
    if (formType === 'withholding') return totalWithholdings > 0 || whRows.some(r => r.type && r.amount)
    if (formType === 'deduction') return dedType && dedAmount && dedSchedule
    if (formType === 'cash_reimbursement') return cashAmount && cashPurpose
    if (formType === 'nec_1099') {
      const contactReady = necMode === 'existing' ? !!necContactId : (necFirstName && necLastName)
      return contactReady && necHourlyRate && necHours && necPeriodStart && necPeriodEnd && necDescription
    }
    return false
  })()
  const canSubmit = empSigUrl && hrSigUrl

  const generateNecToken = async () => {
    setGeneratingToken(true)
    try {
      let contactId = necContactId

      // If new contact, upsert first
      if (necMode === 'new') {
        const { data: contact, error: cErr } = await supabase.from('nec_contacts').insert({
          org_id: orgId,
          first_name: necFirstName,
          last_name: necLastName,
          email: necEmail || null,
          address_line1: necAddress1 || null,
          city: necCity || null,
          state: necState || null,
          zip: necZip || null,
          ssn_last4: necSsnLast4 || null,
          banking_on_file: false,
        }).select().single()
        if (cErr) { shA('Contact save failed: ' + cErr.message); return }
        contactId = contact.id
        setNecSavedContactId(contactId)
        setNecContacts(p => [...p, contact])
      }

      const { data: tok, error: tErr } = await supabase.from('nec_tokens').insert({
        org_id: orgId,
        nec_contact_id: contactId,
        created_by: user.email,
      }).select().single()
      if (tErr) { shA('Token generation failed: ' + tErr.message); return }

      const url = `${window.location.origin}?nec=${tok.token}`
      setNecTokenUrl(url)

      // Auto-open mailto if we have the contractor's email
      const contactEmail = necMode === 'existing'
        ? necContacts.find(c => c.id === contactId)?.email
        : necEmail
      if (contactEmail) {
        const subject = encodeURIComponent('Action Required: Submit Your Banking Information')
        const body = encodeURIComponent(
          `Hello,\n\nPlease use the secure link below to submit your banking information for direct deposit payment.\n\nThis link is one-time use and expires in 7 days.\n\n${url}\n\nIf you have questions, contact HR.\n\nThank you.`
        )
        window.open(`mailto:${contactEmail}?subject=${subject}&body=${body}`, '_blank')
      }

      shA('Token link generated ✓' + (contactEmail ? ' — email draft opened' : ' — copy link to send manually'))
    } catch (e) {
      shA('Error: ' + e.message)
    } finally {
      setGeneratingToken(false)
    }
  }

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
      } else if (formType === 'nec_1099') {
        const necHoursVal = parseFloat(necHours) || 0
        const necRateVal  = parseFloat(necHourlyRate) || 0
        const resolvedContactId = necSavedContactId || necContactId
        await supabase.from('advance_details').insert({
          request_id: form.id,
          amount: parseFloat((necHoursVal * necRateVal).toFixed(2)),
          reason: `1099 NEC (HR) — ${necDescription}`,
          payment_method: selectedNecContact?.banking_on_file ? 'ACH / Direct Deposit' : 'Check',
          nec_hourly_rate: necRateVal,
          nec_hours: necHoursVal,
          nec_period_start: necPeriodStart,
          nec_period_end: necPeriodEnd,
        })
        // Link token to this form if one was generated
        if (necTokenUrl) {
          const token = necTokenUrl.split('?nec=')[1]
          if (token) await supabase.from('nec_tokens').update({ request_id: form.id }).eq('token', token)
        }

        // Create MoneyFlow AP task for this contractor payment
        const contactRec = necContacts.find(c => c.id === resolvedContactId)
        const contactName = contactRec
          ? `${contactRec.first_name} ${contactRec.last_name}`
          : (necFirstName && necLastName ? `${necFirstName} ${necLastName}` : 'Contractor')
        await supabase.from('moneyflow_tasks').insert([{
          org_id: orgId,
          entity: 'omega',
          type: 'AP',
          source: 'hr_form_nec',
          name: `1099 NEC — ${contactName} — $${(necHoursVal * necRateVal).toFixed(2)}`,
          description: `${necDescription}\n${necPeriodStart} → ${necPeriodEnd} · ${necHoursVal} hrs @ $${necRateVal}/hr\nPayment: ${contactRec?.banking_on_file ? 'ACH Direct Deposit' : 'Check'}`,
          due_date: new Date().toISOString().split('T')[0],
          status: 'open',
          is_recurring: false,
          recur_interval: 0,
          paperflow_request_id: form.id,
        }])
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
    setNecContactId(''); setNecMode('existing'); setNecFirstName(''); setNecLastName('')
    setNecEmail(''); setNecAddress1(''); setNecCity(''); setNecState(''); setNecZip('')
    setNecSsnLast4(''); setNecHourlyRate(''); setNecHours(''); setNecPeriodStart('')
    setNecPeriodEnd(''); setNecDescription(''); setNecTokenUrl(''); setNecSavedContactId(null)
    setEmpSigUrl(''); setHrSigUrl('')
  }

  if (!isHR) return (
    <div style={{ padding: 30, textAlign: 'center', color: C.g }}>
      HR access required to initiate these forms.
    </div>
  )

  const openReqs      = requests.filter(r => ['pending', 'approved'].includes(r.status))
  const completedReqs = requests.filter(r => ['paid', 'rejected'].includes(r.status))
  const displayReqs   = queueTab === 'open' ? openReqs : completedReqs

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* HR badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)' }}>
          <span style={{ fontSize: 10, color: '#0EA5E9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>HR</span>
          <span style={{ fontSize: 10, color: C.g }}>{user?.email}</span>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 7, background: C.ch, border: `1px solid ${C.bdr}` }}>
          {[{ k: 'queue', l: '📥 Request Queue' }, { k: 'form', l: '✎ New HR Form' }].map(t => (
            <button key={t.k} onClick={() => setHrView(t.k)} style={{
              padding: '5px 14px', borderRadius: 5, fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: hrView === t.k ? C.go : 'transparent',
              color: hrView === t.k ? C.bg : C.g,
            }}>{t.l}</button>
          ))}
        </div>
      </div>

      {/* ── QUEUE VIEW ── */}
      {hrView === 'queue' && (
        <div>
          {/* Open / Completed tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 16, padding: 3, borderRadius: 7, background: C.ch, border: `1px solid ${C.bdr}`, width: 'fit-content' }}>
            {[
              { k: 'open',      l: `Open (${openReqs.length})` },
              { k: 'completed', l: `Completed (${completedReqs.length})` },
            ].map(t => (
              <button key={t.k} onClick={() => setQueueTab(t.k)} style={{
                padding: '5px 16px', borderRadius: 5, fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: queueTab === t.k ? C.go : 'transparent',
                color: queueTab === t.k ? C.bg : C.g,
              }}>{t.l}</button>
            ))}
          </div>

          {loadingQueue && <div style={{ fontSize: 12, color: C.g, padding: 20, textAlign: 'center' }}>Loading...</div>}

          {!loadingQueue && displayReqs.length === 0 && (
            <div style={{ fontSize: 12, color: C.g, padding: 30, textAlign: 'center', background: C.ch, borderRadius: 8, border: `1px solid ${C.bdr}` }}>
              {queueTab === 'open' ? 'No open requests.' : 'No completed requests yet.'}
            </div>
          )}

          {displayReqs.map(req => {
            const amt   = getAmount(req)
            const name  = getEmpName(req.employee_id)
            const sc    = STATUS_COLORS[req.status] || C.g
            const isExp = expandedReq === req.id
            const adv   = req.advance_details?.[0]
            const isApprovingThis = approvingId === req.id
            const isPayingThis    = payingId === req.id

            return (
              <div key={req.id} style={{ marginBottom: 8, borderRadius: 8, border: `1px solid ${isExp ? C.go : C.bdr}`, background: C.ch, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                {/* Row header */}
                <div onClick={() => { const next = isExp ? null : req.id; setExpandedReq(next); if (!isExp && req.employee_id) loadEmpHistory(req.employee_id) }} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.w }}>{name}</span>
                      <span style={{ fontSize: 10, color: C.g }}>{TYPE_LABELS[req.type] || req.type}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.g }}>
                      {new Date(req.created_at).toLocaleDateString()}
                      {req.approved_at && <span style={{ marginLeft: 8 }}>· Approved {new Date(req.approved_at).toLocaleDateString()}</span>}
                      {req.paid_at && <span style={{ marginLeft: 8, color: STATUS_COLORS.paid }}>· Paid {new Date(req.payment_date || req.paid_at).toLocaleDateString()} via {req.payment_method}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {amt && <div style={{ fontSize: 14, fontWeight: 700, color: C.go }}>${parseFloat(amt).toFixed(2)}</div>}
                    <div style={{ fontSize: 10, fontWeight: 700, color: sc, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{req.status}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.g }}>{isExp ? '▾' : '▸'}</div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.bdr}` }}>

                    {/* Advance repayment schedule */}
                    {req.type === 'advance' && adv?.repayment_schedule && (
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.06)', border: `1px solid ${C.bdr}` }}>
                        <div style={{ fontSize: 10, color: C.go, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Repayment Schedule</div>
                        {adv.repayment_schedule.map((r, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.w, marginBottom: 3 }}>
                            <span>Payment {i + 1} — {r.date}</span>
                            <span style={{ fontWeight: 700, color: C.go }}>${parseFloat(r.amount).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 1099 NEC detail */}
                    {req.type === '1099' && adv && (
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}>
                        <div style={{ fontSize: 10, color: '#0EA5E9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>1099 NEC Detail</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                          {adv.nec_hours && <div><span style={{ color: C.g }}>Hours: </span><span style={{ color: C.w, fontWeight: 600 }}>{adv.nec_hours} hrs @ ${adv.nec_hourly_rate}/hr</span></div>}
                          {adv.nec_period_start && <div><span style={{ color: C.g }}>Period: </span><span style={{ color: C.w, fontWeight: 600 }}>{adv.nec_period_start} → {adv.nec_period_end}</span></div>}
                          <div><span style={{ color: C.g }}>Payment: </span><span style={{ color: C.w, fontWeight: 600 }}>{adv.payment_method || 'Check'}</span></div>
                        </div>
                      </div>
                    )}

                    {/* Approve / Reject panel */}
                    {req.status === 'pending' && !isApprovingThis && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button onClick={() => { setApprovingId(req.id); setApproveNote('') }} style={{
                          flex: 1, padding: '8px 0', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                          background: C.go, color: C.bg, border: 'none', cursor: 'pointer',
                        }}>✓ Approve</button>
                        <button onClick={() => { setApprovingId(req.id + '_reject'); setApproveNote('') }} style={{
                          flex: 1, padding: '8px 0', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                          background: 'transparent', color: '#EF4444', border: '1px solid #EF4444', cursor: 'pointer',
                        }}>✕ Reject</button>
                      </div>
                    )}

                    {/* Approve note form */}
                    {(approvingId === req.id || approvingId === req.id + '_reject') && (
                      <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.05)', border: `1px solid ${C.bdr}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: approvingId === req.id ? C.go : '#EF4444', marginBottom: 8 }}>
                          {approvingId === req.id ? 'Approve Request' : 'Reject Request'}
                        </div>
                        <textarea value={approveNote} onChange={e => setApproveNote(e.target.value)} rows={2}
                          placeholder="Note (optional)..."
                          style={{ width: '100%', padding: 8, background: C.ch, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.w, fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button onClick={() => setApprovingId(null)} style={{ padding: '6px 16px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, background: 'none', border: `1px solid ${C.bdr}`, color: C.g, cursor: 'pointer' }}>Cancel</button>
                          {approvingId === req.id
                            ? <button onClick={() => handleApprove(req.id)} style={{ padding: '6px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: C.go, color: C.bg, border: 'none', cursor: 'pointer' }}>Confirm Approve</button>
                            : <button onClick={() => handleReject(req.id)} style={{ padding: '6px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm Reject</button>
                          }
                        </div>
                      </div>
                    )}

                    {/* Mark Paid panel */}
                    {req.status === 'approved' && !isPayingThis && (
                      <div style={{ marginTop: 14 }}>
                        <button onClick={() => { setPayingId(req.id); setPayMethod(''); setPayDate(''); setPayNote('') }} style={{
                          width: '100%', padding: '8px 0', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                          background: STATUS_COLORS.paid, color: '#fff', border: 'none', cursor: 'pointer',
                        }}>💳 Mark as Paid</button>
                      </div>
                    )}

                    {isPayingThis && (
                      <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.05)', border: `1px solid ${C.bdr}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS.paid, marginBottom: 10 }}>Record Payment</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Payment Method <span style={{ color: '#EF4444' }}>*</span></div>
                            <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                              style={{ width: '100%', padding: '7px 10px', background: C.ch, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.w, fontSize: 12, fontFamily: 'inherit' }}>
                              <option value="">— Select —</option>
                              {PAYMENT_MODES_HR.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Payment Date <span style={{ color: '#EF4444' }}>*</span></div>
                            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                              style={{ width: '100%', padding: '7px 10px', background: C.ch, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.w, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Note</div>
                          <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Check #, confirmation #, etc..."
                            style={{ width: '100%', padding: '7px 10px', background: C.ch, border: `1px solid ${C.bdr}`, borderRadius: 6, color: C.w, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setPayingId(null)} style={{ padding: '6px 16px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, background: 'none', border: `1px solid ${C.bdr}`, color: C.g, cursor: 'pointer' }}>Cancel</button>
                          <button onClick={() => handleMarkPaid(req.id)} style={{ padding: '6px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: STATUS_COLORS.paid, color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm Payment</button>
                        </div>
                      </div>
                    )}

                    {/* ── Employee request history ── */}
                    {req.employee_id && (
                      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${C.bdr}` }}>
                        <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, fontWeight: 700 }}>
                          All Requests — {getEmpName(req.employee_id)}
                        </div>
                        {loadingHistory === req.employee_id && (
                          <div style={{ fontSize: 11, color: C.g }}>Loading...</div>
                        )}
                        {!loadingHistory && (empHistory[req.employee_id] || []).length === 0 && (
                          <div style={{ fontSize: 11, color: C.g }}>No other requests on file.</div>
                        )}
                        {(empHistory[req.employee_id] || []).map(h => {
                          const sc = STATUS_COLORS[h.status] || C.g
                          const isThis = h.id === req.id
                          return (
                            <div key={h.id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '5px 8px', borderRadius: 5, marginBottom: 4,
                              background: isThis ? 'rgba(245,158,11,0.08)' : C.ch,
                              border: `1px solid ${isThis ? C.go : C.bdr}`,
                              fontSize: 11,
                            }}>
                              <span style={{ color: C.w }}>{TYPE_LABELS[h.type] || h.type}{isThis ? ' ← this one' : ''}</span>
                              <span style={{ color: C.g, fontSize: 10 }}>{new Date(h.created_at).toLocaleDateString()}</span>
                              <span style={{ color: sc, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{h.status}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {actionToast && <div style={{ position: 'fixed', bottom: 20, right: 20, background: C.go, color: C.bg, padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, zIndex: 1e3 }}>{actionToast}</div>}
        </div>
      )}

      {/* ── FORM VIEW ── */}
      {hrView === 'form' && (<div>
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
          <Field C={C} l="Employee">
            <select value={empId} onChange={e => setEmpId(e.target.value)} style={inp(C)}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{gn(e)} — {e.dept}</option>)}
            </select>
          </Field>
          <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)', fontSize: 11, color: '#0EA5E9', marginBottom: 18 }}>
            💡 For <strong>1099 NEC contractor payments</strong>, no employee selection is needed — you can skip this step.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => { setFormType('nec_1099'); setStep(3) }} style={{
              padding: '8px 18px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              background: 'transparent', border: '1px solid rgba(14,165,233,0.4)', color: '#0EA5E9', cursor: 'pointer',
            }}>Skip → 1099 NEC</button>
            <button onClick={() => setStep(2)} disabled={!empId} style={{
              padding: '8px 24px', borderRadius: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: empId ? (C.go || '#F59E0B') : C.bdr, color: empId ? C.bg : C.g,
              border: 'none', cursor: empId ? 'pointer' : 'not-allowed',
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

          {/* 1099 NEC */}
          {formType === 'nec_1099' && (
            <div>
              <div style={{ fontSize: 11, color: C.g, marginBottom: 14, padding: '8px 12px', background: C.ch, borderRadius: 6, border: `1px solid ${C.bdr}` }}>
                Select an existing contractor or add a new one. Generate a secure link to collect their banking info if needed.
              </div>

              {/* Contact mode toggle */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 14, padding: 3, borderRadius: 7, background: C.ch, border: `1px solid ${C.bdr}`, width: 'fit-content' }}>
                {[{ k: 'existing', l: '👤 Existing Contractor' }, { k: 'new', l: '➕ New Contractor' }].map(t => (
                  <button key={t.k} onClick={() => setNecMode(t.k)} style={{
                    padding: '5px 14px', borderRadius: 5, fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    background: necMode === t.k ? C.go : 'transparent',
                    color: necMode === t.k ? C.bg : C.g,
                  }}>{t.l}</button>
                ))}
              </div>

              {/* Existing contact picker */}
              {necMode === 'existing' && (
                <Field C={C} l="Select Contractor" req>
                  <select value={necContactId} onChange={e => setNecContactId(e.target.value)} style={inp(C)}>
                    <option value="">— Select contractor —</option>
                    {necContacts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}{c.banking_on_file ? ' ✓ ACH on file' : ' — no ACH'}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {/* New contact fields */}
              {necMode === 'new' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field C={C} l="First Name" req><input type="text" value={necFirstName} onChange={e => setNecFirstName(e.target.value)} style={inp(C)} /></Field>
                    <Field C={C} l="Last Name" req><input type="text" value={necLastName} onChange={e => setNecLastName(e.target.value)} style={inp(C)} /></Field>
                  </div>
                  <Field C={C} l="Email"><input type="email" value={necEmail} onChange={e => setNecEmail(e.target.value)} placeholder="used for token link" style={inp(C)} /></Field>
                  <Field C={C} l="Address"><input type="text" value={necAddress1} onChange={e => setNecAddress1(e.target.value)} style={inp(C)} /></Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                    <Field C={C} l="City"><input type="text" value={necCity} onChange={e => setNecCity(e.target.value)} style={inp(C)} /></Field>
                    <Field C={C} l="State"><input type="text" value={necState} onChange={e => setNecState(e.target.value)} maxLength={2} placeholder="MN" style={inp(C)} /></Field>
                    <Field C={C} l="ZIP"><input type="text" value={necZip} onChange={e => setNecZip(e.target.value)} maxLength={10} style={inp(C)} /></Field>
                  </div>
                  <Field C={C} l="SSN Last 4">
                    <input type="text" inputMode="numeric" maxLength={4} value={necSsnLast4} onChange={e => setNecSsnLast4(e.target.value.replace(/\D/g, ''))} placeholder="••••" style={{ ...inp(C), width: 80 }} />
                  </Field>
                </div>
              )}

              {/* Banking status banner */}
              {necMode === 'existing' && selectedNecContact && (
                <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 12,
                  background: selectedNecContact.banking_on_file ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${selectedNecContact.banking_on_file ? '#22C55E' : (C.go || '#F59E0B')}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: selectedNecContact.banking_on_file ? '#22C55E' : (C.go || '#F59E0B') }}>
                    {selectedNecContact.banking_on_file ? '✓ ACH banking on file — payment will be direct deposit' : '⚠ No banking on file — generate a link to collect ACH info'}
                  </div>
                  {selectedNecContact.banking_on_file && (
                    <div style={{ fontSize: 10, color: C.g, marginTop: 2 }}>{selectedNecContact.bank_name} — {selectedNecContact.bank_account_type}</div>
                  )}
                </div>
              )}

              {/* Generate token link */}
              {((necMode === 'existing' && necContactId && !selectedNecContact?.banking_on_file) || necMode === 'new') && (
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.25)', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0EA5E9', marginBottom: 6 }}>🔗 Generate ACH Collection Link</div>
                  <div style={{ fontSize: 10, color: C.g, marginBottom: 10, lineHeight: 1.5 }}>
                    Send this one-time link to the contractor. They'll enter their banking info securely — no login required. Expires in 7 days.
                  </div>
                  {!necTokenUrl ? (
                    <button onClick={generateNecToken} disabled={generatingToken || (necMode === 'new' && !(necFirstName && necLastName))} style={{
                      padding: '7px 20px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                      background: '#0EA5E9', color: '#fff', border: 'none',
                      cursor: generatingToken ? 'wait' : 'pointer', opacity: generatingToken ? 0.7 : 1,
                    }}>{generatingToken ? 'Generating...' : 'Generate Link'}</button>
                  ) : (
                    <div>
                      <div style={{ fontSize: 10, color: C.g, marginBottom: 4 }}>Share this link with the contractor:</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input readOnly value={necTokenUrl} style={{ ...inp(C), fontSize: 10, flex: 1 }} onClick={e => e.target.select()} />
                        <button onClick={() => { navigator.clipboard.writeText(necTokenUrl); shA('Copied ✓') }} style={{
                          padding: '6px 14px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                          background: C.go, color: C.bg, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}>Copy</button>
                        {(() => {
                          const contactEmail = necMode === 'existing'
                            ? necContacts.find(c => c.id === necContactId)?.email
                            : necEmail
                          if (!contactEmail) return null
                          const subject = encodeURIComponent('Action Required: Submit Your Banking Information')
                          const body = encodeURIComponent(`Hello,\n\nPlease use the secure link below to submit your banking information for direct deposit payment.\n\nThis link is one-time use and expires in 7 days.\n\n${necTokenUrl}\n\nIf you have questions, contact HR.\n\nThank you.`)
                          return (
                            <button onClick={() => window.open(`mailto:${contactEmail}?subject=${subject}&body=${body}`, '_blank')} style={{
                              padding: '6px 14px', borderRadius: 6, fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                              background: '#0EA5E9', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            }}>✉ Email</button>
                          )
                        })()}
                      </div>
                      <div style={{ fontSize: 10, color: '#22C55E', marginTop: 6 }}>✓ Link generated — expires in 7 days</div>
                    </div>
                  )}
                </div>
              )}

              {/* Hours / Rate / Period */}
              <div style={{ fontSize: 11, fontWeight: 600, color: C.go, marginBottom: 8, marginTop: 4 }}>Work Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field C={C} l="Hourly Rate (USD)" req>
                  <input type="number" min="0" step="0.01" value={necHourlyRate} onChange={e => setNecHourlyRate(e.target.value)} placeholder="0.00" style={inp(C)} />
                </Field>
                <Field C={C} l="Hours Worked" req>
                  <input type="number" min="0" step="0.25" value={necHours} onChange={e => setNecHours(e.target.value)} placeholder="0.00" style={inp(C)} />
                </Field>
              </div>
              {necHourlyRate && necHours && (
                <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: `1px solid ${C.go}`, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Due</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.go }}>${necTotal}</div>
                  <div style={{ fontSize: 10, color: C.g }}>{necHours} hrs × ${necHourlyRate}/hr</div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field C={C} l="Work Period Start" req>
                  <input type="date" value={necPeriodStart} onChange={e => setNecPeriodStart(e.target.value)} style={inp(C)} />
                </Field>
                <Field C={C} l="Work Period End" req>
                  <input type="date" value={necPeriodEnd} onChange={e => setNecPeriodEnd(e.target.value)} style={inp(C)} />
                </Field>
              </div>
              <Field C={C} l="Description of Work" req>
                <textarea value={necDescription} onChange={e => setNecDescription(e.target.value)} rows={3} placeholder="Describe the work performed during this period..." style={{ ...inp(C), resize: 'vertical' }} />
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
            {formType === 'nec_1099' && 'By signing, HR certifies that the above non-employee compensation is accurate and authorized. The contractor will receive payment as described. If annual compensation exceeds $600, IRS Form 1099-NEC will be issued.'}
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
    </div>)}

    </div>
  )
}
