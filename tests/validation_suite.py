#!/usr/bin/env python3
"""
Volta — Validation Suite
Tests the chatbot validation system across 37 circuit combinations
(including GPU/parallel-compute primitives).
Verifies correct verdicts: WORKING, STANDALONE, INCOMPLETE, BROKEN, RISKY.

Usage:
    python tests/validation_suite.py

Requires backend on localhost:8000 and Ollama running.
Results saved to tests/validation_results.json.
"""

import json
import os
import sys
import time
import requests
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_FILE = os.path.join(SCRIPT_DIR, "validation_results.json")

API_URL = "http://localhost:8000"
GENERATE_TIMEOUT = 180
CHAT_TIMEOUT = 60

# ANSI colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
DIM = "\033[90m"
BOLD = "\033[1m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Symbol truth table data (hardcoded subset for chat context)
# ---------------------------------------------------------------------------

SYMBOL_TRUTH_TABLES = {
    "and": {"headers": ["A","B","Y"], "rows": [["0","0","0"],["0","1","0"],["1","0","0"],["1","1","1"]]},
    "or": {"headers": ["A","B","Y"], "rows": [["0","0","0"],["0","1","1"],["1","0","1"],["1","1","1"]]},
    "not": {"headers": ["A","Y"], "rows": [["0","1"],["1","0"]]},
    "xor": {"headers": ["A","B","Y"], "rows": [["0","0","0"],["0","1","1"],["1","0","1"],["1","1","0"]]},
    "nand": {"headers": ["A","B","Y"], "rows": [["0","0","1"],["0","1","1"],["1","0","1"],["1","1","0"]]},
    "nor": {"headers": ["A","B","Y"], "rows": [["0","0","1"],["0","1","0"],["1","0","0"],["1","1","0"]]},
    "xnor": {"headers": ["A","B","Y"], "rows": [["0","0","1"],["0","1","0"],["1","0","0"],["1","1","1"]]},
    "buffer": {"headers": ["A","Y"], "rows": [["0","0"],["1","1"]]},
    "tristate": {"headers": ["EN","A","Y"], "rows": [["0","X","Z"],["1","0","0"],["1","1","1"]]},
    "mux2": {"headers": ["S","Y"], "rows": [["0","I0"],["1","I1"]]},
    "mux4": {"headers": ["S1","S0","Y"], "rows": [["0","0","I0"],["0","1","I1"],["1","0","I2"],["1","1","I3"]]},
    "halfadd": {"headers": ["A","B","S","Cout"], "rows": [["0","0","0","0"],["0","1","1","0"],["1","0","1","0"],["1","1","0","1"]]},
    "fulladd": {"headers": ["A","B","Cin","S","Cout"], "rows": [["0","0","0","0","0"],["0","0","1","1","0"],["0","1","0","1","0"],["0","1","1","0","1"],["1","0","0","1","0"],["1","0","1","0","1"],["1","1","0","0","1"],["1","1","1","1","1"]]},
    "cmp": {"headers": ["A vs B","gt","eq","lt"], "rows": [["A>B","1","0","0"],["A=B","0","1","0"],["A<B","0","0","1"]]},
    "dec24": {"headers": ["A1","A0","Y3","Y2","Y1","Y0"], "rows": [["0","0","0","0","0","1"],["0","1","0","0","1","0"],["1","0","0","1","0","0"],["1","1","1","0","0","0"]]},
    "dff": {"headers": ["CLK","D","Q(next)"], "rows": [["up","0","0"],["up","1","1"],["0","X","Q"]]},
    "jkff": {"headers": ["J","K","Q(next)"], "rows": [["0","0","Q"],["0","1","0"],["1","0","1"],["1","1","~Q"]]},
    "tff": {"headers": ["T","Q(next)"], "rows": [["0","Q"],["1","~Q"]]},
    "srlatch": {"headers": ["S","R","Q(next)"], "rows": [["0","0","Q"],["0","1","0"],["1","0","1"],["1","1","?"]]},
}

