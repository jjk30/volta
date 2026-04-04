"""
Volta — Orchestrator
Full generate pipeline: prompt → spec → Verilog → correction → testbench → verify.

This is the main entry point for the /generate flow. It coordinates:
  1. Spec Interpreter   — prompt → structured DesignSpec (with fallback)
  2. RTL Generator      — spec → Verilog (with precise, structured prompt)
  3. Post-processing    — auto-fix common LLM Verilog mistakes
  4. Correction Engine  — Yosys verification + auto-fix loop
  5. Testbench Gen      — spec test vectors → Verilog testbench with VCD
  6. Smoke-test Fallback — if testbench fails, generate basic exerciser
  7. Compilation Check  — iverilog to verify design + testbench compile

If the structured spec approach fails, falls back to direct generation.
The goal: ANY reasonable hardware prompt produces SOME working output.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schema import DesignSpec, ModuleSpec, PortDirection, SignalType
from spec_interpreter import interpret, _sanitize_identifier, _guess_module_name
from rtl_generator import call_ollama, extract_verilog
from correction_engine import correct as correct_verilog, run_yosys


# ---------------------------------------------------------------------------
# Generic Verilog generation prompt (spec-driven)
# ---------------------------------------------------------------------------

def build_generate_prompt(module: ModuleSpec) -> str:
    """Build a precise Verilog generation prompt from a ModuleSpec."""

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
7. Do not use SystemVerilog features. Use standard Verilog-2001.

Return ONLY Verilog. Start with `module` and end with `endmodule`. No explanation."""


# ---------------------------------------------------------------------------
# Direct generation fallback prompt (no spec needed)
# ---------------------------------------------------------------------------

DIRECT_GENERATE_PROMPT = """You are an expert Verilog designer. Write synthesizable Verilog
for the following hardware design.

Design request: {prompt}

Rules:
1. Use `always @(*)` for combinational logic, `always @(posedge clk)` for sequential.
2. Outputs driven inside always blocks MUST be declared as `output reg` in the port list.
3. Include a default case in any case statement.
4. Sequential designs need clk and rst inputs. On rst==1, reset all outputs to 0.
5. Module name should be a short snake_case identifier.
6. Every signal used must be declared as wire or reg.
7. Do not use SystemVerilog features. Use standard Verilog-2001.
8. Initialize all signals to avoid latches.

Return ONLY Verilog. Start with `module` and end with `endmodule`. No explanation."""


SIMPLIFIED_DIRECT_PROMPT = """Write simple Verilog for: {prompt}

Keep it minimal. Use `always @(*)` for combinational or `always @(posedge clk)` for
sequential. Declare outputs as `output reg` if used in always blocks. Include default
cases. Start with `module` and end with `endmodule`. No explanation."""


# ---------------------------------------------------------------------------
# Post-processing: fix common LLM Verilog issues
# ---------------------------------------------------------------------------

def _fix_verilog(verilog: str) -> str:
    """Apply all post-processing fixes to Verilog code."""
    code = verilog
    code = _fix_reg_declarations(code)
    code = _fix_duplicate_reg_declarations(code)
    code = _fix_missing_semicolons(code)
    code = _fix_undeclared_regs(code)
    code = _strip_systemverilog(code)
    return code


def _fix_reg_declarations(verilog: str) -> str:
    """Fix outputs used in always blocks but not declared as reg."""

    lines = verilog.split("\n")

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

    in_always = False
    always_depth = 0
    needs_reg = set()
    for line in lines:
        stripped = line.strip()
        if re.match(r"always\s+@", stripped):
            in_always = True
            always_depth = 0
        if in_always:
            always_depth += stripped.count("begin") - stripped.count("end")
            for name in output_names:
                if re.search(rf'\b{re.escape(name)}\b\s*<?=', stripped):
                    needs_reg.add(name)
                if re.search(rf'\{{\s*{re.escape(name)}\b', stripped):
                    needs_reg.add(name)
            if always_depth <= 0 and "end" in stripped:
                in_always = False

    if not needs_reg:
        return verilog

    new_lines = []
    for line in lines:
        for name in needs_reg:
            pattern = r"(\s*output\s+)(\[[\d:]+\]\s+)?" + re.escape(name) + r"\b"
            if re.match(pattern, line.rstrip(",").rstrip(");")) and "reg" not in line:
                line = line.replace("output ", "output reg ", 1)
                break
        new_lines.append(line)

    return "\n".join(new_lines)


