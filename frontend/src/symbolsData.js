/**
 * Volta Symbols Library Data
 * Categories of schematic symbols with SVG renderers and Verilog snippets.
 * Each SVG function takes (color) and returns an SVG string (120x100 viewBox).
 */

// Helper: small monospace label
const lbl = (x, y, text, color, anchor = 'start', size = '8') =>
  `<text x="${x}" y="${y}" fill="${color}" font-family="'JetBrains Mono',monospace" font-size="${size}" text-anchor="${anchor}">${text}</text>`

// Helper: bubble (NOT circle)
const bubble = (cx, cy, color) =>
  `<circle cx="${cx}" cy="${cy}" r="4" stroke="${color}" stroke-width="1.5" fill="none"/>`

export const CATEGORIES = [
  'Logic Gates',
  'Multiplexers',
  'ALU & Arithmetic',
  'Flip-Flops',
  'Memory',
  'CPU Components',
  'GPU Components',
  'Decoders',
]

export const SYMBOLS = {
  'Logic Gates': [
    {
      name: 'AND',
      id: 'and',
      promptText: 'Design a 2-input AND gate',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,25 H55 A30,25 0 0 1 55,75 H20 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="40" x2="20" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="20" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = a & b;`,
      systemverilog_snippet: `assign y = a & b;`,
      python_snippet: `m.d.comb += y.eq(a & b)`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','0'],['0','1','0'],['1','0','0'],['1','1','1']] },
    },
    {
      name: 'OR',
      id: 'or',
      promptText: 'Design a 2-input OR gate',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,25 Q40,50 20,75 Q55,75 85,50 Q55,25 20,25 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="40" x2="28" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="28" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = a | b;`,
      systemverilog_snippet: `assign y = a | b;`,
      python_snippet: `m.d.comb += y.eq(a | b)`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','0'],['0','1','1'],['1','0','1'],['1','1','1']] },
    },
    {
      name: 'NOT',
      id: 'not',
      promptText: 'Design a NOT gate (inverter)',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,25 80,50 20,75" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${bubble(86, 50, c)}
        <line x1="5" y1="50" x2="20" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'a', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = ~a;`,
      systemverilog_snippet: `assign y = ~a;`,
      python_snippet: `m.d.comb += y.eq(~a)`,
      truthTable: { headers: ['A','Y'], rows: [['0','1'],['1','0']] },
    },
    {
      name: 'NAND',
      id: 'nand',
      promptText: 'Design a 2-input NAND gate',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,25 H50 A30,25 0 0 1 50,75 H20 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${bubble(84, 50, c)}
        <line x1="5" y1="40" x2="20" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="20" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="88" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = ~(a & b);`,
      systemverilog_snippet: `assign y = ~(a & b);`,
      python_snippet: `m.d.comb += y.eq(~(a & b))`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','1'],['0','1','1'],['1','0','1'],['1','1','0']] },
    },
    {
      name: 'NOR',
      id: 'nor',
      promptText: 'Design a 2-input NOR gate',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,25 Q40,50 20,75 Q55,75 80,50 Q55,25 20,25 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${bubble(84, 50, c)}
        <line x1="5" y1="40" x2="28" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="28" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="88" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = ~(a | b);`,
      systemverilog_snippet: `assign y = ~(a | b);`,
      python_snippet: `m.d.comb += y.eq(~(a | b))`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','1'],['0','1','0'],['1','0','0'],['1','1','0']] },
    },
    {
      name: 'XOR',
      id: 'xor',
      promptText: 'Design a 2-input XOR gate',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M25,25 Q45,50 25,75 Q60,75 85,50 Q60,25 25,25 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <path d="M18,25 Q38,50 18,75" stroke="${c}" stroke-width="1.5" fill="none"/>
        <line x1="5" y1="40" x2="28" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="28" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = a ^ b;`,
      systemverilog_snippet: `assign y = a ^ b;`,
      python_snippet: `m.d.comb += y.eq(a ^ b)`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','0'],['0','1','1'],['1','0','1'],['1','1','0']] },
    },
    {
      name: 'XNOR',
      id: 'xnor',
      promptText: 'Design a 2-input XNOR gate',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M25,25 Q45,50 25,75 Q60,75 80,50 Q60,25 25,25 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <path d="M18,25 Q38,50 18,75" stroke="${c}" stroke-width="1.5" fill="none"/>
        ${bubble(84, 50, c)}
        <line x1="5" y1="40" x2="28" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="28" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="88" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = ~(a ^ b);`,
      systemverilog_snippet: `assign y = ~(a ^ b);`,
      python_snippet: `m.d.comb += y.eq(~(a ^ b))`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','1'],['0','1','0'],['1','0','0'],['1','1','1']] },
    },
    {
      name: 'Buffer',
      id: 'buffer',
      promptText: 'Design a buffer',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="25,25 85,50 25,75" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'a', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = a;`,
      systemverilog_snippet: `assign y = a;`,
      python_snippet: `m.d.comb += y.eq(a)`,
      truthTable: { headers: ['A','Y'], rows: [['0','0'],['1','1']] },
    },
    {
      name: 'Tri-state',
      id: 'tristate',
      promptText: 'Design a tri-state buffer with enable',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="25,30 80,50 25,70" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="52" y1="15" x2="52" y2="30" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'a', c)}${lbl(107, 52, 'y', c)}${lbl(55, 14, 'en', c)}
      </svg>`,
      verilog: `assign y = en ? a : 1'bz;`,
      systemverilog_snippet: `assign y = en ? a : 1'bz;`,
      python_snippet: `m.d.comb += y.eq(Mux(en, a, 0))  # Amaranth lacks 1'bz; gate via en`,
      truthTable: { headers: ['EN','A','Y'], rows: [['0','X','Z'],['1','0','0'],['1','1','1']] },
    },
  ],

  'Multiplexers': [
    {
      name: '2:1 MUX',
      id: 'mux2',
      promptText: 'Design a 2-to-1 multiplexer',
      svg: (c) => `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg">
        <polygon points="25,15 85,30 85,70 25,85" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="65" x2="25" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="55" y1="85" x2="55" y2="72" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 33, 'in0', c)}${lbl(2, 63, 'in1', c)}${lbl(107, 52, 'out', c)}${lbl(58, 97, 'sel', c)}
      </svg>`,
      verilog: `assign out = sel ? in1 : in0;`,
      systemverilog_snippet: `assign out = sel ? in1 : in0;`,
      python_snippet: `m.d.comb += out.eq(Mux(sel, in1, in0))`,
      truthTable: { headers: ['S','Y'], rows: [['0','I0'],['1','I1']] },
    },
    {
      name: '4:1 MUX',
      id: 'mux4',
      promptText: 'Design a 4-to-1 multiplexer',
      svg: (c) => `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,10 80,25 80,75 20,90" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="25" x2="20" y2="25" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="40" x2="20" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="55" x2="20" y2="55" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="70" x2="20" y2="70" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="50" y1="90" x2="50" y2="78" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 23, '0', c)}${lbl(2, 38, '1', c)}${lbl(2, 53, '2', c)}${lbl(2, 68, '3', c)}
        ${lbl(107, 52, 'out', c)}${lbl(53, 100, 'sel', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case (sel)\n    2'b00: out = in0;\n    2'b01: out = in1;\n    2'b10: out = in2;\n    2'b11: out = in3;\n    default: out = 0;\n  endcase\nend`,
      systemverilog_snippet: `always_comb begin\n  case (sel)\n    2'b00: out = in0;\n    2'b01: out = in1;\n    2'b10: out = in2;\n    2'b11: out = in3;\n    default: out = 0;\n  endcase\nend`,
      python_snippet: `with m.Switch(sel):\n  with m.Case(0): m.d.comb += out.eq(in0)\n  with m.Case(1): m.d.comb += out.eq(in1)\n  with m.Case(2): m.d.comb += out.eq(in2)\n  with m.Case(3): m.d.comb += out.eq(in3)`,
      truthTable: { headers: ['S1','S0','Y'], rows: [['0','0','I0'],['0','1','I1'],['1','0','I2'],['1','1','I3']] },
    },
    {
      name: '8:1 MUX',
      id: 'mux8',
      promptText: 'Design an 8-to-1 multiplexer',
      svg: (c) => `<svg viewBox="0 0 120 108" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,5 80,20 80,80 20,95" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${[0,1,2,3,4,5,6,7].map(i => `<line x1="5" y1="${15+i*10}" x2="20" y2="${15+i*10}" stroke="${c}" stroke-width="1"/>`).join('')}
        <line x1="80" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="50" y1="95" x2="50" y2="84" stroke="${c}" stroke-width="1.5"/>
        ${lbl(50, 50, '8:1', c, 'middle', '10')}${lbl(107, 52, 'out', c)}${lbl(53, 104, 'sel', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case (sel)\n    3'd0: out = in0;\n    3'd1: out = in1;\n    3'd2: out = in2;\n    3'd3: out = in3;\n    3'd4: out = in4;\n    3'd5: out = in5;\n    3'd6: out = in6;\n    3'd7: out = in7;\n    default: out = 0;\n  endcase\nend`,
      systemverilog_snippet: `always_comb begin\n  case (sel)\n    3'd0: out = in0;\n    3'd1: out = in1;\n    3'd2: out = in2;\n    3'd3: out = in3;\n    3'd4: out = in4;\n    3'd5: out = in5;\n    3'd6: out = in6;\n    3'd7: out = in7;\n    default: out = 0;\n  endcase\nend`,
      python_snippet: `with m.Switch(sel):\n  for i in range(8):\n    with m.Case(i): m.d.comb += out.eq(ins[i])`,
    },
    {
      name: '1:2 DEMUX',
      id: 'demux2',
      promptText: 'Design a 1-to-2 demultiplexer',
      svg: (c) => `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg">
        <polygon points="85,15 25,30 25,70 85,85" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="35" x2="105" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="65" x2="105" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="55" y1="85" x2="55" y2="72" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'in', c)}${lbl(107, 33, 'y0', c)}${lbl(107, 63, 'y1', c)}${lbl(58, 97, 'sel', c)}
      </svg>`,
      verilog: `assign y0 = sel ? 1'b0 : in;\nassign y1 = sel ? in : 1'b0;`,
      systemverilog_snippet: `assign y0 = sel ? 1'b0 : in;\nassign y1 = sel ? in : 1'b0;`,
      python_snippet: `m.d.comb += y0.eq(Mux(sel, 0, in_))\nm.d.comb += y1.eq(Mux(sel, in_, 0))`,
    },
    {
      name: '1:4 DEMUX',
      id: 'demux4',
      promptText: 'Design a 1-to-4 demultiplexer',
      svg: (c) => `<svg viewBox="0 0 120 108" xmlns="http://www.w3.org/2000/svg">
        <polygon points="80,10 30,25 30,75 80,90" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="50" x2="30" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="25" x2="105" y2="25" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="42" x2="105" y2="42" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="58" x2="105" y2="58" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="75" x2="105" y2="75" stroke="${c}" stroke-width="1.5"/>
        <line x1="55" y1="90" x2="55" y2="80" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'in', c)}${lbl(55, 50, '1:4', c, 'middle', '9')}${lbl(58, 100, 'sel', c)}
      </svg>`,
      verilog: `always @(*) begin\n  {y3, y2, y1, y0} = 4'b0000;\n  case (sel)\n    2'b00: y0 = in;\n    2'b01: y1 = in;\n    2'b10: y2 = in;\n    2'b11: y3 = in;\n  endcase\nend`,
      systemverilog_snippet: `always_comb begin\n  {y3, y2, y1, y0} = 4'b0000;\n  case (sel)\n    2'b00: y0 = in;\n    2'b01: y1 = in;\n    2'b10: y2 = in;\n    2'b11: y3 = in;\n  endcase\nend`,
      python_snippet: `with m.Switch(sel):\n  with m.Case(0): m.d.comb += y0.eq(in_)\n  with m.Case(1): m.d.comb += y1.eq(in_)\n  with m.Case(2): m.d.comb += y2.eq(in_)\n  with m.Case(3): m.d.comb += y3.eq(in_)`,
    },
  ],

  'ALU & Arithmetic': [
    {
      name: 'ALU',
      id: 'alu',
      promptText: 'Design a 4-bit ALU with add, subtract, AND, and OR operations',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,15 H60 L90,50 L60,85 H20 L35,50 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="30" x2="20" y2="30" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="70" x2="20" y2="70" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="40" y1="15" x2="40" y2="5" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 28, 'a', c)}${lbl(2, 68, 'b', c)}${lbl(112, 52, 'y', c)}${lbl(43, 5, 'op', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case (op)\n    2'b00: y = a + b;\n    2'b01: y = a - b;\n    2'b10: y = a & b;\n    2'b11: y = a | b;\n    default: y = 0;\n  endcase\nend`,
      systemverilog_snippet: `always_comb begin\n  case (op)\n    2'b00: y = a + b;\n    2'b01: y = a - b;\n    2'b10: y = a & b;\n    2'b11: y = a | b;\n    default: y = 0;\n  endcase\nend`,
      python_snippet: `with m.Switch(op):\n  with m.Case(0): m.d.comb += y.eq(a + b)\n  with m.Case(1): m.d.comb += y.eq(a - b)\n  with m.Case(2): m.d.comb += y.eq(a & b)\n  with m.Case(3): m.d.comb += y.eq(a | b)`,
    },
    {
      name: 'Full Adder',
      id: 'fulladd',
      promptText: 'Design a full adder',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 55, 'FA', c, 'middle', '14')}
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="65" x2="25" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="40" x2="110" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="60" x2="110" y2="60" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 33, 'a', c)}${lbl(2, 48, 'b', c)}${lbl(2, 63, 'cin', c)}${lbl(112, 38, 'sum', c)}${lbl(112, 58, 'cout', c)}
      </svg>`,
      verilog: `assign {cout, sum} = a + b + cin;`,
      systemverilog_snippet: `assign {cout, sum} = a + b + cin;`,
      python_snippet: `m.d.comb += Cat(sum_, cout).eq(a + b + cin)`,
      truthTable: { headers: ['A','B','Cin','S','Cout'], rows: [['0','0','0','0','0'],['0','0','1','1','0'],['0','1','0','1','0'],['0','1','1','0','1'],['1','0','0','1','0'],['1','0','1','0','1'],['1','1','0','0','1'],['1','1','1','1','1']] },
    },
    {
      name: 'Half Adder',
      id: 'halfadd',
      promptText: 'Design a half adder',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 55, 'HA', c, 'middle', '14')}
        <line x1="5" y1="40" x2="25" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="25" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="40" x2="110" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="60" x2="110" y2="60" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(112, 38, 'sum', c)}${lbl(112, 58, 'cout', c)}
      </svg>`,
      verilog: `assign sum = a ^ b;\nassign cout = a & b;`,
      systemverilog_snippet: `assign sum = a ^ b;\nassign cout = a & b;`,
      python_snippet: `m.d.comb += sum_.eq(a ^ b)\nm.d.comb += cout.eq(a & b)`,
      truthTable: { headers: ['A','B','S','Cout'], rows: [['0','0','0','0'],['0','1','1','0'],['1','0','1','0'],['1','1','0','1']] },
    },
    {
      name: 'Comparator',
      id: 'cmp',
      promptText: 'Design a 4-bit comparator with greater-than, equal, and less-than outputs',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="15" width="55" height="70" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(52, 52, 'CMP', c, 'middle', '11')}
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="65" x2="25" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="30" x2="110" y2="30" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="70" x2="110" y2="70" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 33, 'a', c)}${lbl(2, 63, 'b', c)}${lbl(112, 28, 'gt', c)}${lbl(112, 48, 'eq', c)}${lbl(112, 68, 'lt', c)}
      </svg>`,
      verilog: `assign gt = (a > b);\nassign eq = (a == b);\nassign lt = (a < b);`,
      systemverilog_snippet: `assign gt = (a > b);\nassign eq = (a == b);\nassign lt = (a < b);`,
      python_snippet: `m.d.comb += gt.eq(a > b)\nm.d.comb += eq_.eq(a == b)\nm.d.comb += lt.eq(a < b)`,
      truthTable: { headers: ['A vs B','gt','eq','lt'], rows: [['A>B','1','0','0'],['A=B','0','1','0'],['A<B','0','0','1']] },
    },
    {
      name: 'Shifter',
      id: 'shifter',
      promptText: 'Design an 8-bit barrel shifter with left and right shift',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 48, '>>', c, 'middle', '12')}${lbl(55, 62, '<<', c, 'middle', '12')}
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="55" y1="20" x2="55" y2="8" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'in', c)}${lbl(112, 52, 'out', c)}${lbl(58, 7, 'shamt', c)}
      </svg>`,
      verilog: `assign out = left ? (in << shamt) : (in >> shamt);`,
      systemverilog_snippet: `assign out = left ? (in << shamt) : (in >> shamt);`,
      python_snippet: `m.d.comb += out.eq(Mux(left, in_ << shamt, in_ >> shamt))`,
    },
  ],

  'Flip-Flops': [
    {
      name: 'D Flip-Flop',
      id: 'dff',
      promptText: 'Design a D flip-flop with asynchronous reset',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="15" width="60" height="70" rx="2" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="25,72 35,80 25,88" stroke="${c}" stroke-width="1" fill="none"/>
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="80" x2="25" y2="80" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="35" x2="110" y2="35" stroke="${c}" stroke-width="1.5"/>
        ${lbl(28, 38, 'D', c)}${lbl(80, 38, 'Q', c, 'end')}${lbl(2, 33, 'd', c)}${lbl(2, 78, 'clk', c)}${lbl(112, 38, 'q', c)}
      </svg>`,
      verilog: `always @(posedge clk)\n  q <= d;`,
      systemverilog_snippet: `always_ff @(posedge clk)\n  q <= d;`,
      python_snippet: `m.d.sync += q.eq(d)`,
      truthTable: { headers: ['CLK','D','Q(next)'], rows: [['↑','0','0'],['↑','1','1'],['0','X','Q']] },
    },
    {
      name: 'JK Flip-Flop',
      id: 'jkff',
      promptText: 'Design a JK flip-flop',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="15" width="60" height="70" rx="2" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="25,72 35,80 25,88" stroke="${c}" stroke-width="1" fill="none"/>
        <line x1="5" y1="30" x2="25" y2="30" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="80" x2="25" y2="80" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="35" x2="110" y2="35" stroke="${c}" stroke-width="1.5"/>
        ${lbl(28, 33, 'J', c)}${lbl(28, 53, 'K', c)}${lbl(80, 38, 'Q', c, 'end')}
        ${lbl(2, 28, 'j', c)}${lbl(2, 48, 'k', c)}${lbl(2, 78, 'clk', c)}${lbl(112, 38, 'q', c)}
      </svg>`,
      verilog: `always @(posedge clk) begin\n  case ({j, k})\n    2'b00: q <= q;\n    2'b01: q <= 1'b0;\n    2'b10: q <= 1'b1;\n    2'b11: q <= ~q;\n  endcase\nend`,
      systemverilog_snippet: `always_ff @(posedge clk) begin\n  case ({j, k})\n    2'b00: q <= q;\n    2'b01: q <= 1'b0;\n    2'b10: q <= 1'b1;\n    2'b11: q <= ~q;\n  endcase\nend`,
      python_snippet: `with m.Switch(Cat(k, j)):\n  with m.Case(0b00): m.d.sync += q.eq(q)\n  with m.Case(0b01): m.d.sync += q.eq(0)\n  with m.Case(0b10): m.d.sync += q.eq(1)\n  with m.Case(0b11): m.d.sync += q.eq(~q)`,
      truthTable: { headers: ['J','K','Q(next)'], rows: [['0','0','Q'],['0','1','0'],['1','0','1'],['1','1','~Q']] },
    },
    {
      name: 'T Flip-Flop',
      id: 'tff',
      promptText: 'Design a T flip-flop with enable',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="15" width="60" height="70" rx="2" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="25,72 35,80 25,88" stroke="${c}" stroke-width="1" fill="none"/>
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="80" x2="25" y2="80" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="35" x2="110" y2="35" stroke="${c}" stroke-width="1.5"/>
        ${lbl(28, 38, 'T', c)}${lbl(80, 38, 'Q', c, 'end')}${lbl(2, 33, 't', c)}${lbl(2, 78, 'clk', c)}${lbl(112, 38, 'q', c)}
      </svg>`,
      verilog: `always @(posedge clk)\n  if (t) q <= ~q;`,
      systemverilog_snippet: `always_ff @(posedge clk)\n  if (t) q <= ~q;`,
      python_snippet: `with m.If(t): m.d.sync += q.eq(~q)`,
      truthTable: { headers: ['T','Q(next)'], rows: [['0','Q'],['1','~Q']] },
    },
    {
      name: 'SR Latch',
      id: 'srlatch',
      promptText: 'Design an SR latch',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="2" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="65" x2="25" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(28, 38, 'S', c)}${lbl(28, 68, 'R', c)}${lbl(80, 53, 'Q', c, 'end')}
        ${lbl(2, 33, 's', c)}${lbl(2, 63, 'r', c)}${lbl(112, 52, 'q', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case ({s, r})\n    2'b10: q = 1'b1;\n    2'b01: q = 1'b0;\n    2'b00: q = q;\n    default: q = 1'bx;\n  endcase\nend`,
      systemverilog_snippet: `always_comb begin\n  case ({s, r})\n    2'b10: q = 1'b1;\n    2'b01: q = 1'b0;\n    2'b00: q = q;\n    default: q = 1'bx;\n  endcase\nend`,
      python_snippet: `with m.If(s): m.d.comb += q.eq(1)\nwith m.Elif(r): m.d.comb += q.eq(0)`,
      truthTable: { headers: ['S','R','Q(next)'], rows: [['0','0','Q'],['0','1','0'],['1','0','1'],['1','1','?']] },
    },
  ],

  'Memory': [
    {
      name: 'Register',
      id: 'reg',
      promptText: 'Design an 8-bit register with enable',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="20" width="70" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="20,68 30,75 20,82" stroke="${c}" stroke-width="1" fill="none"/>
        ${lbl(55, 45, 'REG', c, 'middle', '12')}${lbl(55, 58, '[7:0]', c, 'middle', '8')}
        <line x1="5" y1="40" x2="20" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="75" x2="20" y2="75" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'din', c)}${lbl(2, 73, 'clk', c)}${lbl(112, 52, 'dout', c)}
      </svg>`,
      verilog: `reg [7:0] data;\nalways @(posedge clk)\n  if (en) data <= din;`,
      systemverilog_snippet: `logic [7:0] data;\nalways_ff @(posedge clk)\n  if (en) data <= din;`,
      python_snippet: `with m.If(en): m.d.sync += data.eq(din)`,
    },
    {
      name: 'RAM',
      id: 'ram',
      promptText: 'Design a 256x8 RAM with one read port and one write port',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="10" width="70" height="80" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 42, 'RAM', c, 'middle', '12')}${lbl(55, 56, '256x8', c, 'middle', '8')}
        <line x1="5" y1="25" x2="20" y2="25" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="45" x2="20" y2="45" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="65" x2="20" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="80" x2="20" y2="80" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 23, 'addr', c)}${lbl(2, 43, 'din', c)}${lbl(2, 63, 'we', c)}${lbl(2, 78, 'clk', c)}${lbl(112, 52, 'dout', c)}
      </svg>`,
      verilog: `reg [7:0] mem [0:255];\nalways @(posedge clk)\n  if (we) mem[addr] <= din;\nassign dout = mem[addr];`,
      systemverilog_snippet: `logic [7:0] mem [0:255];\nalways_ff @(posedge clk)\n  if (we) mem[addr] <= din;\nassign dout = mem[addr];`,
      python_snippet: `mem = Memory(width=8, depth=256)\nm.submodules.mem = mem\nrp = mem.read_port(); wp = mem.write_port()\nm.d.comb += [rp.addr.eq(addr), wp.addr.eq(addr), wp.data.eq(din), wp.en.eq(we), dout.eq(rp.data)]`,
    },
    {
      name: 'ROM',
      id: 'rom',
      promptText: 'Design a 16x8 ROM',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 55, 'ROM', c, 'middle', '12')}
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'addr', c)}${lbl(112, 52, 'dout', c)}
      </svg>`,
      verilog: `assign dout = rom_data[addr];`,
      systemverilog_snippet: `assign dout = rom_data[addr];`,
      python_snippet: `rom = Memory(width=8, depth=16, init=ROM_INIT)\nm.submodules.rom = rom\nrp = rom.read_port()\nm.d.comb += [rp.addr.eq(addr), dout.eq(rp.data)]`,
    },
    {
      name: 'Reg File',
      id: 'regfile',
      promptText: 'Design an 8x8 register file with one read port and one write port',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="8" width="70" height="84" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 40, 'REG', c, 'middle', '10')}${lbl(55, 52, 'FILE', c, 'middle', '10')}${lbl(55, 64, '32x32', c, 'middle', '7')}
        <line x1="5" y1="20" x2="20" y2="20" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="35" x2="20" y2="35" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="50" x2="20" y2="50" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="65" x2="20" y2="65" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="80" x2="20" y2="80" stroke="${c}" stroke-width="1"/>
        <line x1="90" y1="35" x2="110" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="65" x2="110" y2="65" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 18, 'wa', c, 'start', '6')}${lbl(2, 33, 'wd', c, 'start', '6')}${lbl(2, 48, 'we', c, 'start', '6')}
        ${lbl(2, 63, 'ra1', c, 'start', '6')}${lbl(2, 78, 'ra2', c, 'start', '6')}
        ${lbl(112, 33, 'rd1', c)}${lbl(112, 63, 'rd2', c)}
      </svg>`,
      verilog: `reg [31:0] regs [0:31];\nalways @(posedge clk)\n  if (we) regs[wa] <= wd;\nassign rd1 = regs[ra1];\nassign rd2 = regs[ra2];`,
      systemverilog_snippet: `logic [31:0] regs [0:31];\nalways_ff @(posedge clk)\n  if (we) regs[wa] <= wd;\nassign rd1 = regs[ra1];\nassign rd2 = regs[ra2];`,
      python_snippet: `regs = Memory(width=32, depth=32)\nm.submodules.regs = regs\nwp = regs.write_port(); rp1 = regs.read_port(); rp2 = regs.read_port()\nm.d.comb += [wp.addr.eq(wa), wp.data.eq(wd), wp.en.eq(we), rp1.addr.eq(ra1), rd1.eq(rp1.data), rp2.addr.eq(ra2), rd2.eq(rp2.data)]`,
    },
  ],

  'CPU Components': [
    {
      name: 'Prog Counter',
      id: 'pc',
      promptText: 'Design a program counter with reset',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="25,68 35,75 25,82" stroke="${c}" stroke-width="1" fill="none"/>
        ${lbl(55, 52, 'PC', c, 'middle', '14')}
        <line x1="5" y1="75" x2="25" y2="75" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 73, 'clk', c)}${lbl(112, 52, 'pc', c)}
      </svg>`,
      verilog: `always @(posedge clk)\n  if (rst) pc <= 0;\n  else pc <= pc + 4;`,
      systemverilog_snippet: `always_ff @(posedge clk)\n  if (rst) pc <= 0;\n  else pc <= pc + 4;`,
      python_snippet: `with m.If(rst): m.d.sync += pc.eq(0)\nwith m.Else(): m.d.sync += pc.eq(pc + 4)`,
    },
    {
      name: 'Control Unit',
      id: 'ctrl',
      promptText: 'Design a simple control unit for a RISC CPU',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="15" y="15" width="80" height="70" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 52, 'CTRL', c, 'middle', '12')}
        <line x1="5" y1="50" x2="15" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="95" y1="30" x2="115" y2="30" stroke="${c}" stroke-width="1"/>
        <line x1="95" y1="50" x2="115" y2="50" stroke="${c}" stroke-width="1"/>
        <line x1="95" y1="70" x2="115" y2="70" stroke="${c}" stroke-width="1"/>
        ${lbl(2, 48, 'op', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case (opcode)\n    // decode control signals\n    default: ctrl = 0;\n  endcase\nend`,
      systemverilog_snippet: `always_comb begin\n  case (opcode)\n    // decode control signals\n    default: ctrl = 0;\n  endcase\nend`,
      python_snippet: `with m.Switch(opcode):\n  # Decode per-opcode control signals\n  with m.Default(): m.d.comb += ctrl.eq(0)`,
    },
    {
      name: 'Instr Mem',
      id: 'imem',
      promptText: 'Design an instruction memory module',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="20" width="70" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 48, 'IMEM', c, 'middle', '11')}
        <line x1="5" y1="50" x2="20" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'pc', c)}${lbl(112, 52, 'instr', c)}
      </svg>`,
      verilog: `assign instr = imem[pc[9:2]];`,
      systemverilog_snippet: `assign instr = imem[pc[9:2]];`,
      python_snippet: `mem = Memory(width=32, depth=1024, init=IMEM_INIT)\nm.submodules.imem = mem\nrp = mem.read_port()\nm.d.comb += [rp.addr.eq(pc[2:]), instr.eq(rp.data)]`,
    },
    {
      name: 'Data Mem',
      id: 'dmem',
      promptText: 'Design a data memory module with read and write ports',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="15" width="70" height="70" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 48, 'DMEM', c, 'middle', '11')}
        <line x1="5" y1="30" x2="20" y2="30" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="50" x2="20" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="70" x2="20" y2="70" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 28, 'addr', c)}${lbl(2, 48, 'wdata', c)}${lbl(2, 68, 'we', c)}${lbl(112, 52, 'rdata', c)}
      </svg>`,
      verilog: `always @(posedge clk)\n  if (memwrite) dmem[addr] <= wdata;\nassign rdata = dmem[addr];`,
      systemverilog_snippet: `always_ff @(posedge clk)\n  if (memwrite) dmem[addr] <= wdata;\nassign rdata = dmem[addr];`,
      python_snippet: `mem = Memory(width=32, depth=1024)\nm.submodules.dmem = mem\nwp = mem.write_port(); rp = mem.read_port()\nm.d.comb += [wp.addr.eq(addr), wp.data.eq(wdata), wp.en.eq(memwrite), rp.addr.eq(addr), rdata.eq(rp.data)]`,
    },
    {
      name: 'Sign Extend',
      id: 'sext',
      promptText: 'Design a 16-to-32 bit sign extension unit',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="25" width="70" height="50" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 55, 'SEXT', c, 'middle', '11')}
        <line x1="5" y1="50" x2="20" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, '16b', c)}${lbl(112, 52, '32b', c)}
      </svg>`,
      verilog: `assign out = {{16{in[15]}}, in};`,
      systemverilog_snippet: `assign out = {{16{in[15]}}, in};`,
      python_snippet: `m.d.comb += out.eq(in_.as_signed())  # 16-to-32 sign extension`,
    },
    {
      name: 'Clock Gen',
      id: 'clkgen',
      promptText: 'Design a clock divider that divides the input clock by 2',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="55" cy="50" r="30" stroke="${c}" stroke-width="1.8" fill="none"/>
        <path d="M40,50 L40,35 L55,35 L55,65 L70,65 L70,50" stroke="${c}" stroke-width="1.5" fill="none"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(112, 52, 'clk', c)}
      </svg>`,
      verilog: `always #5 clk = ~clk;`,
      systemverilog_snippet: `always #5 clk = ~clk;`,
      python_snippet: `# In Amaranth, clk is provided by the surrounding ClockDomain.\n# To divide: m.d.sync += cnt.eq(cnt + 1); m.d.comb += clk_div.eq(cnt[-1])`,
    },
  ],

  'GPU Components': [
    {
      name: 'SIMD ALU',
      id: 'simd_alu_4lane',
      promptText: 'Design a 4-lane SIMD ALU with add, subtract, AND, OR operations on 8-bit data',
      svg: (c) => `<svg viewBox="0 0 140 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="15" width="90" height="75" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        <rect x="30" y="22" width="70" height="12" rx="2" stroke="${c}" stroke-width="1" fill="none"/>
        <rect x="30" y="37" width="70" height="12" rx="2" stroke="${c}" stroke-width="1" fill="none"/>
        <rect x="30" y="52" width="70" height="12" rx="2" stroke="${c}" stroke-width="1" fill="none"/>
        <rect x="30" y="67" width="70" height="12" rx="2" stroke="${c}" stroke-width="1" fill="none"/>
        ${lbl(65, 31, 'ALU0', c, 'middle', '7')}
        ${lbl(65, 46, 'ALU1', c, 'middle', '7')}
        ${lbl(65, 61, 'ALU2', c, 'middle', '7')}
        ${lbl(65, 76, 'ALU3', c, 'middle', '7')}
        <line x1="5" y1="28" x2="20" y2="28" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="43" x2="20" y2="43" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="58" x2="20" y2="58" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="73" x2="20" y2="73" stroke="${c}" stroke-width="1"/>
        <line x1="110" y1="28" x2="125" y2="28" stroke="${c}" stroke-width="1"/>
        <line x1="110" y1="43" x2="125" y2="43" stroke="${c}" stroke-width="1"/>
        <line x1="110" y1="58" x2="125" y2="58" stroke="${c}" stroke-width="1"/>
        <line x1="110" y1="73" x2="125" y2="73" stroke="${c}" stroke-width="1"/>
        <line x1="65" y1="5" x2="65" y2="15" stroke="${c}" stroke-width="1.2"/>
        ${lbl(63, 4, 'op', c, 'middle', '7')}
        ${lbl(2, 26, 'a/b', c, 'start', '7')}
        ${lbl(127, 30, 'y', c, 'start', '7')}
      </svg>`,
      verilog: `genvar i;\ngenerate for (i=0; i<4; i=i+1) begin: lane\n  always @(*) case (op)\n    2'b00: y[i] = a[i] + b[i];\n    2'b01: y[i] = a[i] - b[i];\n    2'b10: y[i] = a[i] & b[i];\n    2'b11: y[i] = a[i] | b[i];\n  endcase\nend endgenerate`,
      systemverilog_snippet: `genvar i;\ngenerate for (i=0; i<4; i=i+1) begin: lane\n  always_comb case (op)\n    2'b00: y[i] = a[i] + b[i];\n    2'b01: y[i] = a[i] - b[i];\n    2'b10: y[i] = a[i] & b[i];\n    2'b11: y[i] = a[i] | b[i];\n  endcase\nend endgenerate`,
      python_snippet: `for i in range(4):\n  with m.Switch(op):\n    with m.Case(0): m.d.comb += y[i].eq(a[i] + b[i])\n    with m.Case(1): m.d.comb += y[i].eq(a[i] - b[i])\n    with m.Case(2): m.d.comb += y[i].eq(a[i] & b[i])\n    with m.Case(3): m.d.comb += y[i].eq(a[i] | b[i])`,
      truthTable: null,
    },
    {
      name: 'MAC Array',
      id: 'mac_array_4x4',
      promptText: 'Design a 4x4 systolic MAC array for matrix multiplication (basis of tensor cores)',
      svg: (c) => {
        const cells = []
        for (let r = 0; r < 4; r++) {
          for (let col = 0; col < 4; col++) {
            const x = 25 + col * 18
            const y = 22 + r * 14
            cells.push(`<rect x="${x}" y="${y}" width="14" height="10" rx="1.5" stroke="${c}" stroke-width="1" fill="none"/>`)
            cells.push(`<line x1="${x + 14}" y1="${y + 5}" x2="${x + 18}" y2="${y + 5}" stroke="${c}" stroke-width="0.8" stroke-dasharray="2,1.5"/>`)
            cells.push(`<line x1="${x + 7}" y1="${y + 10}" x2="${x + 7}" y2="${y + 14}" stroke="${c}" stroke-width="0.8" stroke-dasharray="2,1.5"/>`)
          }
        }
        return `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
          <rect x="18" y="15" width="86" height="72" rx="3" stroke="${c}" stroke-width="1.6" fill="none"/>
          ${cells.join('')}
          ${lbl(60, 95, 'MAC ARRAY', c, 'middle', '8')}
          <line x1="5" y1="25" x2="18" y2="25" stroke="${c}" stroke-width="1"/>
          <line x1="5" y1="50" x2="18" y2="50" stroke="${c}" stroke-width="1"/>
          <line x1="60" y1="5" x2="60" y2="15" stroke="${c}" stroke-width="1"/>
          ${lbl(2, 24, 'A', c, 'start', '7')}
          ${lbl(2, 49, 'B', c, 'start', '7')}
        </svg>`
      },
      verilog: `genvar r, k;\ngenerate for (r=0; r<4; r=r+1) begin: row\n  for (k=0; k<4; k=k+1) begin: col\n    always @(posedge clk)\n      if (rst) acc[r][k] <= 0;\n      else     acc[r][k] <= acc[r][k] + a[r] * b[k];\n  end\nend endgenerate`,
      systemverilog_snippet: `genvar r, k;\ngenerate for (r=0; r<4; r=r+1) begin: row\n  for (k=0; k<4; k=k+1) begin: col\n    always_ff @(posedge clk)\n      if (rst) acc[r][k] <= 0;\n      else     acc[r][k] <= acc[r][k] + a[r] * b[k];\n  end\nend endgenerate`,
      python_snippet: `for r in range(4):\n  for k in range(4):\n    with m.If(rst): m.d.sync += acc[r][k].eq(0)\n    with m.Else():  m.d.sync += acc[r][k].eq(acc[r][k] + a[r] * b[k])`,
      truthTable: null,
    },
    {
      name: 'Crossbar Switch',
      id: 'crossbar_4x4',
      promptText: 'Design a 4x4 crossbar switch routing any input to any output',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="30" y="15" width="60" height="70" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="30" y1="25" x2="90" y2="75" stroke="${c}" stroke-width="0.9"/>
        <line x1="30" y1="40" x2="90" y2="60" stroke="${c}" stroke-width="0.9"/>
        <line x1="30" y1="55" x2="90" y2="45" stroke="${c}" stroke-width="0.9"/>
        <line x1="30" y1="70" x2="90" y2="30" stroke="${c}" stroke-width="0.9"/>
        <line x1="30" y1="25" x2="90" y2="25" stroke="${c}" stroke-width="0.9"/>
        <line x1="30" y1="75" x2="90" y2="75" stroke="${c}" stroke-width="0.9"/>
        ${lbl(60, 95, '4x4 XBAR', c, 'middle', '8')}
        <line x1="5" y1="25" x2="30" y2="25" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="40" x2="30" y2="40" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="55" x2="30" y2="55" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="70" x2="30" y2="70" stroke="${c}" stroke-width="1"/>
        <line x1="90" y1="25" x2="115" y2="25" stroke="${c}" stroke-width="1"/>
        <line x1="90" y1="40" x2="115" y2="40" stroke="${c}" stroke-width="1"/>
        <line x1="90" y1="55" x2="115" y2="55" stroke="${c}" stroke-width="1"/>
        <line x1="90" y1="70" x2="115" y2="70" stroke="${c}" stroke-width="1"/>
        ${lbl(2, 24, 'in0', c, 'start', '7')}
        ${lbl(117, 27, 'o0', c, 'start', '7')}
      </svg>`,
      verilog: `always @(*) begin\n  out0 = in[sel0];\n  out1 = in[sel1];\n  out2 = in[sel2];\n  out3 = in[sel3];\nend`,
      systemverilog_snippet: `always_comb begin\n  out0 = in[sel0];\n  out1 = in[sel1];\n  out2 = in[sel2];\n  out3 = in[sel3];\nend`,
      python_snippet: `m.d.comb += out0.eq(ins[sel0])\nm.d.comb += out1.eq(ins[sel1])\nm.d.comb += out2.eq(ins[sel2])\nm.d.comb += out3.eq(ins[sel3])`,
      truthTable: null,
    },
    {
      name: 'Pipeline Reg',
      id: 'pipeline_register',
      promptText: 'Design a pipeline register stage with enable',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="50" y="12" width="20" height="76" rx="2" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="10" y1="25" x2="50" y2="25" stroke="${c}" stroke-width="1"/>
        <line x1="10" y1="40" x2="50" y2="40" stroke="${c}" stroke-width="1"/>
        <line x1="10" y1="55" x2="50" y2="55" stroke="${c}" stroke-width="1"/>
        <line x1="10" y1="70" x2="50" y2="70" stroke="${c}" stroke-width="1"/>
        <line x1="70" y1="25" x2="110" y2="25" stroke="${c}" stroke-width="1"/>
        <line x1="70" y1="40" x2="110" y2="40" stroke="${c}" stroke-width="1"/>
        <line x1="70" y1="55" x2="110" y2="55" stroke="${c}" stroke-width="1"/>
        <line x1="70" y1="70" x2="110" y2="70" stroke="${c}" stroke-width="1"/>
        <polygon points="50,82 60,90 50,98" stroke="${c}" stroke-width="1" fill="none"/>
        ${lbl(2, 28, 'din', c, 'start', '7')}
        ${lbl(112, 28, 'dout', c, 'start', '7')}
        ${lbl(60, 9, 'PIPE', c, 'middle', '8')}
      </svg>`,
      verilog: `always @(posedge clk)\n  if (en) data_out <= data_in;`,
      systemverilog_snippet: `always_ff @(posedge clk)\n  if (en) data_out <= data_in;`,
      python_snippet: `with m.If(en): m.d.sync += data_out.eq(data_in)`,
      truthTable: null,
    },
    {
      name: 'Scratchpad Mem',
      id: 'scratchpad_memory',
      promptText: 'Design a multi-bank scratchpad memory for thread-group shared data (CUDA __shared__ equivalent)',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="30" y="10" width="60" height="80" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="30" y1="30" x2="90" y2="30" stroke="${c}" stroke-width="1"/>
        <line x1="30" y1="50" x2="90" y2="50" stroke="${c}" stroke-width="1"/>
        <line x1="30" y1="70" x2="90" y2="70" stroke="${c}" stroke-width="1"/>
        ${lbl(60, 24, 'B0', c, 'middle', '8')}
        ${lbl(60, 44, 'B1', c, 'middle', '8')}
        ${lbl(60, 64, 'B2', c, 'middle', '8')}
        ${lbl(60, 84, 'B3', c, 'middle', '8')}
        <line x1="5" y1="20" x2="30" y2="20" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="40" x2="30" y2="40" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="60" x2="30" y2="60" stroke="${c}" stroke-width="1"/>
        <line x1="90" y1="50" x2="115" y2="50" stroke="${c}" stroke-width="1"/>
        <polygon points="30,80 38,86 30,92" stroke="${c}" stroke-width="1" fill="none"/>
        ${lbl(2, 22, 'waddr', c, 'start', '7')}
        ${lbl(2, 42, 'wdata', c, 'start', '7')}
        ${lbl(2, 62, 'we', c, 'start', '7')}
        ${lbl(117, 52, 'rdata', c, 'start', '7')}
      </svg>`,
      verilog: `reg [31:0] mem [0:255];\nalways @(posedge clk)\n  if (we) mem[waddr] <= wdata;\nassign rdata = mem[raddr];`,
      systemverilog_snippet: `logic [31:0] mem [0:255];\nalways_ff @(posedge clk)\n  if (we) mem[waddr] <= wdata;\nassign rdata = mem[raddr];`,
      python_snippet: `mem = Memory(width=32, depth=256)\nm.submodules.smem = mem\nwp = mem.write_port(); rp = mem.read_port()\nm.d.comb += [wp.addr.eq(waddr), wp.data.eq(wdata), wp.en.eq(we), rp.addr.eq(raddr), rdata.eq(rp.data)]`,
      truthTable: null,
    },
    {
      name: 'Warp Scheduler',
      id: 'warp_scheduler',
      promptText: 'Design a round-robin warp scheduler that selects one of 4 thread groups per cycle',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="25,20 25,80 95,55 95,45" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="28" x2="25" y2="28" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="42" x2="25" y2="42" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="58" x2="25" y2="58" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="72" x2="25" y2="72" stroke="${c}" stroke-width="1"/>
        <line x1="95" y1="50" x2="115" y2="50" stroke="${c}" stroke-width="1.5"/>
        <polygon points="25,82 35,89 25,96" stroke="${c}" stroke-width="1" fill="none"/>
        <path d="M55,32 A12,12 0 1,1 55,68" stroke="${c}" stroke-width="1" fill="none"/>
        <polygon points="55,32 60,34 58,28" stroke="${c}" stroke-width="0.8" fill="${c}"/>
        ${lbl(2, 26, 'w0', c, 'start', '7')}
        ${lbl(2, 40, 'w1', c, 'start', '7')}
        ${lbl(2, 56, 'w2', c, 'start', '7')}
        ${lbl(2, 70, 'w3', c, 'start', '7')}
        ${lbl(117, 52, 'active', c, 'start', '7')}
      </svg>`,
      verilog: `always @(posedge clk)\n  if (rst) curr <= 0;\n  else     curr <= curr + 1;\nassign active_warp = curr;`,
      systemverilog_snippet: `always_ff @(posedge clk)\n  if (rst) curr <= 0;\n  else     curr <= curr + 1;\nassign active_warp = curr;`,
      python_snippet: `with m.If(rst): m.d.sync += curr.eq(0)\nwith m.Else(): m.d.sync += curr.eq(curr + 1)\nm.d.comb += active_warp.eq(curr)`,
      truthTable: null,
    },
    {
      name: 'Z-Buffer Cmp',
      id: 'z_buffer_compare',
      promptText: 'Design a Z-buffer depth comparison unit for graphics rendering',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="20" width="75" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="40,35 70,50 40,65" stroke="${c}" stroke-width="1.2" fill="none"/>
        ${lbl(55, 53, '<', c, 'middle', '11')}
        <line x1="5" y1="35" x2="20" y2="35" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="65" x2="20" y2="65" stroke="${c}" stroke-width="1"/>
        <line x1="95" y1="50" x2="115" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 33, 'z_new', c, 'start', '7')}
        ${lbl(2, 63, 'z_old', c, 'start', '7')}
        ${lbl(117, 52, 'pass', c, 'start', '7')}
      </svg>`,
      verilog: `assign pass = (z_new < z_old);\nassign z_out = pass ? z_new : z_old;`,
      systemverilog_snippet: `assign pass = (z_new < z_old);\nassign z_out = pass ? z_new : z_old;`,
      python_snippet: `m.d.comb += pass_.eq(z_new < z_old)\nm.d.comb += z_out.eq(Mux(z_new < z_old, z_new, z_old))`,
      truthTable: null,
    },
    {
      name: 'Vec Reg File',
      id: 'vector_register_file',
      promptText: 'Design a 32-entry vector register file with 128-bit lanes, 2 read ports and 1 write port',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="30" y="10" width="60" height="80" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="30" y1="25" x2="90" y2="25" stroke="${c}" stroke-width="0.8"/>
        <line x1="30" y1="40" x2="90" y2="40" stroke="${c}" stroke-width="0.8"/>
        <line x1="30" y1="55" x2="90" y2="55" stroke="${c}" stroke-width="0.8"/>
        <line x1="30" y1="70" x2="90" y2="70" stroke="${c}" stroke-width="0.8"/>
        ${lbl(60, 50, 'VRF', c, 'middle', '11')}
        <line x1="5" y1="20" x2="30" y2="20" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="35" x2="30" y2="35" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="55" x2="30" y2="55" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="75" x2="30" y2="75" stroke="${c}" stroke-width="1"/>
        <line x1="90" y1="35" x2="115" y2="35" stroke="${c}" stroke-width="1"/>
        <line x1="90" y1="65" x2="115" y2="65" stroke="${c}" stroke-width="1"/>
        <polygon points="30,82 38,88 30,94" stroke="${c}" stroke-width="1" fill="none"/>
        ${lbl(2, 22, 'ra1', c, 'start', '7')}
        ${lbl(2, 37, 'ra2', c, 'start', '7')}
        ${lbl(2, 57, 'wa', c, 'start', '7')}
        ${lbl(2, 77, 'wd', c, 'start', '7')}
        ${lbl(117, 37, 'rd1', c, 'start', '7')}
        ${lbl(117, 67, 'rd2', c, 'start', '7')}
      </svg>`,
      verilog: `reg [127:0] vregs [0:31];\nalways @(posedge clk)\n  if (we) vregs[wa] <= wdata;\nassign rd1 = vregs[ra1];\nassign rd2 = vregs[ra2];`,
      systemverilog_snippet: `logic [127:0] vregs [0:31];\nalways_ff @(posedge clk)\n  if (we) vregs[wa] <= wdata;\nassign rd1 = vregs[ra1];\nassign rd2 = vregs[ra2];`,
      python_snippet: `vregs = Memory(width=128, depth=32)\nm.submodules.vregs = vregs\nwp = vregs.write_port(); rp1 = vregs.read_port(); rp2 = vregs.read_port()\nm.d.comb += [wp.addr.eq(wa), wp.data.eq(wdata), wp.en.eq(we), rp1.addr.eq(ra1), rd1.eq(rp1.data), rp2.addr.eq(ra2), rd2.eq(rp2.data)]`,
      truthTable: null,
    },
  ],

  'Decoders': [
    {
      name: '2:4 Decoder',
      id: 'dec24',
      promptText: 'Design a 2-to-4 decoder with enable',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="85,10 25,25 25,75 85,90" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="25" x2="105" y2="25" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="42" x2="105" y2="42" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="58" x2="105" y2="58" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="75" x2="105" y2="75" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'a[1:0]', c)}${lbl(55, 55, '2:4', c, 'middle', '10')}
        ${lbl(107, 23, 'y0', c)}${lbl(107, 40, 'y1', c)}${lbl(107, 56, 'y2', c)}${lbl(107, 73, 'y3', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case (a)\n    2'b00: y = 4'b0001;\n    2'b01: y = 4'b0010;\n    2'b10: y = 4'b0100;\n    2'b11: y = 4'b1000;\n    default: y = 4'b0000;\n  endcase\nend`,
      systemverilog_snippet: `always_comb begin\n  case (a)\n    2'b00: y = 4'b0001;\n    2'b01: y = 4'b0010;\n    2'b10: y = 4'b0100;\n    2'b11: y = 4'b1000;\n    default: y = 4'b0000;\n  endcase\nend`,
      python_snippet: `with m.Switch(a):\n  with m.Case(0): m.d.comb += y.eq(0b0001)\n  with m.Case(1): m.d.comb += y.eq(0b0010)\n  with m.Case(2): m.d.comb += y.eq(0b0100)\n  with m.Case(3): m.d.comb += y.eq(0b1000)`,
      truthTable: { headers: ['A1','A0','Y3','Y2','Y1','Y0'], rows: [['0','0','0','0','0','1'],['0','1','0','0','1','0'],['1','0','0','1','0','0'],['1','1','1','0','0','0']] },
    },
    {
      name: 'Priority Enc',
      id: 'prienc',
      promptText: 'Design an 8-to-3 priority encoder',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="25,10 85,25 85,75 25,90" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="25" x2="25" y2="25" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="42" x2="25" y2="42" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="58" x2="25" y2="58" stroke="${c}" stroke-width="1"/>
        <line x1="5" y1="75" x2="25" y2="75" stroke="${c}" stroke-width="1"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(55, 55, 'PRI', c, 'middle', '10')}
        ${lbl(107, 52, 'y[1:0]', c)}
      </svg>`,
      verilog: `always @(*) begin\n  casez (in)\n    4'b1???: y = 2'd3;\n    4'b01??: y = 2'd2;\n    4'b001?: y = 2'd1;\n    4'b0001: y = 2'd0;\n    default: y = 2'd0;\n  endcase\nend`,
      systemverilog_snippet: `always_comb begin\n  casez (in)\n    4'b1???: y = 2'd3;\n    4'b01??: y = 2'd2;\n    4'b001?: y = 2'd1;\n    4'b0001: y = 2'd0;\n    default: y = 2'd0;\n  endcase\nend`,
      python_snippet: `with m.If(in_[3]):   m.d.comb += y.eq(3)\nwith m.Elif(in_[2]): m.d.comb += y.eq(2)\nwith m.Elif(in_[1]): m.d.comb += y.eq(1)\nwith m.Else():       m.d.comb += y.eq(0)`,
    },
  ],
}
