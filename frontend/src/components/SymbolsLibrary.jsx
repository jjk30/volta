import { useState, useEffect, useRef } from 'react'
import { CATEGORIES, SYMBOLS } from '../symbolsData.js'

/** Truth table popover rendered near the clicked symbol card. */
function TruthTablePopover({ table, anchorRect, onClose }) {
  const ref = useRef(null)

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  if (!table) return null

  // Position near anchor — below and slightly right
  const style = {
    position: 'fixed',
    left: Math.min(anchorRect.left, window.innerWidth - 300),
    top: Math.min(anchorRect.bottom + 4, window.innerHeight - 250),
    zIndex: 1000,
    background: '#0a0a0a',
    border: '1px solid #1a4a1a',
    borderRadius: '4px',
    padding: '8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
    maxWidth: '320px',
    maxHeight: '220px',
    overflow: 'auto',
  }

  return (
    <div ref={ref} style={style}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {table.headers.map((h, i) => (
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
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '2px 8px',
                  borderBottom: i < table.rows.length - 1 ? '1px solid #111' : 'none',
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
  )
}

export default function SymbolsLibrary({ onInsert }) {
  const [activeCategory, setActiveCategory] = useState('Logic Gates')
  const [hovered, setHovered] = useState(null)
  const [ttOpen, setTtOpen] = useState(null) // { symbolId, table, rect }

  const symbols = SYMBOLS[activeCategory] || []

  const handleTTClick = (e, sym) => {
    e.stopPropagation()
    if (ttOpen?.symbolId === sym.id) {
      setTtOpen(null)
    } else {
      const rect = e.currentTarget.getBoundingClientRect()
      setTtOpen({ symbolId: sym.id, table: sym.truthTable, rect })
    }
  }

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
            onClick={() => { setActiveCategory(cat); setTtOpen(null) }}
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
              transition: 'all 0.15s',
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
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '6px',
        alignContent: 'start',
      }}>
        {symbols.map((sym) => {
          const isHovered = hovered === sym.id
          return (
            <div
              key={sym.id}
              onClick={() => onInsert(sym.verilog)}
              onMouseEnter={() => setHovered(sym.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: `1px solid ${isHovered ? 'var(--accent)' : '#1a1a1a'}`,
                background: isHovered ? '#001a00' : '#0a0a0a',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: isHovered ? '0 0 8px #00ff4120' : 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                position: 'relative',
              }}
            >
              {/* TT button — only if symbol has a truth table */}
              {sym.truthTable && (
                <button
                  onClick={(e) => handleTTClick(e, sym)}
                  style={{
                    position: 'absolute',
                    top: '3px',
                    right: '3px',
                    width: '20px',
                    height: '16px',
                    padding: '0',
                    border: `1px solid ${ttOpen?.symbolId === sym.id ? 'var(--accent)' : '#333'}`,
                    borderRadius: '2px',
                    background: ttOpen?.symbolId === sym.id ? '#001a00' : 'transparent',
                    color: ttOpen?.symbolId === sym.id ? 'var(--accent)' : '#555',
                    fontSize: '8px',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: 'pointer',
                    lineHeight: '14px',
                    transition: 'all 0.15s',
                    zIndex: 1,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={(e) => {
                    if (ttOpen?.symbolId !== sym.id) {
                      e.currentTarget.style.borderColor = '#333'
                      e.currentTarget.style.color = '#555'
                    }
                  }}
                  title="Show truth table"
                >
                  TT
                </button>
              )}

              {/* SVG preview */}
              <div
                style={{
                  width: '100%',
                  height: '80px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                dangerouslySetInnerHTML={{
                  __html: sym.svg(isHovered ? '#00ff41' : '#00cc33'),
                }}
              />
              {/* Name */}
              <div style={{
                fontSize: '9px',
                fontWeight: 600,
                color: isHovered ? 'var(--accent)' : '#666',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                textAlign: 'center',
              }}>
                {sym.name}
              </div>
            </div>
          )
        })}
      </div>

      {/* Truth table popover */}
      {ttOpen && (
        <TruthTablePopover
          table={ttOpen.table}
          anchorRect={ttOpen.rect}
          onClose={() => setTtOpen(null)}
        />
      )}
    </div>
  )
}
