"""
Unit tests for the regex-heavy post-processing functions in core/orchestrator.py
and backend/main.py.

These functions sit between the LLM and iverilog/Yosys, so a quiet regression
here silently breaks generation quality for an entire model run. The tests
below pin the *current* behavior with at least three cases each (happy path,
edge case, known-bug regression). They are pure-Python — no subprocess, no
LLM, no file I/O beyond inline strings.
"""

import pytest

from core.orchestrator import (
    _fix_verilog,
    _fix_number_literals,
    _fix_carry_logic,
    _fix_reg_declarations,
    _fix_duplicate_reg_declarations,
    _fix_missing_semicolons,
    _fix_undeclared_inputs,
    _fix_integer_placement,
    _fix_input_assignments,
)
from backend.main import (
    _fix_systemverilog_testbench,
    _fix_verify_timing,
)


# ---------------------------------------------------------------------------
# _fix_verilog — smoke test that the full chain runs without exploding and
# at least preserves a known-good module.
# ---------------------------------------------------------------------------

def test_fix_verilog_passes_through_clean_module():
    clean = (
        "module andgate(input a, input b, output y);\n"
        "  assign y = a & b;\n"
        "endmodule\n"
    )
    out = _fix_verilog(clean)
    # Don't insist on byte-equality — some sub-fixes touch whitespace or
    # add trailing newlines. The module signature must survive.
    assert "module andgate(input a, input b, output y);" in out
    assert "assign y = a & b;" in out
    assert "endmodule" in out


def test_fix_verilog_empty_string_does_not_crash():
    # An empty design should round-trip without raising.
    out = _fix_verilog("")
    assert isinstance(out, str)


def test_fix_verilog_applies_literal_rewrite():
    """End-to-end: feeding a design with a 4'd1100 mistake should produce a
    design with the corrected 4'b1100 literal."""
    bad = (
        "module m(input wire [3:0] a, output reg [3:0] y);\n"
        "  initial y = 4'd1100;\n"
        "endmodule\n"
    )
    out = _fix_verilog(bad)
    assert "4'b1100" in out
    assert "4'd1100" not in out


# ---------------------------------------------------------------------------
# _fix_number_literals — width-equals-digit-count heuristic only.
# ---------------------------------------------------------------------------

def test_number_literals_4d1100_becomes_binary():
    assert _fix_number_literals("a = 4'd1100;") == "a = 4'b1100;"


def test_number_literals_8d11110000_becomes_binary():
    assert _fix_number_literals("x = 8'd11110000;") == "x = 8'b11110000;"


def test_number_literals_valid_decimals_untouched():
    # 4'd9 has only one digit, so the count-equals-width rule fails → leave it.
    src = "y = 4'd9;"
    assert _fix_number_literals(src) == src


def test_number_literals_width_one_left_alone():
    # 1'd1 is ambiguous (decimal-or-binary) and the heuristic refuses to
    # touch width-1 literals.
    src = "carry = 1'd1;"
    assert _fix_number_literals(src) == src


def test_number_literals_non_binary_digits_untouched():
    # 8'd255 has non-{0,1} digits, so it stays as decimal.
    src = "v = 8'd255;"
    assert _fix_number_literals(src) == src


# ---------------------------------------------------------------------------
# _fix_carry_logic — overflow / underflow predicate rewrites.
# ---------------------------------------------------------------------------

def test_carry_logic_rewrites_overflow_compare():
    src = (
        "module m(input [3:0] a, input [3:0] b, output reg carry, output reg [3:0] r);\n"
        "  always @(*) begin\n"
        "    r = a + b;\n"
        "    carry <= (a + b) > 4'd15;\n"
        "  end\n"
        "endmodule\n"
    )
    out = _fix_carry_logic(src)
    # The original always-false predicate must be gone.
    assert "(a + b) > 4'd15" not in out
    # Either the fused-concat form or the wrap-detect form is acceptable.
    fused = "{carry, r} <= a + b;" in out
    wrap = "((a + b) < a)" in out
    assert fused or wrap


def test_carry_logic_rewrites_underflow_compare():
    src = (
        "module m(input [3:0] a, input [3:0] b, output reg borrow);\n"
        "  always @(*) begin\n"
        "    borrow <= (a - b) < 4'd0;\n"
        "  end\n"
        "endmodule\n"
    )
    out = _fix_carry_logic(src)
    assert "(a - b) < 4'd0" not in out
    assert "(a < b)" in out


def test_carry_logic_leaves_unrelated_lines_alone():
    src = (
        "module m;\n"
        "  assign x = (a + b) > 4'd7;  // half-range check, not overflow\n"
        "endmodule\n"
    )
    out = _fix_carry_logic(src)
    # 4'd7 is not 2**4 - 1, so the rewrite shouldn't touch it.
    assert "(a + b) > 4'd7" in out


# ---------------------------------------------------------------------------
# _fix_reg_declarations — promote output→output reg when used procedurally.
# ---------------------------------------------------------------------------

