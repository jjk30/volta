"""
Volta — Spec Interpreter
Takes a natural-language prompt and converts it into a structured DesignSpec
by calling Ollama. The LLM is much better at generating structured JSON from
a description than generating correct Verilog directly.
"""

import json
import os
import re
import sys
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schema import (
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
            "options": {"temperature": 0.2, "num_predict": 8192},
        }, timeout=120)
        resp.raise_for_status()
        return resp.json()["response"]
    except requests.ConnectionError:
        raise RuntimeError(
            "Ollama not reachable at localhost:11434. "
            "Start it with: ollama serve"
        )


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------

def extract_json(raw: str) -> dict:
    """Pull a JSON object out of whatever the LLM returns."""

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
                    continue

    # Try to find a raw JSON object
    start = text.find("{")
    if start != -1:
        # Find the matching closing brace
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
                        break

        # If we didn't find a balanced close, the JSON may be truncated.
        # Try to repair by closing open structures.
        if last_close > start:
            fragment = text[start:last_close+1]
            # Try progressively closing brackets/braces
            for suffix in ["", "]}", "]}]}", "\"]}]}"]  :
                try:
                    return json.loads(fragment + suffix)
                except json.JSONDecodeError:
                    continue

    raise ValueError(f"Could not extract JSON from LLM response:\n{text[:500]}")


# ---------------------------------------------------------------------------
# Spec interpretation prompt
# ---------------------------------------------------------------------------

INTERPRET_PROMPT = '''You are a hardware design architect. Given a natural-language
description of a digital circuit, produce a JSON specification.

The JSON must follow this EXACT structure:
{{
  "name": "<module_name_snake_case>",
  "description": "<one-line description>",
  "category": "<combinational|sequential|memory|arithmetic|control|custom>",
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

Rules:
1. Use Verilog literals for test values (e.g., 4'd5, 8'hFF, 1'b1).
2. Sequential designs MUST have clk (is_clock: true) and rst (is_reset: true) ports.
3. Output ports driven by always blocks must have signal_type "reg".
4. Include at least 4 test vectors covering normal cases, edge cases, and reset behavior.
5. Operation opcodes must be Verilog literals matching the select port width.
6. Return ONLY valid JSON. No explanation, no markdown, no text outside the JSON object.

Design request: {prompt}'''


# ---------------------------------------------------------------------------
# Build DesignSpec from LLM JSON
# ---------------------------------------------------------------------------

def _normalize_direction(d: str) -> PortDirection:
    """Normalize a direction string to a PortDirection enum."""
    d = d.lower().strip()
    if d in ("in", "input"):
        return PortDirection.INPUT
    if d in ("out", "output"):
        return PortDirection.OUTPUT
    if d in ("inout",):
        return PortDirection.INOUT
    return PortDirection.INPUT


def _normalize_category(c: str) -> ModuleCategory:
    """Normalize a category string to a ModuleCategory enum."""
    c = c.lower().strip()
    for member in ModuleCategory:
        if member.value == c:
            return member
    return ModuleCategory.CUSTOM


def _normalize_complexity(c: str) -> DesignComplexity:
    """Normalize a complexity string to a DesignComplexity enum."""
    c = c.lower().strip()
    for member in DesignComplexity:
        if member.value == c:
            return member
    return DesignComplexity.SIMPLE


def _normalize_signal_type(s: str) -> SignalType:
    """Normalize a signal_type string."""
    s = s.lower().strip()
    if s == "reg":
        return SignalType.REG
    return SignalType.WIRE


def _sanitize_identifier(name: str) -> str:
    """Ensure a name is a valid Verilog identifier (no leading digits, only [a-zA-Z0-9_])."""
    # Replace non-alphanumeric/underscore chars with underscore
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    # Prepend underscore if starts with digit
    if name and name[0].isdigit():
        name = f"_{name}"
    if not name:
        name = "design"
    return name


def build_spec(raw_json: dict, original_prompt: str) -> DesignSpec:
    """Convert raw LLM JSON into a validated DesignSpec."""

    name = _sanitize_identifier(raw_json.get("name", "design"))
    description = raw_json.get("description", original_prompt)
    category = _normalize_category(raw_json.get("category", "custom"))
    complexity = _normalize_complexity(raw_json.get("complexity", "simple"))

    # Build ports
    ports = []
    for p in raw_json.get("ports", []):
        ports.append(Port(
            name=_sanitize_identifier(p["name"]),
            direction=_normalize_direction(p.get("direction", "input")),
            width=int(p.get("width", 1)),
            signal_type=_normalize_signal_type(p.get("signal_type", "wire")),
            description=p.get("description", ""),
            is_clock=bool(p.get("is_clock", False)),
            is_reset=bool(p.get("is_reset", False)),
        ))

    # Build operations
    operations = []
    for op in raw_json.get("operations", []):
        operations.append(Operation(
            name=op.get("name", ""),
            opcode=op.get("opcode"),
            behavior=op.get("behavior"),
            description=op.get("description", ""),
        ))

    # Build test vectors
    test_vectors = []
    for tv in raw_json.get("test_vectors", []):
        inputs = tv.get("inputs", {})
        expected = tv.get("expected_outputs", {})
        # Ensure all values are strings
        inputs = {k: str(v) for k, v in inputs.items()}
        expected = {k: str(v) for k, v in expected.items()}
        test_vectors.append(TestVector(
            name=tv.get("name", f"test_{len(test_vectors)}"),
            inputs=inputs,
            expected_outputs=expected,
            description=tv.get("description", ""),
        ))

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
# Main entry point
# ---------------------------------------------------------------------------

def interpret(prompt: str, model: str = "codellama:7b") -> DesignSpec:
    """Interpret a natural-language prompt into a structured DesignSpec.

    This is the key step: prompt → structured spec. The LLM is much better at
    producing structured JSON from a description than generating correct Verilog
    directly from a vague prompt.
    """

    print(f"\n--- Spec Interpreter ---")
    print(f"  Prompt: {prompt}")
    print(f"  Model: {model}")

    filled_prompt = INTERPRET_PROMPT.format(prompt=prompt)
    raw = call_ollama(filled_prompt, model=model)

    print(f"  Raw response: {len(raw)} chars")

    raw_json = extract_json(raw)
    print(f"  Extracted JSON with {len(raw_json)} keys")

    spec = build_spec(raw_json, prompt)

    # Validate via Pydantic (will raise if invalid)
    _ = spec.model_dump()

    module = spec.modules[0]
    print(f"  Module: {module.name}")
    print(f"  Ports: {len(module.ports)}")
    print(f"  Operations: {len(module.operations)}")
    print(f"  Test vectors: {len(module.test_vectors)}")
    print(f"  Category: {module.category.value}")

    return spec


# ---------------------------------------------------------------------------
# main — demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("  VOLTA — Spec Interpreter")
    print("=" * 60)

    prompts = [
        "Design a 4-bit counter with reset and enable",
        "Design an 8-bit shift register",
        "Design a 2-to-1 multiplexer",
    ]

    for prompt in prompts:
        print(f"\n{'=' * 60}")
        try:
            spec = interpret(prompt)
            print(f"\n  Result:")
            print(json.dumps(spec.model_dump(), indent=2, default=str)[:1000])
            print(f"  ... (truncated)")
            print(f"\n  ✓ Pydantic validation passed")
        except Exception as e:
            print(f"\n  ✗ Failed: {e}")
