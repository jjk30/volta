import { useState } from 'react'
import { CATEGORIES, SYMBOLS } from '../symbolsData.js'

export default function SymbolsLibrary({ onInsert }) {
  const [activeCategory, setActiveCategory] = useState('Logic Gates')
  const [hovered, setHovered] = useState(null)

  const symbols = SYMBOLS[activeCategory] || []

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

      {/* Category tabs — horizontal scrollable */}
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
            onClick={() => setActiveCategory(cat)}
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
              }}
            >
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
    </div>
  )
}