def test_reg_decl_promotes_output_used_in_always():
    src = (
        "module m(input clk, output [3:0] q);\n"
        "  always @(posedge clk) q <= q + 1;\n"
        "endmodule\n"
    )
    out = _fix_reg_declarations(src)
    assert "output reg [3:0] q" in out


def test_reg_decl_leaves_assigns_alone():
    """An output driven by a continuous assign should NOT be promoted."""
    src = (
        "module m(input a, input b, output y);\n"
        "  assign y = a & b;\n"
        "endmodule\n"
    )
    out = _fix_reg_declarations(src)
    # No always block touches y → no promotion.
    assert "output reg" not in out
    assert "output y" in out


def test_reg_decl_already_reg_no_op():
    src = (
        "module m(input clk, output reg [3:0] q);\n"
        "  always @(posedge clk) q <= q + 1;\n"
        "endmodule\n"
    )
    out = _fix_reg_declarations(src)
    # Idempotent — must not double up "reg reg".
    assert "reg reg" not in out
    assert "output reg [3:0] q" in out


# ---------------------------------------------------------------------------
# _fix_duplicate_reg_declarations — drop redundant body-level `reg q;`
# ---------------------------------------------------------------------------

def test_duplicate_reg_decl_removed_when_port_already_reg():
    src = (
        "module m(input clk, output reg [3:0] q);\n"
        "  reg [3:0] q;\n"  # duplicate
        "  always @(posedge clk) q <= q + 1;\n"
        "endmodule\n"
    )
    out = _fix_duplicate_reg_declarations(src)
    # Exactly one declaration of q should remain (the port one).
    assert out.count("reg [3:0] q;") == 0  # standalone body-line is gone
    assert "output reg [3:0] q" in out
    assert "q <= q + 1;" in out


def test_duplicate_reg_decl_keeps_distinct_reg():
    src = (
        "module m(input clk, output reg [3:0] q);\n"
        "  reg [3:0] shadow;\n"  # NOT a duplicate
        "  always @(posedge clk) q <= shadow;\n"
        "endmodule\n"
    )
    out = _fix_duplicate_reg_declarations(src)
    assert "reg [3:0] shadow;" in out


def test_duplicate_reg_decl_no_port_reg_no_change():
    src = (
        "module m(input a, output y);\n"
        "  reg buf_;\n"
        "  assign y = buf_;\n"
        "endmodule\n"
    )
    out = _fix_duplicate_reg_declarations(src)
    assert out == src


# ---------------------------------------------------------------------------
# _fix_missing_semicolons — only assignment lines get trailing semicolons.
# ---------------------------------------------------------------------------

def test_missing_semi_appends_to_assignment():
    src = "  q <= q + 1\n"  # missing ;
    out = _fix_missing_semicolons(src)
    assert out == "  q <= q + 1;\n"


def test_missing_semi_leaves_begin_end_alone():
    src = "  always @(*) begin\n    foo = 1;\n  end\n"
    out = _fix_missing_semicolons(src)
    # No semicolons added to begin/end lines.
    assert "begin;" not in out
    assert "end;" not in out


def test_missing_semi_no_double_semicolon():
    src = "q <= 1;\n"
    out = _fix_missing_semicolons(src)
    assert "q <= 1;;" not in out


# ---------------------------------------------------------------------------
# _fix_undeclared_inputs — regression: signal used on RHS but never declared
# should be added to the input port list.
# ---------------------------------------------------------------------------

def test_undeclared_input_emits_input_declaration():
    """When always block reads `a` but only `b` is declared, the fix emits
    an `input wire a` declaration so iverilog can resolve the identifier.
    (The current implementation prepends it as a separate line above the
    module header rather than rewriting the port list — locking in that
    behavior so any future change is visible.)"""
    src = (
        "module m(input b, output reg y);\n"
        "  always @(*) y = a & b;\n"
        "endmodule\n"
    )
    out = _fix_undeclared_inputs(src)
    assert "input wire a" in out or "input a" in out


def test_undeclared_input_no_op_when_all_declared():
    src = (
        "module m(input a, input b, output reg y);\n"
        "  always @(*) y = a & b;\n"
        "endmodule\n"
    )
    out = _fix_undeclared_inputs(src)
    # No spurious port additions.
    assert out.count("input ") == src.count("input ")


def test_undeclared_input_no_module_header_no_op():
    src = "// just a comment\n"
    out = _fix_undeclared_inputs(src)
    assert out == src


# ---------------------------------------------------------------------------
# _fix_integer_placement — hoist mid-block declarations to top of always.
# ---------------------------------------------------------------------------

def test_integer_placement_hoists_to_top_of_always():
    src = (
        "always @(posedge clk) begin\n"
        "  if (rst) begin\n"
        "    q <= 0;\n"
        "    integer i;\n"
        "    for (i = 0; i < 4; i = i + 1) arr[i] <= 0;\n"
        "  end\n"
        "end\n"
    )
    expected = (
        "always @(posedge clk) begin\n"
        "  integer i;\n"
        "  if (rst) begin\n"
        "    q <= 0;\n"
        "    for (i = 0; i < 4; i = i + 1) arr[i] <= 0;\n"
        "  end\n"
        "end\n"
    )
    assert _fix_integer_placement(src) == expected


