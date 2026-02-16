// ═══════════════════════════════════════════════════════
// JOB MANAGER — Intake, job list, complete, available
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase.js';
import { cardStyle as getCardStyle, inputStyle as getInputStyle, statusColors, getDeptColor } from './scanflowTheme.js';

export function JobManager({ theme, orgId, darkMode }) {
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [mode, setMode] = useState('list');
  const [filter, setFilter] = useState('active');
  const [toast, setToast] = useState('');
  const [scanInput, setScanInput] = useState('');
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

      {/* ═══ LIST MODE ═══ */}
      {mode === 'list' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['active', 'waiting', 'completed', 'available', 'on_hold', 'all'].map(f => (
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
              <div key={j.id} style={{
                ...cardSt, marginBottom: 12,
                background: dc.bg || cardSt.background,
                borderLeft: `4px solid ${dc.border || statusColors[j.status] || '#555'}`,
                border: `1px solid ${dc.border || theme.border}`,
                borderLeftWidth: 4
              }}>
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
                      <button onClick={() => makeAvailable(j.id)} style={{
                        padding: '4px 10px', background: '#6A1B9A', color: '#fff', border: 'none',
                        borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600
                      }}>↩ Make Available</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
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
