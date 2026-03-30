import { useState, useCallback } from 'react'
import Toolbar from './components/Toolbar.jsx'
import EditorPane from './components/EditorPane.jsx'
import WaveformViewer from './components/WaveformViewer.jsx'
import { DEFAULT_DESIGN, DEFAULT_TESTBENCH } from './defaults.js'

const API_URL = 'http://localhost:8000'

function App() {
  const [design, setDesign] = useState(DEFAULT_DESIGN)
  const [testbench, setTestbench] = useState(DEFAULT_TESTBENCH)
  const [simResult, setSimResult] = useState(null)
  const [simulating, setSimulating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [splitPos, setSplitPos] = useState(50)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar
        onSimulate={handleSimulate}
        simulating={simulating}
        error={error}
        hasResult={!!simResult}
        onGenerate={handleGenerate}
        generating={generating}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Editor split pane */}
          <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
            <div style={{ width: `${splitPos}%`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '6px 12px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontWeight: 500,
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
                width: '4px',
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
                padding: '6px 12px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontWeight: 500,
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

      {/* Console output */}
      {simResult && (simResult.stdout || simResult.stderr) && (
        <div style={{
          height: '100px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          overflow: 'auto',
          padding: '8px 12px',
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--text-dim)',
        }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Console</div>
          {simResult.stderr && <pre style={{ color: 'var(--red)', whiteSpace: 'pre-wrap' }}>{simResult.stderr}</pre>}
          {simResult.stdout && <pre style={{ whiteSpace: 'pre-wrap' }}>{simResult.stdout}</pre>}
        </div>
      )}
    </div>
  )
}

export default App