def test_integer_placement_leaves_well_formed_alone():
    src = (
        "always @(posedge clk) begin\n"
        "  integer i;\n"
        "  q <= i;\n"
        "end\n"
    )
    assert _fix_integer_placement(src) == src


def test_integer_placement_single_statement_no_begin_passthrough():
    src = "always @(posedge clk) q <= d;\n"
    assert _fix_integer_placement(src) == src


# ---------------------------------------------------------------------------
# _fix_input_assignments — input written from an always block becomes reg.
# ---------------------------------------------------------------------------

def test_input_assignment_promotes_to_internal_reg():
    src = (
        "module m(input wire [7:0] data, output reg y);\n"
        "  always @(*) begin\n"
        "    data = 8'd0;\n"  # illegal — data is an input
        "    y = data[0];\n"
        "  end\n"
        "endmodule\n"
    )
    out = _fix_input_assignments(src)
    # `data` should no longer be in the input port list.
    port_text = out.split("module")[1].split(");")[0]
    assert "input wire [7:0] data" not in port_text
    assert "input data" not in port_text


def test_input_assignment_no_op_when_only_read():
    src = (
        "module m(input wire [7:0] data, output y);\n"
        "  assign y = data[0];\n"
        "endmodule\n"
    )
    out = _fix_input_assignments(src)
    assert out == src


def test_input_assignment_no_module_header_no_op():
    src = "always @(*) data = 0;\n"
    assert _fix_input_assignments(src) == src


# ---------------------------------------------------------------------------
# _fix_systemverilog_testbench (backend/main.py) — SV → Verilog-2005.
# ---------------------------------------------------------------------------

def test_sv_tb_logic_used_in_initial_becomes_reg():
    src = (
        "module tb;\n"
        "  logic [3:0] a;\n"
        "  initial begin\n"
        "    a = 4'd5;\n"
        "  end\n"
        "endmodule\n"
    )
    out = _fix_systemverilog_testbench(src)
    assert "reg [3:0] a;" in out
    assert "logic" not in out


def test_sv_tb_always_ff_and_always_comb_normalized():
    src = (
        "module tb;\n"
        "  always_ff @(posedge clk) q <= d;\n"
        "  always_comb y = a & b;\n"
        "endmodule\n"
    )
    out = _fix_systemverilog_testbench(src)
    assert "always_ff" not in out
    assert "always_comb" not in out
    assert "always @(posedge clk)" in out
    assert "always @(*) y = a & b" in out


def test_sv_tb_unique_priority_case_normalized():
    src = "unique case (s) 0: q=0; default: q=1; endcase\n"
    out = _fix_systemverilog_testbench(src)
    assert "unique case" not in out
    # plain `case (` survives
    assert "case (s)" in out


def test_sv_tb_imports_dropped():
    src = "import some_pkg::*;\nmodule tb; endmodule\n"
    out = _fix_systemverilog_testbench(src)
    assert "import" not in out
    assert "module tb;" in out


# ---------------------------------------------------------------------------
# _fix_verify_timing (backend/main.py) — clock generator injection.
# ---------------------------------------------------------------------------

def test_verify_timing_injects_clock_gen_when_missing():
    design = (
        "module dut(input clk, input d, output reg q);\n"
        "  always @(posedge clk) q <= d;\n"
        "endmodule\n"
    )
    # Testbench is missing both `initial clk = 0;` and the toggle.
    tb = (
        "module tb;\n"
        "  reg clk;\n"
        "  reg d;\n"
        "  wire q;\n"
        "  dut uut(.clk(clk), .d(d), .q(q));\n"
        "  initial begin\n"
        "    d = 0;\n"
        "    #100; $finish;\n"
        "  end\n"
        "endmodule\n"
    )
    out = _fix_verify_timing(tb, design)
    # Some flavor of clock generation must now be present.
    assert "clk = ~clk" in out or "clk <= ~clk" in out


def test_verify_timing_combinational_design_passthrough():
    design = (
        "module dut(input a, input b, output y);\n"
        "  assign y = a & b;\n"
        "endmodule\n"
    )
    tb = (
        "module tb;\n"
        "  reg a, b; wire y;\n"
        "  dut uut(.a(a), .b(b), .y(y));\n"
        "  initial begin a = 0; b = 0; #10; $finish; end\n"
        "endmodule\n"
    )
    # Combinational designs should NOT trigger any timing fixups.
    assert _fix_verify_timing(tb, design) == tb


def test_verify_timing_clock_gen_already_present_no_double_inject():
    design = (
        "module dut(input clk, output reg q);\n"
        "  always @(posedge clk) q <= ~q;\n"
        "endmodule\n"
    )
    tb = (
        "module tb;\n"
        "  reg clk;\n"
        "  wire q;\n"
        "  dut uut(.clk(clk), .q(q));\n"
        "  initial clk = 0;\n"
        "  always #5 clk = ~clk;\n"
        "  initial begin #100; $finish; end\n"
        "endmodule\n"
    )
    out = _fix_verify_timing(tb, design)
    # Should not duplicate the clock generator.
    assert out.count("always #5 clk = ~clk") == 1
