import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'

// ── NecConfirm ────────────────────────────────────────────────────────────────
// Public page — no login required.
// Rendered when App detects ?nec=TOKEN in URL.
// Contractor fills in banking info; saved to nec_contacts.
// Token is marked used so link cannot be reused.
// Props: token (string)
// ─────────────────────────────────────────────────────────────────────────────

const inp = {
  width: '100%',
  padding: '10px 12px',
  background: '#1F2937',
  border: '1px solid #374151',
  borderRadius: 8,
  color: '#F9FAFB',
  fontSize: 14,
  fontFamily: "'Outfit', sans-serif",
  boxSizing: 'border-box',
}

const Field = ({ label, req, children, hint }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
      {label}{req && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
    </div>
    {children}
    {hint && <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4 }}>{hint}</div>}
  </div>
)

export default function NecConfirm({ token }) {
  const [status, setStatus]         = useState('loading') // loading | invalid | expired | used | form | success
  const [tokenRow, setTokenRow]     = useState(null)
  const [contact, setContact]       = useState(null)

  // Banking form fields
  const [bankName, setBankName]           = useState('')
  const [accountType, setAccountType]     = useState('checking')
  const [routingNo, setRoutingNo]         = useState('')
  const [accountNo, setAccountNo]         = useState('')
  const [accountNoConfirm, setAccountNoConfirm] = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState('')

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    loadToken()
  }, [token])

  const loadToken = async () => {
    const { data: tok, error: tokErr } = await supabase
      .from('nec_tokens')
      .select('*, nec_contacts(*)')
      .eq('token', token)
      .single()

    if (tokErr || !tok) { setStatus('invalid'); return }
    if (tok.is_used)    { setStatus('used');    return }
    if (new Date(tok.expires_at) < new Date()) { setStatus('expired'); return }

    setTokenRow(tok)
    setContact(tok.nec_contacts)
    setStatus('form')
  }

  const handleSubmit = async () => {
    setError('')
    if (!bankName)    { setError('Bank name is required.'); return }
    if (routingNo.length !== 9) { setError('Routing number must be exactly 9 digits.'); return }
    if (!accountNo)   { setError('Account number is required.'); return }
    if (accountNo !== accountNoConfirm) { setError('Account numbers do not match.'); return }

    setSubmitting(true)
    try {
      // Update the nec_contact with banking info
      const { error: cErr } = await supabase
        .from('nec_contacts')
        .update({
          bank_name:         bankName,
          bank_routing_no:   routingNo,
          bank_account_no:   accountNo,
          bank_account_type: accountType,
          banking_on_file:   true,
          updated_at:        new Date().toISOString(),
        })
        .eq('id', tokenRow.nec_contact_id)

      if (cErr) throw cErr

      // Mark token as used
      const { error: tErr } = await supabase
        .from('nec_tokens')
        .update({ is_used: true, used_at: new Date().toISOString() })
        .eq('id', tokenRow.id)

      if (tErr) throw tErr

      setStatus('success')
    } catch (e) {
      setError('Something went wrong: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const fullName = contact ? `${contact.first_name} ${contact.last_name}` : ''

  // ── Shared page shell ──
  const Shell = ({ children }) => (
    <div style={{
      minHeight: '100vh', background: '#111827',
      fontFamily: "'Outfit', sans-serif", color: '#F9FAFB',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', padding: '40px 16px',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            <span style={{ color: '#F59E0B' }}>Flow</span><span style={{ fontWeight: 300 }}>Suite</span>
          </div>
          <div style={{ fontSize: 10, color: '#6B7280', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            Secure Banking Collection
          </div>
        </div>
        {children}
      </div>
    </div>
  )

  // ── Loading ──
  if (status === 'loading') return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#6B7280', fontSize: 13 }}>
        Verifying your link...
      </div>
    </Shell>
  )

  // ── Invalid ──
  if (status === 'invalid') return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '40px 20px', background: '#1F2937', borderRadius: 12, border: '1px solid #374151' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#EF4444', marginBottom: 8 }}>Invalid Link</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.6 }}>
          This link is not valid. Please contact your HR representative for a new link.
        </div>
      </div>
    </Shell>
  )

  // ── Expired ──
  if (status === 'expired') return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '40px 20px', background: '#1F2937', borderRadius: 12, border: '1px solid #374151' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏰</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#F59E0B', marginBottom: 8 }}>Link Expired</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.6 }}>
          This link expired after 7 days. Please contact your HR representative to generate a new one.
        </div>
      </div>
    </Shell>
  )

  // ── Already used ──
  if (status === 'used') return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '40px 20px', background: '#1F2937', borderRadius: 12, border: '1px solid #374151' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#22C55E', marginBottom: 8 }}>Already Submitted</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.6 }}>
          Your banking information has already been received. This link can only be used once.
          If you need to update your information, contact your HR representative.
        </div>
      </div>
    </Shell>
  )

  // ── Success ──
  if (status === 'success') return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '40px 20px', background: '#1F2937', borderRadius: 12, border: '1px solid #374151' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#22C55E', marginBottom: 8 }}>Banking Info Received</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.7, marginBottom: 12 }}>
          Thank you, <strong style={{ color: '#F9FAFB' }}>{fullName}</strong>. Your banking information
          has been securely saved. Your payment will be processed via ACH direct deposit.
        </div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 16, padding: '10px 14px', background: '#111827', borderRadius: 8, border: '1px solid #374151' }}>
          You may close this window. HR will contact you with payment confirmation.
        </div>
      </div>
    </Shell>
  )

  // ── Form ──
  return (
    <Shell>
      {/* Context card */}
      <div style={{ padding: '16px 18px', borderRadius: 10, background: '#1F2937', border: '1px solid #374151', marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Payment for</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#F9FAFB', marginBottom: 2 }}>{fullName}</div>
        {contact?.email && <div style={{ fontSize: 12, color: '#9CA3AF' }}>{contact.email}</div>}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #374151', fontSize: 11, color: '#9CA3AF', lineHeight: 1.6 }}>
          Your HR team has requested your banking details for direct deposit payment.
          This link is one-time use and expires 7 days from when it was sent.
        </div>
      </div>

      {/* Form card */}
      <div style={{ padding: '20px 22px', borderRadius: 10, background: '#1F2937', border: '1px solid #374151' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F9FAFB', marginBottom: 4 }}>Banking Information</div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 20 }}>
          Enter your bank account details below. Your information is transmitted securely.
        </div>

        <Field label="Bank Name" req>
          <input
            type="text"
            value={bankName}
            onChange={e => setBankName(e.target.value)}
            placeholder="e.g. Wells Fargo, US Bank"
            style={inp}
          />
        </Field>

        <Field label="Account Type" req>
          <div style={{ display: 'flex', gap: 12 }}>
            {['checking', 'savings'].map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio" name="accountType" value={t}
                  checked={accountType === t} onChange={() => setAccountType(t)}
                  style={{ accentColor: '#F59E0B', width: 16, height: 16 }}
                />
                <span style={{ fontSize: 14, color: '#F9FAFB', textTransform: 'capitalize' }}>{t}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Routing Number" req hint="9-digit number found at the bottom left of your check">
          <input
            type="text"
            inputMode="numeric"
            maxLength={9}
            value={routingNo}
            onChange={e => setRoutingNo(e.target.value.replace(/\D/g, ''))}
            placeholder="123456789"
            style={{
              ...inp,
              borderColor: routingNo.length > 0 && routingNo.length !== 9 ? '#EF4444' : '#374151',
              letterSpacing: '0.15em',
            }}
          />
          {routingNo.length > 0 && routingNo.length !== 9 && (
            <div style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>Must be exactly 9 digits ({routingNo.length}/9)</div>
          )}
        </Field>

        <Field label="Account Number" req>
          <input
            type="text"
            inputMode="numeric"
            value={accountNo}
            onChange={e => setAccountNo(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter account number"
            style={{ ...inp, letterSpacing: '0.1em' }}
          />
        </Field>

        <Field label="Confirm Account Number" req>
          <input
            type="text"
            inputMode="numeric"
            value={accountNoConfirm}
            onChange={e => setAccountNoConfirm(e.target.value.replace(/\D/g, ''))}
            placeholder="Re-enter account number"
            style={{
              ...inp,
              borderColor: accountNoConfirm.length > 0 && accountNo !== accountNoConfirm ? '#EF4444' : '#374151',
              letterSpacing: '0.1em',
            }}
          />
          {accountNoConfirm.length > 0 && accountNo !== accountNoConfirm && (
            <div style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>Account numbers do not match</div>
          )}
        </Field>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid #EF4444', color: '#EF4444', fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 8,
            fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 700,
            background: submitting ? '#374151' : '#F59E0B',
            color: submitting ? '#9CA3AF' : '#111827',
            border: 'none', cursor: submitting ? 'wait' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {submitting ? 'Saving...' : 'Submit Banking Information'}
        </button>

        <div style={{ fontSize: 10, color: '#6B7280', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
          🔒 Your information is encrypted in transit and stored securely.<br />
          This link is single-use and will expire after submission.
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 9, color: '#4B5563', lineHeight: 1.8 }}>
        FlowSuite™ — CARES Consulting, Inc. &amp; Kari Hoglund Kounkel<br />
        © 2025–2026. All rights reserved.
      </div>
    </Shell>
  )
}
