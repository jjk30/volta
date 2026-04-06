/**
 * Volta — Comprehensive Verilog Linter for CodeMirror
 * Returns diagnostics with exact character ranges for hover-only tooltips.
 */

export function verilogLint(view) {
  const doc = view.state.doc
  const text = doc.toString()
  const lines = text.split('\n')
  const diagnostics = []

  // Pre-process: strip comments for analysis
  const stripped = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

  // Collect all declared identifiers with their positions
  const declared = new Map() // name -> { line, from, width }
  const portListMatch = text.match(/module\s+\w+\s*\(([\s\S]*?)\)\s*;/)
  if (portListMatch) {
    const portRe = /(?:input|output|inout)\s+(?:reg\s+)?(?:wire\s+)?(?:\[\d+:\d+\]\s+)?(\w+)/g
    let m
    while ((m = portRe.exec(portListMatch[1])) !== null) {
      declared.set(m[1], { type: 'port' })
    }
  }
  // Internal wire/reg declarations
  const declRe = /(?:wire|reg|integer)\s+(?:\[\d+:\d+\]\s+)?(\w+)/g
  let dm
  while ((dm = declRe.exec(stripped)) !== null) {
    const name = dm[1]
    if (!declared.has(name)) {
      declared.set(name, { type: 'internal' })
    }
  }

  // Track always block types for assignment checking
  const alwaysBlocks = [] // { type: 'clocked' | 'comb', startLine, endLine }
  let blockStack = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    // Detect always block type
    const alwaysMatch = trimmed.match(/always\s+@\s*\(([^)]*)\)/)
    if (alwaysMatch) {
      const sens = alwaysMatch[1]
      const isClocked = /posedge|negedge/.test(sens)
      blockStack.push({ type: isClocked ? 'clocked' : 'comb', startLine: i })
    }
    if (trimmed === 'end' || trimmed.startsWith('end ') || trimmed === 'end;') {
      if (blockStack.length > 0) {
        const blk = blockStack.pop()
        blk.endLine = i
        alwaysBlocks.push(blk)
      }
    }
  }

  // ---- RULE 1: Missing semicolons ----
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimEnd()
    const s = trimmed.trim()
    if (!s || s.startsWith('//') || s.startsWith('`') || s.startsWith('/*')) continue

    const lineObj = doc.line(i + 1)

    // Declarations that must end with ; or ,
    if (/^\s*(assign|wire|reg|integer|parameter|localparam)\b/.test(s)) {
      if (!s.endsWith(';') && !s.endsWith(',') && !s.endsWith('(') && !s.endsWith(')')) {
        // Check it's not a module port list continuation
        if (!/^\s*(input|output|inout)/.test(s)) {
          diagnostics.push({
            from: lineObj.to,
            to: lineObj.to,
            severity: 'error',
            message: 'Missing semicolon',
          })
        }
      }
    }

    // Assignments in always blocks: foo = bar or foo <= bar (without ;)
    if (/^\s*\w+\s*<?=(?![=>])/.test(s) && !/^\s*(if|else|case|for|while|assign|wire|reg|input|output|always|module|default)/.test(s)) {
      if (!s.endsWith(';') && !s.endsWith('begin')) {
        diagnostics.push({
          from: lineObj.to,
          to: lineObj.to,
          severity: 'error',
          message: 'Missing semicolon after assignment',
        })
      }
    }
  }

  // ---- RULE 2: Unmatched brackets ----
  const bracketStack = [] // { char, pos }
  let inStr = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (!inBlockComment && !inStr && ch === '/' && next === '/') { inLineComment = true; continue }
    if (!inBlockComment && !inStr && ch === '/' && next === '*') { inBlockComment = true; i++; continue }
    if (inBlockComment && ch === '*' && next === '/') { inBlockComment = false; i++; continue }
    if (inLineComment && ch === '\n') { inLineComment = false; continue }
    if (inLineComment || inBlockComment) continue

    if (ch === '"' && !inStr) { inStr = true; continue }
    if (ch === '"' && inStr) { inStr = false; continue }
    if (inStr) {
      if (ch === '\n') {
        diagnostics.push({ from: i, to: i + 1, severity: 'error', message: 'Unclosed string literal' })
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
        diagnostics.push({ from: i, to: i + 1, severity: 'error', message: `Unexpected '${ch}'` })
      }
    }
  }

  for (const { char, pos } of bracketStack) {
    const closer = char === '(' ? ')' : char === '[' ? ']' : '}'
    diagnostics.push({ from: pos, to: pos + 1, severity: 'error', message: `Unclosed '${char}' — missing '${closer}'` })
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
    const openMatches = [...stripped.matchAll(openRe)]
    const closeMatches = [...stripped.matchAll(closeRe)]

    if (openMatches.length > closeMatches.length) {
      // Find the last unmatched open in the original text
      const allOpen = [...text.matchAll(new RegExp(`\\b${open}\\b`, 'g'))]
      const lastOpen = allOpen[allOpen.length - 1]
      if (lastOpen) {
        diagnostics.push({
          from: lastOpen.index,
          to: lastOpen.index + open.length,
          severity: 'error',
          message: `Missing '${close}'`,
        })
      }
    } else if (closeMatches.length > openMatches.length) {
      const allClose = [...text.matchAll(new RegExp(`\\b${close}\\b`, 'g'))]
      const lastClose = allClose[allClose.length - 1]
      if (lastClose) {
        diagnostics.push({
          from: lastClose.index,
          to: lastClose.index + close.length,
          severity: 'error',
          message: `Extra '${close}' without matching '${open}'`,
        })
      }
    }
  }

  // ---- RULE 4: Blocking = in clocked always (should be <=) ----
  for (const blk of alwaysBlocks) {
    if (blk.type !== 'clocked') continue
    for (let i = blk.startLine; i <= (blk.endLine || lines.length - 1) && i < lines.length; i++) {
      const s = lines[i].trim()
      if (/^\s*(if|else|case|begin|end|default|\/\/)/.test(s)) continue
      // Match: identifier = expr; but not <=, ==, !=, >=
      const m = lines[i].match(/(\w+)\s*(=)(?![=>])/)
      if (m && m.index !== undefined) {
        const lineObj = doc.line(i + 1)
        const eqPos = lineObj.from + lines[i].indexOf(m[2], m.index + m[1].length)
        diagnostics.push({
          from: eqPos,
          to: eqPos + 1,
          severity: 'warning',
          message: "Use '<=' (non-blocking) in clocked always blocks, not '=' (blocking)",
        })
      }
    }
  }

  // ---- RULE 5: Non-blocking <= in combinational always (should be =) ----
  for (const blk of alwaysBlocks) {
    if (blk.type !== 'comb') continue
    for (let i = blk.startLine; i <= (blk.endLine || lines.length - 1) && i < lines.length; i++) {
      const s = lines[i].trim()
      if (/^\s*(if|else|case|begin|end|default|\/\/)/.test(s)) continue
      const m = lines[i].match(/(\w+)\s*(<)=(?!=)/)
      if (m && m.index !== undefined) {
        const lineObj = doc.line(i + 1)
        const leqPos = lineObj.from + lines[i].indexOf('<=', m.index + m[1].length)
        if (leqPos >= lineObj.from) {
          diagnostics.push({
            from: leqPos,
            to: leqPos + 2,
            severity: 'warning',
            message: "Use '=' (blocking) in combinational always @(*) blocks, not '<='",
          })
        }
      }
    }
  }

  // ---- RULE 6: Duplicate signal declarations ----
  const seenDecls = new Map() // name -> first position
  const declFullRe = /\b(?:wire|reg|input|output|inout)\s+(?:reg\s+)?(?:wire\s+)?(?:\[\d+:\d+\]\s+)?(\w+)/g
  let ddm
  while ((ddm = declFullRe.exec(text)) !== null) {
    const name = ddm[1]
    const pos = ddm.index + ddm[0].length - name.length
    if (seenDecls.has(name)) {
      diagnostics.push({
        from: pos,
        to: pos + name.length,
        severity: 'error',
        message: `Duplicate declaration of '${name}'`,
      })
    } else {
      seenDecls.set(name, pos)
    }
  }

  // ---- RULE 7: Missing default in case inside always @(*) ----
  for (const blk of alwaysBlocks) {
    if (blk.type !== 'comb') continue
    let inCase = false
    let hasDefault = false
    let casePos = null
    for (let i = blk.startLine; i <= (blk.endLine || lines.length - 1) && i < lines.length; i++) {
      const s = lines[i].trim()
      if (/^\s*case[xz]?\s*\(/.test(s)) {
        inCase = true
        hasDefault = false
        casePos = doc.line(i + 1).from + lines[i].indexOf('case')
      }
      if (inCase && /^\s*default\s*:/.test(s)) hasDefault = true
      if (inCase && s === 'endcase') {
        if (!hasDefault && casePos !== null) {
          diagnostics.push({
            from: casePos,
            to: casePos + 4,
            severity: 'warning',
            message: 'Missing default case in combinational case statement',
          })
        }
        inCase = false
      }
    }
  }

  // ---- RULE 8: Common typo: always@ without space ----
  const typoRe = /always@/g
  let tm
  while ((tm = typoRe.exec(text)) !== null) {
    diagnostics.push({
      from: tm.index,
      to: tm.index + 7,
      severity: 'warning',
      message: "Missing space: use 'always @' not 'always@'",
    })
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
    // hex: all hex digits are valid

    if (invalid) {
      const digitsStart = nm.index + nm[1].length + 2 // after N'b
      diagnostics.push({
        from: digitsStart,
        to: digitsStart + nm[3].length,
        severity: 'error',
        message: `Invalid digits for base '${base}': '${nm[3]}'`,
      })
    }
  }

  // ---- RULE 10: Missing module name ----
  const moduleRe = /\bmodule\s*([;(\s])/g
  let mmm
  while ((mmm = moduleRe.exec(text)) !== null) {
    if (mmm[1] === '(' || mmm[1] === ';') {
      diagnostics.push({
        from: mmm.index,
        to: mmm.index + 6,
        severity: 'error',
        message: 'Missing module name after "module" keyword',
      })
    }
  }

  return diagnostics
}
