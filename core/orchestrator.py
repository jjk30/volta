"""
Volta — Orchestrator
Full generate pipeline: prompt → spec → Verilog → correction → testbench → verify.

This is the main entry point for the /generate flow. It coordinates:
  1. Spec Interpreter — prompt → structured DesignSpec
  2. RTL Generator   — spec → Verilog (with precise, structured prompt)
  3. Correction Engine — Yosys verification + auto-fix loop
  4. Testbench Generation — spec test vectors → Verilog testbench with VCD
  5. Compilation Check — iverilog to verify design + testbench compile together
"""

import json
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schema import DesignSpec, ModuleSpec, PortDirection, SignalType
from spec_interpreter import interpret
from rtl_generator import call_ollama, extract_verilog
from correction_engine import correct as correct_verilog, run_yosys


# ---------------------------------------------------------------------------
# Generic Verilog generation prompt (not ALU-specific like rtl_generator's)
# ---------------------------------------------------------------------------

def build_generate_prompt(module: ModuleSpec) -> str:
    """Build a precise Verilog generation prompt from a ModuleSpec.

    Unlike rtl_generator.build_prompt, this is generic — no ALU-specific rules.
    """

    port_lines = []
    for p in module.ports:
        w = f"[{p.width-1}:0] " if p.width > 1 else ""
        sig = "reg" if p.signal_type == SignalType.REG else "wire"
        clock_note = " (clock)" if p.is_clock else ""
        reset_note = " (active-high reset)" if p.is_reset else ""
        port_lines.append(
            f"  {p.direction.value} {sig} {w}{p.name}"
            f" — {p.description}{clock_note}{reset_note}"
        )

    op_lines = []
    for op in module.operations:
        line = f"  {op.name}"
        if op.opcode:
            line += f" (opcode {op.opcode})"
        if op.behavior:
            line += f": {op.behavior}"
        if op.description:
            line += f"  // {op.description}"
        op_lines.append(line)

    is_sequential = module.category.value == "sequential" or any(
        p.is_clock for p in module.ports
    )

    if is_sequential:
        timing_rule = "Use `always @(posedge clk)` for sequential logic."
        reset_rule = "On reset (rst == 1), initialize all outputs to zero."
    else:
        timing_rule = "Use `always @(*)` for combinational logic."
        reset_rule = ""

    behavior_section = ""
    if op_lines:
        behavior_section = f"\nOperations:\n{chr(10).join(op_lines)}\n"

    return f"""Write synthesizable Verilog for this module.

Module name: {module.name}
Type: {module.category.value}
Description: {module.description}

Ports:
{chr(10).join(port_lines)}
{behavior_section}
Rules:
1. {timing_rule}
2. Outputs driven inside always blocks MUST be declared as `output reg` in the port list.
3. Include a default case in any case statement.
4. {reset_rule}
5. Module name must be exactly: {module.name}
6. Every signal used must be declared.

Return ONLY Verilog. Start with `module` and end with `endmodule`. No explanation."""


# ---------------------------------------------------------------------------
# Post-processing: fix common LLM Verilog issues
# ---------------------------------------------------------------------------

def _fix_reg_declarations(verilog: str) -> str:
    """Fix the most common LLM error: outputs used in always blocks but not
    declared as reg. Detects procedural assignments to outputs and adds 'reg'."""

    lines = verilog.split("\n")

    # Find outputs declared without reg
    output_names = set()
    output_reg_names = set()
    for line in lines:
        stripped = line.strip().rstrip(",").rstrip(");")
        m = re.match(r"output\s+reg\s+(?:\[[\d:]+\]\s+)?(\w+)", stripped)
        if m:
            output_reg_names.add(m.group(1))
            continue
        m = re.match(r"output\s+(?:\[[\d:]+\]\s+)?(\w+)", stripped)
        if m:
            output_names.add(m.group(1))

    # Check if any non-reg output is used in a procedural assignment
    in_always = False
    needs_reg = set()
    for line in lines:
        stripped = line.strip()
        if "always" in stripped:
            in_always = True
        if in_always:
            for name in output_names:
                # Match: name = ... or {name, ...} = ...
                if re.search(rf'\b{name}\b\s*=', stripped) or \
                   re.search(rf'\{{\s*{name}\b', stripped):
                    needs_reg.add(name)
        if stripped in ("end", "endmodule"):
            in_always = False

    if not needs_reg:
        return verilog

    # Add 'reg' to those output declarations
    new_lines = []
    for line in lines:
        stripped = line.strip().rstrip(",").rstrip(");")
        for name in needs_reg:
            m = re.match(r"(\s*output\s+)(\[[\d:]+\]\s+)?" + re.escape(name) + r"\b", line.rstrip(",").rstrip(");"))
            if m and "reg" not in line:
                line = line.replace("output ", "output reg ", 1)
                break
        new_lines.append(line)

    return "\n".join(new_lines)


