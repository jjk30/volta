import { useState, useEffect, useRef, useCallback } from 'react'
import { CATEGORIES, SYMBOLS } from '../symbolsData.js'

export default function SymbolsLibrary({ onInsert }) {
  const [activeCategory, setActiveCategory] = useState('Logic Gates')
  const [hovered, setHovered] = useState(null)
  const [openTT, setOpenTT] = useState(null) // symbol id or null
  const popoverRef = useRef(null)

  const symbols = SYMBOLS[activeCategory] || []

  // Close popover on Escape or click outside
  useEffect(() => {
    if (!openTT) return

    const handleKey = (e) => {
      if (e.key === 'Escape') setOpenTT(null)
    }
    const handleClick = (e) => {
      // Delay check so the opening click doesn't immediately close
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpenTT(null)
      }
    }

    document.addEventListener('keydown', handleKey)
    // Use setTimeout so the current click event doesn't trigger close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 50)

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
      clearTimeout(timer)
    }
  }, [openTT])

  const handleTTClick = useCallback((e, symId) => {
    e.stopPropagation()
    e.preventDefault()
    console.log('[Volta] TT clicked:', symId, 'current:', openTT)
    setOpenTT((prev) => prev === symId ? null : symId)
  }, [openTT])

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
            onClick={() => { setActiveCategory(cat); setOpenTT(null) }}
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
          const isTTOpen = openTT === sym.id
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
              {/* TT button — only if symbol has a truth table */}
              {sym.truthTable && (
                <div
                  onClick={(e) => handleTTClick(e, sym.id)}
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

              {/* SVG container — fixed height, scales SVG to fit */}
              <div
                onClick={(e) => { if (!isTTOpen) onInsert(sym.verilog) }}
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
              {/* Name — fixed bottom area */}
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

              {/* Truth table popover — inside the card, absolutely positioned */}
              {isTTOpen && sym.truthTable && (
                <div
                  ref={popoverRef}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '0',
                    marginTop: '4px',
                    zIndex: 100,
                    background: '#0a0a0a',
                    border: '1px solid #1a4a1a',
                    borderRadius: '4px',
                    padding: '8px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '10px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                    minWidth: '120px',
                    maxWidth: '320px',
                    maxHeight: '220px',
                    overflow: 'auto',
                  }}
                >
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        {sym.truthTable.headers.map((h, i) => (
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
                      {sym.truthTable.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} style={{
                              padding: '2px 8px',
                              borderBottom: i < sym.truthTable.rows.length - 1 ? '1px solid #111' : 'none',
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
        })}
      </div>
    </div>
  )
}