SYMBOL_NAMES = {
    "and": "AND", "or": "OR", "not": "NOT", "xor": "XOR", "nand": "NAND",
    "nor": "NOR", "xnor": "XNOR", "buffer": "Buffer", "tristate": "Tri-state",
    "mux2": "2:1 MUX", "mux4": "4:1 MUX", "mux8": "8:1 MUX",
    "demux2": "1:2 DEMUX", "demux4": "1:4 DEMUX",
    "halfadd": "Half Adder", "fulladd": "Full Adder", "cmp": "Comparator",
    "dec24": "2:4 Decoder", "prienc": "Priority Encoder",
    "alu": "ALU", "shifter": "Shifter",
    "dff": "D Flip-Flop", "jkff": "JK Flip-Flop", "tff": "T Flip-Flop",
    "srlatch": "SR Latch", "reg": "Register",
    "ram": "RAM", "rom": "ROM", "regfile": "Register File",
    "pc": "Program Counter", "clkgen": "Clock Gen",
    "imem": "Instruction Memory", "dmem": "Data Memory",
    # GPU Components — display names compute_verdict normalizes via NAME_TO_ID
    "simd_alu_4lane": "SIMD ALU",
    "mac_array_4x4": "MAC Array",
    "crossbar_4x4": "Crossbar Switch",
    "pipeline_register": "Pipeline Reg",
    "scratchpad_memory": "Scratchpad Mem",
    "warp_scheduler": "Warp Scheduler",
    "z_buffer_compare": "Z-Buffer Cmp",
    "vector_register_file": "Vec Reg File",
}


# ---------------------------------------------------------------------------
# 33 test cases
# ---------------------------------------------------------------------------

