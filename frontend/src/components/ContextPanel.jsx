import { useState } from 'react'

/**
 * Context Panel — shows metadata about the current design.
 * Auto-updates from the design code (module name, port count).
 * Gate count and critical-path delay are placeholders for future integration.
 */
export default function ContextPanel({
  moduleName = 'untitled',
  portCount = 0,
  gateCount = null,
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#000',
      fontFamily: "'JetBrains Mono', monospace",
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '4px 10px',
          fontSize: '10px',
          color: 'var(--accent)',
          fontWeight: 600,
          background: 'var(--toolbar-bg)',
          borderBottom: '1px solid var(--border)',
          letterSpacing: '2px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: '8px',
          display: 'inline-block',
          transition: 'transform 0.15s',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        }}>▼</span>
        CONTEXT PANEL
      </div>

      {!collapsed && (
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '10px 12px',
          fontSize: '11px',
          color: '#888',
        }}>
          {/* Mini schematic icon */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4px 0 12px 0',
          }}>
            <MiniChipIcon />
          </div>

          {/* Metadata rows */}
          <div style={{ display: 'grid', gap: '0' }}>
            <MetaRow label="Module" value={moduleName} />
            <MetaRow label="Ports" value={portCount.toString()} />
            <MetaRow label="Gates" value={gateCount != null ? gateCount.toString() : '—'} />
            <MetaRow label="Delay (Critical)" value="—" last />
          </div>
        </div>
      )}
    </div>
  )
}

function MetaRow({ label, value, last }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '5px 4px',
      borderBottom: last ? 'none' : '1px solid #111',
      fontSize: '11px',
    }}>
      <span style={{ color: '#666' }}>{label}:</span>
      <span style={{
        color: 'var(--accent)',
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '60%',
        textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  )
}

function MiniChipIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 40 40"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      {/* Chip body */}
      <rect
        x="10" y="10" width="20" height="20" rx="1.5"
        stroke="#00ff41" strokeWidth="1.2" fill="#00ff4108" opacity="0.8"
      />
      {/* Center pad */}
      <rect
        x="16" y="16" width="8" height="8" rx="0.5"
        stroke="#00ff41" strokeWidth="0.8" fill="none" opacity="0.4"
      />
      {/* Top pins */}
      {[14, 20, 26].map((x) => (
        <line key={`t-${x}`} x1={x} y1="4" x2={x} y2="10" stroke="#00cc33" strokeWidth="1.2" opacity="0.7" />
      ))}
      {/* Bottom pins */}
      {[14, 20, 26].map((x) => (
        <line key={`b-${x}`} x1={x} y1="30" x2={x} y2="36" stroke="#00cc33" strokeWidth="1.2" opacity="0.7" />
      ))}
      {/* Left pins */}
      {[14, 20, 26].map((y) => (
        <line key={`l-${y}`} x1="4" y1={y} x2="10" y2={y} stroke="#00cc33" strokeWidth="1.2" opacity="0.7" />
      ))}
      {/* Right pins */}
      {[14, 20, 26].map((y) => (
        <line key={`r-${y}`} x1="30" y1={y} x2="36" y2={y} stroke="#00cc33" strokeWidth="1.2" opacity="0.7" />
      ))}
    </svg>
  )
}