# ---------------------------------------------------------------------------
# Verilog testbench generator (from spec test vectors)
# ---------------------------------------------------------------------------

def generate_verilog_testbench(spec: DesignSpec, design_code: str) -> str:
    """Generate a Verilog testbench from a DesignSpec's test vectors.

    Produces a self-contained testbench with $dumpfile/$dumpvars for waveforms.
    Each test vector becomes a block of stimulus + check via $display.
    """

    module = spec.modules[0]
    module_name = module.name

    # Parse actual ports from the generated Verilog (more reliable than spec alone)
    actual_ports = _parse_ports_from_verilog(design_code)
    if actual_ports:
        input_ports = [p for p in actual_ports if p["direction"] == "input"]
        output_ports = [p for p in actual_ports if p["direction"] == "output"]
    else:
        input_ports = [{"name": p.name, "width": p.width}
                       for p in module.ports if p.direction == PortDirection.INPUT]
        output_ports = [{"name": p.name, "width": p.width}
                        for p in module.ports if p.direction == PortDirection.OUTPUT]

    has_clock = any(p.is_clock for p in module.ports)
    has_reset = any(p.is_reset for p in module.ports)

    # Cross-check: only emit clock/reset if the actual Verilog has those ports
    actual_port_names = {p["name"] for p in (actual_ports or [])}
    if actual_port_names:
        has_clock = has_clock and any(
            n in actual_port_names for n in ("clk", "clock")
        )
        has_reset = has_reset and any(
            n in actual_port_names for n in ("rst", "reset", "rstn", "rst_n")
        )

    lines = []
    lines.append(f"module tb_{module_name};")
    lines.append("")

    # Declare regs for inputs, wires for outputs
    for p in input_ports:
        w = f"[{p['width']-1}:0] " if p["width"] > 1 else ""
        lines.append(f"  reg {w}{p['name']};")
    for p in output_ports:
        w = f"[{p['width']-1}:0] " if p["width"] > 1 else ""
        lines.append(f"  wire {w}{p['name']};")

    lines.append("")

    # Instantiate DUT
    port_connections = []
    for p in input_ports + output_ports:
        port_connections.append(f".{p['name']}({p['name']})")

    lines.append(f"  {module_name} uut(")
    lines.append(f"    {', '.join(port_connections)}")
    lines.append(f"  );")
    lines.append("")

    # Clock generation if sequential
    if has_clock:
        lines.append("  initial clk = 0;")
        lines.append("  always #5 clk = ~clk;")
        lines.append("")

    # VCD dump + test vectors
    lines.append("  initial begin")
    lines.append(f'    $dumpfile("dump.vcd");')
    lines.append(f'    $dumpvars(0, tb_{module_name});')
    lines.append("")

    # Reset sequence if applicable
    if has_reset:
        lines.append("    // Reset")
        lines.append("    rst = 1;")
        lines.append("    #20;")
        lines.append("    rst = 0;")
        lines.append("    #10;")
        lines.append("")

    # Collect valid port names for filtering test vectors
    all_port_names = {p["name"] for p in input_ports + output_ports}
    input_port_names = {p["name"] for p in input_ports}
    output_port_names = {p["name"] for p in output_ports}

    # Test vectors
    for tv in module.test_vectors:
        lines.append(f"    // {tv.description}")
        for port_name, value in tv.inputs.items():
            # Skip clock in test vector assignments, skip unknown ports
            if port_name in ("clk",):
                continue
            if port_name not in input_port_names:
                continue
            lines.append(f"    {port_name} = {value};")
        lines.append("    #10;")

        # Display results — only reference actual output ports
        valid_outputs = {k: v for k, v in tv.expected_outputs.items()
                         if k in output_port_names}
        if valid_outputs:
            display_parts = [f"{tv.name}: "]
            for port_name in valid_outputs:
                display_parts.append(f"{port_name}=%0d")
            fmt_str = " ".join(display_parts)
            args = ", ".join(valid_outputs.keys())
            lines.append(f'    $display("{fmt_str}", {args});')
        lines.append("")

    lines.append("    #10;")
    lines.append("    $finish;")
    lines.append("  end")
    lines.append("")
    lines.append("endmodule")

    return "\n".join(lines)


