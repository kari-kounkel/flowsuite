// ═══════════════════════════════════════════════════════
// JOB DETAIL — Drill-down panel for any job
// Shows full info, scan history, waste, actions
// ═══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';
import { statusColors, getDeptColor } from './scanflowTheme.js';

export function JobDetail({ jobId, theme, darkMode, onClose, onUpdate }) {
  const [job, setJob] = useState(null);
  const [scans, setScans] = useState([]);
  const [waste, setWaste] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const sh = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { if (jobId) loadAll(); }, [jobId]);

  async function loadAll() {
    setLoading(true);

    // Job details with department name
    const { data: jobData } = await supabase.from('job_sleeves')
      .select('*, departments(name)')
      .eq('id', jobId)
      .single();
    if (jobData) setJob(jobData);

    // Scan history for this job
    const { data: scanData } = await supabase.from('scan_log')
      .select('*, departments(name), stations(name)')
      .eq('job_id', jobId)
      .order('scanned_at', { ascending: false });
    if (scanData) setScans(scanData);

    // Waste history
    const { data: wasteData } = await supabase.from('waste_log')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (wasteData) setWaste(wasteData);

    setLoading(false);
  }

  async function completeJob() {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'completed', current_department_id: null,
      current_station_id: null, completed_at: new Date().toISOString()
    }).eq('id', jobId);
    if (!error) { sh('✅ Job completed'); loadAll(); if (onUpdate) onUpdate(); }
    else sh(`❌ ${error.message}`);
  }

  async function makeAvailable() {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'available', flex_job_number: null, customer_name: null,
      job_description: null, current_department_id: null, current_station_id: null,
      entered_current_at: null, completed_at: new Date().toISOString(),
      due_date: null, is_rush: false
    }).eq('id', jobId);
    if (!error) { sh('✅ Sleeve released to inventory'); loadAll(); if (onUpdate) onUpdate(); }
    else sh(`❌ ${error.message}`);
  }

  async function archiveJob() {
    const { error } = await supabase.from('job_sleeves').update({
      status: 'archived', completed_at: new Date().toISOString()
    }).eq('id', jobId);
    if (!error) { sh('📦 Job archived'); loadAll(); if (onUpdate) onUpdate(); }
    else sh(`❌ ${error.message}`);
  }

  function actionColor(action) {
    const map = { 'START': '#2E7D32', 'STOP': '#1565C0', 'BLOCKER': '#C62828', 'WASTE_STOP': '#E65100', 'MAINTENANCE': '#6A1B9A' };
    return map[action] || '#555';
  }

  function formatTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function timeBetween(start, end) {
    if (!start || !end) return null;
    const diff = new Date(end) - new Date(start);
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m`;
  }

  if (!jobId) return null;

  // Overlay backdrop
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 999,
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      padding: '40px 16px', overflowY: 'auto'
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: darkMode ? '#1a1a1a' : '#fff',
        border: `1px solid ${theme.border}`,
        borderRadius: 12, maxWidth: 600, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: theme.mutedText }}>Loading...</div>
        ) : !job ? (
          <div style={{ padding: 40, textAlign: 'center', color: theme.mutedText }}>Job not found</div>
        ) : (
          <>
            {/* ── Header ── */}
            <div style={{
              padding: '16px 20px',
              background: job.is_rush ? '#C62828' : (getDeptColor(job.current_department_id, darkMode).bg || (darkMode ? '#222' : '#f5f5f5')),
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
            }}>
              <div>
                {job.is_rush && (
                  <div style={{ background: '#fff', color: '#C62828', padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 800, display: 'inline-block', marginBottom: 6, letterSpacing: 1 }}>
                    🔴 RUSH
                  </div>
                )}
                <div style={{ fontWeight: 800, fontSize: 22, fontFamily: "'SF Mono', monospace", color: job.is_rush ? '#fff' : theme.text }}>
                  {job.flex_job_number || job.id}
                </div>
                {job.customer_name && (
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: job.is_rush ? '#ffcdd2' : theme.text }}>
                    {job.customer_name}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                  background: statusColors[job.status] || '#555', color: '#fff', textTransform: 'uppercase'
                }}>{job.status}</span>
                <button onClick={onClose} style={{
                  background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer',
                  color: job.is_rush ? '#ffcdd2' : theme.mutedText, padding: 0, lineHeight: 1
                }}>✕</button>
              </div>
            </div>

            {/* ── Details Grid ── */}
            <div style={{ padding: '16px 20px' }}>
              <table style={{ width: '100%', fontSize: 13, fontFamily: "'SF Mono', monospace", borderCollapse: 'collapse' }}>
                <tbody>
                  {job.job_description && (
                    <tr>
                      <td style={{ padding: '6px 8px', color: theme.mutedText, verticalAlign: 'top', width: 110 }}>Description</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{job.job_description}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '6px 8px', color: theme.mutedText }}>Sleeve</td>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{job.id}</td>
                  </tr>
                  {job.departments?.name && (
                    <tr>
                      <td style={{ padding: '6px 8px', color: theme.mutedText }}>Department</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>📍 {job.departments.name}</td>
                    </tr>
                  )}
                  {job.due_date && (
                    <tr>
                      <td style={{ padding: '6px 8px', color: theme.mutedText }}>Due Date</td>
                      <td style={{
                        padding: '6px 8px', fontWeight: 700,
                        color: new Date(job.due_date) < new Date() && job.status !== 'completed' ? '#C62828' : theme.text
                      }}>
                        📅 {new Date(job.due_date).toLocaleDateString()}
                        {new Date(job.due_date) < new Date() && job.status !== 'completed' && ' ⚠️ OVERDUE'}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '6px 8px', color: theme.mutedText }}>Created</td>
                    <td style={{ padding: '6px 8px' }}>{formatTime(job.created_at)}</td>
                  </tr>
                  {job.completed_at && (
                    <tr>
                      <td style={{ padding: '6px 8px', color: theme.mutedText }}>Completed</td>
                      <td style={{ padding: '6px 8px' }}>{formatTime(job.completed_at)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Action Buttons ── */}
            {job.status !== 'available' && (
              <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(job.status === 'active' || job.status === 'waiting') && (
                  <button onClick={completeJob} style={{
                    padding: '8px 16px', background: '#1565C0', color: '#fff', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700
                  }}>✓ Complete</button>
                )}
                {job.status === 'completed' && (
                  <button onClick={makeAvailable} style={{
                    padding: '8px 16px', background: '#6A1B9A', color: '#fff', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700
                  }}>↩ Make Available</button>
                )}
                {(job.status === 'completed' || job.status === 'waiting') && (
                  <button onClick={archiveJob} style={{
                    padding: '8px 16px', background: '#37474F', color: '#fff', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700
                  }}>📦 Archive</button>
                )}
              </div>
            )}

            {/* ── Scan History ── */}
            <div style={{
              padding: '16px 20px',
              borderTop: `1px solid ${theme.border}`,
              background: darkMode ? '#111' : '#fafafa'
            }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, fontFamily: "'SF Mono', monospace", color: theme.text }}>
                📜 Scan History ({scans.length})
              </h4>
              {scans.length === 0 ? (
                <p style={{ color: theme.mutedText, fontSize: 12, fontStyle: 'italic' }}>No scans recorded yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {scans.map((s, i) => {
                    // Calculate time between this scan and the next one (older)
                    const nextScan = scans[i + 1];
                    const duration = nextScan ? timeBetween(nextScan.scanned_at, s.scanned_at) : null;

                    return (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: 6,
                        background: darkMode ? '#1a1a1a' : '#fff',
                        border: `1px solid ${theme.border}`,
                        fontSize: 12
                      }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10,
                          background: actionColor(s.action), color: '#fff', minWidth: 50, textAlign: 'center'
                        }}>{s.action}</span>
                        <span style={{ fontWeight: 600, minWidth: 70 }}>{s.employee_id}</span>
                        <span style={{ color: theme.mutedText, flex: 1 }}>
                          {s.departments?.name || s.department_id}
                          {s.stations?.name && ` → ${s.stations.name}`}
                        </span>
                        {duration && (
                          <span style={{
                            fontSize: 10, color: theme.mutedText, fontFamily: "'SF Mono', monospace",
                            background: darkMode ? '#222' : '#f0f0f0', padding: '2px 6px', borderRadius: 3
                          }}>⏱ {duration}</span>
                        )}
                        <span style={{ color: theme.mutedText, fontSize: 10, whiteSpace: 'nowrap' }}>
                          {formatTime(s.scanned_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Waste History ── */}
            {waste.length > 0 && (
              <div style={{
                padding: '16px 20px',
                borderTop: `1px solid ${theme.border}`,
                background: darkMode ? '#1a0d0d' : '#FFF8E1'
              }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, fontFamily: "'SF Mono', monospace", color: '#E65100' }}>
                  🗑️ Waste Log ({waste.reduce((sum, w) => sum + (w.sheets_wasted || 0), 0)} sheets total)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {waste.map(w => (
                    <div key={w.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 6,
                      background: darkMode ? '#1a1a1a' : '#fff',
                      border: `1px solid ${theme.border}`,
                      fontSize: 12
                    }}>
                      <span style={{ fontWeight: 700, color: '#E65100' }}>{w.sheets_wasted} sheets</span>
                      <span style={{ fontWeight: 600 }}>{w.employee_id}</span>
                      {w.reason && <span style={{ color: theme.mutedText, flex: 1 }}>{w.reason}</span>}
                      {w.is_emergency && <span style={{ fontSize: 10, color: '#C62828', fontWeight: 700 }}>🛑 EMERGENCY</span>}
                      <span style={{ color: theme.mutedText, fontSize: 10 }}>{formatTime(w.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Toast inside modal */}
        {toast && (
          <div style={{
            padding: '10px 20px', textAlign: 'center', fontWeight: 700, fontSize: 13,
            background: toast.includes('❌') ? '#C62828' : '#2E7D32', color: '#fff'
          }}>{toast}</div>
        )}
      </div>
    </div>
  );
}
