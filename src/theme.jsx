import { createContext, useContext } from 'react'

export const themes = {
  brown: {
    bg:'#1E1510',bg2:'#2A1F17',ch:'#332618',gD:'#3D2E1F',nL:'rgba(212,168,83,0.06)',
    go:'#D4A853',w:'#F5F0E8',g:'#8B7355',bdr:'rgba(212,168,83,0.15)',bdrF:'rgba(255,255,255,0.04)',
    gr:'#22C55E',grD:'rgba(34,197,94,0.1)',rd:'#EF4444',rdD:'rgba(239,68,68,0.1)',
    am:'#F59E0B',aD:'rgba(245,158,11,0.1)',bl:'#3B82F6',blD:'rgba(59,130,246,0.1)'
  },
  cream: {
    bg:'#F5EDE0',bg2:'#EDE4D4',ch:'#E8DCC8',gD:'#DDD0BA',nL:'rgba(139,115,85,0.08)',
    go:'#8B6914',w:'#1E1510',g:'#6B5B4A',bdr:'rgba(139,115,85,0.2)',bdrF:'rgba(0,0,0,0.06)',
    gr:'#15803D',grD:'rgba(21,128,61,0.1)',rd:'#DC2626',rdD:'rgba(220,38,38,0.1)',
    am:'#B45309',aD:'rgba(180,83,9,0.1)',bl:'#1D4ED8',blD:'rgba(29,78,216,0.1)'
  }
}

export const ThemeCtx = createContext()
export const useTheme = () => useContext(ThemeCtx)

// Shared UI Components
export const Card = ({ children, style = {}, C }) => (
  <div style={{ background: C.bg2, borderRadius: 10, padding: 16, border: `1px solid ${C.bdr}`, ...style }}>{children}</div>
)
export const Tag = ({ children, c }) => (
  <span style={{ background: `${c}22`, color: c, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600 }}>{children}</span>
)
export const Btn = ({ children, onClick, gold, ghost, small, disabled, style = {}, C }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? '4px 10px' : '8px 16px',
    background: gold ? C.go : ghost ? 'transparent' : C.ch,
    color: gold ? C.bg : C.w, border: ghost ? `1px solid ${C.bdr}` : 'none',
    borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: small ? 11 : 13, fontWeight: 600, fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1, ...style
  }}>{children}</button>
)

export const fm = d => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
export const dbt = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
export const td = new Date().toISOString().split('T')[0]
