module encoder4to2 (
  input wire [3:0] in,
  output reg [1:0] out,
  output reg valid
);
  always @(*) begin
    valid = |in;
    casez (in)
      4'b1???: out = 2'b11;
      4'b01??: out = 2'b10;
      4'b001?: out = 2'b01;
      4'b0001: out = 2'b00;
      default: out = 2'b00;
    endcase
  end
endmodule
