/**
 * Volta — Verilog Linter for CodeMirror
 * Returns an array of diagnostics (from, to, severity, message).
 */

const BLOCK_PAIRS = [
  ['module', 'endmodule'],
  ['begin', 'end'],
  ['case', 'endcase'],
  ['casex', 'endcase'],
  ['casez', 'endcase'],
  ['function', 'endfunction'],
  ['task', 'endtask'],
]

// Statements that should end with semicolons (line-level check)
const NEEDS_SEMICOLON = /^\s*(assign\b|wire\b|reg\b|integer\b|parameter\b|localparam\b|input\b|output\b|inout\b)/
const ALWAYS_STMT = /^\s*\w+\s*<?=\s*.+/  // foo = bar or foo <= bar

// Lines that DON'T need semicolons
const NO_SEMI = /^\s*(\/\/|module\b|endmodule|begin|end\b|else\b|if\s*\(|always\s|initial\b|case|endcase|default\s*:|`|function|endfunction|task|endtask|\s*$)/

export function verilogLint(view) {
  const doc = view.state.doc
  const text = doc.toString()
  const lines = text.split('\n')
  const diagnostics = []

  // --- 1. Missing semicolons ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimEnd()
    const stripped = trimmed.trim()

    if (!stripped || stripped.startsWith('//') || stripped.startsWith('`')) continue

    // Check declarations that need semicolons
    if (NEEDS_SEMICOLON.test(stripped)) {
      // Multi-line port declarations in module header don't need ; on each line
      // Skip if inside module(...) port list
      if (!trimmed.endsWith(';') && !trimmed.endsWith(',') && !trimmed.endsWith('(') && !trimmed.endsWith(')')) {
        // Could be a multi-line declaration — check if next line continues
        const next = i + 1 < lines.length ? lines[i + 1].trim() : ''
        if (!next.startsWith('.') && !next.startsWith(')')) {
          const from = doc.line(i + 1).from
          const to = doc.line(i + 1).to
          diagnostics.push({
            from: to - 1,
            to,
            severity: 'warning',
            message: 'Possibly missing semicolon',
          })
        }
      }
    }

    // Check assignments inside always blocks that should end with ;
    if (ALWAYS_STMT.test(stripped) && !NO_SEMI.test(stripped)) {
      if (!trimmed.endsWith(';') && !trimmed.endsWith('begin') && !trimmed.endsWith('end')) {
        const to = doc.line(i + 1).to
        diagnostics.push({
          from: to - 1,
          to,
          severity: 'error',
          message: 'Missing semicolon after assignment',
        })
      }
    }
  }

  // --- 2. Unmatched brackets/parens/braces ---
  const brackets = { '(': 0, '[': 0, '{': 0 }
  const bracketMap = { '(': ')', '[': ']', '{': '}' }
  const closerMap = { ')': '(', ']': '[', '}': '{' }
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    // Track comments
    if (!inBlockComment && ch === '/' && next === '/') { inLineComment = true; continue }
    if (!inBlockComment && ch === '/' && next === '*') { inBlockComment = true; i++; continue }
    if (inBlockComment && ch === '*' && next === '/') { inBlockComment = false; i++; continue }
    if (inLineComment && ch === '\n') { inLineComment = false; continue }
    if (inLineComment || inBlockComment) continue

    // Track string literals
    if (ch === '"') {
      i++
      while (i < text.length && text[i] !== '"' && text[i] !== '\n') i++
      continue
    }

    if (ch in brackets) brackets[ch]++
    if (ch in closerMap) {
      brackets[closerMap[ch]]--
      if (brackets[closerMap[ch]] < 0) {
        diagnostics.push({
          from: i,
          to: i + 1,
          severity: 'error',
          message: `Unexpected closing '${ch}'`,
        })
        brackets[closerMap[ch]] = 0
      }
    }
  }

  // Report unclosed brackets at end of file
  const endPos = text.length
  if (brackets['('] > 0) {
    diagnostics.push({ from: endPos - 1, to: endPos, severity: 'error', message: `${brackets['(']} unclosed parenthesis` })
  }
  if (brackets['['] > 0) {
    diagnostics.push({ from: endPos - 1, to: endPos, severity: 'error', message: `${brackets['[']} unclosed bracket` })
  }
  if (brackets['{'] > 0) {
    diagnostics.push({ from: endPos - 1, to: endPos, severity: 'error', message: `${brackets['{']} unclosed brace` })
  }

  // --- 3. Unmatched begin/end, module/endmodule, case/endcase ---
  // Use simple word-level counting (outside comments/strings)
  for (const [open, close] of BLOCK_PAIRS) {
    const openRe = new RegExp(`\\b${open}\\b`, 'g')
    const closeRe = new RegExp(`\\b${close}\\b`, 'g')

    // Strip comments for block matching
    const stripped = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const openCount = (stripped.match(openRe) || []).length
    const closeCount = (stripped.match(closeRe) || []).length

    if (openCount > closeCount) {
      diagnostics.push({
        from: endPos - 1,
        to: endPos,
        severity: 'error',
        message: `Missing '${close}' (${openCount - closeCount} unclosed '${open}')`,
      })
    } else if (closeCount > openCount) {
      diagnostics.push({
        from: endPos - 1,
        to: endPos,
        severity: 'error',
        message: `Extra '${close}' without matching '${open}'`,
      })
    }
  }

  // --- 4. Common typos ---
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim()

    // always@(...) without space
    if (/always@/.test(stripped)) {
      const col = lines[i].indexOf('always@')
      const from = doc.line(i + 1).from + col
      diagnostics.push({
        from,
        to: from + 7,
        severity: 'warning',
        message: "Missing space: 'always @' (not 'always@')",
      })
    }
  }

  return diagnostics
}
