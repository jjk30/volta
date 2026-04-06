/**
 * Volta — Verilog Autocomplete for CodeMirror
 * Provides keyword, snippet, and identifier completions.
 */

const KEYWORDS = [
  { label: 'module', type: 'keyword', detail: 'Module declaration' },
  { label: 'endmodule', type: 'keyword', detail: 'End of module' },
  { label: 'input', type: 'keyword', detail: 'Input port' },
  { label: 'output', type: 'keyword', detail: 'Output port' },
  { label: 'inout', type: 'keyword', detail: 'Bidirectional port' },
  { label: 'wire', type: 'keyword', detail: 'Wire signal' },
  { label: 'reg', type: 'keyword', detail: 'Register signal' },
  { label: 'integer', type: 'keyword', detail: 'Integer variable' },
  { label: 'parameter', type: 'keyword', detail: 'Parameter constant' },
  { label: 'localparam', type: 'keyword', detail: 'Local parameter' },
  { label: 'always', type: 'keyword', detail: 'Always block' },
  { label: 'initial', type: 'keyword', detail: 'Initial block' },
  { label: 'assign', type: 'keyword', detail: 'Continuous assignment' },
  { label: 'begin', type: 'keyword', detail: 'Block start' },
  { label: 'end', type: 'keyword', detail: 'Block end' },
  { label: 'if', type: 'keyword', detail: 'Conditional' },
  { label: 'else', type: 'keyword', detail: 'Else branch' },
  { label: 'case', type: 'keyword', detail: 'Case statement' },
  { label: 'casex', type: 'keyword', detail: 'Case with dont-care' },
  { label: 'casez', type: 'keyword', detail: 'Case with high-z' },
  { label: 'endcase', type: 'keyword', detail: 'End of case' },
  { label: 'default', type: 'keyword', detail: 'Default case' },
  { label: 'posedge', type: 'keyword', detail: 'Positive edge' },
  { label: 'negedge', type: 'keyword', detail: 'Negative edge' },
  { label: 'or', type: 'keyword', detail: 'Sensitivity list OR' },
  { label: 'and', type: 'keyword', detail: 'Logical AND' },
  { label: 'not', type: 'keyword', detail: 'Logical NOT' },
  { label: 'xor', type: 'keyword', detail: 'Logical XOR' },
  { label: 'function', type: 'keyword', detail: 'Function definition' },
  { label: 'endfunction', type: 'keyword', detail: 'End of function' },
  { label: 'task', type: 'keyword', detail: 'Task definition' },
  { label: 'endtask', type: 'keyword', detail: 'End of task' },
  { label: 'generate', type: 'keyword', detail: 'Generate block' },
  { label: 'endgenerate', type: 'keyword', detail: 'End generate' },
  { label: 'genvar', type: 'keyword', detail: 'Generate variable' },
  { label: 'for', type: 'keyword', detail: 'For loop' },
  { label: 'while', type: 'keyword', detail: 'While loop' },
]

const SNIPPETS = [
  {
    label: 'always @(posedge clk)',
    type: 'text',
    detail: 'Sequential always block',
    apply: 'always @(posedge clk) begin\n  \nend',
  },
  {
    label: 'always @(*)',
    type: 'text',
    detail: 'Combinational always block',
    apply: 'always @(*) begin\n  \nend',
  },
  {
    label: 'if ... begin ... end',
    type: 'text',
    detail: 'If statement with begin/end',
    apply: 'if () begin\n  \nend',
  },
  {
    label: 'case ... endcase',
    type: 'text',
    detail: 'Case statement',
    apply: 'case ()\n  \n  default: ;\nendcase',
  },
  {
    label: 'module ... endmodule',
    type: 'text',
    detail: 'Module declaration',
    apply: 'module name(\n  input wire clk,\n  input wire rst\n);\n\n\nendmodule',
  },
  {
    label: "4'b0000",
    type: 'text',
    detail: '4-bit binary literal',
    apply: "4'b0000",
  },
  {
    label: "8'hFF",
    type: 'text',
    detail: '8-bit hex literal',
    apply: "8'hFF",
  },
  {
    label: "32'd0",
    type: 'text',
    detail: '32-bit decimal literal',
    apply: "32'd0",
  },
  {
    label: "$dumpfile/$dumpvars",
    type: 'text',
    detail: 'VCD dump for waveforms',
    apply: '$dumpfile("dump.vcd");\n$dumpvars(0, tb);',
  },
  {
    label: "$display",
    type: 'text',
    detail: 'Print to console',
    apply: '$display("msg: %0d", signal);',
  },
  {
    label: "$finish",
    type: 'text',
    detail: 'End simulation',
    apply: '$finish;',
  },
]

// Extract identifiers (wire/reg/input/output declarations) from editor content
function extractIdentifiers(text) {
  const idents = new Set()
  const re = /(?:wire|reg|input|output|inout)\s+(?:(?:reg|wire)\s+)?(?:\[\d+:\d+\]\s+)?(\w+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    idents.add(m[1])
  }
  // Also extract module instance names
  const modRe = /(\w+)\s+\w+\s*\(/g
  while ((m = modRe.exec(text)) !== null) {
    if (!['module', 'always', 'if', 'case', 'for', 'while', 'initial', 'assign', 'begin', 'function', 'task'].includes(m[1])) {
      idents.add(m[1])
    }
  }
  return idents
}

export function verilogCompletion(context) {
  // Get the word being typed
  const word = context.matchBefore(/[\w$]+/)
  if (!word && !context.explicit) return null
  if (word && word.from === word.to && !context.explicit) return null

  const prefix = word ? word.text.toLowerCase() : ''
  const from = word ? word.from : context.pos

  // Collect options
  const options = []

  // Keywords
  for (const kw of KEYWORDS) {
    if (!prefix || kw.label.toLowerCase().startsWith(prefix)) {
      options.push(kw)
    }
  }

  // Snippets
  for (const sn of SNIPPETS) {
    if (!prefix || sn.label.toLowerCase().startsWith(prefix)) {
      options.push(sn)
    }
  }

  // Identifiers from the current document
  const text = context.state.doc.toString()
  const idents = extractIdentifiers(text)
  for (const id of idents) {
    if ((!prefix || id.toLowerCase().startsWith(prefix)) && id.length > 1) {
      options.push({
        label: id,
        type: 'variable',
        detail: 'Signal/identifier',
      })
    }
  }

  if (options.length === 0) return null

  return {
    from,
    options,
    validFor: /^[\w$]*$/,
  }
}
