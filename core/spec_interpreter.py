"""
Volta — Spec Interpreter
Takes a natural-language prompt and converts it into a structured DesignSpec
by calling Ollama. The LLM is much better at generating structured JSON from
a description than generating correct Verilog directly.

Handles ANY hardware design: combinational logic, sequential logic, FSMs,
arithmetic circuits, memory, buses, controllers, processors, interfaces.
Includes few-shot examples and retry logic for robustness.
"""

import json
import os
import re
import sys

from core.schema import (
    DesignSpec,
    DesignComplexity,
    ModuleCategory,
    ModuleSpec,
    Operation,
    Port,
    PortDirection,
    SignalType,
    TestVector,
)
from core.llm_client import call_ollama


# ---------------------------------------------------------------------------
# JSON extraction — robust, handles truncation and malformed output
# ---------------------------------------------------------------------------

def extract_json(raw: str) -> dict:
    """Pull a JSON object out of whatever the LLM returns.

    Handles: markdown fences, raw JSON, truncated JSON, trailing text.
    """

    text = raw.strip()

    # Try markdown fences first
    if "```" in text:
        parts = text.split("```")
        for part in parts[1::2]:
            lines = part.strip().split("\n")
            if lines and lines[0].strip().lower() in ("json", ""):
                part = "\n".join(lines[1:])
            part = part.strip()
            if part.startswith("{"):
                try:
                    return json.loads(part)
                except json.JSONDecodeError:
                    # Try repair below
                    text = part
                    break

    # Find the first { and try to extract balanced JSON
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in LLM response")

    # Try progressively longer substrings ending at each }
    depth = 0
    last_close = -1
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            last_close = i
            if depth == 0:
                try:
                    return json.loads(text[start:i+1])
                except json.JSONDecodeError:
                    # Keep looking for a better closing point
                    continue

    # JSON is likely truncated — try to repair
    # Strategy: find the last complete array/object and close everything
    if start >= 0:
        fragment = text[start:]

        # Try to truncate to the last complete value (after a comma or closing bracket)
        # and close all open structures
        truncation_points = []
        for i in range(len(fragment) - 1, 0, -1):
            if fragment[i] in ("},", "],", '"'):
                truncation_points.append(i + 1)
            if len(truncation_points) > 20:
                break

        for tp in truncation_points:
            chunk = fragment[:tp]
            # Count unclosed structures
            open_braces = chunk.count("{") - chunk.count("}")
            open_brackets = chunk.count("[") - chunk.count("]")
            # Check if we're in an unclosed string
            in_string = chunk.count('"') % 2 == 1

            suffix = ""
            if in_string:
                suffix += '"'
            suffix += "]" * max(0, open_brackets)
            suffix += "}" * max(0, open_braces)

            try:
                return json.loads(chunk + suffix)
            except json.JSONDecodeError:
                continue

        # Simpler approach: just close everything from the end of the text
        for end_pos in range(len(fragment), max(start, len(fragment) - 200), -1):
            chunk = fragment[:end_pos]
            open_braces = chunk.count("{") - chunk.count("}")
            open_brackets = chunk.count("[") - chunk.count("]")
            in_string = chunk.count('"') % 2 == 1

            suffix = ""
            if in_string:
                suffix += '"'
            suffix += "]" * max(0, open_brackets)
            suffix += "}" * max(0, open_braces)

            try:
                return json.loads(chunk + suffix)
            except json.JSONDecodeError:
                continue

    raise ValueError(f"Could not extract JSON from LLM response:\n{text[:500]}")


# ---------------------------------------------------------------------------
# Spec interpretation prompt — general-purpose with few-shot examples
# ---------------------------------------------------------------------------

