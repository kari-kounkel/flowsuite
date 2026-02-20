// ═══════════════════════════════════════════════════════
// STATION MANAGER — Map STA codes to real machine names
// Editing locked to managers/admins only
// ═══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { supabase } from '../supabase.js';
import { cardStyle as getCardStyle, inputStyle as getInputStyle } from './scanflowTheme.js';

export function StationManager({ theme, orgId, darkMode, userRole }) {
  const [stations, setStations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(null);

  const cardSt = getCardStyle(theme);
  const inpSt = getInputStyle(theme);

  // Only managers, org_admin, super_admin can edit
  const canEdit = ['manager','org_admin','super_admin'].includes(userRole)

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

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, fontFamily: "'SF Mono', monospace", marginBottom: 8 }}>🔧 Stations & Machines</h2>
      <p style={{ color: theme.mutedText, fontSize: 13, marginBottom: 16 }}>
        {canEdit ? "Click a station to rename it and assign it to a department." : "Station assignments are managed by your supervisor."}
      </p>

      {stations.map(s => (
        <div key={s.id} style={cardSt}>
          {editing === s.id && canEdit ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 12, fontFamily: "'SF Mono', monospace", minWidth: 90 }}>{s.id}</span>
              <input
                defaultValue={s.name.includes('unmapped') ? '' : s.name}
                id={`name-${s.id}`}
                placeholder="Machine name"
                style={{ ...inpSt, flex: 1, minWidth: 150, marginBottom: 0 }}
              />
              <select defaultValue={s.department_id || ''} id={`dept-${s.id}`} style={{ ...inpSt, minWidth: 140, marginBottom: 0 }}>
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button onClick={() => {
                const name = document.getElementById(`name-${s.id}`).value;
                const dept = document.getElementById(`dept-${s.id}`).value;
                updateStation(s.id, { name: name || s.name, department_id: dept || null });
              }} style={{ padding: '8px 16px', background: theme.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Save</button>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 12px', background: 'transparent', color: theme.mutedText, border: `1px solid ${theme.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
            </div>
          ) : (
            <div onClick={() => { if(canEdit) setEditing(s.id) }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: canEdit ? 'pointer' : 'default' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, fontFamily: "'SF Mono', monospace" }}>{s.id}</span>
                <span style={{ marginLeft: 12, fontWeight: s.name.includes('unmapped') ? 400 : 600, color: s.name.includes('unmapped') ? theme.mutedText : theme.text }}>
                  {s.name}
                </span>
              </div>
              {s.departments?.name && <span style={{ fontSize: 11, color: theme.mutedText }}>📍 {s.departments.name}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