TEST_CASES = [
    # COMBINATIONAL STANDALONES (1-10)
    {"id": 1, "category": "Combinational Standalone", "symbols": ["and"], "prompt": "Design a 2-input AND gate", "expected_verdict": "STANDALONE", "notes": "Basic gate, no clock needed"},
    {"id": 2, "category": "Combinational Standalone", "symbols": ["or"], "prompt": "Design a 2-input OR gate", "expected_verdict": "STANDALONE", "notes": "Basic gate"},
    {"id": 3, "category": "Combinational Standalone", "symbols": ["not"], "prompt": "Design a NOT gate", "expected_verdict": "STANDALONE", "notes": "Inverter"},
    {"id": 4, "category": "Combinational Standalone", "symbols": ["xor"], "prompt": "Design a 2-input XOR gate", "expected_verdict": "STANDALONE", "notes": "XOR gate"},
    {"id": 5, "category": "Combinational Standalone", "symbols": ["mux2"], "prompt": "Design a 2-to-1 multiplexer", "expected_verdict": "STANDALONE", "notes": "MUX, combinational"},
    {"id": 6, "category": "Combinational Standalone", "symbols": ["mux4"], "prompt": "Design a 4-to-1 multiplexer", "expected_verdict": "STANDALONE", "notes": "4:1 MUX"},
    {"id": 7, "category": "Combinational Standalone", "symbols": ["halfadd"], "prompt": "Design a half adder", "expected_verdict": "STANDALONE", "notes": "Half adder"},
    {"id": 8, "category": "Combinational Standalone", "symbols": ["fulladd"], "prompt": "Design a full adder", "expected_verdict": "STANDALONE", "notes": "Full adder"},
    {"id": 9, "category": "Combinational Standalone", "symbols": ["cmp"], "prompt": "Design a 4-bit comparator", "expected_verdict": "STANDALONE", "notes": "Comparator"},
    {"id": 10, "category": "Combinational Standalone", "symbols": ["dec24"], "prompt": "Design a 2-to-4 decoder", "expected_verdict": "STANDALONE", "notes": "Decoder"},

    # SEQUENTIAL WITHOUT CLOCK (11-16)
    {"id": 11, "category": "Sequential No Clock", "symbols": ["dff"], "prompt": "Design a D flip-flop with reset", "expected_verdict": "INCOMPLETE", "notes": "FF without clock gen"},
    {"id": 12, "category": "Sequential No Clock", "symbols": ["jkff"], "prompt": "Design a JK flip-flop", "expected_verdict": "INCOMPLETE", "notes": "JK FF without clock"},
    {"id": 13, "category": "Sequential No Clock", "symbols": ["tff"], "prompt": "Design a T flip-flop", "expected_verdict": "INCOMPLETE", "notes": "T FF without clock"},
    {"id": 14, "category": "Sequential No Clock", "symbols": ["srlatch"], "prompt": "Design an SR latch", "expected_verdict": "INCOMPLETE", "notes": "SR latch"},
    {"id": 15, "category": "Sequential No Clock", "symbols": ["reg"], "prompt": "Design an 8-bit register", "expected_verdict": "INCOMPLETE", "notes": "Register without clock"},
    {"id": 16, "category": "Sequential No Clock", "symbols": ["pc"], "prompt": "Design a 4-bit counter", "expected_verdict": "INCOMPLETE", "notes": "Counter without clock gen"},

    # MEMORY WITHOUT DRIVERS (17-19)
    {"id": 17, "category": "Memory No Drivers", "symbols": ["ram"], "prompt": "Design a 256x8 RAM", "expected_verdict": "INCOMPLETE", "notes": "RAM alone, no addr/clock"},
    {"id": 18, "category": "Memory No Drivers", "symbols": ["rom"], "prompt": "Design a 16x8 ROM", "expected_verdict": "INCOMPLETE", "notes": "ROM alone"},
    {"id": 19, "category": "Memory No Drivers", "symbols": ["regfile"], "prompt": "Design an 8x8 register file", "expected_verdict": "INCOMPLETE", "notes": "Regfile alone"},

    # NEEDS-DRIVING ALONE (20-22)
    {"id": 20, "category": "Needs Driving", "symbols": ["alu"], "prompt": "Design a 4-bit ALU", "expected_verdict": "INCOMPLETE", "notes": "ALU needs operand sources"},
    {"id": 21, "category": "Needs Driving", "symbols": ["shifter"], "prompt": "Design an 8-bit barrel shifter", "expected_verdict": "STANDALONE", "notes": "Shifter is combinational"},
    {"id": 22, "category": "Needs Driving", "symbols": ["tristate"], "prompt": "Design a tri-state buffer", "expected_verdict": "STANDALONE", "notes": "Tristate is combinational"},

    # WORKING COMBINATIONS (23-25)
    {"id": 23, "category": "Working Combo", "symbols": ["and", "or", "not"], "prompt": "Design a circuit with AND, OR, and NOT gates", "expected_verdict": "STANDALONE", "notes": "All combinational"},
    {"id": 24, "category": "Working Combo", "symbols": ["fulladd", "fulladd"], "prompt": "Design a 2-bit ripple carry adder", "expected_verdict": "STANDALONE", "notes": "Two full adders"},
    {"id": 25, "category": "Working Combo", "symbols": ["mux2", "dec24"], "prompt": "Design a circuit with a MUX and a decoder", "expected_verdict": "STANDALONE", "notes": "MUX + decoder, both combinational"},

    # NONSENSICAL TOPOLOGIES (26-27)
    {"id": 26, "category": "Nonsensical", "symbols": ["dec24", "dec24"], "prompt": "Design two cascaded decoders", "expected_verdict": "BROKEN", "notes": "Decoder output is one-hot, not valid decoder input"},
    {"id": 27, "category": "Nonsensical", "symbols": ["prienc", "prienc"], "prompt": "Design two cascaded priority encoders", "expected_verdict": "BROKEN", "notes": "Encoder output too narrow for encoder input"},

    # DISCONNECTED CIRCUITS (28-29)
    {"id": 28, "category": "Disconnected", "symbols": ["and", "jkff"], "prompt": "Design an AND gate and a separate JK flip-flop", "expected_verdict": "INCOMPLETE", "notes": "FF needs clock, disconnected"},
    {"id": 29, "category": "Disconnected", "symbols": ["rom", "cmp"], "prompt": "Design a ROM and a separate comparator", "expected_verdict": "INCOMPLETE", "notes": "Disconnected, ROM needs address"},

    # CPU PARTIALS (30-32)
    {"id": 30, "category": "CPU Partial", "symbols": ["pc"], "prompt": "Design a program counter with reset", "expected_verdict": "INCOMPLETE", "notes": "PC needs clock"},
    {"id": 31, "category": "CPU Partial", "symbols": ["alu", "regfile"], "prompt": "Design an ALU with a register file", "expected_verdict": "INCOMPLETE", "notes": "No clock, no opcode driver"},
    {"id": 32, "category": "CPU Partial", "symbols": ["imem", "dmem"], "prompt": "Design instruction and data memory", "expected_verdict": "INCOMPLETE", "notes": "Memory without drivers"},

    # EDGE CASE (33)
    {"id": 33, "category": "Edge Case", "symbols": ["clkgen"], "prompt": "Design a clock divider that divides by 4", "expected_verdict": "INCOMPLETE", "notes": "Clock divider needs source clock input"},

    # GPU COMPONENTS (34-37)
    {"id": 34, "category": "GPU", "symbols": ["simd_alu_4lane"], "prompt": "Design a 4-lane SIMD ALU", "expected_verdict": "INCOMPLETE", "notes": "SIMD ALU needs operand vectors and opcode driver"},
    {"id": 35, "category": "GPU", "symbols": ["mac_array_4x4"], "prompt": "Design a 4x4 systolic MAC array", "expected_verdict": "INCOMPLETE", "notes": "MAC array is sequential and needs operand matrices + clock"},
    {"id": 36, "category": "GPU", "symbols": ["z_buffer_compare"], "prompt": "Design a Z-buffer depth comparator", "expected_verdict": "STANDALONE", "notes": "Z-buffer compare is a pure combinational depth comparator"},
    {"id": 37, "category": "GPU", "symbols": ["simd_alu_4lane", "vector_register_file", "warp_scheduler", "scratchpad_memory", "clkgen"], "prompt": "Design a minimal GPU shader core", "expected_verdict": "WORKING", "notes": "SIMD ALU driven by vector reg file + scratchpad, scheduled by warp scheduler, clocked"},
]


