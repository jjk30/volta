import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Toolbar from './components/Toolbar.jsx'
import EditorPane from './components/EditorPane.jsx'
import WaveformViewer from './components/WaveformViewer.jsx'
import ProgressIndicator from './components/ProgressIndicator.jsx'
import ChatBot from './components/ChatBot.jsx'
import DiagramView from './components/DiagramView.jsx'
import SchematicView from './components/SchematicView.jsx'
import SymbolsLibrary from './components/SymbolsLibrary.jsx'
import ProjectExplorer from './components/ProjectExplorer.jsx'
import ContextPanel from './components/ContextPanel.jsx'
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
        background: 'var(--bg-elevated)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.querySelector('.grabber').style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-elevated)'
        e.currentTarget.querySelector('.grabber').style.opacity = '0.5'
      }}
    >
      <div className="grabber" style={{ display: 'flex', gap: '4px', opacity: 0.5, transition: 'opacity 0.15s' }}>
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
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
            borderBottom: active === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
            color: active === tab ? 'var(--accent-primary)' : 'var(--text-dim)',
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

/**
 * Parse module name and ports from Verilog code. Returns { name, portCount }.
 * Uses a lightweight regex — good enough for ANSI port-list style modules.
 */
function parseDesignMeta(code) {
  if (!code) return { name: 'untitled', portCount: 0 }
  const nameMatch = code.match(/module\s+(\w+)/)
  const name = nameMatch ? nameMatch[1] : 'untitled'

  let portCount = 0
  const modMatch = code.match(/module\s+\w+\s*\(([\s\S]*?)\)\s*;/)
  if (modMatch) {
    const portText = modMatch[1]
    for (const decl of portText.split(',')) {
      if (decl.trim().match(/^(input|output|inout)\b/)) portCount++
    }
  }
  // Fallback: count "input"/"output"/"inout" statements in the body
  if (portCount === 0) {
    const bodyMatches = code.match(/^\s*(input|output|inout)\b/gm)
    if (bodyMatches) portCount = bodyMatches.length
  }

  return { name, portCount }
}

