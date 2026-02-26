// ═══════════════════════════════════════════════════════
// JOB MANAGER — Intake, job list, complete, available
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase.js';
import { cardStyle as getCardStyle, inputStyle as getInputStyle, statusColors, getDeptColor } from './scanflowTheme.js';
import { GanttView } from './GanttView.jsx';
import { JobDetail } from './JobDetail.jsx';

export function JobManager({ theme, orgId, darkMode, forceMode }) {
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [mode, setMode] = useState(forceMode || 'list');
  const [filter, setFilter] = useState('active');
  const [toast, setToast] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const scanRef = useRef(null);

  const [intakeData, setIntakeData] = useState({
    sleeve_code: '', flex_job_number: '', customer_name: '', job_description: '',
    required_materials: '', send_to: 'DEPT0012', due_date: '', is_rush: false
  });
  const [intakeStep, setIntakeStep] = useState(0);

  const cardSt = getCardStyle(theme);
  const inpSt = getInputStyle(theme);
  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // If forceMode changes (e.g. navigating to New Job tab), reset to intake
  useEffect(() => { if (forceMode) setMode(forceMode); }, [forceMode]);

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

  function handleIntakeScan(e) {
    if (e.key !== 'Enter') return;
    const code = scanInput.trim().toUpperCase();
    setScanInput('');
    if (!code.startsWith('JOB')) { sh('⚠️ Scan a JOB sleeve barcode'); return; }
    setIntakeData(prev => ({ ...prev, sleeve_code: code }));
    setIntakeStep(1);
  }

  async function startJob() {
    if (!intakeData.sleeve_code || !intakeData.flex_job_number) {
      sh('⚠️ Need sleeve code and Flex job number'); return;
    }

    const { data: existing } = await supabase.from('job_sleeves')
      .select('id, status, flex_job_number')
      .eq('id', intakeData.sleeve_code).single();

    if (existing && existing.status === 'active') {
      sh(`⚠️ Sleeve ${intakeData.sleeve_code} already has active job ${existing.flex_job_number}`); return;
    }

    const jobRecord = {
      id: intakeData.sleeve_code,
      flex_job_number: intakeData.flex_job_number,
      customer_name: intakeData.customer_name || null,
      job_description: intakeData.job_description || null,
      required_materials: intakeData.required_materials || null,
      status: 'waiting',
      current_department_id: intakeData.send_to,
      current_station_id: null,
      entered_current_at: new Date().toISOString(),
      completed_at: null,
      due_date: intakeData.due_date || null,
      is_rush: intakeData.is_rush,
      org_id: orgId
    };

    const { error } = await supabase.from('job_sleeves').upsert(jobRecord, { onConflict: 'id' });
    if (error) { sh(`❌ Error: ${error.message}`); return; }

    const deptName = departments.find(d => d.id === intakeData.send_to)?.name || intakeData.send_to;
    sh(`✅ Job ${intakeData.flex_job_number} started → waiting at ${deptName}${intakeData.is_rush ? ' 🔴 RUSH' : ''}`);

    setIntakeData({ sleeve_code: '', flex_job_number: '', customer_name: '', job_description: '', required_materials: '', send_to: 'DEPT0012', due_date: '', is_rush: false });
    setIntakeStep(0);
    loadJobs();
  }

  async function makeAvailable(jobId) {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'available', flex_job_number: null, customer_name: null,
      job_description: null, required_materials: null, current_department_id: null, current_station_id: null,
      entered_current_at: null, completed_at: new Date().toISOString(),
      due_date: null, is_rush: false
    }).eq('id', jobId);
    if (!error) { sh(`✅ Sleeve ${jobId} is now available for reuse`); loadJobs(); }
    else sh(`❌ ${error.message}`);
  }

  async function completeJob(jobId) {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'completed', current_department_id: null,
      current_station_id: null, completed_at: new Date().toISOString()
    }).eq('id', jobId);
    if (!error) { sh(`✅ Job ${jobId} completed`); loadJobs(); }
    else sh(`❌ ${error.message}`);
  }

  async function archiveJob(jobId) {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'archived',
      completed_at: new Date().toISOString()
    }).eq('id', jobId);
    if (!error) { sh(`📦 Job ${jobId} archived`); loadJobs(); }
    else sh(`❌ ${error.message}`);
  }

  async function deleteJob(jobId, flexNum) {
    if (!confirm(`Delete job ${flexNum || jobId}? This clears the sleeve back to available.`)) return;
    const { error } = await supabase.from('job_sleeves').update({
      status: 'available', flex_job_number: null, customer_name: null,
      job_description: null, required_materials: null, current_department_id: null, current_station_id: null,
      entered_current_at: null, completed_at: null,
      due_date: null, is_rush: false
    }).eq('id', jobId);
    if (!error) { sh(`🗑️ Job deleted — sleeve ${jobId} is now available`); loadJobs(); }
    else sh(`❌ ${error.message}`);
  }

  // If forced to intake mode (from New Job tab), show ONLY the intake form
  if (forceMode === 'intake') {
    return (
      <div>
        <div style={{ ...cardSt, borderLeft: '4px solid #2E7D32' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>📋 New Job Intake — Customer Service</h3>

          {intakeStep === 0 && (
            <div>
              <p style={{ fontSize: 13, color: theme.mutedText, marginBottom: 12 }}>Scan the job sleeve barcode to begin</p>
              <input
                ref={scanRef}
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={handleIntakeScan}
                placeholder="Scan job sleeve barcode..."
                style={{ ...inpSt, fontSize: 20, fontWeight: 700, textAlign: 'center', padding: 16, border: `2px solid #2E7D32` }}
              />
              <p style={{ textAlign: 'center', color: theme.mutedText, fontSize: 12 }}>Point scanner at sleeve barcode or type JOB code manually</p>
            </div>
          )}

          {intakeStep === 1 && (
            <div>
              <div style={{ background: '#2E7D32', color: '#fff', padding: '8px 14px', borderRadius: 6, marginBottom: 16, fontWeight: 700, fontSize: 14, fontFamily: "'SF Mono', monospace" }}>
                📋 Sleeve: {intakeData.sleeve_code}
              </div>

              <input value={intakeData.flex_job_number} onChange={e => setIntakeData(p => ({ ...p, flex_job_number: e.target.value }))}
                placeholder="Flex job number (required)" style={{ ...inpSt, border: `2px solid ${theme.accent}` }} autoFocus />
              <input value={intakeData.customer_name} onChange={e => setIntakeData(p => ({ ...p, customer_name: e.target.value }))}
                placeholder="Customer name (optional)" style={inpSt} />
              <input value={intakeData.job_description} onChange={e => setIntakeData(p => ({ ...p, job_description: e.target.value }))}
                placeholder="Job description (optional)" style={inpSt} />

              {/* Required Materials — free text for now */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: theme.mutedText, display: 'block', marginBottom: 4 }}>Required materials:</label>
                <textarea
                  value={intakeData.required_materials}
                  onChange={e => setIntakeData(p => ({ ...p, required_materials: e.target.value }))}
                  placeholder="e.g. 500 sheets 80lb gloss, 2 rolls laminate, black ink..."
                  rows={2}
                  style={{ ...inpSt, resize: 'vertical', minHeight: 48 }}
                />
              </div>

              {/* Due Date */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: theme.mutedText, display: 'block', marginBottom: 4 }}>Due date:</label>
                <input type="date" value={intakeData.due_date} onChange={e => setIntakeData(p => ({ ...p, due_date: e.target.value }))}
                  style={{ ...inpSt, cursor: 'pointer' }} />
              </div>

              {/* Rush Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer', padding: '8px 12px',
                background: intakeData.is_rush ? '#C62828' : 'transparent',
                border: `2px solid ${intakeData.is_rush ? '#C62828' : theme.border}`,
                borderRadius: 8, transition: 'all 0.2s'
              }}>
                <input type="checkbox" checked={intakeData.is_rush} onChange={e => setIntakeData(p => ({ ...p, is_rush: e.target.checked }))} />
                <span style={{ fontWeight: 700, fontSize: 14, color: intakeData.is_rush ? '#fff' : theme.mutedText }}>
                  🔴 RUSH ORDER
                </span>
              </label>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: theme.mutedText, display: 'block', marginBottom: 4 }}>Send to department:</label>
                <select value={intakeData.send_to} onChange={e => setIntakeData(p => ({ ...p, send_to: e.target.value }))}
                  style={{ ...inpSt, cursor: 'pointer' }}>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}{d.id === 'DEPT0012' ? ' (default)' : ''}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => { setIntakeStep(0); setIntakeData(p => ({ ...p, sleeve_code: '' })); }} style={{
                  padding: '12px 20px', background: 'transparent', border: `1px solid ${theme.border}`,
                  color: theme.mutedText, borderRadius: 6, cursor: 'pointer', fontWeight: 600, flex: 1
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

        {/* Toast */}
        {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: toast.includes('❌') || toast.includes('⚠️') ? '#C62828' : '#2E7D32', color: '#fff', padding: '12px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, zIndex: 1000 }}>{toast}</div>}
      </div>
    );
  }

  return (
    <div>
      {/* Header with mode buttons — NO Start New Job here anymore */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", margin: 0 }}>📋 Job Sleeves</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMode('list')} style={{
            padding: '8px 16px', background: mode === 'list' ? theme.accent : 'transparent', color: mode === 'list' ? '#fff' : theme.mutedText,
            border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
          }}>📋 Job List</button>
          <button onClick={() => setMode('due_dates')} style={{
            padding: '8px 16px', background: mode === 'due_dates' ? theme.accent : 'transparent', color: mode === 'due_dates' ? '#fff' : theme.mutedText,
            border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
          }}>📅 Due Dates</button>
          <button onClick={() => setMode('gantt')} style={{
            padding: '8px 16px', background: mode === 'gantt' ? '#1565C0' : 'transparent', color: mode === 'gantt' ? '#fff' : theme.mutedText,
            border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
          }}>📊 Gantt</button>
          <button onClick={() => setMode('sleeves')} style={{
            padding: '8px 16px', background: mode === 'sleeves' ? '#6A1B9A' : 'transparent', color: mode === 'sleeves' ? '#fff' : theme.mutedText,
            border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
          }}>🗂️ Sleeves</button>
          <button onClick={() => setMode('assign')} style={{
            padding: '8px 16px', background: mode === 'assign' ? '#E65100' : 'transparent', color: mode === 'assign' ? '#fff' : theme.mutedText,
            border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
          }}>🔗 Assign</button>
        </div>
      </div>

      {/* ═══ DUE DATES VIEW ═══ */}
      {mode === 'due_dates' && (
        <DueDateView theme={theme} darkMode={darkMode} orgId={orgId} cardSt={cardSt} onComplete={completeJob} />
      )}

      {/* ═══ GANTT VIEW ═══ */}
      {mode === 'gantt' && (
        <GanttView theme={theme} darkMode={darkMode} orgId={orgId} />
      )}

      {/* ═══ SLEEVE INVENTORY ═══ */}
      {mode === 'sleeves' && (
        <SleeveInventory theme={theme} darkMode={darkMode} orgId={orgId} />
      )}

      {/* ═══ LIST MODE ═══ */}
      {mode === 'list' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['active', 'waiting', 'completed', 'archived', 'on_hold', 'all'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: filter === f ? 700 : 400,
                background: filter === f ? theme.accent : 'transparent', color: filter === f ? '#fff' : theme.mutedText,
                border: `1px solid ${filter === f ? theme.accent : theme.border}`, cursor: 'pointer',
                textTransform: 'capitalize'
              }}>{f}</button>
            ))}
          </div>

          {jobs.length === 0 && <p style={{ color: theme.mutedText, fontSize: 13, textAlign: 'center', padding: 20 }}>No jobs with status "{filter}"</p>}
          {jobs.map(j => {
            const dc = getDeptColor(j.current_department_id, darkMode);
            return (
              <div key={j.id} onClick={() => setSelectedJobId(j.id)} style={{
                ...cardSt, marginBottom: 12,
                background: dc.bg || cardSt.background,
                borderLeft: `4px solid ${dc.border || statusColors[j.status] || '#555'}`,
                border: `1px solid ${dc.border || theme.border}`,
                borderLeftWidth: 4,
                cursor: 'pointer',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    {/* RUSH indicator */}
                    {j.is_rush && (
                      <div style={{ background: '#C62828', color: '#fff', padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 800, display: 'inline-block', marginBottom: 6, letterSpacing: 1 }}>
                        🔴 RUSH
                      </div>
                    )}
                    {/* Flex # as primary — BIG */}
                    <div style={{ fontWeight: 800, fontSize: 18, fontFamily: "'SF Mono', monospace" }}>
                      {j.flex_job_number || j.id}
                    </div>
                    {/* Customer name — BIGGER */}
                    {j.customer_name && <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: theme.text }}>{j.customer_name}</div>}
                    {j.job_description && <div style={{ fontSize: 12, color: theme.mutedText, marginTop: 2 }}>{j.job_description}</div>}
                    {/* Required materials */}
                    {j.required_materials && (
                      <div style={{ fontSize: 11, color: theme.mutedText, marginTop: 4, fontStyle: 'italic' }}>
                        🧾 Materials: {j.required_materials}
                      </div>
                    )}
                    {/* Due date */}
                    {j.due_date && (
                      <div style={{ fontSize: 12, color: new Date(j.due_date) < new Date() ? '#C62828' : theme.mutedText, fontWeight: new Date(j.due_date) < new Date() ? 700 : 400, marginTop: 4 }}>
                        📅 Due: {new Date(j.due_date).toLocaleDateString()}
                        {new Date(j.due_date) < new Date() && ' ⚠️ OVERDUE'}
                      </div>
                    )}
                    {j.departments?.name && (
                      <div style={{ fontSize: 12, color: dc.label || theme.mutedText, fontWeight: 600, marginTop: 4 }}>
                        📍 {j.departments.name}
                      </div>
                    )}
                    {/* Sleeve code small underneath */}
                    <div style={{ fontSize: 10, color: theme.mutedText, marginTop: 4, fontFamily: "'SF Mono', monospace" }}>
                      sleeve: {j.id}
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
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
                      <button onClick={() => makeAvailable(j.id)} style={{
                        padding: '4px 10px', background: '#6A1B9A', color: '#fff', border: 'none',
                        borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600
                      }}>↩ Make Available</button>
                    )}
                    {(j.status === 'completed' || j.status === 'waiting') && (
                      <button onClick={() => archiveJob(j.id)} style={{
                        padding: '4px 10px', background: '#37474F', color: '#fff', border: 'none',
                        borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600
                      }}>📦 Archive</button>
                    )}
                    <button onClick={() => deleteJob(j.id, j.flex_job_number)} style={{
                      padding: '4px 10px', background: 'transparent', color: '#C62828', border: `1px solid #C62828`,
                      borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600
                    }}>🗑️ Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ JOB DETAIL MODAL ═══ */}
      {selectedJobId && (
        <JobDetail
          jobId={selectedJobId}
          theme={theme}
          darkMode={darkMode}
          onClose={() => setSelectedJobId(null)}
          onUpdate={loadJobs}
        />
      )}

      {/* ═══ SLEEVE ASSIGNMENT MODE ═══ */}
      {mode === 'assign' && (
        <SleeveAssignment theme={theme} darkMode={darkMode} orgId={orgId} onDone={() => { setMode('list'); loadJobs(); }} />
      )}

      {/* Toast */}
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: toast.includes('❌') || toast.includes('⚠️') ? '#C62828' : '#2E7D32', color: '#fff', padding: '12px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, zIndex: 1000 }}>{toast}</div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// SLEEVE INVENTORY — Count bar + compact chip grid
// ═══════════════════════════════════════════════════════

function SleeveInventory({ theme, darkMode, orgId }) {
  const [sleeves, setSleeves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAvailable, setShowAvailable] = useState(false);

  useEffect(() => { loadSleeves(); }, []);

  async function loadSleeves() {
    setLoading(true);
    // Load ALL sleeves — just id and status, lightweight
    const { data } = await supabase.from('job_sleeves')
      .select('id, status, flex_job_number, customer_name, is_rush, current_department_id')
      .like('id', 'JOB%')
      .order('id', { ascending: true });
    if (data) setSleeves(data);
    setLoading(false);
  }

  if (loading) return <p style={{ color: theme.mutedText, textAlign: 'center', padding: 40 }}>Loading sleeve inventory...</p>;

  // Count by status
  const counts = { available: 0, active: 0, waiting: 0, completed: 0, archived: 0, on_hold: 0 };
  sleeves.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });
  const inUse = sleeves.filter(s => s.status !== 'available');
  const total = sleeves.length;

  const statusConfig = {
    available: { label: '🟢 Available', color: '#4CAF50' },
    active: { label: '🔵 Active', color: '#1565C0' },
    waiting: { label: '🟠 Waiting', color: '#E65100' },
    completed: { label: '✅ Completed', color: '#2E7D32' },
    archived: { label: '📦 Archived', color: '#37474F' },
    on_hold: { label: '⏸️ On Hold', color: '#F57C00' },
  };

  function chipColor(status) {
    if (status === 'available') return { bg: darkMode ? '#1b2e1b' : '#E8F5E9', text: darkMode ? '#66BB6A' : '#2E7D32', border: darkMode ? '#2E7D32' : '#A5D6A7' };
    if (status === 'active') return { bg: darkMode ? '#0d2744' : '#E3F2FD', text: '#1565C0', border: '#64B5F6' };
    if (status === 'waiting') return { bg: darkMode ? '#331a00' : '#FFF3E0', text: '#E65100', border: '#FFB74D' };
    if (status === 'completed') return { bg: darkMode ? '#1b331b' : '#E8F5E9', text: '#2E7D32', border: '#81C784' };
    if (status === 'archived') return { bg: darkMode ? '#222' : '#ECEFF1', text: '#546E7A', border: '#90A4AE' };
    return { bg: darkMode ? '#222' : '#f5f5f5', text: '#777', border: '#999' };
  }

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, fontFamily: "'SF Mono', monospace" }}>
        🗂️ Sleeve Inventory — {total} Total
      </h3>

      {/* ── Counts Bar ── */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
        padding: 16, background: darkMode ? '#111' : '#fafafa',
        border: `1px solid ${theme.border}`, borderRadius: 8
      }}>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          counts[key] > 0 && (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 8,
              background: darkMode ? '#1a1a1a' : '#fff',
              border: `1px solid ${theme.border}`,
              minWidth: 120
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color }} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color, fontFamily: "'SF Mono', monospace" }}>
                  {counts[key]}
                </div>
                <div style={{ fontSize: 10, color: theme.mutedText, fontWeight: 600 }}>
                  {key.toUpperCase()}
                </div>
              </div>
            </div>
          )
        ))}
      </div>

      {/* ── Visual bar ── */}
      <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', marginBottom: 20 }}>
        {Object.entries(counts).map(([key, count]) => (
          count > 0 && (
            <div key={key} style={{
              width: `${(count / total) * 100}%`,
              background: statusConfig[key]?.color || '#555',
              transition: 'width 0.3s'
            }} />
          )
        ))}
      </div>

      {/* ── Toggle to show/hide available chips ── */}
      {inUse.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 8, fontFamily: "'SF Mono', monospace" }}>
            🔵 In-Use Sleeves ({inUse.length})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {inUse.map(s => {
              const cc = chipColor(s.status);
              return (
                <div key={s.id} title={`${s.id}${s.flex_job_number ? ' → ' + s.flex_job_number : ''}${s.customer_name ? ' — ' + s.customer_name : ''}\nStatus: ${s.status}${s.is_rush ? ' 🔴 RUSH' : ''}`}
                  style={{
                    padding: '3px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                    fontFamily: "'SF Mono', monospace",
                    background: cc.bg, color: cc.text, border: `1px solid ${cc.border}`,
                    cursor: 'default', whiteSpace: 'nowrap',
                    boxShadow: s.is_rush ? '0 0 0 1px #C62828' : 'none'
                  }}>
                  {s.id.replace('JOB00', '')}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.mutedText, cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" checked={showAvailable} onChange={e => setShowAvailable(e.target.checked)} />
        Show all {counts.available} available sleeves
      </label>

      {showAvailable && (
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: theme.mutedText, marginBottom: 8, fontFamily: "'SF Mono', monospace" }}>
            🟢 Available Sleeves ({counts.available})
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {sleeves.filter(s => s.status === 'available').map(s => (
              <div key={s.id} style={{
                padding: '2px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600,
                fontFamily: "'SF Mono', monospace",
                background: darkMode ? '#1b2e1b' : '#E8F5E9',
                color: darkMode ? '#4a7a4a' : '#81C784',
                border: `1px solid ${darkMode ? '#2a3e2a' : '#C8E6C9'}`,
              }}>
                {s.id.replace('JOB00', '')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Refresh */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button onClick={loadSleeves} style={{
          padding: '6px 16px', background: 'transparent', border: `1px solid ${theme.border}`,
          color: theme.mutedText, borderRadius: 4, cursor: 'pointer', fontSize: 11
        }}>↻ Refresh Inventory</button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// SLEEVE ASSIGNMENT — Enter job # first, then scan sleeve
// Flow: Type job number → find import → scan sleeve → next
// ═══════════════════════════════════════════════════════

function SleeveAssignment({ theme, darkMode, orgId, onDone }) {
  const [imports, setImports] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('job'); // 'job' | 'newjob' | 'sleeve' | 'done' | 'list'
  const [jobInput, setJobInput] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [matchedImport, setMatchedImport] = useState(null);
  const [toast, setToast] = useState('');
  const [assigned, setAssigned] = useState([]); // track what we've done this session
  const [newJob, setNewJob] = useState({ flex_job_number: '', customer_name: '', job_description: '', send_to: 'DEPT0012', due_date: '', is_rush: false, status: 'waiting' });
  const [editingAssigned, setEditingAssigned] = useState(null); // index into assigned[] for editing
  const [editForm, setEditForm] = useState({});
  const [statusInput, setStatusInput] = useState(''); // for custom status typing on sleeve step
  const [isNewJob, setIsNewJob] = useState(false); // tracks if current assignment is a new job (not from imports)
  const jobRef = useRef(null);
  const scanRef = useRef(null);
  const inpSt = getInputStyle(theme);

  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { loadImports(); loadDepts(); }, []);
  useEffect(() => { if (jobRef.current && step === 'job') jobRef.current.focus(); }, [step]);
  useEffect(() => { if (scanRef.current && step === 'sleeve') scanRef.current.focus(); }, [step]);

  async function loadDepts() {
    const { data } = await supabase.from('departments').select('id, name').eq('is_active', true).order('id');
    if (data) setDepartments(data);
  }

  async function loadImports() {
    setLoading(true);
    const { data } = await supabase.from('job_sleeves')
      .select('*')
      .like('id', 'IMP-%')
      .order('id', { ascending: true });
    if (data) {
      setImports(data);
      if (data.length === 0) setStep('done');
    }
    setLoading(false);
  }

  // Step 1: User types/scans a job number and hits Enter
  async function handleJobLookup(e) {
    if (e.key !== 'Enter') return;
    const query = jobInput.trim();
    if (!query) return;

    // Search imports by flex_job_number (case-insensitive partial match)
    const match = imports.find(imp =>
      imp.flex_job_number && imp.flex_job_number.toLowerCase().includes(query.toLowerCase())
    );

    if (!match) {
      // Also try searching by IMP id directly
      const idMatch = imports.find(imp => imp.id.toLowerCase().includes(query.toLowerCase()));
      if (idMatch) {
        setMatchedImport(idMatch);
        setIsNewJob(false);
        setStatusInput(idMatch.status || 'waiting');
        setJobInput('');
        setStep('sleeve');
        return;
      }
      // Not found — offer to create it
      setNewJob(prev => ({ ...prev, flex_job_number: query }));
      setJobInput('');
      setStep('newjob');
      return;
    }

    setMatchedImport(match);
    setIsNewJob(false);
    setStatusInput(match.status || 'waiting');
    setJobInput('');
    setStep('sleeve');
  }

  // Step 1b: Create a new job on the fly and go to sleeve scan
  function handleNewJobSubmit() {
    if (!newJob.flex_job_number) { sh('⚠️ Job number is required'); return; }

    // Build a virtual import object (not saved to DB — goes straight to sleeve)
    const virtualImport = {
      id: null, // no IMP record
      flex_job_number: newJob.flex_job_number,
      customer_name: newJob.customer_name || null,
      job_description: newJob.job_description || null,
      required_materials: null,
      status: newJob.status || 'waiting',
      current_department_id: newJob.send_to,
      current_station_id: null,
      due_date: newJob.due_date || null,
      is_rush: newJob.is_rush,
    };

    setMatchedImport(virtualImport);
    setIsNewJob(true);
    setStatusInput(virtualImport.status);
    setStep('sleeve');
  }

  // Step 2: User scans a sleeve barcode
  async function handleSleeveScan(e) {
    if (e.key !== 'Enter') return;
    const code = scanInput.trim().toUpperCase();
    setScanInput('');

    if (!code.startsWith('JOB')) { sh('⚠️ Scan a JOB sleeve barcode'); return; }
    if (!matchedImport) { sh('⚠️ No import selected'); return; }

    // Check sleeve is available
    const { data: sleeve } = await supabase.from('job_sleeves')
      .select('id, status')
      .eq('id', code)
      .single();

    if (!sleeve) { sh(`⚠️ Sleeve ${code} not found`); return; }
    if (sleeve.status !== 'available') { sh(`⚠️ Sleeve ${code} is ${sleeve.status}, not available`); return; }

    const finalStatus = statusInput.trim() || matchedImport.status || 'waiting';

    // Transfer the job data to the real sleeve
    const { error: updateErr } = await supabase.from('job_sleeves').update({
      flex_job_number: matchedImport.flex_job_number,
      customer_name: matchedImport.customer_name,
      job_description: matchedImport.job_description,
      required_materials: matchedImport.required_materials,
      status: finalStatus,
      current_department_id: matchedImport.current_department_id,
      current_station_id: matchedImport.current_station_id,
      entered_current_at: new Date().toISOString(),
      due_date: matchedImport.due_date,
      is_rush: matchedImport.is_rush || false,
    }).eq('id', code);

    if (updateErr) { sh(`❌ ${updateErr.message}`); return; }

    // If this was an import (not a new job), delete the IMP record
    if (!isNewJob && matchedImport.id) {
      const { error: delErr } = await supabase.from('job_sleeves').delete().eq('id', matchedImport.id);
      if (delErr) { sh(`⚠️ Sleeve linked but couldn't delete import: ${delErr.message}`); }
    }

    // Track it for the session log (with enough data to edit later)
    setAssigned(prev => [...prev, {
      jobNum: matchedImport.flex_job_number || matchedImport.id,
      customer: matchedImport.customer_name,
      sleeve: code,
      wasNew: isNewJob,
      status: finalStatus,
      description: matchedImport.job_description,
      deptId: matchedImport.current_department_id,
      dueDate: matchedImport.due_date,
      isRush: matchedImport.is_rush,
    }]);

    sh(`✅ ${matchedImport.flex_job_number || matchedImport.id} → ${code} [${finalStatus}]`);

    // Remove from local list if it was an import
    if (!isNewJob && matchedImport.id) {
      const remaining = imports.filter(i => i.id !== matchedImport.id);
      setImports(remaining);
    }

    // Reset for next
    setMatchedImport(null);
    setIsNewJob(false);
    setStatusInput('');
    setNewJob({ flex_job_number: '', customer_name: '', job_description: '', send_to: 'DEPT0012', due_date: '', is_rush: false, status: 'waiting' });
    setStep('job');
  }

  // Edit a previously assigned job from the session log
  async function handleEditSave() {
    if (editingAssigned === null) return;
    const item = assigned[editingAssigned];
    const ef = editForm;

    const { error } = await supabase.from('job_sleeves').update({
      customer_name: ef.customer_name || null,
      job_description: ef.job_description || null,
      status: ef.status || 'waiting',
      current_department_id: ef.deptId || null,
      due_date: ef.dueDate || null,
      is_rush: ef.isRush || false,
    }).eq('id', item.sleeve);

    if (error) { sh(`❌ ${error.message}`); return; }

    // Update local assigned list
    const updated = [...assigned];
    updated[editingAssigned] = { ...item, customer: ef.customer_name, description: ef.job_description, status: ef.status, deptId: ef.deptId, dueDate: ef.dueDate, isRush: ef.isRush };
    setAssigned(updated);
    setEditingAssigned(null);
    sh(`✅ Updated ${item.jobNum} on sleeve ${item.sleeve}`);
  }

  // Common status presets for the combo picker
  const statusPresets = ['waiting', 'active', 'completed', 'on_hold', 'invoicing', 'delivering', 'proofing', 'printing'];

  function skipToList() {
    // Let them pick from the list instead of typing
    setStep('list');
  }

  if (loading) return <p style={{ color: theme.mutedText, textAlign: 'center', padding: 40 }}>Loading unassigned jobs...</p>;

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, fontFamily: "'SF Mono', monospace" }}>
        🔗 Assign Sleeves to Imported Jobs
      </h3>
      <p style={{ fontSize: 12, color: theme.mutedText, marginBottom: 16 }}>
        {imports.length} unassigned import{imports.length !== 1 ? 's' : ''} remaining
        {assigned.length > 0 && ` · ${assigned.length} assigned this session`}
      </p>

      {/* ═══ STEP: ALL DONE ═══ */}
      {step === 'done' && (
        <div style={{
          padding: 40, textAlign: 'center', color: theme.mutedText,
          background: darkMode ? '#1b2e1b' : '#E8F5E9', borderRadius: 8,
          border: '1px solid #4CAF50'
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
          <div style={{ fontWeight: 700, color: '#2E7D32', fontSize: 16 }}>All imports assigned!</div>
          {assigned.length > 0 && (
            <div style={{ fontSize: 12, color: theme.mutedText, marginTop: 12 }}>
              Assigned {assigned.length} job{assigned.length !== 1 ? 's' : ''} this session
            </div>
          )}
          <button onClick={onDone} style={{
            marginTop: 16, padding: '8px 20px', background: '#2E7D32', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700
          }}>← Back to Job List</button>
        </div>
      )}

      {/* ═══ STEP 1: ENTER JOB NUMBER ═══ */}
      {step === 'job' && (
        <div style={{
          padding: 20, borderRadius: 10,
          background: darkMode ? '#1a1a2e' : '#E8EAF6',
          border: `2px solid ${theme.accent}`,
          marginBottom: 16
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: theme.accent }}>
            Step 1 → Enter the job number
          </div>
          <input
            ref={jobRef}
            value={jobInput}
            onChange={e => setJobInput(e.target.value)}
            onKeyDown={handleJobLookup}
            placeholder="Type or scan job number, then press Enter..."
            style={{
              width: '100%', padding: 16, fontSize: 22, fontWeight: 700, textAlign: 'center',
              background: darkMode ? '#111' : '#fff', color: theme.text,
              border: `2px solid ${theme.accent}`, borderRadius: 8, boxSizing: 'border-box',
              fontFamily: "'SF Mono', monospace"
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: theme.mutedText }}>
              Type a Flex job # and press Enter to find it
            </span>
            <button onClick={skipToList} style={{
              padding: '6px 14px', background: 'transparent',
              border: `1px solid ${theme.border}`, borderRadius: 4,
              color: theme.mutedText, cursor: 'pointer', fontSize: 11
            }}>📋 Browse list instead</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 1b: NEW JOB — Not in imports, add it quick ═══ */}
      {step === 'newjob' && (
        <div style={{
          padding: 20, borderRadius: 10,
          background: darkMode ? '#2a1f0d' : '#FFF3E0',
          border: '2px solid #E65100',
          marginBottom: 16
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: '#E65100' }}>
            ✨ New Job — Not on the WIP list
          </div>
          <div style={{ fontSize: 11, color: theme.mutedText, marginBottom: 14 }}>
            "{newJob.flex_job_number}" wasn't found in imports. Fill in what you know and assign it.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={newJob.flex_job_number}
              onChange={e => setNewJob(p => ({ ...p, flex_job_number: e.target.value }))}
              placeholder="Job number (required)"
              style={{ ...inpSt, border: '2px solid #E65100', fontWeight: 700, fontSize: 16 }}
              autoFocus
            />
            <input
              value={newJob.customer_name}
              onChange={e => setNewJob(p => ({ ...p, customer_name: e.target.value }))}
              placeholder="Customer name"
              style={inpSt}
            />
            <input
              value={newJob.job_description}
              onChange={e => setNewJob(p => ({ ...p, job_description: e.target.value }))}
              placeholder="Job description"
              style={inpSt}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: theme.mutedText, display: 'block', marginBottom: 4 }}>Department:</label>
                <select value={newJob.send_to} onChange={e => setNewJob(p => ({ ...p, send_to: e.target.value }))}
                  style={{ ...inpSt, cursor: 'pointer', marginBottom: 0 }}>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}{d.id === 'DEPT0012' ? ' (default)' : ''}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: theme.mutedText, display: 'block', marginBottom: 4 }}>Due date:</label>
                <input type="date" value={newJob.due_date} onChange={e => setNewJob(p => ({ ...p, due_date: e.target.value }))}
                  style={{ ...inpSt, cursor: 'pointer', marginBottom: 0 }} />
              </div>
            </div>

            {/* Status — combo: type custom or pick from presets */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: theme.mutedText, display: 'block', marginBottom: 4 }}>Status:</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {statusPresets.map(s => (
                  <button key={s} type="button" onClick={() => setNewJob(p => ({ ...p, status: s }))} style={{
                    padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: newJob.status === s ? 700 : 400,
                    background: newJob.status === s ? theme.accent : 'transparent',
                    color: newJob.status === s ? '#fff' : theme.mutedText,
                    border: `1px solid ${newJob.status === s ? theme.accent : theme.border}`,
                    cursor: 'pointer', fontFamily: "'SF Mono', monospace"
                  }}>{s}</button>
                ))}
              </div>
              <input
                value={newJob.status}
                onChange={e => setNewJob(p => ({ ...p, status: e.target.value }))}
                placeholder="Or type a custom status..."
                style={{ ...inpSt, marginBottom: 0, fontSize: 12 }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px',
              background: newJob.is_rush ? '#C62828' : 'transparent',
              border: `2px solid ${newJob.is_rush ? '#C62828' : theme.border}`,
              borderRadius: 8, transition: 'all 0.2s'
            }}>
              <input type="checkbox" checked={newJob.is_rush} onChange={e => setNewJob(p => ({ ...p, is_rush: e.target.checked }))} />
              <span style={{ fontWeight: 700, fontSize: 13, color: newJob.is_rush ? '#fff' : theme.mutedText }}>
                🔴 RUSH ORDER
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setNewJob({ flex_job_number: '', customer_name: '', job_description: '', send_to: 'DEPT0012', due_date: '', is_rush: false, status: 'waiting' }); setStep('job'); }} style={{
              padding: '10px 16px', background: 'transparent', border: `1px solid ${theme.border}`,
              color: theme.mutedText, borderRadius: 6, cursor: 'pointer', fontWeight: 600, flex: 1, fontSize: 12
            }}>← Back</button>
            <button onClick={handleNewJobSubmit} disabled={!newJob.flex_job_number} style={{
              padding: '10px 16px', background: newJob.flex_job_number ? '#E65100' : '#555',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: newJob.flex_job_number ? 'pointer' : 'not-allowed',
              fontWeight: 700, fontSize: 14, flex: 2
            }}>📋 Assign to Sleeve →</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: SCAN SLEEVE ═══ */}
      {step === 'sleeve' && matchedImport && (
        <div style={{
          padding: 20, borderRadius: 10,
          background: darkMode ? '#1a2a1a' : '#E8F5E9',
          border: '2px solid #2E7D32',
          marginBottom: 16
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#2E7D32' }}>
            Step 2 → Scan the sleeve barcode
          </div>

          {/* Job info card */}
          <div style={{
            padding: 14, borderRadius: 8, marginBottom: 14,
            background: darkMode ? '#111' : '#fff',
            border: `1px solid ${theme.border}`
          }}>
            {matchedImport.is_rush && (
              <div style={{ background: '#C62828', color: '#fff', padding: '2px 10px', borderRadius: 4, fontSize: 10, fontWeight: 800, display: 'inline-block', marginBottom: 6, letterSpacing: 1 }}>
                🔴 RUSH
              </div>
            )}
            <div style={{ fontWeight: 800, fontSize: 20, fontFamily: "'SF Mono', monospace" }}>
              {matchedImport.flex_job_number || matchedImport.id}
            </div>
            {matchedImport.customer_name && (
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: theme.text }}>
                {matchedImport.customer_name}
              </div>
            )}
            {matchedImport.job_description && (
              <div style={{ fontSize: 12, color: theme.mutedText, marginTop: 4 }}>{matchedImport.job_description}</div>
            )}
            {matchedImport.due_date && (
              <div style={{ fontSize: 12, color: new Date(matchedImport.due_date) < new Date() ? '#C62828' : theme.mutedText, marginTop: 4 }}>
                📅 Due: {new Date(matchedImport.due_date).toLocaleDateString()}
              </div>
            )}
            <div style={{ fontSize: 10, color: theme.mutedText, marginTop: 6, fontFamily: "'SF Mono', monospace" }}>
              {isNewJob ? '✨ new job' : `import: ${matchedImport.id}`}
            </div>
          </div>

          {/* Status picker — quick presets + custom input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#2E7D32', display: 'block', marginBottom: 4 }}>Status:</label>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
              {statusPresets.map(s => (
                <button key={s} type="button" onClick={() => setStatusInput(s)} style={{
                  padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: statusInput === s ? 700 : 400,
                  background: statusInput === s ? '#2E7D32' : 'transparent',
                  color: statusInput === s ? '#fff' : theme.mutedText,
                  border: `1px solid ${statusInput === s ? '#2E7D32' : theme.border}`,
                  cursor: 'pointer', fontFamily: "'SF Mono', monospace"
                }}>{s}</button>
              ))}
            </div>
            <input
              value={statusInput}
              onChange={e => setStatusInput(e.target.value)}
              placeholder="Or type a custom status..."
              style={{ ...inpSt, marginBottom: 0, fontSize: 12, padding: 8 }}
            />
          </div>

          <input
            ref={scanRef}
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={handleSleeveScan}
            placeholder="Scan sleeve barcode (JOB######)..."
            style={{
              width: '100%', padding: 16, fontSize: 22, fontWeight: 700, textAlign: 'center',
              background: darkMode ? '#111' : '#fff', color: theme.text,
              border: '2px solid #2E7D32', borderRadius: 8, boxSizing: 'border-box',
              fontFamily: "'SF Mono', monospace"
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => { setMatchedImport(null); setStep('job'); }} style={{
              padding: '6px 16px', background: 'transparent',
              border: `1px solid ${theme.border}`, borderRadius: 4,
              color: theme.mutedText, cursor: 'pointer', fontSize: 11
            }}>← Wrong job, go back</button>
          </div>
        </div>
      )}

      {/* ═══ BROWSE LIST MODE ═══ */}
      {step === 'list' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
              Click a job to select it, then scan the sleeve
            </span>
            <button onClick={() => setStep('job')} style={{
              padding: '6px 14px', background: 'transparent',
              border: `1px solid ${theme.border}`, borderRadius: 4,
              color: theme.mutedText, cursor: 'pointer', fontSize: 11
            }}>← Back to search</button>
          </div>

          {/* If they picked one from the list, show the sleeve scanner */}
          {matchedImport && (
            <div style={{
              padding: 16, marginBottom: 16, borderRadius: 8,
              background: darkMode ? '#1a2a1a' : '#E8F5E9',
              border: '2px solid #2E7D32'
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#2E7D32' }}>
                Assigning: {matchedImport.flex_job_number || matchedImport.id}
                {matchedImport.customer_name && ` — ${matchedImport.customer_name}`}
              </div>
              <input
                ref={scanRef}
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={handleSleeveScan}
                placeholder="Scan sleeve barcode (JOB######)..."
                style={{
                  width: '100%', padding: 14, fontSize: 18, fontWeight: 700, textAlign: 'center',
                  background: darkMode ? '#111' : '#fff', color: theme.text,
                  border: '2px solid #2E7D32', borderRadius: 8, boxSizing: 'border-box',
                  fontFamily: "'SF Mono', monospace"
                }}
              />
              <button onClick={() => setMatchedImport(null)} style={{
                marginTop: 8, padding: '6px 16px', background: 'transparent',
                border: `1px solid ${theme.border}`, borderRadius: 4,
                color: theme.mutedText, cursor: 'pointer', fontSize: 11
              }}>Cancel</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {imports.map(imp => (
              <div key={imp.id}
                onClick={() => { setMatchedImport(imp); }}
                style={{
                  padding: '10px 14px', borderRadius: 6,
                  background: matchedImport?.id === imp.id
                    ? (darkMode ? '#1a2a1a' : '#E8F5E9')
                    : (darkMode ? '#1a1a1a' : '#fff'),
                  border: `1px solid ${matchedImport?.id === imp.id ? '#2E7D32' : theme.border}`,
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'all 0.15s'
                }}
              >
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'SF Mono', monospace" }}>
                    {imp.flex_job_number || imp.id}
                  </span>
                  {imp.customer_name && (
                    <span style={{ marginLeft: 12, fontSize: 13, fontWeight: 600, color: theme.text }}>
                      {imp.customer_name}
                    </span>
                  )}
                  {imp.job_description && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: theme.mutedText }}>
                      {imp.job_description}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {imp.is_rush && <span style={{ fontSize: 10, color: '#C62828', fontWeight: 700 }}>🔴 RUSH</span>}
                  {imp.due_date && (
                    <span style={{ fontSize: 10, color: theme.mutedText }}>
                      📅 {new Date(imp.due_date).toLocaleDateString()}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: theme.mutedText, fontFamily: "'SF Mono', monospace" }}>
                    {imp.id}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SESSION LOG — click to edit ═══ */}
      {assigned.length > 0 && step !== 'done' && (
        <div style={{
          marginTop: 20, padding: 14, borderRadius: 8,
          background: darkMode ? '#111' : '#fafafa',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.mutedText, marginBottom: 8, fontFamily: "'SF Mono', monospace" }}>
            ✅ Assigned this session ({assigned.length}) — click to edit
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {assigned.map((a, i) => (
              <div key={i}>
                <div onClick={() => {
                  if (editingAssigned === i) { setEditingAssigned(null); return; }
                  setEditingAssigned(i);
                  setEditForm({ customer_name: a.customer || '', job_description: a.description || '', status: a.status || 'waiting', deptId: a.deptId || '', dueDate: a.dueDate || '', isRush: a.isRush || false });
                }} style={{
                  fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer',
                  padding: '4px 6px', borderRadius: 4,
                  background: editingAssigned === i ? (darkMode ? '#1a2a1a' : '#E8F5E9') : 'transparent',
                  transition: 'background 0.15s'
                }}>
                  <span style={{ fontWeight: 700, fontFamily: "'SF Mono', monospace", color: '#2E7D32' }}>{a.jobNum}</span>
                  {a.customer && <span style={{ color: theme.mutedText }}>— {a.customer}</span>}
                  <span style={{ color: theme.mutedText }}>→</span>
                  <span style={{ fontWeight: 600, fontFamily: "'SF Mono', monospace" }}>{a.sleeve}</span>
                  <span style={{ fontSize: 9, background: statusColors[a.status] || '#888', color: '#fff', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>{a.status}</span>
                  {a.wasNew && <span style={{ fontSize: 9, background: '#E65100', color: '#fff', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>NEW</span>}
                  <span style={{ fontSize: 9, color: theme.mutedText, marginLeft: 'auto' }}>✏️</span>
                </div>

                {/* Inline edit form */}
                {editingAssigned === i && (
                  <div style={{
                    padding: 12, marginTop: 4, marginBottom: 4, borderRadius: 6,
                    background: darkMode ? '#1a1a1a' : '#fff',
                    border: `1px solid ${theme.border}`
                  }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input value={editForm.customer_name} onChange={e => setEditForm(p => ({ ...p, customer_name: e.target.value }))}
                        placeholder="Customer name" style={{ ...inpSt, flex: 1, marginBottom: 0, fontSize: 12 }} />
                      <input value={editForm.job_description} onChange={e => setEditForm(p => ({ ...p, job_description: e.target.value }))}
                        placeholder="Description" style={{ ...inpSt, flex: 1, marginBottom: 0, fontSize: 12 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                          {statusPresets.map(s => (
                            <button key={s} type="button" onClick={() => setEditForm(p => ({ ...p, status: s }))} style={{
                              padding: '2px 7px', borderRadius: 3, fontSize: 9, fontWeight: editForm.status === s ? 700 : 400,
                              background: editForm.status === s ? theme.accent : 'transparent',
                              color: editForm.status === s ? '#fff' : theme.mutedText,
                              border: `1px solid ${editForm.status === s ? theme.accent : theme.border}`,
                              cursor: 'pointer', fontFamily: "'SF Mono', monospace"
                            }}>{s}</button>
                          ))}
                        </div>
                        <input value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                          placeholder="Status" style={{ ...inpSt, marginBottom: 0, fontSize: 11, padding: 6 }} />
                      </div>
                      <select value={editForm.deptId} onChange={e => setEditForm(p => ({ ...p, deptId: e.target.value }))}
                        style={{ ...inpSt, marginBottom: 0, fontSize: 11, flex: 1 }}>
                        <option value="">No department</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="date" value={editForm.dueDate} onChange={e => setEditForm(p => ({ ...p, dueDate: e.target.value }))}
                        style={{ ...inpSt, marginBottom: 0, fontSize: 11, flex: 1, padding: 6 }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: editForm.isRush ? '#C62828' : theme.mutedText }}>
                        <input type="checkbox" checked={editForm.isRush} onChange={e => setEditForm(p => ({ ...p, isRush: e.target.checked }))} />
                        🔴 Rush
                      </label>
                      <button onClick={handleEditSave} style={{
                        padding: '6px 14px', background: '#2E7D32', color: '#fff', border: 'none',
                        borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 11
                      }}>💾 Save</button>
                      <button onClick={() => setEditingAssigned(null)} style={{
                        padding: '6px 10px', background: 'transparent', border: `1px solid ${theme.border}`,
                        borderRadius: 4, cursor: 'pointer', color: theme.mutedText, fontSize: 11
                      }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: toast.includes('❌') || toast.includes('⚠️') ? '#C62828' : '#2E7D32', color: '#fff', padding: '12px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14, zIndex: 1000 }}>{toast}</div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════
// DUE DATE VIEW — Jobs sorted by due date
// ═══════════════════════════════════════════════════════

function DueDateView({ theme, darkMode, orgId, cardSt, onComplete }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadByDueDate(); }, []);

  async function loadByDueDate() {
    setLoading(true);
    const { data } = await supabase.from('job_sleeves')
      .select('*, departments(name)')
      .in('status', ['active', 'waiting'])
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });

    // Also get jobs with no due date
    const { data: noDue } = await supabase.from('job_sleeves')
      .select('*, departments(name)')
      .in('status', ['active', 'waiting'])
      .is('due_date', null)
      .order('created_at', { ascending: true });

    setJobs([...(data || []), ...(noDue || [])]);
    setLoading(false);
  }

  function isOverdue(d) { return d && new Date(d) < new Date(); }
  function isDueToday(d) { return d && new Date(d).toDateString() === new Date().toDateString(); }
  function isDueTomorrow(d) {
    if (!d) return false;
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    return new Date(d).toDateString() === tom.toDateString();
  }

  if (loading) return <p style={{ color: theme.mutedText, textAlign: 'center' }}>Loading...</p>;

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, fontFamily: "'SF Mono', monospace" }}>
        📅 Jobs by Due Date
      </h3>
      {jobs.length === 0 && <p style={{ color: theme.mutedText, textAlign: 'center' }}>No active jobs with due dates</p>}
      {jobs.map(j => {
        const dc = getDeptColor(j.current_department_id, darkMode);
        const overdue = isOverdue(j.due_date);
        const today = isDueToday(j.due_date);
        const tomorrow = isDueTomorrow(j.due_date);

        return (
          <div key={j.id} style={{
            ...cardSt, marginBottom: 10,
            background: overdue ? (darkMode ? '#2e0d0d' : '#FFEBEE') : dc.bg || cardSt.background,
            borderLeft: `4px solid ${overdue ? '#C62828' : today ? '#E65100' : dc.border || theme.border}`,
            border: `1px solid ${overdue ? '#C62828' : dc.border || theme.border}`,
            borderLeftWidth: 4
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {j.is_rush && <span style={{ background: '#C62828', color: '#fff', padding: '1px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, marginRight: 8 }}>🔴 RUSH</span>}
                <span style={{ fontWeight: 800, fontSize: 16, fontFamily: "'SF Mono', monospace" }}>{j.flex_job_number || j.id}</span>
                {j.customer_name && <span style={{ fontSize: 15, fontWeight: 700, marginLeft: 12 }}>{j.customer_name}</span>}
              </div>
              <div style={{ textAlign: 'right' }}>
                {j.due_date ? (
                  <div style={{ fontWeight: 700, fontSize: 14, color: overdue ? '#C62828' : today ? '#E65100' : tomorrow ? '#F57C00' : theme.text }}>
                    {overdue ? '⚠️ OVERDUE' : today ? '🔥 DUE TODAY' : tomorrow ? '⏰ Tomorrow' : new Date(j.due_date).toLocaleDateString()}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: theme.mutedText, fontStyle: 'italic' }}>No due date</div>
                )}
                {j.departments?.name && <div style={{ fontSize: 11, color: dc.label || theme.mutedText }}>📍 {j.departments.name}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
