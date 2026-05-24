"""
Volta — Amaranth Generator
Calls Ollama to produce Amaranth-HDL source for a given DesignSpec, then runs
that source in a sandboxed subprocess to elaborate it to Verilog via
``amaranth.back.verilog.convert``. Returns both the Amaranth source and the
elaborated Verilog so the rest of the orchestrator (Yosys correction, schematic
rendering, simulate) can keep operating on Verilog.

Known limitation: Qwen2.5-Coder-7B has little Amaranth in its training data,
so first-try success on non-trivial designs is lower than for Verilog. The
orchestrator falls back to direct Verilog generation if all retries fail.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import textwrap
from typing import Optional

from core.llm_client import call_ollama
from core.schema import ModuleSpec


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

AMARANTH_SYSTEM_PROMPT = """You write Amaranth HDL — Python that elaborates to Verilog via Yosys.

Rules:
1. Always `from amaranth import *` at the top — gives you Module, Signal, Mux, Cat, ClockDomain, ClockSignal, ResetSignal, Memory, Array, etc.
2. The top-level class MUST be `class Top(Elaboratable):` exactly (the elaborator looks for this name).
3. Port signals are class attributes set in `__init__`:  `self.a = Signal(8)`, `self.y = Signal(1)`, etc.
4. `def elaborate(self, platform):` returns a `Module()`.
5. Use `m.d.comb += <sig>.eq(<expr>)` for combinational logic.
6. Use `m.d.sync += <sig>.eq(<expr>)` for sequential (clocked) logic. The `sync` domain has clk/rst implicitly — DO NOT declare them as ports.
7. Conditionals: `with m.If(cond): ...`, `with m.Elif(...): ...`, `with m.Else(): ...`. Switch: `with m.Switch(sel): with m.Case(0b00): ...`.
8. No `print`, no I/O, no `if __name__ == "__main__"`. Just the imports and the class.
9. Use lowercase port names matching the spec.
10. The elaborator will call: `top = Top(); ports = [getattr(top, n) for n in PORT_ORDER]; verilog.convert(top, ports=ports)`.

