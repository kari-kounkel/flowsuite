import { useState } from 'react'
import { themes, ThemeCtx } from './theme.jsx'
import PeopleFlowModule from './modules/PeopleFlow.jsx'
import PaperFlowModule from './modules/PaperFlow.jsx'
import AdminPanel from './modules/AdminPanel.jsx'

export default function App({ user, orgCtx, onLogout }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('fs-theme') || 'brown' } catch { return 'brown' }
  })
  const [activeModule, setActiveModule] = useState('peopleflow')

  const C = themes[theme] || themes.brown
  const toggleTheme = () => {
    const n = theme === 'brown' ? 'cream' : 'brown'
    setTheme(n)
    try { localStorage.setItem('fs-theme', n) } catch {}
  }

  const orgId = orgCtx?.orgId
  const role = orgCtx?.role || 'viewer'
  const enabledModules = orgCtx?.modules || []
  const isSuperAdmin = role === 'super_admin'

  // Module definitions
  const allModules = [
    { id: 'peopleflow', label: 'PeopleFlow', icon: '👥', desc: 'HR & Team' },
    { id: 'paperflow', label: 'PaperFlow', icon: '📄', desc: 'Contracts & Policies' },
    { id: 'scanflow', label: 'ScanFlow', icon: '📦', desc: 'Job Tracking', future: true },
  ]

  return (
    <ThemeCtx.Provider value={{ theme, C, toggleTheme }}>
      <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Outfit', sans-serif", color: C.w }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

        {/* ═══ HEADER ═══ */}
        <header style={{
          padding: '12px 16px', borderBottom: `1px solid ${C.bdr}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8
        }}>
          {/* Left: Branding */}
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              <span style={{ color: C.go }}>Flow</span><span style={{ fontWeight: 300 }}>Suite</span>
            </h1>
            <p style={{ margin: 0, fontSize: 9, color: C.g, letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" }}>
              {orgCtx?.orgName || 'CARES Workflows'} • ☁ synced
            </p>
          </div>

          {/* Center: Module Switcher */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {allModules.map(m => {
              const enabled = enabledModules.includes(m.id)
              const active = activeModule === m.id
              const locked = !enabled && !m.future
              return (
                <button key={m.id} onClick={() => {
                  if (enabled) setActiveModule(m.id)
                }} style={{
                  background: active ? C.gD : 'transparent',
                  border: `1px solid ${active ? C.go : C.bdrF}`,
                  color: active ? C.go : enabled ? C.g : `${C.g}55`,
                  padding: '6px 12px', borderRadius: 8, cursor: enabled ? 'pointer' : 'default',
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  opacity: enabled ? 1 : 0.4, display: 'flex', alignItems: 'center', gap: 4
                }}>
                  {m.icon} {m.label}
                  {!enabled && <span style={{ fontSize: 8 }}>🔒</span>}
                </button>
              )
            })}
            {/* Admin button — super_admin only */}
            {isSuperAdmin && (
              <button onClick={() => setActiveModule('admin')} style={{
                background: activeModule === 'admin' ? C.rdD : 'transparent',
                border: `1px solid ${activeModule === 'admin' ? C.rd : C.bdrF}`,
                color: activeModule === 'admin' ? C.rd : C.g,
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4
              }}>⚙ Admin</button>
            )}
          </div>

          {/* Right: Controls */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.g }}>{orgCtx?.displayName || user.email}</span>
            <button onClick={toggleTheme} title={theme === 'brown' ? 'Switch to Cream' : 'Switch to Brown'} style={{
              background: C.gD, border: `1px solid ${C.bdr}`, color: C.go,
              padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 10
            }}>{theme === 'brown' ? '☀' : '🌙'}</button>
            {onLogout && <button onClick={onLogout} style={{
              background: 'transparent', border: `1px solid ${C.bdr}`, color: C.g,
              padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 10
            }}>↪ Out</button>}
          </div>
        </header>

        {/* ═══ MAIN CONTENT ═══ */}
        <main style={{ padding: 16, maxWidth: 1440, margin: '0 auto' }}>
          {!orgId && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: C.g }}>
              <h2 style={{ color: C.go, marginBottom: 8 }}>Welcome to FlowSuite</h2>
              <p>Your account isn't linked to an organization yet. Ask your admin to add you, or run the user setup SQL.</p>
            </div>
          )}

          {orgId && activeModule === 'peopleflow' && enabledModules.includes('peopleflow') && (
            <PeopleFlowModule orgId={orgId} C={C} />
          )}

          {orgId && activeModule === 'paperflow' && enabledModules.includes('paperflow') && (
            <PaperFlowModule orgId={orgId} C={C} user={user} />
          )}

          {orgId && activeModule === 'scanflow' && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: C.g }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <h2 style={{ color: C.go, marginBottom: 8 }}>ScanFlow</h2>
              <p>Job tracking with barcode scanning. Coming soon.</p>
            </div>
          )}

          {activeModule === 'admin' && isSuperAdmin && (
            <AdminPanel orgCtx={orgCtx} C={C} />
          )}
        </main>

        {/* Print styles */}
        <style>{"@media print{header,button{display:none!important}}"}</style>
      </div>
    </ThemeCtx.Provider>
  )
}
