/**
 * Pure, dependency-free regex transforms used when the user changes the
 * language dropdown after a design already exists. These cover the
 * Verilog ↔ SystemVerilog round-trip — Python conversions are handled by
 * the backend (Amaranth elaboration / cached verilog_intermediate).
 *
 * Both functions take a string and return a string. Whitespace-only input
 * round-trips unchanged.
 *
 * Caveats:
 *   - These are token-level regexes, not an AST pass. They handle the
 *     common ~90% of synthesizable patterns; anything subtler (parameter
 *     types, generate blocks with mixed `logic` use, casting) the user
 *     should re-GENERATE.
 *   - `logic` is ambiguous on the Verilog side (could be `wire` or `reg`).
 *     We disambiguate by scanning for procedural-LHS use inside `always_ff`
 *     / `always_comb` blocks. Names found there become `reg`; the rest
 *     become `wire`.
 */

// ---------------------------------------------------------------------------
// Verilog → SystemVerilog
// ---------------------------------------------------------------------------

export function verilogToSystemverilog(code) {
  if (!code || !code.trim()) return code
  let out = code
  // wire/reg → logic (whole-word).
  out = out.replace(/\bwire\b/g, 'logic')
  out = out.replace(/\breg\b/g, 'logic')
  // Sequential always blocks — both bare posedge clk and async-reset form.
  // Order matters: the async-reset form is the more specific pattern and
  // must run first, otherwise the bare-clk regex eats `always @(posedge clk`
  // and leaves a malformed `always_ff @(posedge clk or posedge rst)` mid-line.
  out = out.replace(
    /always\s*@\s*\(\s*posedge\s+clk\s+or\s+(posedge|negedge)\s+(\w+)\s*\)/g,
    'always_ff @(posedge clk or $1 $2)',
  )
  out = out.replace(
    /always\s*@\s*\(\s*posedge\s+clk\s*\)/g,
    'always_ff @(posedge clk)',
  )
  // Combinational always.
  out = out.replace(/always\s*@\s*\(\s*\*\s*\)/g, 'always_comb')
  return out
}

// ---------------------------------------------------------------------------
// SystemVerilog → Verilog
// ---------------------------------------------------------------------------

/**
 * Find every identifier that appears on the LHS of `<=` or `=` inside an
 * `always_ff` or `always_comb` block. These are the signals that must
 * downconvert to `reg` (rather than `wire`) in Verilog-2005. We also
 * recognise `<name>[…]` and `{a, b, …}` concatenation on the LHS.
 *
 * The scan walks begin/end depth so we capture the whole always body, not
 * just its single-statement form.
 */
function collectAlwaysLhsNames(code) {
  const names = new Set()
  const kwRe = /\balways_(?:ff|comb|latch)\b/g
  let m
  while ((m = kwRe.exec(code)) !== null) {
    let i = m.index + m[0].length
    // Skip whitespace and an optional @(...) sensitivity list.
    while (i < code.length && /\s/.test(code[i])) i++
    if (code[i] === '@') {
      const openParen = code.indexOf('(', i)
      if (openParen < 0) continue
      let depth = 1
      i = openParen + 1
      while (i < code.length && depth > 0) {
        if (code[i] === '(') depth++
        else if (code[i] === ')') depth--
        i++
      }
    }
    while (i < code.length && /\s/.test(code[i])) i++
    // Body is either a `begin ... end` block or a single statement up to `;`.
    let body = ''
    const startsWithBegin = code.substr(i, 5) === 'begin' && !/\w/.test(code[i + 5] || '')
    if (startsWithBegin) {
      let depth = 1
      const tokenRe = /\b(begin|end(?:case|module|function|task|generate|primitive)?)\b/g
      tokenRe.lastIndex = i + 5
      let t
      const bodyStart = i + 5
      let bodyEnd = code.length
      while ((t = tokenRe.exec(code)) !== null) {
        if (t[1] === 'begin') depth++
        else if (t[1] === 'end') {
          depth--
          if (depth === 0) { bodyEnd = t.index; break }
        }
      }
      body = code.slice(bodyStart, bodyEnd)
    } else {
      const semi = code.indexOf(';', i)
      if (semi < 0) continue
      body = code.slice(i, semi + 1)
    }
    // Collect LHS identifiers from procedural assignments. Match:
    //   foo <= ...   foo = ...   foo[…] <= ...   {a, b} <= ...
    const lhsRe = /(?:^|[\s;])(\{[^}]+\}|\w+)(?:\s*\[[^\]]+\])?\s*(?:<=|=)(?!=)/g
    let lhs
    while ((lhs = lhsRe.exec(body)) !== null) {
      const raw = lhs[1]
      if (raw.startsWith('{')) {
        for (const tok of raw.slice(1, -1).split(',')) {
          const n = tok.trim().match(/^(\w+)/)
          if (n) names.add(n[1])
        }
      } else {
        names.add(raw)
      }
    }
  }
  // Strip Verilog keywords that can syntactically appear in the matcher.
  for (const kw of ['if', 'else', 'case', 'default', 'begin', 'end', 'for', 'while']) {
    names.delete(kw)
  }
  return names
}

export function systemverilogToVerilog(code) {
  if (!code || !code.trim()) return code
  const regNames = collectAlwaysLhsNames(code)
  let out = code

  // Port declarations: `input logic [W:0] name`  /  `output logic [W:0] name`.
  // Decide between wire/reg based on whether the name was procedurally
  // assigned inside an always block.
  out = out.replace(
    /\b(input|output|inout)\s+logic\b(\s*\[[^\]]+\])?\s+(\w+)/g,
    (_match, dir, width, name) => {
      const widthPart = width || ''
      if (dir === 'input' || dir === 'inout') {
        return `${dir} wire${widthPart} ${name}`
      }
      // output — pick reg if the always_* body drives it
      const kind = regNames.has(name) ? 'reg' : 'wire'
      return `output ${kind}${widthPart} ${name}`
    },
  )

  // Body-level declarations: `logic [W:0] name1, name2;`. We split the
  // comma-separated name list and emit a reg/wire line each, keyed by which
  // names appear on a procedural LHS.
  out = out.replace(
    /^([ \t]*)logic\b(\s*\[[^\]]+\])?\s+([^;]+);/gm,
    (_match, indent, width, namesPart) => {
      const widthPart = width || ''
      const tokens = namesPart.split(',').map((t) => t.trim()).filter(Boolean)
      // If all tokens go the same way, emit one line; otherwise split.
      const lines = tokens.map((tok) => {
        const nameMatch = tok.match(/^(\w+)/)
        if (!nameMatch) return null
        const name = nameMatch[1]
        const kind = regNames.has(name) ? 'reg' : 'wire'
        return `${indent}${kind}${widthPart} ${tok};`
      }).filter(Boolean)
      return lines.join('\n')
    },
  )

  // Replace the always_* keywords with their Verilog-2005 equivalents.
  out = out.replace(/\balways_ff\s*@/g, 'always @')
  out = out.replace(/\balways_comb\b/g, 'always @(*)')
  // `always_latch` becomes `always @(*)` too — latches infer naturally
  // from the missing-default-case pattern that produced them.
  out = out.replace(/\balways_latch\b/g, 'always @(*)')

  return out
}
