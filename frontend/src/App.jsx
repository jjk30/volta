import { useState, useCallback } from 'react'
import Toolbar from './components/Toolbar.jsx'
import EditorPane from './components/EditorPane.jsx'
import WaveformViewer from './components/WaveformViewer.jsx'
import ProgressIndicator from './components/ProgressIndicator.jsx'
import { DEFAULT_DESIGN, DEFAULT_TESTBENCH } from './defaults.js'

const API_URL = 'http://localhost:8000'

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
      // Auto-clear the done state after 3 seconds
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

  const hasConsoleOutput = simResult && (simResult.stdout || simResult.stderr)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>
      <Toolbar
        onSimulate={handleSimulate}
        simulating={simulating}
        error={error}
        hasResult={!!simResult}
        onGenerate={handleGenerate}
        generating={generating}
      />

      {/* Progress indicator */}
      <ProgressIndicator active={generating} done={generateDone} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
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

          {/* Waveform viewer */}
          <div style={{
            height: simResult?.signals?.length ? '280px' : '0px',
            borderTop: simResult?.signals?.length ? '1px solid var(--border)' : 'none',
            transition: 'height 0.3s ease',
            overflow: 'hidden',
          }}>
            {simResult?.signals?.length > 0 && (
              <WaveformViewer signals={simResult.signals} endTime={simResult.end_time} />
            )}
          </div>
        </div>
      </div>

      {/* Collapsible console output */}
      {hasConsoleOutput && (
        <div style={{
          borderTop: '1px solid var(--border)',
          background: '#000',
        }}>
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
              height: '80px',
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