# ---------------------------------------------------------------------------
# Verdict parsing
# ---------------------------------------------------------------------------

def parse_verdict(response: str) -> str:
    """Extract verdict from chatbot response text.

    Strategy:
    1. Look for explicit verdict patterns: "Final verdict: X", "Verdict: X", "**X**"
    2. Fall back to keyword search in first 300 chars
    3. Priority: STANDALONE > WORKING > INCOMPLETE > BROKEN > RISKY
       (STANDALONE is more specific than WORKING)
    """
    import re

    text = response

    # Step 1: Look for explicit verdict lines
    verdict_patterns = [
        r'[Ff]inal [Vv]erdict:\s*\*{0,2}(WORKING AS STANDALONE MODULE|STANDALONE|WORKING|INCOMPLETE|BROKEN|RISKY)\*{0,2}',
        r'[Vv]erdict:\s*\*{0,2}(WORKING AS STANDALONE MODULE|STANDALONE|WORKING|INCOMPLETE|BROKEN|RISKY)\*{0,2}',
        r'\*\*(WORKING AS STANDALONE MODULE|STANDALONE|WORKING|INCOMPLETE|BROKEN|RISKY)\*\*',
    ]
    for pat in verdict_patterns:
        m = re.search(pat, text, re.I)
        if m:
            v = m.group(1).upper()
            if 'STANDALONE' in v:
                return 'STANDALONE'
            if v == 'WORKING':
                return 'WORKING'
            if v == 'INCOMPLETE':
                return 'INCOMPLETE'
            if v == 'BROKEN':
                return 'BROKEN'
            if v == 'RISKY':
                return 'RISKY'

    # Step 2: Keyword search — check full text but with correct priority
    upper = text.upper()

    # STANDALONE is more specific — check before WORKING
    if 'STANDALONE' in upper or 'WORKING AS STANDALONE' in upper:
        return 'STANDALONE'
    # INCOMPLETE beats WORKING (if both appear, design is incomplete)
    if 'INCOMPLETE' in upper:
        return 'INCOMPLETE'
    if 'BROKEN' in upper or 'ILLOGICAL' in upper:
        # But NOT if it appears only in system prompt fragments or quoted rules
        # Check if BROKEN appears in the model's own words (after any ":" or verdict context)
        # Simple heuristic: if WORKING/STANDALONE also appears, those take priority
        if 'WORKING' not in upper and 'STANDALONE' not in upper:
            return 'BROKEN'
    if 'RISKY' in upper:
        return 'RISKY'
    if 'WORKING' in upper:
        return 'WORKING'

    return 'UNCLEAR'


