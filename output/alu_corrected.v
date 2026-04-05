module alu(
  input [3:0] a,
  input [3:0] b,
  input [1:0] op,
  output [3:0] result,
  output carry_out,
  output zero_flag
);

always @(*) begin
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
      result = 0;
    end
  endcase
  zero_flag = (result == 0);
end

endmodule