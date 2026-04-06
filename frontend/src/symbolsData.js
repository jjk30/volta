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
  'Decoders',
]

export const SYMBOLS = {
  'Logic Gates': [
    {
      name: 'AND',
      id: 'and',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,25 H55 A30,25 0 0 1 55,75 H20 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="40" x2="20" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="20" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = a & b;`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','0'],['0','1','0'],['1','0','0'],['1','1','1']] },
    },
    {
      name: 'OR',
      id: 'or',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,25 Q40,50 20,75 Q55,75 85,50 Q55,25 20,25 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="40" x2="28" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="28" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = a | b;`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','0'],['0','1','1'],['1','0','1'],['1','1','1']] },
    },
    {
      name: 'NOT',
      id: 'not',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,25 80,50 20,75" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${bubble(86, 50, c)}
        <line x1="5" y1="50" x2="20" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'a', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = ~a;`,
      truthTable: { headers: ['A','Y'], rows: [['0','1'],['1','0']] },
    },
    {
      name: 'NAND',
      id: 'nand',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,25 H50 A30,25 0 0 1 50,75 H20 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${bubble(84, 50, c)}
        <line x1="5" y1="40" x2="20" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="20" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="88" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = ~(a & b);`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','1'],['0','1','1'],['1','0','1'],['1','1','0']] },
    },
    {
      name: 'NOR',
      id: 'nor',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,25 Q40,50 20,75 Q55,75 80,50 Q55,25 20,25 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${bubble(84, 50, c)}
        <line x1="5" y1="40" x2="28" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="28" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="88" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = ~(a | b);`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','1'],['0','1','0'],['1','0','0'],['1','1','0']] },
    },
    {
      name: 'XOR',
      id: 'xor',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M25,25 Q45,50 25,75 Q60,75 85,50 Q60,25 25,25 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <path d="M18,25 Q38,50 18,75" stroke="${c}" stroke-width="1.5" fill="none"/>
        <line x1="5" y1="40" x2="28" y2="40" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="60" x2="28" y2="60" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 38, 'a', c)}${lbl(2, 58, 'b', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = a ^ b;`,
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','0'],['0','1','1'],['1','0','1'],['1','1','0']] },
    },
    {
      name: 'XNOR',
      id: 'xnor',
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
      truthTable: { headers: ['A','B','Y'], rows: [['0','0','1'],['0','1','0'],['1','0','0'],['1','1','1']] },
    },
    {
      name: 'Buffer',
      id: 'buffer',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="25,25 85,50 25,75" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'a', c)}${lbl(107, 52, 'y', c)}
      </svg>`,
      verilog: `assign y = a;`,
      truthTable: { headers: ['A','Y'], rows: [['0','0'],['1','1']] },
    },
    {
      name: 'Tri-state',
      id: 'tristate',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="25,30 80,50 25,70" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="80" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="52" y1="15" x2="52" y2="30" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'a', c)}${lbl(107, 52, 'y', c)}${lbl(55, 14, 'en', c)}
      </svg>`,
      verilog: `assign y = en ? a : 1'bz;`,
      truthTable: { headers: ['EN','A','Y'], rows: [['0','X','Z'],['1','0','0'],['1','1','1']] },
    },
  ],

  'Multiplexers': [
    {
      name: '2:1 MUX',
      id: 'mux2',
      svg: (c) => `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg">
        <polygon points="25,15 85,30 85,70 25,85" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="65" x2="25" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="55" y1="85" x2="55" y2="72" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 33, 'in0', c)}${lbl(2, 63, 'in1', c)}${lbl(107, 52, 'out', c)}${lbl(58, 97, 'sel', c)}
      </svg>`,
      verilog: `assign out = sel ? in1 : in0;`,
      truthTable: { headers: ['S','Y'], rows: [['0','I0'],['1','I1']] },
    },
    {
      name: '4:1 MUX',
      id: 'mux4',
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
      truthTable: { headers: ['S1','S0','Y'], rows: [['0','0','I0'],['0','1','I1'],['1','0','I2'],['1','1','I3']] },
    },
    {
      name: '8:1 MUX',
      id: 'mux8',
      svg: (c) => `<svg viewBox="0 0 120 108" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,5 80,20 80,80 20,95" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${[0,1,2,3,4,5,6,7].map(i => `<line x1="5" y1="${15+i*10}" x2="20" y2="${15+i*10}" stroke="${c}" stroke-width="1"/>`).join('')}
        <line x1="80" y1="50" x2="105" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="50" y1="95" x2="50" y2="84" stroke="${c}" stroke-width="1.5"/>
        ${lbl(50, 50, '8:1', c, 'middle', '10')}${lbl(107, 52, 'out', c)}${lbl(53, 104, 'sel', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case (sel)\n    3'd0: out = in0;\n    3'd1: out = in1;\n    3'd2: out = in2;\n    3'd3: out = in3;\n    3'd4: out = in4;\n    3'd5: out = in5;\n    3'd6: out = in6;\n    3'd7: out = in7;\n    default: out = 0;\n  endcase\nend`,
    },
    {
      name: '1:2 DEMUX',
      id: 'demux2',
      svg: (c) => `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg">
        <polygon points="85,15 25,30 25,70 85,85" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="35" x2="105" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="65" x2="105" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="55" y1="85" x2="55" y2="72" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'in', c)}${lbl(107, 33, 'y0', c)}${lbl(107, 63, 'y1', c)}${lbl(58, 97, 'sel', c)}
      </svg>`,
      verilog: `assign y0 = sel ? 1'b0 : in;\nassign y1 = sel ? in : 1'b0;`,
    },
    {
      name: '1:4 DEMUX',
      id: 'demux4',
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
    },
  ],

  'ALU & Arithmetic': [
    {
      name: 'ALU',
      id: 'alu',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M20,15 H60 L90,50 L60,85 H20 L35,50 Z" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="30" x2="20" y2="30" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="70" x2="20" y2="70" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="40" y1="15" x2="40" y2="5" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 28, 'a', c)}${lbl(2, 68, 'b', c)}${lbl(112, 52, 'y', c)}${lbl(43, 5, 'op', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case (op)\n    2'b00: y = a + b;\n    2'b01: y = a - b;\n    2'b10: y = a & b;\n    2'b11: y = a | b;\n    default: y = 0;\n  endcase\nend`,
    },
    {
      name: 'Full Adder',
      id: 'fulladd',
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
      truthTable: { headers: ['A','B','Cin','S','Cout'], rows: [['0','0','0','0','0'],['0','0','1','1','0'],['0','1','0','1','0'],['0','1','1','0','1'],['1','0','0','1','0'],['1','0','1','0','1'],['1','1','0','0','1'],['1','1','1','1','1']] },
    },
    {
      name: 'Half Adder',
      id: 'halfadd',
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
      truthTable: { headers: ['A','B','S','Cout'], rows: [['0','0','0','0'],['0','1','1','0'],['1','0','1','0'],['1','1','0','1']] },
    },
    {
      name: 'Comparator',
      id: 'cmp',
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
      truthTable: { headers: ['A vs B','gt','eq','lt'], rows: [['A>B','1','0','0'],['A=B','0','1','0'],['A<B','0','0','1']] },
    },
    {
      name: 'Shifter',
      id: 'shifter',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 48, '>>', c, 'middle', '12')}${lbl(55, 62, '<<', c, 'middle', '12')}
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="55" y1="20" x2="55" y2="8" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'in', c)}${lbl(112, 52, 'out', c)}${lbl(58, 7, 'shamt', c)}
      </svg>`,
      verilog: `assign out = left ? (in << shamt) : (in >> shamt);`,
    },
  ],

  'Flip-Flops': [
    {
      name: 'D Flip-Flop',
      id: 'dff',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="15" width="60" height="70" rx="2" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="25,72 35,80 25,88" stroke="${c}" stroke-width="1" fill="none"/>
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="80" x2="25" y2="80" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="35" x2="110" y2="35" stroke="${c}" stroke-width="1.5"/>
        ${lbl(28, 38, 'D', c)}${lbl(80, 38, 'Q', c, 'end')}${lbl(2, 33, 'd', c)}${lbl(2, 78, 'clk', c)}${lbl(112, 38, 'q', c)}
      </svg>`,
      verilog: `always @(posedge clk)\n  q <= d;`,
      truthTable: { headers: ['CLK','D','Q(next)'], rows: [['↑','0','0'],['↑','1','1'],['0','X','Q']] },
    },
    {
      name: 'JK Flip-Flop',
      id: 'jkff',
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
      truthTable: { headers: ['J','K','Q(next)'], rows: [['0','0','Q'],['0','1','0'],['1','0','1'],['1','1','~Q']] },
    },
    {
      name: 'T Flip-Flop',
      id: 'tff',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="15" width="60" height="70" rx="2" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="25,72 35,80 25,88" stroke="${c}" stroke-width="1" fill="none"/>
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="80" x2="25" y2="80" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="35" x2="110" y2="35" stroke="${c}" stroke-width="1.5"/>
        ${lbl(28, 38, 'T', c)}${lbl(80, 38, 'Q', c, 'end')}${lbl(2, 33, 't', c)}${lbl(2, 78, 'clk', c)}${lbl(112, 38, 'q', c)}
      </svg>`,
      verilog: `always @(posedge clk)\n  if (t) q <= ~q;`,
      truthTable: { headers: ['T','Q(next)'], rows: [['0','Q'],['1','~Q']] },
    },
    {
      name: 'SR Latch',
      id: 'srlatch',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="2" stroke="${c}" stroke-width="1.8" fill="none"/>
        <line x1="5" y1="35" x2="25" y2="35" stroke="${c}" stroke-width="1.5"/>
        <line x1="5" y1="65" x2="25" y2="65" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(28, 38, 'S', c)}${lbl(28, 68, 'R', c)}${lbl(80, 53, 'Q', c, 'end')}
        ${lbl(2, 33, 's', c)}${lbl(2, 63, 'r', c)}${lbl(112, 52, 'q', c)}
      </svg>`,
      verilog: `always @(*) begin\n  case ({s, r})\n    2'b10: q = 1'b1;\n    2'b01: q = 1'b0;\n    2'b00: q = q;\n    default: q = 1'bx;\n  endcase\nend`,
      truthTable: { headers: ['S','R','Q(next)'], rows: [['0','0','Q'],['0','1','0'],['1','0','1'],['1','1','?']] },
    },
  ],

  'Memory': [
    {
      name: 'Register',
      id: 'reg',
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
    },
    {
      name: 'RAM',
      id: 'ram',
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
    },
    {
      name: 'ROM',
      id: 'rom',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 55, 'ROM', c, 'middle', '12')}
        <line x1="5" y1="50" x2="25" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'addr', c)}${lbl(112, 52, 'dout', c)}
      </svg>`,
      verilog: `assign dout = rom_data[addr];`,
    },
    {
      name: 'Reg File',
      id: 'regfile',
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
    },
  ],

  'CPU Components': [
    {
      name: 'Prog Counter',
      id: 'pc',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="25" y="20" width="60" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        <polygon points="25,68 35,75 25,82" stroke="${c}" stroke-width="1" fill="none"/>
        ${lbl(55, 52, 'PC', c, 'middle', '14')}
        <line x1="5" y1="75" x2="25" y2="75" stroke="${c}" stroke-width="1.5"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 73, 'clk', c)}${lbl(112, 52, 'pc', c)}
      </svg>`,
      verilog: `always @(posedge clk)\n  if (rst) pc <= 0;\n  else pc <= pc + 4;`,
    },
    {
      name: 'Control Unit',
      id: 'ctrl',
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
    },
    {
      name: 'Instr Mem',
      id: 'imem',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="20" width="70" height="60" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 48, 'IMEM', c, 'middle', '11')}
        <line x1="5" y1="50" x2="20" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, 'pc', c)}${lbl(112, 52, 'instr', c)}
      </svg>`,
      verilog: `assign instr = imem[pc[9:2]];`,
    },
    {
      name: 'Data Mem',
      id: 'dmem',
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
    },
    {
      name: 'Sign Extend',
      id: 'sext',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="25" width="70" height="50" rx="3" stroke="${c}" stroke-width="1.8" fill="none"/>
        ${lbl(55, 55, 'SEXT', c, 'middle', '11')}
        <line x1="5" y1="50" x2="20" y2="50" stroke="${c}" stroke-width="1.5"/>
        <line x1="90" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(2, 48, '16b', c)}${lbl(112, 52, '32b', c)}
      </svg>`,
      verilog: `assign out = {{16{in[15]}}, in};`,
    },
    {
      name: 'Clock Gen',
      id: 'clkgen',
      svg: (c) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="55" cy="50" r="30" stroke="${c}" stroke-width="1.8" fill="none"/>
        <path d="M40,50 L40,35 L55,35 L55,65 L70,65 L70,50" stroke="${c}" stroke-width="1.5" fill="none"/>
        <line x1="85" y1="50" x2="110" y2="50" stroke="${c}" stroke-width="1.5"/>
        ${lbl(112, 52, 'clk', c)}
      </svg>`,
      verilog: `always #5 clk = ~clk;`,
    },
  ],

  'Decoders': [
    {
      name: '2:4 Decoder',
      id: 'dec24',
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
      truthTable: { headers: ['A1','A0','Y3','Y2','Y1','Y0'], rows: [['0','0','0','0','0','1'],['0','1','0','0','1','0'],['1','0','0','1','0','0'],['1','1','1','0','0','0']] },
    },
    {
      name: 'Priority Enc',
      id: 'prienc',
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
    },
  ],
}