INTERPRET_PROMPT = '''You are an expert digital hardware architect. Given a natural-language
description of ANY digital circuit, produce a JSON specification.

You understand all VLSI and semiconductor concepts: combinational logic,
sequential logic, FSMs, arithmetic circuits (ALUs, adders, multipliers),
memory (SRAM, FIFOs, register files), buses, controllers, processors,
interfaces (SPI, I2C, UART), encoders, decoders, multiplexers, counters,
shift registers, timers, PWM generators, and any custom digital logic.

The JSON must follow this structure:
{{
  "name": "<module_name_snake_case>",
  "description": "<one-line description>",
  "category": "<combinational|sequential|memory|arithmetic|control|interface|custom>",
  "complexity": "<trivial|simple|moderate|complex>",
  "ports": [
    {{
      "name": "<port_name>",
      "direction": "<input|output>",
      "width": <integer>,
      "signal_type": "<wire|reg>",
      "description": "<what this port does>",
      "is_clock": <true|false>,
      "is_reset": <true|false>
    }}
  ],
  "operations": [
    {{
      "name": "<OP_NAME>",
      "opcode": "<verilog_literal_or_null>",
      "behavior": "<verilog_expression>",
      "description": "<what this op does>"
    }}
  ],
  "test_vectors": [
    {{
      "name": "<test_name_snake_case>",
      "inputs": {{"<port>": "<verilog_literal>"}},
      "expected_outputs": {{"<port>": "<verilog_literal>"}},
      "description": "<what this test checks>"
    }}
  ]
}}

Here are examples for different design types:

EXAMPLE 1 — Combinational (4-bit comparator):
{{
  "name": "comparator_4bit",
  "description": "4-bit magnitude comparator",
  "category": "combinational",
  "complexity": "trivial",
  "ports": [
    {{"name": "a", "direction": "input", "width": 4, "signal_type": "wire", "description": "First operand", "is_clock": false, "is_reset": false}},
    {{"name": "b", "direction": "input", "width": 4, "signal_type": "wire", "description": "Second operand", "is_clock": false, "is_reset": false}},
    {{"name": "gt", "direction": "output", "width": 1, "signal_type": "reg", "description": "High when a > b", "is_clock": false, "is_reset": false}},
    {{"name": "eq", "direction": "output", "width": 1, "signal_type": "reg", "description": "High when a == b", "is_clock": false, "is_reset": false}},
    {{"name": "lt", "direction": "output", "width": 1, "signal_type": "reg", "description": "High when a < b", "is_clock": false, "is_reset": false}}
  ],
  "operations": [
    {{"name": "COMPARE", "opcode": null, "behavior": "gt = (a > b); eq = (a == b); lt = (a < b)", "description": "Magnitude comparison"}}
  ],
  "test_vectors": [
    {{"name": "equal", "inputs": {{"a": "4'd5", "b": "4'd5"}}, "expected_outputs": {{"gt": "1'b0", "eq": "1'b1", "lt": "1'b0"}}, "description": "Equal values"}},
    {{"name": "greater", "inputs": {{"a": "4'd9", "b": "4'd3"}}, "expected_outputs": {{"gt": "1'b1", "eq": "1'b0", "lt": "1'b0"}}, "description": "a > b"}},
    {{"name": "less", "inputs": {{"a": "4'd2", "b": "4'd7"}}, "expected_outputs": {{"gt": "1'b0", "eq": "1'b0", "lt": "1'b1"}}, "description": "a < b"}},
    {{"name": "zero", "inputs": {{"a": "4'd0", "b": "4'd0"}}, "expected_outputs": {{"gt": "1'b0", "eq": "1'b1", "lt": "1'b0"}}, "description": "Both zero"}}
  ]
}}

EXAMPLE 2 — Sequential (8-bit counter with enable):
{{
  "name": "counter_8bit",
  "description": "8-bit synchronous counter with enable and reset",
  "category": "sequential",
  "complexity": "simple",
  "ports": [
    {{"name": "clk", "direction": "input", "width": 1, "signal_type": "wire", "description": "Clock", "is_clock": true, "is_reset": false}},
    {{"name": "rst", "direction": "input", "width": 1, "signal_type": "wire", "description": "Synchronous reset", "is_clock": false, "is_reset": true}},
    {{"name": "en", "direction": "input", "width": 1, "signal_type": "wire", "description": "Count enable", "is_clock": false, "is_reset": false}},
    {{"name": "count", "direction": "output", "width": 8, "signal_type": "reg", "description": "Current count value", "is_clock": false, "is_reset": false}}
  ],
  "operations": [
    {{"name": "COUNT", "opcode": null, "behavior": "if (rst) count <= 0; else if (en) count <= count + 1;", "description": "Increment on enable"}}
  ],
  "test_vectors": [
    {{"name": "reset", "inputs": {{"rst": "1'b1", "en": "1'b0"}}, "expected_outputs": {{"count": "8'd0"}}, "description": "Reset clears count"}},
    {{"name": "count_up", "inputs": {{"rst": "1'b0", "en": "1'b1"}}, "expected_outputs": {{"count": "8'd1"}}, "description": "Count increments"}},
    {{"name": "hold", "inputs": {{"rst": "1'b0", "en": "1'b0"}}, "expected_outputs": {{"count": "8'd1"}}, "description": "Holds when disabled"}},
    {{"name": "continue", "inputs": {{"rst": "1'b0", "en": "1'b1"}}, "expected_outputs": {{"count": "8'd2"}}, "description": "Continues counting"}}
  ]
}}

EXAMPLE 3 — FSM (traffic light controller):
{{
  "name": "traffic_light",
  "description": "Simple traffic light FSM with green/yellow/red states",
  "category": "control",
  "complexity": "moderate",
  "ports": [
    {{"name": "clk", "direction": "input", "width": 1, "signal_type": "wire", "description": "Clock", "is_clock": true, "is_reset": false}},
    {{"name": "rst", "direction": "input", "width": 1, "signal_type": "wire", "description": "Reset", "is_clock": false, "is_reset": true}},
    {{"name": "sensor", "direction": "input", "width": 1, "signal_type": "wire", "description": "Car sensor", "is_clock": false, "is_reset": false}},
    {{"name": "light", "direction": "output", "width": 2, "signal_type": "reg", "description": "00=red, 01=green, 10=yellow", "is_clock": false, "is_reset": false}}
  ],
  "operations": [
    {{"name": "RED", "opcode": "2'b00", "behavior": "if (sensor) next_state = GREEN", "description": "Red light state"}},
    {{"name": "GREEN", "opcode": "2'b01", "behavior": "next_state = YELLOW after timeout", "description": "Green light state"}},
    {{"name": "YELLOW", "opcode": "2'b10", "behavior": "next_state = RED", "description": "Yellow light state"}}
  ],
  "test_vectors": [
    {{"name": "reset_state", "inputs": {{"rst": "1'b1", "sensor": "1'b0"}}, "expected_outputs": {{"light": "2'b00"}}, "description": "Reset to red"}},
    {{"name": "sensor_trigger", "inputs": {{"rst": "1'b0", "sensor": "1'b1"}}, "expected_outputs": {{"light": "2'b01"}}, "description": "Sensor triggers green"}},
    {{"name": "no_sensor", "inputs": {{"rst": "1'b0", "sensor": "1'b0"}}, "expected_outputs": {{"light": "2'b00"}}, "description": "No sensor stays red"}},
    {{"name": "full_cycle", "inputs": {{"rst": "1'b0", "sensor": "1'b1"}}, "expected_outputs": {{"light": "2'b01"}}, "description": "Full cycle test"}}
  ]
}}

Rules:
1. Use Verilog literals for ALL test values (e.g., 4'd5, 8'hFF, 1'b1).
2. Sequential designs MUST have clk (is_clock: true) and rst (is_reset: true) ports.
3. Output ports driven by always blocks MUST have signal_type "reg".
4. Include at least 4 test vectors covering normal, edge, and reset cases.
5. Use only ports that exist in the ports list for test vector keys.
6. Return ONLY valid JSON. No explanation, no markdown, no text outside the JSON.
7. Module name must be a valid Verilog identifier (letters, digits, underscores, no leading digit).

Design request: {prompt}'''


