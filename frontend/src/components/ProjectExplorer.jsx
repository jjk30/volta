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
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [srcOpen, setSrcOpen] = useState(true)
  const [simOpen, setSimOpen] = useState(true)

  // Dot colors: green=ok, red=errors, gray=not run
  const designDot = hasErrors ? '#ff4444' : (hasDesign ? '#00ff41' : '#555')
  const tbDot = hasErrors ? '#ff4444' : (hasTestbench ? '#00ff41' : '#555')
  const simDot = hasSimResult ? '#00ff41' : '#555'

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
        PROJECT EXPLORER
      </div>

      {/* Tree */}
      {!collapsed && (
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '6px 4px',
          fontSize: '11px',
          color: '#888',
        }}>
          {/* Project root */}
          <div style={{
            padding: '2px 6px',
            color: 'var(--accent)',
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
              color: '#aaa',
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
                label="design.v"
              />
              <FileNode
                active={activeEditorTab === 'TB_DESIGN.V'}
                onClick={onSelectTestbench}
                dotColor={tbDot}
                label={`tb_${moduleName}.v`}
              />
            </>
          )}

          {/* sim_results/ folder */}
          <div
            onClick={() => setSimOpen(!simOpen)}
            style={{
              padding: '2px 6px 2px 20px',
              cursor: 'pointer',
              color: '#aaa',
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
                label="design.v"
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
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        padding: '2px 6px 2px 34px',
        cursor: disabled ? 'default' : 'pointer',
        color: active ? 'var(--accent)' : (disabled ? '#555' : '#888'),
        background: active ? '#001a00' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = '#0a0a0a'
          e.currentTarget.style.color = 'var(--accent)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = '#888'
        }
      }}
    >
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: dotColor,
        flexShrink: 0,
        boxShadow: dotColor === '#00ff41' ? '0 0 4px #00ff4180' : 'none',
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