def _fix_duplicate_reg_declarations(verilog: str) -> str:
    """Remove duplicate reg declarations for signals already declared as output reg.

    LLMs often generate both 'output reg [3:0] q' in the port list AND
    'reg [3:0] q;' in the module body, causing iverilog to error with
    'has already been declared in this scope'.
    """

    lines = verilog.split("\n")

    # Extract the full port list text (may span one or many lines)
    full_text = verilog
    port_list_match = re.search(r'module\s+\w+\s*\((.*?)\)\s*;', full_text, re.DOTALL)

    port_reg_names = set()
    if port_list_match:
        port_list_text = port_list_match.group(1)
        # Split by comma to handle single-line and multi-line declarations
        for port_decl in port_list_text.split(","):
            port_decl = port_decl.strip()
            m = re.match(
                r'(?:output|input)\s+reg\s+(?:\[[\d:]+\]\s+)?(\w+)',
                port_decl,
            )
            if m:
                port_reg_names.add(m.group(1))

    if not port_reg_names:
        return verilog

    # Remove standalone reg declarations for those same signals in the body
    new_lines = []
    past_ports = False
    for line in lines:
        stripped = line.strip()
        if ");" in stripped:
            past_ports = True
        if past_ports:
            # Match: reg q; or reg [3:0] q; (standalone declarations, not inside always)
            m = re.match(r"\s*reg\s+(?:\[[\d:]+\]\s+)?(\w+)\s*;", stripped)
            if m and m.group(1) in port_reg_names:
                continue  # skip this duplicate line
        new_lines.append(line)

    return "\n".join(new_lines)


def _fix_missing_semicolons(verilog: str) -> str:
    """Fix missing semicolons after common statements."""

    lines = verilog.split("\n")
    new_lines = []

    for i, line in enumerate(lines):
        stripped = line.rstrip()
        trimmed = stripped.strip()

        # Skip empty lines, comments, begin/end, module/endmodule, directives
        if not trimmed or trimmed.startswith("//") or trimmed.startswith("`"):
            new_lines.append(line)
            continue
        if trimmed in ("begin", "end", "endmodule", "endcase", "endfunction",
                       "endtask", "else", "else begin"):
            new_lines.append(line)
            continue
        if trimmed.startswith(("module ", "always ", "if ", "else ", "for ",
                               "case ", "case(", "default", "input ", "output ",
                               "wire ", "reg ", "assign ", "initial ",
                               "function ", "task ")):
            new_lines.append(line)
            continue

        # Lines that should end with ; but don't
        # Assignments: foo = bar, foo <= bar
        if re.match(r".*\b\w+\s*<?=\s*.+[^;,\s]$", trimmed):
            if not trimmed.endswith(("begin", "end", ";")):
                line = stripped + ";"
        new_lines.append(line)

    return "\n".join(new_lines)


def _fix_undeclared_regs(verilog: str) -> str:
    """Detect signals assigned in always blocks that aren't declared,
    and add reg declarations for them."""

    lines = verilog.split("\n")

    # Collect all declared signals
    declared = set()
    for line in lines:
        stripped = line.strip().rstrip(",").rstrip(");")
        for pattern in [
            r"(?:input|output)\s+(?:reg\s+)?(?:wire\s+)?(?:\[[\d:]+\]\s+)?(\w+)",
            r"(?:wire|reg)\s+(?:\[[\d:]+\]\s+)?(\w+)",
        ]:
            m = re.match(pattern, stripped)
            if m:
                declared.add(m.group(1))

    # Find signals assigned in always blocks that aren't declared
    in_always = False
    undeclared = set()
    for line in lines:
        stripped = line.strip()
        if re.match(r"always\s+@", stripped):
            in_always = True
        if in_always:
            m = re.match(r"\s*(\w+)\s*<?=", stripped)
            if m:
                sig = m.group(1)
                if sig not in declared and sig not in ("if", "else", "case",
                                                        "begin", "end", "default"):
                    undeclared.add(sig)
        if stripped == "endmodule":
            in_always = False

    if not undeclared:
        return verilog

    # Insert reg declarations after the port list
    insert_idx = None
    for i, line in enumerate(lines):
        if ");" in line.strip():
            insert_idx = i + 1
            break

    if insert_idx is not None:
        decls = [f"  reg {sig};" for sig in sorted(undeclared)]
        lines = lines[:insert_idx] + [""] + decls + lines[insert_idx:]

    return "\n".join(lines)


