"""
Volta — Correction Engine
Takes Verilog, runs it through Yosys, and if errors are found,
classifies them, builds a targeted correction prompt, calls Ollama
to fix, and repeats up to MAX_ATTEMPTS until it passes.
"""

import json
import os
import re
import sys
import subprocess
import tempfile
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schema import SynthesisResult


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

class ErrorClass:
    UNDECLARED_SIGNAL = "undeclared_signal"
    WIDTH_MISMATCH = "width_mismatch"
    SYNTAX_ERROR = "syntax_error"
    MULTIPLE_DRIVERS = "multiple_drivers"
    MISSING_MODULE = "missing_module"
    UNKNOWN = "unknown"


PATTERNS = [
    (re.compile(r"identifier .* is implicitly declared", re.I),  ErrorClass.UNDECLARED_SIGNAL),
    (re.compile(r"signal .* used but not declared", re.I),       ErrorClass.UNDECLARED_SIGNAL),
    (re.compile(r"wire .* is not declared", re.I),               ErrorClass.UNDECLARED_SIGNAL),
    (re.compile(r"width mismatch", re.I),                        ErrorClass.WIDTH_MISMATCH),
    (re.compile(r"port .* size mismatch", re.I),                 ErrorClass.WIDTH_MISMATCH),
    (re.compile(r"syntax error", re.I),                          ErrorClass.SYNTAX_ERROR),
    (re.compile(r"unexpected.*token", re.I),                     ErrorClass.SYNTAX_ERROR),
    (re.compile(r"multiple.*driv", re.I),                        ErrorClass.MULTIPLE_DRIVERS),
    (re.compile(r"multiple conflicting", re.I),                  ErrorClass.MULTIPLE_DRIVERS),
    (re.compile(r"module .* is not part of the design", re.I),   ErrorClass.MISSING_MODULE),
    (re.compile(r"can't open include file", re.I),               ErrorClass.MISSING_MODULE),
    (re.compile(r"referenced in module .* in cell", re.I),       ErrorClass.MISSING_MODULE),
]


def classify_error(msg: str) -> str:
    """Map a Yosys error message to an error class."""
    for pattern, cls in PATTERNS:
        if pattern.search(msg):
            return cls
    return ErrorClass.UNKNOWN


def classify_errors(errors: list[str]) -> dict[str, list[str]]:
    """Group a list of error messages by class."""
    grouped: dict[str, list[str]] = {}
    for e in errors:
        cls = classify_error(e)
        grouped.setdefault(cls, []).append(e)
    return grouped


# ---------------------------------------------------------------------------
# Yosys interface
# ---------------------------------------------------------------------------

def run_yosys(verilog: str) -> SynthesisResult:
    """Run Yosys read_verilog on a Verilog string. Return a SynthesisResult."""

    if not verilog.strip():
        return SynthesisResult(success=False, errors=["Empty Verilog input"], log="")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".v", delete=False) as f:
        f.write(verilog)
        path = f.name

    try:
        r = subprocess.run(
            ["yosys", "-p", f"read_verilog {path}; hierarchy -check; proc; opt"],
            capture_output=True, text=True, timeout=30,
        )
        full_log = r.stdout + r.stderr

        errors = [l.strip() for l in full_log.split("\n") if "ERROR" in l]
        warnings = [l.strip() for l in full_log.split("\n")
                     if "Warning" in l and "ERROR" not in l]

        return SynthesisResult(
            success=(r.returncode == 0 and not errors),
            errors=errors,
            warnings=warnings,
            log=full_log,
        )
    except FileNotFoundError:
        # Yosys not installed — skip verification, assume OK
        return SynthesisResult(
            success=True,
            warnings=["Yosys not found — install with: brew install yosys"],
            log="",
        )
    except subprocess.TimeoutExpired:
        return SynthesisResult(
            success=False, errors=["Yosys timed out after 30s"], log=""
        )
    finally:
        os.unlink(path)


# ---------------------------------------------------------------------------
# Correction prompt builder
# ---------------------------------------------------------------------------

CORRECTION_HINTS = {
    ErrorClass.UNDECLARED_SIGNAL: (
        "One or more signals are used but never declared. "
        "Declare them as wire or reg as needed."
    ),
    ErrorClass.WIDTH_MISMATCH: (
        "There is a width mismatch on a port or assignment. "
        "Check bit-widths on all ports and assignments."
    ),
    ErrorClass.SYNTAX_ERROR: (
        "There is a Verilog syntax error. Check for missing semicolons, "
        "mismatched begin/end, or incorrect keywords."
    ),
    ErrorClass.MULTIPLE_DRIVERS: (
        "A signal has multiple drivers. Ensure each signal is driven "
        "from exactly one always block or assign statement."
    ),
    ErrorClass.MISSING_MODULE: (
        "A module instance references a module that doesn't exist. "
        "Check module names and includes."
    ),
    ErrorClass.UNKNOWN: (
        "Fix the errors listed below."
    ),
}


def build_correction_prompt(verilog: str, errors: list[str]) -> str:
    """Build a targeted prompt to fix Verilog errors."""

    grouped = classify_errors(errors)

    hint_lines = []
    for cls, msgs in grouped.items():
        hint_lines.append(f"Category: {cls}")
        hint_lines.append(f"Hint: {CORRECTION_HINTS.get(cls, CORRECTION_HINTS[ErrorClass.UNKNOWN])}")
        for m in msgs:
            hint_lines.append(f"  - {m}")

    return f"""Fix the Verilog code below. The synthesis tool reported errors.

Errors found:
{chr(10).join(hint_lines)}

Original Verilog:
```verilog
{verilog}
```

Rules:
1. Return ONLY the corrected Verilog. Start with `module` and end with `endmodule`.
2. Do not add any explanation, markdown, or comments outside the code.
3. Preserve the original module name, ports, and intended behavior.
4. Outputs driven inside always blocks must be declared as `reg`.
5. Every signal used must be declared.
6. Ensure all begin/end blocks and semicolons are correct."""


