#!/usr/bin/env python3
"""
Volta — Evaluation Suite
Automated benchmark: runs 30 hardware design prompts through the orchestrator
and measures generation success, Yosys synthesis, iverilog compilation, timing.

Usage:
    python tests/eval_suite.py

Requires Ollama running at localhost:11434 with the target model loaded.
Results saved to tests/eval_results.json (git-ignored).
"""

import json
import os
import sys
import time
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)


# ---------------------------------------------------------------------------
# ANSI colors
# ---------------------------------------------------------------------------

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
DIM = "\033[90m"
BOLD = "\033[1m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# 30 test prompts by category
# ---------------------------------------------------------------------------

EVAL_PROMPTS = [
    # Combinational (10)
    {"category": "Combinational", "prompt": "Design a 2-to-1 multiplexer"},
    {"category": "Combinational", "prompt": "Design a 4-to-1 multiplexer with 8-bit data inputs"},
    {"category": "Combinational", "prompt": "Design a 4-bit ripple carry adder"},
    {"category": "Combinational", "prompt": "Design a 4-bit magnitude comparator"},
    {"category": "Combinational", "prompt": "Design a 3-to-8 decoder"},
    {"category": "Combinational", "prompt": "Design an 8-to-3 priority encoder"},
    {"category": "Combinational", "prompt": "Design a 4-bit ALU with add, sub, and, or"},
    {"category": "Combinational", "prompt": "Design a half adder"},
    {"category": "Combinational", "prompt": "Design a full adder"},
    {"category": "Combinational", "prompt": "Design an 8-bit parity generator"},

    # Sequential (7)
    {"category": "Sequential", "prompt": "Design a D flip-flop with asynchronous reset"},
    {"category": "Sequential", "prompt": "Design a JK flip-flop with synchronous reset"},
    {"category": "Sequential", "prompt": "Design a T flip-flop with enable"},
    {"category": "Sequential", "prompt": "Design a 4-bit counter with reset and enable"},
    {"category": "Sequential", "prompt": "Design an 8-bit shift register with serial in and parallel out"},
    {"category": "Sequential", "prompt": "Design a 4-bit ring counter"},
    {"category": "Sequential", "prompt": "Design a 4-bit Johnson counter"},

    # FSM (3)
    {"category": "FSM", "prompt": "Design a traffic light controller FSM with green, yellow, red states"},
    {"category": "FSM", "prompt": "Design a simple vending machine FSM that accepts 5 and 10 cent coins and dispenses at 25 cents"},
    {"category": "FSM", "prompt": "Design a sequence detector FSM that detects the pattern 1011"},

    # Memory (2)
    {"category": "Memory", "prompt": "Design an 8x8 register file with one read port and one write port"},
    {"category": "Memory", "prompt": "Design a 16-entry FIFO buffer with 8-bit data width"},

    # Interface (3)
    {"category": "Interface", "prompt": "Design a UART transmitter with 8-bit data, start bit, and stop bit"},
    {"category": "Interface", "prompt": "Design an SPI master controller with MOSI, MISO, SCLK, CS signals"},
    {"category": "Interface", "prompt": "Design an I2C controller stub with SDA and SCL outputs"},

    # Arithmetic (2)
    {"category": "Arithmetic", "prompt": "Design a 4x4 combinational multiplier"},
    {"category": "Arithmetic", "prompt": "Design an 8-bit barrel shifter with left and right shift"},

    # Control (3)
    {"category": "Control", "prompt": "Design a PWM generator with 8-bit duty cycle input"},
    {"category": "Control", "prompt": "Design a clock divider that divides the input clock by 4"},
    {"category": "Control", "prompt": "Design an edge detector that outputs a one-cycle pulse on rising edge of the input signal"},
]

RESULTS_FILE = os.path.join(SCRIPT_DIR, "eval_results.json")


# ---------------------------------------------------------------------------
# Check Ollama is running
# ---------------------------------------------------------------------------

def check_ollama():
    """Return True if Ollama is reachable."""
    try:
        import requests
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Load previous results for diff
# ---------------------------------------------------------------------------

def load_previous_results():
    """Load the most recent eval run from the results file."""
    if not os.path.exists(RESULTS_FILE):
        return None
    try:
        with open(RESULTS_FILE) as f:
            data = json.load(f)
        if isinstance(data, list) and data:
            return data[-1]
    except (json.JSONDecodeError, KeyError):
        pass
    return None


