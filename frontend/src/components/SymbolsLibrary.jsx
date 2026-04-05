import { useState } from 'react'

const SNIPPETS = [
  {
    title: 'D Flip-Flop',
    preview: 'always @(posedge clk)\n  if (rst) q <= 0; else q <= d;',
    code: `// D Flip-Flop with synchronous reset
always @(posedge clk) begin
  if (rst)
    q <= 1'b0;
  else
    q <= d;
end`,
  },
  {
    title: '2:1 Mux',
    preview: 'assign out = sel ? in1 : in0;',
    code: `// 2-to-1 Multiplexer
assign out = sel ? in1 : in0;`,
  },
  {
    title: '4-bit Counter',
    preview: 'always @(posedge clk)\n  if (rst) count <= 0; else count <= count + 1;',
    code: `// 4-bit Counter with reset and enable
reg [3:0] count;
always @(posedge clk) begin
  if (rst)
    count <= 4'd0;
  else if (en)
    count <= count + 4'd1;
end`,
  },
  {
    title: 'Full Adder',
    preview: 'assign {cout, sum} = a + b + cin;',
    code: `// Full Adder
assign {cout, sum} = a + b + cin;`,
  },
  {
    title: 'Shift Register',
    preview: 'always @(posedge clk)\n  shift_reg <= {shift_reg[6:0], din};',
    code: `// 8-bit Shift Register
reg [7:0] shift_reg;
always @(posedge clk) begin
  if (rst)
    shift_reg <= 8'd0;
  else
    shift_reg <= {shift_reg[6:0], din};
end`,
  },
  {
    title: 'FSM Template',
    preview: 'localparam IDLE=0, RUN=1, DONE=2;\nreg [1:0] state;',
    code: `// FSM Template (3-state)
localparam IDLE = 2'd0, RUN = 2'd1, DONE = 2'd2;
reg [1:0] state, next_state;

always @(posedge clk) begin
  if (rst) state <= IDLE;
  else state <= next_state;
end

always @(*) begin
  next_state = state;
  case (state)
    IDLE: if (start) next_state = RUN;
    RUN:  if (finish) next_state = DONE;
    DONE: next_state = IDLE;
    default: next_state = IDLE;
  endcase
end`,
  },
  {
    title: 'Register File',
    preview: 'reg [7:0] mem [0:3];\nassign rd = mem[addr];',
    code: `// 4-entry 8-bit Register File
reg [7:0] mem [0:3];

always @(posedge clk) begin
  if (wr_en)
    mem[wr_addr] <= wr_data;
end

assign rd_data = mem[rd_addr];`,
  },
  {
    title: 'Priority Encoder',
    preview: 'casez (in)\n  4\'b1???: out = 2\'d3;\n  ...',
    code: `// 4-bit Priority Encoder
reg [1:0] out;
reg valid;
always @(*) begin
  valid = 1'b1;
  casez (in)
    4'b1???: out = 2'd3;
    4'b01??: out = 2'd2;
    4'b001?: out = 2'd1;
    4'b0001: out = 2'd0;
    default: begin out = 2'd0; valid = 1'b0; end
  endcase
end`,
  },
  {
    title: 'Clock Divider',
    preview: 'always @(posedge clk)\n  if (counter == N-1) clk_out <= ~clk_out;',
    code: `// Clock Divider by N
parameter N = 4;
reg [$clog2(N)-1:0] counter;
reg clk_out;

always @(posedge clk) begin
  if (rst) begin
    counter <= 0;
    clk_out <= 1'b0;
  end else if (counter == N - 1) begin
    counter <= 0;
    clk_out <= ~clk_out;
  end else begin
    counter <= counter + 1;
  end
end`,
  },
]

export default function SymbolsLibrary({ onInsert }) {
  const [hovered, setHovered] = useState(null)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#000',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{
        padding: '3px 12px',
        fontSize: '11px',
        color: 'var(--accent)',
        fontWeight: 500,
        background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--border)',
        letterSpacing: '1px',
        flexShrink: 0,
      }}>
        SYMBOLS LIBRARY
      </div>
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        {SNIPPETS.map((s, i) => (
          <div
            key={i}
            onClick={() => onInsert(s.code)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{
              padding: '6px 8px',
              borderRadius: '3px',
              border: `1px solid ${hovered === i ? 'var(--accent)' : 'var(--border)'}`,
              background: hovered === i ? '#001a00' : '#050505',
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
          >
            <div style={{
              fontSize: '11px',
              color: hovered === i ? 'var(--accent)' : '#888',
              fontWeight: 600,
              marginBottom: '2px',
            }}>
              {s.title}
            </div>
            <div style={{
              fontSize: '9px',
              color: '#444',
              whiteSpace: 'pre',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxHeight: '24px',
              lineHeight: '12px',
            }}>
              {s.preview}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