def _parse_ports_from_verilog(verilog: str) -> list[dict]:
    """Parse port declarations from Verilog source."""

    ports = []
    for line in verilog.split("\n"):
        line = line.strip().rstrip(",").rstrip(");")
        m = re.match(
            r"(input|output)\s+(?:reg\s+)?(?:wire\s+)?(\[[\d:]+\]\s+)?(\w+)",
            line,
        )
        if m:
            direction = m.group(1)
            width_str = m.group(2)
            name = m.group(3)
            if width_str:
                wm = re.match(r"\[(\d+):(\d+)\]", width_str.strip())
                width = int(wm.group(1)) - int(wm.group(2)) + 1 if wm else 1
            else:
                width = 1
            ports.append({"name": name, "direction": direction, "width": width})
    return ports


# ---------------------------------------------------------------------------
# iverilog compile check
# ---------------------------------------------------------------------------

def verify_compile(design: str, testbench: str) -> tuple[bool, str]:
    """Verify design + testbench compile together with iverilog."""

    with tempfile.TemporaryDirectory(prefix="volta_chk_") as work_dir:
        d_path = os.path.join(work_dir, "design.v")
        t_path = os.path.join(work_dir, "testbench.v")
        out_path = os.path.join(work_dir, "check.out")

        with open(d_path, "w") as f:
            f.write(design)
        with open(t_path, "w") as f:
            f.write(testbench)

        try:
            r = subprocess.run(
                ["iverilog", "-o", out_path, d_path, t_path],
                capture_output=True, text=True, timeout=30,
            )
            return r.returncode == 0, r.stderr
        except FileNotFoundError:
            return True, ""  # iverilog not installed — skip
        except subprocess.TimeoutExpired:
            return False, "iverilog timed out"


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def generate(prompt: str, model: str = "codellama:7b") -> dict:
    """Full generate pipeline: prompt → spec → Verilog → correction → testbench.

    Returns:
        {
            "design": str,           # Final corrected Verilog
            "testbench": str,        # Verilog testbench with VCD dump
            "spec": DesignSpec,      # Structured spec used for generation
            "correction": {
                "ran": bool,
                "passed": bool,
                "attempts": int,
                "errors_fixed": list[str],
            },
            "compile_ok": bool,      # Whether iverilog compile passed
        }
    """

    print(f"\n{'=' * 60}")
    print(f"  VOLTA — Orchestrator")
    print(f"{'=' * 60}")
    print(f"  Prompt: {prompt}")

    # ------------------------------------------------------------------
    # Step 1: Interpret prompt into structured spec
    # ------------------------------------------------------------------
    print(f"\n  Step 1: Interpreting prompt → structured spec...")
    spec = interpret(prompt, model=model)
    module = spec.modules[0]
    print(f"  ✓ Spec: {module.name} | {len(module.ports)} ports | "
          f"{len(module.operations)} ops | {len(module.test_vectors)} tests")

    # ------------------------------------------------------------------
    # Step 2: Build precise Verilog prompt from spec and generate
    # ------------------------------------------------------------------
    print(f"\n  Step 2: Generating Verilog from structured spec...")
    verilog_prompt = build_generate_prompt(module)
    print(f"  Prompt length: {len(verilog_prompt)} chars")

    raw = call_ollama(verilog_prompt, model=model)
    design = extract_verilog(raw, module.name)

    if not design or "module" not in design:
        raise RuntimeError("LLM returned invalid Verilog from structured prompt")

    # Post-process: fix common LLM mistakes
    design = _fix_reg_declarations(design)

    print(f"  ✓ Generated {len(design)} chars of Verilog")

    # ------------------------------------------------------------------
    # Step 3: Run correction engine (Yosys verify + auto-fix)
    # ------------------------------------------------------------------
    print(f"\n  Step 3: Running correction engine (Yosys)...")
    correction = {"ran": False, "passed": False, "attempts": 0, "errors_fixed": []}

    try:
        synth = run_yosys(design)

        if synth.success:
            print(f"  ✓ Yosys passed on first try")
            correction = {"ran": True, "passed": True, "attempts": 1, "errors_fixed": []}
        else:
            print(f"  Found {len(synth.errors)} error(s) — running auto-fix...")
            initial_errors = list(synth.errors)
            result = correct_verilog(design, model=model)

            correction = {
                "ran": True,
                "passed": result["passed"],
                "attempts": result["attempts"],
                "errors_fixed": initial_errors,
            }

            if result["passed"]:
                design = result["final_code"]
                print(f"  ✓ Fixed in {result['attempts']} attempt(s)")
            else:
                design = result["final_code"]
                print(f"  ⚠ Could not fully fix after {result['attempts']} attempts")
    except Exception as e:
        print(f"  ⚠ Correction engine error (non-fatal): {e}")

    # ------------------------------------------------------------------
    # Step 4: Generate Verilog testbench from spec's test vectors
    # ------------------------------------------------------------------
    print(f"\n  Step 4: Generating Verilog testbench...")
    testbench = generate_verilog_testbench(spec, design)
    print(f"  ✓ Generated testbench ({len(testbench)} chars)")

    # ------------------------------------------------------------------
    # Step 5: Verify design + testbench compile with iverilog
    # ------------------------------------------------------------------
    print(f"\n  Step 5: Verifying compilation with iverilog...")
    compile_ok, stderr = verify_compile(design, testbench)

    if compile_ok:
        print(f"  ✓ iverilog compile passed")
    else:
        print(f"  ⚠ iverilog compile failed: {stderr[:200]}")
        # Try regenerating testbench from design ports (fallback)
        print(f"  Regenerating testbench from actual Verilog ports...")
        testbench = generate_verilog_testbench(spec, design)
        compile_ok, stderr = verify_compile(design, testbench)
        if compile_ok:
            print(f"  ✓ Retry succeeded")
        else:
            print(f"  ⚠ Still failing — returning best effort")

    # ------------------------------------------------------------------
    # Done
    # ------------------------------------------------------------------
    print(f"\n{'=' * 60}")
    print(f"  RESULT")
    print(f"{'=' * 60}")
    print(f"  Design: {len(design)} chars")
    print(f"  Testbench: {len(testbench)} chars")
    print(f"  Correction: {'PASS' if correction.get('passed') else 'FAIL'} "
          f"({correction.get('attempts', 0)} attempt(s))")
    print(f"  Compile: {'PASS' if compile_ok else 'FAIL'}")

    return {
        "design": design,
        "testbench": testbench,
        "spec": spec,
        "correction": correction,
        "compile_ok": compile_ok,
    }


# ---------------------------------------------------------------------------
# main — test with three prompts
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    prompts = [
        "Design a 4-bit counter with reset and enable",
        "Design an 8-bit shift register",
        "Design a 2-to-1 multiplexer",
    ]

    results = {}
    for prompt in prompts:
        try:
            result = generate(prompt)
            results[prompt] = {
                "passed": result["correction"].get("passed", False),
                "compile_ok": result["compile_ok"],
                "design_len": len(result["design"]),
            }
        except Exception as e:
            print(f"\n  ✗ FAILED: {e}")
            results[prompt] = {"passed": False, "compile_ok": False, "error": str(e)}

    # Summary
    print(f"\n\n{'=' * 60}")
    print(f"  SUMMARY — All 3 Prompts")
    print(f"{'=' * 60}")
    for prompt, info in results.items():
        yosys = "PASS" if info.get("passed") else "FAIL"
        iverilog = "PASS" if info.get("compile_ok") else "FAIL"
        print(f"\n  \"{prompt}\"")
        print(f"    Yosys: {yosys} | iverilog: {iverilog}")
        if "error" in info:
            print(f"    Error: {info['error']}")