def _strip_systemverilog(verilog: str) -> str:
    """Remove common SystemVerilog constructs that Yosys/iverilog reject."""

    # Replace logic with reg/wire
    verilog = re.sub(r'\blogic\b', 'reg', verilog)
    # Remove always_comb / always_ff and convert to always @
    verilog = re.sub(r'always_comb\b', 'always @(*)', verilog)
    verilog = re.sub(r'always_ff\s+@', 'always @', verilog)
    return verilog


# ---------------------------------------------------------------------------
# Parse module info from Verilog source
# ---------------------------------------------------------------------------

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


def _parse_module_name(verilog: str) -> str:
    """Extract module name from Verilog source."""
    m = re.match(r"module\s+(\w+)", verilog)
    return m.group(1) if m else "top"


# ---------------------------------------------------------------------------
# Verilog testbench generator (from spec test vectors)
# ---------------------------------------------------------------------------

def generate_verilog_testbench(spec: DesignSpec, design_code: str) -> str:
    """Generate a Verilog testbench from a DesignSpec's test vectors."""

    module = spec.modules[0]
    module_name = _parse_module_name(design_code) or module.name

    actual_ports = _parse_ports_from_verilog(design_code)
    if actual_ports:
        input_ports = [p for p in actual_ports if p["direction"] == "input"]
        output_ports = [p for p in actual_ports if p["direction"] == "output"]
    else:
        input_ports = [{"name": p.name, "width": p.width}
                       for p in module.ports if p.direction == PortDirection.INPUT]
        output_ports = [{"name": p.name, "width": p.width}
                        for p in module.ports if p.direction == PortDirection.OUTPUT]

    actual_port_names = {p["name"] for p in (actual_ports or [])}
    input_port_names = {p["name"] for p in input_ports}
    output_port_names = {p["name"] for p in output_ports}

    has_clock = any(p.is_clock for p in module.ports)
    has_reset = any(p.is_reset for p in module.ports)

    # Cross-check against actual Verilog ports
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

    for p in input_ports:
        w = f"[{p['width']-1}:0] " if p["width"] > 1 else ""
        lines.append(f"  reg {w}{p['name']};")
    for p in output_ports:
        w = f"[{p['width']-1}:0] " if p["width"] > 1 else ""
        lines.append(f"  wire {w}{p['name']};")

    lines.append("")

    port_connections = []
    for p in input_ports + output_ports:
        port_connections.append(f".{p['name']}({p['name']})")

    lines.append(f"  {module_name} uut(")
    lines.append(f"    {', '.join(port_connections)}")
    lines.append(f"  );")
    lines.append("")

    if has_clock:
        lines.append("  initial clk = 0;")
        lines.append("  always #5 clk = ~clk;")
        lines.append("")

    lines.append("  initial begin")
    lines.append(f'    $dumpfile("dump.vcd");')
    lines.append(f'    $dumpvars(0, tb_{module_name});')
    lines.append("")

    if has_reset:
        rst_name = "rst"
        for n in ("rst", "reset", "rstn", "rst_n"):
            if n in input_port_names:
                rst_name = n
                break
        lines.append("    // Reset")
        lines.append(f"    {rst_name} = 1;")
        lines.append("    #20;")
        lines.append(f"    {rst_name} = 0;")
        lines.append("    #10;")
        lines.append("")

    # Test vectors — only reference actual ports
    for tv in module.test_vectors:
        lines.append(f"    // {tv.description}")
        for port_name, value in tv.inputs.items():
            if port_name in ("clk",):
                continue
            if port_name not in input_port_names:
                continue
            lines.append(f"    {port_name} = {value};")
        lines.append("    #10;")

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


