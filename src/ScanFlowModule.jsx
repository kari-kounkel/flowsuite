// ═══════════════════════════════════════════════════════
// SCANFLOW MODULE — Job Tracking & Production Scanning
// Plugs into FlowSuite App.jsx as a module
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';

// ─── SCAN FORM COMPONENT ───────────────────────────────
export function ScanFlowModule({ darkMode, orgId = 'minuteman' }) {
  const [activeTab, setActiveTab] = useState('scan');
  
  const tabs = [
    { id: 'scan', label: '📱 Scan', icon: '📱' },
    { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
    { id: 'jobs', label: '📋 Jobs', icon: '📋' },
    { id: 'stations', label: '🔧 Stations', icon: '🔧' },
    { id: 'waste', label: '🗑️ Waste Log', icon: '🗑️' },
  ];

  const bg = darkMode ? '#1a1410' : '#faf6f0';
  const cardBg = darkMode ? '#2a2018' : '#fff';
  const text = darkMode ? '#e8dcc8' : '#1a1410';
  const accent = darkMode ? '#C17F3E' : '#8B5E34';
  const border = darkMode ? '#3a2818' : '#e0d5c5';
  const mutedText = darkMode ? '#998870' : '#887755';

  return (
    <div style={{ color: text }}>
      {/* Module Tab Bar */}
      <div style={{ 
        display: 'flex', gap: 0, borderBottom: `2px solid ${border}`,
        marginBottom: 24, overflowX: 'auto'
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '12px 20px', background: activeTab === t.id ? accent : 'transparent',
            color: activeTab === t.id ? '#fff' : mutedText, border: 'none',
            borderBottom: activeTab === t.id ? `2px solid ${accent}` : '2px solid transparent',
            cursor: 'pointer', fontSize: 14, fontWeight: activeTab === t.id ? 700 : 400,
            fontFamily: "'SF Mono', 'Fira Code', monospace", whiteSpace: 'nowrap',
            borderRadius: '6px 6px 0 0', transition: 'all 0.2s'
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'scan' && <ScanForm darkMode={darkMode} orgId={orgId} accent={accent} cardBg={cardBg} text={text} border={border} mutedText={mutedText} />}
      {activeTab === 'dashboard' && <JobDashboard darkMode={darkMode} orgId={orgId} accent={accent} cardBg={cardBg} text={text} border={border} mutedText={mutedText} />}
      {activeTab === 'jobs' && <JobManager darkMode={darkMode} orgId={orgId} accent={accent} cardBg={cardBg} text={text} border={border} mutedText={mutedText} />}
      {activeTab === 'stations' && <StationManager darkMode={darkMode} orgId={orgId} accent={accent} cardBg={cardBg} text={text} border={border} mutedText={mutedText} />}
      {activeTab === 'waste' && <WasteLog darkMode={darkMode} orgId={orgId} accent={accent} cardBg={cardBg} text={text} border={border} mutedText={mutedText} />}
    </div>
  );
}

// ─── THE SCAN FORM ─────────────────────────────────────
function ScanForm({ darkMode, orgId, accent, cardBg, text, border, mutedText }) {
  const [step, setStep] = useState(0); // 0=employee, 1=job, 2=dept, 3=station, 4=action, 5=reason, 6=waste, 7=confirm
  const [scanData, setScanData] = useState({
    employee_id: '', employee_name: '',
    job_id: '', job_info: '',
    department_id: '', department_name: '',
    station_id: '', station_name: '',
    action: '', // IN, OUT, BLOCKER, MAINTENANCE, WASTE_STOP
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

  // Load reasons and departments
  useEffect(() => {
    loadReasons();
    loadDepartments();
    loadRecentScans();
  }, []);

  // Auto-focus scan input
  useEffect(() => {
    if (inputRef.current && step < 4) inputRef.current.focus();
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

  // Handle barcode scan (scanner acts as keyboard input)
  async function handleScan(e) {
    if (e.key !== 'Enter') return;
    const code = scanInput.trim().toUpperCase();
    setError('');
    setScanInput('');

    if (step === 0) {
      // Scan EMPLOYEE
      if (!code.startsWith('EMP')) { setError('Scan your EMPLOYEE badge first'); return; }
      const { data } = await supabase.from('employees').select('id, first_name, last_name, emp_code').eq('emp_code', code).single();
      if (!data) { setError(`Employee ${code} not found`); return; }
      setScanData(prev => ({ ...prev, employee_id: data.emp_code, employee_name: `${data.first_name} ${data.last_name}` }));
      setStep(1);
    } else if (step === 1) {
      // Scan JOB
      if (!code.startsWith('JOB')) { setError('Scan the JOB jacket'); return; }
      let { data } = await supabase.from('job_sleeves').select('*').eq('id', code).single();
      if (!data) {
        // Auto-create job sleeve if new
        const { data: newJob, error: err } = await supabase.from('job_sleeves')
          .insert({ id: code, status: 'active', org_id: orgId })
          .select().single();
        if (err) { setError(`Could not create job ${code}`); return; }
        data = newJob;
      }
      const info = data.customer_name ? `${data.flex_job_number || code} — ${data.customer_name}` : code;
      setScanData(prev => ({ ...prev, job_id: code, job_info: info }));
      setStep(2);
    } else if (step === 2) {
      // Scan DEPARTMENT
      if (!code.startsWith('DEPT')) { setError('Scan the DEPARTMENT barcode'); return; }
      const dept = departments.find(d => d.id === code);
      if (!dept) { setError(`Department ${code} not found`); return; }
      setScanData(prev => ({ ...prev, department_id: code, department_name: dept.name }));
      setStep(3);
    } else if (step === 3) {
      // Scan STATION (optional — can also skip)
      if (!code.startsWith('STA')) { setError('Scan a STATION barcode or tap Skip'); return; }
      const { data } = await supabase.from('stations').select('*').eq('id', code).single();
      if (!data) { setError(`Station ${code} not found`); return; }
      setScanData(prev => ({ ...prev, station_id: code, station_name: data.name }));
      setStep(4);
    }
  }

  function skipStation() {
    setStep(4);
  }

  function selectAction(action) {
    setScanData(prev => ({ ...prev, action }));
    if (action === 'BLOCKER') setStep(5);
    else if (action === 'MAINTENANCE') setStep(5.5);
    else if (action === 'WASTE_STOP') setStep(6);
    else setStep(6); // IN or OUT goes to waste question
  }

  function selectReason(reasonId) {
    const reason = reasons.find(r => r.id === reasonId);
    setScanData(prev => ({ ...prev, reason_id: reasonId, reason_name: reason?.name || '' }));
    if (reason?.requires_destination) setStep(5.2); // pick return dept
    else if (reason?.pauses_all_jobs) setStep(5.5); // maintenance scope
    else setStep(6); // waste question
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

  async function submitScan() {
    setError('');
    try {
      // Insert scan log
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

      // Update job sleeve location
      if (scanData.action === 'IN' || scanData.action === 'OUT') {
        await supabase.from('job_sleeves').update({
          current_department_id: scanData.action === 'OUT' ? null : scanData.department_id,
          current_station_id: scanData.action === 'OUT' ? null : (scanData.station_id || null),
          entered_current_at: new Date().toISOString(),
          status: 'active'
        }).eq('id', scanData.job_id);
      }

      // Log waste if any
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

      // Handle maintenance — pause jobs
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
      
      // Reset after 2 seconds
      setTimeout(() => {
        setSuccess('');
        resetScan();
      }, 2000);

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
    setStep(0);
    setError('');
    loadRecentScans();
  }

  const stepLabels = [
    '📱 Scan Employee Badge',
    '📋 Scan Job Jacket',
    '🏭 Scan Department',
    '🔧 Scan Station (or Skip)',
    '⚡ Pick Action',
    '❓ Pick Reason',
    '🗑️ Waste Check',
    '✅ Confirm & Submit'
  ];

  const cardStyle = {
    background: cardBg, borderRadius: 12, padding: 24,
    border: `1px solid ${border}`, marginBottom: 16
  };

  const bigButtonStyle = (isActive, color) => ({
    padding: '16px 24px', borderRadius: 10, border: `2px solid ${color || accent}`,
    background: isActive ? (color || accent) : 'transparent',
    color: isActive ? '#fff' : (color || accent),
    cursor: 'pointer', fontSize: 16, fontWeight: 700,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    transition: 'all 0.15s', minWidth: 120
  });

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Progress Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[0,1,2,3,4,5,6,7].map(i => (
          <div key={i} style={{
            flex: 1, height: 6, borderRadius: 3,
            background: i <= step ? accent : border,
            transition: 'background 0.3s'
          }} />
        ))}
      </div>

      {/* Current Step Label */}
      <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 18, fontWeight: 700, fontFamily: "'SF Mono', monospace" }}>
        {step <= 7 ? stepLabels[Math.floor(step)] : 'Complete'}
      </div>

      {/* Accumulated Scan Data */}
      {step > 0 && (
        <div style={{ ...cardStyle, padding: 16, opacity: 0.85 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {scanData.employee_name && <span style={{ background: accent, color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>👤 {scanData.employee_name}</span>}
            {scanData.job_id && <span style={{ background: '#2E7D32', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>📋 {scanData.job_info || scanData.job_id}</span>}
            {scanData.department_name && <span style={{ background: '#1565C0', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>🏭 {scanData.department_name}</span>}
            {scanData.station_name && <span style={{ background: '#6A1B9A', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>🔧 {scanData.station_name}</span>}
            {scanData.action && <span style={{ background: '#C62828', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>⚡ {scanData.action}</span>}
            {scanData.reason_name && <span style={{ background: '#E65100', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>❓ {scanData.reason_name}</span>}
          </div>
        </div>
      )}

      {/* Error / Success Messages */}
      {error && <div style={{ background: '#C62828', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, fontWeight: 600 }}>{error}</div>}
      {success && <div style={{ background: '#2E7D32', color: '#fff', padding: 16, borderRadius: 8, marginBottom: 12, fontWeight: 700, fontSize: 18, textAlign: 'center' }}>{success}</div>}

      {/* SCAN INPUT (steps 0-3) */}
      {step >= 0 && step <= 3 && !success && (
        <div style={cardStyle}>
          <input
            ref={inputRef}
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            placeholder={step === 0 ? 'Scan employee badge...' : step === 1 ? 'Scan job jacket...' : step === 2 ? 'Scan department...' : 'Scan station...'}
            style={{
              width: '100%', padding: 16, fontSize: 20, fontWeight: 700, textAlign: 'center',
              background: darkMode ? '#1a1410' : '#f5f0e8', color: text,
              border: `2px solid ${accent}`, borderRadius: 10,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              outline: 'none', boxSizing: 'border-box'
            }}
          />
          <p style={{ textAlign: 'center', color: mutedText, fontSize: 13, marginTop: 8 }}>
            Point scanner at barcode or type code manually
          </p>
          {step === 3 && (
            <button onClick={skipStation} style={{ ...bigButtonStyle(false), width: '100%', marginTop: 12 }}>
              Skip Station →
            </button>
          )}
        </div>
      )}

      {/* ACTION PICKER (step 4) */}
      {step === 4 && !success && (
        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button onClick={() => selectAction('IN')} style={bigButtonStyle(false, '#2E7D32')}>
              📥 IN
            </button>
            <button onClick={() => selectAction('OUT')} style={bigButtonStyle(false, '#1565C0')}>
              📤 OUT
            </button>
            <button onClick={() => selectAction('BLOCKER')} style={bigButtonStyle(false, '#C62828')}>
              🚫 BLOCKER
            </button>
            <button onClick={() => selectAction('WASTE_STOP')} style={bigButtonStyle(false, '#E65100')}>
              🛑 STOP — WASTE
            </button>
          </div>
          <button onClick={() => selectAction('MAINTENANCE')} style={{ ...bigButtonStyle(false, '#6A1B9A'), width: '100%', marginTop: 12 }}>
            🔧 MAINTENANCE
          </button>
        </div>
      )}

      {/* REASON PICKER (step 5) */}
      {step === 5 && !success && (
        <div style={cardStyle}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>What's the blocker?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reasons.filter(r => !r.pauses_all_jobs).map(r => (
              <button key={r.id} onClick={() => selectReason(r.id)} style={{ ...bigButtonStyle(false), textAlign: 'left', fontSize: 14 }}>
                {r.name} <span style={{ fontSize: 11, color: mutedText, marginLeft: 8 }}>{r.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* RETURN DESTINATION PICKER (step 5.2) */}
      {step === 5.2 && !success && (
        <div style={cardStyle}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Return to which department?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {departments.map(d => (
              <button key={d.id} onClick={() => selectReturnDept(d.id)} style={{ ...bigButtonStyle(false), textAlign: 'left', fontSize: 14 }}>
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MAINTENANCE SCOPE (step 5.5) */}
      {step === 5.5 && !success && (
        <div style={cardStyle}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>Pause jobs at:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button onClick={() => selectMaintenanceScope('station')} style={bigButtonStyle(false, '#6A1B9A')}>
              🔧 This Station Only
            </button>
            <button onClick={() => selectMaintenanceScope('department')} style={bigButtonStyle(false, '#6A1B9A')}>
              🏭 Entire Department
            </button>
          </div>
        </div>
      )}

      {/* WASTE QUESTION (step 6) */}
      {step === 6 && !success && (
        <div style={cardStyle}>
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
                background: darkMode ? '#1a1410' : '#f5f0e8', color: text,
                border: `2px solid ${border}`, borderRadius: 8,
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
                background: darkMode ? '#1a1410' : '#f5f0e8', color: text,
                border: `1px solid ${border}`, borderRadius: 8,
                fontFamily: "'SF Mono', monospace", resize: 'vertical', boxSizing: 'border-box'
              }}
            />
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {scanData.action !== 'WASTE_STOP' && scanData.waste_sheets === 0 && (
              <button onClick={() => setStep(7)} style={{ ...bigButtonStyle(false), flex: 1 }}>
                No Waste — Continue →
              </button>
            )}
            {(scanData.waste_sheets > 0 || scanData.action === 'WASTE_STOP') && (
              <button onClick={() => setStep(7)} style={{ ...bigButtonStyle(false, '#E65100'), flex: 1 }}>
                Log Waste — Continue →
              </button>
            )}
          </div>
        </div>
      )}

      {/* CONFIRM & SUBMIT (step 7) */}
      {step === 7 && !success && (
        <div style={cardStyle}>
          <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, textAlign: 'center' }}>Confirm Scan</p>
          <table style={{ width: '100%', fontSize: 14, fontFamily: "'SF Mono', monospace" }}>
            <tbody>
              <tr><td style={{ padding: 6, color: mutedText }}>Employee</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.employee_name} ({scanData.employee_id})</td></tr>
              <tr><td style={{ padding: 6, color: mutedText }}>Job</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.job_info || scanData.job_id}</td></tr>
              <tr><td style={{ padding: 6, color: mutedText }}>Department</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.department_name}</td></tr>
              {scanData.station_name && <tr><td style={{ padding: 6, color: mutedText }}>Station</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.station_name}</td></tr>}
              <tr><td style={{ padding: 6, color: mutedText }}>Action</td><td style={{ padding: 6, fontWeight: 700, color: scanData.action === 'IN' ? '#2E7D32' : scanData.action === 'OUT' ? '#1565C0' : '#C62828' }}>{scanData.action}</td></tr>
              {scanData.reason_name && <tr><td style={{ padding: 6, color: mutedText }}>Reason</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.reason_name}</td></tr>}
              {scanData.return_to_dept_name && <tr><td style={{ padding: 6, color: mutedText }}>Return To</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.return_to_dept_name}</td></tr>}
              {scanData.maintenance_scope && <tr><td style={{ padding: 6, color: mutedText }}>Maintenance</td><td style={{ padding: 6, fontWeight: 600 }}>{scanData.maintenance_scope === 'station' ? 'This Station' : 'Entire Department'}</td></tr>}
              {scanData.waste_sheets > 0 && <tr><td style={{ padding: 6, color: '#E65100' }}>Waste</td><td style={{ padding: 6, fontWeight: 700, color: '#E65100' }}>{scanData.waste_sheets} sheets</td></tr>}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={resetScan} style={{ ...bigButtonStyle(false, '#C62828'), flex: 1 }}>
              ✖ Cancel
            </button>
            <button onClick={submitScan} style={{ ...bigButtonStyle(true), flex: 2 }}>
              ✅ SUBMIT SCAN
            </button>
          </div>
        </div>
      )}

      {/* RESET BUTTON (always visible during scan) */}
      {step > 0 && step <= 7 && !success && (
        <button onClick={resetScan} style={{
          display: 'block', margin: '12px auto', padding: '8px 20px',
          background: 'transparent', border: `1px solid ${border}`, borderRadius: 6,
          color: mutedText, cursor: 'pointer', fontSize: 12, fontFamily: "'SF Mono', monospace"
        }}>
          ↩ Start Over
        </button>
      )}

      {/* RECENT SCANS */}
      <div style={{ ...cardStyle, marginTop: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, fontFamily: "'SF Mono', monospace" }}>Recent Scans</h3>
        {recentScans.length === 0 ? (
          <p style={{ color: mutedText, fontSize: 13 }}>No scans yet. Be the first! 📱</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentScans.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${border}`, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{s.employee_id}</span>
                <span>{s.job_id}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11,
                  background: s.action === 'IN' ? '#2E7D32' : s.action === 'OUT' ? '#1565C0' : '#C62828',
                  color: '#fff'
                }}>{s.action}</span>
                <span style={{ color: mutedText }}>{new Date(s.scanned_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── JOB DASHBOARD (WALL MOUNT) ───────────────────────
function JobDashboard({ darkMode, orgId, accent, cardBg, text, border, mutedText }) {
  const [jobs, setJobs] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadDashboard();
    if (autoRefresh) {
      const interval = setInterval(loadDashboard, 15000); // refresh every 15s
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  async function loadDashboard() {
    setLoading(true);
    const { data: jobData } = await supabase.from('active_jobs_dashboard').select('*');
    if (jobData) setJobs(jobData);

    const { data: maintData } = await supabase.from('maintenance_log')
      .select('*, stations(name), departments(name)')
      .is('ended_at', null);
    if (maintData) setMaintenance(maintData);

    setLoading(false);
  }

  function getTimeColor(minutes) {
    if (minutes < 30) return '#2E7D32';
    if (minutes < 120) return accent;
    if (minutes < 480) return '#E65100';
    return '#C62828';
  }

  function formatTime(minutes) {
    if (!minutes) return '—';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  }

  const cardStyle = {
    background: cardBg, borderRadius: 12, padding: 20,
    border: `1px solid ${border}`, marginBottom: 16
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", margin: 0 }}>
          📊 Production Floor — Live
        </h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: mutedText, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh (15s)
          </label>
          <button onClick={loadDashboard} style={{
            padding: '6px 12px', background: accent, color: '#fff', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
          }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Active Maintenance Warnings */}
      {maintenance.length > 0 && (
        <div style={{ background: '#6A1B9A', color: '#fff', padding: 16, borderRadius: 10, marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 8px 0' }}>🔧 MAINTENANCE IN PROGRESS</p>
          {maintenance.map(m => (
            <div key={m.id} style={{ fontSize: 13, marginBottom: 4 }}>
              {m.scope === 'station' ? `Station: ${m.stations?.name || m.station_id}` : `Department: ${m.departments?.name || m.department_id}`}
              {' — since '}{new Date(m.started_at).toLocaleTimeString()}
            </div>
          ))}
        </div>
      )}

      {/* Jobs Grid */}
      {loading ? (
        <p style={{ textAlign: 'center', color: mutedText }}>Loading...</p>
      ) : jobs.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <p style={{ fontSize: 16, color: mutedText }}>No active jobs on the floor</p>
          <p style={{ fontSize: 13, color: mutedText }}>Scan a job IN to get started</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {jobs.map(job => (
            <div key={job.job_code} style={{
              ...cardStyle, marginBottom: 0,
              borderLeft: `4px solid ${getTimeColor(job.minutes_in_state)}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 16, fontFamily: "'SF Mono', monospace" }}>
                  {job.flex_job_number || job.job_code}
                </span>
                <span style={{
                  fontWeight: 700, fontSize: 14, color: getTimeColor(job.minutes_in_state),
                  fontFamily: "'SF Mono', monospace"
                }}>
                  {formatTime(job.minutes_in_state)}
                </span>
              </div>
              {job.customer_name && <p style={{ fontSize: 13, margin: '0 0 4px 0', fontWeight: 600 }}>{job.customer_name}</p>}
              {job.job_description && <p style={{ fontSize: 12, margin: '0 0 8px 0', color: mutedText }}>{job.job_description}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {job.department_name && <span style={{ background: '#1565C0', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>🏭 {job.department_name}</span>}
                {job.station_name && <span style={{ background: '#6A1B9A', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>🔧 {job.station_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 20 }}>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent }}>{jobs.length}</div>
          <div style={{ fontSize: 11, color: mutedText }}>Active Jobs</div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#C62828' }}>{jobs.filter(j => j.minutes_in_state > 480).length}</div>
          <div style={{ fontSize: 11, color: mutedText }}>Over 8 Hours</div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#6A1B9A' }}>{maintenance.length}</div>
          <div style={{ fontSize: 11, color: mutedText }}>In Maintenance</div>
        </div>
      </div>
    </div>
  );
}

// ─── JOB MANAGER (INTAKE + RELEASE) ──────────────────
function JobManager({ darkMode, orgId, accent, cardBg, text, border, mutedText }) {
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [mode, setMode] = useState('list'); // list, intake, release
  const [filter, setFilter] = useState('active');
  const [toast, setToast] = useState('');
  const [scanInput, setScanInput] = useState('');
  const scanRef = useRef(null);

  // Intake form state
  const [intakeData, setIntakeData] = useState({
    sleeve_code: '', flex_job_number: '', customer_name: '', job_description: '',
    send_to: 'DEPT0012' // default = Design/Graphics
  });
  const [intakeStep, setIntakeStep] = useState(0); // 0=scan sleeve, 1=fill details

  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { loadJobs(); loadDepts(); }, [filter]);
  useEffect(() => { if (scanRef.current && mode === 'intake' && intakeStep === 0) scanRef.current.focus(); }, [mode, intakeStep]);

  async function loadJobs() {
    let query = supabase.from('job_sleeves').select('*, departments(name)').order('created_at', { ascending: false }).limit(50);
    if (filter !== 'all') query = query.eq('status', filter);
    const { data } = await query;
    if (data) setJobs(data);
  }

  async function loadDepts() {
    const { data } = await supabase.from('departments').select('id, name').eq('is_active', true).order('id');
    if (data) setDepartments(data);
  }

  // Handle sleeve scan during intake
  function handleIntakeScan(e) {
    if (e.key !== 'Enter') return;
    const code = scanInput.trim().toUpperCase();
    setScanInput('');
    if (!code.startsWith('JOB')) { sh('⚠️ Scan a JOB sleeve barcode'); return; }
    setIntakeData(prev => ({ ...prev, sleeve_code: code }));
    setIntakeStep(1);
  }

  // Start Job — create sleeve record + auto-route to dept with WAITING status
  async function startJob() {
    if (!intakeData.sleeve_code || !intakeData.flex_job_number) {
      sh('⚠️ Need sleeve code and Flex job number'); return;
    }

    // Check if sleeve already has an active job
    const { data: existing } = await supabase.from('job_sleeves')
      .select('id, status, flex_job_number')
      .eq('id', intakeData.sleeve_code).single();

    if (existing && existing.status === 'active') {
      sh(`⚠️ Sleeve ${intakeData.sleeve_code} already has active job ${existing.flex_job_number}`); return;
    }

    // Upsert — reuse released sleeves or create new
    const jobRecord = {
      id: intakeData.sleeve_code,
      flex_job_number: intakeData.flex_job_number,
      customer_name: intakeData.customer_name || null,
      job_description: intakeData.job_description || null,
      status: 'waiting',
      current_department_id: intakeData.send_to,
      current_station_id: null,
      entered_current_at: new Date().toISOString(),
      completed_at: null,
      org_id: orgId
    };

    const { error } = await supabase.from('job_sleeves').upsert(jobRecord, { onConflict: 'id' });

    if (error) { sh(`❌ Error: ${error.message}`); return; }

    const deptName = departments.find(d => d.id === intakeData.send_to)?.name || intakeData.send_to;
    sh(`✅ Job ${intakeData.flex_job_number} started → waiting at ${deptName}`);

    // Reset
    setIntakeData({ sleeve_code: '', flex_job_number: '', customer_name: '', job_description: '', send_to: 'DEPT0012' });
    setIntakeStep(0);
    loadJobs();
  }

  // Release Job — clear sleeve for reuse
  async function releaseJob(jobId) {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'released',
      flex_job_number: null,
      customer_name: null,
      job_description: null,
      current_department_id: null,
      current_station_id: null,
      entered_current_at: null,
      completed_at: new Date().toISOString()
    }).eq('id', jobId);

    if (!error) { sh(`✅ Sleeve ${jobId} released and ready for reuse`); loadJobs(); }
    else sh(`❌ ${error.message}`);
  }

  // Complete Job — mark done but don't release sleeve yet
  async function completeJob(jobId) {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'completed',
      current_department_id: null,
      current_station_id: null,
      completed_at: new Date().toISOString()
    }).eq('id', jobId);

    if (!error) { sh(`✅ Job ${jobId} completed`); loadJobs(); }
    else sh(`❌ ${error.message}`);
  }

  const cardStyle = { background: cardBg, borderRadius: 12, padding: 20, border: `1px solid ${border}`, marginBottom: 12 };
  const inputStyle = {
    width: '100%', padding: 10, fontSize: 14, background: darkMode ? '#1a1410' : '#f5f0e8',
    color: text, border: `1px solid ${border}`, borderRadius: 6,
    fontFamily: "'SF Mono', monospace", boxSizing: 'border-box', marginBottom: 8
  };

  const statusColors = {
    active: '#2E7D32', waiting: '#E65100', completed: '#1565C0',
    released: '#6A1B9A', on_hold: '#C62828', cancelled: '#555'
  };

  return (
    <div>
      {/* Header with mode buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", margin: 0 }}>📋 Job Sleeves</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setMode('intake'); setIntakeStep(0); setIntakeData(p => ({ ...p, sleeve_code: '', flex_job_number: '', customer_name: '', job_description: '' })); }} style={{
            padding: '8px 16px', background: mode === 'intake' ? '#2E7D32' : accent, color: '#fff', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13
          }}>📥 Start New Job</button>
          <button onClick={() => setMode('list')} style={{
            padding: '8px 16px', background: mode === 'list' ? accent : 'transparent', color: mode === 'list' ? '#fff' : mutedText,
            border: `1px solid ${border}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
          }}>📋 Job List</button>
        </div>
      </div>

      {/* ═══ INTAKE MODE ═══ */}
      {mode === 'intake' && (
        <div>
          <div style={{ ...cardStyle, borderLeft: '4px solid #2E7D32' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>📥 Job Intake — Customer Service</h3>

            {/* Step 0: Scan sleeve */}
            {intakeStep === 0 && (
              <div>
                <p style={{ fontSize: 13, color: mutedText, marginBottom: 12 }}>Scan the job sleeve barcode to begin</p>
                <input
                  ref={scanRef}
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={handleIntakeScan}
                  placeholder="Scan job sleeve barcode..."
                  style={{ ...inputStyle, fontSize: 20, fontWeight: 700, textAlign: 'center', padding: 16, border: `2px solid #2E7D32` }}
                />
                <p style={{ textAlign: 'center', color: mutedText, fontSize: 12 }}>Point scanner at sleeve barcode or type JOB code manually</p>
              </div>
            )}

            {/* Step 1: Fill details + route */}
            {intakeStep === 1 && (
              <div>
                {/* Scanned sleeve badge */}
                <div style={{ background: '#2E7D32', color: '#fff', padding: '8px 14px', borderRadius: 6, marginBottom: 16, fontWeight: 700, fontSize: 14, fontFamily: "'SF Mono', monospace" }}>
                  📋 Sleeve: {intakeData.sleeve_code}
                </div>

                <input
                  value={intakeData.flex_job_number}
                  onChange={e => setIntakeData(p => ({ ...p, flex_job_number: e.target.value }))}
                  placeholder="Flex job number (required)"
                  style={{ ...inputStyle, border: `2px solid ${accent}` }}
                  autoFocus
                />
                <input
                  value={intakeData.customer_name}
                  onChange={e => setIntakeData(p => ({ ...p, customer_name: e.target.value }))}
                  placeholder="Customer name (optional)"
                  style={inputStyle}
                />
                <input
                  value={intakeData.job_description}
                  onChange={e => setIntakeData(p => ({ ...p, job_description: e.target.value }))}
                  placeholder="Job description (optional)"
                  style={inputStyle}
                />

                {/* Route override */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: mutedText, display: 'block', marginBottom: 4 }}>Send to department:</label>
                  <select
                    value={intakeData.send_to}
                    onChange={e => setIntakeData(p => ({ ...p, send_to: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}{d.id === 'DEPT0012' ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => { setIntakeStep(0); setIntakeData(p => ({ ...p, sleeve_code: '' })); }} style={{
                    padding: '12px 20px', background: 'transparent', border: `1px solid ${border}`,
                    color: mutedText, borderRadius: 6, cursor: 'pointer', fontWeight: 600, flex: 1
                  }}>← Back</button>
                  <button onClick={startJob} disabled={!intakeData.flex_job_number} style={{
                    padding: '12px 20px', background: intakeData.flex_job_number ? '#2E7D32' : '#555',
                    color: '#fff', border: 'none', borderRadius: 6, cursor: intakeData.flex_job_number ? 'pointer' : 'not-allowed',
                    fontWeight: 700, fontSize: 15, flex: 2
                  }}>🚀 START JOB</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ LIST MODE ═══ */}
      {mode === 'list' && (
        <div>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['active', 'waiting', 'completed', 'released', 'on_hold', 'all'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: filter === f ? 700 : 400,
                background: filter === f ? accent : 'transparent', color: filter === f ? '#fff' : mutedText,
                border: `1px solid ${filter === f ? accent : border}`, cursor: 'pointer',
                textTransform: 'capitalize'
              }}>{f}</button>
            ))}
          </div>

          {/* Job List */}
          {jobs.length === 0 && <p style={{ color: mutedText, fontSize: 13, textAlign: 'center', padding: 20 }}>No jobs with status "{filter}"</p>}
          {jobs.map(j => (
            <div key={j.id} style={{ ...cardStyle, borderLeft: `4px solid ${statusColors[j.status] || '#555'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "'SF Mono', monospace" }}>
                    {j.flex_job_number || j.id}
                    <span style={{ fontWeight: 400, fontSize: 11, color: mutedText, marginLeft: 8 }}>{j.id}</span>
                  </div>
                  {j.customer_name && <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{j.customer_name}</div>}
                  {j.job_description && <div style={{ fontSize: 12, color: mutedText, marginTop: 2 }}>{j.job_description}</div>}
                  {j.departments?.name && <div style={{ fontSize: 11, color: mutedText, marginTop: 4 }}>📍 {j.departments.name}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                    background: statusColors[j.status] || '#555', color: '#fff', textTransform: 'uppercase'
                  }}>{j.status}</span>
                  {(j.status === 'active' || j.status === 'waiting') && (
                    <button onClick={() => completeJob(j.id)} style={{
                      padding: '4px 10px', background: '#1565C0', color: '#fff', border: 'none',
                      borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600
                    }}>✓ Complete</button>
                  )}
                  {j.status === 'completed' && (
                    <button onClick={() => releaseJob(j.id)} style={{
                      padding: '4px 10px', background: '#6A1B9A', color: '#fff', border: 'none',
                      borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600
                    }}>↩ Release Sleeve</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: toast.includes('❌') || toast.includes('⚠️') ? '#C62828' : '#2E7D32', color: '#fff', padding: '12px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, zIndex: 1000 }}>{toast}</div>}
    </div>
  );
}

// ─── STATION MANAGER ──────────────────────────────────
function StationManager({ darkMode, orgId, accent, cardBg, text, border, mutedText }) {
  const [stations, setStations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const { data: s } = await supabase.from('stations').select('*, departments(name)').order('id');
    const { data: d } = await supabase.from('departments').select('*').order('id');
    if (s) setStations(s);
    if (d) setDepartments(d);
  }

  async function updateStation(id, updates) {
    await supabase.from('stations').update(updates).eq('id', id);
    setEditing(null);
    loadData();
  }

  const cardStyle = { background: cardBg, borderRadius: 12, padding: 16, border: `1px solid ${border}`, marginBottom: 8 };
  const inputStyle = {
    padding: 8, fontSize: 13, background: darkMode ? '#1a1410' : '#f5f0e8',
    color: text, border: `1px solid ${border}`, borderRadius: 6,
    fontFamily: "'SF Mono', monospace"
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", marginBottom: 8 }}>🔧 Stations & Machines</h2>
      <p style={{ color: mutedText, fontSize: 13, marginBottom: 16 }}>
        Click a station to rename it and assign it to a department. Desiree's floor mapping goes here.
      </p>

      {stations.map(s => (
        <div key={s.id} style={cardStyle}>
          {editing === s.id ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 12, fontFamily: "'SF Mono', monospace", minWidth: 90 }}>{s.id}</span>
              <input
                defaultValue={s.name.includes('unmapped') ? '' : s.name}
                id={`name-${s.id}`}
                placeholder="Machine name"
                style={{ ...inputStyle, flex: 1, minWidth: 150 }}
              />
              <select defaultValue={s.department_id || ''} id={`dept-${s.id}`} style={{ ...inputStyle, minWidth: 140 }}>
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={() => {
                const name = document.getElementById(`name-${s.id}`).value;
                const dept = document.getElementById(`dept-${s.id}`).value;
                updateStation(s.id, { name: name || s.name, department_id: dept || null });
              }} style={{ padding: '8px 16px', background: accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Save</button>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 12px', background: 'transparent', color: mutedText, border: `1px solid ${border}`, borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
            </div>
          ) : (
            <div onClick={() => setEditing(s.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, fontFamily: "'SF Mono', monospace" }}>{s.id}</span>
                <span style={{ marginLeft: 12, fontWeight: s.name.includes('unmapped') ? 400 : 600, color: s.name.includes('unmapped') ? mutedText : text }}>
                  {s.name}
                </span>
              </div>
              {s.departments?.name && <span style={{ fontSize: 11, color: mutedText }}>📍 {s.departments.name}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── WASTE LOG ────────────────────────────────────────
function WasteLog({ darkMode, orgId, accent, cardBg, text, border, mutedText }) {
  const [waste, setWaste] = useState([]);
  const [totals, setTotals] = useState({ total: 0, emergency: 0 });

  useEffect(() => { loadWaste(); }, []);

  async function loadWaste() {
    const { data } = await supabase.from('waste_log')
      .select('*, job_sleeves(flex_job_number, customer_name)')
      .order('logged_at', { ascending: false }).limit(50);
    if (data) {
      setWaste(data);
      setTotals({
        total: data.reduce((sum, w) => sum + (w.sheets_wasted || 0), 0),
        emergency: data.filter(w => w.is_emergency).length
      });
    }
  }

  const cardStyle = { background: cardBg, borderRadius: 12, padding: 20, border: `1px solid ${border}`, marginBottom: 12 };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", marginBottom: 16 }}>🗑️ Waste Tracking</h2>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#E65100' }}>{totals.total}</div>
          <div style={{ fontSize: 11, color: mutedText }}>Total Sheets Wasted</div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#C62828' }}>{totals.emergency}</div>
          <div style={{ fontSize: 11, color: mutedText }}>Emergency Stops</div>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: accent }}>{waste.length}</div>
          <div style={{ fontSize: 11, color: mutedText }}>Waste Events</div>
        </div>
      </div>

      {/* Waste Log Table */}
      {waste.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <p style={{ color: mutedText }}>No waste logged yet. That's either great news or nobody's scanning. 🤷</p>
        </div>
      ) : waste.map(w => (
        <div key={w.id} style={{
          ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderLeft: w.is_emergency ? '4px solid #C62828' : `4px solid ${border}`
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {w.job_sleeves?.flex_job_number || w.job_id}
              {w.job_sleeves?.customer_name && <span style={{ fontWeight: 400, color: mutedText, marginLeft: 8 }}>{w.job_sleeves.customer_name}</span>}
            </div>
            {w.reason && <div style={{ fontSize: 12, color: mutedText, marginTop: 2 }}>{w.reason}</div>}
            <div style={{ fontSize: 11, color: mutedText, marginTop: 2 }}>{w.employee_id} — {new Date(w.logged_at).toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#E65100' }}>{w.sheets_wasted}</div>
            <div style={{ fontSize: 10, color: mutedText }}>sheets</div>
            {w.is_emergency && <span style={{ fontSize: 10, fontWeight: 700, color: '#C62828' }}>🛑 EMERGENCY</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ScanFlowModule;
