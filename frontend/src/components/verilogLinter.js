/**
 * Volta — Comprehensive Verilog Linter for CodeMirror
 * Returns diagnostics with exact character ranges for wavy underlines + hover tooltips.
 *
 * Key rule: every diagnostic MUST have from < to (non-zero range) or CM won't render it.
 */

export function verilogLint(view) {
  const doc = view.state.doc
  const text = doc.toString()
  if (!text.trim()) return []

  const lines = text.split('\n')
  const diagnostics = []

  // Pre-process: strip comments for analysis
  const stripped = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

  // Helper: ensure from < to, clamp to doc length
  const diag = (from, to, severity, message) => {
    const len = text.length
    from = Math.max(0, Math.min(from, len - 1))
    to = Math.max(from + 1, Math.min(to, len))
    if (from >= to) to = from + 1
    if (to > len) { from = Math.max(0, len - 2); to = len }
    diagnostics.push({ from, to, severity, message })
  }

  // Helper: find last non-whitespace char position on a line
  const lastCharPos = (lineIdx) => {
    const lineObj = doc.line(lineIdx + 1)
    const lineText = lines[lineIdx]
    const trimEnd = lineText.trimEnd()
    if (!trimEnd) return lineObj.from
    return lineObj.from + trimEnd.length - 1
  }

  // ---- RULE 1: Missing semicolons ----
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim()
    if (!s || s.startsWith('//') || s.startsWith('`') || s.startsWith('/*')) continue

    // Declarations that must end with ; or ,
    if (/^(assign|wire|reg|integer|parameter|localparam)\b/.test(s)) {
      if (!s.endsWith(';') && !s.endsWith(',') && !s.endsWith('(') && !s.endsWith(')')) {
        if (!/^(input|output|inout)/.test(s)) {
          const pos = lastCharPos(i)
          diag(pos, pos + 1, 'error', 'Missing semicolon')
        }
      }
    }

    // Assignments: foo = bar or foo <= bar (without ;)
    if (/^\w+\s*<?=(?![=>])/.test(s) && !/^(if|else|case|for|while|assign|wire|reg|input|output|always|module|default|end|begin)/.test(s)) {
      if (!s.endsWith(';') && !s.endsWith('begin')) {
        const pos = lastCharPos(i)
        diag(pos, pos + 1, 'error', 'Missing semicolon after assignment')
      }
    }
  }

  // ---- RULE 2: Unmatched brackets ----
  const bracketStack = []
  let inStr = false, inLC = false, inBC = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1]
    if (!inBC && !inStr && ch === '/' && next === '/') { inLC = true; continue }
    if (!inBC && !inStr && ch === '/' && next === '*') { inBC = true; i++; continue }
    if (inBC && ch === '*' && next === '/') { inBC = false; i++; continue }
    if (inLC && ch === '\n') { inLC = false; continue }
    if (inLC || inBC) continue
    if (ch === '"' && !inStr) { inStr = true; continue }
    if (ch === '"' && inStr) { inStr = false; continue }
    if (inStr) {
      if (ch === '\n') {
        diag(i, i + 1, 'error', 'Unclosed string literal')
        inStr = false
      }
      continue
    }

    if ('([{'.includes(ch)) {
      bracketStack.push({ char: ch, pos: i })
    } else if (')]}'.includes(ch)) {
      const expected = ch === ')' ? '(' : ch === ']' ? '[' : '{'
      if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1].char === expected) {
        bracketStack.pop()
      } else {
        diag(i, i + 1, 'error', `Unexpected '${ch}'`)
      }
    }
  }
  for (const { char, pos } of bracketStack) {
    const closer = char === '(' ? ')' : char === '[' ? ']' : '}'
    diag(pos, pos + 1, 'error', `Unclosed '${char}' — missing '${closer}'`)
  }

  // ---- RULE 3: Unmatched blocks ----
  const blockPairs = [
    ['module', 'endmodule'], ['begin', 'end'], ['case', 'endcase'],
    ['casex', 'endcase'], ['casez', 'endcase'],
    ['function', 'endfunction'], ['task', 'endtask'],
  ]
  for (const [open, close] of blockPairs) {
    const openRe = new RegExp(`\\b${open}\\b`, 'g')
    const closeRe = new RegExp(`\\b${close}\\b`, 'g')
    const openCount = (stripped.match(openRe) || []).length
    const closeCount = (stripped.match(closeRe) || []).length
    if (openCount > closeCount) {
      // Find last unmatched open in original text
      const all = [...text.matchAll(new RegExp(`\\b${open}\\b`, 'g'))]
      if (all.length > 0) {
        const last = all[all.length - 1]
        diag(last.index, last.index + open.length, 'error', `Missing '${close}'`)
      }
    } else if (closeCount > openCount) {
      const all = [...text.matchAll(new RegExp(`\\b${close}\\b`, 'g'))]
      if (all.length > 0) {
        const last = all[all.length - 1]
        diag(last.index, last.index + close.length, 'error', `Extra '${close}' without matching '${open}'`)
      }
    }
  }

  // ---- RULE 4 & 5: Assignment type in always blocks ----
  // Track always block ranges and types
  const alwaysBlocks = []
  const alwaysRe = /always\s+@\s*\(([^)]*)\)/g
  let am
  while ((am = alwaysRe.exec(text)) !== null) {
    const sens = am[1]
    const isClocked = /posedge|negedge/.test(sens)
    // Find the extent: from 'always' to matching 'end' (rough)
    const startPos = am.index
    const lineIdx = doc.lineAt(startPos).number - 1
    alwaysBlocks.push({ type: isClocked ? 'clocked' : 'comb', startLine: lineIdx })
  }

  // For each always block, check assignments in following lines
  for (const blk of alwaysBlocks) {
    let depth = 0
    let started = false
    for (let i = blk.startLine; i < lines.length; i++) {
      const s = lines[i].trim()
      if (/^always\s/.test(s)) started = true
      if (started) {
        depth += (s.match(/\bbegin\b/g) || []).length
        depth -= (s.match(/\bend\b/g) || []).length
      }

      // Skip control flow lines
      if (/^(if|else|case|begin|end|default|\/\/|always|endcase)/.test(s)) continue

      if (blk.type === 'clocked') {
        // Blocking = in clocked (should be <=)
        const eqMatch = s.match(/^(\w+)\s*(=)(?![=>])/)
        if (eqMatch) {
          const lineObj = doc.line(i + 1)
          const eqIdx = lines[i].indexOf('=', lines[i].indexOf(eqMatch[1]) + eqMatch[1].length)
          if (eqIdx >= 0) {
            diag(lineObj.from + eqIdx, lineObj.from + eqIdx + 1, 'warning',
              "Use '<=' (non-blocking) in clocked always blocks")
          }
        }
      } else if (blk.type === 'comb') {
        // Non-blocking <= in combinational (should be =)
        const nbMatch = s.match(/^(\w+)\s*(<=)(?!=)/)
        if (nbMatch) {
          const lineObj = doc.line(i + 1)
          const nbIdx = lines[i].indexOf('<=', lines[i].indexOf(nbMatch[1]) + nbMatch[1].length)
          if (nbIdx >= 0) {
            diag(lineObj.from + nbIdx, lineObj.from + nbIdx + 2, 'warning',
              "Use '=' (blocking) in combinational always @(*) blocks")
          }
        }
      }

      // Stop after end of block
      if (started && depth <= 0 && /\bend\b/.test(s) && i > blk.startLine) break
    }
  }

  // ---- RULE 6: Duplicate signal declarations ----
  const seenDecls = new Map()
  const declFullRe = /\b(?:wire|reg|input|output|inout)\s+(?:reg\s+)?(?:wire\s+)?(?:\[\d+:\d+\]\s+)?(\w+)/g
  let ddm
  while ((ddm = declFullRe.exec(text)) !== null) {
    const name = ddm[1]
    const nameStart = ddm.index + ddm[0].length - name.length
    if (seenDecls.has(name)) {
      diag(nameStart, nameStart + name.length, 'error', `Duplicate declaration of '${name}'`)
    } else {
      seenDecls.set(name, nameStart)
    }
  }

  // ---- RULE 7: Missing default in combinational case ----
  for (const blk of alwaysBlocks) {
    if (blk.type !== 'comb') continue
    let inCase = false, hasDefault = false, caseStart = -1
    for (let i = blk.startLine; i < lines.length; i++) {
      const s = lines[i].trim()
      const caseMatch = s.match(/^case[xz]?\s*\(/)
      if (caseMatch) {
        inCase = true
        hasDefault = false
        const lineObj = doc.line(i + 1)
        caseStart = lineObj.from + lines[i].indexOf('case')
      }
      if (inCase && /^default\s*:/.test(s)) hasDefault = true
      if (inCase && s === 'endcase') {
        if (!hasDefault && caseStart >= 0) {
          diag(caseStart, caseStart + 4, 'warning', 'Missing default case in combinational case statement')
        }
        inCase = false
      }
      if (s === 'endmodule') break
    }
  }

  // ---- RULE 8: always@ typo ----
  const typoRe = /always@/g
  let tm
  while ((tm = typoRe.exec(text)) !== null) {
    diag(tm.index, tm.index + 7, 'warning', "Missing space: use 'always @' not 'always@'")
  }

  // ---- RULE 9: Invalid number base digits ----
  const numRe = /(\d+)'([bBoOdDhH])([0-9a-fA-F_xXzZ]+)/g
  let nm
  while ((nm = numRe.exec(text)) !== null) {
    const base = nm[2].toLowerCase()
    const digits = nm[3].replace(/_/g, '').toLowerCase()
    let invalid = false
    if (base === 'b') invalid = /[^01xz]/.test(digits)
    else if (base === 'o') invalid = /[^0-7xz]/.test(digits)
    else if (base === 'd') invalid = /[^0-9xz]/.test(digits)
    if (invalid) {
      const dStart = nm.index + nm[1].length + 2
      diag(dStart, dStart + nm[3].length, 'error', `Invalid digits for base '${base}': '${nm[3]}'`)
    }
  }

  // ---- RULE 10: Missing module name ----
  const mmRe = /\bmodule\s*([;(])/g
  let mmm
  while ((mmm = mmRe.exec(text)) !== null) {
    diag(mmm.index, mmm.index + 6, 'error', 'Missing module name')
  }

  // Debug: log diagnostics in development
  if (diagnostics.length > 0 && typeof console !== 'undefined') {
    console.log('[Volta Linter]', diagnostics.length, 'diagnostics:', diagnostics.map(d =>
      `${d.severity}@${d.from}-${d.to}: ${d.message}`
    ))
  }

  return diagnostics
}