# Simplified retry prompt — less structure, more direct
SIMPLE_PROMPT = '''Return a JSON object describing this digital circuit: {prompt}

Required keys: "name" (string), "description" (string), "category" (string),
"ports" (array of objects with name/direction/width/signal_type/is_clock/is_reset),
"operations" (array), "test_vectors" (array with name/inputs/expected_outputs).

Output ports in always blocks need signal_type "reg". Sequential designs need
clk and rst ports. Use Verilog literals in test values (4'd5, 1'b1, 8'hFF).

Return ONLY valid JSON. No explanation.'''


# Minimal fallback — just get the basics
MINIMAL_PROMPT = '''Generate a JSON object for a Verilog module called "{name}".
It should have these keys: name, description, category, ports, operations, test_vectors.
The ports array needs objects with: name, direction (input/output), width (integer),
signal_type (wire or reg), is_clock (boolean), is_reset (boolean).
The test_vectors array needs objects with: name, inputs (dict), expected_outputs (dict).

The design is: {prompt}

Return ONLY the JSON object.'''


# ---------------------------------------------------------------------------
# Build DesignSpec from LLM JSON
# ---------------------------------------------------------------------------

def _normalize_direction(d: str) -> PortDirection:
    d = d.lower().strip()
    if d in ("in", "input"):
        return PortDirection.INPUT
    if d in ("out", "output"):
        return PortDirection.OUTPUT
    if d in ("inout",):
        return PortDirection.INOUT
    return PortDirection.INPUT


