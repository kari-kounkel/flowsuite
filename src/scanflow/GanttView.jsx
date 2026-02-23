// ═══════════════════════════════════════════════════════
// GANTT VIEW — Visual job timeline with multiple views
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase.js';
import { statusColors, getDeptColor } from './scanflowTheme.js';

export function GanttView({ theme, darkMode, orgId }) {
  const [jobs, setJobs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('timeline'); // timeline | department | status
  const [showCompleted, setShowCompleted] = useState(false);
  const [zoomWeeks, setZoomWeeks] = useState(4); // how many weeks visible
  const scrollRef = useRef(null);

  useEffect(() => { loadData(); }, [showCompleted]);

  async function loadData() {
    setLoading(true);
    const statuses = showCompleted
      ? ['active', 'waiting', 'completed']
      : ['active', 'waiting'];

    const { data: jobData } = await supabase.from('job_sleeves')
      .select('*, departments(name)')
      .in('status', statuses)
      .order('due_date', { ascending: true, nullsFirst: false });

    const { data: deptData } = await supabase.from('departments')
      .select('id, name')
      .eq('is_active', true)
      .order('id');

    if (jobData) setJobs(jobData);
    if (deptData) setDepartments(deptData);
    setLoading(false);
  }

  // ── Date math ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - 7); // show 1 week before today

  const rangeEnd = new Date(today);
  rangeEnd.setDate(rangeEnd.getDate() + (zoomWeeks * 7));

  const totalDays = Math.ceil((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24));

  function dayOffset(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d - rangeStart) / (1000 * 60 * 60 * 24));
  }

  function dayToPercent(dayNum) {
    return (dayNum / totalDays) * 100;
  }

  // ── Bar color logic ──
  function getBarColor(job) {
    if (job.is_rush) return { bg: '#C62828', text: '#fff', border: '#B71C1C' };
    if (job.status === 'completed') return { bg: darkMode ? '#444' : '#9E9E9E', text: '#fff', border: '#757575' };
    if (job.status === 'active') return { bg: '#1565C0', text: '#fff', border: '#0D47A1' };
    if (job.status === 'waiting') return { bg: '#E65100', text: '#fff', border: '#BF360C' };
    return { bg: '#555', text: '#fff', border: '#333' };
  }

  // ── Render a single job bar ──
  function JobBar({ job, rowHeight = 32 }) {
    const created = dayOffset(job.entered_current_at || job.created_at);
    const due = dayOffset(job.due_date);
    const colors = getBarColor(job);

    // If no due date, show a dot at created date
    if (due === null && created === null) return null;

    const startDay = created !== null ? Math.max(0, created) : Math.max(0, (due || 0) - 3);
    const endDay = due !== null ? Math.min(totalDays, due) : Math.min(totalDays, startDay + 3);

    // Minimum bar width
    const barWidthPct = Math.max(dayToPercent(endDay) - dayToPercent(startDay), 1.5);
    const barLeftPct = dayToPercent(startDay);

    const isOverdue = job.due_date && new Date(job.due_date) < today && job.status !== 'completed';

    return (
      <div style={{ position: 'relative', height: rowHeight, marginBottom: 2 }}>
        <div
          title={`${job.flex_job_number || job.id}${job.customer_name ? ' — ' + job.customer_name : ''}${job.due_date ? '\nDue: ' + new Date(job.due_date).toLocaleDateString() : '\nNo due date'}${job.is_rush ? '\n🔴 RUSH' : ''}`}
          style={{
            position: 'absolute',
            left: `${barLeftPct}%`,
            width: `${barWidthPct}%`,
            minWidth: 60,
            height: rowHeight - 4,
            top: 2,
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            padding: '0 6px',
            overflow: 'hidden',
            cursor: 'default',
            boxShadow: isOverdue ? '0 0 0 2px #C62828' : 'none',
            animation: isOverdue ? 'pulse-border 2s infinite' : 'none',
          }}
        >
          <span style={{
            fontSize: 10, fontWeight: 700, color: colors.text,
            fontFamily: "'SF Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {job.is_rush ? '🔴 ' : ''}{job.flex_job_number || job.id}
            {job.customer_name ? ` — ${job.customer_name}` : ''}
          </span>
        </div>
      </div>
    );
  }

  // ── Date header with week markers ──
  function DateHeader() {
    const markers = [];
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      const isMonday = d.getDay() === 1;
      const isToday = d.toDateString() === today.toDateString();

      if (isMonday || isToday) {
        markers.push(
          <div key={i} style={{
            position: 'absolute',
            left: `${dayToPercent(i)}%`,
            top: 0,
            height: '100%',
            borderLeft: isToday ? '2px solid #C62828' : `1px dashed ${theme.border}`,
            zIndex: isToday ? 3 : 1,
          }}>
            <span style={{
              position: 'absolute', top: -18, left: 2,
              fontSize: 9, fontWeight: isToday ? 800 : 400,
              color: isToday ? '#C62828' : theme.mutedText,
              fontFamily: "'SF Mono', monospace",
              whiteSpace: 'nowrap',
              background: isToday ? (darkMode ? '#1a1a1a' : '#fff') : 'transparent',
              padding: isToday ? '0 4px' : 0,
              borderRadius: 2,
            }}>
              {isToday ? '▼ TODAY' : `${d.getMonth() + 1}/${d.getDate()}`}
            </span>
          </div>
        );
      }
    }
    return <>{markers}</>;
  }

  // ── VIEW: Timeline (all jobs, sorted by due date) ──
  function TimelineView() {
    const sorted = [...jobs].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });

    return (
      <div style={{ position: 'relative', paddingTop: 24 }}>
        <DateHeader />
        {sorted.map(j => <JobBar key={j.id} job={j} />)}
        {sorted.length === 0 && (
          <p style={{ color: theme.mutedText, textAlign: 'center', padding: 40 }}>No jobs to display</p>
        )}
      </div>
    );
  }

  // ── VIEW: By Department (rows = depts) ──
  function DepartmentView() {
    const deptJobs = {};
    departments.forEach(d => { deptJobs[d.id] = { name: d.name, jobs: [] }; });
    // Unassigned bucket
    deptJobs['_none'] = { name: 'Unassigned', jobs: [] };

    jobs.forEach(j => {
      const key = j.current_department_id || '_none';
      if (deptJobs[key]) deptJobs[key].jobs.push(j);
      else deptJobs['_none'].jobs.push(j);
    });

    return (
      <div style={{ position: 'relative', paddingTop: 24 }}>
        <DateHeader />
        {Object.entries(deptJobs).map(([deptId, { name, jobs: dj }]) => {
          if (dj.length === 0) return null;
          const dc = getDeptColor(deptId === '_none' ? null : deptId, darkMode);
          const sorted = [...dj].sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
          });
          return (
            <div key={deptId} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: dc.label || theme.text,
                fontFamily: "'SF Mono', monospace", marginBottom: 4,
                padding: '4px 8px', background: dc.bg || 'transparent',
                borderRadius: 4, borderLeft: `3px solid ${dc.border || theme.border}`
              }}>
                {name} ({sorted.length})
              </div>
              {sorted.map(j => <JobBar key={j.id} job={j} rowHeight={28} />)}
            </div>
          );
        })}
      </div>
    );
  }

  // ── VIEW: By Status ──
  function StatusView() {
    const groups = {
      rush: { label: '🔴 RUSH', jobs: jobs.filter(j => j.is_rush && j.status !== 'completed') },
      active: { label: '🔵 Active', jobs: jobs.filter(j => j.status === 'active' && !j.is_rush) },
      waiting: { label: '🟠 Waiting', jobs: jobs.filter(j => j.status === 'waiting' && !j.is_rush) },
    };
    if (showCompleted) {
      groups.completed = { label: '⚫ Completed', jobs: jobs.filter(j => j.status === 'completed') };
    }

    return (
      <div style={{ position: 'relative', paddingTop: 24 }}>
        <DateHeader />
        {Object.entries(groups).map(([key, { label, jobs: gj }]) => {
          if (gj.length === 0) return null;
          const sorted = [...gj].sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
          });
          return (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: theme.text,
                fontFamily: "'SF Mono', monospace", marginBottom: 4,
                padding: '4px 8px',
                borderLeft: `3px solid ${key === 'rush' ? '#C62828' : key === 'active' ? '#1565C0' : key === 'waiting' ? '#E65100' : '#757575'}`,
              }}>
                {label} ({sorted.length})
              </div>
              {sorted.map(j => <JobBar key={j.id} job={j} rowHeight={28} />)}
            </div>
          );
        })}
      </div>
    );
  }

  if (loading) return <p style={{ color: theme.mutedText, textAlign: 'center', padding: 40 }}>Loading Gantt view...</p>;

  return (
    <div>
      {/* Controls bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        {/* View mode buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'timeline', label: '📅 Timeline' },
            { id: 'department', label: '🏢 By Dept' },
            { id: 'status', label: '🏷️ By Status' },
          ].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: viewMode === v.id ? 700 : 400,
              background: viewMode === v.id ? theme.accent : 'transparent',
              color: viewMode === v.id ? '#fff' : theme.mutedText,
              border: `1px solid ${viewMode === v.id ? theme.accent : theme.border}`,
              cursor: 'pointer', fontFamily: "'SF Mono', monospace"
            }}>{v.label}</button>
          ))}
        </div>

        {/* Zoom + completed toggle */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={zoomWeeks} onChange={e => setZoomWeeks(Number(e.target.value))} style={{
            padding: '4px 8px', borderRadius: 4, fontSize: 11, fontFamily: "'SF Mono', monospace",
            background: darkMode ? '#222' : '#f5f5f5', color: theme.text, border: `1px solid ${theme.border}`,
            cursor: 'pointer'
          }}>
            <option value={2}>2 weeks</option>
            <option value={4}>4 weeks</option>
            <option value={8}>8 weeks</option>
            <option value={12}>12 weeks</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: theme.mutedText, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} />
            Show completed
          </label>

          <button onClick={loadData} style={{
            padding: '4px 10px', background: 'transparent', border: `1px solid ${theme.border}`,
            color: theme.mutedText, borderRadius: 4, cursor: 'pointer', fontSize: 11
          }}>↻ Refresh</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Rush', color: '#C62828' },
          { label: 'Active', color: '#1565C0' },
          { label: 'Waiting', color: '#E65100' },
          { label: 'Completed', color: '#757575' },
          { label: 'Today', color: '#C62828', dashed: true },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: theme.mutedText }}>
            {l.dashed ? (
              <div style={{ width: 14, height: 0, borderTop: `2px solid ${l.color}` }} />
            ) : (
              <div style={{ width: 14, height: 10, borderRadius: 2, background: l.color }} />
            )}
            {l.label}
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div ref={scrollRef} style={{
        background: darkMode ? '#111' : '#fafafa',
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '24px 16px 16px',
        overflowX: 'auto',
        minHeight: 200,
        position: 'relative'
      }}>
        {/* Summary counts */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 11, color: theme.mutedText, fontFamily: "'SF Mono', monospace" }}>
          <span>Total: <strong style={{ color: theme.text }}>{jobs.length}</strong></span>
          <span>Rush: <strong style={{ color: '#C62828' }}>{jobs.filter(j => j.is_rush).length}</strong></span>
          <span>Overdue: <strong style={{ color: '#C62828' }}>{jobs.filter(j => j.due_date && new Date(j.due_date) < today && j.status !== 'completed').length}</strong></span>
          <span>No due date: <strong style={{ color: theme.mutedText }}>{jobs.filter(j => !j.due_date).length}</strong></span>
        </div>

        {viewMode === 'timeline' && <TimelineView />}
        {viewMode === 'department' && <DepartmentView />}
        {viewMode === 'status' && <StatusView />}
      </div>

      {/* Overdue pulse animation */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 2px #C62828; }
          50% { box-shadow: 0 0 0 2px transparent; }
        }
      `}</style>
    </div>
  );
}
