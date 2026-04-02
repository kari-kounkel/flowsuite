import { useRef, useState, useEffect } from 'react'

// ── SignaturePad ──────────────────────────────────────────────────────────────
// Reusable canvas-based signature component for FlowSuite
// Props:
//   C           — FlowSuite theme object (required)
//   label       — label above pad (default: 'Signature')
//   required    — shows red asterisk (default: false)
//   onSign      — callback(dataURL) called when signature drawn
//   onClear     — callback() called when cleared
//   disabled    — locks pad (default: false)
//   signedAt    — if set, shows "Signed [date]" badge instead of pad
//   height      — canvas height in px (default: 130)
// ─────────────────────────────────────────────────────────────────────────────

export default function SignaturePad({
  C,
  label = 'Signature',
  required = false,
  onSign,
  onClear,
  disabled = false,
  signedAt = null,
  height = 130,
}) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [lastPos, setLastPos] = useState(null)

  // ── Canvas setup ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = C?.w || '#ffffff'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [C])

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = (e) => {
    if (disabled) return
    e.preventDefault()
    const canvas = canvasRef.current
    const pos = getPos(e, canvas)
    setDrawing(true)
    setLastPos(pos)
  }

  const draw = (e) => {
    if (!drawing || disabled) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.x, lastPos.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setLastPos(pos)
    if (!hasSig) setHasSig(true)
  }

  const endDraw = (e) => {
    if (!drawing) return
    e.preventDefault()
    setDrawing(false)
    if (hasSig && onSign) {
      const canvas = canvasRef.current
      onSign(canvas.toDataURL('image/png'))
    }
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSig(false)
    setLastPos(null)
    if (onClear) onClear()
  }

  // Already signed — show badge only
  if (signedAt) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          {label}{required && <span style={{ color: C.rd || '#EF4444', marginLeft: 2 }}>*</span>}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.3)',
        }}>
          <span style={{ fontSize: 18, color: C.gr || '#22C55E' }}>✓</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gr || '#22C55E' }}>Signed</div>
            <div style={{ fontSize: 10, color: C.g }}>
              {new Date(signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: C.g, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}{required && <span style={{ color: C.rd || '#EF4444', marginLeft: 2 }}>*</span>}
        </div>
        {hasSig && !disabled && (
          <button
            onClick={clear}
            style={{
              fontSize: 10, color: C.g, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px',
              borderRadius: 4, transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.target.style.color = C.rd || '#EF4444'}
            onMouseLeave={e => e.target.style.color = C.g}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Canvas */}
      <div style={{
        position: 'relative',
        borderRadius: 8,
        border: `1px solid ${hasSig ? (C.go || '#F59E0B') : (C.bdr || '#374151')}`,
        background: C.ch || '#111827',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
        cursor: disabled ? 'not-allowed' : 'crosshair',
        opacity: disabled ? 0.5 : 1,
      }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={height * (600 / 300)}
          style={{ display: 'block', width: '100%', height: height, touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />

        {/* Placeholder line */}
        {!hasSig && (
          <div style={{
            position: 'absolute', bottom: 28, left: 16, right: 16,
            borderBottom: `1px solid ${C.bdr || '#374151'}`,
            pointerEvents: 'none',
          }} />
        )}

        {/* Placeholder text */}
        {!hasSig && (
          <div style={{
            position: 'absolute', bottom: 8, left: 0, right: 0,
            textAlign: 'center', fontSize: 10, color: C.g,
            pointerEvents: 'none', letterSpacing: '0.05em',
          }}>
            {disabled ? 'Signature locked' : 'Sign above'}
          </div>
        )}
      </div>

      {/* Legal note */}
      {!disabled && (
        <div style={{ fontSize: 9, color: C.g, marginTop: 5, lineHeight: 1.5, opacity: 0.7 }}>
          By signing, you confirm this is your electronic signature and agree it is legally binding.
        </div>
      )}
    </div>
  )
}
