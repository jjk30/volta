"""
Unit tests for parse_vcd in backend/main.py.

These tests run without iverilog, Yosys, Ollama, or any network. They feed
hand-crafted VCD strings to the parser and assert on the structured output
shape ({timescale, end_time, signals}). They lock in the *current* behavior
including known quirks (x/z coerced to 0) so any future regression is loud.
"""

import pytest

from backend.main import parse_vcd


# ---------------------------------------------------------------------------
# Empty / malformed input — must not crash
# ---------------------------------------------------------------------------

def test_empty_input_returns_no_signals():
    out = parse_vcd("")
    assert out["signals"] == []
    assert out["end_time"] == 0
    # Default timescale when no $timescale block is present.
    assert isinstance(out["timescale"], str)


def test_malformed_input_does_not_crash():
    """Garbled VCD with missing $end markers and weird timestamps should
    return whatever the parser could salvage instead of raising."""
    garbage = "\n".join([
        "$date this has no end",
        "$timescale",
        "1ns",  # missing $end — parser absorbs the next line as the ts
        "$var wire 1 ! ok",  # missing $end is tolerated by the split-based parser
        "#NOT_A_NUMBER",
        "garbage line",
        "##",
    ])
    out = parse_vcd(garbage)
    assert isinstance(out, dict)
    assert "signals" in out
    assert "end_time" in out
    assert "timescale" in out


# ---------------------------------------------------------------------------
# Minimal clk toggling
# ---------------------------------------------------------------------------

MINIMAL_CLK_VCD = """\
$date Mon $end
$version Volta test $end
$timescale 1ns $end
$scope module tb $end
$var wire 1 ! clk $end
$upscope $end
$enddefinitions $end
#0
0!
#5
1!
#10
0!
"""


def test_minimal_clk_signal_parsed():
    out = parse_vcd(MINIMAL_CLK_VCD)
    assert out["end_time"] == 10
    assert out["timescale"] == "1ns"
    assert len(out["signals"]) == 1
    sig = out["signals"][0]
    assert sig["name"] == "clk"
    assert sig["width"] == 1
    # Three value transitions at t=0,5,10 with values 0,1,0
    assert sig["values"] == [[0, 0], [5, 1], [10, 0]]


# ---------------------------------------------------------------------------
# Multi-bit bus — vector value lines like `b1010 #`
# ---------------------------------------------------------------------------

EIGHT_BIT_BUS_VCD = """\
$timescale 1ns $end
$scope module tb $end
$var wire 8 # count $end
$upscope $end
$enddefinitions $end
#0
b00000000 #
#10
b00000101 #
#20
b11111111 #
"""


def test_multi_bit_bus_parsed_as_integers():
    out = parse_vcd(EIGHT_BIT_BUS_VCD)
    assert len(out["signals"]) == 1
    sig = out["signals"][0]
    assert sig["name"] == "count"
    assert sig["width"] == 8
    # Binary strings converted to int per the parser's current behavior.
    assert sig["values"] == [[0, 0], [10, 5], [20, 255]]


# ---------------------------------------------------------------------------
# Documented quirk: x/z coerced to 0 in both scalar and vector contexts.
# Lock this in until we change the API; the test will go red if/when that
# behavior shifts, prompting a deliberate update.
# ---------------------------------------------------------------------------

XZ_SCALAR_VCD = """\
$timescale 1ns $end
$scope module tb $end
$var wire 1 ! q $end
$upscope $end
$enddefinitions $end
#0
x!
#5
z!
#10
1!
"""


def test_scalar_x_and_z_coerced_to_zero():
    out = parse_vcd(XZ_SCALAR_VCD)
    sig = out["signals"][0]
    # First two transitions (x, z) become 0; the actual 1 stays 1.
    assert sig["values"] == [[0, 0], [5, 0], [10, 1]]


XZ_VECTOR_VCD = """\
$timescale 1ns $end
$scope module tb $end
$var wire 4 # data $end
$upscope $end
$enddefinitions $end
#0
b00xx #
#10
bzzzz #
#20
b1111 #
"""


def test_vector_x_and_z_bits_coerced_to_zero():
    out = parse_vcd(XZ_VECTOR_VCD)
    sig = out["signals"][0]
    # `00xx` → 0, `zzzz` → 0, `1111` → 15
    assert sig["values"] == [[0, 0], [10, 0], [20, 15]]


# ---------------------------------------------------------------------------
# Scope handling — $scope/$upscope shouldn't lose signals
# ---------------------------------------------------------------------------

NESTED_SCOPE_VCD = """\
$timescale 1ns $end
$scope module tb $end
$scope module dut $end
$var wire 1 ! a $end
$var wire 1 " b $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
1!
1"
"""


def test_nested_scope_signals_kept():
    out = parse_vcd(NESTED_SCOPE_VCD)
    names = sorted(s["name"] for s in out["signals"])
    assert names == ["a", "b"]


# ---------------------------------------------------------------------------
# Signals starting with '$' should be filtered (VCD-internal markers)
# ---------------------------------------------------------------------------

INTERNAL_SIGNAL_VCD = """\
$timescale 1ns $end
$scope module tb $end
$var wire 1 ! $internal $end
$var wire 1 " visible $end
$upscope $end
$enddefinitions $end
#0
1!
1"
"""


def test_internal_dollar_signals_filtered():
    out = parse_vcd(INTERNAL_SIGNAL_VCD)
    names = [s["name"] for s in out["signals"]]
    assert names == ["visible"]
