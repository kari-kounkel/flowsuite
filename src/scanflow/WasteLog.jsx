// ═══════════════════════════════════════════════════════
// WASTE LOG — Waste tracking display and summaries
// ═══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';
import { cardStyle as getCardStyle } from './scanflowTheme.js';

export function WasteLog({ theme, orgId, darkMode }) {
  const [waste, setWaste] = useState([]);
  const [totals, setTotals] = useState({ total: 0, emergency: 0 });

  const cardSt = getCardStyle(theme);

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

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", marginBottom: 16 }}>🗑️ Waste Tracking</h2>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#E65100' }}>{totals.total}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>Total Sheets Wasted</div>
        </div>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#C62828' }}>{totals.emergency}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>Emergency Stops</div>
        </div>
        <div style={{ ...cardSt, textAlign: 'center', marginBottom: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: theme.accent }}>{waste.length}</div>
          <div style={{ fontSize: 11, color: theme.mutedText }}>Waste Events</div>
        </div>
      </div>

      {/* Waste Log */}
      {waste.length === 0 ? (
        <div style={{ ...cardSt, textAlign: 'center' }}>
          <p style={{ color: theme.mutedText }}>No waste logged yet. That's either great news or nobody's scanning. 🤷</p>
        </div>
      ) : waste.map(w => (
        <div key={w.id} style={{
          ...cardSt, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderLeft: w.is_emergency ? '4px solid #C62828' : `4px solid ${theme.border}`
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {w.job_sleeves?.flex_job_number || w.job_id}
              {w.job_sleeves?.customer_name && <span style={{ fontWeight: 400, color: theme.mutedText, marginLeft: 8 }}>{w.job_sleeves.customer_name}</span>}
            </div>
            {w.reason && <div style={{ fontSize: 12, color: theme.mutedText, marginTop: 2 }}>{w.reason}</div>}
            <div style={{ fontSize: 11, color: theme.mutedText, marginTop: 2 }}>{w.employee_id} — {new Date(w.logged_at).toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#E65100' }}>{w.sheets_wasted}</div>
            <div style={{ fontSize: 10, color: theme.mutedText }}>sheets</div>
            {w.is_emergency && <span style={{ fontSize: 10, fontWeight: 700, color: '#C62828' }}>🛑 EMERGENCY</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