def _normalize_category(c: str) -> ModuleCategory:
    c = c.lower().strip()
    for member in ModuleCategory:
        if member.value == c:
            return member
    # Fuzzy matching
    if "comb" in c:
        return ModuleCategory.COMBINATIONAL
    if "seq" in c:
        return ModuleCategory.SEQUENTIAL
    if "mem" in c or "ram" in c or "fifo" in c:
        return ModuleCategory.MEMORY
    if "arith" in c or "alu" in c or "add" in c or "mult" in c:
        return ModuleCategory.ARITHMETIC
    if "fsm" in c or "ctrl" in c or "state" in c:
        return ModuleCategory.CONTROL
    if "spi" in c or "i2c" in c or "uart" in c or "bus" in c:
        return ModuleCategory.INTERFACE
    return ModuleCategory.CUSTOM


def _normalize_complexity(c: str) -> DesignComplexity:
    c = c.lower().strip()
    for member in DesignComplexity:
        if member.value == c:
            return member
    return DesignComplexity.SIMPLE


def _normalize_signal_type(s: str) -> SignalType:
    s = s.lower().strip()
    if s == "reg":
        return SignalType.REG
    return SignalType.WIRE


def _sanitize_identifier(name: str) -> str:
    """Ensure a name is a valid Verilog identifier."""
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    # Collapse multiple underscores
    name = re.sub(r"_+", "_", name).strip("_")
    if name and name[0].isdigit():
        name = f"m{name}"
    if not name:
        name = "design"
    # Truncate overly long names
    if len(name) > 40:
        name = name[:40].rstrip("_")
    return name


def _guess_module_name(prompt: str) -> str:
    """Derive a reasonable module name from a prompt."""
    # Remove common prefixes
    text = prompt.lower()
    for prefix in ("design a ", "design an ", "create a ", "create an ",
                    "build a ", "build an ", "make a ", "make an ",
                    "implement a ", "implement an "):
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    return _sanitize_identifier(text.split(".")[0].split(",")[0][:40])


def build_spec(raw_json: dict, original_prompt: str) -> DesignSpec:
    """Convert raw LLM JSON into a validated DesignSpec.

    Tolerant of missing/malformed fields — fills in reasonable defaults.
    """

    name = _sanitize_identifier(raw_json.get("name", _guess_module_name(original_prompt)))
    description = raw_json.get("description", original_prompt)
    category = _normalize_category(raw_json.get("category", "custom"))
    complexity = _normalize_complexity(raw_json.get("complexity", "simple"))

    # Build ports — tolerant of various formats
    ports = []
    for p in raw_json.get("ports", []):
        if isinstance(p, str):
            continue  # skip malformed entries
        try:
            port_name = _sanitize_identifier(p.get("name", f"port_{len(ports)}"))
            width = max(1, int(p.get("width", 1)))
            ports.append(Port(
                name=port_name,
                direction=_normalize_direction(p.get("direction", "input")),
                width=width,
                signal_type=_normalize_signal_type(p.get("signal_type", "wire")),
                description=str(p.get("description", "")),
                is_clock=bool(p.get("is_clock", False)),
                is_reset=bool(p.get("is_reset", False)),
            ))
        except (ValueError, TypeError):
            continue

    # Build operations
    operations = []
    for op in raw_json.get("operations", []):
        if isinstance(op, str):
            operations.append(Operation(name=op, description=op))
            continue
        try:
            operations.append(Operation(
                name=str(op.get("name", f"op_{len(operations)}")),
                opcode=op.get("opcode"),
                behavior=op.get("behavior"),
                description=str(op.get("description", "")),
            ))
        except (ValueError, TypeError):
            continue

    # Build test vectors — filter to only reference actual port names
    port_names = {p.name for p in ports}
    input_names = {p.name for p in ports if p.direction == PortDirection.INPUT}
    output_names = {p.name for p in ports if p.direction == PortDirection.OUTPUT}

    test_vectors = []
    for tv in raw_json.get("test_vectors", []):
        if isinstance(tv, str):
            continue
        try:
            inputs = tv.get("inputs", {})
            expected = tv.get("expected_outputs", tv.get("expected", {}))
            if not isinstance(inputs, dict) or not isinstance(expected, dict):
                continue
            # Filter to valid port names and stringify values
            inputs = {k: str(v) for k, v in inputs.items() if k in input_names}
            expected = {k: str(v) for k, v in expected.items() if k in output_names}
            if not inputs:
                continue
            tv_name = re.sub(r"[^a-zA-Z0-9_]", "_", str(tv.get("name", f"test_{len(test_vectors)}")))
            test_vectors.append(TestVector(
                name=tv_name,
                inputs=inputs,
                expected_outputs=expected,
                description=str(tv.get("description", "")),
            ))
        except (ValueError, TypeError):
            continue

    # Ensure we have at least minimal ports if none were extracted
    if not ports:
        ports = [
            Port(name="in_data", direction=PortDirection.INPUT, width=8, description="Input data"),
            Port(name="out_data", direction=PortDirection.OUTPUT, width=8,
                 signal_type=SignalType.REG, description="Output data"),
        ]

    module = ModuleSpec(
        name=name,
        category=category,
        description=description,
        ports=ports,
        operations=operations,
        test_vectors=test_vectors,
    )

    return DesignSpec(
        name=name,
        description=description,
        original_prompt=original_prompt,
        top_module=name,
        modules=[module],
        complexity=complexity,
    )


