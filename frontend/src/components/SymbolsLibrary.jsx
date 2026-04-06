import { useState, useEffect, useRef, useCallback } from 'react'
import { CATEGORIES, SYMBOLS } from '../symbolsData.js'

export default function SymbolsLibrary({ onInsert }) {
  const [activeCategory, setActiveCategory] = useState('Logic Gates')
  const [hovered, setHovered] = useState(null)
  const [ttState, setTtState] = useState(null) // { symId, table, x, y } or null
  const popoverRef = useRef(null)

  const symbols = SYMBOLS[activeCategory] || []

  // Close popover on Escape or click outside
  useEffect(() => {
    if (!ttState) return

    const handleKey = (e) => {
      if (e.key === 'Escape') setTtState(null)
    }
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setTtState(null)
      }
    }

    document.addEventListener('keydown', handleKey)
    // Delay so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 100)

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
      clearTimeout(timer)
    }
  }, [ttState])

  const handleTTClick = useCallback((e, sym) => {
    e.stopPropagation()
    e.preventDefault()
    e.nativeEvent?.stopImmediatePropagation?.()

    if (ttState?.symId === sym.id) {
      setTtState(null)
    } else {
      const rect = e.currentTarget.getBoundingClientRect()
      setTtState({
        symId: sym.id,
        table: sym.truthTable,
        x: rect.left,
        y: rect.bottom + 4,
      })
    }
  }, [ttState])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#000',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {/* Header */}
      <div style={{
        padding: '3px 12px',
        fontSize: '11px',
        color: 'var(--accent)',
        fontWeight: 500,
        background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--border)',
        letterSpacing: '1px',
        flexShrink: 0,
      }}>
        SYMBOLS LIBRARY
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex',
        gap: '0',
        overflowX: 'auto',
        flexShrink: 0,
        background: '#050505',
        borderBottom: '1px solid var(--border)',
      }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setTtState(null) }}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeCategory === cat ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeCategory === cat ? 'var(--accent)' : '#444',
              fontSize: '9px',
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Hint */}
      <div style={{
        padding: '3px 8px',
        fontSize: '9px',
        color: '#446644',
        fontStyle: 'italic',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        Click symbol to insert code &bull; Click TT for truth table
      </div>

      {/* Symbol grid */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '6px',
        alignContent: 'start',
      }}>
        {symbols.map((sym) => {
          const isHovered = hovered === sym.id
          const isTTOpen = ttState?.symId === sym.id
          return (
            <div
              key={sym.id}
              onMouseEnter={() => setHovered(sym.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                height: '160px',
                padding: '8px',
                borderRadius: '4px',
                border: `1px solid ${isHovered || isTTOpen ? 'var(--accent)' : '#1a1a1a'}`,
                background: isHovered ? '#001a00' : '#0a0a0a',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: isHovered ? '0 0 8px #00ff4120' : 'none',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* TT button */}
              {sym.truthTable && (
                <div
                  onClick={(e) => handleTTClick(e, sym)}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '22px',
                    height: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${isTTOpen ? 'var(--accent)' : '#333'}`,
                    borderRadius: '2px',
                    background: isTTOpen ? '#001a00' : '#111',
                    color: isTTOpen ? 'var(--accent)' : '#555',
                    fontSize: '8px',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                    zIndex: 2,
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={(e) => {
                    if (!isTTOpen) { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#555' }
                  }}
                  title="Show truth table"
                >
                  TT
                </div>
              )}

              {/* SVG container */}
              <div
                onClick={() => { if (!isTTOpen) onInsert(sym.verilog) }}
                style={{
                  flex: 1,
                  minHeight: 0,
                  maxHeight: '115px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
                dangerouslySetInnerHTML={{
                  __html: sym.svg(isHovered ? '#00ff41' : '#00cc33')
                    .replace(/<svg /, '<svg style="width:100%;height:100%;max-width:100%;max-height:110px" preserveAspectRatio="xMidYMid meet" '),
                }}
              />
              {/* Name */}
              <div
                onClick={() => { if (!isTTOpen) onInsert(sym.verilog) }}
                style={{
                  height: '24px',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                  fontWeight: 600,
                  color: isHovered ? 'var(--accent)' : '#666',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {sym.name}
              </div>
            </div>
          )
        })}
      </div>

      {/* Truth table popover — position:fixed, rendered at root level */}
      {ttState && ttState.table && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            left: Math.min(ttState.x, window.innerWidth - 280),
            top: Math.min(ttState.y, window.innerHeight - 200),
            zIndex: 9999,
            background: '#0a0a0a',
            border: '1px solid #00ff41',
            borderRadius: '4px',
            padding: '8px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            boxShadow: '0 4px 20px rgba(0,255,65,0.1), 0 4px 16px rgba(0,0,0,0.6)',
            maxWidth: '300px',
            maxHeight: '220px',
            overflow: 'auto',
          }}
        >
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {ttState.table.headers.map((h, i) => (
                  <th key={i} style={{
                    padding: '3px 8px',
                    borderBottom: '1px solid #1a4a1a',
                    color: '#00ff41',
                    fontWeight: 600,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ttState.table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} style={{
                      padding: '2px 8px',
                      borderBottom: i < ttState.table.rows.length - 1 ? '1px solid #111' : 'none',
                      color: '#00cc33',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                    }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
