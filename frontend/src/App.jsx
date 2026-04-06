import { useState, useCallback, useRef } from 'react'
import Toolbar from './components/Toolbar.jsx'
import EditorPane from './components/EditorPane.jsx'
import WaveformViewer from './components/WaveformViewer.jsx'
import ProgressIndicator from './components/ProgressIndicator.jsx'
import ChatBot from './components/ChatBot.jsx'
import DiagramView from './components/DiagramView.jsx'
import SymbolsLibrary from './components/SymbolsLibrary.jsx'
import { DEFAULT_DESIGN, DEFAULT_TESTBENCH } from './defaults.js'

const API_URL = 'http://localhost:8000'

const EXAMPLES = [
  'Design a 4-bit ALU with add, sub, and, or',
  'Design a 4-bit counter with reset and enable',
  'Design an 8-bit shift register',
  'Design a D flip-flop with async reset',
  'Design a 2-to-1 multiplexer',
  'Design a 4-bit comparator',
  'Design a UART transmitter',
  'Design a priority encoder',
]

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
      <div className="grabber" style={{ display: 'flex', gap: '4px', opacity: 0.5, transition: 'opacity 0.15s' }}>
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent)' }} />
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent)' }} />
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent)' }} />
      </div>
    </div>
  )
}