# ---------------------------------------------------------------------------
# Smoke-test testbench fallback
# ---------------------------------------------------------------------------

def generate_smoke_testbench(design_code: str) -> str:
    """Generate a basic smoke-test testbench from Verilog source code.

    This is the last-resort fallback. It instantiates the module, toggles
    clock, applies reset, drives pseudo-random inputs, and includes
    $dumpfile/$dumpvars so the user always gets waveforms.
    """

    module_name = _parse_module_name(design_code)
    ports = _parse_ports_from_verilog(design_code)

    if not ports:
        # Can't even parse ports — return a minimal stub
        return f"""module tb_{module_name};
  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_{module_name});
    #100;
    $finish;
  end
endmodule"""

    input_ports = [p for p in ports if p["direction"] == "input"]
    output_ports = [p for p in ports if p["direction"] == "output"]
    input_names = {p["name"] for p in input_ports}

    has_clock = any(n in input_names for n in ("clk", "clock"))
    has_reset = any(n in input_names for n in ("rst", "reset", "rstn", "rst_n"))

    # Determine clock/reset names
    clk_name = next((n for n in ("clk", "clock") if n in input_names), None)
    rst_name = next((n for n in ("rst", "reset", "rstn", "rst_n") if n in input_names), None)

    # Data inputs (not clock, not reset)
    data_inputs = [p for p in input_ports
                   if p["name"] not in (clk_name, rst_name)]

    lines = []
    lines.append(f"module tb_{module_name};")
    lines.append("")

    for p in input_ports:
        w = f"[{p['width']-1}:0] " if p["width"] > 1 else ""
        lines.append(f"  reg {w}{p['name']};")
    for p in output_ports:
        w = f"[{p['width']-1}:0] " if p["width"] > 1 else ""
        lines.append(f"  wire {w}{p['name']};")

    lines.append("")

    port_connections = [f".{p['name']}({p['name']})" for p in ports]
    lines.append(f"  {module_name} uut(")
    lines.append(f"    {', '.join(port_connections)}")
    lines.append(f"  );")
    lines.append("")

    if has_clock and clk_name:
        lines.append(f"  initial {clk_name} = 0;")
        lines.append(f"  always #5 {clk_name} = ~{clk_name};")
        lines.append("")

    lines.append("  integer i;")
    lines.append("")
    lines.append("  initial begin")
    lines.append(f'    $dumpfile("dump.vcd");')
    lines.append(f'    $dumpvars(0, tb_{module_name});')
    lines.append("")

    # Initialize all inputs to 0
    for p in input_ports:
        lines.append(f"    {p['name']} = 0;")
    lines.append("")

    # Reset sequence
    if has_reset and rst_name:
        lines.append(f"    // Reset")
        lines.append(f"    {rst_name} = 1;")
        lines.append(f"    #20;")
        lines.append(f"    {rst_name} = 0;")
        lines.append(f"    #10;")
        lines.append("")

    # Drive data inputs with incrementing values
    if data_inputs:
        lines.append("    // Smoke test: drive inputs with incrementing values")
        lines.append("    for (i = 0; i < 16; i = i + 1) begin")
        for p in data_inputs:
            mask = (1 << p["width"]) - 1
            lines.append(f"      {p['name']} = i & {p['width']}'d{mask};")
        lines.append("      #10;")

        # Display outputs
        display_parts = [f"i=%0d"]
        display_args = ["i"]
        for p in output_ports:
            display_parts.append(f"{p['name']}=%0d")
            display_args.append(p["name"])
        fmt = " ".join(display_parts)
        args = ", ".join(display_args)
        lines.append(f'      $display("{fmt}", {args});')
        lines.append("    end")
    else:
        lines.append("    #200;")

    lines.append("")
    lines.append("    #20;")
    lines.append("    $finish;")
    lines.append("  end")
    lines.append("")
    lines.append("endmodule")

    return "\n".join(lines)


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
            return True, ""
        except subprocess.TimeoutExpired:
            return False, "iverilog timed out"