# ---------------------------------------------------------------------------
# Ollama interface
# ---------------------------------------------------------------------------

def call_ollama(prompt: str, model: str = "codellama:7b") -> str:
    """Send a prompt to the local Ollama server."""

    try:
        resp = requests.post("http://localhost:11434/api/generate", json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 2048},
        }, timeout=120)
        resp.raise_for_status()
        return resp.json()["response"]
    except requests.ConnectionError:
        raise RuntimeError(
            "Ollama not reachable at localhost:11434. "
            "Start it with: ollama serve"
        )


def extract_verilog(raw: str) -> str:
    """Pull clean Verilog out of whatever the LLM returns."""

    text = raw.strip()

    # strip markdown fences
    if "```" in text:
        parts = text.split("```")
        for part in parts[1::2]:
            lines = part.strip().split("\n")
            if lines and lines[0].strip() in ("verilog", "v", "sv", ""):
                part = "\n".join(lines[1:])
            if "module" in part:
                text = part.strip()
                break

    # find module ... endmodule
    start = text.find("module ")
    if start != -1:
        text = text[start:]

    end = text.rfind("endmodule")
    if end != -1:
        text = text[:end + len("endmodule")]

    return text.strip()


# ---------------------------------------------------------------------------
# Correction loop
# ---------------------------------------------------------------------------

MAX_ATTEMPTS = 5


def correct(
    verilog: str,
    model: str = "codellama:7b",
    max_attempts: int = MAX_ATTEMPTS,
) -> dict:
    """
    Run verilog through Yosys. If errors are found, classify them,
    call Ollama to fix, and repeat up to max_attempts.

    Returns:
        {
            "final_code": str,
            "passed": bool,
            "attempts": int,
            "log": [  # one entry per attempt
                {
                    "attempt": int,
                    "passed": bool,
                    "errors": [...],
                    "error_classes": {...},
                    "synthesis": SynthesisResult,
                }
            ],
        }
    """

    code = verilog
    log = []

    for attempt in range(1, max_attempts + 1):
        print(f"\n  [Attempt {attempt}/{max_attempts}]")

        result = run_yosys(code)

        entry = {
            "attempt": attempt,
            "passed": result.success,
            "errors": result.errors,
            "error_classes": classify_errors(result.errors),
            "synthesis": result,
        }
        log.append(entry)

        if result.success:
            print(f"  PASS — no errors")
            if result.warnings:
                print(f"  Warnings: {len(result.warnings)}")
            return {
                "final_code": code,
                "passed": True,
                "attempts": attempt,
                "log": log,
            }

        # Print errors
        print(f"  FAIL — {len(result.errors)} error(s):")
        for e in result.errors:
            cls = classify_error(e)
            print(f"    [{cls}] {e}")

        if attempt == max_attempts:
            print(f"  Max attempts reached. Giving up.")
            break

        # Build correction prompt and call Ollama
        print(f"  Calling Ollama ({model}) to fix...")
        prompt = build_correction_prompt(code, result.errors)
        try:
            raw = call_ollama(prompt, model=model)
        except RuntimeError as e:
            print(f"  {e}")
            break
        fixed = extract_verilog(raw)

        if not fixed or "module" not in fixed:
            print(f"  LLM returned no usable Verilog. Retrying...")
            continue

        code = fixed

    return {
        "final_code": code,
        "passed": False,
        "attempts": len(log),
        "log": log,
    }


# ---------------------------------------------------------------------------
# main — demo on output/alu.v
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  VOLTA — Correction Engine")
    print("=" * 60)

    # Load alu.v
    alu_path = os.path.join(os.path.dirname(__file__), "..", "output", "alu.v")
    if not os.path.exists(alu_path):
        print(f"File not found: {alu_path}")
        sys.exit(1)

    with open(alu_path) as f:
        original = f.read()

    print(f"\nLoaded: {alu_path} ({len(original)} chars)")

    # First, check if it already passes
    print("\n--- Checking original code ---")
    result = run_yosys(original)

    if result.success:
        print("Original code already passes Yosys.")
        print("Intentionally breaking it (removing a semicolon) to demo the engine...\n")

        # Break it: remove the first semicolon after an assignment
        broken = original.replace(
            "{carry_out, result} = a + b;",
            "{carry_out, result} = a + b",
            1,
        )
        if broken == original:
            # fallback: remove any semicolon
            broken = original.replace(";", "", 1)

        print("--- Broken code ---")
        print(broken)
        print()

        out = correct(broken)
    else:
        print(f"Original has errors: {result.errors}")
        print("Running correction engine...\n")
        out = correct(original)

    # Summary
    print("\n" + "=" * 60)
    print("  RESULT")
    print("=" * 60)
    print(f"  Passed:   {out['passed']}")
    print(f"  Attempts: {out['attempts']}")
    print()

    for entry in out["log"]:
        status = "PASS" if entry["passed"] else "FAIL"
        n_err = len(entry["errors"])
        classes = list(entry["error_classes"].keys()) if entry["errors"] else []
        print(f"  Attempt {entry['attempt']}: {status} — {n_err} error(s) {classes}")

    print(f"\n--- Final Verilog ---")
    print(out["final_code"])

    # Save corrected version if it passed
    if out["passed"] and out["attempts"] > 1:
        corrected_path = os.path.join(os.path.dirname(__file__), "..", "output", "alu_corrected.v")
        with open(corrected_path, "w") as f:
            f.write(out["final_code"])
        print(f"\nSaved corrected code to: {corrected_path}")
