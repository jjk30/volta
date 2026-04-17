import { useMemo, useState } from 'react'
import DiagramView from './DiagramView.jsx'

/**
 * SchematicView — parses Verilog into discrete gate operations and draws a
 * real gate-level schematic with Manhattan-routed wires.
 *
 * If the Verilog can't be reduced to gate primitives (complex procedural
 * logic, multi-module, etc.), falls back to the module-interface block
 * diagram (DiagramView) with a small banner explaining why.
 */

// ---------------------------------------------------------------------------
// Verilog parser
// ---------------------------------------------------------------------------

function stripComments(code) {
  return code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

function stripOuterParens(s) {
  s = s.trim()
  while (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0
    let outer = true
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++
      else if (s[i] === ')') depth--
      if (depth === 0 && i < s.length - 1) { outer = false; break }
    }
    if (outer) s = s.slice(1, -1).trim()
    else break
  }
  return s
}

// Split expression at the first top-level (not inside parens) occurrence of op
function splitTopLevel(expr, op) {
  let depth = 0
  for (let i = 0; i <= expr.length - op.length; i++) {
    const c = expr[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && expr.substr(i, op.length) === op) {
      // Avoid doubled operators like && and ||
      if (op === '&' && expr[i + 1] === '&') continue
      if (op === '|' && expr[i + 1] === '|') continue
      if (op === '&' && i > 0 && expr[i - 1] === '&') continue
      if (op === '|' && i > 0 && expr[i - 1] === '|') continue
      return [expr.slice(0, i).trim(), expr.slice(i + op.length).trim()]
    }
  }
  return null
}

function cleanSig(s) {
  return stripOuterParens(s).trim()
}

// Parse an RHS expression into { type, inputs, sel? }, or null if unrecognized.
function parseExpr(raw) {
  const expr = stripOuterParens(raw)

  // Ternary — split at first top-level '?' then ':'
  {
    let depth = 0, qIdx = -1
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      else if (depth === 0 && c === '?') { qIdx = i; break }
    }
    if (qIdx !== -1) {
      // find matching ':' at depth 0
      let depth2 = 0, cIdx = -1
      for (let i = qIdx + 1; i < expr.length; i++) {
        const c = expr[i]
        if (c === '(') depth2++
        else if (c === ')') depth2--
        else if (depth2 === 0 && c === ':') { cIdx = i; break }
      }
      if (cIdx !== -1) {
        return {
          type: 'MUX',
          sel: cleanSig(expr.slice(0, qIdx)),
          inputs: [cleanSig(expr.slice(qIdx + 1, cIdx)), cleanSig(expr.slice(cIdx + 1))],
        }
      }
    }
  }

  // ~(...) — might be NAND/NOR/XNOR
  {
    const m = expr.match(/^~\s*\(([\s\S]+)\)\s*$/)
    if (m) {
      const inner = m[1]
      let split
      if ((split = splitTopLevel(inner, '&'))) return { type: 'NAND', inputs: [cleanSig(split[0]), cleanSig(split[1])] }
      if ((split = splitTopLevel(inner, '|'))) return { type: 'NOR', inputs: [cleanSig(split[0]), cleanSig(split[1])] }
      if ((split = splitTopLevel(inner, '^'))) return { type: 'XNOR', inputs: [cleanSig(split[0]), cleanSig(split[1])] }
      // bare ~(x) → NOT
      return { type: 'NOT', inputs: [cleanSig(inner)] }
    }
  }

  // a ~^ b or a ^~ b → XNOR
  {
    const m = expr.match(/^([\w\[\]:\s]+)\s*(~\^|\^~)\s*([\s\S]+)$/)
    if (m) return { type: 'XNOR', inputs: [cleanSig(m[1]), cleanSig(m[3])] }
  }

  // ~x (unary NOT)
  {
    const m = expr.match(/^~\s*([\w\[\]:]+)\s*$/)
    if (m) return { type: 'NOT', inputs: [cleanSig(m[1])] }
  }

  // Comparators (test longer operators first)
  for (const [op, label] of [['<=', '<='], ['>=', '>='], ['==', '=='], ['!=', '!='], ['<', '<'], ['>', '>']]) {
    const split = splitTopLevel(expr, op)
    if (split) {
      // Guard: don't confuse '<' or '>' inside bit-selects like a[7:0] — those are inside brackets,
      //        which splitTopLevel already ignores via paren depth? No, it only tracks parens.
      //        But brackets won't be at depth 0 in normal module bodies for these operators.
      return { type: 'CMP', inputs: [cleanSig(split[0]), cleanSig(split[1])], label }
    }
  }

  // Binary arithmetic/logic (top-level split)
  for (const [op, type] of [['&', 'AND'], ['|', 'OR'], ['^', 'XOR'], ['+', 'ADD'], ['-', 'SUB']]) {
    const split = splitTopLevel(expr, op)
    if (split && split[0] && split[1]) {
      return { type, inputs: [cleanSig(split[0]), cleanSig(split[1])] }
    }
  }

  // Fallback: single identifier (buffer / pass-through) — ignore
  return null
}