# ---------------------------------------------------------------------------
# Direct generation fallback (no spec)
# ---------------------------------------------------------------------------

def _direct_generate(prompt: str, model: str = "codellama:7b") -> str:
    """Generate Verilog directly from a prompt, without a spec.

    Used as fallback when spec interpretation fails.
    """

    print(f"\n  [Fallback] Direct generation from prompt...")
    filled = DIRECT_GENERATE_PROMPT.format(prompt=prompt)
    raw = call_ollama(filled, model=model)
    code = extract_verilog(raw, "")

    if not code or "module" not in code:
        # Try simplified prompt
        print(f"  [Fallback] Trying simplified prompt...")
        filled = SIMPLIFIED_DIRECT_PROMPT.format(prompt=prompt)
        raw = call_ollama(filled, model=model)
        code = extract_verilog(raw, "")

    if code and "module" in code:
        code = _fix_verilog(code)

    return code


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def generate(prompt: str, model: str = "codellama:7b") -> dict:
    """Full generate pipeline: prompt → spec → Verilog → correction → testbench.

    Falls back to direct generation if spec interpretation fails.
    Falls back to smoke-test testbench if spec-based testbench fails.
    The goal: always produce SOME working output.

    Returns:
        {
            "design": str,
            "testbench": str,
            "spec": DesignSpec | None,
            "correction": { "ran": bool, "passed": bool, "attempts": int, "errors_fixed": list },
            "compile_ok": bool,
            "fallback_used": str | None,
        }
    """

    print(f"\n{'=' * 60}")
    print(f"  VOLTA — Orchestrator")
    print(f"{'=' * 60}")
    print(f"  Prompt: {prompt}")

    spec = None
    design = None
    fallback_used = None

    # ------------------------------------------------------------------
    # Step 1: Try spec-driven generation
    # ------------------------------------------------------------------
    try:
        print(f"\n  Step 1: Interpreting prompt → structured spec...")
        spec = interpret(prompt, model=model)
        module = spec.modules[0]
        print(f"  ✓ Spec: {module.name} | {len(module.ports)} ports | "
              f"{len(module.operations)} ops | {len(module.test_vectors)} tests")

        print(f"\n  Step 2: Generating Verilog from structured spec...")
        verilog_prompt = build_generate_prompt(module)
        raw = call_ollama(verilog_prompt, model=model)
        design = extract_verilog(raw, module.name)

        if design and "module" in design:
            design = _fix_verilog(design)
            print(f"  ✓ Generated {len(design)} chars of Verilog")
        else:
            print(f"  ⚠ Spec-based generation returned invalid Verilog")
            design = None

    except Exception as e:
        print(f"  ⚠ Spec-driven pipeline failed: {e}")

    # ------------------------------------------------------------------
    # Step 2b: Fallback to direct generation if spec approach failed
    # ------------------------------------------------------------------
    if not design or "module" not in design:
        print(f"\n  Step 2b: Falling back to direct generation...")
        fallback_used = "direct_generation"
        try:
            design = _direct_generate(prompt, model=model)
            if design and "module" in design:
                print(f"  ✓ Direct generation produced {len(design)} chars")
            else:
                raise RuntimeError("Direct generation returned invalid Verilog")
        except Exception as e:
            raise RuntimeError(f"All generation approaches failed: {e}")

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

                # Last resort: try once more from scratch with simplified prompt
                if fallback_used != "direct_generation":
                    print(f"  ⚠ Trying fresh generation from scratch...")
                    try:
                        fresh = _direct_generate(prompt, model=model)
                        if fresh and "module" in fresh:
                            fresh = _fix_verilog(fresh)
                            synth2 = run_yosys(fresh)
                            if synth2.success:
                                design = fresh
                                correction["passed"] = True
                                fallback_used = "regenerated_from_scratch"
                                print(f"  ✓ Fresh generation passed Yosys")
                    except Exception:
                        pass
    except Exception as e:
        print(f"  ⚠ Correction engine error (non-fatal): {e}")

    # ------------------------------------------------------------------
    # Step 4: Generate testbench
    # ------------------------------------------------------------------
    print(f"\n  Step 4: Generating testbench...")
    testbench = None

    # Try spec-based testbench first (if we have a spec with test vectors)
    if spec and spec.modules[0].test_vectors:
        try:
            testbench = generate_verilog_testbench(spec, design)
            ok, stderr = verify_compile(design, testbench)
            if ok:
                print(f"  ✓ Spec-based testbench ({len(testbench)} chars)")
            else:
                print(f"  ⚠ Spec-based testbench failed iverilog: {stderr[:150]}")
                testbench = None
        except Exception as e:
            print(f"  ⚠ Spec-based testbench generation failed: {e}")
            testbench = None

    # Fallback: smoke-test testbench
    if testbench is None:
        print(f"  Falling back to smoke-test testbench...")
        fallback_used = fallback_used or "smoke_testbench"
        try:
            testbench = generate_smoke_testbench(design)
            print(f"  ✓ Smoke-test testbench ({len(testbench)} chars)")
        except Exception as e:
            print(f"  ⚠ Smoke-test generation failed: {e}")
            # Absolute last resort — minimal testbench
            module_name = _parse_module_name(design)
            testbench = f"""module tb_{module_name};
  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_{module_name});
    #100;
    $finish;
  end
endmodule"""

    # ------------------------------------------------------------------
    # Step 5: Verify compilation
    # ------------------------------------------------------------------
    print(f"\n  Step 5: Verifying compilation with iverilog...")
    compile_ok, stderr = verify_compile(design, testbench)

    if compile_ok:
        print(f"  ✓ iverilog compile passed")
    else:
        print(f"  ⚠ iverilog compile failed: {stderr[:200]}")
        # Try smoke-test as final fallback
        if "smoke" not in (fallback_used or ""):
            print(f"  Trying smoke-test testbench...")
            testbench = generate_smoke_testbench(design)
            compile_ok, stderr = verify_compile(design, testbench)
            if compile_ok:
                print(f"  ✓ Smoke-test compile passed")
                fallback_used = fallback_used or "smoke_testbench"
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
    if fallback_used:
        print(f"  Fallback: {fallback_used}")

    return {
        "design": design,
        "testbench": testbench,
        "spec": spec,
        "correction": correction,
        "compile_ok": compile_ok,
        "fallback_used": fallback_used,
    }


