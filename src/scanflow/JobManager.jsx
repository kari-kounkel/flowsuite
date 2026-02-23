// ═══════════════════════════════════════════════════════
// JOB MANAGER — Intake, job list, complete, available
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase.js';
import { cardStyle as getCardStyle, inputStyle as getInputStyle, statusColors, getDeptColor } from './scanflowTheme.js';
import { GanttView } from './GanttView.jsx';
import { JobDetail } from './JobDetail.jsx';

export function JobManager({ theme, orgId, darkMode }) {
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [mode, setMode] = useState('list');
  const [filter, setFilter] = useState('active');
  const [toast, setToast] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const scanRef = useRef(null);

  const [intakeData, setIntakeData] = useState({
    sleeve_code: '', flex_job_number: '', customer_name: '', job_description: '',
    send_to: 'DEPT0012', due_date: '', is_rush: false
  });
  const [intakeStep, setIntakeStep] = useState(0);

  const cardSt = getCardStyle(theme);
  const inpSt = getInputStyle(theme);
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

    setIntakeData({ sleeve_code: '', flex_job_number: '', customer_name: '', job_description: '', send_to: 'DEPT0012', due_date: '', is_rush: false });
    setIntakeStep(0);
    loadJobs();
  }

  async function makeAvailable(jobId) {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'available', flex_job_number: null, customer_name: null,
      job_description: null, current_department_id: null, current_station_id: null,
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
      job_description: null, current_department_id: null, current_station_id: null,
      entered_current_at: null, completed_at: null,
      due_date: null, is_rush: false
    }).eq('id', jobId);
    if (!error) { sh(`🗑️ Job deleted — sleeve ${jobId} is now available`); loadJobs(); }
    else sh(`❌ ${error.message}`);
  }

  return (
    <div>
      {/* Header with mode buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", margin: 0 }}>📋 Job Sleeves</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setMode('intake'); setIntakeStep(0); setIntakeData(p => ({ ...p, sleeve_code: '', flex_job_number: '', customer_name: '', job_description: '', due_date: '', is_rush: false })); }} style={{
            padding: '8px 16px', background: mode === 'intake' ? '#2E7D32' : theme.accent, color: '#fff', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13
          }}>📥 Start New Job</button>
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

      {/* ═══ INTAKE MODE ═══ */}
      {mode === 'intake' && (
        <div style={{ ...cardSt, borderLeft: '4px solid #2E7D32' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>📥 Job Intake — Customer Service</h3>

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
      )}

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
// SLEEVE ASSIGNMENT — Link unassigned imports to sleeves
// ═══════════════════════════════════════════════════════

function SleeveAssignment({ theme, darkMode, orgId, onDone }) {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanInput, setScanInput] = useState('');
  const [selectedImport, setSelectedImport] = useState(null);
  const [toast, setToast] = useState('');
  const scanRef = useRef(null);

  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { loadImports(); }, []);
  useEffect(() => { if (scanRef.current && selectedImport) scanRef.current.focus(); }, [selectedImport]);

  async function loadImports() {
    setLoading(true);
    // Get all IMP-### records (unassigned imports without real sleeves)
    const { data } = await supabase.from('job_sleeves')
      .select('*')
      .like('id', 'IMP-%')
      .order('id', { ascending: true });
    if (data) setImports(data);
    setLoading(false);
  }

  async function handleSleeveScan(e) {
    if (e.key !== 'Enter') return;
    const code = scanInput.trim().toUpperCase();
    setScanInput('');

    if (!code.startsWith('JOB')) { sh('⚠️ Scan a JOB sleeve barcode'); return; }
    if (!selectedImport) { sh('⚠️ Select an import first'); return; }

    // Check sleeve is available
    const { data: sleeve } = await supabase.from('job_sleeves')
      .select('id, status')
      .eq('id', code)
      .single();

    if (!sleeve) { sh(`⚠️ Sleeve ${code} not found`); return; }
    if (sleeve.status !== 'available') { sh(`⚠️ Sleeve ${code} is ${sleeve.status}, not available`); return; }

    // Transfer the import data to the real sleeve
    const { error: updateErr } = await supabase.from('job_sleeves').update({
      flex_job_number: selectedImport.flex_job_number,
      customer_name: selectedImport.customer_name,
      job_description: selectedImport.job_description,
      status: selectedImport.status || 'waiting',
      current_department_id: selectedImport.current_department_id,
      current_station_id: selectedImport.current_station_id,
      entered_current_at: new Date().toISOString(),
      due_date: selectedImport.due_date,
      is_rush: selectedImport.is_rush || false,
    }).eq('id', code);

    if (updateErr) { sh(`❌ ${updateErr.message}`); return; }

    // Delete the import record
    const { error: delErr } = await supabase.from('job_sleeves').delete().eq('id', selectedImport.id);
    if (delErr) { sh(`⚠️ Sleeve linked but couldn't delete import: ${delErr.message}`); }

    sh(`✅ ${selectedImport.flex_job_number || selectedImport.id} → sleeve ${code}`);
    setSelectedImport(null);
    loadImports();
  }

  if (loading) return <p style={{ color: theme.mutedText, textAlign: 'center', padding: 40 }}>Loading unassigned jobs...</p>;

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, fontFamily: "'SF Mono', monospace" }}>
        🔗 Assign Sleeves to Imported Jobs
      </h3>
      <p style={{ fontSize: 12, color: theme.mutedText, marginBottom: 16 }}>
        {imports.length} unassigned imports remaining. Select a job, then scan the sleeve barcode to link them.
      </p>

      {imports.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: theme.mutedText,
          background: darkMode ? '#1b2e1b' : '#E8F5E9', borderRadius: 8,
          border: '1px solid #4CAF50'
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
          <div style={{ fontWeight: 700, color: '#2E7D32' }}>All imports assigned!</div>
          <button onClick={onDone} style={{
            marginTop: 16, padding: '8px 20px', background: '#2E7D32', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700
          }}>← Back to Job List</button>
        </div>
      )}

      {/* Scanner input when an import is selected */}
      {selectedImport && (
        <div style={{
          padding: 16, marginBottom: 16, borderRadius: 8,
          background: darkMode ? '#1a2a1a' : '#E8F5E9',
          border: '2px solid #2E7D32'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#2E7D32' }}>
            Assigning: {selectedImport.flex_job_number || selectedImport.id}
            {selectedImport.customer_name && ` — ${selectedImport.customer_name}`}
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
          <button onClick={() => setSelectedImport(null)} style={{
            marginTop: 8, padding: '6px 16px', background: 'transparent',
            border: `1px solid ${theme.border}`, borderRadius: 4,
            color: theme.mutedText, cursor: 'pointer', fontSize: 11
          }}>Cancel</button>
        </div>
      )}

      {/* Import list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {imports.map(imp => (
          <div key={imp.id}
            onClick={() => setSelectedImport(imp)}
            style={{
              padding: '10px 14px', borderRadius: 6,
              background: selectedImport?.id === imp.id
                ? (darkMode ? '#1a2a1a' : '#E8F5E9')
                : (darkMode ? '#1a1a1a' : '#fff'),
              border: `1px solid ${selectedImport?.id === imp.id ? '#2E7D32' : theme.border}`,
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
              <span style={{ fontSize: 10, color: theme.mutedText, fontFamily: "'SF Mono', monospace" }}>
                {imp.id}
              </span>
            </div>
          </div>
        ))}
      </div>

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
