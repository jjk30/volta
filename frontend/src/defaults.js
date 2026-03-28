export const DEFAULT_DESIGN = `module alu(
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

endmodule`

export const DEFAULT_TESTBENCH = `\`timescale 1ns / 1ps

module tb_alu;
  reg  [3:0] a, b;
  reg  [1:0] op;
  wire [3:0] result;
  wire       carry_out;
  wire       zero_flag;

  alu uut (
    .a(a), .b(b), .op(op),
    .result(result),
    .carry_out(carry_out),
    .zero_flag(zero_flag)
  );

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_alu);

    // ADD: 3 + 5 = 8
    a = 4'd3; b = 4'd5; op = 2'b00; #10;

    // ADD overflow: 15 + 1 = 0, carry = 1
    a = 4'd15; b = 4'd1; op = 2'b00; #10;

    // SUB: 7 - 2 = 5
    a = 4'd7; b = 4'd2; op = 2'b01; #10;

    // AND: 1100 & 1010 = 1000
    a = 4'b1100; b = 4'b1010; op = 2'b10; #10;

    // OR: 1100 | 1010 = 1110
    a = 4'b1100; b = 4'b1010; op = 2'b11; #10;

    // Zero flag: 0 + 0 = 0
    a = 4'd0; b = 4'd0; op = 2'b00; #10;

    // SUB: 5 - 5 = 0, zero flag
    a = 4'd5; b = 4'd5; op = 2'b01; #10;

    // AND: 1111 & 0000 = 0000
    a = 4'b1111; b = 4'b0000; op = 2'b10; #10;

    #10;
    $finish;
  end

endmodule`
