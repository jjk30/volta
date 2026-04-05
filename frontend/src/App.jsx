import { useState, useCallback } from 'react'
import Toolbar from './components/Toolbar.jsx'
import Sidebar from './components/Sidebar.jsx'
import EditorPane from './components/EditorPane.jsx'
import WaveformViewer from './components/WaveformViewer.jsx'
import ProgressIndicator from './components/ProgressIndicator.jsx'
import { DEFAULT_DESIGN, DEFAULT_TESTBENCH } from './defaults.js'

const API_URL = 'http://localhost:8000'

/** Reusable horizontal drag handle with green grabber dots. */
function HorizDragHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        height: '6px',
        cursor: 'row-resize',
        background: '#111',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#0a1a0a'
        e.currentTarget.querySelector('.grabber').style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#111'
        e.currentTarget.querySelector('.grabber').style.opacity = '0.5'
      }}
    >
      {/* Three green grabber dots */}
      <div className="grabber" style={{
        display: 'flex',
        gap: '4px',
        opacity: 0.5,
        transition: 'opacity 0.15s',
      }}>
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent)' }} />
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent)' }} />
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent)' }} />
      </div>
    </div>
  )
}

function App() {
  const [design, setDesign] = useState(DEFAULT_DESIGN)
  const [testbench, setTestbench] = useState(DEFAULT_TESTBENCH)
  const [simResult, setSimResult] = useState(null)
  const [simulating, setSimulating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateDone, setGenerateDone] = useState(false)
  const [error, setError] = useState(null)
  const [splitPos, setSplitPos] = useState(50)
  const [consoleOpen, setConsoleOpen] = useState(true)
  const [consoleHeight, setConsoleHeight] = useState(100)
  const [waveformHeight, setWaveformHeight] = useState(280)
  const [prompt, setPrompt] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const handleSimulate = useCallback(async () => {
    setSimulating(true)
    setError(null)
    try {
      const resp = await fetch(`${API_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, testbench }),
      })
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      if (!data.success) {
        setError(data.stderr || 'Compilation failed')
      }
      setSimResult(data)
    } catch (e) {
      setError(e.message)
      setSimResult(null)
    } finally {
      setSimulating(false)
    }
  }, [design, testbench])

  const handleGenerate = useCallback(async (prompt) => {
    setGenerating(true)
    setGenerateDone(false)
    setError(null)
    setSimResult(null)
    try {
      const resp = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      setDesign(data.design)
      setTestbench(data.testbench)
      setGenerateDone(true)
      setTimeout(() => setGenerateDone(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }, [])

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    const container = e.target.parentElement
    const rect = container.getBoundingClientRect()

    const onMouseMove = (e) => {
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPos(Math.max(20, Math.min(80, pct)))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleWaveformResizeDown = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = waveformHeight

    const onMouseMove = (e) => {
      const delta = startY - e.clientY
      const maxH = window.innerHeight * 0.6
      setWaveformHeight(Math.max(100, Math.min(maxH, startHeight + delta)))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [waveformHeight])

  const handleConsoleResizeDown = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = consoleHeight

    const onMouseMove = (e) => {
      const delta = startY - e.clientY
      const maxH = window.innerHeight * 0.5
      setConsoleHeight(Math.max(60, Math.min(maxH, startHeight + delta)))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [consoleHeight])

  const hasConsoleOutput = simResult && (simResult.stdout || simResult.stderr)
  const hasWaveforms = simResult?.signals?.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>
      <Toolbar
        onSimulate={handleSimulate}
        simulating={simulating}
        error={error}
        hasResult={!!simResult}
        onGenerate={handleGenerate}
        generating={generating}
        prompt={prompt}
        setPrompt={setPrompt}
      />

      {/* Progress indicator */}
      <ProgressIndicator active={generating} done={generateDone} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onSelectExample={setPrompt}
        />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Editor split pane */}
          <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
            <div style={{ width: `${splitPos}%`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '4px 12px',
                background: 'var(--toolbar-bg)',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px',
                color: 'var(--accent)',
                fontWeight: 500,
                letterSpacing: '1px',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                DESIGN
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <EditorPane value={design} onChange={setDesign} />
              </div>
            </div>

            <div
              onMouseDown={handleMouseDown}
              style={{
                width: '2px',
                cursor: 'col-resize',
                background: 'var(--border)',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.target.style.background = 'var(--accent)'}
              onMouseLeave={(e) => e.target.style.background = 'var(--border)'}
            />

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '4px 12px',
                background: 'var(--toolbar-bg)',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px',
                color: 'var(--accent)',
                fontWeight: 500,
                letterSpacing: '1px',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                TESTBENCH
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <EditorPane value={testbench} onChange={setTestbench} />
              </div>
            </div>
          </div>

          {/* Waveform drag handle + viewer */}
          {hasWaveforms && (
            <>
              <HorizDragHandle onMouseDown={handleWaveformResizeDown} />
              <div style={{
                height: `${waveformHeight}px`,
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                <WaveformViewer signals={simResult.signals} endTime={simResult.end_time} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Collapsible, resizable console output */}
      {hasConsoleOutput && (
        <div style={{
          background: '#000',
          flexShrink: 0,
        }}>
          {/* Drag handle for resizing */}
          {consoleOpen && (
            <HorizDragHandle onMouseDown={handleConsoleResizeDown} />
          )}
          <div
            onClick={() => setConsoleOpen(!consoleOpen)}
            style={{
              padding: '3px 12px',
              fontSize: '11px',
              color: 'var(--accent)',
              fontWeight: 500,
              fontFamily: "'JetBrains Mono', monospace",
              background: 'var(--toolbar-bg)',
              borderBottom: consoleOpen ? '1px solid var(--border)' : 'none',
              borderTop: consoleOpen ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              letterSpacing: '1px',
              userSelect: 'none',
            }}
          >
            <span style={{
              display: 'inline-block',
              transform: consoleOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              fontSize: '10px',
            }}>&#9654;</span>
            CONSOLE
          </div>
          {consoleOpen && (
            <div style={{
              height: `${consoleHeight}px`,
              overflow: 'auto',
              padding: '6px 12px',
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--text-dim)',
            }}>
              {simResult.stderr && <pre style={{ color: 'var(--red)', whiteSpace: 'pre-wrap' }}>{simResult.stderr}</pre>}
              {simResult.stdout && <pre style={{ whiteSpace: 'pre-wrap', color: '#555' }}>{simResult.stdout}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
