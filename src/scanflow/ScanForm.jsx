// ═══════════════════════════════════════════════════════
// SCAN FORM — Badge scan → Job → Dept → Station → Action → Waste → Confirm
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase.js';
import { cardStyle as getCardStyle, bigButtonStyle as getBigBtn } from './scanflowTheme.js';

export function ScanForm({ theme, orgId, userRole, darkMode }) {
  const [step, setStep] = useState(0);
  const [scanMode, setScanMode] = useState(null);
  const [scanData, setScanData] = useState({
    employee_id: '', employee_name: '',
    job_id: '', job_info: '',
    department_id: '', department_name: '',
    station_id: '', station_name: '',
    action: '',
    reason_id: '', reason_name: '',
    return_to_dept: '', return_to_dept_name: '',
    maintenance_scope: '',
    waste_sheets: 0, waste_notes: ''
  });
  const [scanInput, setScanInput] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reasons, setReasons] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [recentScans, setRecentScans] = useState([]);
  const inputRef = useRef(null);

  const cardSt = getCardStyle(theme);
  const bigBtn = (isActive, color) => getBigBtn(isActive, color, theme);

  useEffect(() => {
    loadReasons();
    loadDepartments();
    loadRecentScans();
  }, []);

  useEffect(() => {
    if (inputRef.current && typeof step === 'number' && step < 4) inputRef.current.focus();
  }, [step]);

  async function loadReasons() {
    const { data } = await supabase.from('scan_reasons').select('*').eq('is_active', true).order('sort_order');
    if (data) setReasons(data);
  }

  async function loadDepartments() {
    const { data } = await supabase.from('departments').select('*').eq('is_active', true).order('id');
    if (data) setDepartments(data);
  }

  async function loadRecentScans() {
    const { data } = await supabase.from('scan_log')
      .select('*, job_sleeves(flex_job_number, customer_name)')
      .order('scanned_at', { ascending: false }).limit(10);
    if (data) setRecentScans(data);
  }

  // ─── HANDLE BARCODE SCAN ───
  async function handleScan(e) {
    if (e.key !== 'Enter') return;
    const code = scanInput.trim().toUpperCase();
    setError('');
    setScanInput('');

    if (step === 0) {
      if (!code.startsWith('EMP')) { setError('Scan your EMPLOYEE badge first'); return; }
      const { data } = await supabase.from('employees').select('id, first_name, last_name, emp_code, dept').eq('emp_code', code).single();
      if (!data) { setError(`Employee ${code} not found`); return; }
      setScanData(prev => ({ ...prev, employee_id: data.emp_code, employee_name: `${data.first_name} ${data.last_name}` }));

      const deptText = (data.dept || '').toLowerCase();
      const isCS = deptText.includes('customer service') || deptText.includes('operations/cs') || deptText.includes('cs');
      const isManagerOrAdmin = userRole === 'manager' || userRole === 'admin' || userRole === 'org_admin' || userRole === 'super_admin';

      setScanMode((isCS || isManagerOrAdmin) ? 'intake' : 'production');
      setStep(1);
    } else if (step === 1) {
      if (!code.startsWith('JOB')) { setError('Scan the JOB jacket'); return; }

      if (scanMode === 'production') {
        const { data } = await supabase.from('job_sleeves').select('*').eq('id', code).single();
        if (!data) {
          setError("This sleeve hasn't been started yet — have Customer Service scan it in first.");
          return;
        }
        // Show Flex # as primary, not the internal JOB code
        const info = data.flex_job_number
          ? `${data.flex_job_number}${data.customer_name ? ' — ' + data.customer_name : ''}`
          : code;
        setScanData(prev => ({ ...prev, job_id: code, job_info: info }));
        setStep(2);
      } else {
        let { data } = await supabase.from('job_sleeves').select('*').eq('id', code).single();
        if (!data) {
          setScanData(prev => ({ ...prev, job_id: code }));
          setStep('intake_details');
          return;
        }
        const info = data.flex_job_number
          ? `${data.flex_job_number}${data.customer_name ? ' — ' + data.customer_name : ''}`
          : code;
        setScanData(prev => ({ ...prev, job_id: code, job_info: info }));
        setStep(2);
      }
    } else if (step === 2) {
      if (!code.startsWith('DEPT')) { setError('Scan the DEPARTMENT barcode'); return; }
      const dept = departments.find(d => d.id === code);
      if (!dept) { setError(`Department ${code} not found`); return; }
      setScanData(prev => ({ ...prev, department_id: code, department_name: dept.name }));
      setStep(3);
    } else if (step === 3) {
      if (!code.startsWith('STA')) { setError('Scan a STATION barcode or tap Skip'); return; }
      const { data } = await supabase.from('stations').select('*').eq('id', code).single();
      if (!data) { setError(`Station ${code} not found`); return; }
      setScanData(prev => ({ ...prev, station_id: code, station_name: data.name }));
      setStep(4);
    }
  }

  function skipStation() { setStep(4); }

  function selectAction(action) {
    setScanData(prev => ({ ...prev, action }));
    if (action === 'BLOCKER') setStep(5);
    else if (action === 'MAINTENANCE') setStep(5.5);
    else if (action === 'WASTE_STOP') setStep(6);
    else setStep(6);
  }

  function selectReason(reasonId) {
    const reason = reasons.find(r => r.id === reasonId);
    setScanData(prev => ({ ...prev, reason_id: reasonId, reason_name: reason?.name || '' }));
    if (reason?.requires_destination) setStep(5.2);
    else if (reason?.pauses_all_jobs) setStep(5.5);
    else setStep(6);
  }

  function selectReturnDept(deptId) {
    const dept = departments.find(d => d.id === deptId);
    setScanData(prev => ({ ...prev, return_to_dept: deptId, return_to_dept_name: dept?.name || '' }));
    setStep(6);
  }

  function selectMaintenanceScope(scope) {
    setScanData(prev => ({ ...prev, maintenance_scope: scope, action: 'MAINTENANCE' }));
    setStep(6);
  }

  // ─── SUBMIT SCAN ───
  async function submitScan() {
    setError('');
    try {
      const { data: scanRecord, error: scanErr } = await supabase.from('scan_log').insert({
        employee_id: scanData.employee_id,
        job_id: scanData.job_id,
        department_id: scanData.department_id,
        station_id: scanData.station_id || null,
        action: scanData.action,
        reason_id: scanData.reason_id || null,
        return_to_dept_id: scanData.return_to_dept || null,
        maintenance_scope: scanData.maintenance_scope || null,
        waste_sheets: scanData.waste_sheets || 0,
        waste_notes: scanData.waste_notes || null,
        org_id: orgId
      }).select().single();

      if (scanErr) throw scanErr;

      // START/STOP update job location
      if (scanData.action === 'START' || scanData.action === 'STOP') {
        await supabase.from('job_sleeves').update({
          current_department_id: scanData.action === 'STOP' ? null : scanData.department_id,
          current_station_id: scanData.action === 'STOP' ? null : (scanData.station_id || null),
          entered_current_at: new Date().toISOString(),
          status: 'active'
        }).eq('id', scanData.job_id);
      }

      if (scanData.waste_sheets > 0) {
        await supabase.from('waste_log').insert({
          scan_log_id: scanRecord.id,
          job_id: scanData.job_id,
          employee_id: scanData.employee_id,
          sheets_wasted: scanData.waste_sheets,
          reason: scanData.waste_notes || null,
          is_emergency: scanData.action === 'WASTE_STOP',
          org_id: orgId
        });
      }

      if (scanData.action === 'MAINTENANCE') {
        await supabase.from('maintenance_log').insert({
          employee_id: scanData.employee_id,
          station_id: scanData.station_id || null,
          department_id: scanData.department_id,
          scope: scanData.maintenance_scope || 'station',
          org_id: orgId
        });
      }

      setSuccess(`✅ ${scanData.action} logged for ${scanData.job_info || scanData.job_id}`);
      setTimeout(() => { setSuccess(''); resetScan(); }, 2000);

    } catch (err) {
      setError(`Submit failed: ${err.message}`);
    }
  }

  function resetScan() {
    setScanData({
      employee_id: '', employee_name: '',
      job_id: '', job_info: '',
      department_id: '', department_name: '',
      station_id: '', station_name: '',
      action: '', reason_id: '', reason_name: '',
      return_to_dept: '', return_to_dept_name: '',
      maintenance_scope: '',
      waste_sheets: 0, waste_notes: ''
    });
    setScanMode(null);
    setStep(0);
    setError('');
    loadRecentScans();
  }

  // ─── ACTION DISPLAY HELPERS ───
  function actionLabel(action) {
    const map = { 'START': '▶ START', 'STOP': '⏹ STOP', 'BLOCKER': '🚫 BLOCKER', 'WASTE_STOP': '🛑 STOP — WASTE', 'MAINTENANCE': '🔧 MAINTENANCE' };
    return map[action] || action;
  }

  function actionColor(action) {
    const map = { 'START': '#2E7D32', 'STOP': '#1565C0', 'BLOCKER': '#C62828', 'WASTE_STOP': '#E65100', 'MAINTENANCE': '#6A1B9A' };
    return map[action] || theme.accent;
  }

  const stepLabels = [
    '📱 Scan Employee Badge',
    scanMode === 'intake' ? '📥 Scan Job Sleeve (Intake)' : '📋 Scan Job Jacket',
    '🏭 Scan Department',
    '🔧 Scan Station (or Skip)',
    '⚡ Pick Action',
    '❓ Pick Reason',
    '🗑️ Waste Check',
    '✅ Confirm & Submit'
  ];

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Progress Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[0,1,2,3,4,5,6,7].map(i => (
          <div key={i} style={{
            flex: 1, height: 6, borderRadius: 3,
            background: i <= step ? theme.accent : theme.border,
            transition: 'background 0.3s'
          }} />
        ))}
      </div>

      {/* Current Step Label */}
      <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 18, fontWeight: 700, fontFamily: "'SF Mono', monospace" }}>
        {step === 'intake_details' ? '📥 New Job Intake' : step <= 7 ? stepLabels[Math.floor(step)] : 'Complete'}
      </div>

      {/* Accumulated Scan Data Chips */}
      {(step > 0 || step === 'intake_details') && (
        <div style={{ ...cardSt, padding: 16, opacity: 0.85 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {scanMode && <span style={{ background: scanMode === 'intake' ? '#00695C' : '#37474F', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{scanMode}</span>}
            {scanData.employee_name && <span style={{ background: theme.accent, color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>👤 {scanData.employee_name}</span>}
            {scanData.job_id && <span style={{ background: '#2E7D32', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>📋 {scanData.job_info || scanData.job_id}</span>}
            {scanData.department_name && <span style={{ background: '#1565C0', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>🏭 {scanData.department_name}</span>}
            {scanData.station_name && <span style={{ background: '#6A1B9A', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>🔧 {scanData.station_name}</span>}
            {scanData.action && <span style={{ background: actionColor(scanData.action), color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>⚡ {scanData.action}</span>}
            {scanData.reason_name && <span style={{ background: '#E65100', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>❓ {scanData.reason_name}</span>}
          </div>
        </div>
      )}

      {/* Error / Success Messages */}
      {error && <div style={{ background: '#C62828', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, fontWeight: 600 }}>{error}</div>}
      {success && <div style={{ background: '#2E7D32', color: '#fff', padding: 16, borderRadius: 8, marginBottom: 12, fontWeight: 700, fontSize: 18, textAlign: 'center' }}>{success}</div>}

      {/* SCAN INPUT (steps 0-3) */}
      {typeof step === 'number' && step >= 0 && step <= 3 && !success && (
        <div style={cardSt}>
          <input
            ref={inputRef}
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            placeholder={step === 0 ? 'Scan employee badge...' : step === 1 ? 'Scan job jacket...' : step === 2 ? 'Scan department...' : 'Scan station...'}
            style={{
              width: '100%', padding: 16, fontSize: 20, fontWeight: 700, textAlign: 'center',
              background: theme.inputBg, color: theme.text,
              border: `2px solid ${theme.accent}`, borderRadius: 10,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              outline: 'none', boxSizing: 'border-box'
            }}
          />
          <p style={{ textAlign: 'center', color: theme.mutedText, fontSize: 13, marginTop: 8 }}>
            Point scanner at barcode or type code manually
          </p>
          {step === 3 && (
            <button onClick={skipStation} style={{ ...bigBtn(false), width: '100%', marginTop: 12 }}>
              Skip Station →
            </button>
          )}
        </div>
      )}

      {/* INTAKE DETAILS — CS/Manager new job sub-flow */}
      {step === 'intake_details' && !success && (
        <div style={cardSt}>
          <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, textAlign: 'center' }}>📥 New Job Intake</p>
          <p style={{ color: theme.mutedText, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>Sleeve: {scanData.job_id}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              id="intake-flex"
              placeholder="Flex Job # (from EFI)"
              style={{
                padding: 14, fontSize: 16, fontWeight: 600, textAlign: 'center',
                background: theme.inputBg, color: theme.text,
                border: `2px solid ${theme.border}`, borderRadius: 10,
                fontFamily: "'SF Mono', monospace", outline: 'none'
              }}
            />
            <input
              id="intake-customer"
              placeholder="Customer name"
              style={{
                padding: 14, fontSize: 16, fontWeight: 600, textAlign: 'center',
                background: theme.inputBg, color: theme.text,
                border: `2px solid ${theme.border}`, borderRadius: 10,
                fontFamily: "'SF Mono', monospace", outline: 'none'
              }}
            />
            <button onClick={async () => {
              const flexNum = document.getElementById('intake-flex')?.value?.trim() || '';
              const customerName = document.getElementById('intake-customer')?.value?.trim() || '';
              if (!customerName) { setError('Customer name required'); return; }
              setError('');
              const { data: newJob, error: err } = await supabase.from('job_sleeves')
                .insert({
                  id: scanData.job_id,
                  flex_job_number: flexNum || null,
                  customer_name: customerName,
                  status: 'active',
                  org_id: orgId,
                  current_department_id: 'DEPT0012'
                })
                .select().single();
              if (err) { setError(`Could not create job: ${err.message}`); return; }
              const info = `${flexNum || scanData.job_id} — ${customerName}`;
              setScanData(prev => ({
                ...prev, job_info: info,
                department_id: 'DEPT0012',
                department_name: departments.find(d => d.id === 'DEPT0012')?.name || 'Design/Graphics'
              }));
              setStep(3);
            }} style={{ ...bigBtn(true), width: '100%' }}>
              Start Job → Route to Design/Graphics
            </button>
          </div>
        </div>
      )}

      {/* ACTION PICKER (step 4) — START/STOP instead of IN/OUT */}
      {step === 4 && !success && (
        <div style={cardSt}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button onClick={() => selectAction('START')} style={bigBtn(false, '#2E7D32')}>▶ START</button>
            <button onClick={() => selectAction('STOP')} style={bigBtn(false, '#1565C0')}>⏹ STOP</button>
            <button onClick={() => selectAction('BLOCKER')} style={bigBtn(false, '#C62828')}>🚫 BLOCKER</button>
            <button onClick={() => selectAction('WASTE_STOP')} style={bigBtn(false, '#E65100')}>🛑 STOP — WASTE</button>
          </div>
          <button onClick={() => selectAction('MAINTENANCE')} style={{ ...bigBtn(false, '#6A1B9A'), width: '100%', marginTop: 12 }}>
            🔧 MAINTENANCE
          </button>
        </div>
      )}

      {/* REASON PICKER (step 5) */}
      {step === 5 && !success && (
        <div style={cardSt}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>What's the blocker?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reasons.filter(r => !r.pauses_all_jobs).map(r => (
              <button key={r.id} onClick={() => selectReason(r.id)} style={{ ...bigBtn(false), textAlign: 'left', fontSize: 14 }}>
                {r.name} <span style={{ fontSize: 11, color: theme.mutedText, marginLeft: 8 }}>{r.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* RETURN DESTINATION PICKER (step 5.2) */}
      {step === 5.2 && !success && (
        <div style={cardSt}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Return to which department?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {departments.map(d => (
              <button key={d.id} onClick={() => selectReturnDept(d.id)} style={{ ...bigBtn(false), textAlign: 'left', fontSize: 14 }}>
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MAINTENANCE SCOPE (step 5.5) */}
      {step === 5.5 && !success && (
        <div style={cardSt}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Pause jobs at:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button onClick={() => selectMaintenanceScope('station')} style={bigBtn(false, '#6A1B9A')}>🔧 This Station Only</button>
            <button onClick={() => selectMaintenanceScope('department')} style={bigBtn(false, '#6A1B9A')}>🏭 Entire Department</button>
          </div>
        </div>
      )}

      {/* WASTE QUESTION (step 6) */}
      {step === 6 && !success && (
        <div style={cardSt}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>
            {scanData.action === 'WASTE_STOP' ? '🛑 Emergency Waste Report' : 'Any sheets wasted?'}
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <label style={{ fontSize: 14, fontWeight: 600 }}>Sheets:</label>
            <input
              type="number" min="0" value={scanData.waste_sheets}
              onChange={e => setScanData(prev => ({ ...prev, waste_sheets: parseInt(e.target.value) || 0 }))}
              style={{
                width: 100, padding: 10, fontSize: 18, fontWeight: 700, textAlign: 'center',
                background: theme.inputBg, color: theme.text,
                border: `2px solid ${theme.border}`, borderRadius: 8,
                fontFamily: "'SF Mono', monospace"
              }}
            />
          </div>
          {(scanData.waste_sheets > 0 || scanData.action === 'WASTE_STOP') && (
            <textarea
              value={scanData.waste_notes}
              onChange={e => setScanData(prev => ({ ...prev, waste_notes: e.target.value }))}
              placeholder="What happened? (optional)"
              rows={2}
              style={{
                width: '100%', padding: 10, fontSize: 14,
                background: theme.inputBg, color: theme.text,
                border: `1px solid ${theme.border}`, borderRadius: 8,
                fontFamily: "'SF Mono', monospace", resize: 'vertical', boxSizing: 'border-box'
              }}
            />
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {scanData.action !== 'WASTE_STOP' && scanData.waste_sheets === 0 && (
              <button onClick={() => setStep(7)} style={{ ...bigBtn(false), flex: 1 }}>No Waste — Continue →</button>
            )}
            {(scanData.waste_sheets > 0 || scanData.action === 'WASTE_STOP') && (
              <button onClick={() => setStep(7)} style={{ ...bigBtn(false, '#E65100'), flex: 1 }}>Log Waste — Continue →</button>
            )}
          </div>
        </div>
      )}

      {/* CONFIRM & SUBMIT (step 7) */}
      {step === 7 && !success && (
        <div style={cardSt}>
          <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, textAlign: 'center' }}>Confirm Scan</p>
          <table style={{ width: '100%', fontSize: 14, fontFamily: "'SF Mono', monospace" }}>
            <tbody>
              <tr><td style={{ padding: 6, color: theme.mutedText }}>Employee</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.employee_name} ({scanData.employee_id})</td></tr>
              <tr><td style={{ padding: 6, color: theme.mutedText }}>Job</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.job_info || scanData.job_id}</td></tr>
              <tr><td style={{ padding: 6, color: theme.mutedText }}>Department</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.department_name}</td></tr>
              {scanData.station_name && <tr><td style={{ padding: 6, color: theme.mutedText }}>Station</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.station_name}</td></tr>}
              <tr><td style={{ padding: 6, color: theme.mutedText }}>Action</td><td style={{ padding: 6, fontWeight: 700, color: actionColor(scanData.action) }}>{actionLabel(scanData.action)}</td></tr>
              {scanData.reason_name && <tr><td style={{ padding: 6, color: theme.mutedText }}>Reason</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.reason_name}</td></tr>}
              {scanData.return_to_dept_name && <tr><td style={{ padding: 6, color: theme.mutedText }}>Return To</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.return_to_dept_name}</td></tr>}
              {scanData.maintenance_scope && <tr><td style={{ padding: 6, color: theme.mutedText }}>Maintenance</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.maintenance_scope === 'station' ? 'This Station' : 'Entire Department'}</td></tr>}
              {scanData.waste_sheets > 0 && <tr><td style={{ padding: 6, color: '#E65100' }}>Waste</td><td style={{ padding: 6, fontWeight: 700, color: '#E65100' }}>{scanData.waste_sheets} sheets</td></tr>}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={resetScan} style={{ ...bigBtn(false, '#C62828'), flex: 1 }}>✖ Cancel</button>
            <button onClick={submitScan} style={{ ...bigBtn(true), flex: 2 }}>✅ SUBMIT SCAN</button>
          </div>
        </div>
      )}

      {/* RESET BUTTON */}
      {((typeof step === 'number' && step > 0 && step <= 7) || step === 'intake_details') && !success && (
        <button onClick={resetScan} style={{
          display: 'block', margin: '12px auto', padding: '8px 20px',
          background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 6,
          color: theme.mutedText, cursor: 'pointer', fontSize: 12, fontFamily: "'SF Mono', monospace"
        }}>
          ↩ Start Over
        </button>
      )}

      {/* RECENT SCANS — shows Flex # not internal JOB code, START/STOP labels */}
      <div style={{ ...cardSt, marginTop: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, fontFamily: "'SF Mono', monospace" }}>Recent Scans</h3>
        {recentScans.length === 0 ? (
          <p style={{ color: theme.mutedText, fontSize: 13 }}>No scans yet. Be the first! 📱</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentScans.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${theme.border}`, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{s.employee_id}</span>
                <span>{s.job_sleeves?.flex_job_number || s.job_id}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11,
                  background: actionColor(s.action),
                  color: '#fff'
                }}>{s.action}</span>
                <span style={{ color: theme.mutedText }}>{new Date(s.scanned_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
