// ═══════════════════════════════════════════════════════
// JOB DASHBOARD — Wall-mount live production floor view
// ═══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';
import { cardStyle as getCardStyle, getDeptColor } from './scanflowTheme.js';

export function JobDashboard({ theme, orgId, darkMode }) {
  const [jobs, setJobs] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const cardSt = getCardStyle(theme);

  useEffect(() => {
    loadDashboard();
    if (autoRefresh) {
      const interval = setInterval(loadDashboard, 15000);
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
    if (minutes < 120) return theme.accent;
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", margin: 0 }}>
          📊 Production Floor — Live
        </h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: theme.mutedText, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh (15s)
          </label>
          <button onClick={loadDashboard} style={{
            padding: '6px 12px', background: theme.accent, color: '#fff', border: 'none',
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

      {/* Department Color Legend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'DEPT0011', name: 'CS' },
          { id: 'DEPT0012', name: 'Design' },
          { id: 'DEPT0013', name: 'Wide Format' },
          { id: 'DEPT0014', name: 'Digital' },
          { id: 'DEPT0015', name: 'Review' },
        ].map(d => {
          const dc = getDeptColor(d.id, darkMode);
          return (
            <span key={d.id} style={{
              background: dc.bg, border: `1px solid ${dc.border}`, color: dc.label,
              padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600
            }}>{d.name}</span>
          );
        })}
      </div>

      {/* Jobs Grid */}
      {loading ? (
        <p style={{ textAlign: 'center', color: theme.mutedText }}>Loading...</p>
      ) : jobs.length === 0 ? (
        <div style={{ ...cardSt, textAlign: 'center' }}>
          <p style={{ fontSize: 16, color: theme.mutedText }}>No active jobs on the floor</p>
          <p style={{ fontSize: 13, color: theme.mutedText }}>Scan a job to get started</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {jobs.map(job => {
            const dc = getDeptColor(job.current_department_id, darkMode);
            const isOverdue = job.due_date && new Date(job.due_date) < new Date();
            const isDueToday = job.due_date && new Date(job.due_date).toDateString() === new Date().toDateString();

            return (
              <div key={job.job_code} style={{
                ...cardSt, marginBottom: 0,
                background: dc.bg || cardSt.background,
                borderLeft: `5px solid ${dc.border || getTimeColor(job.minutes_in_state)}`,
                border: `1px solid ${dc.border || theme.border}`,
                borderLeftWidth: 5,
                position: 'relative'
              }}>
                {/* RUSH banner */}
                {job.is_rush && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    background: '#C62828', color: '#fff',
                    padding: '2px 10px', borderRadius: '0 12px 0 8px',
                    fontSize: 10, fontWeight: 800, letterSpacing: 1
                  }}>
                    RUSH
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  {/* Flex # as primary display */}
                  <span style={{ fontWeight: 800, fontSize: 18, fontFamily: "'SF Mono', monospace" }}>
                    {job.flex_job_number || job.job_code}
                  </span>
                  <span style={{
                    fontWeight: 700, fontSize: 14, color: getTimeColor(job.minutes_in_state),
                    fontFamily: "'SF Mono', monospace"
                  }}>
                    {formatTime(job.minutes_in_state)}
                  </span>
                </div>

                {/* Customer name — BIGGER */}
                {job.customer_name && (
                  <p style={{ fontSize: 16, margin: '0 0 4px 0', fontWeight: 700, color: theme.text }}>
                    {job.customer_name}
                  </p>
                )}
                {job.job_description && <p style={{ fontSize: 12, margin: '0 0 8px 0', color: theme.mutedText }}>{job.job_description}</p>}

                {/* Due date */}
                {job.due_date && (
                  <p style={{ fontSize: 11, margin: '0 0 6px 0', fontWeight: isOverdue ? 700 : 400,
                    color: isOverdue ? '#C62828' : isDueToday ? '#E65100' : theme.mutedText }}>
                    📅 {isOverdue ? 'OVERDUE' : isDueToday ? 'DUE TODAY' : `Due ${new Date(job.due_date).toLocaleDateString()}`}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {job.department_name && (
                    <span style={{ background: dc.border || '#1565C0', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      🏭 {job.department_name}
                    </span>
                  )}
                  {job.station_name && (
                    <span style={{ background: '#6A1B9A', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      🔧 {job.station_name}
                    </span>
                  )}
                  <span style={{ background: job.status === 'waiting' ? '#E65100' : '#2E7D32', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                    {job.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 20 }}>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: theme.accent }}>{jobs.length}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>Active Jobs</div>
        </div>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#C62828' }}>{jobs.filter(j => j.is_rush).length}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>Rush Orders</div>
        </div>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#E65100' }}>{jobs.filter(j => j.due_date && new Date(j.due_date) < new Date()).length}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>Overdue</div>
        </div>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#6A1B9A' }}>{maintenance.length}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>In Maintenance</div>
        </div>
      </div>
    </div>
  );
}
