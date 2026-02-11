import { useState, useEffect } from 'react'
import { supabase } from '../supabase.js'
import { Card, Tag, Btn, fm } from '../theme.jsx'

export default function AdminPanel({ orgCtx, C }) {
  const [orgs, setOrgs] = useState([])
  const [users, setUsers] = useState([])
  const [modules, setModules] = useState([])
  const [view, setView] = useState('overview')

  useEffect(() => {
    const load = async () => {
      const [oR, uR, mR] = await Promise.all([
        supabase.from('organizations').select('*'),
        supabase.from('org_users').select('*'),
        supabase.from('org_modules').select('*')
      ])
      setOrgs(oR.data || [])
      setUsers(uR.data || [])
      setModules(mR.data || [])
    }
    load()
  }, [])

  const tabs = [
    { k: 'overview', l: 'Overview', i: '◆' },
    { k: 'orgs', l: 'Organizations', i: '⊞' },
    { k: 'users', l: 'Users', i: '◉' },
    { k: 'modules', l: 'Modules', i: '⊕' }
  ]

  const toggleModule = async (orgId, moduleName, currentEnabled) => {
    const existing = modules.find(m => m.org_id === orgId && m.module === moduleName)
    if (existing) {
      await supabase.from('org_modules').update({ enabled: !currentEnabled }).eq('id', existing.id)
      setModules(p => p.map(m => m.id === existing.id ? { ...m, enabled: !currentEnabled } : m))
    } else {
      const { data } = await supabase.from('org_modules').insert({ org_id: orgId, module: moduleName, enabled: true }).select().single()
      if (data) setModules(p => [...p, data])
    }
  }

  return (<div>
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 12, padding: '8px 0', borderBottom: `1px solid ${C.bdr}` }}>
      {tabs.map(t => <button key={t.k} onClick={() => setView(t.k)} style={{
        background: view === t.k ? C.gD : 'transparent', border: `1px solid ${view === t.k ? C.go : C.bdrF}`,
        color: view === t.k ? C.go : C.g, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
        fontSize: 10, fontWeight: 500, fontFamily: 'inherit'
      }}>{t.i} {t.l}</button>)}
    </div>

    {view === 'overview' && <div>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>Admin Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Card C={C}><div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase' }}>Organizations</div><div style={{ fontSize: 28, fontWeight: 700, color: C.go }}>{orgs.length}</div></Card>
        <Card C={C}><div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase' }}>Users</div><div style={{ fontSize: 28, fontWeight: 700, color: C.bl }}>{users.length}</div></Card>
        <Card C={C}><div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase' }}>Active Modules</div><div style={{ fontSize: 28, fontWeight: 700, color: C.gr }}>{modules.filter(m => m.enabled).length}</div></Card>
      </div>
    </div>}

    {view === 'orgs' && <div>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>Organizations</h2>
      {orgs.map(o => (
        <Card key={o.id} C={C} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}</div>
              <div style={{ fontSize: 11, color: C.g }}>ID: {o.id} • Slug: {o.slug}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Tag c={o.plan === 'enterprise' ? C.go : o.plan === 'pro' ? C.bl : C.g}>{o.plan}</Tag>
              <div style={{ fontSize: 10, color: C.g, marginTop: 2 }}>{users.filter(u => u.org_id === o.id).length} users</div>
            </div>
          </div>
        </Card>
      ))}
    </div>}

    {view === 'users' && <div>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>All Users</h2>
      <Card C={C}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ borderBottom: `1px solid ${C.bdr}` }}>
            {['Name', 'Email', 'Org', 'Role', 'Added'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: C.g, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id} style={{ borderBottom: `1px solid ${C.bdr}` }}>
              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{u.display_name || '—'}</td>
              <td style={{ padding: '6px 8px', color: C.g }}>{u.email || '—'}</td>
              <td style={{ padding: '6px 8px' }}>{u.org_id}</td>
              <td style={{ padding: '6px 8px' }}><Tag c={
                u.role === 'super_admin' ? C.go : u.role === 'org_admin' ? C.bl : u.role === 'manager' ? C.am : C.g
              }>{u.role}</Tag></td>
              <td style={{ padding: '6px 8px', color: C.g }}>{fm(u.created_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>}

    {view === 'modules' && <div>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>Module Management</h2>
      {orgs.map(o => {
        const orgModules = modules.filter(m => m.org_id === o.id)
        const allMods = ['peopleflow', 'paperflow', 'scanflow', 'moneyflow']
        return (
          <Card key={o.id} C={C} style={{ marginBottom: 10 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, color: C.go }}>{o.name}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {allMods.map(mod => {
                const m = orgModules.find(x => x.module === mod)
                const enabled = m ? m.enabled : false
                return (
                  <div key={mod} onClick={() => toggleModule(o.id, mod, enabled)} style={{
                    padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                    background: enabled ? C.grD : C.nL,
                    border: `1px solid ${enabled ? C.gr : C.bdr}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? C.gr : C.g, textTransform: 'capitalize' }}>{mod}</span>
                    <span style={{ fontSize: 10, color: enabled ? C.gr : C.g }}>{enabled ? '✓ ON' : '○ OFF'}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>}
  </div>)
}
