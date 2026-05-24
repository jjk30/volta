import { useState } from 'react'

/**
 * Project Explorer — file tree UI.
 * Shows src/ with design.v and tb_<module>.v, plus sim_results/ placeholders.
 * Clicking files switches the active editor tab.
 */
export default function ProjectExplorer({
  moduleName = 'untitled',
  hasDesign = false,
  hasTestbench = false,
  hasSimResult = false,
  hasErrors = false,
  activeEditorTab = 'DESIGN.V',
  onSelectDesign,
  onSelectTestbench,
  language = 'verilog',
}) {
  const ext = language === 'python' ? 'py'
            : language === 'systemverilog' ? 'sv'
            : 'v'
  const designLabel = `design.${ext}`
  const tbLabel = language === 'python'
    ? `test_${moduleName}.py`
    : `tb_${moduleName}.${ext}`
  const [collapsed, setCollapsed] = useState(false)
  const [srcOpen, setSrcOpen] = useState(true)
  const [simOpen, setSimOpen] = useState(true)

  // Dot semantic keys — resolved to CSS variables at render time
  const designDot = hasErrors ? 'error' : (hasDesign ? 'ok' : 'muted')
  const tbDot = hasErrors ? 'error' : (hasTestbench ? 'ok' : 'muted')
  const simDot = hasSimResult ? 'ok' : 'muted'

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
        PROJECT EXPLORER
      </div>

      {/* Tree */}
      {!collapsed && (
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '6px 4px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}>
          {/* Project root */}
          <div style={{
            padding: '2px 6px',
            color: 'var(--accent-primary)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span style={{ fontSize: '9px' }}>▼</span>
            Project: {moduleName}
          </div>

          {/* src/ folder */}
          <div
            onClick={() => setSrcOpen(!srcOpen)}
            style={{
              padding: '2px 6px 2px 20px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: '8px' }}>{srcOpen ? '▼' : '▶'}</span>
            src/
          </div>
          {srcOpen && (
            <>
              <FileNode
                active={activeEditorTab === 'DESIGN.V'}
                onClick={onSelectDesign}
                dotColor={designDot}
                label={designLabel}
              />
              <FileNode
                active={activeEditorTab === 'TB_DESIGN.V'}
                onClick={onSelectTestbench}
                dotColor={tbDot}
                label={tbLabel}
              />
            </>
          )}

          {/* sim_results/ folder */}
          <div
            onClick={() => setSimOpen(!simOpen)}
            style={{
              padding: '2px 6px 2px 20px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: '8px' }}>{simOpen ? '▼' : '▶'}</span>
            sim_results/
          </div>
          {simOpen && (
            <>
              <FileNode
                active={false}
                dotColor={simDot}
                label={designLabel}
                disabled
              />
              <FileNode
                active={false}
                dotColor={simDot}
                label={`${moduleName}.vcd`}
                disabled
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FileNode({ active, onClick, dotColor, label, disabled }) {
  // Map semantic dot keys to CSS variables so they track the theme
  const dotVar = dotColor === 'error'
    ? 'var(--error)'
    : dotColor === 'ok' ? 'var(--accent-primary)' : 'var(--dot-muted)'
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        padding: '2px 6px 2px 34px',
        cursor: disabled ? 'default' : 'pointer',
        color: active
          ? 'var(--accent-primary)'
          : (disabled ? 'var(--text-dim)' : 'var(--text-secondary)'),
        background: active ? 'var(--accent-bg)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = 'var(--bg-surface)'
          e.currentTarget.style.color = 'var(--accent-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-secondary)'
        }
      }}
    >
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: dotVar,
        flexShrink: 0,
        boxShadow: dotColor === 'ok' ? 'var(--accent-glow)' : 'none',
      }} />
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  )
}