def build_selected_symbols(symbol_ids: list) -> list:
    """Build selectedSymbols payload from symbol IDs."""
    result = []
    seen = set()
    for sid in symbol_ids:
        # Deduplicate for display but allow repeated symbols in the prompt
        name = SYMBOL_NAMES.get(sid, sid)
        tt = SYMBOL_TRUTH_TABLES.get(sid)
        result.append({
            "name": name,
            "promptText": f"Design a {name.lower()}",
            "truthTable": tt,
        })
    return result


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------

def check_backend():
    try:
        r = requests.get(f"{API_URL}/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


def check_ollama():
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Run a single test
# ---------------------------------------------------------------------------

def run_test(tc: dict) -> dict:
    """Run one test case: generate → chat → parse verdict."""

    result = {
        "id": tc["id"],
        "category": tc["category"],
        "prompt": tc["prompt"],
        "symbols": tc["symbols"],
        "expected_verdict": tc["expected_verdict"],
        "actual_verdict": "ERROR",
        "chat_response": "",
        "design_generated": False,
        "time_seconds": 0,
        "error": None,
    }

    start = time.time()

    # Step 1: Generate design
    try:
        gen_resp = requests.post(f"{API_URL}/generate", json={
            "prompt": tc["prompt"],
        }, timeout=GENERATE_TIMEOUT)

        if gen_resp.status_code != 200:
            result["error"] = f"Generate HTTP {gen_resp.status_code}"
            result["time_seconds"] = round(time.time() - start, 1)
            return result

        gen_data = gen_resp.json()
        design = gen_data.get("design", "")
        testbench = gen_data.get("testbench", "")
        result["design_generated"] = bool(design and "module" in design)

    except requests.Timeout:
        result["error"] = "Generate timed out"
        result["time_seconds"] = round(time.time() - start, 1)
        return result
    except Exception as e:
        result["error"] = f"Generate error: {str(e)[:100]}"
        result["time_seconds"] = round(time.time() - start, 1)
        return result

    # Step 2: Chat with validation question
    try:
        selected = build_selected_symbols(tc["symbols"])

        chat_resp = requests.post(f"{API_URL}/chat", json={
            "message": "Does this work? Give your verdict: WORKING, WORKING AS STANDALONE MODULE, INCOMPLETE, BROKEN, or RISKY. Explain why.",
            "design": design,
            "testbench": testbench,
            "history": [],
            "selectedSymbols": selected,
        }, timeout=CHAT_TIMEOUT)

        if chat_resp.status_code != 200:
            result["error"] = f"Chat HTTP {chat_resp.status_code}"
            result["time_seconds"] = round(time.time() - start, 1)
            return result

        chat_data = chat_resp.json()
        response_text = chat_data.get("response", "")
        result["chat_response"] = response_text
        result["actual_verdict"] = parse_verdict(response_text)

    except requests.Timeout:
        result["error"] = "Chat timed out"
        result["time_seconds"] = round(time.time() - start, 1)
        return result
    except Exception as e:
        result["error"] = f"Chat error: {str(e)[:100]}"
        result["time_seconds"] = round(time.time() - start, 1)
        return result

    result["time_seconds"] = round(time.time() - start, 1)
    return result


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def print_summary(results: list):
    total = len(results)
    passed = sum(1 for r in results if r["actual_verdict"] == r["expected_verdict"])
    failed = sum(1 for r in results if r["actual_verdict"] != r["expected_verdict"] and r["actual_verdict"] != "ERROR")
    errors = sum(1 for r in results if r["actual_verdict"] == "ERROR")
    unclear = sum(1 for r in results if r["actual_verdict"] == "UNCLEAR")

    pct = (passed / total * 100) if total else 0
    color = GREEN if pct >= 70 else YELLOW if pct >= 50 else RED

    print(f"\n{'=' * 70}")
    print(f"  {BOLD}{GREEN}VOLTA VALIDATION RESULTS{RESET}")
    print(f"{'=' * 70}")
    print(f"\n  {BOLD}Overall:{RESET}")
    print(f"    Passed:  {color}{passed}/{total} = {pct:.0f}%{RESET}")
    print(f"    Failed:  {RED}{failed}{RESET}")
    print(f"    Errors:  {RED}{errors}{RESET}")
    print(f"    Unclear: {YELLOW}{unclear}{RESET}")

    # By category
    categories = {}
    for r in results:
        cat = r["category"]
        if cat not in categories:
            categories[cat] = {"total": 0, "passed": 0}
        categories[cat]["total"] += 1
        if r["actual_verdict"] == r["expected_verdict"]:
            categories[cat]["passed"] += 1

    print(f"\n  {BOLD}By Category:{RESET}")
    for cat in sorted(categories.keys()):
        info = categories[cat]
        cpct = (info["passed"] / info["total"] * 100) if info["total"] else 0
        ccolor = GREEN if cpct >= 70 else YELLOW if cpct >= 50 else RED
        print(f"    {cat:25s} {ccolor}{info['passed']:2d}/{info['total']:2d} = {cpct:3.0f}%{RESET}")

    # Failed tests
    failures = [r for r in results if r["actual_verdict"] != r["expected_verdict"]]
    if failures:
        print(f"\n  {BOLD}{RED}Failed Tests:{RESET}")
        for r in failures:
            print(f"    {RED}#{r['id']:2d}{RESET} {r['prompt'][:50]}")
            print(f"        Expected: {CYAN}{r['expected_verdict']}{RESET}  Got: {RED}{r['actual_verdict']}{RESET}")
            if r.get("error"):
                print(f"        Error: {DIM}{r['error']}{RESET}")
            elif r.get("chat_response"):
                print(f"        Response: {DIM}{r['chat_response'][:150]}...{RESET}")

    avg_time = sum(r["time_seconds"] for r in results) / max(total, 1)
    print(f"\n  Avg time per test: {avg_time:.1f}s")
    print(f"{'=' * 70}\n")


def save_results(results: list):
    total = len(results)
    passed = sum(1 for r in results if r["actual_verdict"] == r["expected_verdict"])

    entry = {
        "timestamp": datetime.now().isoformat(),
        "total": total,
        "passed": passed,
        "pass_rate": round(passed / total * 100, 1) if total else 0,
        "tests": results,
    }

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
        json.dump(data, f, indent=2, default=str)

    print(f"  Results saved to: {RESULTS_FILE}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"\n{'=' * 70}")
    print(f"  {BOLD}{GREEN}VOLTA — Validation Suite{RESET}")
    print(f"  {DIM}{len(TEST_CASES)} circuit combination tests{RESET}")
    print(f"{'=' * 70}\n")

    # Health checks
    print(f"  Checking backend... ", end="", flush=True)
    if not check_backend():
        print(f"{RED}NOT RUNNING{RESET}")
        print(f"\n  {RED}Error: Backend not reachable at {API_URL}{RESET}")
        print(f"  Start it with: {CYAN}cd backend && uvicorn main:app --port 8000{RESET}")
        sys.exit(1)
    print(f"{GREEN}OK{RESET}")

    print(f"  Checking Ollama... ", end="", flush=True)
    if not check_ollama():
        print(f"{RED}NOT RUNNING{RESET}")
        print(f"\n  {RED}Error: Ollama not reachable at localhost:11434{RESET}")
        print(f"  Start it with: {CYAN}ollama serve{RESET}")
        sys.exit(1)
    print(f"{GREEN}OK{RESET}")

    total = len(TEST_CASES)
    print(f"\n  Running {total} validation tests...\n")

    start_all = time.time()
    results = []

    for tc in TEST_CASES:
        label = tc["prompt"][:48]
        cat = tc["category"][:20]
        print(f"  [{tc['id']:2d}/{total}] {DIM}{cat:20s}{RESET} {label}...", end="", flush=True)

        result = run_test(tc)
        results.append(result)

        match = result["actual_verdict"] == result["expected_verdict"]
        if match:
            tag = f"{GREEN}PASS{RESET}"
        elif result["actual_verdict"] == "ERROR":
            tag = f"{RED}ERR {RESET}"
        elif result["actual_verdict"] == "UNCLEAR":
            tag = f"{YELLOW}UNCLEAR{RESET}"
        else:
            tag = f"{RED}FAIL{RESET}"

        verdict = result["actual_verdict"]
        print(f" {tag} {DIM}({verdict}, {result['time_seconds']}s){RESET}")

    total_time = time.time() - start_all

    print_summary(results)
    print(f"  Total time: {total_time:.0f}s ({total_time / 60:.1f} min)\n")
    save_results(results)


if __name__ == "__main__":
    main()
