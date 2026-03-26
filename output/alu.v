module alu(
  input [3:0] a,
  input [3:0] b,
  input [1:0] op,
  output reg [3:0] result,
  output reg carry_out,
  output reg zero_flag
);

always @(*) begin
  carry_out = 1'b0;
  result = 4'd0;
  zero_flag = 1'b0;
  case (op)
    2'b00: begin
      {carry_out, result} = a + b;
    end
    2'b01: begin
      {carry_out, result} = a - b;
    end
    2'b10: begin
      result = a & b;
    end
    2'b11: begin
      result = a | b;
    end
    default: begin
      result = 4'd0;
    end
  endcase
  zero_flag = (result == 4'd0);
end

endmodule