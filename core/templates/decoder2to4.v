module decoder2to4 (
  input wire [1:0] in,
  input wire en,
  output reg [3:0] out
);
  always @(*) begin
    out = 4'b0000;
    if (en)
      out[in] = 1'b1;
  end
endmodule