Output ONLY the Python code, no markdown fences, no commentary."""


COUNTER_EXAMPLE = '''Prompt: "Design a 4-bit counter with reset and enable"
Output:
from amaranth import *

class Top(Elaboratable):
    def __init__(self):
        self.rst = Signal()
        self.en  = Signal()
        self.cnt = Signal(4)

    def elaborate(self, platform):
        m = Module()
        with m.If(self.rst):
            m.d.sync += self.cnt.eq(0)
        with m.Elif(self.en):
            m.d.sync += self.cnt.eq(self.cnt + 1)
        return m
'''

AND_GATE_EXAMPLE = '''Prompt: "Design a 2-input AND gate"
Output:
from amaranth import *

class Top(Elaboratable):
    def __init__(self):
        self.a = Signal()
        self.b = Signal()
        self.y = Signal()

    def elaborate(self, platform):
        m = Module()
        m.d.comb += self.y.eq(self.a & self.b)
        return m
'''

MUX_EXAMPLE = '''Prompt: "Design a 2-to-1 multiplexer with 8-bit data"
Output:
from amaranth import *

class Top(Elaboratable):
    def __init__(self):
        self.sel = Signal()
        self.in0 = Signal(8)
        self.in1 = Signal(8)
        self.out = Signal(8)

    def elaborate(self, platform):
        m = Module()
        m.d.comb += self.out.eq(Mux(self.sel, self.in1, self.in0))
        return m
'''


def _build_prompt(prompt: str, module: ModuleSpec, error_feedback: Optional[str] = None) -> str:
    # Compact port hint helps the LLM stay consistent with the spec interpreter.
    port_lines = []
    for p in module.ports:
        if p.name in ("clk", "clock", "rst", "reset", "rstn", "rst_n"):
            continue  # sync domain is implicit in Amaranth
        w = f"Signal({p.width})" if p.width > 1 else "Signal()"
        port_lines.append(f"  self.{p.name} = {w}  # {p.direction.value}")
    port_hint = "\n".join(port_lines) if port_lines else "  # (no explicit ports — derive from prompt)"

    parts = [
        AMARANTH_SYSTEM_PROMPT,
        "",
        "=== Examples ===",
        AND_GATE_EXAMPLE,
        COUNTER_EXAMPLE,
        MUX_EXAMPLE,
        "=== Your task ===",
        f"Prompt: {prompt!r}",
        f"Module name: {module.name}",
        f"Required ports (set in __init__):",
        port_hint,
    ]
    if error_feedback:
        parts.extend([
            "",
            "Your previous attempt failed to elaborate. Error from amaranth.back.verilog.convert:",
            error_feedback[:1500],
            "",
            "Fix the code. Output the corrected full file only.",
        ])
    parts.append("\nOutput (Python only, no fences):")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Code extraction (strip markdown fences if the model adds them anyway)
# ---------------------------------------------------------------------------

FENCE_RE = re.compile(r"```(?:python)?\n?(.+?)```", re.DOTALL | re.I)


def _extract_python(raw: str) -> str:
    m = FENCE_RE.search(raw)
    code = m.group(1) if m else raw
    code = code.strip()
    # Drop any leading explanatory text before `from amaranth`
    idx = code.find("from amaranth")
    if idx > 0:
        code = code[idx:]
    return code.strip() + "\n"


# ---------------------------------------------------------------------------
# Subprocess elaborator
# ---------------------------------------------------------------------------

_ELABORATE_DRIVER = textwrap.dedent("""\
    import sys, traceback
    sys.path.insert(0, %(work_dir)r)
    try:
        import design_amaranth as d
        if not hasattr(d, "Top"):
            print("__VOLTA_ERR__", file=sys.stderr)
            print("Generated file does not define class `Top`.", file=sys.stderr)
            sys.exit(2)
        from amaranth.back import verilog
        from amaranth.hdl import Signal
        top = d.Top()
        # Use any Signal-typed instance attributes as the port list, in
        # insertion order. Skip clk/rst — Amaranth's sync domain handles those.
        skip = {"clk", "clock", "rst", "reset", "rstn", "rst_n"}
        port_sigs = []
        for name, val in vars(top).items():
            if name in skip:
                continue
            if isinstance(val, Signal):
                port_sigs.append(val)
        out = verilog.convert(top, ports=port_sigs)
        # Marker so the parent process knows where the Verilog begins
        sys.stdout.write("__VOLTA_VERILOG_BEGIN__\\n")
        sys.stdout.write(out)
        sys.stdout.write("\\n__VOLTA_VERILOG_END__\\n")
    except Exception:
        print("__VOLTA_ERR__", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
""")


class AmaranthElaborationError(RuntimeError):
    """Raised when the subprocess driver fails to elaborate Amaranth to Verilog."""


def _elaborate(amaranth_source: str, timeout_s: int = 30) -> str:
    """Run the Amaranth source in a subprocess and capture the elaborated
    Verilog. Returns the Verilog string. Raises AmaranthElaborationError on
    any error (import, syntax, elaborate, or timeout).
    """

    with tempfile.TemporaryDirectory(prefix="volta_amaranth_") as work_dir:
        src_path = os.path.join(work_dir, "design_amaranth.py")
        drv_path = os.path.join(work_dir, "elaborate.py")
        with open(src_path, "w") as f:
            f.write(amaranth_source)
        with open(drv_path, "w") as f:
            f.write(_ELABORATE_DRIVER % {"work_dir": work_dir})

        try:
            r = subprocess.run(
                [sys.executable, drv_path],
                capture_output=True,
                text=True,
                timeout=timeout_s,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            )
        except subprocess.TimeoutExpired:
            raise AmaranthElaborationError(f"Elaboration timed out after {timeout_s}s")

        if r.returncode != 0 or "__VOLTA_VERILOG_BEGIN__" not in r.stdout:
            err = (r.stderr or r.stdout or "").strip()
            raise AmaranthElaborationError(err or "Elaboration failed with no diagnostic")

        body = r.stdout.split("__VOLTA_VERILOG_BEGIN__", 1)[1]
        if "__VOLTA_VERILOG_END__" in body:
            body = body.split("__VOLTA_VERILOG_END__", 1)[0]
        return body.strip() + "\n"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

MAX_RETRIES = 3


def generate_amaranth(
    prompt: str,
    module: ModuleSpec,
    model: str = "qwen2.5-coder:7b",
) -> tuple[str, str]:
    """Generate an Amaranth module and its elaborated Verilog.

    Returns ``(amaranth_source, verilog_intermediate)``. Raises
    :class:`AmaranthElaborationError` if all retries fail.
    """

    last_err: Optional[str] = None
    amaranth_source = ""

    for attempt in range(1, MAX_RETRIES + 1):
        print(f"  Amaranth attempt {attempt}/{MAX_RETRIES}...")
        ollama_prompt = _build_prompt(prompt, module, error_feedback=last_err)
        raw = call_ollama(ollama_prompt, model=model, temperature=0.2 + 0.1 * (attempt - 1), num_predict=2048)
        amaranth_source = _extract_python(raw)
        if not amaranth_source or "class Top" not in amaranth_source:
            last_err = "Output did not contain a `class Top(Elaboratable):` definition."
            print(f"  ⚠ {last_err}")
            continue

        try:
            verilog_intermediate = _elaborate(amaranth_source)
            print(f"  ✓ Elaborated to {len(verilog_intermediate)} chars of Verilog")
            return amaranth_source, verilog_intermediate
        except AmaranthElaborationError as e:
            last_err = str(e)
            short = last_err.splitlines()[-1][:160] if last_err else "(no detail)"
            print(f"  ⚠ Elaboration failed: {short}")
            continue

    raise AmaranthElaborationError(
        f"All {MAX_RETRIES} Amaranth attempts failed. Last error: {last_err}"
    )