// Parse always @(posedge CLK ...) blocks for DFFs.
// Returns an array of { type: 'DFF', inputs: [d, clk], out: q }.
function parseDFFs(code) {
  const ffs = []
  // Match always @(posedge|negedge clk ...) block body
  const re = /always\s*@\s*\(\s*(?:posedge|negedge)\s+(\w+)[^)]*\)\s*(?:begin\b)?([\s\S]*?)(?=\balways\b|\bendmodule\b|$)/g
  let m
  while ((m = re.exec(code)) !== null) {
    const clk = m[1]
    const body = m[2]
    const qToD = new Map()
    const nba = /(\w+)\s*<=\s*([^;]+);/g
    let a
    while ((a = nba.exec(body)) !== null) {
      const q = a[1].trim()
      const d = a[2].trim()
      // Skip constant/reset assignments (e.g. q <= 1'b0, q <= 0)
      if (/^[0-9]/.test(d) || /^[0-9]*'/.test(d)) continue
      qToD.set(q, d)
    }
    for (const [q, d] of qToD) {
      // Keep only the signal identifier part, not complex expressions
      const dSig = /^[\w\[\]:]+$/.test(d) ? d : d
      ffs.push({ type: 'DFF', inputs: [dSig, clk], out: q, source: `always @(posedge ${clk}) ${q} <= ${d}` })
    }
  }
  return ffs
}

// Top-level parse: returns { gates, primaryInputs, outputs } or null if nothing useful.
function parseDesign(code) {
  if (!code) return null
  const clean = stripComments(code)

  const gates = []

  // Parse assigns (support concatenation LHS like {c, s})
  const assignRe = /assign\s+([{}\w\[\]:,\s]+?)\s*=\s*([\s\S]+?);/g
  let m
  while ((m = assignRe.exec(clean)) !== null) {
    const out = m[1].trim()
    const op = parseExpr(m[2].trim())
    if (op) {
      gates.push({ ...op, out, source: `assign ${out} = ${m[2].trim()};` })
    }
  }

  // Parse DFFs
  gates.push(...parseDFFs(clean))

  if (gates.length === 0) return null

  // Classify inputs: primary (module inputs) vs intermediate (produced by another gate)
  const outputSet = new Set(gates.map((g) => g.out))
  const allInputs = []
  const seen = new Set()
  gates.forEach((g) => {
    g.inputs.forEach((sig) => { if (!seen.has(sig)) { seen.add(sig); allInputs.push(sig) } })
    if (g.sel && !seen.has(g.sel)) { seen.add(g.sel); allInputs.push(g.sel) }
  })
  const primaryInputs = allInputs.filter((s) => !outputSet.has(s))

  return { gates, primaryInputs, outputs: Array.from(outputSet) }
}

// Locate the line number (1-based) of a source substring in the code.
function findSourceLine(code, source) {
  if (!source) return null
  // Try to match on the assign <out> = prefix, which is the least ambiguous
  const prefixMatch = source.match(/^(assign\s+\S+)/)
  const needle = prefixMatch ? prefixMatch[1] : source.split('=')[0].trim()
  const idx = code.indexOf(needle)
  if (idx === -1) return null
  return code.slice(0, idx).split('\n').length
}