# ---------------------------------------------------------------------------
# Main entry point — with retry logic
# ---------------------------------------------------------------------------

MAX_INTERPRET_RETRIES = 3


def interpret(prompt: str, model: str = "qwen2.5-coder:7b") -> DesignSpec:
    """Interpret a natural-language prompt into a structured DesignSpec.

    Retries up to 3 times with progressively simpler prompts:
      1. Full few-shot prompt with examples
      2. Simplified prompt (less context, faster)
      3. Minimal prompt (just the basics)
    """

    print(f"\n--- Spec Interpreter ---")
    print(f"  Prompt: {prompt}")

    guessed_name = _guess_module_name(prompt)

    prompts = [
        ("full", INTERPRET_PROMPT.format(prompt=prompt)),
        ("simple", SIMPLE_PROMPT.format(prompt=prompt)),
        ("minimal", MINIMAL_PROMPT.format(prompt=prompt, name=guessed_name)),
    ]

    last_error = None

    for attempt, (level, filled_prompt) in enumerate(prompts, 1):
        print(f"  Attempt {attempt}/{MAX_INTERPRET_RETRIES} ({level} prompt)...")

        try:
            # Use higher temperature on retries for variety
            temp = 0.2 if attempt == 1 else 0.3 + (attempt * 0.1)
            raw = call_ollama(filled_prompt, model=model, temperature=temp, num_predict=8192)
            print(f"  Raw response: {len(raw)} chars")

            raw_json = extract_json(raw)
            print(f"  Extracted JSON with {len(raw_json)} keys")

            spec = build_spec(raw_json, prompt)
            # Validate via Pydantic
            _ = spec.model_dump()

            module = spec.modules[0]
            print(f"  Module: {module.name}")
            print(f"  Ports: {len(module.ports)}")
            print(f"  Operations: {len(module.operations)}")
            print(f"  Test vectors: {len(module.test_vectors)}")
            print(f"  Category: {module.category.value}")

            return spec

        except Exception as e:
            last_error = e
            print(f"  Failed ({level}): {e}")
            continue

    # All retries exhausted — raise so the orchestrator can fall back
    raise RuntimeError(
        f"Spec interpretation failed after {MAX_INTERPRET_RETRIES} attempts: {last_error}"
    )


# ---------------------------------------------------------------------------
# main — demo with diverse prompts
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  VOLTA — Spec Interpreter")
    print("=" * 60)

    prompts = [
        "Design a 4-bit counter with reset and enable",
        "Design an 8-bit shift register",
        "Design a 2-to-1 multiplexer",
        "Design a UART transmitter",
        "Design a simple RISC-V ALU with add, sub, and, or, xor, sll, srl, sra",
    ]

    for prompt in prompts:
        print(f"\n{'=' * 60}")
        try:
            spec = interpret(prompt)
            print(f"\n  ✓ Pydantic validation passed")
        except Exception as e:
            print(f"\n  ✗ Failed: {e}")
