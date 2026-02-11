import { useState } from 'react'
import { supabase } from './supabase.js'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login')

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#1E1510', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Outfit',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      <form onSubmit={handleAuth} style={{ background:'#2A1F17', borderRadius:16, padding:'48px 40px', width:360, border:'1px solid rgba(212,168,83,0.15)' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <h1 style={{ margin:0, fontSize:28, color:'#F5F0E8', fontWeight:700 }}>
            <span style={{ color:'#D4A853' }}>Flow</span>Suite
          </h1>
          <p style={{ margin:'6px 0 0', fontSize:11, color:'#8B7355', letterSpacing:'2px', textTransform:'uppercase' }}>CARES WORKFLOWS</p>
        </div>
        {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#EF4444', padding:'8px 12px', borderRadius:8, fontSize:12, marginBottom:16 }}>{error}</div>}
        <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required
          style={{ width:'100%', padding:'12px 16px', background:'#1E1510', border:'1px solid rgba(212,168,83,0.2)', borderRadius:8, color:'#F5F0E8', fontSize:14, marginBottom:12, boxSizing:'border-box', outline:'none', fontFamily:'inherit' }}/>
        <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required
          style={{ width:'100%', padding:'12px 16px', background:'#1E1510', border:'1px solid rgba(212,168,83,0.2)', borderRadius:8, color:'#F5F0E8', fontSize:14, marginBottom:20, boxSizing:'border-box', outline:'none', fontFamily:'inherit' }}/>
        <button type="submit" disabled={loading}
          style={{ width:'100%', padding:'12px', background:'#D4A853', color:'#1E1510', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:loading?'wait':'pointer', fontFamily:'inherit' }}>
          {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
        <p style={{ textAlign:'center', marginTop:16, fontSize:12, color:'#8B7355' }}>
          {mode === 'login' ? "No account? " : "Have an account? "}
          <span onClick={()=>setMode(mode==='login'?'signup':'login')} style={{ color:'#D4A853', cursor:'pointer', textDecoration:'underline' }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </span>
        </p>
      </form>
    </div>
  )
}