# ---------------------------------------------------------------------------
# Run a single evaluation
# ---------------------------------------------------------------------------

def eval_single(idx: int, total: int, entry: dict) -> dict:
    """Run a single prompt through the orchestrator and collect metrics."""

    prompt = entry["prompt"]
    category = entry["category"]

    # Print progress
    label = prompt[:55] + "..." if len(prompt) > 55 else prompt
    print(f"  [{idx + 1:2d}/{total}] {DIM}{category:14s}{RESET} {label}", end="", flush=True)

    result = {
        "prompt": prompt,
        "category": category,
        "generated": False,
        "yosys_pass": False,
        "compile_pass": False,
        "correction_attempts": 0,
        "fallback_used": None,
        "time_seconds": 0,
        "error": None,
    }

    start = time.time()

    try:
        from core.orchestrator import generate
        out = generate(prompt)

        elapsed = time.time() - start
        result["time_seconds"] = round(elapsed, 1)

        # Check generation
        design = out.get("design", "")
        if design and "module" in design:
            result["generated"] = True

        # Check Yosys
        correction = out.get("correction", {})
        result["yosys_pass"] = correction.get("passed", False)
        result["correction_attempts"] = correction.get("attempts", 0)

        # Check iverilog compile
        result["compile_pass"] = out.get("compile_ok", False)

        # Fallback
        result["fallback_used"] = out.get("fallback_used")

    except Exception as e:
        elapsed = time.time() - start
        result["time_seconds"] = round(elapsed, 1)
        result["error"] = str(e)[:200]

    # Print result
    passed = result["generated"] and result["compile_pass"]
    if passed:
        tag = f"{GREEN}PASS{RESET}"
    else:
        tag = f"{RED}FAIL{RESET}"

    extras = []
    if result["correction_attempts"] > 1:
        extras.append(f"{result['correction_attempts']} fixes")
    if result["fallback_used"]:
        extras.append(f"fb:{result['fallback_used'][:15]}")
    extra_str = f" {DIM}({', '.join(extras)}){RESET}" if extras else ""

    print(f" {tag} {DIM}{result['time_seconds']}s{RESET}{extra_str}")

    return result


# ---------------------------------------------------------------------------
# Print summary table
# ---------------------------------------------------------------------------

def print_summary(results: list, prev_run: dict | None):
    """Print a formatted summary of eval results."""

    total = len(results)
    gen_pass = sum(1 for r in results if r["generated"])
    yosys_pass = sum(1 for r in results if r["yosys_pass"])
    compile_pass = sum(1 for r in results if r["compile_pass"])
    full_pass = sum(1 for r in results if r["generated"] and r["compile_pass"])
    avg_time = sum(r["time_seconds"] for r in results) / max(total, 1)
    avg_fixes = sum(r["correction_attempts"] for r in results) / max(total, 1)

    # Category breakdown
    categories = {}
    for r in results:
        cat = r["category"]
        if cat not in categories:
            categories[cat] = {"total": 0, "passed": 0}
        categories[cat]["total"] += 1
        if r["generated"] and r["compile_pass"]:
            categories[cat]["passed"] += 1

    print(f"\n{'=' * 70}")
    print(f"  {BOLD}{GREEN}VOLTA EVALUATION RESULTS{RESET}")
    print(f"{'=' * 70}")

    print(f"\n  {BOLD}Overall:{RESET}")
    pct = (full_pass / total * 100) if total else 0
    color = GREEN if pct >= 70 else YELLOW if pct >= 50 else RED
    print(f"    Full pass (gen + compile): {color}{full_pass}/{total} = {pct:.0f}%{RESET}")
    print(f"    Generation pass:           {gen_pass}/{total}")
    print(f"    Yosys pass:                {yosys_pass}/{total}")
    print(f"    iverilog compile pass:     {compile_pass}/{total}")
    print(f"    Avg time per test:         {avg_time:.1f}s")
    print(f"    Avg correction attempts:   {avg_fixes:.1f}")

    print(f"\n  {BOLD}By Category:{RESET}")
    for cat in sorted(categories.keys()):
        info = categories[cat]
        pct = (info["passed"] / info["total"] * 100) if info["total"] else 0
        color = GREEN if pct >= 70 else YELLOW if pct >= 50 else RED
        print(f"    {cat:14s} {color}{info['passed']:2d}/{info['total']:2d} = {pct:3.0f}%{RESET}")

    # Failed tests
    failures = [r for r in results if not (r["generated"] and r["compile_pass"])]
    if failures:
        print(f"\n  {BOLD}{RED}Failed Tests:{RESET}")
        for r in failures:
            reason = r.get("error") or ("no code" if not r["generated"] else "compile fail")
            print(f"    {RED}✗{RESET} {r['prompt'][:60]}")
            print(f"      {DIM}{reason[:80]}{RESET}")

    # Diff vs previous run
    if prev_run:
        prev_pass = prev_run.get("full_pass", 0)
        prev_total = prev_run.get("total", 0)
        delta = full_pass - prev_pass

        print(f"\n  {BOLD}vs Last Run:{RESET} ", end="")
        if delta > 0:
            print(f"{GREEN}+{delta} improved{RESET} ({prev_pass}/{prev_total} -> {full_pass}/{total})")
        elif delta < 0:
            print(f"{RED}{delta} regressed{RESET} ({prev_pass}/{prev_total} -> {full_pass}/{total})")
        else:
            print(f"{DIM}no change{RESET} ({full_pass}/{total})")

        # Show specific regressions/improvements
        prev_prompts = {r["prompt"]: r for r in prev_run.get("tests", [])}
        for r in results:
            prev = prev_prompts.get(r["prompt"])
            if not prev:
                continue
            was_pass = prev.get("generated", False) and prev.get("compile_pass", False)
            is_pass = r["generated"] and r["compile_pass"]
            if is_pass and not was_pass:
                print(f"      {GREEN}+ NOW PASSING:{RESET} {r['prompt'][:55]}")
            elif not is_pass and was_pass:
                print(f"      {RED}- REGRESSED:{RESET}   {r['prompt'][:55]}")

    print(f"\n{'=' * 70}\n")


