module mux4 (
  input wire [3:0] in,
  input wire [1:0] sel,
  output wire out
);
  assign out = in[sel];
endmodule