/** Tab header bar */
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex',
      gap: '0',
      background: 'var(--toolbar-bg)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: '4px 14px',
            background: 'transparent',
            border: 'none',
            borderBottom: active === tab ? '2px solid var(--accent)' : '2px solid transparent',
            color: active === tab ? 'var(--accent)' : '#444',
            fontSize: '10px',
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '1px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {tab}
        </button>
      ))}
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
  const [prompt, setPrompt] = useState('')
  const [cancelled, setCancelled] = useState(null)
  const [chatAutoMessage, setChatAutoMessage] = useState(null)
  const [bottomTab, setBottomTab] = useState('CONSOLE')
  const [bottomHeight, setBottomHeight] = useState(250)
  const [rightWidth, setRightWidth] = useState(400)
  const [rightSplitPos, setRightSplitPos] = useState(50) // % for symbols vs chat
  const generateControllerRef = useRef(null)
  const simulateControllerRef = useRef(null)
  const designEditorRef = useRef(null)

  // --- Handlers ---

  const handleSimulate = useCallback(async () => {
    const controller = new AbortController()
    simulateControllerRef.current = controller
    setSimulating(true)
    setError(null)
    setCancelled(null)
    try {
      const resp = await fetch(`${API_URL}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, testbench }),
        signal: controller.signal,
      })
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${resp.status}`) }
      const data = await resp.json()
      if (!data.success) setError(data.stderr || 'Compilation failed')
      setSimResult(data)
      if (data.signals?.length) setBottomTab('WAVEFORM')
    } catch (e) {
      if (e.name === 'AbortError') { setCancelled('simulate'); setTimeout(() => setCancelled(null), 2000) }
      else setError(e.message)
      setSimResult(null)
    } finally { setSimulating(false); simulateControllerRef.current = null }
  }, [design, testbench])

  const handleCancelSimulate = useCallback(() => { simulateControllerRef.current?.abort() }, [])

  const handleGenerate = useCallback(async (prompt) => {
    const controller = new AbortController()
    generateControllerRef.current = controller
    setGenerating(true)
    setGenerateDone(false)
    setError(null)
    setSimResult(null)
    setCancelled(null)
    try {
      const resp = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      })
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${resp.status}`) }
      const data = await resp.json()
      setDesign(data.design)
      setTestbench(data.testbench)
      setGenerateDone(true)
      setTimeout(() => setGenerateDone(false), 3000)
      setChatAutoMessage(`explain-${Date.now()}`)
      setBottomTab('DIAGRAM')
    } catch (e) {
      if (e.name === 'AbortError') { setCancelled('generate'); setTimeout(() => setCancelled(null), 2000) }
      else setError(e.message)
    } finally { setGenerating(false); generateControllerRef.current = null }
  }, [])

  const handleCancelGenerate = useCallback(() => { generateControllerRef.current?.abort() }, [])

  // Editor split
  const handleEditorSplit = useCallback((e) => {
    e.preventDefault()
    const container = e.target.parentElement
    const rect = container.getBoundingClientRect()
    const onMouseMove = (e) => {
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPos(Math.max(20, Math.min(80, pct)))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Bottom panel height
  const handleBottomResize = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = bottomHeight
    const onMouseMove = (e) => {
      const delta = startY - e.clientY
      setBottomHeight(Math.max(120, Math.min(window.innerHeight * 0.7, startH + delta)))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [bottomHeight])

  // Right panel width
  const handleRightResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = rightWidth
    const onMouseMove = (e) => {
      const delta = startX - e.clientX
      setRightWidth(Math.max(280, Math.min(700, startW + delta)))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [rightWidth])

  // Right panel vertical split (symbols vs chat)
  const handleRightSplitResize = useCallback((e) => {
    e.preventDefault()
    const container = e.target.parentElement
    const rect = container.getBoundingClientRect()
    const startY = e.clientY
    const startPct = rightSplitPos
    const onMouseMove = (e) => {
      const pct = ((e.clientY - rect.top) / rect.height) * 100
      setRightSplitPos(Math.max(15, Math.min(85, pct)))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [rightSplitPos])

  // Insert snippet into design editor at cursor position
  const handleInsertSnippet = useCallback((code) => {
    if (designEditorRef.current?.insertAtCursor) {
      designEditorRef.current.insertAtCursor(code)
    } else {
      setDesign((prev) => prev + '\n\n' + code)
    }
  }, [])

  const hasRealCode = (code) => code.replace(/\/\/.*$/gm, '').trim().length > 0
  const canSimulate = hasRealCode(design) && hasRealCode(testbench)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>
      {/* Top: Toolbar */}
      <Toolbar
        onSimulate={handleSimulate}
        onCancelSimulate={handleCancelSimulate}
        simulating={simulating}
        error={error}
        hasResult={!!simResult}
        onGenerate={handleGenerate}
        onCancelGenerate={handleCancelGenerate}
        generating={generating}
        prompt={prompt}
        setPrompt={setPrompt}
        cancelled={cancelled}
        canSimulate={canSimulate}
      />
      <ProgressIndicator active={generating} done={generateDone} />

      {/* Middle: Left area + Right panel */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* LEFT AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

          {/* Editors */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ width: `${splitPos}%`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '3px 12px', background: 'var(--toolbar-bg)', borderBottom: '1px solid var(--border)', fontSize: '10px', color: 'var(--accent)', fontWeight: 500, letterSpacing: '1px', fontFamily: "'JetBrains Mono', monospace" }}>
                DESIGN.V
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <EditorPane ref={designEditorRef} value={design} onChange={setDesign} />
              </div>
            </div>
            <div
              onMouseDown={handleEditorSplit}
              style={{ width: '2px', cursor: 'col-resize', background: 'var(--border)', flexShrink: 0, transition: 'background 0.15s' }}
              onMouseEnter={(e) => e.target.style.background = 'var(--accent)'}
              onMouseLeave={(e) => e.target.style.background = 'var(--border)'}
            />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '3px 12px', background: 'var(--toolbar-bg)', borderBottom: '1px solid var(--border)', fontSize: '10px', color: 'var(--accent)', fontWeight: 500, letterSpacing: '1px', fontFamily: "'JetBrains Mono', monospace" }}>
                TESTBENCH.V
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <EditorPane value={testbench} onChange={setTestbench} />
              </div>
            </div>
          </div>

          {/* Bottom tabbed panel */}
          <HorizDragHandle onMouseDown={handleBottomResize} />
          <div style={{ height: `${bottomHeight}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <TabBar tabs={['CONSOLE', 'WAVEFORM', 'DIAGRAM', 'EXAMPLES']} active={bottomTab} onChange={setBottomTab} />
            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              {bottomTab === 'CONSOLE' && (
                <div style={{ height: '100%', overflow: 'auto', padding: '6px 12px', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-dim)' }}>
                  {simResult?.stderr && <pre style={{ color: 'var(--red)', whiteSpace: 'pre-wrap' }}>{simResult.stderr}</pre>}
                  {simResult?.stdout && <pre style={{ whiteSpace: 'pre-wrap', color: '#555' }}>{simResult.stdout}</pre>}
                  {!simResult?.stderr && !simResult?.stdout && (
                    <div style={{ color: '#222', padding: '20px 0', textAlign: 'center' }}>Run a simulation to see console output</div>
                  )}
                </div>
              )}
              {bottomTab === 'WAVEFORM' && (
                <div style={{ height: '100%' }}>
                  {simResult?.signals?.length > 0 ? (
                    <WaveformViewer signals={simResult.signals} endTime={simResult.end_time} />
                  ) : (
                    <div style={{ color: '#222', padding: '20px', textAlign: 'center', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" }}>
                      Run a simulation to see waveforms
                    </div>
                  )}
                </div>
              )}
              {bottomTab === 'DIAGRAM' && (
                <DiagramView design={design} />
              )}
              {bottomTab === 'EXAMPLES' && (
                <div style={{
                  height: '100%',
                  overflow: 'auto',
                  padding: '10px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '6px',
                  alignContent: 'start',
                }}>
                  {EXAMPLES.map((ex, i) => (
                    <div
                      key={i}
                      onClick={() => setPrompt(ex)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '3px',
                        background: '#050505',
                        color: '#666',
                        fontSize: '11px',
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = '#001a00' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = '#666'; e.currentTarget.style.background = '#050505' }}
                    >
                      {ex}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel drag handle */}
        <div
          onMouseDown={handleRightResize}
          style={{ width: '4px', cursor: 'col-resize', background: 'var(--border)', flexShrink: 0, transition: 'background 0.15s' }}
          onMouseEnter={(e) => e.target.style.background = 'var(--accent)'}
          onMouseLeave={(e) => e.target.style.background = 'var(--border)'}
        />

        {/* RIGHT AREA: Symbols Library + Chat */}
        <div style={{ width: `${rightWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Symbols Library */}
          <div style={{ height: `${rightSplitPos}%`, overflow: 'hidden' }}>
            <SymbolsLibrary onInsert={handleInsertSnippet} />
          </div>
          {/* Horizontal split handle */}
          <div
            onMouseDown={handleRightSplitResize}
            style={{ height: '4px', cursor: 'row-resize', background: 'var(--border)', flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={(e) => e.target.style.background = 'var(--accent)'}
            onMouseLeave={(e) => e.target.style.background = 'var(--border)'}
          />
          {/* Chat */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <ChatBot
              design={design}
              testbench={testbench}
              autoMessage={chatAutoMessage}
              simResult={simResult}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