// ---------------------------------------------------------------------------
// Gate SVG symbols
// ---------------------------------------------------------------------------

// All gate symbols are centered at (0, 0) with a 80 × 50 bounding box.
// External pin coordinates (for wire routing):
//   Standard 2-input: in0 (-40,-10), in1 (-40,10), out (40,0)
//   NOT/1-input:     in0 (-40,0), out (40,0)
//   MUX (3-in):      in0 (-40,-15), in1 (-40,15), sel (0,30), out (40,0)
//   DFF (2-in):      d  (-40,-10), clk (-40,10), q (40,0)

function getPinLayout(type) {
  switch (type) {
    case 'NOT':
      return { in: [{ x: -40, y: 0 }], out: { x: 40, y: 0 } }
    case 'MUX':
      return { in: [{ x: -40, y: -15 }, { x: -40, y: 15 }, { x: 0, y: 30 }], out: { x: 40, y: 0 } }
    case 'DFF':
      return { in: [{ x: -40, y: -10 }, { x: -40, y: 10 }], out: { x: 40, y: 0 } }
    default:
      return { in: [{ x: -40, y: -10 }, { x: -40, y: 10 }], out: { x: 40, y: 0 } }
  }
}

function GateSymbol({ type, color, label, onHover, onLeave, onClick, hasError }) {
  const sw = 2
  const stroke = hasError ? 'var(--schematic-error)' : color
  const fill = 'none'
  const txt = hasError ? 'var(--schematic-error)' : color

  const common = {
    stroke,
    strokeWidth: sw,
    fill,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }

  // Wire stubs from external pin positions to actual symbol edge
  const stubs = (() => {
    switch (type) {
      case 'NOT':
        return (
          <>
            <line x1="-40" y1="0" x2="-25" y2="0" {...common} />
            <line x1="18" y1="0" x2="40" y2="0" {...common} />
          </>
        )
      case 'MUX':
        return (
          <>
            <line x1="-40" y1="-15" x2="-22" y2="-15" {...common} />
            <line x1="-40" y1="15" x2="-22" y2="15" {...common} />
            <line x1="0" y1="30" x2="0" y2="18" {...common} />
            <line x1="22" y1="0" x2="40" y2="0" {...common} />
          </>
        )
      case 'DFF':
        return (
          <>
            <line x1="-40" y1="-10" x2="-25" y2="-10" {...common} />
            <line x1="-40" y1="10" x2="-25" y2="10" {...common} />
            <line x1="25" y1="0" x2="40" y2="0" {...common} />
          </>
        )
      default:
        return (
          <>
            <line x1="-40" y1="-10" x2="-25" y2="-10" {...common} />
            <line x1="-40" y1="10" x2="-25" y2="10" {...common} />
            <line x1={type === 'AND' || type === 'NAND' ? 5 : type === 'OR' || type === 'NOR' || type === 'XOR' || type === 'XNOR' ? 15 : 25} y1="0" x2="40" y2="0" {...common} />
          </>
        )
    }
  })()

  // Symbol body
  const body = (() => {
    switch (type) {
      case 'AND':
        return <path d="M -25 -20 L -5 -20 A 20 20 0 0 1 -5 20 L -25 20 Z" {...common} />
      case 'NAND':
        return (
          <>
            <path d="M -25 -20 L -8 -20 A 20 20 0 0 1 -8 20 L -25 20 Z" {...common} />
            <circle cx="15" cy="0" r="4" {...common} />
          </>
        )
      case 'OR':
        return <path d="M -25 -20 Q -5 0 -25 20 Q 0 20 15 0 Q 0 -20 -25 -20 Z" {...common} />
      case 'NOR':
        return (
          <>
            <path d="M -25 -20 Q -5 0 -25 20 Q 0 20 11 0 Q 0 -20 -25 -20 Z" {...common} />
            <circle cx="15" cy="0" r="4" {...common} />
          </>
        )
      case 'XOR':
        return (
          <>
            <path d="M -29 -20 Q -9 0 -29 20" {...common} />
            <path d="M -24 -20 Q -4 0 -24 20 Q 1 20 15 0 Q 1 -20 -24 -20 Z" {...common} />
          </>
        )
      case 'XNOR':
        return (
          <>
            <path d="M -29 -20 Q -9 0 -29 20" {...common} />
            <path d="M -24 -20 Q -4 0 -24 20 Q 1 20 11 0 Q 1 -20 -24 -20 Z" {...common} />
            <circle cx="15" cy="0" r="4" {...common} />
          </>
        )
      case 'NOT':
        return (
          <>
            <polygon points="-25,-20 14,0 -25,20" {...common} />
            <circle cx="18" cy="0" r="4" {...common} />
          </>
        )
      case 'MUX':
        return (
          <>
            <polygon points="-22,-25 22,-15 22,15 -22,25" {...common} />
            <text x="0" y="4" textAnchor="middle" fill={txt} fontSize="9" fontFamily="'JetBrains Mono', monospace">MUX</text>
            <text x="-17" y="-10" textAnchor="start" fill={txt} fontSize="7" fontFamily="'JetBrains Mono', monospace">0</text>
            <text x="-17" y="18" textAnchor="start" fill={txt} fontSize="7" fontFamily="'JetBrains Mono', monospace">1</text>
            <text x="0" y="26" textAnchor="middle" fill={txt} fontSize="6" fontFamily="'JetBrains Mono', monospace">sel</text>
          </>
        )
      case 'DFF':
        return (
          <>
            <rect x="-25" y="-20" width="50" height="40" {...common} />
            {/* Clock triangle */}
            <polyline points="-25,5 -18,10 -25,15" {...common} />
            <text x="-18" y="-5" textAnchor="start" fill={txt} fontSize="8" fontFamily="'JetBrains Mono', monospace">D</text>
            <text x="22" y="4" textAnchor="end" fill={txt} fontSize="8" fontFamily="'JetBrains Mono', monospace">Q</text>
            <text x="0" y="-8" textAnchor="middle" fill={txt} fontSize="7" fontFamily="'JetBrains Mono', monospace">DFF</text>
          </>
        )
      case 'ADD':
        return (
          <>
            <rect x="-25" y="-20" width="50" height="40" {...common} />
            <text x="0" y="6" textAnchor="middle" fill={txt} fontSize="18" fontFamily="'JetBrains Mono', monospace" fontWeight="600">+</text>
          </>
        )
      case 'SUB':
        return (
          <>
            <rect x="-25" y="-20" width="50" height="40" {...common} />
            <text x="0" y="5" textAnchor="middle" fill={txt} fontSize="20" fontFamily="'JetBrains Mono', monospace" fontWeight="600">-</text>
          </>
        )
      case 'CMP':
        return (
          <>
            <rect x="-25" y="-20" width="50" height="40" {...common} />
            <text x="0" y="5" textAnchor="middle" fill={txt} fontSize="11" fontFamily="'JetBrains Mono', monospace" fontWeight="600">{label || 'CMP'}</text>
          </>
        )
      default:
        return (
          <>
            <rect x="-25" y="-20" width="50" height="40" {...common} />
            <text x="0" y="5" textAnchor="middle" fill={txt} fontSize="9" fontFamily="'JetBrains Mono', monospace">{type}</text>
          </>
        )
    }
  })()

  return (
    <g
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {body}
      {stubs}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SchematicView({ design, hasErrors = false, onGateClick }) {
  const parsed = useMemo(() => parseDesign(design || ''), [design])
  const [hoveredGate, setHoveredGate] = useState(null)
  const [hoveredSignal, setHoveredSignal] = useState(null)

  // Fallback: no parseable gates → show module interface (existing block diagram)
  if (!parsed) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
      }}>
        <div style={{
          padding: '4px 12px',
          fontSize: '10px',
          color: 'var(--text-dim)',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.5px',
          background: 'var(--toolbar-bg)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          Detailed schematic not available for this design — showing module interface
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <DiagramView design={design} />
        </div>
      </div>
    )
  }

  const { gates, primaryInputs, outputs } = parsed
  const n = gates.length
  const gateSpacing = n <= 3 ? 90 : n <= 6 ? 70 : 55

  const COL1_X = 110   // primary input signal x
  const COL2_X = 300   // gate center x
  const COL3_X = 490   // output signal x
  const TOP_PAD = 40

  // Position gates
  const gatePositions = gates.map((g, i) => ({
    ...g,
    cx: COL2_X,
    cy: TOP_PAD + 30 + i * gateSpacing,
    pins: getPinLayout(g.type),
    index: i,
  }))

  const svgHeight = Math.max(
    240,
    TOP_PAD + 30 + n * gateSpacing + TOP_PAD,
    TOP_PAD + 30 + Math.max(primaryInputs.length * 32, n * gateSpacing) + TOP_PAD,
  )
  const svgWidth = 580

  // Primary-input row positions (col 1)
  const inputRowSpacing = primaryInputs.length > 0
    ? Math.min(44, (svgHeight - TOP_PAD * 2) / Math.max(1, primaryInputs.length))
    : 0
  const inputPositions = primaryInputs.map((sig, i) => ({
    name: sig,
    x: COL1_X,
    y: TOP_PAD + 30 + i * inputRowSpacing,
  }))
  const inputByName = new Map(inputPositions.map((p) => [p.name, p]))

  // Wire routing — collect all segments
  const wires = []
  const junctions = []

  // Track per-input branch count for visual separation
  const inputBranchCount = new Map()
  primaryInputs.forEach((s) => inputBranchCount.set(s, 0))

  gatePositions.forEach((gate, gIdx) => {
    const pinList = [...gate.pins.in]
    const inputSigs = [...gate.inputs]
    if (gate.sel) inputSigs.push(gate.sel) // MUX: sel is last

    inputSigs.forEach((sig, pinIdx) => {
      if (pinIdx >= pinList.length) return
      const pin = pinList[pinIdx]
      const pinAbsX = gate.cx + pin.x
      const pinAbsY = gate.cy + pin.y

      // Is this signal primary or an intermediate (another gate's output)?
      if (inputByName.has(sig)) {
        const src = inputByName.get(sig)
        const branchIdx = inputBranchCount.get(sig) || 0
        inputBranchCount.set(sig, branchIdx + 1)
        // Route: src → small horizontal → vertical bus → horizontal to pin
        const busX = COL1_X + 40 + (branchIdx * 8)
        const points = [
          [src.x + 6, src.y],
          [busX, src.y],
          [busX, pinAbsY],
          [pinAbsX, pinAbsY],
        ]
        wires.push({ points, signal: sig, sourceKind: 'primary', gateIndex: gIdx })
        // Junction dot at the bus tap if multiple branches feed from same src
        if (branchIdx >= 1) {
          junctions.push({ x: src.x + 6, y: src.y })
        }
      } else {
        // Intermediate: find the producing gate and route from its output
        const srcGate = gatePositions.find((gg) => gg.out === sig)
        if (!srcGate) return
        const srcX = srcGate.cx + srcGate.pins.out.x
        const srcY = srcGate.cy + srcGate.pins.out.y
        // Route: src output → right a bit → vertical → horizontal to pin
        const midX = Math.max(srcX + 20, pinAbsX - 30)
        const points = [
          [srcX, srcY],
          [midX, srcY],
          [midX, pinAbsY],
          [pinAbsX, pinAbsY],
        ]
        wires.push({ points, signal: sig, sourceKind: 'intermediate', gateIndex: gIdx })
      }
    })

    // Output wire: gate output → col3 label
    const outX = gate.cx + gate.pins.out.x
    const outY = gate.cy + gate.pins.out.y
    // If this gate's output is ONLY consumed by other gates (not a module output), skip col3 label
    // For visual clarity, always show the label
    const points = [
      [outX, outY],
      [COL3_X - 6, outY],
    ]
    wires.push({ points, signal: gate.out, sourceKind: 'output', gateIndex: gIdx, isOutputStub: true })
  })

  const accent = 'var(--schematic-accent)'
  const wireColor = 'var(--schematic-wire)'
  const wireHighlight = 'var(--schematic-highlight)'
  const errorColor = 'var(--schematic-error)'

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {hasErrors && (
        <div style={{
          padding: '6px 12px',
          background: 'var(--error-bg)',
          border: '1px solid var(--schematic-error)',
          color: 'var(--schematic-error)',
          fontSize: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.5px',
          flexShrink: 0,
        }}>
          Circuit topology error — see Volta Assistant for details
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            width: '100%',
            maxWidth: `${svgWidth}px`,
            height: 'auto',
            display: 'block',
            margin: '0 auto',
          }}
        >
          {/* Primary input signals (col 1) */}
          {inputPositions.map((p) => {
            const isHot = hoveredSignal === p.name
            return (
              <g
                key={`in-${p.name}`}
                onMouseEnter={() => setHoveredSignal(p.name)}
                onMouseLeave={() => setHoveredSignal(null)}
                style={{ cursor: 'default' }}
              >
                <circle cx={p.x} cy={p.y} r="3" fill={isHot ? wireHighlight : accent} />
                <text
                  x={p.x - 8}
                  y={p.y + 4}
                  textAnchor="end"
                  fill={isHot ? wireHighlight : accent}
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize="10"
                >
                  {p.name}
                </text>
              </g>
            )
          })}

          {/* Wires */}
          {wires.map((w, i) => {
            const isHot = hoveredSignal && w.signal === hoveredSignal
            const color = hasErrors ? errorColor : (isHot ? wireHighlight : wireColor)
            const strokeWidth = isHot ? 2 : 1.5
            return (
              <polyline
                key={`w-${i}`}
                points={w.points.map((pp) => pp.join(',')).join(' ')}
                stroke={color}
                strokeWidth={strokeWidth}
                fill="none"
                onMouseEnter={() => setHoveredSignal(w.signal)}
                onMouseLeave={() => setHoveredSignal(null)}
                style={{ cursor: 'pointer', transition: 'stroke 0.12s' }}
              />
            )
          })}

          {/* Branch junction dots */}
          {junctions.map((j, i) => (
            <circle key={`j-${i}`} cx={j.x} cy={j.y} r="2.2" fill={wireColor} />
          ))}

          {/* Gates */}
          {gatePositions.map((gate, i) => (
            <g key={`g-${i}`} transform={`translate(${gate.cx}, ${gate.cy})`}>
              <GateSymbol
                type={gate.type}
                color={accent}
                label={gate.label}
                hasError={hasErrors}
                onHover={() => setHoveredGate(i)}
                onLeave={() => setHoveredGate(null)}
                onClick={() => {
                  if (onGateClick) {
                    const lineNumber = findSourceLine(design || '', gate.source)
                    onGateClick(lineNumber, gate.source)
                  }
                }}
              />
            </g>
          ))}

          {/* Output labels (col 3) */}
          {gatePositions.map((gate) => {
            const isHot = hoveredSignal === gate.out
            return (
              <g
                key={`out-${gate.out}-${gate.index}`}
                onMouseEnter={() => setHoveredSignal(gate.out)}
                onMouseLeave={() => setHoveredSignal(null)}
              >
                <circle cx={COL3_X} cy={gate.cy} r="3" fill={isHot ? wireHighlight : accent} />
                <text
                  x={COL3_X + 8}
                  y={gate.cy + 4}
                  textAnchor="start"
                  fill={isHot ? wireHighlight : accent}
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize="10"
                >
                  {gate.out}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Hover tooltip */}
      {hoveredGate !== null && gatePositions[hoveredGate] && (
        <div style={{
          position: 'absolute',
          pointerEvents: 'none',
          left: 16,
          bottom: 16,
          padding: '6px 10px',
          background: 'var(--tooltip-bg)',
          border: '1px solid var(--border-accent)',
          borderRadius: '3px',
          color: 'var(--accent)',
          fontSize: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          zIndex: 5,
          maxWidth: '400px',
        }}>
          <strong>{gatePositions[hoveredGate].type}</strong>
          {gatePositions[hoveredGate].label ? ` (${gatePositions[hoveredGate].label})` : ''}
          : {gatePositions[hoveredGate].source}
        </div>
      )}
    </div>
  )
}