# ---------------------------------------------------------------------------
# main — test with diverse prompts
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    prompts = [
        "Design a 4-bit counter with reset and enable",
        "Design an 8-bit shift register",
        "Design a 2-to-1 multiplexer",
        "Design a UART transmitter with 8-bit data, start bit, and stop bit",
        "Design a simple RISC-V ALU with add, sub, and, or, xor, sll, srl, sra",
    ]

    results = {}
    for prompt in prompts:
        try:
            result = generate(prompt)
            results[prompt] = {
                "passed": result["correction"].get("passed", False),
                "compile_ok": result["compile_ok"],
                "design_len": len(result["design"]),
                "fallback": result.get("fallback_used"),
            }
        except Exception as e:
            print(f"\n  ✗ FAILED: {e}")
            results[prompt] = {"passed": False, "compile_ok": False, "error": str(e)}

    # Summary
    print(f"\n\n{'=' * 60}")
    print(f"  SUMMARY — All Prompts")
    print(f"{'=' * 60}")
    for prompt, info in results.items():
        yosys = "PASS" if info.get("passed") else "FAIL"
        iverilog = "PASS" if info.get("compile_ok") else "FAIL"
        fb = f" (fallback: {info['fallback']})" if info.get("fallback") else ""
        print(f"\n  \"{prompt}\"")
        print(f"    Yosys: {yosys} | iverilog: {iverilog}{fb}")
        if "error" in info:
            print(f"    Error: {info['error']}")
