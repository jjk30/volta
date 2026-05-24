"""
Unit tests for extract_verilog.

Two near-identical implementations exist:
  - core.rtl_generator.extract_verilog(raw, module_name)
  - core.correction_engine.extract_verilog(raw)

Both pull a Verilog module out of LLM output that may contain markdown fences,
explanatory prose, or multiple code blocks. The tests below run every relevant
scenario against both implementations.
"""

import pytest

from core.rtl_generator import extract_verilog as extract_v_rtl
from core.correction_engine import extract_verilog as extract_v_corr


CLEAN_MODULE = "module foo(input a, output y);\n  assign y = a;\nendmodule"


# ---------------------------------------------------------------------------
# Plain Verilog
# ---------------------------------------------------------------------------

def test_plain_verilog_returned_as_is_rtl():
    assert extract_v_rtl(CLEAN_MODULE, "foo") == CLEAN_MODULE


def test_plain_verilog_returned_as_is_corr():
    assert extract_v_corr(CLEAN_MODULE) == CLEAN_MODULE


# ---------------------------------------------------------------------------
# Markdown fence stripping
# ---------------------------------------------------------------------------

def test_markdown_verilog_fence_stripped_rtl():
    raw = f"```verilog\n{CLEAN_MODULE}\n```"
    assert extract_v_rtl(raw, "foo") == CLEAN_MODULE


def test_markdown_verilog_fence_stripped_corr():
    raw = f"```verilog\n{CLEAN_MODULE}\n```"
    assert extract_v_corr(raw) == CLEAN_MODULE


def test_markdown_systemverilog_fence_stripped_rtl():
    raw = f"```sv\n{CLEAN_MODULE}\n```"
    assert extract_v_rtl(raw, "foo") == CLEAN_MODULE


def test_markdown_systemverilog_fence_stripped_corr():
    raw = f"```sv\n{CLEAN_MODULE}\n```"
    assert extract_v_corr(raw) == CLEAN_MODULE


def test_unmarked_fence_stripped_rtl():
    """A fence with no language tag should still work."""
    raw = f"```\n{CLEAN_MODULE}\n```"
    assert extract_v_rtl(raw, "foo") == CLEAN_MODULE


def test_unmarked_fence_stripped_corr():
    raw = f"```\n{CLEAN_MODULE}\n```"
    assert extract_v_corr(raw) == CLEAN_MODULE


# ---------------------------------------------------------------------------
# Prose surrounding the code
# ---------------------------------------------------------------------------

def test_prose_before_and_after_rtl():
    raw = (
        "Here's the module you asked for:\n\n"
        f"```verilog\n{CLEAN_MODULE}\n```\n\n"
        "Let me know if you need anything else."
    )
    assert extract_v_rtl(raw, "foo") == CLEAN_MODULE


def test_prose_before_and_after_corr():
    raw = (
        "Here's the module you asked for:\n\n"
        f"```verilog\n{CLEAN_MODULE}\n```\n\n"
        "Let me know if you need anything else."
    )
    assert extract_v_corr(raw) == CLEAN_MODULE


def test_prose_without_fence_rtl():
    """Module text with prose around it (no fences) — extractor should still
    crop to module … endmodule."""
    raw = (
        "Sure, here it is:\n"
        f"{CLEAN_MODULE}\n"
        "Hope that helps!"
    )
    out = extract_v_rtl(raw, "foo")
    assert out.startswith("module foo")
    assert out.endswith("endmodule")
    assert "Sure, here" not in out
    assert "Hope that helps" not in out


def test_prose_without_fence_corr():
    raw = (
        "Sure, here it is:\n"
        f"{CLEAN_MODULE}\n"
        "Hope that helps!"
    )
    out = extract_v_corr(raw)
    assert out.startswith("module foo")
    assert out.endswith("endmodule")
    assert "Sure, here" not in out
    assert "Hope that helps" not in out


# ---------------------------------------------------------------------------
# Multiple code blocks — first block with a module wins
# ---------------------------------------------------------------------------

def test_multiple_blocks_first_module_wins_rtl():
    raw = (
        "```\n"
        "Just a note, not Verilog.\n"
        "```\n"
        f"```verilog\n{CLEAN_MODULE}\n```"
    )
    assert extract_v_rtl(raw, "foo") == CLEAN_MODULE


def test_multiple_blocks_first_module_wins_corr():
    raw = (
        "```\n"
        "Just a note, not Verilog.\n"
        "```\n"
        f"```verilog\n{CLEAN_MODULE}\n```"
    )
    assert extract_v_corr(raw) == CLEAN_MODULE


def test_multiple_module_blocks_first_takes_precedence_rtl():
    first = "module first(input a, output y);\n  assign y = a;\nendmodule"
    second = "module second(input a, output y);\n  assign y = ~a;\nendmodule"
    raw = f"```verilog\n{first}\n```\nthen later:\n```verilog\n{second}\n```"
    out = extract_v_rtl(raw, "first")
    # Behavior: rtl_generator stops at the first fence that contains `module`.
    assert "module first" in out
    assert "module second" not in out


def test_multiple_module_blocks_first_takes_precedence_corr():
    first = "module first(input a, output y);\n  assign y = a;\nendmodule"
    second = "module second(input a, output y);\n  assign y = ~a;\nendmodule"
    raw = f"```verilog\n{first}\n```\nthen later:\n```verilog\n{second}\n```"
    out = extract_v_corr(raw)
    assert "module first" in out
    assert "module second" not in out


# ---------------------------------------------------------------------------
# Empty / no-module input
# ---------------------------------------------------------------------------

def test_empty_input_does_not_crash_rtl():
    out = extract_v_rtl("", "foo")
    assert isinstance(out, str)
    assert out == ""


def test_empty_input_does_not_crash_corr():
    out = extract_v_corr("")
    assert isinstance(out, str)
    assert out == ""


def test_prose_with_no_module_returns_something_safe_rtl():
    raw = "I can't help with that prompt."
    out = extract_v_rtl(raw, "foo")
    assert isinstance(out, str)
    # No `module ...` token → extractor returns the prose unchanged.
    # The caller is expected to detect "module" not in result and fall back.


def test_prose_with_no_module_returns_something_safe_corr():
    raw = "I can't help with that prompt."
    out = extract_v_corr(raw)
    assert isinstance(out, str)


# ---------------------------------------------------------------------------
# Targeted module name selection (rtl_generator only — corr has no arg)
# ---------------------------------------------------------------------------

def test_rtl_prefers_named_module():
    """When two modules are in the raw text, rtl_generator picks the one
    matching the requested name."""
    helper = "module helper();\nendmodule"
    target = "module wanted(input a, output y);\n  assign y = a;\nendmodule"
    raw = f"{helper}\n\n{target}\n"
    out = extract_v_rtl(raw, "wanted")
    assert out.startswith("module wanted")
    # helper module should be cropped out — extractor starts at wanted.
    assert "module helper" not in out
