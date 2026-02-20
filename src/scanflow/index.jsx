// ═══════════════════════════════════════════════════════
// SCANFLOW MODULE — Main wrapper with tab navigation
// ═══════════════════════════════════════════════════════

import { useState } from 'react';
import { getTheme } from './scanflowTheme.js';
import { ScanForm } from './ScanForm.jsx';
import { JobDashboard } from './JobDashboard.jsx';
import { JobManager } from './JobManager.jsx';
import { StationManager } from './StationManager.jsx';
import { WasteLog } from './WasteLog.jsx';

export function ScanFlowModule({ darkMode, orgId = 'minuteman', userRole = 'employee' }) {
  const [activeTab, setActiveTab] = useState('scan');
  const theme = getTheme(darkMode);

  const tabs = [
    { id: 'scan', label: '📱 Scan' },
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'jobs', label: '📋 Jobs' },
    { id: 'stations', label: '🔧 Stations' },
    { id: 'waste', label: '🗑️ Waste Log' },
  ];

  return (
    <div style={{ color: theme.text }}>
      <div style={{
        display: 'flex', gap: 0, borderBottom: `2px solid ${theme.border}`,
        marginBottom: 24, overflowX: 'auto'
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '12px 20px',
            background: activeTab === t.id ? theme.accent : 'transparent',
            color: activeTab === t.id ? '#fff' : theme.mutedText,
            border: 'none',
            borderBottom: activeTab === t.id ? `2px solid ${theme.accent}` : '2px solid transparent',
            cursor: 'pointer', fontSize: 14,
            fontWeight: activeTab === t.id ? 700 : 400,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            whiteSpace: 'nowrap',
            borderRadius: '6px 6px 0 0',
            transition: 'all 0.2s'
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'scan' && <ScanForm theme={theme} orgId={orgId} userRole={userRole} darkMode={darkMode} />}
      {activeTab === 'dashboard' && <JobDashboard theme={theme} orgId={orgId} darkMode={darkMode} />}
      {activeTab === 'jobs' && <JobManager theme={theme} orgId={orgId} darkMode={darkMode} />}
      {activeTab === 'stations' && <StationManager theme={theme} orgId={orgId} darkMode={darkMode} userRole={userRole} />}
      {activeTab === 'waste' && <WasteLog theme={theme} orgId={orgId} darkMode={darkMode} />}
    </div>
  );
}

export default ScanFlowModule;
