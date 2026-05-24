"""
Volta — RTL Generator
Reads a DesignSpec, generates Verilog for each module via Ollama.
"""

import json
import os
import sys
import subprocess
import tempfile

from core.schema import DesignSpec, ModuleSpec, PortDirection, SignalType
from core.llm_client import call_ollama


def build_prompt(module: ModuleSpec) -> str:
    """Build a precise Verilog generation prompt from a ModuleSpec."""

    port_lines = []
    for p in module.ports:
        w = f"[{p.width-1}:0] " if p.width > 1 else ""
        port_lines.append(f"  {p.direction.value} {w}{p.name} — {p.description}")

    op_lines = []
    for op in module.operations:
        line = f"  When op = {op.opcode}: {op.behavior}"
        if op.description:
            line += f"  // {op.description}"
        op_lines.append(line)

    return f"""Write synthesizable Verilog for this module.

Module name: {module.name}
Type: {module.category.value}
Description: {module.description}

Ports:
{chr(10).join(port_lines)}

Behavior:
{chr(10).join(op_lines)}

Rules:
1. Use `always @(*)` for combinational logic.
2. Outputs driven inside always blocks must be declared as `reg`.
3. Include a default case in any case statement.
4. Add the zero_flag as: assign zero_flag = (result == 0);
5. For carry, use: {{carry_out, result}} = a + b; (concatenation for overflow).
6. Module name must be exactly: {module.name}

Return ONLY Verilog. Start with `module` and end with `endmodule`. No explanation."""


def extract_verilog(raw: str, module_name: str) -> str:
    """Pull clean Verilog out of whatever the LLM returns."""

    text = raw.strip()

    # strip markdown fences — find content between them
    if "```" in text:
        parts = text.split("```")
        # content is in the odd-indexed parts (between fences)
        for part in parts[1::2]:
            # remove optional language tag on first line
            lines = part.strip().split("\n")
            if lines and lines[0].strip() in ("verilog", "v", "sv", ""):
                part = "\n".join(lines[1:])
            if "module" in part:
                text = part.strip()
                break

    # find module ... endmodule
    start = text.find(f"module {module_name}")
    if start == -1:
        start = text.find("module ")
    if start != -1:
        text = text[start:]

    end = text.rfind("endmodule")
    if end != -1:
        text = text[:end + len("endmodule")]

    return text.strip()


def check_syntax(verilog: str) -> tuple:
    """Run a quick Yosys syntax check. Returns (ok, errors)."""

    if not verilog:
        return False, ["No Verilog code generated"]

    with tempfile.NamedTemporaryFile(mode="w", suffix=".v", delete=False) as f:
        f.write(verilog)
        path = f.name

    try:
        r = subprocess.run(
            ["yosys", "-p", f"read_verilog {path}"],
            capture_output=True, text=True, timeout=30,
        )
        errors = [l.strip() for l in (r.stdout + r.stderr).split("\n") if "ERROR" in l]
        return (r.returncode == 0 and not errors), errors
    except FileNotFoundError:
        return True, []          # Yosys not installed yet — skip
    except subprocess.TimeoutExpired:
        return False, ["Yosys timed out"]
    finally:
        os.unlink(path)


def generate(spec: DesignSpec) -> dict:
    """Generate Verilog for every module in a DesignSpec."""

    results = {}
    for module in spec.modules:
        print(f"\n--- Generating: {module.name} ---")

        prompt = build_prompt(module)
        print(f"Prompt length: {len(prompt)} chars")

        raw = call_ollama(prompt)
        code = extract_verilog(raw, module.name)

        ok, errors = check_syntax(code)
        tag = "PASS" if ok else "FAIL"
        print(f"Syntax check: {tag}")
        if errors:
            for e in errors:
                print(f"  {e}")

        results[module.name] = {"code": code, "syntax_ok": ok, "errors": errors}
    return results


def save_verilog(results: dict, output_dir: str = "output"):
    """Save generated Verilog to files."""

    os.makedirs(output_dir, exist_ok=True)
    for name, info in results.items():
        if info["code"]:
            path = os.path.join(output_dir, f"{name}.v")
            with open(path, "w") as f:
                f.write(info["code"])
            print(f"Saved: {path}")


if __name__ == "__main__":
    from core.schema import EXAMPLE_ALU

    print("=" * 50)
    print("  VOLTA — RTL Generator")
    print("=" * 50)

    results = generate(EXAMPLE_ALU)

    for name, info in results.items():
        print(f"\n{'=' * 50}")
        print(f"Module: {name}")
        print(f"Syntax: {'PASS' if info['syntax_ok'] else 'FAIL'}")
        print(f"{'=' * 50}")
        print(info["code"])

    save_verilog(results)