# ---------------------------------------------------------------------------
# Save results
# ---------------------------------------------------------------------------

def save_results(results: list):
    """Append results to the JSON results file."""

    total = len(results)
    full_pass = sum(1 for r in results if r["generated"] and r["compile_pass"])

    entry = {
        "timestamp": datetime.now().isoformat(),
        "total": total,
        "full_pass": full_pass,
        "pass_rate": round(full_pass / total * 100, 1) if total else 0,
        "avg_time": round(sum(r["time_seconds"] for r in results) / max(total, 1), 1),
        "tests": results,
    }

    # Load existing data
    data = []
    if os.path.exists(RESULTS_FILE):
        try:
            with open(RESULTS_FILE) as f:
                data = json.load(f)
            if not isinstance(data, list):
                data = [data]
        except (json.JSONDecodeError, KeyError):
            data = []

    data.append(entry)

    os.makedirs(os.path.dirname(RESULTS_FILE), exist_ok=True)
    with open(RESULTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

    print(f"  Results saved to: {RESULTS_FILE}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"\n{'=' * 70}")
    print(f"  {BOLD}{GREEN}VOLTA — Evaluation Suite{RESET}")
    print(f"  {DIM}30 hardware design benchmarks{RESET}")
    print(f"{'=' * 70}\n")

    # Check Ollama
    print(f"  Checking Ollama... ", end="", flush=True)
    if not check_ollama():
        print(f"{RED}NOT RUNNING{RESET}")
        print(f"\n  {RED}Error: Ollama is not reachable at localhost:11434{RESET}")
        print(f"  Start it with: {CYAN}ollama serve{RESET}")
        sys.exit(1)
    print(f"{GREEN}OK{RESET}")

    # Load previous results for diff
    prev_run = load_previous_results()
    if prev_run:
        print(f"  Previous run: {prev_run.get('full_pass', '?')}/{prev_run.get('total', '?')} "
              f"pass ({prev_run.get('pass_rate', '?')}%) — {prev_run.get('timestamp', '?')[:19]}")

    total = len(EVAL_PROMPTS)
    print(f"\n  Running {total} tests...\n")

    # Run all tests
    start_all = time.time()
    results = []

    for idx, entry in enumerate(EVAL_PROMPTS):
        result = eval_single(idx, total, entry)
        results.append(result)

    total_time = time.time() - start_all

    # Summary
    print_summary(results, prev_run)
    print(f"  Total time: {total_time:.0f}s ({total_time / 60:.1f} min)\n")

    # Save
    save_results(results)


if __name__ == "__main__":
    main()
