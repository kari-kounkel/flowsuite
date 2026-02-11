import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './supabase.js'
import Auth from './Auth.jsx'
import App from './App.jsx'

function Root() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orgCtx, setOrgCtx] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadOrgContext(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) loadOrgContext(session.user.id)
      else { setOrgCtx(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadOrgContext = async (userId) => {
    try {
      // Get user's org membership
      const { data: memberships } = await supabase
        .from('org_users')
        .select('org_id, role, display_name')
        .eq('user_id', userId)

      if (memberships && memberships.length > 0) {
        const membership = memberships[0] // default to first org
        // Get org details
        const { data: org } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', membership.org_id)
          .single()
        // Get enabled modules
        const { data: modules } = await supabase
          .from('org_modules')
          .select('module, enabled')
          .eq('org_id', membership.org_id)

        setOrgCtx({
          orgId: membership.org_id,
          orgName: org?.name || membership.org_id,
          role: membership.role,
          displayName: membership.display_name,
          modules: (modules || []).filter(m => m.enabled).map(m => m.module),
          allModules: modules || []
        })
      } else {
        // ── AUTO-LINK: match auth email → employees table → create org_users row ──
        const { data: { user } } = await supabase.auth.getUser()
        const authEmail = user?.email?.toLowerCase()
        if (authEmail) {
          const { data: empMatch } = await supabase
            .from('employees')
            .select('first_name, last_name, org_id')
            .ilike('email', authEmail)
            .limit(1)
            .single()
          if (empMatch) {
            const orgId = empMatch.org_id || 'minuteman'
            const displayName = `${empMatch.first_name} ${empMatch.last_name}`.trim()
            // Auto-create org_users row
            await supabase.from('org_users').insert({
              org_id: orgId,
              user_id: userId,
              role: 'employee',
              display_name: displayName,
              email: authEmail
            })
            console.log(`Auto-linked ${authEmail} → ${orgId} as ${displayName}`)
            // Reload context now that the row exists
            return loadOrgContext(userId)
          }
        }
        // No employee match either — still let them in (setup needed)
        setOrgCtx({ orgId: null, orgName: 'Setup Required', role: 'viewer', displayName: '', modules: [], allModules: [] })
      }
    } catch (err) {
      console.error('Org context load error:', err)
      setOrgCtx({ orgId: null, orgName: 'Error', role: 'viewer', displayName: '', modules: [], allModules: [] })
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#1E1510', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#D4A853', fontFamily:'monospace', fontSize:14 }}>Loading FlowSuite...</div>
    </div>
  )

  if (!session) return <Auth />

  return <App
    user={session.user}
    orgCtx={orgCtx}
    onLogout={() => supabase.auth.signOut()}
  />
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />)
