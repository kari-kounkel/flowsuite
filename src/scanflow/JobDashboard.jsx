// ═══════════════════════════════════════════════════════
// JOB DASHBOARD — Wall-mount live production floor view
// ═══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';
import { cardStyle as getCardStyle } from './scanflowTheme.js';

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

      {/* Jobs Grid */}
      {loading ? (
        <p style={{ textAlign: 'center', color: theme.mutedText }}>Loading...</p>
      ) : jobs.length === 0 ? (
        <div style={{ ...cardSt, textAlign: 'center' }}>
          <p style={{ fontSize: 16, color: theme.mutedText }}>No active jobs on the floor</p>
          <p style={{ fontSize: 13, color: theme.mutedText }}>Scan a job IN to get started</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {jobs.map(job => (
            <div key={job.job_code} style={{
              ...cardSt, marginBottom: 0,
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
              {job.job_description && <p style={{ fontSize: 12, margin: '0 0 8px 0', color: theme.mutedText }}>{job.job_description}</p>}
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
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: theme.accent }}>{jobs.length}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>Active Jobs</div>
        </div>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#C62828' }}>{jobs.filter(j => j.minutes_in_state > 480).length}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>Over 8 Hours</div>
        </div>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#6A1B9A' }}>{maintenance.length}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>In Maintenance</div>
        </div>
      </div>
    </div>
  );
}