function App() {
  const [design, setDesign] = useState(DEFAULT_DESIGN)
  const [testbench, setTestbench] = useState(DEFAULT_TESTBENCH)
  const [simResult, setSimResult] = useState(null)
  const [simulating, setSimulating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateDone, setGenerateDone] = useState(false)
  const [error, setError] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [cancelled, setCancelled] = useState(null)
  const [chatAutoMessage, setChatAutoMessage] = useState(null)

  // Tabs
  const [editorTab, setEditorTab] = useState('DESIGN.V')
  const [bottomTab, setBottomTab] = useState('CONSOLE')

  // Panels / sizing
  const [bottomHeight, setBottomHeight] = useState(250)
  const [leftWidth, setLeftWidth] = useState(280)
  const [leftSplitPos, setLeftSplitPos] = useState(45) // % for project explorer vs symbols
  const [rightWidth, setRightWidth] = useState(400)
  const [rightSplitPos, setRightSplitPos] = useState(55) // % for chat vs context

  // Symbols + verify + save status
  const [selectedSymbols, setSelectedSymbols] = useState([])
  const [autoPrompt, setAutoPrompt] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyReport, setVerifyReport] = useState(null)
  const [savedDesign, setSavedDesign] = useState(DEFAULT_DESIGN)
  const [projectSearch, setProjectSearch] = useState('')
  const [symbolsCollapsed, setSymbolsCollapsed] = useState(false)

  // Target (Icarus | iCE40 FPGA | ECP5 FPGA) drives whether SIM runs a
  // simulation or kicks off Yosys FPGA synthesis.
  const [target, setTarget] = useState('Icarus')
  const [synthResult, setSynthResult] = useState(null)
  const [synthesizing, setSynthesizing] = useState(false)
  const [synthLog, setSynthLog] = useState([])  // [[level, text]]

  // Theme (persisted in localStorage)
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('volta-theme')
      if (saved === 'dark' || saved === 'light') return saved
    } catch {}
    return 'dark'
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('volta-theme', theme) } catch {}
  }, [theme])
  const toggleTheme = useCallback(() => setTheme((t) => t === 'dark' ? 'light' : 'dark'), [])

  // Refs
  const generateControllerRef = useRef(null)
  const simulateControllerRef = useRef(null)
  const verifyControllerRef = useRef(null)
  const synthControllerRef = useRef(null)
  const designEditorRef = useRef(null)

  // --- Derived meta from design code ---
  const { name: moduleName, portCount } = useMemo(() => parseDesignMeta(design), [design])
  const hasRealCode = (code) => code.replace(/\/\/.*$/gm, '').trim().length > 0
  const canSimulate = hasRealCode(design) && hasRealCode(testbench)
  const canSynthesize = hasRealCode(design)
  const canVerify = hasRealCode(design)
  const isModified = design !== savedDesign
  const projectStatus = savedDesign !== DEFAULT_DESIGN
    ? (isModified ? 'Modified' : 'Saved')
    : ''

  // Map UI label → backend target string
  const targetCode = target === 'iCE40 FPGA' ? 'ice40'
                    : target === 'ECP5 FPGA' ? 'ecp5'
                    : null
  const isFpgaTarget = targetCode !== null
  const targetShortLabel = target === 'iCE40 FPGA' ? 'iCE40'
                          : target === 'ECP5 FPGA' ? 'ECP5'
                          : 'FPGA'

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
      // Waveforms moved to the top tabs — auto-switch to WAVEFORM when we have signals
      if (data.signals?.length) setEditorTab('WAVEFORM')
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
      setSavedDesign(data.design)        // mark as just-saved
      setGenerateDone(true)
      setTimeout(() => setGenerateDone(false), 3000)
      setChatAutoMessage(`explain-${Date.now()}`)
      setEditorTab('DESIGN.V')            // stay on DESIGN.V after generate
    } catch (e) {
      if (e.name === 'AbortError') { setCancelled('generate'); setTimeout(() => setCancelled(null), 2000) }
      else setError(e.message)
    } finally { setGenerating(false); generateControllerRef.current = null }
  }, [])

  const handleCancelGenerate = useCallback(() => { generateControllerRef.current?.abort() }, [])

  const handleVerify = useCallback(async () => {
    const controller = new AbortController()
    verifyControllerRef.current = controller
    setVerifying(true)
    setError(null)
    setCancelled(null)
    setVerifyReport(null)
    try {
      const resp = await fetch(`${API_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design, prompt }),
        signal: controller.signal,
      })
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${resp.status}`) }
      const data = await resp.json()
      setVerifyReport(data)
      setBottomTab('VERIFICATION')
    } catch (e) {
      if (e.name === 'AbortError') { setCancelled('verify'); setTimeout(() => setCancelled(null), 2000) }
      else setError(e.message)
    } finally { setVerifying(false); verifyControllerRef.current = null }
  }, [design, prompt])

  const handleCancelVerify = useCallback(() => { verifyControllerRef.current?.abort() }, [])

  /** Cell-count helpers — handle both common iCE40 and ECP5 cell families. */
  const countCells = (synth, names) => {
    if (!synth?.cells) return 0
    return names.reduce((sum, n) => sum + (synth.cells[n] || 0), 0)
  }
  const lutCount = (synth) => countCells(synth, [
    'SB_LUT4', 'LUT4', 'LUT5', 'LUT6', 'TRELLIS_SLICE', 'CCU2C',
  ])
  const ffCount = (synth) => countCells(synth, [
    'SB_DFF', 'SB_DFFE', 'SB_DFFR', 'SB_DFFS', 'SB_DFFSR', 'SB_DFFSS',
    'SB_DFFER', 'SB_DFFES', 'SB_DFFESR', 'SB_DFFESS',
    'TRELLIS_FF', 'DFF', 'DPRAM',
  ])
  const bramCount = (synth) => countCells(synth, [
    'SB_RAM40_4K', 'SB_RAM40_4KNR', 'SB_RAM40_4KNW', 'SB_RAM40_4KNRNW',
    'DP16KD', 'PDPW16KD',
  ])
  const dspCount = (synth) => countCells(synth, [
    'SB_MAC16', 'MULT18X18D', 'MULT9X9D', 'MULT18X18',
  ])

  const handleSynthesize = useCallback(async () => {
    if (!targetCode) return
    const controller = new AbortController()
    synthControllerRef.current = controller
    setSynthesizing(true)
    setError(null)
    setCancelled(null)
    setSynthResult(null)
    setBottomTab('CONSOLE')

    const startLog = [
      ['info', `[SYNTH] Targeting ${targetShortLabel} FPGA...`],
    ]
    setSynthLog(startLog)

    try {
      const resp = await fetch(`${API_URL}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_code: design, target: targetCode }),
        signal: controller.signal,
      })
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}))
        throw new Error(d.detail || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      setSynthResult(data)

      const newLog = [...startLog]
      if (data.success) {
        newLog.push(['info', '[SYNTH] Synthesis complete.'])
        const luts = lutCount(data)
        const ffs = ffCount(data)
        const bram = bramCount(data)
        const dsps = dspCount(data)
        newLog.push(['info', `[RESULT] LUTs: ${luts}, FFs: ${ffs}, BRAM: ${bram}, DSP: ${dsps}`])
        newLog.push(['info', `[RESULT] Total cells: ${data.total_cells}, Wires: ${data.wires}`])
      } else {
        newLog.push(['error', '[SYNTH] Synthesis failed.'])
      }
      for (const w of data.warnings || []) {
        newLog.push(['warn', `[WARN] ${w}`])
      }
      for (const e of data.errors || []) {
        newLog.push(['error', `[ERROR] ${e}`])
      }
      setSynthLog(newLog)
    } catch (e) {
      if (e.name === 'AbortError') {
        setCancelled('synth')
        setTimeout(() => setCancelled(null), 2000)
      } else {
        setError(e.message)
        setSynthLog([...startLog, ['error', `[ERROR] ${e.message}`]])
      }
    } finally {
      setSynthesizing(false)
      synthControllerRef.current = null
    }
  }, [design, targetCode, targetShortLabel])

  const handleCancelSynthesize = useCallback(() => {
    synthControllerRef.current?.abort()
  }, [])

  // Reset synth state when the user switches target away from an FPGA, so
  // the Context Panel and console don't show stale FPGA stats next to a
  // freshly run simulation.
  useEffect(() => {
    if (!isFpgaTarget) {
      setSynthResult(null)
      setSynthLog([])
    }
  }, [isFpgaTarget])

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

  // Left panel width
  const handleLeftResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = leftWidth
    const onMouseMove = (e) => {
      const delta = e.clientX - startX
      setLeftWidth(Math.max(200, Math.min(500, startW + delta)))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [leftWidth])

  // Left panel vertical split
  const handleLeftSplitResize = useCallback((e) => {
    e.preventDefault()
    const container = e.target.parentElement
    const rect = container.getBoundingClientRect()
    const onMouseMove = (e) => {
      const pct = ((e.clientY - rect.top) / rect.height) * 100
      setLeftSplitPos(Math.max(15, Math.min(85, pct)))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

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

  // Right panel vertical split (chat vs context)
  const handleRightSplitResize = useCallback((e) => {
    e.preventDefault()
    const container = e.target.parentElement
    const rect = container.getBoundingClientRect()
    const onMouseMove = (e) => {
      const pct = ((e.clientY - rect.top) / rect.height) * 100
      setRightSplitPos(Math.max(15, Math.min(85, pct)))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // Symbol click: toggle in selectedSymbols array
  const handleSelectSymbol = useCallback((symbol) => {
    setSelectedSymbols((prev) => {
      const exists = prev.find((s) => s.id === symbol.id)
      if (exists) return prev.filter((s) => s.id !== symbol.id)
      return [...prev, symbol]
    })
  }, [])

  const handleClearSymbols = useCallback(() => {
    setSelectedSymbols([])
    setPrompt('')
    setAutoPrompt('')
    setDesign(DEFAULT_DESIGN)
  }, [])

  // Build composite prompt + Verilog preview from selectedSymbols
  useEffect(() => {
    if (selectedSymbols.length === 0) return

    // Build prompt
    let text = ''
    if (selectedSymbols.length === 1) {
      text = selectedSymbols[0].promptText || selectedSymbols[0].name
    } else {
      const names = selectedSymbols.map((s) => s.promptText?.replace(/^Design (a |an )?/i, '') || s.name)
      text = `Design a circuit that combines: ${names.join(', ')}. Connect them appropriately to form a working circuit.`
    }
    setAutoPrompt(text)
    setPrompt(text)

    // Build Verilog preview from snippets
    const snippets = selectedSymbols.map((s) =>
      `// ${s.name}\n${s.verilog || '// (no snippet)'}`
    )
    const preview = `// === PREVIEW: click GENERATE to build the full module ===\n\n${snippets.join('\n\n')}\n`
    setDesign(preview)
  }, [selectedSymbols])

  // Disconnect: if user manually edits prompt to differ from auto, clear symbols
  const handlePromptChange = useCallback((val) => {
    setPrompt(val)
    if (autoPrompt && val !== autoPrompt) {
      setSelectedSymbols([])
      setAutoPrompt('')
    }
  }, [autoPrompt])

  // File-tree click handlers — just switch the active editor tab
  const handleSelectDesignFile = useCallback(() => setEditorTab('DESIGN.V'), [])
  const handleSelectTestbenchFile = useCallback(() => setEditorTab('TB_DESIGN.V'), [])

  // Schematic gate click: jump to Design.v and highlight the line
  const handleGateClick = useCallback((lineNumber) => {
    setEditorTab('DESIGN.V')
    // Wait for the editor div to become display:block before scrolling
    setTimeout(() => designEditorRef.current?.scrollToLine?.(lineNumber), 60)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      {/* Top: Toolbar */}
      <Toolbar
        onSimulate={handleSimulate}
        onCancelSimulate={handleCancelSimulate}
        simulating={simulating}
        onSynthesize={handleSynthesize}
        onCancelSynthesize={handleCancelSynthesize}
        synthesizing={synthesizing}
        error={error}
        hasResult={!!simResult || !!synthResult}
        onGenerate={handleGenerate}
        onCancelGenerate={handleCancelGenerate}
        generating={generating}
        prompt={prompt}
        setPrompt={handlePromptChange}
        cancelled={cancelled}
        canSimulate={canSimulate}
        canSynthesize={canSynthesize}
        onVerify={handleVerify}
        onCancelVerify={handleCancelVerify}
        verifying={verifying}
        canVerify={canVerify}
        projectName={moduleName}
        projectStatus={projectStatus}
        projectSearch={projectSearch}
        setProjectSearch={setProjectSearch}
        theme={theme}
        onToggleTheme={toggleTheme}
        target={target}
        setTarget={setTarget}
      />
      <ProgressIndicator active={generating} done={generateDone} />
      <ProgressIndicator
        active={synthesizing}
        done={false}
        steps={[
          `Synthesizing for ${targetShortLabel}...`,
          'Mapping to LUTs...',
          'Counting resources...',
        ]}
        timings={[0, 2500, 6000]}
      />

      {/* Middle: Left sidebar + Center + Right sidebar */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* LEFT SIDEBAR */}
        <div style={{ width: `${leftWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg-primary)' }}>
          <div style={{ height: `${leftSplitPos}%`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ProjectExplorer
              moduleName={moduleName}
              hasDesign={hasRealCode(design)}
              hasTestbench={hasRealCode(testbench)}
              hasSimResult={!!simResult?.signals?.length}
              hasErrors={simResult?.stderr ? true : false}
              activeEditorTab={editorTab}
              onSelectDesign={handleSelectDesignFile}
              onSelectTestbench={handleSelectTestbenchFile}
            />
          </div>
          <div
            onMouseDown={handleLeftSplitResize}
            style={{ height: '4px', cursor: 'row-resize', background: 'var(--border)', flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={(e) => e.target.style.background = 'var(--accent)'}
            onMouseLeave={(e) => e.target.style.background = 'var(--border)'}
          />
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <CollapsibleSymbolsHeader
              collapsed={symbolsCollapsed}
              onToggle={() => setSymbolsCollapsed(!symbolsCollapsed)}
            />
            {!symbolsCollapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <SymbolsLibrary
                  onSelectSymbol={handleSelectSymbol}
                  selectedIds={selectedSymbols.map((s) => s.id)}
                  onClear={handleClearSymbols}
                  showHeader={false}
                />
              </div>
            )}
          </div>
        </div>

        {/* Left sidebar drag handle */}
        <div
          onMouseDown={handleLeftResize}
          style={{ width: '4px', cursor: 'col-resize', background: 'var(--border)', flexShrink: 0, transition: 'background 0.15s' }}
          onMouseEnter={(e) => e.target.style.background = 'var(--accent)'}
          onMouseLeave={(e) => e.target.style.background = 'var(--border)'}
        />

        {/* CENTER AREA */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

          {/* Top: tabbed editors/views */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <TabBar
              tabs={['DESIGN.V', 'TB_DESIGN.V', 'SCHEMATIC', 'DIAGRAM', 'WAVEFORM']}
              active={editorTab}
              onChange={setEditorTab}
            />
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {/* Editors stay mounted to preserve state; toggled via display */}
              <div style={{
                height: '100%',
                display: editorTab === 'DESIGN.V' ? 'block' : 'none',
              }}>
                <EditorPane ref={designEditorRef} value={design} onChange={setDesign} />
              </div>
              <div style={{
                height: '100%',
                display: editorTab === 'TB_DESIGN.V' ? 'block' : 'none',
              }}>
                <EditorPane value={testbench} onChange={setTestbench} />
              </div>
              {editorTab === 'SCHEMATIC' && (
                <SchematicView
                  design={design}
                  hasErrors={!!simResult?.stderr}
                  onGateClick={handleGateClick}
                />
              )}
              {editorTab === 'DIAGRAM' && (
                <DiagramView design={design} theme={theme} />
              )}
              {editorTab === 'WAVEFORM' && (
                simResult?.signals?.length > 0 ? (
                  <WaveformViewer signals={simResult.signals} endTime={simResult.end_time} theme={theme} />
                ) : (
                  <div style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-dim)',
                    fontSize: '11px',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    Run a simulation to see waveforms
                  </div>
                )
              )}
            </div>
          </div>

          {/* Bottom tabbed panel */}
          <HorizDragHandle onMouseDown={handleBottomResize} />
          <div style={{ height: `${bottomHeight}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <TabBar tabs={['CONSOLE', 'VERIFICATION', 'EXAMPLES']} active={bottomTab} onChange={setBottomTab} />
            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              {bottomTab === 'CONSOLE' && (
                <div style={{ height: '100%', overflow: 'auto', padding: '6px 12px', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-dim)' }}>
                  {/* FPGA synthesis log (when target is an FPGA) */}
                  {synthLog.length > 0 && (
                    <div style={{ marginBottom: synthLog.length && (simResult?.stderr || simResult?.stdout) ? '10px' : 0 }}>
                      {synthLog.map((entry, i) => {
                        const [level, text] = entry
                        const color = level === 'error' ? 'var(--error)'
                                    : level === 'warn'  ? 'var(--warning)'
                                    : 'var(--accent-secondary)'
                        return (
                          <div key={i} style={{ color, whiteSpace: 'pre-wrap' }}>{text}</div>
                        )
                      })}
                    </div>
                  )}
                  {simResult?.stderr && <pre style={{ color: 'var(--error)', whiteSpace: 'pre-wrap' }}>{simResult.stderr}</pre>}
                  {simResult?.stdout && <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{simResult.stdout}</pre>}
                  {!simResult?.stderr && !simResult?.stdout && synthLog.length === 0 && (
                    <div style={{ color: 'var(--text-dim)', padding: '20px 0', textAlign: 'center' }}>
                      {isFpgaTarget
                        ? `Click SYNTH to synthesize for ${targetShortLabel}`
                        : 'Run a simulation to see console output'}
                    </div>
                  )}
                </div>
              )}
              {bottomTab === 'VERIFICATION' && (
                <div style={{ height: '100%', overflow: 'auto', padding: '12px 16px', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  {verifying && (
                    <div style={{ color: 'var(--accent-primary)', textAlign: 'center', padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '8px' }}>
                        {[0,1,2].map(i => <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)', animation: `pulse-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                      </div>
                      Running AI verification...
                    </div>
                  )}
                  {!verifying && !verifyReport && (
                    <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
                      Generate a design, then click VERIFY to run AI-driven verification.
                    </div>
                  )}
                  {!verifying && verifyReport && (
                    <div>
                      {verifyReport.summary?.total > 0 && (
                        <div style={{ marginBottom: '12px', padding: '8px 12px', border: '1px solid var(--border-accent)', borderRadius: '4px', background: 'var(--accent-bg)' }}>
                          <span style={{ color: verifyReport.summary.failed > 0 ? 'var(--error)' : 'var(--accent-primary)', fontWeight: 600 }}>
                            {verifyReport.summary.passed} of {verifyReport.summary.total} tests passed
                          </span>
                          {verifyReport.summary.failed > 0 && (
                            <span style={{ color: 'var(--error)', marginLeft: '12px' }}>
                              ({verifyReport.summary.failed} failed)
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {verifyReport.report}
                      </div>
                    </div>
                  )}
                </div>
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
                        border: '1px solid var(--border-primary)',
                        borderRadius: '3px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-secondary)',
                        fontSize: '11px',
                        fontFamily: "'JetBrains Mono', monospace",
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.background = 'var(--accent-bg)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
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

        {/* RIGHT SIDEBAR: Volta Assistant + Context Panel */}
        <div style={{ width: `${rightWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ height: `${rightSplitPos}%`, overflow: 'hidden' }}>
            <ChatBot
              design={design}
              testbench={testbench}
              autoMessage={chatAutoMessage}
              simResult={simResult}
              selectedSymbols={selectedSymbols}
            />
          </div>
          <div
            onMouseDown={handleRightSplitResize}
            style={{ height: '4px', cursor: 'row-resize', background: 'var(--border)', flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={(e) => e.target.style.background = 'var(--accent)'}
            onMouseLeave={(e) => e.target.style.background = 'var(--border)'}
          />
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <ContextPanel
              moduleName={moduleName}
              portCount={portCount}
              gateCount={null}
              target={target}
              synthResult={synthResult}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Small header above the Symbols Library in the left sidebar. */
function CollapsibleSymbolsHeader({ collapsed, onToggle }) {
  return (
    <div
      onClick={onToggle}
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
      COLLAPSIBLE SYMBOLS LIBRARY
    </div>
  )
}

export default App
