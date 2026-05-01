import { useMemo, useState } from 'react'

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

// Canned sub-block layouts for interface modules.
const INTERFACE_TEMPLATES = {
  UART_TX: {
    label: 'UART Transmitter',
    subBlocks: [
      { id: 'baud', label: 'Baud Gen', sub: 'counter', x: 80, y: 60 },
      { id: 'fsm', label: 'FSM Control', sub: 'fsm', x: 80, y: 160 },
      { id: 'shift', label: 'Shift Reg', sub: 'shift', x: 280, y: 110 },
    ],
    connections: [
      { from: 'baud', to: 'shift', label: 'baud_tick', fromSide: 'right', toSide: 'left', toY: -10 },
      { from: 'fsm', to: 'shift', label: 'load/shift', fromSide: 'right', toSide: 'left', toY: 10 },
      { from: 'baud', to: 'fsm', label: 'tick', fromSide: 'bottom', toSide: 'top' },
    ],
    externalPorts: {
      inputs: ['clk', 'rst', 'tx_data', 'tx_en'],
      outputs: ['tx', 'tx_done'],
    },
    externalWires: [
      { port: 'clk', to: 'baud', toSide: 'left', targetY: -15 },
      { port: 'rst', to: 'fsm', toSide: 'left', targetY: -15 },
      { port: 'tx_data', to: 'shift', toSide: 'left', targetY: -25 },
      { port: 'tx_en', to: 'fsm', toSide: 'left', targetY: 15 },
      { port: 'tx', from: 'shift', fromSide: 'right' },
      { port: 'tx_done', from: 'fsm', fromSide: 'right' },
    ],
  },
  UART_RX: {
    label: 'UART Receiver',
    subBlocks: [
      { id: 'baud', label: 'Baud Gen', sub: 'counter', x: 80, y: 60 },
      { id: 'fsm', label: 'FSM Control', sub: 'fsm', x: 80, y: 160 },
      { id: 'shift', label: 'Shift Reg', sub: 'shift', x: 280, y: 110 },
    ],
    connections: [
      { from: 'baud', to: 'shift', label: 'sample', fromSide: 'right', toSide: 'left', toY: -10 },
      { from: 'fsm', to: 'shift', label: 'capture', fromSide: 'right', toSide: 'left', toY: 10 },
      { from: 'baud', to: 'fsm', label: 'tick', fromSide: 'bottom', toSide: 'top' },
    ],
    externalPorts: {
      inputs: ['clk', 'rst', 'rx'],
      outputs: ['rx_data', 'rx_valid'],
    },
    externalWires: [
      { port: 'clk', to: 'baud', toSide: 'left', targetY: -15 },
      { port: 'rst', to: 'fsm', toSide: 'left', targetY: -15 },
      { port: 'rx', to: 'shift', toSide: 'left', targetY: -25 },
      { port: 'rx_data', from: 'shift', fromSide: 'right' },
      { port: 'rx_valid', from: 'fsm', fromSide: 'right' },
    ],
  },
  SPI_MASTER: {
    label: 'SPI Master',
    subBlocks: [
      { id: 'clkgen', label: 'Clock Gen', sub: 'counter', x: 80, y: 60 },
      { id: 'fsm', label: 'FSM Control', sub: 'fsm', x: 80, y: 160 },
      { id: 'shift', label: 'Shift Reg', sub: 'shift', x: 280, y: 110 },
    ],
    connections: [
      { from: 'clkgen', to: 'shift', label: 'shift_clk', fromSide: 'right', toSide: 'left', toY: -10 },
      { from: 'fsm', to: 'shift', label: 'load', fromSide: 'right', toSide: 'left', toY: 10 },
      { from: 'clkgen', to: 'fsm', label: 'tick', fromSide: 'bottom', toSide: 'top' },
    ],
    externalPorts: {
      inputs: ['clk', 'rst', 'miso', 'tx_data', 'start'],
      outputs: ['sclk', 'mosi', 'cs', 'done'],
    },
    externalWires: [
      { port: 'clk', to: 'clkgen', toSide: 'left', targetY: -15 },
      { port: 'rst', to: 'fsm', toSide: 'left', targetY: -15 },
      { port: 'start', to: 'fsm', toSide: 'left', targetY: 15 },
      { port: 'tx_data', to: 'shift', toSide: 'left', targetY: -25 },
      { port: 'miso', to: 'shift', toSide: 'left', targetY: 25 },
      { port: 'sclk', from: 'clkgen', fromSide: 'right' },
      { port: 'mosi', from: 'shift', fromSide: 'right' },
      { port: 'cs', from: 'fsm', fromSide: 'right' },
      { port: 'done', from: 'fsm', fromSide: 'right' },
    ],
  },
  SPI_SLAVE: {
    label: 'SPI Slave',
    subBlocks: [
      { id: 'shift', label: 'Shift Reg', sub: 'shift', x: 80, y: 110 },
      { id: 'fsm', label: 'FSM Control', sub: 'fsm', x: 280, y: 160 },
      { id: 'latch', label: 'RX Latch', sub: 'reg', x: 280, y: 60 },
    ],
    connections: [
      { from: 'shift', to: 'latch', label: 'rx_word', fromSide: 'right', toSide: 'left' },
      { from: 'shift', to: 'fsm', label: 'bit_cnt', fromSide: 'right', toSide: 'left', toY: -10 },
    ],
    externalPorts: {
      inputs: ['sclk', 'mosi', 'cs'],
      outputs: ['miso', 'rx_data', 'rx_valid'],
    },
    externalWires: [
      { port: 'sclk', to: 'shift', toSide: 'left', targetY: -15 },
      { port: 'mosi', to: 'shift', toSide: 'left', targetY: 0 },
      { port: 'cs', to: 'fsm', toSide: 'left', targetY: -15 },
      { port: 'miso', from: 'shift', fromSide: 'right' },
      { port: 'rx_data', from: 'latch', fromSide: 'right' },
      { port: 'rx_valid', from: 'fsm', fromSide: 'right' },
    ],
  },
  I2C: {
    label: 'I2C Controller',
    subBlocks: [
      { id: 'clkgen', label: 'SCL Gen', sub: 'counter', x: 80, y: 60 },
      { id: 'fsm', label: 'FSM', sub: 'fsm', x: 80, y: 160 },
      { id: 'shift', label: 'Shift Reg', sub: 'shift', x: 280, y: 110 },
    ],
    connections: [
      { from: 'clkgen', to: 'shift', label: 'scl_edge', fromSide: 'right', toSide: 'left', toY: -10 },
      { from: 'fsm', to: 'shift', label: 'ack/load', fromSide: 'right', toSide: 'left', toY: 10 },
      { from: 'clkgen', to: 'fsm', label: 'tick', fromSide: 'bottom', toSide: 'top' },
    ],
    externalPorts: {
      inputs: ['clk', 'rst', 'start', 'addr', 'data_in'],
      outputs: ['scl', 'sda', 'data_out', 'done'],
    },
    externalWires: [
      { port: 'clk', to: 'clkgen', toSide: 'left', targetY: -15 },
      { port: 'rst', to: 'fsm', toSide: 'left', targetY: -15 },
      { port: 'start', to: 'fsm', toSide: 'left', targetY: 15 },
      { port: 'addr', to: 'shift', toSide: 'left', targetY: -25 },
      { port: 'data_in', to: 'shift', toSide: 'left', targetY: 0 },
      { port: 'scl', from: 'clkgen', fromSide: 'right' },
      { port: 'sda', from: 'shift', fromSide: 'right' },
      { port: 'data_out', from: 'shift', fromSide: 'right' },
      { port: 'done', from: 'fsm', fromSide: 'right' },
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

function gatePinLayout(gateType) {
  switch (gateType) {
    case 'NOT':
      return { in: [{ x: -40, y: 0 }], out: { x: 40, y: 0 } }
    case 'MUX':
      return { in: [{ x: -40, y: -15 }, { x: -40, y: 15 }, { x: 0, y: 30 }], out: { x: 40, y: 0 } }
    default:
      return { in: [{ x: -40, y: -10 }, { x: -40, y: 10 }], out: { x: 40, y: 0 } }
  }
}

function GateGlyph({ type, label, color = ACCENT }) {
  const common = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  const stub = (x1, y1, x2, y2) => <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />

  switch (type) {
    case 'AND': return <>
      <path d="M -25 -20 L -5 -20 A 20 20 0 0 1 -5 20 L -25 20 Z" {...common} />
      {stub(-40, -10, -25, -10)}{stub(-40, 10, -25, 10)}{stub(15, 0, 40, 0)}
    </>
    case 'NAND': return <>
      <path d="M -25 -20 L -8 -20 A 20 20 0 0 1 -8 20 L -25 20 Z" {...common} />
      <circle cx="15" cy="0" r="4" {...common} />
      {stub(-40, -10, -25, -10)}{stub(-40, 10, -25, 10)}{stub(19, 0, 40, 0)}
    </>
    case 'OR': return <>
      <path d="M -25 -20 Q -5 0 -25 20 Q 0 20 15 0 Q 0 -20 -25 -20 Z" {...common} />
      {stub(-40, -10, -20, -10)}{stub(-40, 10, -20, 10)}{stub(15, 0, 40, 0)}
    </>
    case 'NOR': return <>
      <path d="M -25 -20 Q -5 0 -25 20 Q 0 20 11 0 Q 0 -20 -25 -20 Z" {...common} />
      <circle cx="15" cy="0" r="4" {...common} />
      {stub(-40, -10, -20, -10)}{stub(-40, 10, -20, 10)}{stub(19, 0, 40, 0)}
    </>
    case 'XOR': return <>
      <path d="M -29 -20 Q -9 0 -29 20" {...common} />
      <path d="M -24 -20 Q -4 0 -24 20 Q 1 20 15 0 Q 1 -20 -24 -20 Z" {...common} />
      {stub(-40, -10, -19, -10)}{stub(-40, 10, -19, 10)}{stub(15, 0, 40, 0)}
    </>
    case 'XNOR': return <>
      <path d="M -29 -20 Q -9 0 -29 20" {...common} />
      <path d="M -24 -20 Q -4 0 -24 20 Q 1 20 11 0 Q 1 -20 -24 -20 Z" {...common} />
      <circle cx="15" cy="0" r="4" {...common} />
      {stub(-40, -10, -19, -10)}{stub(-40, 10, -19, 10)}{stub(19, 0, 40, 0)}
    </>
    case 'NOT': return <>
      <polygon points="-25,-20 14,0 -25,20" {...common} />
      <circle cx="18" cy="0" r="4" {...common} />
      {stub(-40, 0, -25, 0)}{stub(22, 0, 40, 0)}
    </>
    case 'MUX': return <>
      <polygon points="-22,-25 22,-15 22,15 -22,25" {...common} />
      <text x="0" y="4" textAnchor="middle" fill={color} fontSize="9" fontFamily="'JetBrains Mono',monospace">MUX</text>
      <text x="-17" y="-10" textAnchor="start" fill={color} fontSize="7" fontFamily="'JetBrains Mono',monospace">0</text>
      <text x="-17" y="18" textAnchor="start" fill={color} fontSize="7" fontFamily="'JetBrains Mono',monospace">1</text>
      <text x="0" y="38" textAnchor="middle" fill={color} fontSize="7" fontFamily="'JetBrains Mono',monospace">sel</text>
      {stub(-40, -15, -22, -15)}{stub(-40, 15, -22, 15)}{stub(0, 30, 0, 25)}{stub(22, 0, 40, 0)}
    </>
    default: return (
      <>
        <rect x="-25" y="-20" width="50" height="40" rx="2" {...common} />
        <text x="0" y="5" textAnchor="middle" fill={color} fontSize="9" fontFamily="'JetBrains Mono',monospace">{label || type}</text>
        {stub(-40, -10, -25, -10)}{stub(-40, 10, -25, 10)}{stub(25, 0, 40, 0)}
      </>
    )
  }
}

/** Generic rounded-rect functional block used by most non-gate components.
 *  Width/height adapt to input count. Returns { body, pinLayout } */
function FunctionalBlock({
  title, subtitle, inputs, outputs, color = ACCENT, w, h, hatch = false, extra,
}) {
  const common = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  const left = -w / 2, right = w / 2, top = -h / 2, bottom = h / 2

  const inCount = Math.max(1, inputs.length)
  const inStep = (h - 20) / (inCount + 1)
  const inYs = inputs.map((_, i) => top + 10 + (i + 1) * inStep)

  const outCount = Math.max(1, outputs.length)
  const outStep = (h - 20) / (outCount + 1)
  const outYs = outputs.map((_, i) => top + 10 + (i + 1) * outStep)

  const pinsIn = inputs.map((port, i) => ({
    port, x: left, y: inYs[i], side: 'left',
  }))
  const pinsOut = outputs.map((port, i) => ({
    port, x: right, y: outYs[i], side: 'right',
  }))

  return {
    pinList: { in: pinsIn, out: pinsOut },
    body: (
      <>
        {hatch && <HatchPattern id="hatch" color={color} />}
        <rect
          x={left} y={top} width={w} height={h} rx={4} ry={4}
          stroke={color} strokeWidth={2}
          fill={hatch ? 'url(#hatch)' : 'none'}
        />

        {/* Title */}
        <text x="0" y={top + 14} textAnchor="middle" fill={color}
          fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono',monospace">
          {title}
        </text>
        {subtitle && (
          <text x="0" y={top + 26} textAnchor="middle" fill={color}
            fontSize="8" fontFamily="'JetBrains Mono',monospace" opacity="0.7">
            {subtitle}
          </text>
        )}

        {/* Input pins + labels */}
        {pinsIn.map((pin, i) => (
          <g key={`in-${i}`}>
            <line x1={pin.x - 6} y1={pin.y} x2={pin.x} y2={pin.y} {...common} />
            {pin.port.isClock && (
              <polyline points={`${pin.x},${pin.y - 4} ${pin.x + 6},${pin.y} ${pin.x},${pin.y + 4}`}
                stroke={color} strokeWidth="1.5" fill="none" />
            )}
            <text x={pin.x + 8} y={pin.y + 3} textAnchor="start" fill={color}
              fontSize="8" fontFamily="'JetBrains Mono',monospace">
              {pin.port.label}
            </text>
          </g>
        ))}

        {/* Output pins + labels */}
        {pinsOut.map((pin, i) => (
          <g key={`out-${i}`}>
            <line x1={pin.x} y1={pin.y} x2={pin.x + 6} y2={pin.y} {...common} />
            <text x={pin.x - 8} y={pin.y + 3} textAnchor="end" fill={color}
              fontSize="8" fontFamily="'JetBrains Mono',monospace">
              {pin.port.label}
            </text>
          </g>
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
        w: 80, h: 50,
      }
    }

    case 'MUX': {
      // Ternary MUX → use the MUX glyph, with sel on bottom
      const pins = gatePinLayout('MUX')
      return {
        glyph: <GateGlyph type="MUX" color={color} />,
        pinList: {
          in: (comp.inputs || []).map((port, i) => ({
            port, x: pins.in[i]?.x || -40, y: pins.in[i]?.y || 0, side: 'left',
          })).concat(comp.sel
            ? [{ port: { name: comp.sel, label: 'sel' }, x: pins.in[2].x, y: pins.in[2].y, side: 'bottom' }]
            : []),
          out: [{ port: comp.outputs[0], x: pins.out.x, y: pins.out.y, side: 'right' }],
        },
        w: 80, h: 60,
      }
    }

    case 'DFF': {
      const block = FunctionalBlock({
        title: 'DFF', inputs: comp.inputs, outputs: comp.outputs, color, w: 90, h: 70,
      })
      return { glyph: block.body, pinList: block.pinList, w: 90, h: 70 }
    }

    case 'REGISTER': {
      const block = FunctionalBlock({
        title: 'REG', inputs: comp.inputs, outputs: comp.outputs, color, w: 100, h: 90,
      })
      return { glyph: block.body, pinList: block.pinList, w: 100, h: 90 }
    }

    case 'COUNTER': {
      const extra = (
        <text x="0" y="10" textAnchor="middle" fill={color}
          fontSize="9" fontFamily="'JetBrains Mono',monospace" opacity="0.8">
          +{comp.delta || 1}
        </text>
      )
      const block = FunctionalBlock({
        title: 'CTR', subtitle: 'counter', inputs: comp.inputs, outputs: comp.outputs,
        color, w: 100, h: 90, extra,
      })
      return { glyph: block.body, pinList: block.pinList, w: 100, h: 90 }
    }

    case 'SHIFT_REG': {
      const extra = (
        <text x="0" y="10" textAnchor="middle" fill={color}
          fontSize="14" fontFamily="'JetBrains Mono',monospace" opacity="0.75">
          {comp.direction === 'left' ? '◀' : '▶'}
        </text>
      )
      const block = FunctionalBlock({
        title: 'SHIFT REG', inputs: comp.inputs, outputs: comp.outputs,
        color, w: 120, h: 90, extra,
      })
      return { glyph: block.body, pinList: block.pinList, w: 120, h: 90 }
    }

    case 'ALU': {
      const opsText = (comp.operations || []).slice(0, 6).join(' | ')
      // Inputs: data inputs on left; sel on bottom
      const h = Math.max(90, 30 + (comp.inputs.length + 1) * 18)
      const w = 140
      const left = -w / 2, right = w / 2, top = -h / 2
      const dataYs = comp.inputs.map((_, i) => top + 25 + i * 18)
      const pinsIn = comp.inputs.map((port, i) => ({ port, x: left, y: dataYs[i], side: 'left' }))
      const selPin = { port: { name: comp.selName || comp.sel, label: comp.selLabel || 'OP' }, x: 0, y: top + h + 0, side: 'bottom' }
      // draw sel on the bottom
      const outY = 0
      const pinsOut = comp.outputs.map((port, i) => ({ port, x: right, y: outY + (i - (comp.outputs.length - 1) / 2) * 18, side: 'right' }))

      return {
        glyph: (
          <>
            <polygon
              points={`${left},${top} ${right - 20},${top} ${right},0 ${right - 20},${-top} ${left},${-top} ${left + 20},0`}
              stroke={color} strokeWidth="2" fill="none"
            />
            <text x="0" y={top + 16} textAnchor="middle" fill={color}
              fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono',monospace">
              ALU
            </text>
            <text x="0" y={top + 30} textAnchor="middle" fill={color}
              fontSize="7" fontFamily="'JetBrains Mono',monospace" opacity="0.75">
              {opsText}
            </text>
            {pinsIn.map((pin, i) => (
              <g key={`alu-i-${i}`}>
                <line x1={pin.x - 6} y1={pin.y} x2={pin.x} y2={pin.y} stroke={color} strokeWidth="2" />
                <text x={pin.x + 8} y={pin.y + 3} textAnchor="start" fill={color}
                  fontSize="8" fontFamily="'JetBrains Mono',monospace">{pin.port.label}</text>
              </g>
            ))}
            {pinsOut.map((pin, i) => (
              <g key={`alu-o-${i}`}>
                <line x1={pin.x} y1={pin.y} x2={pin.x + 6} y2={pin.y} stroke={color} strokeWidth="2" />
                <text x={pin.x - 8} y={pin.y + 3} textAnchor="end" fill={color}
                  fontSize="8" fontFamily="'JetBrains Mono',monospace">{pin.port.label}</text>
              </g>
            ))}
            {/* Sel pin on bottom */}
            <g>
              <line x1="0" y1={-top} x2="0" y2={-top + 8} stroke={color} strokeWidth="2" />
              <text x="0" y={-top + 18} textAnchor="middle" fill={color}
                fontSize="8" fontFamily="'JetBrains Mono',monospace">{comp.selLabel || 'OP'}</text>
            </g>
          </>
        ),
        pinList: {
          in: [...pinsIn, { port: { name: comp.selName || comp.sel || 'sel', label: 'OP' }, x: 0, y: -top, side: 'bottom' }],
          out: pinsOut,
        },
        w, h,
      }
    }

    case 'COMPARATOR': {
      const block = FunctionalBlock({
        title: 'CMP', subtitle: 'comparator',
        inputs: comp.inputs, outputs: comp.outputs,
        color, w: 110, h: Math.max(80, 20 + (comp.outputs.length + 1) * 18),
      })
      return { glyph: block.body, pinList: block.pinList, w: 110, h: Math.max(80, 20 + (comp.outputs.length + 1) * 18) }
    }

    case 'DECODER': {
      const block = FunctionalBlock({
        title: `DEC 1:${comp.decSize || 'N'}`, inputs: comp.inputs, outputs: comp.outputs,
        color, w: 110, h: Math.max(90, 20 + (comp.outputs.length + 1) * 14),
      })
      return { glyph: block.body, pinList: block.pinList, w: 110, h: Math.max(90, 20 + (comp.outputs.length + 1) * 14) }
    }

    case 'ENCODER': {
      const block = FunctionalBlock({
        title: comp.encType ? `${comp.encType.toUpperCase()} ENC` : 'ENC',
        subtitle: 'encoder',
        inputs: comp.inputs, outputs: comp.outputs, color, w: 130, h: 80,
      })
      return { glyph: block.body, pinList: block.pinList, w: 130, h: 80 }
    }

    case 'MUX_BLOCK': {
      const block = FunctionalBlock({
        title: 'MUX',
        inputs: [...comp.inputs, { name: comp.sel, label: comp.selLabel || 'SEL' }],
        outputs: comp.outputs, color, w: 110, h: Math.max(80, 20 + (comp.inputs.length + 1) * 18),
      })
      return { glyph: block.body, pinList: block.pinList, w: 110, h: Math.max(80, 20 + (comp.inputs.length + 1) * 18) }
    }

    case 'FSM': {
      const stateText = (comp.states || []).slice(0, 4).join(' / ')
      const block = FunctionalBlock({
        title: 'FSM', subtitle: `states: ${stateText || 'n/a'}`,
        inputs: comp.inputs, outputs: comp.outputs, color, w: 140, h: 90,
      })
      return { glyph: block.body, pinList: block.pinList, w: 140, h: 90 }
    }

    case 'MEMORY': {
      const block = FunctionalBlock({
        title: comp.memKind || 'RAM',
        subtitle: `${comp.depth}×${comp.dataRange}`,
        inputs: comp.inputs, outputs: comp.outputs, color, w: 120, h: 100, hatch: true,
      })
      return { glyph: block.body, pinList: block.pinList, w: 120, h: 100 }
    }

    case 'ADD':
    case 'SUB':
    case 'MUL': {
      const glyphText = comp.kind === 'ADD' ? '+' : comp.kind === 'SUB' ? '−' : '×'
      const block = FunctionalBlock({
        title: comp.kind, inputs: comp.inputs, outputs: comp.outputs, color, w: 90, h: 70,
        extra: <text x="0" y="14" textAnchor="middle" fill={color}
          fontSize="20" fontWeight="600" fontFamily="'JetBrains Mono',monospace">{glyphText}</text>,
      })
      return { glyph: block.body, pinList: block.pinList, w: 90, h: 70 }
    }

    case 'CMP': {
      // Single comparison (not a fused comparator block)
      const block = FunctionalBlock({
        title: 'CMP', subtitle: comp.opLabel || '==',
        inputs: comp.inputs, outputs: comp.outputs, color, w: 90, h: 70,
      })
      return { glyph: block.body, pinList: block.pinList, w: 90, h: 70 }
    }

    case 'PC': {
      const block = FunctionalBlock({
        title: 'PC', subtitle: `+${comp.delta || 4}`,
        inputs: comp.inputs, outputs: comp.outputs, color, w: 90, h: 80,
      })
      return { glyph: block.body, pinList: block.pinList, w: 90, h: 80 }
    }

    case 'SIGN_EXT': {
      const block = FunctionalBlock({
        title: 'SIGN EXT', inputs: comp.inputs, outputs: comp.outputs, color, w: 100, h: 60,
      })
      return { glyph: block.body, pinList: block.pinList, w: 100, h: 60 }
    }

    default: {
      const block = FunctionalBlock({
        title: comp.kind, inputs: comp.inputs || [], outputs: comp.outputs || [], color, w: 100, h: 80,
      })
      return { glyph: block.body, pinList: block.pinList, w: 100, h: 80 }
    }
  }
}

// ============================================================================
// PART 8 — Main view
// ============================================================================

export default function SchematicView({ design, hasErrors = false, onGateClick, logicIssues = [] }) {
  const parsed = useMemo(() => parseDesign(design || ''), [design])
  const [hovered, setHovered] = useState(null)
  const [hoveredSignal, setHoveredSignal] = useState(null)

  if (!parsed) {
    return (
      <PlaceholderSchematic message="Generate a design to see its schematic." />
    )
  }

  if (parsed.kind === 'hierarchical') {
    return (
      <HierarchicalView
        module={parsed.module}
        template={parsed.template}
        interfaceType={parsed.interfaceType}
        hasErrors={hasErrors}
        logicIssues={logicIssues}
      />
    )
  }

  if (parsed.kind === 'module-fallback') {
    return <ModuleFallbackView module={parsed.module} hasErrors={hasErrors} logicIssues={logicIssues} />
  }

  return (
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

/** Small ⚠ badge rendered on top of a component when issues are attached. */
function ComponentIssueBadge({ issues, w, h }) {
  if (!issues || issues.length === 0) return null
  const color = severityColor(issues)
  const x = (w / 2) - 8
  const y = -(h / 2) + 2
  return (
    <g>
      <title>{issues.map(it => `[${it.severity}] ${it.message}`).join('\n')}</title>
      <circle cx={x} cy={y} r="7" fill={color} />
      <text x={x} y={y + 3} textAnchor="middle"
        fill="var(--bg-primary)" fontSize="9" fontWeight="700"
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
  const COL_INPUT_X = 80
  const COL_COMP_X = 320
  const COL_OUTPUT_X = 560
  const TOP_PAD = 50

  const rendered = components.map((c, i) => ({ comp: c, index: i, render: renderComponent(c, { hasError: hasErrors }) }))
  const maxH = Math.max(60, ...rendered.map(r => r.render.h || 60))
  const vSpacing = Math.max(maxH + 24, 90)

  // Position each component vertically along the centre column
  const layout = rendered.map((r, i) => ({
    ...r,
    cx: COL_COMP_X,
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
      primaryInputs.push({ name: n, label: pin.port.label || n, isClock: pin.port.isClock })
    }
  })
  // Also pull declared module inputs that weren't referenced (for clk/rst etc.)
  for (const p of mod.ports || []) {
    if (p.dir === 'input' && !seenIn.has(p.name) && !producedBy.has(p.name)) {
      seenIn.add(p.name)
      primaryInputs.push({ name: p.name, label: p.name })
    }
  }

  const primaryOutputs = []
  const seenOut = new Set()
  // Any output from a component that is also a module output, or an
  // unconsumed output, shows on the right column.
  const moduleOutNames = new Set((mod.ports || []).filter(p => p.dir === 'output').map(p => p.name))
  layout.forEach((r) => {
    for (const o of r.comp.outputs || []) {
      if (!seenOut.has(o.name) && (moduleOutNames.has(o.name) || moduleOutNames.size === 0)) {
        seenOut.add(o.name)
        primaryOutputs.push({ name: o.name, label: o.label || o.name, gateIndex: r.index })
      }
    }
  })

  // Compute SVG size
  const svgWidth = COL_OUTPUT_X + 80
  const svgHeight = Math.max(280, TOP_PAD + layout.length * vSpacing + 50, TOP_PAD + primaryInputs.length * 30 + 50)

  // Primary input vertical spacing
  const inYSpacing = primaryInputs.length > 1
    ? Math.min(34, (svgHeight - TOP_PAD * 2) / (primaryInputs.length))
    : 0
  const inputPositions = primaryInputs.map((sig, i) => ({
    ...sig,
    x: COL_INPUT_X,
    y: TOP_PAD + 10 + i * inYSpacing,
  }))
  const inputByName = new Map(inputPositions.map(p => [p.name, p]))

  // Wire routing
  const wires = []
  const junctions = []
  const branchCount = new Map()
  primaryInputs.forEach(p => branchCount.set(p.name, 0))

  layout.forEach((r) => {
    const pins = r.render.pinList?.in || []
    for (const pin of pins) {
      const sig = pin.port?.name
      if (!sig) continue
      const pinAbsX = r.cx + pin.x
      const pinAbsY = r.cy + pin.y

      if (inputByName.has(sig)) {
        const src = inputByName.get(sig)
        const bi = branchCount.get(sig) || 0
        branchCount.set(sig, bi + 1)
        const busX = COL_INPUT_X + 40 + bi * 8
        let points
        if (pin.side === 'bottom') {
          points = [
            [src.x + 6, src.y],
            [busX, src.y],
            [busX, pinAbsY + 15],
            [pinAbsX, pinAbsY + 15],
            [pinAbsX, pinAbsY],
          ]
        } else {
          points = [
            [src.x + 6, src.y],
            [busX, src.y],
            [busX, pinAbsY],
            [pinAbsX, pinAbsY],
          ]
        }
        wires.push({ points, signal: sig, sourceKind: 'primary' })
        if (bi >= 1) junctions.push({ x: src.x + 6, y: src.y })
      } else {
        const srcIdx = producedBy.get(sig)
        if (srcIdx == null) continue
        const srcRender = layout[srcIdx]
        const outPin = srcRender.render.pinList?.out?.[0]
        if (!outPin) continue
        const srcX = srcRender.cx + outPin.x
        const srcY = srcRender.cy + outPin.y
        const midX = Math.max(srcX + 20, pinAbsX - 30)
        wires.push({
          points: [
            [srcX, srcY],
            [midX, srcY],
            [midX, pinAbsY],
            [pinAbsX, pinAbsY],
          ],
          signal: sig, sourceKind: 'intermediate',
        })
      }
    }
  })

  // Output wires to right column
  for (const out of primaryOutputs) {
    const r = layout[out.gateIndex]
    if (!r) continue
    const outPin = r.render.pinList?.out?.[0]
    if (!outPin) continue
    const srcX = r.cx + outPin.x
    const srcY = r.cy + outPin.y
    wires.push({
      points: [[srcX, srcY], [COL_OUTPUT_X - 6, srcY], [COL_OUTPUT_X - 6, srcY]],
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
          style={{ width: '100%', maxWidth: `${svgWidth + 40}px`, height: 'auto', display: 'block', margin: '0 auto' }}
        >
          {/* Primary inputs */}
          {inputPositions.map((p) => {
            const isHot = hoveredSignal === p.name
            const color = isHot ? HILITE : ACCENT
            return (
              <g key={`in-${p.name}`}
                 onMouseEnter={() => setHoveredSignal(p.name)}
                 onMouseLeave={() => setHoveredSignal(null)}
              >
                <circle cx={p.x} cy={p.y} r="3" fill={color} />
                <text x={p.x - 8} y={p.y + 4} textAnchor="end" fill={color}
                  fontFamily="'JetBrains Mono', monospace" fontSize="10">
                  {p.label}
                </text>
              </g>
            )
          })}

          {/* Wires */}
          {wires.map((w, i) => {
            const isHot = hoveredSignal && w.signal === hoveredSignal
            const color = hasErrors ? ERR : (isHot ? HILITE : WIRE)
            return (
              <polyline
                key={`w-${i}`}
                points={w.points.map(pp => pp.join(',')).join(' ')}
                stroke={color} strokeWidth={isHot ? 2 : 1.5} fill="none"
                onMouseEnter={() => setHoveredSignal(w.signal)}
                onMouseLeave={() => setHoveredSignal(null)}
                style={{ cursor: 'pointer', transition: 'stroke 0.12s' }}
              />
            )
          })}

          {/* Junction dots */}
          {junctions.map((j, i) => (
            <circle key={`j-${i}`} cx={j.x} cy={j.y} r="2.2" fill={WIRE} />
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

          {/* Primary outputs */}
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
                <circle cx={COL_OUTPUT_X} cy={y} r="3" fill={color} />
                <text x={COL_OUTPUT_X + 8} y={y + 4} textAnchor="start" fill={color}
                  fontFamily="'JetBrains Mono', monospace" fontSize="10">
                  {o.label}
                </text>
              </g>
            )
          })}
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
  const W = 620, H = 460
  const OUTER_PAD_L = 170
  const OUTER_PAD_R = 160
  const OUTER_PAD_T = 40
  const OUTER_PAD_B = 40

  const outerLeft = OUTER_PAD_L
  const outerTop = OUTER_PAD_T
  const outerRight = W - OUTER_PAD_R
  const outerBottom = H - OUTER_PAD_B

  const subBlockSize = { w: 110, h: 60 }

  // Place each sub-block; positions in the template are relative to the outer rect
  const blocks = template.subBlocks.map(sb => ({
    ...sb,
    cx: outerLeft + sb.x + subBlockSize.w / 2,
    cy: outerTop + sb.y + subBlockSize.h / 2,
    w: subBlockSize.w, h: subBlockSize.h,
  }))
  const blockById = new Map(blocks.map(b => [b.id, b]))

  const leftPortsY = template.externalPorts.inputs.map((_, i, arr) =>
    outerTop + (H - OUTER_PAD_T - OUTER_PAD_B) * ((i + 1) / (arr.length + 1))
  )
  const rightPortsY = template.externalPorts.outputs.map((_, i, arr) =>
    outerTop + (H - OUTER_PAD_T - OUTER_PAD_B) * ((i + 1) / (arr.length + 1))
  )

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
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', maxWidth: `${W + 40}px`, height: 'auto', display: 'block', margin: '0 auto' }}
        >
          {/* Outer dashed module boundary */}
          <rect
            x={outerLeft} y={outerTop} width={outerRight - outerLeft} height={outerBottom - outerTop}
            rx="6" ry="6"
            stroke={ACCENT} strokeWidth="1.5" strokeDasharray="6 4"
            fill="none" opacity="0.7"
          />
          <text x={(outerLeft + outerRight) / 2} y={outerTop - 8} textAnchor="middle"
            fill={ACCENT} fontSize="11" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
            {mod.name}
          </text>

          {/* Left (input) ports */}
          {template.externalPorts.inputs.map((name, i) => (
            <g key={`ext-in-${i}`}>
              <circle cx="30" cy={leftPortsY[i]} r="3" fill={ACCENT} />
              <text x="42" y={leftPortsY[i] + 3} textAnchor="start"
                fill={ACCENT} fontSize="10" fontFamily="'JetBrains Mono', monospace">
                {name}
              </text>
            </g>
          ))}

          {/* Right (output) ports */}
          {template.externalPorts.outputs.map((name, i) => (
            <g key={`ext-out-${i}`}>
              <circle cx={W - 30} cy={rightPortsY[i]} r="3" fill={ACCENT} />
              <text x={W - 42} y={rightPortsY[i] + 3} textAnchor="end"
                fill={ACCENT} fontSize="10" fontFamily="'JetBrains Mono', monospace">
                {name}
              </text>
            </g>
          ))}

          {/* External wires from module ports to sub-blocks */}
          {template.externalWires.map((w, i) => {
            let points
            if (w.port && w.to) {
              const portIdx = template.externalPorts.inputs.indexOf(w.port)
              if (portIdx < 0) return null
              const srcY = leftPortsY[portIdx]
              const block = blockById.get(w.to)
              if (!block) return null
              const targetY = block.cy + (w.targetY || 0)
              const targetX = block.cx - block.w / 2
              points = [[30 + 4, srcY], [outerLeft - 20, srcY], [outerLeft - 20, targetY], [targetX, targetY]]
            } else if (w.port && w.from) {
              const portIdx = template.externalPorts.outputs.indexOf(w.port)
              if (portIdx < 0) return null
              const dstY = rightPortsY[portIdx]
              const block = blockById.get(w.from)
              if (!block) return null
              const srcY = block.cy
              const srcX = block.cx + block.w / 2
              points = [[srcX, srcY], [outerRight + 20, srcY], [outerRight + 20, dstY], [W - 30 - 4, dstY]]
            } else {
              return null
            }
            return (
              <polyline key={`extw-${i}`}
                points={points.map(pp => pp.join(',')).join(' ')}
                stroke={WIRE} strokeWidth="1.5" fill="none"
              />
            )
          })}

          {/* Internal wires between sub-blocks */}
          {template.connections.map((c, i) => {
            const from = blockById.get(c.from)
            const to = blockById.get(c.to)
            if (!from || !to) return null
            let fx, fy, tx, ty
            if (c.fromSide === 'right') { fx = from.cx + from.w / 2; fy = from.cy + (c.fromY || 0) }
            else if (c.fromSide === 'bottom') { fx = from.cx; fy = from.cy + from.h / 2 }
            else if (c.fromSide === 'top') { fx = from.cx; fy = from.cy - from.h / 2 }
            else { fx = from.cx - from.w / 2; fy = from.cy + (c.fromY || 0) }

            if (c.toSide === 'left') { tx = to.cx - to.w / 2; ty = to.cy + (c.toY || 0) }
            else if (c.toSide === 'top') { tx = to.cx; ty = to.cy - to.h / 2 }
            else if (c.toSide === 'bottom') { tx = to.cx; ty = to.cy + to.h / 2 }
            else { tx = to.cx + to.w / 2; ty = to.cy + (c.toY || 0) }

            // Manhattan route
            const midX = (c.fromSide === 'right' || c.toSide === 'left')
              ? Math.max(fx + 20, tx - 20)
              : (fx + tx) / 2
            let points
            if (c.fromSide === 'bottom' && c.toSide === 'top') {
              const midY = (fy + ty) / 2
              points = [[fx, fy], [fx, midY], [tx, midY], [tx, ty]]
            } else {
              points = [[fx, fy], [midX, fy], [midX, ty], [tx, ty]]
            }
            return (
              <g key={`iw-${i}`}>
                <polyline
                  points={points.map(pp => pp.join(',')).join(' ')}
                  stroke={WIRE} strokeWidth="1.5" fill="none"
                />
                {c.label && (
                  <text
                    x={(midX || (fx + tx) / 2)}
                    y={((fy + ty) / 2) - 4}
                    textAnchor="middle"
                    fill={ACCENT} fontSize="8" opacity="0.7"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {c.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Sub-blocks */}
          {blocks.map((b) => (
            <g key={b.id} transform={`translate(${b.cx}, ${b.cy})`}>
              <rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h}
                rx="4" ry="4" stroke={ACCENT} strokeWidth="2" fill="none" />
              <text x="0" y="-5" textAnchor="middle" fill={ACCENT}
                fontSize="10" fontWeight="600" fontFamily="'JetBrains Mono', monospace">
                {b.label}
              </text>
              <text x="0" y="10" textAnchor="middle" fill={ACCENT}
                fontSize="8" opacity="0.6" fontFamily="'JetBrains Mono', monospace">
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
      Circuit topology error — see Volta Assistant for details
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
