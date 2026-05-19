import { useEffect, useMemo, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Zoom/pan persistence — module-level so state survives the unmount/remount
// that happens when the user clicks away from the SCHEMATIC tab and back.
// The cache is keyed by the design string so a different design starts fresh.
// ---------------------------------------------------------------------------
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0
let _persistedView = { zoom: 1, offsetX: 0, offsetY: 0 }
let _persistedKey = ''

/**
 * SchematicView — parses Verilog into a rich component graph and draws a
 * meaningful schematic for every supported pattern:
 *   - Gate-level (assigns with bitwise operators)        → IEEE gate symbols
 *   - Sequential (flip-flops, counters, shift registers,
 *     registers with enable, FSMs)                       → labelled blocks
 *   - Case-based (ALU, decoder, encoder, MUX block)      → op-list block
 *   - Arithmetic (adder, subtractor, multiplier,
 *     barrel shifter, comparator)                        → arithmetic block
 *   - Memory (RAM/ROM/regfile)                           → hatched memory block
 *   - Interface modules (UART, SPI, I2C)                 → hierarchical
 *                                                          sub-block diagram
 *   - Absolute fallback                                  → detailed module
 *                                                          block with labelled
 *                                                          ports and a note
 *
 * Every valid module gets SOME visual. We never fall back to DiagramView.
 */

// ============================================================================
// PART 1 — Verilog parser utilities
// ============================================================================

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

// Split at the first top-level (not inside parens/brackets) occurrence of op
function splitTopLevel(expr, op) {
  let pDepth = 0, bDepth = 0
  for (let i = 0; i <= expr.length - op.length; i++) {
    const c = expr[i]
    if (c === '(') pDepth++
    else if (c === ')') pDepth--
    else if (c === '[') bDepth++
    else if (c === ']') bDepth--
    else if (pDepth === 0 && bDepth === 0 && expr.substr(i, op.length) === op) {
      if (op === '&' && expr[i + 1] === '&') continue
      if (op === '|' && expr[i + 1] === '|') continue
      if (op === '&' && i > 0 && expr[i - 1] === '&') continue
      if (op === '|' && i > 0 && expr[i - 1] === '|') continue
      return [expr.slice(0, i).trim(), expr.slice(i + op.length).trim()]
    }
  }
  return null
}

function cleanSig(s) { return stripOuterParens(s).trim() }

// Parse a Verilog RHS expression. Returns { type, inputs, sel?, label? } or null.
function parseExpr(raw) {
  const expr = stripOuterParens(raw)
  if (!expr) return null

  // Ternary a ? b : c → MUX
  {
    let depth = 0, bDepth = 0, qIdx = -1
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      else if (c === '[') bDepth++
      else if (c === ']') bDepth--
      else if (depth === 0 && bDepth === 0 && c === '?') { qIdx = i; break }
    }
    if (qIdx !== -1) {
      let d2 = 0, b2 = 0, cIdx = -1
      for (let i = qIdx + 1; i < expr.length; i++) {
        const c = expr[i]
        if (c === '(') d2++
        else if (c === ')') d2--
        else if (c === '[') b2++
        else if (c === ']') b2--
        else if (d2 === 0 && b2 === 0 && c === ':') { cIdx = i; break }
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

  // ~(...) — NAND / NOR / XNOR / NOT
  {
    const m = expr.match(/^~\s*\(([\s\S]+)\)\s*$/)
    if (m) {
      const inner = m[1]
      let split
      if ((split = splitTopLevel(inner, '&'))) return { type: 'NAND', inputs: [cleanSig(split[0]), cleanSig(split[1])] }
      if ((split = splitTopLevel(inner, '|'))) return { type: 'NOR', inputs: [cleanSig(split[0]), cleanSig(split[1])] }
      if ((split = splitTopLevel(inner, '^'))) return { type: 'XNOR', inputs: [cleanSig(split[0]), cleanSig(split[1])] }
      return { type: 'NOT', inputs: [cleanSig(inner)] }
    }
  }

  // a ~^ b / a ^~ b → XNOR
  {
    const m = expr.match(/^([\w\[\]:\s]+)\s*(~\^|\^~)\s*([\s\S]+)$/)
    if (m) return { type: 'XNOR', inputs: [cleanSig(m[1]), cleanSig(m[3])] }
  }

  // ~x → NOT
  {
    const m = expr.match(/^~\s*([\w\[\]:]+)\s*$/)
    if (m) return { type: 'NOT', inputs: [cleanSig(m[1])] }
  }

  // Comparators — try longer operators first
  for (const [op, label] of [['<=', '<='], ['>=', '>='], ['==', '=='], ['!=', '!='], ['<', '<'], ['>', '>']]) {
    const split = splitTopLevel(expr, op)
    if (split) return { type: 'CMP', inputs: [cleanSig(split[0]), cleanSig(split[1])], label }
  }

  // Binary arithmetic / logic
  for (const [op, type] of [['&', 'AND'], ['|', 'OR'], ['^', 'XOR'], ['*', 'MUL'], ['+', 'ADD'], ['-', 'SUB']]) {
    const split = splitTopLevel(expr, op)
    if (split && split[0] && split[1]) {
      return { type, inputs: [cleanSig(split[0]), cleanSig(split[1])] }
    }
  }

  return null
}

// Line number (1-based) of a source fragment in the original code.
function findSourceLine(code, source) {
  if (!source) return null
  const prefixMatch = source.match(/^(assign\s+\S+|always\s*@|case\s*\()/)
  const needle = prefixMatch ? prefixMatch[1] : source.split('=')[0].trim().slice(0, 40)
  const idx = code.indexOf(needle)
  if (idx === -1) return null
  return code.slice(0, idx).split('\n').length
}

// ============================================================================
// PART 2 — Module parser (name + ports)
// ============================================================================

function parseModuleInfo(code) {
  const hdr = code.match(/module\s+(\w+)\s*\(([\s\S]*?)\)\s*;/)
  if (!hdr) return { name: 'untitled', ports: [] }
  const name = hdr[1]
  const headerPortText = hdr[2]
  const body = code.slice(code.indexOf(hdr[0]) + hdr[0].length)

  const ports = []
  const seen = new Set()

  const addPort = (dir, widthRange, nameList) => {
    const width = widthRange ? computeWidth(widthRange) : 1
    for (const raw of nameList) {
      const n = raw.trim()
      if (!n || seen.has(n)) continue
      seen.add(n)
      ports.push({ name: n, dir, width, widthRange })
    }
  }

  // ANSI port declarations (inside the header)
  const ansiRe = /(?:^|,|\()\s*(input|output|inout)\s+(?:reg\s+|wire\s+|logic\s+)?(?:signed\s+)?(?:\[([^\]]+)\])?\s*([\w,\s]+?)(?=,\s*(?:input|output|inout)|$|,\s*\))/g
  let m
  while ((m = ansiRe.exec(headerPortText)) !== null) {
    addPort(m[1], m[2], m[3].split(/\s*,\s*/))
  }

  // Non-ANSI: `input [N:0] a, b;` in module body
  const nonAnsiRe = /\b(input|output|inout)\s+(?:reg\s+|wire\s+|logic\s+)?(?:signed\s+)?(?:\[([^\]]+)\])?\s+([\w,\s]+?)\s*;/g
  while ((m = nonAnsiRe.exec(body)) !== null) {
    addPort(m[1], m[2], m[3].split(/\s*,\s*/))
  }

  return { name, ports }
}

function computeWidth(range) {
  const m = range.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/)
  if (m) return Math.abs(parseInt(m[1]) - parseInt(m[2])) + 1
  // Parametric width: preserve raw text for display
  return null
}

// ============================================================================
// PART 3 — Pattern classifiers
// ============================================================================

/** Counter: q <= q + <const>  (or +1) */
function isCounterPattern(q, d) {
  const m = d.match(/^\s*(\w+)\s*\+\s*(\d+|1'b1|1|[\w]+)\s*$/)
  return !!(m && m[1].trim() === q)
}

/** Shift register: q <= {q[...], din}  or  {din, q[...]} */
function isShiftRegPattern(q, d) {
  return d.includes('{') && new RegExp('\\b' + q + '\\[').test(d)
}

/** Extract the shift-in signal from a shift register RHS. */
function extractShiftInput(q, d) {
  const inner = d.match(/\{([\s\S]*)\}/)?.[1]
  if (!inner) return 'din'
  const parts = inner.split(/,/).map(s => s.trim())
  for (const p of parts) {
    if (!new RegExp('\\b' + q + '\\b').test(p)) return p.replace(/\[.*\]/, '')
  }
  return 'din'
}

/** Program counter: pc <= pc + 4  (or similar with 4) */
function isPCPattern(q, d) {
  const m = d.match(/^\s*(\w+)\s*\+\s*(4|2|'h4|32'd4)\s*$/)
  return !!(m && m[1].trim() === q)
}

/** Sign extend: {{N{in[MSB]}}, in} */
function isSignExtendPattern(rhs) {
  return /\{\s*\{\s*\d+\s*\{/.test(rhs)
}

// ============================================================================
// PART 4 — Always-block parser
// ============================================================================

function extractTopLevelCondSignals(body) {
  const lower = body.toLowerCase()
  const hasReset = /\bif\s*\(\s*!?\s*(rst|reset|n_?rst|n_?reset|arst|clr)\b/i.test(body)
    || /(?:posedge|negedge)\s+(rst|reset|arst)/i.test(body)
  const hasEnable = /\bif\s*\(\s*(en|enable|we|wr|valid|load)\b/i.test(body)
  const hasStart = /\bif\s*\(\s*(start|go|begin)\b/i.test(body)
  return { hasReset, hasEnable, hasStart }
}

/** Parse a case block body → array of { value, body } */
function parseCaseItems(caseBody) {
  const items = []
  // Values: identifiers, default, or numeric literals (binary/decimal/hex sized)
  const re = /((?:\d+'[bdho][0-9a-fA-FxXzZ_]+)|(?:default)|(?:[A-Z][A-Z0-9_]*)|(?:\w+))\s*:\s*([\s\S]*?)(?=(?:\d+'[bdho][0-9a-fA-FxXzZ_]+|default|[A-Z][A-Z0-9_]*|\w+)\s*:|endcase|$)/g
  let m
  while ((m = re.exec(caseBody)) !== null) {
    items.push({ value: m[1].trim(), body: m[2].trim() })
  }
  return items
}

/** Extract labels (ADD/SUB/AND...) from a case body's RHS */
function summariseOperation(rhs) {
  const s = rhs.trim()
  if (/^\w+\s*\+\s*\w+$/.test(s)) return 'ADD'
  if (/^\w+\s*-\s*\w+$/.test(s)) return 'SUB'
  if (/^\w+\s*\*\s*\w+$/.test(s)) return 'MUL'
  if (/^\w+\s*\/\s*\w+$/.test(s)) return 'DIV'
  if (/&/.test(s) && !/&&/.test(s)) return 'AND'
  if (/\|/.test(s) && !/\|\|/.test(s)) return 'OR'
  if (/\^/.test(s)) return 'XOR'
  if (/~/.test(s)) return 'NOT'
  if (/<<</.test(s)) return 'SRA'
  if (/<</.test(s)) return 'SHL'
  if (/>>>/.test(s)) return 'SRA'
  if (/>>/.test(s)) return 'SHR'
  if (/==/.test(s)) return 'EQ'
  if (/!=/.test(s)) return 'NEQ'
  if (/</.test(s) || />/.test(s)) return 'CMP'
  return s.length > 8 ? s.slice(0, 8) + '…' : s
}

/** Collect non-blocking assignments from a block body */
function collectNBAs(body) {
  const out = new Map()
  const re = /(\w+)\s*<=\s*([^;]+);/g
  let m
  while ((m = re.exec(body)) !== null) {
    const q = m[1].trim()
    const d = m[2].trim()
    // Skip pure numeric/constant assignments (reset values)
    if (/^(\d+|\d+'[bdho][0-9a-fA-FxXzZ_]+|1'b[01])\s*$/.test(d)) continue
    // Last assignment wins (handles if/else where the "active" branch comes last)
    out.set(q, d)
  }
  return out
}

// ============================================================================
// PART 5 — Interface template detection
// ============================================================================

function detectInterfaceModule(moduleName, code) {
  const lower = moduleName.toLowerCase()
  if (/uart.*(tx|trans|xmit)|tx.*uart/.test(lower)) return 'UART_TX'
  if (/uart.*(rx|recv|rcv)|rx.*uart/.test(lower)) return 'UART_RX'
  if (/\buart\b/.test(lower)) {
    // Heuristic: if code has an output named `tx`, treat as TX; otherwise plain UART_TX by default
    if (/\boutput\s+\w*\s*tx\b/i.test(code)) return 'UART_TX'
    if (/\boutput\s+\w*\s*rx\b/i.test(code)) return 'UART_RX'
    return 'UART_TX'
  }
  if (/spi.*(master|mstr|ctrl)/.test(lower) || /master.*spi/.test(lower)) return 'SPI_MASTER'
  if (/spi.*(slave|slv)/.test(lower)) return 'SPI_SLAVE'
  if (/\bspi\b/.test(lower)) return 'SPI_MASTER'
  if (/i2c|twi|iic/.test(lower)) return 'I2C'
  return null
}

// Canned sub-block layouts for interface modules. Sub-blocks are placed on
// a (col, row) grid — column 0 is input-facing, column N-1 is output-facing,
// rows stack vertically when a column needs more than one block. The renderer
// computes pixel coordinates from these logical positions and routes wires
// around any block that sits between the source and destination column.
const INTERFACE_TEMPLATES = {
  UART_TX: {
    label: 'UART Transmitter',
    subBlocks: [
      { id: 'baud',  label: 'Baud Gen',    sub: 'counter', col: 0, row: 0 },
      { id: 'fsm',   label: 'FSM Control', sub: 'fsm',     col: 1, row: 0 },
      { id: 'shift', label: 'Shift Reg',   sub: 'shift',   col: 2, row: 0 },
    ],
    connections: [
      { from: 'baud', to: 'fsm',   label: 'tick' },
      { from: 'fsm',  to: 'shift', label: 'load/shift' },
      { from: 'baud', to: 'shift', label: 'baud_tick' },
    ],
    externalPorts: {
      inputs:  ['clk', 'rst', 'tx_data', 'tx_en'],
      outputs: ['tx', 'tx_done'],
    },
    externalWires: [
      { port: 'clk',     to: 'baud' },
      { port: 'rst',     to: 'fsm' },
      { port: 'tx_data', to: 'shift' },
      { port: 'tx_en',   to: 'fsm' },
      { port: 'tx',      from: 'shift' },
      { port: 'tx_done', from: 'fsm' },
    ],
  },
  UART_RX: {
    label: 'UART Receiver',
    subBlocks: [
      { id: 'baud',  label: 'Baud Gen',    sub: 'counter', col: 0, row: 0 },
      { id: 'fsm',   label: 'FSM Control', sub: 'fsm',     col: 1, row: 0 },
      { id: 'shift', label: 'Shift Reg',   sub: 'shift',   col: 2, row: 0 },
    ],
    connections: [
      { from: 'baud', to: 'fsm',   label: 'tick' },
      { from: 'fsm',  to: 'shift', label: 'capture' },
      { from: 'baud', to: 'shift', label: 'sample' },
    ],
    externalPorts: {
      inputs:  ['clk', 'rst', 'rx'],
      outputs: ['rx_data', 'rx_valid'],
    },
    externalWires: [
      { port: 'clk',      to: 'baud' },
      { port: 'rst',      to: 'fsm' },
      { port: 'rx',       to: 'shift' },
      { port: 'rx_data',  from: 'shift' },
      { port: 'rx_valid', from: 'fsm' },
    ],
  },
  SPI_MASTER: {
    label: 'SPI Master',
    subBlocks: [
      { id: 'clkgen', label: 'Clock Gen',   sub: 'counter', col: 0, row: 0 },
      { id: 'fsm',    label: 'FSM Control', sub: 'fsm',     col: 1, row: 0 },
      { id: 'shift',  label: 'Shift Reg',   sub: 'shift',   col: 2, row: 0 },
    ],
    connections: [
      { from: 'clkgen', to: 'fsm',   label: 'tick' },
      { from: 'fsm',    to: 'shift', label: 'load' },
      { from: 'clkgen', to: 'shift', label: 'shift_clk' },
    ],
    externalPorts: {
      inputs:  ['clk', 'rst', 'miso', 'tx_data', 'start'],
      outputs: ['sclk', 'mosi', 'cs', 'done'],
    },
    externalWires: [
      { port: 'clk',     to: 'clkgen' },
      { port: 'rst',     to: 'fsm' },
      { port: 'start',   to: 'fsm' },
      { port: 'tx_data', to: 'shift' },
      { port: 'miso',    to: 'shift' },
      { port: 'sclk',    from: 'clkgen' },
      { port: 'mosi',    from: 'shift' },
      { port: 'cs',      from: 'fsm' },
      { port: 'done',    from: 'fsm' },
    ],
  },
  SPI_SLAVE: {
    label: 'SPI Slave',
    subBlocks: [
      { id: 'shift', label: 'Shift Reg',   sub: 'shift', col: 0, row: 0 },
      { id: 'latch', label: 'RX Latch',    sub: 'reg',   col: 1, row: 0 },
      { id: 'fsm',   label: 'FSM Control', sub: 'fsm',   col: 1, row: 1 },
    ],
    connections: [
      { from: 'shift', to: 'latch', label: 'rx_word' },
      { from: 'shift', to: 'fsm',   label: 'bit_cnt' },
    ],
    externalPorts: {
      inputs:  ['sclk', 'mosi', 'cs'],
      outputs: ['miso', 'rx_data', 'rx_valid'],
    },
    externalWires: [
      { port: 'sclk',     to: 'shift' },
      { port: 'mosi',     to: 'shift' },
      { port: 'cs',       to: 'fsm' },
      { port: 'miso',     from: 'shift' },
      { port: 'rx_data',  from: 'latch' },
      { port: 'rx_valid', from: 'fsm' },
    ],
  },
  I2C: {
    label: 'I2C Controller',
    subBlocks: [
      { id: 'clkgen', label: 'SCL Gen',   sub: 'counter', col: 0, row: 0 },
      { id: 'fsm',    label: 'FSM',       sub: 'fsm',     col: 1, row: 0 },
      { id: 'shift',  label: 'Shift Reg', sub: 'shift',   col: 2, row: 0 },
    ],
    connections: [
      { from: 'clkgen', to: 'fsm',   label: 'tick' },
      { from: 'fsm',    to: 'shift', label: 'ack/load' },
      { from: 'clkgen', to: 'shift', label: 'scl_edge' },
    ],
    externalPorts: {
      inputs:  ['clk', 'rst', 'start', 'addr', 'data_in'],
      outputs: ['scl', 'sda', 'data_out', 'done'],
    },
    externalWires: [
      { port: 'clk',      to: 'clkgen' },
      { port: 'rst',      to: 'fsm' },
      { port: 'start',    to: 'fsm' },
      { port: 'addr',     to: 'shift' },
      { port: 'data_in',  to: 'shift' },
      { port: 'scl',      from: 'clkgen' },
      { port: 'sda',      from: 'shift' },
      { port: 'data_out', from: 'shift' },
      { port: 'done',     from: 'fsm' },
    ],
  },
}

// ============================================================================
// PART 6 — Top-level parse
// ============================================================================

function parseDesign(code) {
  if (!code || !code.trim()) return null
  const clean = stripComments(code)
  const mod = parseModuleInfo(clean)

  // Interface-module short-circuit — render from canned template
  const interfaceType = detectInterfaceModule(mod.name, clean)
  if (interfaceType && INTERFACE_TEMPLATES[interfaceType]) {
    return {
      kind: 'hierarchical',
      module: mod,
      interfaceType,
      template: INTERFACE_TEMPLATES[interfaceType],
    }
  }

  const components = []
  const signalOwners = new Map() // signal → component id that produces it

  // ------- ASSIGN statements -------
  const assignLines = []
  const assignRe = /assign\s+([{}\w\[\]:,\s]+?)\s*=\s*([\s\S]+?);/g
  let m
  while ((m = assignRe.exec(clean)) !== null) {
    assignLines.push({ out: m[1].trim(), rhs: m[2].trim(), source: `assign ${m[1].trim()} = ${m[2].trim()};` })
  }

  // Combined comparator: multiple CMP assigns on the same (a, b) pair
  const cmpAssigns = assignLines
    .map(a => ({ a, op: parseExpr(a.rhs) }))
    .filter(x => x.op?.type === 'CMP')
  if (cmpAssigns.length >= 2) {
    const ref = cmpAssigns[0].op.inputs
    const allSame = cmpAssigns.every(x => x.op.inputs[0] === ref[0] && x.op.inputs[1] === ref[1])
    if (allSame) {
      components.push({
        kind: 'COMPARATOR',
        id: 'cmp-' + cmpAssigns.map(x => x.a.out).join('-'),
        inputs: [{ name: ref[0], label: 'A' }, { name: ref[1], label: 'B' }],
        outputs: cmpAssigns.map(x => ({ name: x.a.out, label: (x.op.label || 'CMP').toUpperCase() })),
        source: cmpAssigns.map(x => x.a.source).join('\n'),
      })
      for (const { a } of cmpAssigns) {
        const idx = assignLines.indexOf(a)
        if (idx >= 0) assignLines.splice(idx, 1)
        signalOwners.set(a.out, components.length - 1)
      }
    }
  }

  // Sign-extend pattern
  for (let i = assignLines.length - 1; i >= 0; i--) {
    const a = assignLines[i]
    if (isSignExtendPattern(a.rhs)) {
      // extract the base signal from {{N{x[MSB]}}, rest}
      const baseMatch = a.rhs.match(/,\s*(\w+)\s*\}/)
      const base = baseMatch ? baseMatch[1] : 'in'
      components.push({
        kind: 'SIGN_EXT',
        inputs: [{ name: base, label: 'IN' }],
        outputs: [{ name: a.out, label: 'OUT' }],
        source: a.source,
      })
      signalOwners.set(a.out, components.length - 1)
      assignLines.splice(i, 1)
    }
  }

  // Remaining assigns → gates / arithmetic primitives
  for (const a of assignLines) {
    const op = parseExpr(a.rhs)
    if (!op) continue
    const gateKind = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'].includes(op.type)
      ? 'GATE' : op.type
    components.push({
      kind: gateKind,
      gateType: op.type,
      inputs: (op.inputs || []).map((s, i) => ({ name: s, label: String.fromCharCode(65 + i) })),
      sel: op.sel,
      selLabel: 'sel',
      outputs: [{ name: a.out, label: a.out }],
      opLabel: op.label,
      source: a.source,
    })
    signalOwners.set(a.out, components.length - 1)
  }

  // ------- always @(*) blocks -------
  const starRe = /always\s*@\s*\(\s*\*\s*\)\s*(?:begin\b)?([\s\S]*?)(?=\balways\b|\bendmodule\b|$)/g
  while ((m = starRe.exec(clean)) !== null) {
    const body = m[1]
    parseAlwaysStar(body, components, signalOwners)
  }

  // ------- always @(posedge ...) blocks -------
  const seqRe = /always\s*@\s*\(\s*(?:posedge|negedge)\s+(\w+)[^)]*\)\s*(?:begin\b)?([\s\S]*?)(?=\balways\b|\bendmodule\b|$)/g
  while ((m = seqRe.exec(clean)) !== null) {
    const clk = m[1]
    const body = m[2]
    parseSequentialBlock(body, clk, components, signalOwners)
  }

  // ------- Memory arrays -------
  const memRe = /(?:reg|logic)\s*(?:\[([^\]]+)\])?\s+(\w+)\s*\[([^\]]+)\]\s*;/g
  while ((m = memRe.exec(clean)) !== null) {
    const dataRange = m[1] || '0'
    const arrName = m[2]
    const depthRange = m[3]
    // Skip non-memory reg declarations (those are matched elsewhere)
    // Detect read/write pattern
    const hasWrite = new RegExp(arrName + '\\s*\\[[^\\]]+\\]\\s*<=').test(clean)
    const hasRead = new RegExp('=\\s*' + arrName + '\\s*\\[').test(clean)
    let memKind = 'RAM'
    if (hasRead && !hasWrite) memKind = 'ROM'
    components.push({
      kind: 'MEMORY',
      memKind,
      memName: arrName,
      depth: depthRange,
      dataRange,
      inputs: memInputsFor(memKind),
      outputs: [{ name: 'dout', label: 'DOUT' }],
      source: `${memKind} ${arrName}`,
    })
  }

  if (components.length === 0) {
    // Absolute fallback — render the module interface with detailed ports
    return { kind: 'module-fallback', module: mod }
  }

  return { kind: 'flat', module: mod, components, signalOwners }
}

function memInputsFor(memKind) {
  const base = [{ name: 'addr', label: 'ADDR' }]
  if (memKind !== 'ROM') {
    base.push({ name: 'din', label: 'DIN' })
    base.push({ name: 'we', label: 'WE' })
  }
  base.push({ name: 'clk', label: 'CLK', isClock: true })
  return base
}

function parseAlwaysStar(body, components, signalOwners) {
  // Detect a case statement → ALU / MUX_BLOCK / DECODER / ENCODER / FSM
  const caseMatch = body.match(/case\s*\(\s*([\w\[\]:]+)\s*\)([\s\S]*?)endcase/)
  if (caseMatch) {
    const selVar = caseMatch[1].trim()
    const items = parseCaseItems(caseMatch[2])
    if (items.length > 0) {
      const classification = classifyCase(selVar, items)
      components.push(classification)
      for (const o of classification.outputs || []) signalOwners.set(o.name, components.length - 1)
      return
    }
  }

  // if/else inside always @(*) → MUX on the condition
  const ifElseMatch = body.match(/if\s*\(([^)]+)\)\s*(\w+)\s*=\s*([^;]+);\s*else\s*\2\s*=\s*([^;]+);/)
  if (ifElseMatch) {
    components.push({
      kind: 'MUX',
      gateType: 'MUX',
      inputs: [
        { name: cleanSig(ifElseMatch[4]), label: '0' },
        { name: cleanSig(ifElseMatch[3]), label: '1' },
      ],
      sel: cleanSig(ifElseMatch[1]),
      selLabel: 'sel',
      outputs: [{ name: ifElseMatch[2].trim(), label: ifElseMatch[2].trim() }],
      source: `always @(*) if (${ifElseMatch[1]}) ${ifElseMatch[2]} = ...`,
    })
    signalOwners.set(ifElseMatch[2].trim(), components.length - 1)
    return
  }

  // Detect priority encoder pattern: cascading if/else on individual bits
  if (/if\s*\([\w\[\]:]+\s*\[\s*\d+\s*\]\s*\)/.test(body) && /else\s+if/.test(body)) {
    // Extract the source signal
    const srcMatch = body.match(/if\s*\(\s*([\w]+)\s*\[/)
    const outMatch = body.match(/(\w+)\s*=\s*\d+\s*;/)
    const srcName = srcMatch ? srcMatch[1] : 'in'
    const outName = outMatch ? outMatch[1] : 'out'
    components.push({
      kind: 'ENCODER',
      encType: 'Priority',
      inputs: [{ name: srcName, label: 'IN' }],
      outputs: [{ name: outName, label: 'OUT' }],
      source: `priority encoder: ${srcName} → ${outName}`,
    })
    signalOwners.set(outName, components.length - 1)
    return
  }

  // Otherwise: each simple assignment in the body becomes a gate
  const assignRe = /(\w+)\s*=\s*([^;]+);/g
  let am
  while ((am = assignRe.exec(body)) !== null) {
    const q = am[1].trim()
    const d = am[2].trim()
    const op = parseExpr(d)
    if (!op) continue
    const gateKind = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'].includes(op.type)
      ? 'GATE' : op.type
    components.push({
      kind: gateKind,
      gateType: op.type,
      inputs: (op.inputs || []).map((s, i) => ({ name: s, label: String.fromCharCode(65 + i) })),
      sel: op.sel,
      selLabel: 'sel',
      outputs: [{ name: q, label: q }],
      opLabel: op.label,
      source: `always @(*) ${q} = ${d};`,
    })
    signalOwners.set(q, components.length - 1)
  }
}

function classifyCase(selVar, items) {
  // Gather all RHS per output
  const outputs = new Map()
  const opLabels = []
  const inputSet = new Set()

  for (const item of items) {
    if (item.value.toLowerCase() === 'default') continue
    const itemBody = item.body
    // Find `<out> = <rhs>;` inside the item
    const re = /(\w+)\s*(?:<=|=)\s*([^;]+);/g
    let am
    while ((am = re.exec(itemBody)) !== null) {
      const out = am[1].trim()
      const rhs = am[2].trim()
      if (!outputs.has(out)) outputs.set(out, [])
      outputs.get(out).push(rhs)
      opLabels.push(summariseOperation(rhs))
      for (const id of (rhs.match(/\b[a-zA-Z_]\w*\b/g) || [])) {
        if (id === out) continue
        // Filter keywords/constants
        if (/^(begin|end|if|else|case|endcase|posedge|negedge)$/.test(id)) continue
        if (/^\d/.test(id)) continue
        inputSet.add(id)
      }
    }
  }

  const outputNames = Array.from(outputs.keys())
  const uniqueOps = Array.from(new Set(opLabels))

  // FSM — select variable name suggests state, or RHS assigns a state-like value
  if (/^(state|cs|curr_state|next_state|nstate|pstate|ns|ps)$/i.test(selVar)) {
    return {
      kind: 'FSM',
      stateVar: selVar,
      states: items.map(i => i.value).filter(v => v.toLowerCase() !== 'default'),
      inputs: [{ name: selVar, label: 'STATE' }],
      outputs: outputNames.map(n => ({ name: n, label: n.toUpperCase() })),
      source: `case(${selVar})`,
    }
  }

  // ALU — single output with arithmetic+logic mix
  if (outputNames.length <= 2 && uniqueOps.length >= 2) {
    const arithOrLogic = uniqueOps.some(op => ['ADD', 'SUB', 'MUL', 'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR', 'SRA'].includes(op))
    if (arithOrLogic) {
      return {
        kind: 'ALU',
        sel: selVar,
        inputs: Array.from(inputSet).filter(n => n !== selVar).slice(0, 3).map(s => ({ name: s, label: s.toUpperCase() })),
        selLabel: selVar.toUpperCase(),
        selName: selVar,
        outputs: outputNames.map(n => ({ name: n, label: n.toUpperCase() })),
        operations: uniqueOps.slice(0, 8),
        source: `case(${selVar})`,
      }
    }
  }

  // Decoder — output is a one-hot or pattern of literals
  if (items.every(i => /'[bdho]/.test(i.body) || i.value.toLowerCase() === 'default')) {
    return {
      kind: 'DECODER',
      decSize: items.length,
      sel: selVar,
      inputs: [{ name: selVar, label: selVar.toUpperCase() }],
      outputs: outputNames.map(n => ({ name: n, label: n.toUpperCase() })),
      source: `case(${selVar})`,
    }
  }

  // Generic MUX block
  return {
    kind: 'MUX_BLOCK',
    sel: selVar,
    inputs: Array.from(inputSet).filter(n => n !== selVar).slice(0, 4).map(s => ({ name: s, label: s.toUpperCase() })),
    selLabel: selVar.toUpperCase(),
    selName: selVar,
    outputs: outputNames.map(n => ({ name: n, label: n.toUpperCase() })),
    source: `case(${selVar})`,
  }
}

function parseSequentialBlock(body, clk, components, signalOwners) {
  const ctx = extractTopLevelCondSignals(body)

  // ---- Inspect the block contents BEFORE classifying ----
  // Priority order:
  //   1. case + arithmetic/logic ops on a non-state selector → ALU
  //   2. case on a state-named selector → FSM
  //   3. shift-register concatenation → SHIFT_REG
  //   4. counter increment (q <= q + k) → COUNTER
  //   5. simple q <= d → DFF
  // (Per-assignment fallthrough handles 3–5.)

  const caseMatch = body.match(/case\s*\(\s*([\w\[\]:]+)\s*\)([\s\S]*?)endcase/)
  if (caseMatch) {
    const selVar = caseMatch[1].replace(/\[.*\]/, '').trim()
    const items = parseCaseItems(caseMatch[2])
    const isStateSelector = /^(state|cs|curr_state|next_state|nstate|pstate|ns|ps|cstate)$/i.test(selVar)

    if (isStateSelector) {
      // FSM: case on state register
      components.push({
        kind: 'FSM',
        stateVar: selVar,
        states: items.map(i => i.value).filter(v => v.toLowerCase() !== 'default'),
        inputs: [{ name: clk, label: 'CLK', isClock: true }, ...(ctx.hasReset ? [{ name: 'rst', label: 'RST' }] : [])],
        outputs: [{ name: selVar, label: selVar.toUpperCase() }],
        source: `always @(posedge ${clk}) case(${selVar})`,
      })
      signalOwners.set(selVar, components.length - 1)
      return
    }

    // Otherwise let the existing case classifier (ALU / DECODER / MUX_BLOCK)
    // take over — it inspects each branch's RHS for arithmetic/logic ops.
    if (items.length > 0) {
      const classification = classifyCase(selVar, items)

      // Inject CLK + RST inputs since this is in a posedge block — they are
      // not visible from the case-body alone.
      const seqInputs = [
        { name: clk, label: 'CLK', isClock: true },
        ...(ctx.hasReset ? [{ name: 'rst', label: 'RST' }] : []),
      ]
      classification.inputs = [...(classification.inputs || []), ...seqInputs]
      classification.source = `always @(posedge ${clk}) ${classification.source || `case(${selVar})`}`

      components.push(classification)
      for (const o of classification.outputs || []) {
        signalOwners.set(o.name, components.length - 1)
      }
      return
    }
  }

  const nbas = collectNBAs(body)
  if (nbas.size === 0) return

  for (const [q, d] of nbas) {
    if (isPCPattern(q, d)) {
      components.push({
        kind: 'PC',
        inputs: [
          { name: clk, label: 'CLK', isClock: true },
          ...(ctx.hasReset ? [{ name: 'rst', label: 'RST' }] : []),
          ...(ctx.hasEnable ? [{ name: 'en', label: 'EN' }] : []),
        ],
        outputs: [{ name: q, label: q.toUpperCase() }],
        delta: d.split('+')[1]?.trim() || '4',
        source: `posedge ${clk}: ${q} <= ${d}`,
      })
    } else if (isCounterPattern(q, d)) {
      const delta = d.match(/\+\s*(\w+|\d+|1'b1)/)?.[1] || '1'
      components.push({
        kind: 'COUNTER',
        inputs: [
          { name: clk, label: 'CLK', isClock: true },
          ...(ctx.hasReset ? [{ name: 'rst', label: 'RST' }] : []),
          ...(ctx.hasEnable ? [{ name: 'en', label: 'EN' }] : []),
        ],
        outputs: [{ name: q, label: q.toUpperCase() }],
        delta,
        source: `posedge ${clk}: ${q} <= ${d}`,
      })
    } else if (isShiftRegPattern(q, d)) {
      const shiftIn = extractShiftInput(q, d)
      const direction = d.indexOf(shiftIn) > d.indexOf(q) ? 'right' : 'left'
      components.push({
        kind: 'SHIFT_REG',
        inputs: [
          { name: shiftIn, label: 'DIN' },
          { name: clk, label: 'CLK', isClock: true },
          ...(ctx.hasReset ? [{ name: 'rst', label: 'RST' }] : []),
          ...(ctx.hasEnable ? [{ name: 'en', label: 'EN' }] : []),
        ],
        outputs: [{ name: q, label: 'DOUT' }],
        direction,
        source: `posedge ${clk}: ${q} <= ${d}`,
      })
    } else if (ctx.hasEnable) {
      components.push({
        kind: 'REGISTER',
        inputs: [
          { name: d, label: 'DIN' },
          { name: 'en', label: 'EN' },
          { name: clk, label: 'CLK', isClock: true },
          ...(ctx.hasReset ? [{ name: 'rst', label: 'RST' }] : []),
        ],
        outputs: [{ name: q, label: 'DOUT' }],
        source: `posedge ${clk}: ${q} <= ${d}`,
      })
    } else {
      components.push({
        kind: 'DFF',
        inputs: [
          { name: d, label: 'D' },
          { name: clk, label: 'CLK', isClock: true },
          ...(ctx.hasReset ? [{ name: 'rst', label: 'RST' }] : []),
        ],
        outputs: [{ name: q, label: 'Q' }],
        source: `posedge ${clk}: ${q} <= ${d}`,
      })
    }
    signalOwners.set(q, components.length - 1)
  }
}

// ============================================================================
// PART 7 — Block renderers
// ============================================================================

// All gate/block symbols render centered at (0, 0) inside a translated <g>.
// Each exposes a set of external pins used for wire routing. The renderer
// returns { body: <ReactNode>, pinList: [{label, x, y, side}] } where x,y are
// absolute coordinates relative to the block centre.

const ACCENT = 'var(--schematic-accent)'
const WIRE = 'var(--schematic-wire)'
const HILITE = 'var(--schematic-highlight)'
const ERR = 'var(--schematic-error)'
const MUTED = 'var(--text-dim)'

// Gate symbols are 80 × 55 so they read clearly even with 4+ gates stacked
// vertically. External pins sit at the bounding-box edges so wires terminate
// flush against the gate.
const GATE_W = 80
const GATE_H = 55

function gatePinLayout(gateType) {
  switch (gateType) {
    case 'NOT':
      return { in: [{ x: -GATE_W / 2, y: 0 }], out: { x: GATE_W / 2, y: 0 } }
    case 'MUX':
      return {
        in: [
          { x: -GATE_W / 2, y: -12 },
          { x: -GATE_W / 2, y: 12 },
          { x: 0, y: GATE_H / 2 + 10 },
        ],
        out: { x: GATE_W / 2, y: 0 },
      }
    default:
      return {
        in: [{ x: -GATE_W / 2, y: -12 }, { x: -GATE_W / 2, y: 12 }],
        out: { x: GATE_W / 2, y: 0 },
      }
  }
}

function GateGlyph({ type, label, color = ACCENT }) {
  const common = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  const stub = (x1, y1, x2, y2) => <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />
  const lx = -GATE_W / 2     // -40
  const rx = GATE_W / 2      //  40
  // All paths use a body height of ~40 (y from -20 to 20), leaving a 7.5px
  // padding inside the 55-tall bounding box.

  switch (type) {
    case 'AND': return <>
      <path d="M -32 -20 L -10 -20 A 20 20 0 0 1 -10 20 L -32 20 Z" {...common} />
      {stub(lx, -12, -32, -12)}{stub(lx, 12, -32, 12)}{stub(10, 0, rx, 0)}
    </>
    case 'NAND': return <>
      <path d="M -32 -20 L -13 -20 A 20 20 0 0 1 -13 20 L -32 20 Z" {...common} />
      <circle cx="11" cy="0" r="4" {...common} />
      {stub(lx, -12, -32, -12)}{stub(lx, 12, -32, 12)}{stub(15, 0, rx, 0)}
    </>
    case 'OR': return <>
      <path d="M -32 -20 Q -8 0 -32 20 Q -3 20 22 0 Q -3 -20 -32 -20 Z" {...common} />
      {stub(lx, -12, -25, -12)}{stub(lx, 12, -25, 12)}{stub(22, 0, rx, 0)}
    </>
    case 'NOR': return <>
      <path d="M -32 -20 Q -8 0 -32 20 Q -3 20 18 0 Q -3 -20 -32 -20 Z" {...common} />
      <circle cx="22" cy="0" r="4" {...common} />
      {stub(lx, -12, -25, -12)}{stub(lx, 12, -25, 12)}{stub(26, 0, rx, 0)}
    </>
    case 'XOR': return <>
      <path d="M -38 -20 Q -14 0 -38 20" {...common} />
      <path d="M -33 -20 Q -9 0 -33 20 Q -4 20 22 0 Q -4 -20 -33 -20 Z" {...common} />
      {stub(lx, -12, -26, -12)}{stub(lx, 12, -26, 12)}{stub(22, 0, rx, 0)}
    </>
    case 'XNOR': return <>
      <path d="M -38 -20 Q -14 0 -38 20" {...common} />
      <path d="M -33 -20 Q -9 0 -33 20 Q -4 20 18 0 Q -4 -20 -33 -20 Z" {...common} />
      <circle cx="22" cy="0" r="4" {...common} />
      {stub(lx, -12, -26, -12)}{stub(lx, 12, -26, 12)}{stub(26, 0, rx, 0)}
    </>
    case 'NOT': return <>
      <polygon points="-30,-20 18,0 -30,20" {...common} />
      <circle cx="22" cy="0" r="4" {...common} />
      {stub(lx, 0, -30, 0)}{stub(26, 0, rx, 0)}
    </>
    case 'MUX': return <>
      <polygon points="-25,-22 22,-13 22,13 -25,22" {...common} />
      <text x="-2" y="4" textAnchor="middle" fill={color}
        fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono',monospace">MUX</text>
      <text x="-21" y="-8" textAnchor="start" fill={color}
        fontSize="8" fontFamily="'JetBrains Mono',monospace">0</text>
      <text x="-21" y="17" textAnchor="start" fill={color}
        fontSize="8" fontFamily="'JetBrains Mono',monospace">1</text>
      <text x="0" y={GATE_H / 2 + 16} textAnchor="middle" fill={color}
        fontSize="9" fontFamily="'JetBrains Mono',monospace">sel</text>
      {stub(lx, -12, -25, -12)}{stub(lx, 12, -25, 12)}
      {stub(0, GATE_H / 2 + 10, 0, 22)}{stub(22, 0, rx, 0)}
    </>
    default: return (
      <>
        <rect x="-32" y="-20" width="64" height="40" rx="4" {...common} />
        <text x="0" y="5" textAnchor="middle" fill={color}
          fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono',monospace">{label || type}</text>
        {stub(lx, -12, -32, -12)}{stub(lx, 12, -32, 12)}{stub(32, 0, rx, 0)}
      </>
    )
  }
}

// All non-gate components share the same physical box: 200px wide, with a
// height that scales with the larger of input or output count.
const BLOCK_W = 200

function functionalBlockHeight(inputs, outputs, hasOps) {
  const portCount = Math.max(inputs.length, outputs.length, 1)
  // Spacing per the schematic spec: 35px between port labels for blocks,
  // dropping to 28px when more than 6 ports per side.
  const portSpacing = portCount > 6 ? 28 : 35
  const headerHeight = 35 + (hasOps ? 24 : 0)   // title + optional ops row
  const bottomPad = 20
  return Math.max(150, headerHeight + portCount * portSpacing + bottomPad)
}

/** Build an SVG path with rounded 90° corners from a list of axis-aligned
 *  polyline points. Each interior corner becomes a quadratic-Bézier with the
 *  given radius. Falls back to a straight line for 2-point inputs. */
function roundedPath(points, radius = 3) {
  if (!points || points.length === 0) return ''
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  }
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    const inLen = Math.hypot(cx - px, cy - py) || 1
    const outLen = Math.hypot(nx - cx, ny - cy) || 1
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const ex = cx - ((cx - px) * r) / inLen
    const ey = cy - ((cy - py) * r) / inLen
    const sx = cx + ((nx - cx) * r) / outLen
    const sy = cy + ((ny - cy) * r) / outLen
    d += ` L ${ex} ${ey} Q ${cx} ${cy} ${sx} ${sy}`
  }
  const last = points[points.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

/** Generic rounded-rect functional block used by every non-gate component.
 *
 *  Width is fixed at 200px. Height scales with port count (40px per port,
 *  dropping to 30px when there are more than 6 ports per side). The title
 *  sits at the top in bold, an optional `ops` row holds operation labels for
 *  ALU-like blocks, and port labels are rendered INSIDE the box (10px in
 *  from each edge) so wires terminate at the box edge cleanly with no
 *  overlap between the label and the wire/dot.
 */
function FunctionalBlock({
  title, subtitle, ops, inputs, outputs, color = ACCENT, hatch = false, extra,
}) {
  const w = BLOCK_W
  const h = functionalBlockHeight(inputs, outputs, !!ops)
  const left = -w / 2, right = w / 2, top = -h / 2, bottom = h / 2

  // Layout regions: header (title + optional ops) | port band | bottom pad.
  const headerHeight = 30 + (ops ? 22 : 0)
  const portTop = top + headerHeight
  const portBand = (bottom - 15) - portTop

  // Centre each port group within its half of the box. Inputs and outputs
  // are spaced independently so they don't have to line up.
  const inYs = inputs.map((_, i) => portTop + (portBand / (inputs.length + 1)) * (i + 1))
  const outYs = outputs.map((_, i) => portTop + (portBand / (outputs.length + 1)) * (i + 1))

  const pinsIn = inputs.map((port, i) => ({
    port, x: left, y: inYs[i], side: 'left',
  }))
  const pinsOut = outputs.map((port, i) => ({
    port, x: right, y: outYs[i], side: 'right',
  }))

  // The unique hatch-pattern id avoids duplicates when multiple memory
  // blocks render in the same SVG.
  const hatchId = hatch ? `hatch-${title}-${inputs.length}-${outputs.length}` : null

  return {
    pinList: { in: pinsIn, out: pinsOut },
    w, h,
    body: (
      <>
        {hatchId && <HatchPattern id={hatchId} color={color} />}
        <rect
          x={left} y={top} width={w} height={h} rx={6} ry={6}
          stroke={color} strokeWidth={2}
          fill={hatchId ? `url(#${hatchId})` : 'none'}
        />

        {/* Title — bold, 13px, baseline 20px below top */}
        <text x={0} y={top + 20} textAnchor="middle" fill={color}
          fontSize="13" fontWeight="700"
          fontFamily="'JetBrains Mono', monospace">
          {title}
        </text>
        {subtitle && (
          <text x={0} y={top + 34} textAnchor="middle" fill={color}
            fontSize="9" opacity="0.65"
            fontFamily="'JetBrains Mono', monospace">
            {subtitle}
          </text>
        )}

        {/* Optional operation list (ALU/MUX/decoder) — 9px, dedicated row,
            sits ABOVE the port labels so it never overlaps them. */}
        {ops && (
          <text x={0} y={top + headerHeight - 6} textAnchor="middle" fill={color}
            fontSize="9" opacity="0.85"
            fontFamily="'JetBrains Mono', monospace">
            {ops}
          </text>
        )}

        {/* Input port labels — INSIDE the box, left-aligned with 10px padding */}
        {pinsIn.map((pin, i) => (
          <g key={`pin-i-${i}`}>
            {pin.port.isClock && (
              <polyline
                points={`${left + 2},${pin.y - 4} ${left + 9},${pin.y} ${left + 2},${pin.y + 4}`}
                stroke={color} strokeWidth="1.5" fill="none" />
            )}
            <text
              x={left + (pin.port.isClock ? 14 : 10)}
              y={pin.y + 3}
              textAnchor="start"
              fill={color}
              fontSize="10"
              fontFamily="'JetBrains Mono', monospace">
              {pin.port.label}
            </text>
          </g>
        ))}

        {/* Output port labels — INSIDE the box, right-aligned with 10px padding */}
        {pinsOut.map((pin, i) => (
          <text
            key={`pin-o-${i}`}
            x={right - 10}
            y={pin.y + 3}
            textAnchor="end"
            fill={color}
            fontSize="10"
            fontFamily="'JetBrains Mono', monospace">
            {pin.port.label}
          </text>
        ))}

        {extra}
      </>
    ),
  }
}

function HatchPattern({ id, color }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="0.5" opacity="0.3" />
      </pattern>
    </defs>
  )
}

/** Pick a renderer for any component and return the JSX + pin layout. */
function renderComponent(comp, opts = {}) {
  const color = opts.hasError ? ERR : ACCENT

  switch (comp.kind) {
    case 'GATE': {
      const pins = gatePinLayout(comp.gateType)
      return {
        glyph: <GateGlyph type={comp.gateType} color={color} />,
        pinList: {
          in: (comp.inputs || []).map((port, i) => {
            const p = pins.in[i] || pins.in[0]
            return { port, x: p.x, y: p.y, side: 'left' }
          }).concat(comp.sel && pins.in.length > 2 ? [{ port: { name: comp.sel, label: 'sel' }, x: pins.in[2].x, y: pins.in[2].y, side: 'bottom' }] : []),
          out: [{ port: comp.outputs[0], x: pins.out.x, y: pins.out.y, side: 'right' }],
        },
        w: GATE_W, h: GATE_H,
        gateType: comp.gateType,
      }
    }

    case 'MUX': {
      // Ternary MUX → use the MUX glyph, with sel on bottom
      const pins = gatePinLayout('MUX')
      return {
        glyph: <GateGlyph type="MUX" color={color} />,
        pinList: {
          in: (comp.inputs || []).map((port, i) => ({
            port, x: pins.in[i]?.x || -GATE_W / 2, y: pins.in[i]?.y || 0, side: 'left',
          })).concat(comp.sel
            ? [{ port: { name: comp.sel, label: 'sel' }, x: pins.in[2].x, y: pins.in[2].y, side: 'bottom' }]
            : []),
          out: [{ port: comp.outputs[0], x: pins.out.x, y: pins.out.y, side: 'right' }],
        },
        w: GATE_W, h: GATE_H + 16,    // taller to fit the sel pin on bottom
        gateType: 'MUX',
      }
    }

    case 'DFF': {
      const block = FunctionalBlock({
        title: 'DFF', inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'REGISTER': {
      const block = FunctionalBlock({
        title: 'REG', inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'COUNTER': {
      const block = FunctionalBlock({
        title: 'CTR', subtitle: `counter (+${comp.delta || 1})`,
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'SHIFT_REG': {
      const arrow = comp.direction === 'left' ? '◀' : '▶'
      const block = FunctionalBlock({
        title: 'SHIFT REG', subtitle: `shift ${arrow}`,
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'ALU': {
      // ALU uses the same FunctionalBlock shape (200×dynamic) but adds an
      // extra input on the bottom for the OP / select signal. Operations
      // are listed in the dedicated `ops` row above the port labels.
      const opList = comp.operations || []
      const opsRow = opList.length <= 4
        ? opList.join(' | ')
        : opList.slice(0, 4).join(' | ') + ' | ...'
      const selInput = {
        name: comp.selName || comp.sel || 'sel',
        label: comp.selLabel || 'OP',
      }

      const block = FunctionalBlock({
        title: 'ALU', ops: opsRow,
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      // Add the sel pin on the bottom edge — the select signal enters
      // from below, perpendicular to the data inputs.
      const selPin = {
        port: selInput,
        x: 0, y: block.h / 2, side: 'bottom',
      }
      const selStub = (
        <g>
          <line x1={0} y1={block.h / 2 - 12} x2={0} y2={block.h / 2}
            stroke={color} strokeWidth="2" />
          <text x={0} y={block.h / 2 - 16} textAnchor="middle" fill={color}
            fontSize="10" fontFamily="'JetBrains Mono', monospace">
            {selInput.label}
          </text>
        </g>
      )
      return {
        glyph: <>{block.body}{selStub}</>,
        pinList: {
          in: [...block.pinList.in, selPin],
          out: block.pinList.out,
        },
        w: block.w, h: block.h,
      }
    }

    case 'COMPARATOR': {
      const block = FunctionalBlock({
        title: 'CMP', subtitle: 'comparator',
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'DECODER': {
      const block = FunctionalBlock({
        title: `DEC 1:${comp.decSize || 'N'}`,
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'ENCODER': {
      const block = FunctionalBlock({
        title: comp.encType ? `${comp.encType.toUpperCase()} ENC` : 'ENC',
        subtitle: 'encoder',
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'MUX_BLOCK': {
      const block = FunctionalBlock({
        title: 'MUX',
        inputs: [...comp.inputs, { name: comp.sel, label: comp.selLabel || 'SEL' }],
        outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'FSM': {
      const stateText = (comp.states || []).slice(0, 3).join(' / ')
      const block = FunctionalBlock({
        title: 'FSM', subtitle: `states: ${stateText || 'n/a'}`,
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'MEMORY': {
      const block = FunctionalBlock({
        title: comp.memKind || 'RAM',
        subtitle: `${comp.depth}×${comp.dataRange}`,
        inputs: comp.inputs, outputs: comp.outputs, color, hatch: true,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'ADD':
    case 'SUB':
    case 'MUL': {
      const glyphText = comp.kind === 'ADD' ? '+' : comp.kind === 'SUB' ? '−' : '×'
      const block = FunctionalBlock({
        title: comp.kind, ops: glyphText,
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'CMP': {
      // Single comparison (not a fused comparator block)
      const block = FunctionalBlock({
        title: 'CMP', subtitle: comp.opLabel || '==',
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'PC': {
      const block = FunctionalBlock({
        title: 'PC', subtitle: `+${comp.delta || 4}`,
        inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    case 'SIGN_EXT': {
      const block = FunctionalBlock({
        title: 'SIGN EXT', inputs: comp.inputs, outputs: comp.outputs, color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }

    default: {
      const block = FunctionalBlock({
        title: comp.kind, inputs: comp.inputs || [], outputs: comp.outputs || [], color,
      })
      return { glyph: block.body, pinList: block.pinList, w: block.w, h: block.h }
    }
  }
}

// ============================================================================
// PART 8 — Main view
// ============================================================================

export default function SchematicView({
  design,
  hasErrors = false,
  onGateClick,
  logicIssues = [],
  selectedSymbols = [],
  selectionVerdict = null,
}) {
  const parsed = useMemo(() => parseDesign(design || ''), [design])
  const [hovered, setHovered] = useState(null)
  const [hoveredSignal, setHoveredSignal] = useState(null)

  // When the editor is still showing the pre-GENERATE preview text built from
  // selected symbols, prefer the labelled-box placeholder over whatever
  // parseDesign() might salvage from the loose snippets.
  const isSelectionPreview = (design || '').includes('=== PREVIEW: click GENERATE')
  if ((!parsed || isSelectionPreview) && (selectedSymbols || []).length > 0) {
    return (
      <SelectionPreview
        symbols={selectedSymbols}
        verdict={selectionVerdict}
      />
    )
  }

  if (!parsed) {
    return (
      <PlaceholderSchematic message="Generate a design to see its schematic." />
    )
  }

  let subView
  if (parsed.kind === 'hierarchical') {
    subView = (
      <HierarchicalView
        module={parsed.module}
        template={parsed.template}
        interfaceType={parsed.interfaceType}
        hasErrors={hasErrors}
        logicIssues={logicIssues}
      />
    )
  } else if (parsed.kind === 'module-fallback') {
    subView = <ModuleFallbackView module={parsed.module} hasErrors={hasErrors} logicIssues={logicIssues} />
  } else {
    subView = (
      <FlatView
        module={parsed.module}
        components={parsed.components}
        signalOwners={parsed.signalOwners}
        hasErrors={hasErrors}
        design={design}
        onGateClick={onGateClick}
        hovered={hovered}
        setHovered={setHovered}
        hoveredSignal={hoveredSignal}
        setHoveredSignal={setHoveredSignal}
        logicIssues={logicIssues}
      />
    )
  }
  return <ZoomPanWrapper designKey={design || ''}>{subView}</ZoomPanWrapper>
}

// ---------------------------------------------------------------------------
// Zoom + pan
// ---------------------------------------------------------------------------

function roundToNearestStep(z) {
  let best = ZOOM_STEPS[0]
  let bestDist = Math.abs(z - best)
  for (const s of ZOOM_STEPS) {
    const d = Math.abs(z - s)
    if (d < bestDist) { best = s; bestDist = d }
  }
  return best
}

function nextStep(z, dir) {
  const cur = roundToNearestStep(z)
  if (dir > 0) {
    for (const s of ZOOM_STEPS) if (s > cur + 1e-6) return s
    return MAX_ZOOM
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < cur - 1e-6) return ZOOM_STEPS[i]
  }
  return MIN_ZOOM
}

const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

/**
 * Wraps a schematic sub-view with zoom + pan. Transform is
 * ``scale(zoom) translate(offsetX, offsetY)`` with origin top-left, so
 * ``offsetX/Y`` are in pre-scale (content) units. Pan deltas are converted
 * from screen pixels via division by ``zoom``.
 *
 * Persistence: zoom/offset are cached on a module-level variable so they
 * survive the unmount/remount that happens when the user clicks away from
 * the SCHEMATIC tab and back. Cache is keyed by ``designKey``; a different
 * key resets to (1, 0, 0).
 */
function ZoomPanWrapper({ designKey, children }) {
  const containerRef = useRef(null)
  const dragStartRef = useRef(null)
  const designRef = useRef(designKey)

  const [zoom, setZoom] = useState(() =>
    _persistedKey === designKey ? _persistedView.zoom : 1
  )
  const [offsetX, setOffsetX] = useState(() =>
    _persistedKey === designKey ? _persistedView.offsetX : 0
  )
  const [offsetY, setOffsetY] = useState(() =>
    _persistedKey === designKey ? _persistedView.offsetY : 0
  )
  const [isDragging, setIsDragging] = useState(false)

  // Persist on every change.
  useEffect(() => {
    _persistedView = { zoom, offsetX, offsetY }
    _persistedKey = designKey
  }, [zoom, offsetX, offsetY, designKey])

  // Reset on design change (e.g. a fresh GENERATE).
  useEffect(() => {
    if (designRef.current !== designKey) {
      designRef.current = designKey
      setZoom(1); setOffsetX(0); setOffsetY(0)
    }
  }, [designKey])

  // When zoom drops back to 100% (or below), pan offset is meaningless —
  // re-center automatically.
  useEffect(() => {
    if (zoom <= 1.0 + 1e-6) {
      if (offsetX !== 0) setOffsetX(0)
      if (offsetY !== 0) setOffsetY(0)
    }
  }, [zoom])  // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom toward a point (anchorX, anchorY) in container-local pixels.
  // Math derived from transform = scale(z) * translate(offsetX, offsetY):
  //   screen_x = z * (content_x + offsetX)
  // Keeping the same content point under the anchor after z changes gives
  //   offsetX' = offsetX + anchorX * (1/z' - 1/z)
  const zoomToward = (newZoomRaw, anchorX, anchorY) => {
    const newZoom = clampZoom(newZoomRaw)
    if (Math.abs(newZoom - zoom) < 1e-6) return
    const k = 1 / newZoom - 1 / zoom
    setOffsetX(offsetX + anchorX * k)
    setOffsetY(offsetY + anchorY * k)
    setZoom(newZoom)
  }

  const zoomTowardCenter = (dir) => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomToward(nextStep(zoom, dir), r.width / 2, r.height / 2)
  }

  const handleZoomIn = () => zoomTowardCenter(+1)
  const handleZoomOut = () => zoomTowardCenter(-1)
  const handleReset = () => {
    setZoom(1); setOffsetX(0); setOffsetY(0)
  }

  // Cmd/Ctrl + wheel = zoom toward cursor. Plain scroll falls through so the
  // browser handles it normally (no hijack).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const ax = e.clientX - r.left
      const ay = e.clientY - r.top
      const factor = e.deltaY > 0 ? 0.88 : 1.14
      zoomToward(zoom * factor, ax, ay)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, offsetX, offsetY])

  // Keyboard: + / = / - / 0. Skip when an input/textarea/contenteditable is
  // focused so we don't fight with typing.
  useEffect(() => {
    const onKey = (e) => {
      const ae = document.activeElement
      const tag = ae && ae.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable)) return
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTowardCenter(+1) }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTowardCenter(-1) }
      else if (e.key === '0') { e.preventDefault(); handleReset() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, offsetX, offsetY])  // eslint-disable-line react-hooks/exhaustive-deps

  const panEnabled = zoom > 1 + 1e-6

  const onPointerDown = (e) => {
    if (!panEnabled) return
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY }
    setIsDragging(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }
  const onPointerMove = (e) => {
    if (!isDragging || !dragStartRef.current) return
    const dx = (e.clientX - dragStartRef.current.x) / zoom
    const dy = (e.clientY - dragStartRef.current.y) / zoom
    setOffsetX(dragStartRef.current.ox + dx)
    setOffsetY(dragStartRef.current.oy + dy)
  }
  const onPointerUp = (e) => {
    if (!isDragging) return
    setIsDragging(false)
    dragStartRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', height: '100%', overflow: 'hidden' }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          height: '100%',
          width: '100%',
          transform: `scale(${zoom}) translate(${offsetX}px, ${offsetY}px)`,
          transformOrigin: 'top left',
          willChange: 'transform',
          cursor: panEnabled ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {children}
      </div>
      <ZoomControls
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
      />
    </div>
  )
}

function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset }) {
  const pct = Math.round(zoom * 100)
  return (
    <div
      // Stop the controls from also acting as a pan-drag handle.
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        zIndex: 5,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <ZoomButton label="+" title="Zoom in (+, =)" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM - 1e-6} />
      <ZoomButton label="−" title="Zoom out (-)" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM + 1e-6} />
      <ZoomButton label="1:1" title="Reset zoom (0)" onClick={onReset} disabled={Math.abs(zoom - 1) < 1e-6} small />
      <div style={{
        marginTop: '2px',
        padding: '2px 4px',
        textAlign: 'center',
        color: '#00ff41',
        fontSize: '10px',
        fontWeight: 600,
        border: '1px solid #1a4a1a',
        borderRadius: '2px',
        background: 'rgba(0, 0, 0, 0.7)',
        minWidth: '28px',
      }}>
        {pct}%
      </div>
    </div>
  )
}

function ZoomButton({ label, title, onClick, disabled, small }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: '28px',
        height: '28px',
        padding: 0,
        fontSize: small ? '10px' : '14px',
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        color: disabled ? '#3a5a3a' : '#00ff41',
        background: '#000',
        border: '1px solid #1a4a1a',
        borderRadius: '2px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.borderColor = '#00ff41'
        e.currentTarget.style.background = 'rgba(0, 255, 65, 0.10)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#1a4a1a'
        e.currentTarget.style.background = '#000'
      }}
    >
      {label}
    </button>
  )
}

// Map a logic issue to the component most likely responsible. Heuristic:
// pick the component whose source string contains an identifier from the
// issue's snippet. If no match, leave it as a "global" issue shown in the
// banner only.
function attachIssuesToComponents(components, logicIssues) {
  const perCompIssues = new Map() // component index → [issue]
  for (const issue of (logicIssues || [])) {
    const snippet = issue.snippet || ''
    let bestIdx = -1
    let bestHit = 0
    components.forEach((comp, idx) => {
      const src = (comp.source || '').toLowerCase()
      if (!src) return
      let hits = 0
      for (const tok of snippet.toLowerCase().match(/\b\w+\b/g) || []) {
        if (tok.length < 2) continue
        if (src.includes(tok)) hits++
      }
      // Also check the output names — they're often the giveaway
      for (const o of comp.outputs || []) {
        if (snippet.includes(o.name)) hits += 2
      }
      if (hits > bestHit) { bestHit = hits; bestIdx = idx }
    })
    if (bestIdx >= 0 && bestHit >= 1) {
      if (!perCompIssues.has(bestIdx)) perCompIssues.set(bestIdx, [])
      perCompIssues.get(bestIdx).push(issue)
    }
  }
  return perCompIssues
}

function severityColor(issues) {
  if (!issues || issues.length === 0) return null
  if (issues.some(it => it.severity === 'ERROR')) return 'var(--error)'
  return 'var(--warning)'
}

function IssueBanner({ logicIssues }) {
  if (!logicIssues || logicIssues.length === 0) return null
  const errors = logicIssues.filter(it => it.severity === 'ERROR')
  const warnings = logicIssues.filter(it => it.severity === 'WARNING')
  const sev = errors.length > 0 ? 'ERROR' : 'WARNING'
  const color = sev === 'ERROR' ? 'var(--error)' : 'var(--warning)'
  return (
    <div style={{
      padding: '6px 12px',
      background: sev === 'ERROR' ? 'var(--error-bg)' : 'var(--warning-bg)',
      borderBottom: `1px solid ${color}`,
      color,
      fontSize: '10px',
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '0.5px',
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 700, marginRight: '8px' }}>⚠</span>
      {errors.length} error{errors.length === 1 ? '' : 's'},
      {' '}{warnings.length} warning{warnings.length === 1 ? '' : 's'} in generated logic — see Volta Assistant for details.
    </div>
  )
}

/** Small ⚠ badge rendered just OUTSIDE the top-right corner of the
 *  component box so it never overlaps a port label or wire. */
function ComponentIssueBadge({ issues, w, h }) {
  if (!issues || issues.length === 0) return null
  const color = severityColor(issues)
  const x = (w / 2) + 10
  const y = -(h / 2) - 10
  return (
    <g>
      <title>{issues.map(it => `[${it.severity}] ${it.message}`).join('\n')}</title>
      <circle cx={x} cy={y} r="8" fill={color} />
      <text x={x} y={y + 4} textAnchor="middle"
        fill="var(--bg-primary)" fontSize="11" fontWeight="700"
        fontFamily="'JetBrains Mono', monospace" pointerEvents="none">
        !
      </text>
    </g>
  )
}

// ----------------------------- Placeholder ---------------------------------

function PlaceholderSchematic({ message }) {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', color: 'var(--text-dim)',
      fontSize: '11px', fontFamily: "'JetBrains Mono', monospace",
    }}>
      {message}
    </div>
  )
}

/**
 * Pre-generation preview: stacks each selected symbol as a labelled box so
 * the user can see what they've picked before clicking GENERATE. If the
 * verdict flags an issue (INCOMPLETE/BROKEN/RISKY), every box gets a
 * warning-colored border and a ⚠ icon, since we don't have per-symbol
 * attribution from the deterministic verdict.
 */
function SelectionPreview({ symbols, verdict }) {
  const verdictKind = verdict?.verdict
  const isIssue = verdictKind === 'INCOMPLETE' || verdictKind === 'BROKEN' || verdictKind === 'RISKY'
  const issueColor = verdictKind === 'BROKEN' ? 'var(--error, #ff4444)'
                                              : 'var(--warning, #ffaa00)'
  const boxBorder = isIssue ? `2px solid ${issueColor}` : '1px solid var(--border-primary)'
  const accent = 'var(--schematic-accent, #00cc33)'
  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-primary)',
      fontFamily: "'JetBrains Mono', monospace",
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      alignItems: 'center',
    }}>
      <div style={{
        color: 'var(--text-dim)',
        fontSize: '11px',
        fontStyle: 'italic',
        textAlign: 'center',
        marginBottom: '4px',
      }}>
        Preview — click GENERATE to wire them together
      </div>
      {verdict?.shortSummary && (
        <div style={{
          color: isIssue ? issueColor : accent,
          fontSize: '10px',
          textAlign: 'center',
          letterSpacing: '0.4px',
        }}>
          {verdict.shortSummary}
        </div>
      )}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '520px',
      }}>
        {symbols.map((sym) => (
          <div
            key={sym.id}
            style={{
              position: 'relative',
              border: boxBorder,
              borderRadius: '4px',
              background: 'var(--bg-surface)',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            {isIssue && (
              <div
                title={`${verdictKind}: ${(verdict?.reasons || [])[0] || ''}`}
                style={{
                  position: 'absolute',
                  top: '-9px',
                  right: '-9px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: issueColor,
                  color: 'var(--bg-primary)',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                !
              </div>
            )}
            <div
              style={{ width: '110px', height: '70px', flexShrink: 0 }}
              dangerouslySetInnerHTML={{
                __html: (sym.svg ? sym.svg(accent) : '').replace(
                  /<svg /,
                  '<svg style="width:100%;height:100%" preserveAspectRatio="xMidYMid meet" ',
                ),
              }}
            />
            <div style={{
              fontSize: '12px',
              color: 'var(--accent-primary, #00ff41)',
              fontWeight: 600,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              {sym.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ----------------------------- Flat view -----------------------------------

function FlatView({
  module: mod, components, signalOwners, hasErrors, design, onGateClick,
  hovered, setHovered, hoveredSignal, setHoveredSignal,
  logicIssues = [],
}) {
  const compIssueMap = useMemo(
    () => attachIssuesToComponents(components, logicIssues),
    [components, logicIssues],
  )

  // Layout columns (per the spec):
  //   - Input dots at x=60, labels right-aligned ending at x=55
  //   - Vertical input trunk at x=150 (per-signal trunks staggered 10px apart
  //     starting from there, so each signal's branch is visually distinct)
  //   - Component centres at x=400 (200-wide block → left edge x=300, right
  //     edge x=500; gates centred at the same x)
  //   - Output dots at x=750, labels left-aligned starting at x=760
  //   - SVG inner area is 900 wide, with 40px padding on each side (980 total)
  const COL_INPUT_X = 60
  const COL_INPUT_LABEL_X = 55
  const TRUNK_BASE_X = 150
  const COMP_CENTER_X = 400
  const COL_OUTPUT_X = 750
  const COL_OUTPUT_LABEL_X = 760
  const TOP_PAD = 60

  // Build a port-width lookup so external labels can show "a [3:0]" instead
  // of just "a". Clocks and resets stay as bare names.
  const portWidthByName = new Map()
  for (const p of (mod.ports || [])) portWidthByName.set(p.name, p.width)

  const formatSignal = (name, isClock) => {
    if (isClock) return name
    const w = portWidthByName.get(name)
    if (w && w > 1) return `${name} [${w - 1}:0]`
    return name
  }

  const rendered = components.map((c, i) => ({
    comp: c,
    index: i,
    render: renderComponent(c, { hasError: hasErrors }),
  }))

  // Component vertical spacing — gates need much more room than blocks:
  // 80px between bounding boxes for gates (~100px centre-to-centre at 55h),
  // and 60px for blocks. The formula `maxH + 80` gives the centre-to-centre
  // distance so the visible gap between adjacent components is at least
  // `(maxH + 80) - maxH = 80`, satisfying the spec.
  const maxH = Math.max(60, ...rendered.map(r => r.render.h || 60))
  const isGateOnly = rendered.every(r => r.render.gateType)
  const vSpacing = isGateOnly
    ? Math.max(maxH + 80, 100)        // gate-only schematic: 80px gap minimum
    : Math.max(maxH + 60, 100)        // mixed/blocks: 60px gap minimum

  // Position each component vertically along the centre column
  const layout = rendered.map((r, i) => ({
    ...r,
    cx: COMP_CENTER_X,
    cy: TOP_PAD + maxH / 2 + i * vSpacing,
  }))

  // Identify primary inputs & outputs
  const producedBy = new Map() // signal → component index
  layout.forEach((r) => {
    for (const o of r.comp.outputs || []) producedBy.set(o.name, r.index)
  })
  const primaryInputs = []
  const seenIn = new Set()
  layout.forEach((r) => {
    for (const pin of (r.render.pinList?.in || [])) {
      const n = pin.port?.name
      if (!n) continue
      if (producedBy.has(n)) continue
      if (seenIn.has(n)) continue
      seenIn.add(n)
      primaryInputs.push({ name: n, isClock: pin.port.isClock })
    }
  })
  // Pull declared module inputs that weren't referenced (clk/rst etc.)
  for (const p of mod.ports || []) {
    if (p.dir === 'input' && !seenIn.has(p.name) && !producedBy.has(p.name)) {
      seenIn.add(p.name)
      primaryInputs.push({ name: p.name })
    }
  }

  const primaryOutputs = []
  const seenOut = new Set()
  const moduleOutNames = new Set((mod.ports || []).filter(p => p.dir === 'output').map(p => p.name))
  layout.forEach((r) => {
    for (const o of r.comp.outputs || []) {
      if (!seenOut.has(o.name) && (moduleOutNames.has(o.name) || moduleOutNames.size === 0)) {
        seenOut.add(o.name)
        primaryOutputs.push({ name: o.name, gateIndex: r.index })
      }
    }
  })

  // Vertical spacing for primary inputs — 50px default, 35px when crowded
  // (more than 6 inputs), but never less. Larger spacing keeps the input
  // labels distinct so they never overlap.
  const inSpacing = primaryInputs.length > 6 ? 35 : 50
  const inputColumnHeight = Math.max(0, (primaryInputs.length - 1) * inSpacing)

  // Compute SVG size before placing inputs so we can centre them vertically.
  const componentColumnHeight = layout.length * vSpacing
  const innerHeight = Math.max(componentColumnHeight, inputColumnHeight + 80)
  const svgHeight = TOP_PAD + innerHeight + TOP_PAD
  const svgWidth = 900

  const inputColumnTop = TOP_PAD + (innerHeight - inputColumnHeight) / 2
  const inputPositions = primaryInputs.map((sig, i) => ({
    ...sig,
    x: COL_INPUT_X,
    y: inputColumnTop + i * inSpacing,
  }))
  const inputByName = new Map(inputPositions.map(p => [p.name, p]))

  // Wire routing — Manhattan style. For inputs that fan out to multiple
  // pins, draw ONE horizontal stub from the input dot, drop a vertical
  // trunk, then horizontal branches to each pin.
  const wires = []
  const junctions = []

  // Group all consuming pins per primary input so we can route them together
  const consumersByInput = new Map()  // signal → [{absX, absY, side}]
  layout.forEach((r) => {
    const pins = r.render.pinList?.in || []
    for (const pin of pins) {
      const sig = pin.port?.name
      if (!sig) continue
      if (!inputByName.has(sig)) continue
      const entry = consumersByInput.get(sig) || []
      entry.push({
        absX: r.cx + pin.x,
        absY: r.cy + pin.y,
        side: pin.side,
      })
      consumersByInput.set(sig, entry)
    }
  })

  // Each primary input gets its OWN trunk column so parallel branch wires
  // never overlap. Trunks start at x=150 and are staggered 10px apart per
  // signal — for 6 inputs that's columns at 150, 160, 170, 180, 190, 200,
  // which still leaves a generous gap to the components (centred at x=400).
  let trunkOffset = 0
  for (const [sig, consumers] of consumersByInput) {
    const src = inputByName.get(sig)
    const trunkX = TRUNK_BASE_X + trunkOffset * 10
    trunkOffset++

    // Sort consumers top-to-bottom so the trunk doesn't double back
    consumers.sort((a, b) => a.absY - b.absY)

    // 1. Per-consumer L-shape: stub from the input dot to its dedicated
    //    trunk column, then a vertical run to the consumer Y, then a
    //    horizontal branch to the pin. Combining all three legs into a
    //    single rounded path makes corners blend smoothly.
    for (const c of consumers) {
      const points = [
        [src.x + 4, src.y],
        [trunkX, src.y],
        [trunkX, c.absY],
        [c.absX, c.absY],
      ]
      wires.push({ points, signal: sig, sourceKind: 'primary' })
    }

    // 2. Junction dots where multiple consumers branch off the same trunk
    if (consumers.length >= 2) {
      for (const c of consumers) {
        junctions.push({ x: trunkX, y: c.absY })
      }
      // Also a dot at the input-end of the trunk so the tee is visible
      junctions.push({ x: trunkX, y: src.y })
    }
  }

  // Wires from intermediate signals (one component's output → another's input)
  layout.forEach((r) => {
    const pins = r.render.pinList?.in || []
    for (const pin of pins) {
      const sig = pin.port?.name
      if (!sig || inputByName.has(sig)) continue
      const srcIdx = producedBy.get(sig)
      if (srcIdx == null) continue
      const srcRender = layout[srcIdx]
      const outPin = srcRender.render.pinList?.out?.[0]
      if (!outPin) continue
      const srcX = srcRender.cx + outPin.x
      const srcY = srcRender.cy + outPin.y
      const dstX = r.cx + pin.x
      const dstY = r.cy + pin.y
      const midX = Math.max(srcX + 20, dstX - 30)
      wires.push({
        points: [[srcX, srcY], [midX, srcY], [midX, dstY], [dstX, dstY]],
        signal: sig, sourceKind: 'intermediate',
      })
    }
  })

  // Output wires to the right column
  for (const out of primaryOutputs) {
    const r = layout[out.gateIndex]
    if (!r) continue
    const outPin = r.render.pinList?.out?.[0]
    if (!outPin) continue
    const srcX = r.cx + outPin.x
    const srcY = r.cy + outPin.y
    wires.push({
      points: [[srcX, srcY], [COL_OUTPUT_X - 4, srcY]],
      signal: out.name, sourceKind: 'output', finalY: srcY,
    })
  }

  return (
    <div style={{
      height: '100%', overflow: 'auto', background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {hasErrors && <TopologyBanner />}
      <IssueBanner logicIssues={logicIssues} />

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '10px' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', maxWidth: `${svgWidth + 40}px`, height: 'auto', display: 'block', margin: '0 auto' }}
        >
          {/* Primary input dots + bit-width labels (right-aligned at COL_INPUT_LABEL_X) */}
          {inputPositions.map((p) => {
            const isHot = hoveredSignal === p.name
            const color = isHot ? HILITE : ACCENT
            return (
              <g key={`in-${p.name}`}
                 onMouseEnter={() => setHoveredSignal(p.name)}
                 onMouseLeave={() => setHoveredSignal(null)}
              >
                <circle cx={p.x} cy={p.y} r="5" fill={color} />
                <text x={COL_INPUT_LABEL_X} y={p.y + 4} textAnchor="end" fill={color}
                  fontFamily="'JetBrains Mono', monospace" fontSize="11">
                  {formatSignal(p.name, p.isClock)}
                </text>
              </g>
            )
          })}

          {/* Wires — rendered as rounded-corner SVG paths so 90° bends look
              soft rather than sharp. */}
          {wires.map((w, i) => {
            const isHot = hoveredSignal && w.signal === hoveredSignal
            const color = hasErrors ? ERR : (isHot ? HILITE : WIRE)
            return (
              <path
                key={`w-${i}`}
                d={roundedPath(w.points, 3)}
                stroke={color} strokeWidth={isHot ? 2 : 1.5} fill="none"
                strokeLinecap="round" strokeLinejoin="round"
                onMouseEnter={() => setHoveredSignal(w.signal)}
                onMouseLeave={() => setHoveredSignal(null)}
                style={{ cursor: 'pointer', transition: 'stroke 0.12s' }}
              />
            )
          })}

          {/* Junction dots — 5px filled circles for clear branch visibility */}
          {junctions.map((j, i) => (
            <circle key={`j-${i}`} cx={j.x} cy={j.y} r="5" fill={WIRE} />
          ))}

          {/* Components */}
          {layout.map((r) => {
            const issues = compIssueMap.get(r.index)
            const issueColor = severityColor(issues)
            return (
              <g key={`c-${r.index}`} transform={`translate(${r.cx}, ${r.cy})`}
                 onMouseEnter={() => setHovered(r.index)}
                 onMouseLeave={() => setHovered(null)}
                 onClick={() => {
                   if (onGateClick) {
                     const ln = issues?.[0]?.line
                       ?? findSourceLine(design || '', r.comp.source)
                     onGateClick(ln, r.comp.source)
                   }
                 }}
                 style={{ cursor: 'pointer' }}
              >
                {/* Re-tint the glyph stroke when this component carries a
                    validation issue. Wrapping in a <g> with `color` lets
                    the existing `currentColor` strokes inherit it. */}
                {issueColor ? (
                  <g style={{ color: issueColor }}>
                    {r.render.glyph}
                  </g>
                ) : (
                  r.render.glyph
                )}
                <ComponentIssueBadge
                  issues={issues}
                  w={r.render.w || 80}
                  h={r.render.h || 50}
                />
              </g>
            )
          })}

          {/* Primary output dots + bit-width labels (left-aligned at COL_OUTPUT_LABEL_X) */}
          {primaryOutputs.map((o) => {
            const r = layout[o.gateIndex]
            if (!r) return null
            const outPin = r.render.pinList?.out?.[0]
            if (!outPin) return null
            const y = r.cy + outPin.y
            const isHot = hoveredSignal === o.name
            const color = isHot ? HILITE : ACCENT
            return (
              <g key={`out-${o.name}`}
                 onMouseEnter={() => setHoveredSignal(o.name)}
                 onMouseLeave={() => setHoveredSignal(null)}
              >
                <circle cx={COL_OUTPUT_X} cy={y} r="5" fill={color} />
                <text x={COL_OUTPUT_LABEL_X} y={y + 4} textAnchor="start" fill={color}
                  fontFamily="'JetBrains Mono', monospace" fontSize="11">
                  {formatSignal(o.name, false)}
                </text>
              </g>
            )
          })}

          {/* Gate-style components get a name label centred below the symbol
              with an 8px gap, 10px font (per the spec). */}
          {layout.filter(r => r.render.gateType).map((r) => (
            <text key={`gname-${r.index}`}
              x={r.cx} y={r.cy + GATE_H / 2 + 18}
              textAnchor="middle" fill="var(--accent-secondary)"
              fontSize="10" opacity="0.9"
              fontFamily="'JetBrains Mono', monospace">
              {r.render.gateType}
            </text>
          ))}
        </svg>
      </div>

      {/* Hover tooltip */}
      {hovered !== null && layout[hovered] && (
        <TooltipBar comp={layout[hovered].comp} />
      )}
    </div>
  )
}

// ----------------------------- Hierarchical view ----------------------------

function HierarchicalView({ module: mod, template, interfaceType, hasErrors, logicIssues = [] }) {
  // ----- Geometry constants -------------------------------------------------
  const SUB_W = 150
  const SUB_H = 80
  const COL_GAP = 100              // horizontal gap between sub-block columns
  const ROW_GAP = 80               // vertical gap between sub-blocks in a column
  const INNER_PAD = 60             // padding inside the dashed boundary
  const SVG_PAD = 50               // padding from SVG edge to label area
  const LABEL_AREA = 140           // room for external port labels (per side)
  const TITLE_GAP = 36             // space above the boundary for module name
  const PORT_SPACING = 35
  const PIN_OFFSET = 18            // vertical spacing of pins on a block edge

  // ----- Logical → physical placement --------------------------------------
  const cols = Math.max(...template.subBlocks.map(b => b.col)) + 1
  const rowsPerCol = new Map()
  for (const b of template.subBlocks) {
    rowsPerCol.set(b.col, Math.max(rowsPerCol.get(b.col) || 0, b.row + 1))
  }
  const maxRows = Math.max(1, ...rowsPerCol.values())

  // Inner block region
  const blocksW = cols * SUB_W + (cols - 1) * COL_GAP
  const blocksH = maxRows * SUB_H + (maxRows - 1) * ROW_GAP

  // Boundary dimensions — at least 700×500 per the spec
  const boundaryW = Math.max(700, blocksW + INNER_PAD * 2)
  const boundaryH = Math.max(500, blocksH + INNER_PAD * 2,
    Math.max(template.externalPorts.inputs.length,
             template.externalPorts.outputs.length) * PORT_SPACING + 80)

  // SVG dimensions
  const svgW = boundaryW + LABEL_AREA * 2 + SVG_PAD * 2
  const svgH = boundaryH + TITLE_GAP + SVG_PAD * 2

  // Boundary placement inside the SVG
  const boundaryX = SVG_PAD + LABEL_AREA
  const boundaryY = SVG_PAD + TITLE_GAP

  // Centre the block grid inside the boundary
  const blocksOffsetX = boundaryX + INNER_PAD + (boundaryW - INNER_PAD * 2 - blocksW) / 2
  const blocksOffsetY = boundaryY + INNER_PAD + (boundaryH - INNER_PAD * 2 - blocksH) / 2

  const blocks = template.subBlocks.map(sb => ({
    ...sb,
    cx: blocksOffsetX + sb.col * (SUB_W + COL_GAP) + SUB_W / 2,
    cy: blocksOffsetY + sb.row * (SUB_H + ROW_GAP) + SUB_H / 2,
    w: SUB_W, h: SUB_H,
  }))
  const blockById = new Map(blocks.map(b => [b.id, b]))

  // ----- Pin allocation ----------------------------------------------------
  // For each sub-block, count the wires that terminate on its left side
  // (incoming = internal `to` + external `to`) and right side (outgoing =
  // internal `from` + external `from`). Each gets a unique vertical Y so
  // wires never stack on top of each other.
  const leftPins = new Map()       // blockId → array of consumer keys, in order
  const rightPins = new Map()
  const ensureList = (m, k) => { if (!m.has(k)) m.set(k, []); return m.get(k) }

  for (const c of template.connections) {
    ensureList(rightPins, c.from).push({ kind: 'conn', label: c.label, conn: c })
    ensureList(leftPins, c.to).push({ kind: 'conn', label: c.label, conn: c })
  }
  for (const w of template.externalWires) {
    if (w.to)   ensureList(leftPins, w.to).push({ kind: 'ext-in', port: w.port })
    if (w.from) ensureList(rightPins, w.from).push({ kind: 'ext-out', port: w.port })
  }

  /** Pin Y position on a block edge. `i` is the index in the side's list. */
  const pinY = (block, side, i, count) => {
    if (count <= 1) return block.cy
    const offset = (i - (count - 1) / 2) * PIN_OFFSET
    return block.cy + offset
  }

  // Map (blockId, side, key) → pin Y
  const pinYByKey = new Map()
  for (const [bid, list] of leftPins) {
    const block = blockById.get(bid)
    list.forEach((entry, i) => {
      const key = entry.kind === 'conn'
        ? `conn-${entry.conn.from}-${entry.conn.to}`
        : `ext-${entry.port}`
      pinYByKey.set(`${bid}|left|${key}`, pinY(block, 'left', i, list.length))
    })
  }
  for (const [bid, list] of rightPins) {
    const block = blockById.get(bid)
    list.forEach((entry, i) => {
      const key = entry.kind === 'conn'
        ? `conn-${entry.conn.from}-${entry.conn.to}`
        : `ext-${entry.port}`
      pinYByKey.set(`${bid}|right|${key}`, pinY(block, 'right', i, list.length))
    })
  }

  // ----- External port positions (outside the boundary) --------------------
  const inputs = template.externalPorts.inputs
  const outputs = template.externalPorts.outputs
  const inSpacing = inputs.length > 1
    ? Math.max(PORT_SPACING, (boundaryH - 60) / (inputs.length + 1))
    : 0
  const outSpacing = outputs.length > 1
    ? Math.max(PORT_SPACING, (boundaryH - 60) / (outputs.length + 1))
    : 0
  const inputColumnTop = boundaryY + (boundaryH - (inputs.length - 1) * inSpacing) / 2
  const outputColumnTop = boundaryY + (boundaryH - (outputs.length - 1) * outSpacing) / 2

  const inputPortByName = new Map()
  inputs.forEach((name, i) => {
    inputPortByName.set(name, { name, x: boundaryX, y: inputColumnTop + i * inSpacing })
  })
  const outputPortByName = new Map()
  outputs.forEach((name, i) => {
    outputPortByName.set(name, { name, x: boundaryX + boundaryW, y: outputColumnTop + i * outSpacing })
  })

  // ----- Wire routing ------------------------------------------------------
  // External-input wires first (port → block.left)
  // External-output wires (block.right → port)
  // Internal wires (block.right → block.left), routing over a sky-lane when
  // the source and destination columns aren't adjacent.

  const wires = []

  // Sky-lane for connections that skip columns. We pick a Y just above the
  // top row of blocks; if multiple skip-wires need the lane, they stagger.
  const skyLaneBaseY = blocksOffsetY - 28
  let skyLaneOffset = 0

  for (const w of template.externalWires) {
    if (w.to) {
      const port = inputPortByName.get(w.port)
      const block = blockById.get(w.to)
      if (!port || !block) continue
      const targetY = pinYByKey.get(`${w.to}|left|ext-${w.port}`) ?? block.cy
      const targetX = block.cx - block.w / 2
      // Each external input has its own approach lane just inside the
      // boundary so multiple inputs to the same block don't overlap.
      const laneX = boundaryX + 30 + (Array.from(inputs).indexOf(w.port) * 8)
      wires.push({
        kind: 'ext-in',
        signal: w.port,
        points: [[port.x, port.y], [laneX, port.y], [laneX, targetY], [targetX, targetY]],
      })
    } else if (w.from) {
      const port = outputPortByName.get(w.port)
      const block = blockById.get(w.from)
      if (!port || !block) continue
      const sourceY = pinYByKey.get(`${w.from}|right|ext-${w.port}`) ?? block.cy
      const sourceX = block.cx + block.w / 2
      const laneX = boundaryX + boundaryW - 30 - (Array.from(outputs).indexOf(w.port) * 8)
      wires.push({
        kind: 'ext-out',
        signal: w.port,
        points: [[sourceX, sourceY], [laneX, sourceY], [laneX, port.y], [port.x, port.y]],
      })
    }
  }

  for (const c of template.connections) {
    const from = blockById.get(c.from)
    const to   = blockById.get(c.to)
    if (!from || !to) continue
    const key = `conn-${c.from}-${c.to}`
    const fromY = pinYByKey.get(`${c.from}|right|${key}`) ?? from.cy
    const toY   = pinYByKey.get(`${c.to}|left|${key}`) ?? to.cy
    const fx = from.cx + from.w / 2
    const tx = to.cx - to.w / 2
    const colDiff = Math.abs(to.col - from.col)
    let points
    let labelPos

    if (colDiff <= 1) {
      // Adjacent columns: simple Manhattan, midX between blocks
      const midX = (fx + tx) / 2
      points = [[fx, fromY], [midX, fromY], [midX, toY], [tx, toY]]
      labelPos = { x: midX, y: ((fromY + toY) / 2) - 6 }
    } else {
      // Non-adjacent (skip a column): route over a sky lane above the row
      const lane = skyLaneBaseY - skyLaneOffset * 12
      skyLaneOffset++
      const exitX = fx + 20         // step out past `from` block
      const entryX = tx - 20        // step in toward `to` block
      points = [
        [fx, fromY],
        [exitX, fromY],
        [exitX, lane],
        [entryX, lane],
        [entryX, toY],
        [tx, toY],
      ]
      labelPos = { x: (exitX + entryX) / 2, y: lane - 6 }
    }

    wires.push({
      kind: 'internal',
      signal: c.label,
      points,
      label: c.label,
      labelPos,
    })
  }

  return (
    <div style={{
      height: '100%', overflow: 'auto', background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {hasErrors && <TopologyBanner />}
      <IssueBanner logicIssues={logicIssues} />
      <div style={{
        padding: '6px 12px', fontSize: '10px', fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.5px', color: 'var(--text-dim)',
        background: 'var(--toolbar-bg)', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        {template.label} — {mod.name}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '10px' }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', maxWidth: `${svgW + 40}px`, height: 'auto', display: 'block', margin: '0 auto' }}
        >
          {/* Module name centred ABOVE the dashed boundary, 14px bold */}
          <text
            x={boundaryX + boundaryW / 2}
            y={boundaryY - 12}
            textAnchor="middle"
            fill={ACCENT}
            fontSize="14"
            fontWeight="700"
            fontFamily="'JetBrains Mono', monospace">
            {mod.name}
          </text>
          <text
            x={boundaryX + boundaryW / 2}
            y={boundaryY - 26}
            textAnchor="middle"
            fill={ACCENT}
            fontSize="9"
            opacity="0.65"
            fontFamily="'JetBrains Mono', monospace">
            {template.label}
          </text>

          {/* Outer dashed module boundary */}
          <rect
            x={boundaryX} y={boundaryY}
            width={boundaryW} height={boundaryH}
            rx="6" ry="6"
            stroke={ACCENT} strokeWidth="1.5" strokeDasharray="6 4"
            fill="none" opacity="0.65"
          />

          {/* External input ports — labels OUTSIDE the boundary, right-aligned */}
          {inputs.map((name, i) => {
            const p = inputPortByName.get(name)
            return (
              <g key={`ext-in-${name}`}>
                <text
                  x={p.x - 12} y={p.y + 4}
                  textAnchor="end"
                  fill={ACCENT} fontSize="11"
                  fontFamily="'JetBrains Mono', monospace">
                  {name}
                </text>
                <circle cx={p.x} cy={p.y} r="5" fill={ACCENT} />
              </g>
            )
          })}

          {/* External output ports — labels OUTSIDE the boundary, left-aligned */}
          {outputs.map((name, i) => {
            const p = outputPortByName.get(name)
            return (
              <g key={`ext-out-${name}`}>
                <circle cx={p.x} cy={p.y} r="5" fill={ACCENT} />
                <text
                  x={p.x + 12} y={p.y + 4}
                  textAnchor="start"
                  fill={ACCENT} fontSize="11"
                  fontFamily="'JetBrains Mono', monospace">
                  {name}
                </text>
              </g>
            )
          })}

          {/* All wires — rendered with rounded 90° bends so corners are soft */}
          {wires.map((w, i) => (
            <path
              key={`hw-${i}`}
              d={roundedPath(w.points, 4)}
              stroke={WIRE} strokeWidth="1.5" fill="none"
              strokeLinecap="round" strokeLinejoin="round"
              opacity="0.85"
            />
          ))}

          {/* Internal-wire signal labels (positioned on the wire's most
              visible segment, with a small background plate so the label
              never gets washed out by a wire crossing behind it) */}
          {wires.filter(w => w.label && w.labelPos).map((w, i) => {
            const len = (w.label || '').length
            const padX = 4
            const plateW = len * 5.4 + padX * 2
            return (
              <g key={`hwl-${i}`}>
                <rect
                  x={w.labelPos.x - plateW / 2}
                  y={w.labelPos.y - 8}
                  width={plateW} height={11}
                  rx="2"
                  fill="var(--bg-primary)"
                  opacity="0.9" />
                <text
                  x={w.labelPos.x} y={w.labelPos.y}
                  textAnchor="middle"
                  fill={ACCENT} fontSize="9" opacity="0.95"
                  fontFamily="'JetBrains Mono', monospace">
                  {w.label}
                </text>
              </g>
            )
          })}

          {/* Sub-blocks — 150×80 with a clear title and type label */}
          {blocks.map((b) => (
            <g key={b.id} transform={`translate(${b.cx}, ${b.cy})`}>
              <rect
                x={-b.w / 2} y={-b.h / 2}
                width={b.w} height={b.h}
                rx="6" ry="6"
                stroke={ACCENT} strokeWidth="2"
                fill="var(--bg-primary)" />
              <text x="0" y="-6" textAnchor="middle"
                fill={ACCENT}
                fontSize="12" fontWeight="700"
                fontFamily="'JetBrains Mono', monospace">
                {b.label}
              </text>
              <text x="0" y="14" textAnchor="middle"
                fill={ACCENT} opacity="0.55"
                fontSize="9" fontStyle="italic"
                fontFamily="'JetBrains Mono', monospace">
                {subLabel(b.sub)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function subLabel(kind) {
  switch (kind) {
    case 'counter': return 'counter'
    case 'shift': return 'shift reg'
    case 'fsm': return 'state machine'
    case 'reg': return 'register'
    default: return ''
  }
}

// ----------------------------- Module fallback -----------------------------

function ModuleFallbackView({ module: mod, hasErrors, logicIssues = [] }) {
  // Detailed block rendering with EVERY port labelled. Never shows the plain
  // rough.js DiagramView — this is an enriched alternative.
  const inputs = (mod.ports || []).filter(p => p.dir === 'input')
  const outputs = (mod.ports || []).filter(p => p.dir === 'output' || p.dir === 'inout')
  const rowH = 22
  const bodyH = Math.max(160, 40 + Math.max(inputs.length, outputs.length) * rowH + 40)
  const W = 520, H = bodyH + 40
  const boxX = 140, boxY = 20, boxW = 240, boxH = bodyH

  return (
    <div style={{
      height: '100%', overflow: 'auto', background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {hasErrors && <TopologyBanner />}
      <IssueBanner logicIssues={logicIssues} />
      <div style={{
        padding: '6px 12px', fontSize: '10px', fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.5px', color: 'var(--text-dim)',
        background: 'var(--toolbar-bg)', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        Complex internal logic — showing detailed module interface
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '10px' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', maxWidth: `${W + 40}px`, height: 'auto', display: 'block', margin: '0 auto' }}
        >
          <HatchPattern id="fallback-hatch" color={ACCENT} />
          <rect x={boxX} y={boxY} width={boxW} height={boxH}
            rx="6" ry="6" stroke={ACCENT} strokeWidth="2"
            fill="url(#fallback-hatch)" />
          <text x={boxX + boxW / 2} y={boxY + 18} textAnchor="middle"
            fill={ACCENT} fontSize="13" fontWeight="700"
            fontFamily="'JetBrains Mono', monospace">
            {mod.name}
          </text>
          <text x={boxX + boxW / 2} y={boxY + 32} textAnchor="middle"
            fill={ACCENT} fontSize="8" opacity="0.65"
            fontFamily="'JetBrains Mono', monospace">
            Complex internal logic
          </text>

          {inputs.map((p, i) => {
            const y = boxY + 50 + i * rowH
            return (
              <g key={`fi-${p.name}`}>
                <circle cx="60" cy={y} r="3" fill={ACCENT} />
                <text x="72" y={y + 3} textAnchor="start"
                  fill={ACCENT} fontSize="10" fontFamily="'JetBrains Mono', monospace">
                  {p.name}{p.width && p.width > 1 ? ` [${p.width - 1}:0]` : ''}
                </text>
                <line x1="110" y1={y} x2={boxX} y2={y} stroke={WIRE} strokeWidth="1.5" />
              </g>
            )
          })}
          {outputs.map((p, i) => {
            const y = boxY + 50 + i * rowH
            return (
              <g key={`fo-${p.name}`}>
                <line x1={boxX + boxW} y1={y} x2={W - 110} y2={y} stroke={WIRE} strokeWidth="1.5" />
                <circle cx={W - 60} cy={y} r="3" fill={ACCENT} />
                <text x={W - 72} y={y + 3} textAnchor="end"
                  fill={ACCENT} fontSize="10" fontFamily="'JetBrains Mono', monospace">
                  {p.name}{p.width && p.width > 1 ? ` [${p.width - 1}:0]` : ''}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ----------------------------- Shared widgets ------------------------------

function TopologyBanner() {
  return (
    <div style={{
      padding: '6px 12px',
      background: 'var(--error-bg)',
      border: '1px solid var(--schematic-error)',
      color: 'var(--schematic-error)',
      fontSize: '10px', fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '0.5px', flexShrink: 0,
    }}>
      Verilog compilation error — see Volta Assistant for details
    </div>
  )
}

function TooltipBar({ comp }) {
  const tag = comp.kind === 'GATE' ? (comp.gateType || 'GATE') : comp.kind
  const src = (comp.source || '').split('\n')[0]
  return (
    <div style={{
      position: 'absolute', pointerEvents: 'none', left: 16, bottom: 16,
      padding: '6px 10px',
      background: 'var(--tooltip-bg)',
      border: '1px solid var(--border-accent)',
      borderRadius: '3px',
      color: 'var(--accent-primary)',
      fontSize: '10px', fontFamily: "'JetBrains Mono', monospace",
      boxShadow: 'var(--shadow-tooltip)',
      zIndex: 5, maxWidth: '520px',
    }}>
      <strong>{tag}</strong>: {src}
    </div>
  )
}
