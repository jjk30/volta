import { useState } from 'react'

/**
 * Context Panel — shows metadata about the current design.
 * Auto-updates from the design code (module name, port count).
 *
 * When an FPGA target is active and Yosys synthesis has run, additional
 * FPGA-specific resource counters appear below the basic metadata
 * (LUTs, Flip-Flops, Block RAM, DSPs, total cells, wires).
 */
export default function ContextPanel({
  moduleName = 'untitled',
  portCount = 0,
  gateCount = null,
  target = 'Icarus',
  synthResult = null,
}) {
  const [collapsed, setCollapsed] = useState(false)

  const isFpga = target === 'iCE40 FPGA' || target === 'ECP5 FPGA'
  const targetShort = target === 'iCE40 FPGA' ? 'iCE40'
                     : target === 'ECP5 FPGA' ? 'ECP5'
                     : null

  // FPGA cell counters from the synthesis result. Cell-name lists cover
  // both iCE40 (SB_*) and ECP5 (TRELLIS_*, DPxxKD, etc.) families.
  const sumCells = (names) => {
    if (!synthResult?.cells) return 0
    return names.reduce((s, n) => s + (synthResult.cells[n] || 0), 0)
  }
  const luts = sumCells([
    'SB_LUT4', 'LUT4', 'LUT5', 'LUT6', 'TRELLIS_SLICE', 'CCU2C',
  ])
  const ffs = sumCells([
    'SB_DFF', 'SB_DFFE', 'SB_DFFR', 'SB_DFFS', 'SB_DFFSR', 'SB_DFFSS',
    'SB_DFFER', 'SB_DFFES', 'SB_DFFESR', 'SB_DFFESS',
    'TRELLIS_FF', 'DFF', 'DPRAM',
  ])
  const bram = sumCells([
    'SB_RAM40_4K', 'SB_RAM40_4KNR', 'SB_RAM40_4KNW', 'SB_RAM40_4KNRNW',
    'DP16KD', 'PDPW16KD',
  ])
  const dsps = sumCells([
    'SB_MAC16', 'MULT18X18D', 'MULT9X9D', 'MULT18X18',
  ])

  const synthOk = synthResult?.success
  const synthFailed = synthResult && synthResult.errors && synthResult.errors.length > 0
  const fmt = (n) => synthOk ? n.toString() : '—'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-primary)',
      fontFamily: "'JetBrains Mono', monospace",
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '4px 10px',
          fontSize: '10px',
          color: 'var(--accent-primary)',
          fontWeight: 600,
          background: 'var(--toolbar-bg)',
          borderBottom: '1px solid var(--border-primary)',
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
          color: 'var(--text-secondary)',
        }}>
          {/* Mini schematic icon */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4px 0 12px 0',
          }}>
            <MiniChipIcon />
          </div>

          {/* Basic metadata */}
          <div style={{ display: 'grid', gap: '0' }}>
            <MetaRow label="Module" value={moduleName} />
            <MetaRow label="Ports" value={portCount.toString()} />
            <MetaRow label="Gates" value={gateCount != null ? gateCount.toString() : '—'} />
            <MetaRow label="Delay (Critical)" value="—" last={!isFpga} />
          </div>

          {/* FPGA section — only when an FPGA target is selected */}
          {isFpga && (
            <>
              <div style={{
                marginTop: '14px',
                paddingBottom: '4px',
                fontSize: '9px',
                letterSpacing: '1.5px',
                color: 'var(--accent-primary)',
                fontWeight: 600,
                borderBottom: '1px solid var(--border-accent)',
              }}>
                FPGA SYNTHESIS
              </div>
              <div style={{ display: 'grid', gap: '0' }}>
                <MetaRow label="Target" value={targetShort} />
                <MetaRow label="LUTs" value={fmt(luts)} />
                <MetaRow label="Flip-Flops" value={fmt(ffs)} />
                <MetaRow label="Block RAM" value={fmt(bram)} />
                <MetaRow label="DSPs" value={fmt(dsps)} />
                <MetaRow label="Total Cells" value={fmt(synthResult?.total_cells || 0)} />
                <MetaRow label="Wires" value={fmt(synthResult?.wires || 0)} last={!synthFailed} />
              </div>
              {synthFailed && (
                <div style={{
                  marginTop: '10px',
                  padding: '6px 8px',
                  border: '1px solid var(--error)',
                  borderRadius: '3px',
                  background: 'var(--error-bg)',
                  color: 'var(--error)',
                  fontSize: '10px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>Synthesis errors:</div>
                  {synthResult.errors.map((e, i) => (
                    <div key={i} style={{ marginBottom: '2px' }}>{e}</div>
                  ))}
                </div>
              )}
            </>
          )}
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
      borderBottom: last ? 'none' : '1px solid var(--divider)',
      fontSize: '11px',
    }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}:</span>
      <span style={{
        color: 'var(--accent-primary)',
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
  // stroke/fill use currentColor so the icon reskins with the surrounding color
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 40 40"
      fill="none"
      style={{ flexShrink: 0, color: 'var(--accent-primary)' }}
    >
      {/* Chip body */}
      <rect
        x="10" y="10" width="20" height="20" rx="1.5"
        stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.05" opacity="0.85"
      />
      {/* Center pad */}
      <rect
        x="16" y="16" width="8" height="8" rx="0.5"
        stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.4"
      />
      {/* Top pins */}
      {[14, 20, 26].map((x) => (
        <line key={`t-${x}`} x1={x} y1="4" x2={x} y2="10" stroke="var(--accent-secondary)" strokeWidth="1.2" opacity="0.7" />
      ))}
      {/* Bottom pins */}
      {[14, 20, 26].map((x) => (
        <line key={`b-${x}`} x1={x} y1="30" x2={x} y2="36" stroke="var(--accent-secondary)" strokeWidth="1.2" opacity="0.7" />
      ))}
      {/* Left pins */}
      {[14, 20, 26].map((y) => (
        <line key={`l-${y}`} x1="4" y1={y} x2="10" y2={y} stroke="var(--accent-secondary)" strokeWidth="1.2" opacity="0.7" />
      ))}
      {/* Right pins */}
      {[14, 20, 26].map((y) => (
        <line key={`r-${y}`} x1="30" y1={y} x2="36" y2={y} stroke="var(--accent-secondary)" strokeWidth="1.2" opacity="0.7" />
      ))}
    </svg>
  )
}
