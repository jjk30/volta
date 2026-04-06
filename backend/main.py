"""
Volta — Backend API
FastAPI server with POST /simulate and POST /generate endpoints.
/simulate — compile + simulate Verilog with Icarus Verilog, return VCD as JSON.
/generate — take a natural-language prompt, run the full orchestrator pipeline:
             prompt → spec → Verilog → correction → testbench → verify.
"""

import json
import logging
import os
import re
import subprocess
import sys
import tempfile
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Make core/ importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from orchestrator import generate as orchestrator_generate

logger = logging.getLogger("volta.backend")


app = FastAPI(title="Volta", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SimulateRequest(BaseModel):
    design: str
    testbench: str


class VCDSignal(BaseModel):
    name: str
    width: int
    values: list[list]  # [[time, value], ...]


class SimulateResponse(BaseModel):
    success: bool
    signals: list[VCDSignal]
    timescale: str
    end_time: int
    stdout: str
    stderr: str


# ---------------------------------------------------------------------------
# VCD parser
# ---------------------------------------------------------------------------

def parse_vcd(vcd_text: str) -> dict:
    """Parse a VCD file into structured signal data.

    Returns:
        {
            "timescale": str,
            "end_time": int,
            "signals": [{"name": ..., "width": ..., "values": [[t, v], ...]}]
        }
    """

    lines = vcd_text.split("\n")
    timescale = "1ns"
    signals = {}       # id_code -> {"name": ..., "width": ..., "scope": ...}
    changes = {}       # id_code -> [[time, value], ...]
    current_time = 0
    scope_stack = []

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if line.startswith("$timescale"):
            # May be on same line or next line
            ts_text = line.replace("$timescale", "").replace("$end", "").strip()
            if not ts_text:
                i += 1
                ts_text = lines[i].strip().replace("$end", "").strip()
            timescale = ts_text
            i += 1
            continue

        if line.startswith("$scope"):
            parts = line.split()
            if len(parts) >= 3:
                scope_stack.append(parts[2])
            i += 1
            continue

        if line.startswith("$upscope"):
            if scope_stack:
                scope_stack.pop()
            i += 1
            continue

        if line.startswith("$var"):
            parts = line.split()
            # $var wire 4 ! result $end
            if len(parts) >= 5:
                var_type = parts[1]
                width = int(parts[2])
                id_code = parts[3]
                name = parts[4]
                scope = ".".join(scope_stack)
                signals[id_code] = {
                    "name": name,
                    "width": width,
                    "scope": scope,
                }
                changes[id_code] = []
            i += 1
            continue

        if line.startswith("#"):
            try:
                current_time = int(line[1:])
            except ValueError:
                pass
            i += 1
            continue

        if line.startswith("$"):
            i += 1
            continue

        if not line:
            i += 1
            continue

        # Value change: scalar (0x, 1x) or vector (b... id)
        if line.startswith(("b", "B")):
            parts = line.split()
            if len(parts) == 2:
                bits = parts[0][1:]  # strip the 'b'
                id_code = parts[1]
                if id_code in changes:
                    # Convert binary string to int
                    try:
                        val = int(bits.replace("x", "0").replace("z", "0"), 2)
                    except ValueError:
                        val = 0
                    changes[id_code].append([current_time, val])
        elif len(line) >= 2 and line[0] in "01xXzZ":
            val = 1 if line[0] == "1" else 0
            id_code = line[1:]
            if id_code in changes:
                changes[id_code].append([current_time, val])

        i += 1

    # Build output — skip internal cocotb/clock signals, keep DUT signals
    result_signals = []
    for id_code, info in signals.items():
        name = info["name"]
        # Skip VCD internal signals
        if name.startswith("$"):
            continue
        result_signals.append({
            "name": name,
            "width": info["width"],
            "values": changes.get(id_code, []),
        })

    return {
        "timescale": timescale,
        "end_time": current_time,
        "signals": result_signals,
    }


# ---------------------------------------------------------------------------
# Simulate endpoint
# ---------------------------------------------------------------------------

@app.post("/simulate", response_model=SimulateResponse)
async def simulate(req: SimulateRequest):
    """Compile design + testbench with iverilog, simulate with vvp, return VCD as JSON."""

    if not req.design.strip():
        raise HTTPException(status_code=400, detail="Design code is empty")
    if not req.testbench.strip():
        raise HTTPException(status_code=400, detail="Testbench code is empty")

    with tempfile.TemporaryDirectory(prefix="volta_sim_") as work_dir:
        design_path = os.path.join(work_dir, "design.v")
        tb_path = os.path.join(work_dir, "testbench.v")
        out_path = os.path.join(work_dir, "sim.out")
        vcd_path = os.path.join(work_dir, "dump.vcd")

        with open(design_path, "w") as f:
            f.write(req.design)
        with open(tb_path, "w") as f:
            f.write(req.testbench)

        # Compile with iverilog
        compile_r = subprocess.run(
            ["iverilog", "-o", out_path, design_path, tb_path],
            capture_output=True, text=True, timeout=30,
        )

        if compile_r.returncode != 0:
            return SimulateResponse(
                success=False,
                signals=[],
                timescale="1ns",
                end_time=0,
                stdout=compile_r.stdout,
                stderr=compile_r.stderr,
            )

        # Simulate with vvp
        sim_r = subprocess.run(
            ["vvp", out_path],
            capture_output=True, text=True, timeout=30,
            cwd=work_dir,
        )

        # Read VCD
        vcd_data = {"timescale": "1ns", "end_time": 0, "signals": []}
        if os.path.exists(vcd_path):
            with open(vcd_path) as f:
                vcd_text = f.read()
            vcd_data = parse_vcd(vcd_text)

        return SimulateResponse(
            success=True,
            signals=[VCDSignal(**s) for s in vcd_data["signals"]],
            timescale=vcd_data["timescale"],
            end_time=vcd_data["end_time"],
            stdout=sim_r.stdout,
            stderr=sim_r.stderr,
        )


# ---------------------------------------------------------------------------
# Generate endpoint — natural language → Verilog + testbench
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    prompt: str


class CorrectionInfo(BaseModel):
    ran: bool = False
    passed: bool = False
    attempts: int = 0
    errors_fixed: list[str] = []


class GenerateResponse(BaseModel):
    design: str
    testbench: str
    correction: Optional[CorrectionInfo] = None


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Generate Verilog design + testbench from a natural language prompt.

    Uses the orchestrator pipeline:
        1. Interpret prompt → structured DesignSpec (JSON)
        2. Build precise Verilog prompt from spec → generate Verilog
        3. Run correction engine (Yosys) to verify and auto-fix
        4. Generate Verilog testbench from spec test vectors
        5. Verify design + testbench compile with iverilog
    """

    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is empty")

    try:
        result = orchestrator_generate(req.prompt)
    except RuntimeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Generation failed: {e}. Is Ollama running?",
        )
    except Exception as e:
        logger.exception("Unexpected error in orchestrator")
        raise HTTPException(
            status_code=502,
            detail=f"Generation failed: {e}",
        )

    correction_data = result.get("correction", {})
    correction = CorrectionInfo(
        ran=correction_data.get("ran", False),
        passed=correction_data.get("passed", False),
        attempts=correction_data.get("attempts", 0),
        errors_fixed=correction_data.get("errors_fixed", []),
    )

    return GenerateResponse(
        design=result["design"],
        testbench=result["testbench"],
        correction=correction,
    )


# ---------------------------------------------------------------------------
# Chat endpoint — hardware design assistant
# ---------------------------------------------------------------------------

CHAT_SYSTEM_PROMPT = """You are Volta's hardware design assistant. You help users understand and improve their Verilog designs. You can explain how the design works, suggest optimizations, identify bugs, compare architectures, and answer questions about hardware/VLSI/semiconductor concepts.

You ONLY help with topics in: electrical engineering, computer engineering, computer science, ECE, VLSI, semiconductors, hardware design, Verilog/VHDL/SystemVerilog, digital logic, FPGAs, ASICs, chip design, and math relevant to these fields.

If the user's message is NOT about: electrical/computer engineering, VLSI, semiconductors, hardware design, Verilog/VHDL/SystemVerilog, digital logic, FPGAs, ASICs, chip design, or relevant math, you MUST respond with EXACTLY: 'Sorry, I cannot help you with this. I only assist with hardware design and related engineering topics.' Do not answer off-topic questions under any circumstances.

IMPORTANT RESPONSE RULES:
1) When the user asks for short/brief/concise responses, limit to 2-3 sentences maximum.
2) When the user asks for simple language, use everyday words and short sentences.
3) Respect the user's length preferences above all else.
4) Use markdown formatting: **bold** for emphasis, line breaks between paragraphs, and - for bullet points.
5) Never repeat yourself or pad responses."""


OFF_TOPIC_REFUSAL = (
    "Sorry, I cannot help you with this. "
    "I only assist with hardware design and related engineering topics."
)

OFF_TOPIC_KEYWORDS = re.compile(
    r'\b('
    r'actor|actress|movie|film|celebrity|bollywood|hollywood|'
    r'sports|cricket|football|basketball|soccer|tennis|baseball|'
    r'food|recipe|cooking|cook|bake|restaurant|'
    r'politics|politician|election|vote|government|'
    r'religion|god|church|temple|mosque|prayer|'
    r'weather|forecast|temperature|rain|'
    r'news|newspaper|headline|'
    r'dog|cat|pet|animal|puppy|kitten|'
    r'travel|vacation|holiday|hotel|flight|tourism|'
    r'music|song|singer|band|concert|album|'
    r'game|video game|gaming|playstation|xbox|nintendo|'
    r'dating|relationship|marriage|divorce|love|'
    r'money|investment|stock|crypto|bitcoin|trading|'
    r'fashion|clothes|shopping|beauty|makeup|'
    r'health|diet|weight|exercise|gym|yoga|'
    r'astrology|horoscope|zodiac|'
    r'joke|funny|meme|entertainment'
    r')\b',
    re.I,
)


# Functional descriptions for symbols WITHOUT truth tables
SYMBOL_DESCRIPTIONS = {
    "alu": "ALU: performs arithmetic (add, sub) and logic (AND, OR) operations on two N-bit inputs based on an opcode",
    "shifter": "Barrel Shifter: shifts input left or right by a specified amount in one clock cycle",
    "reg": "Register: stores N-bit data, updates on clock edge when enable is high",
    "ram": "RAM: read/write memory addressed by addr, synchronous write on clock edge with write enable",
    "rom": "ROM: read-only memory, output = stored data at address input",
    "regfile": "Register File: multiple registers with read/write ports, synchronous write, combinational read",
    "pc": "Program Counter: increments by instruction size on each clock, resets to 0",
    "ctrl": "Control Unit: decodes opcode into control signals for datapath",
    "imem": "Instruction Memory: combinational read, outputs instruction at program counter address",
    "dmem": "Data Memory: synchronous write, combinational or synchronous read",
    "sext": "Sign Extend: replicates MSB to fill upper bits, preserving signed value",
    "clkgen": "Clock Generator: produces periodic clock signal by toggling output",
    "mux8": "8:1 Multiplexer: selects one of 8 inputs based on 3-bit select",
    "demux2": "1:2 Demultiplexer: routes single input to one of 2 outputs based on select",
    "demux4": "1:4 Demultiplexer: routes single input to one of 4 outputs based on 2-bit select",
    "prienc": "Priority Encoder: outputs binary index of highest-priority active input",
}

# Behavior rules for symbol validation
SYMBOL_BEHAVIOR_RULES = {
    "and": "AND gate: output = boolean AND of all inputs. No sequential logic. All inputs must be declared.",
    "or": "OR gate: output = boolean OR of all inputs. No sequential logic.",
    "not": "NOT gate: output = boolean complement of input. Single input only.",
    "nand": "NAND gate: output = NOT(AND(inputs)). No sequential logic.",
    "nor": "NOR gate: output = NOT(OR(inputs)). No sequential logic.",
    "xor": "XOR gate: output = exclusive OR. No sequential logic.",
    "xnor": "XNOR gate: output = NOT(XOR(inputs)). No sequential logic.",
    "buffer": "Buffer: output = input. No inversion.",
    "tristate": "Tri-state buffer: output = input when enable high, high-Z when enable low.",
    "mux2": "2:1 MUX: output = in0 when sel=0, in1 when sel=1. Purely combinational.",
    "mux4": "4:1 MUX: output = selected input based on 2-bit select. Purely combinational.",
    "dff": "D flip-flop: Q follows D on clock edge. Must have clock input. Reset optional but must be async/sync as specified.",
    "jkff": "JK flip-flop: J=K=0 hold, J=0 K=1 reset, J=1 K=0 set, J=K=1 toggle. Must have clock.",
    "tff": "T flip-flop: T=0 hold, T=1 toggle. Must have clock.",
    "srlatch": "SR latch: S=1 sets Q, R=1 resets Q, S=R=1 is invalid.",
    "dec24": "2:4 Decoder: one-hot output based on 2-bit input address.",
    "fulladd": "Full Adder: {cout, sum} = a + b + cin. Purely combinational.",
    "halfadd": "Half Adder: sum = a XOR b, cout = a AND b. Purely combinational.",
    "cmp": "Comparator: gt=(a>b), eq=(a==b), lt=(a<b). Purely combinational.",
    "alu": "ALU: requires two operands and an opcode. Output depends on opcode. Needs operand sources.",
    "ram": "RAM: requires address, data input, write enable, and clock for synchronous write.",
    "rom": "ROM: requires address input. Read-only, no write port.",
    "regfile": "Register File: requires read/write addresses, write data, write enable, and clock.",
    "pc": "Program Counter: sequential, increments on clock edge. Needs clock and reset.",
    "reg": "Register: sequential, stores data on clock edge when enable is high. Needs clock.",
}

VALIDATION_KEYWORDS = re.compile(
    r'\b(explain|correct|work|valid|truth.?table|check|verify|logic|wrong|bug|error|fix|issue)\b',
    re.I,
)


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class SimSignalSummary(BaseModel):
    name: str
    width: int = 1
    values: list[list] = []  # [[time, value], ...]


class SimulationData(BaseModel):
    signals: list[SimSignalSummary] = []
    stdout: str = ""
    stderr: str = ""


class TruthTableData(BaseModel):
    headers: list[str] = []
    rows: list[list[str]] = []


class SelectedSymbolData(BaseModel):
    name: str = ""
    promptText: str = ""
    truthTable: Optional[TruthTableData] = None


class ChatRequest(BaseModel):
    message: str
    design: str = ""
    testbench: str = ""
    history: list[ChatMessage] = []
    simulation: Optional[SimulationData] = None
    selectedSymbols: list[SelectedSymbolData] = []


class ChatResponse(BaseModel):
    response: str


SHORT_KEYWORDS = re.compile(
    r'\b(short|brief|simple|concise|tldr|tl;dr|summary|quickly|shorter'
    r'|in \d+ sentences?|one sentence|two sentences?|three sentences?)\b',
    re.I,
)

SHORT_INSTRUCTION = (
    "CRITICAL: Respond in 3-4 short sentences. Cover: what it is, "
    "what it does, and key inputs/outputs. Use plain language.\n\n"
)

SHORT_FOLLOWUP_INSTRUCTION = (
    "CRITICAL: Continue the SAME topic as your previous response. "
    "Respond in 3-4 short sentences about that same topic. "
    "Use plain language. Do not start over or change subjects.\n\n"
)


def _truncate_short(text: str) -> str:
    """List-aware truncation for short mode.

    Splits response into blocks (paragraphs and bullet lists treated as
    atomic units). Returns the first 1-2 blocks, never cutting mid-list.
    Falls back to sentence-based truncation if no lists are found.
    Hard cap at 600 chars.
    """

    CHAR_CAP = 600
    text = text.strip()

    if len(text) <= CHAR_CAP:
        return text

    # Split into lines and group into blocks:
    # consecutive bullet/numbered lines = one block, paragraphs = separate blocks
    lines = text.split("\n")
    blocks = []
    current_block = []
    in_list = False

    for line in lines:
        stripped = line.strip()
        is_bullet = bool(re.match(r'^[-*\u2022]\s|^\d+[.)]\s', stripped))

        if not stripped:
            # Empty line = block separator (unless inside a list)
            if current_block:
                blocks.append("\n".join(current_block))
                current_block = []
                in_list = False
            continue

        if is_bullet:
            if not in_list and current_block:
                # Previous non-list content is its own block
                blocks.append("\n".join(current_block))
                current_block = []
            in_list = True
            current_block.append(line)
        else:
            if in_list and current_block:
                # End of list block
                blocks.append("\n".join(current_block))
                current_block = []
                in_list = False
            current_block.append(line)

    if current_block:
        blocks.append("\n".join(current_block))

    if not blocks:
        return text[:CHAR_CAP]

    # Take first 1-2 blocks that fit within char cap
    result = blocks[0]
    if len(blocks) > 1:
        candidate = result + "\n\n" + blocks[1]
        if len(candidate) <= CHAR_CAP:
            result = candidate

    # If result exceeds cap, trim back to just the first block
    if len(result) > CHAR_CAP:
        result = blocks[0]

    # If still too long (single giant block), fall back to sentence truncation
    if len(result) > CHAR_CAP:
        result = _truncate_to_sentences(result, max_sentences=5)

    return result.strip()


def _truncate_to_sentences(text: str, max_sentences: int = 5) -> str:
    """Sentence-based truncation fallback.

    Splits on sentence-ending punctuation. Used when no list structure
    is detected or as fallback for oversized single blocks.
    """

    # Remove code blocks to avoid counting sentences inside them
    code_blocks = []
    stripped = text
    for m in re.finditer(r'```.*?```', text, re.DOTALL):
        code_blocks.append(m.group())
        stripped = stripped.replace(m.group(), ' __CODE_BLOCK__ ', 1)

    parts = re.split(r'(?<=[.!?])\s+', stripped.strip())
    if len(parts) <= max_sentences:
        return text

    truncated = " ".join(parts[:max_sentences])

    if truncated and truncated[-1] not in ".!?":
        truncated += "."

    for block in code_blocks:
        if "__CODE_BLOCK__" in truncated:
            truncated = truncated.replace("__CODE_BLOCK__", block, 1)

    return truncated.strip()


def _build_simulation_summary(sim: SimulationData) -> str:
    """Build a concise summary of simulation results for the chat context.

    Limits output to ~500 tokens worth of info to avoid blowing up context.
    """

    lines = ["Current simulation results:"]
    char_budget = 1500  # ~500 tokens worth of characters
    used = 0

    for sig in sim.signals:
        if used > char_budget:
            lines.append("... (additional signals omitted for brevity)")
            break

        # Extract unique values and their times
        if not sig.values:
            continue

        # Show up to 12 transitions per signal
        transitions = sig.values[:12]
        values = [v[1] for v in transitions]
        times = [v[0] for v in transitions]

        if sig.width == 1:
            # Single-bit: show as 0/1 transitions
            trans_str = ", ".join(f"t={t}: {v}" for t, v in transitions)
        else:
            # Multi-bit: show as decimal/hex
            if sig.width <= 4:
                trans_str = ", ".join(f"t={t}: {v}" for t, v in transitions)
            else:
                trans_str = ", ".join(
                    f"t={t}: 0x{v:X}" for t, v in transitions
                )

        line = f"- Signal '{sig.name}' (width {sig.width}): {trans_str}"
        if len(sig.values) > 12:
            line += f" ... ({len(sig.values)} total transitions)"
        lines.append(line)
        used += len(line)

    # Add console output (trimmed)
    if sim.stdout and sim.stdout.strip():
        stdout_trimmed = sim.stdout.strip()[:500]
        lines.append(f"\nConsole output:\n{stdout_trimmed}")
    if sim.stderr and sim.stderr.strip():
        stderr_trimmed = sim.stderr.strip()[:200]
        lines.append(f"\nConsole errors:\n{stderr_trimmed}")

    return "\n".join(lines)


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Chat with Volta's hardware design assistant."""

    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is empty")

    # Pre-Ollama keyword filter: refuse off-topic questions immediately
    # Bypass when user has hardware context (selected symbols or design code)
    has_hw_context = bool(req.selectedSymbols) or bool(req.design.strip())
    if not has_hw_context and OFF_TOPIC_KEYWORDS.search(req.message):
        return ChatResponse(response=OFF_TOPIC_REFUSAL)

    # Detect if user wants a short response
    wants_short = bool(SHORT_KEYWORDS.search(req.message))
    max_tokens = 300 if wants_short else 800

    # Build context with current design code
    context_parts = [CHAT_SYSTEM_PROMPT]
    if req.design.strip():
        context_parts.append(f"\nCurrent Verilog design:\n```verilog\n{req.design}\n```")
    if req.testbench.strip():
        context_parts.append(f"\nCurrent testbench:\n```verilog\n{req.testbench}\n```")
    if req.simulation and req.simulation.signals:
        sim_summary = _build_simulation_summary(req.simulation)
        context_parts.append(f"\n{sim_summary}")

    # Inject context for ALL selected symbols
    selected = req.selectedSymbols or []
    if selected:
        sym_names = [s.name for s in selected]
        context_parts.append(f"\nSelected components: {', '.join(sym_names)}")

        for sym in selected:
            sym_id = sym.name.lower().replace(' ', '').replace('-', '')
            # Try to find matching id in behavior rules
            rule_id = None
            for rid in SYMBOL_BEHAVIOR_RULES:
                if rid in sym_id or sym_id in rid:
                    rule_id = rid
                    break

            if sym.truthTable and sym.truthTable.headers:
                # Symbol with truth table: include formatted table
                tt = sym.truthTable
                tt_lines = [" | ".join(tt.headers)]
                tt_lines.append(" | ".join(["---"] * len(tt.headers)))
                for row in tt.rows:
                    tt_lines.append(" | ".join(row))
                tt_text = "\n".join(tt_lines)
                context_parts.append(
                    f"\n{sym.name} truth table:\n{tt_text}"
                )
            else:
                # Symbol without truth table: include functional description
                desc = None
                for did, dtxt in SYMBOL_DESCRIPTIONS.items():
                    if did in sym_id or sym_id in did:
                        desc = dtxt
                        break
                if desc:
                    context_parts.append(f"\n{sym.name}: {desc}")

            # Include behavior rules
            if rule_id and rule_id in SYMBOL_BEHAVIOR_RULES:
                context_parts.append(f"Rule for {sym.name}: {SYMBOL_BEHAVIOR_RULES[rule_id]}")

        # Validation directive when user asks about correctness
        if VALIDATION_KEYWORDS.search(req.message):
            context_parts.append(
                f"\nVALIDATION MODE: The user has selected these components: {', '.join(sym_names)}. "
                f"When responding:\n"
                f"1. First, check if the combination forms a coherent circuit. If not, explain why and suggest fixes.\n"
                f"2. Second, verify the generated Verilog matches the expected behavior of each component "
                f"using truth tables where available, or standard functional behavior otherwise.\n"
                f"3. Be explicit: say 'CORRECT' or 'INCORRECT' for each claim. Don't be vague.\n"
                f"4. If the design is illogical or mathematically wrong, say so directly — do not pretend it works.\n"
                f"5. Check: sequential elements (flip-flops, counters, registers, RAM) need a clock source. "
                f"ALU needs operand sources. Memory needs addressing logic."
            )
        else:
            context_parts.append(
                f"\nWhen explaining, reference truth tables to verify logic and explain "
                f"how the Verilog implements each component's expected behavior."
            )

    system_context = "\n".join(context_parts)

    # Build conversation — include last 3 exchanges for context
    conversation = system_context + "\n\n"
    recent_history = req.history[-6:]  # last 3 exchanges = 6 messages
    for msg in recent_history:
        prefix = "User" if msg.role == "user" else "Assistant"
        conversation += f"{prefix}: {msg.content}\n\n"

    # Prepend short instruction if length keywords detected
    user_message = req.message
    if wants_short:
        word_count = len(user_message.split())
        is_followup = word_count < 10 and req.history

        if is_followup:
            # Find the last assistant message to extract its topic
            last_assistant = ""
            for msg in reversed(req.history):
                if msg.role == "assistant":
                    last_assistant = msg.content[:200]
                    break
            conversation += SHORT_FOLLOWUP_INSTRUCTION
            if last_assistant:
                conversation += (
                    f"Your previous response was about: {last_assistant}\n"
                    f"Rephrase that SAME topic in 2-3 simple sentences.\n\n"
                )
        else:
            conversation += SHORT_INSTRUCTION
    conversation += f"User: {user_message}\n\nAssistant:"

    try:
        import requests as http_requests
        resp = http_requests.post("http://localhost:11434/api/generate", json={
            "model": "qwen2.5-coder:7b",
            "prompt": conversation,
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": max_tokens},
        }, timeout=120)
        resp.raise_for_status()
        reply = resp.json()["response"].strip()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Chat failed: {e}. Is Ollama running?",
        )

    # Strip model special tokens (Qwen, CodeLlama, etc.)
    for token in [
        "<|EOT|>", "<|endoftext|>",
        "<|begin_of_sentence|>", "<|end_of_sentence|>",
        "<\uff5cend\u2581of\u2581sentence\uff5c>",
        "<\uff5cbegin\u2581of\u2581sentence\uff5c>",
    ]:
        reply = reply.replace(token, "")
    # Case-insensitive fallback for any remaining variants
    reply = re.sub(r'<\|?(?:EOT|endoftext|begin_of_sentence|end_of_sentence)\|?>', '', reply, flags=re.I)
    reply = reply.strip()

    # Post-Ollama filter: if the model answered an off-topic question anyway,
    # override with refusal. Skip when hardware context exists.
    if not has_hw_context:
        hw_terms = re.compile(
            r'\b(verilog|module|wire|reg|signal|clock|reset|flip.?flop|gate|'
            r'register|counter|alu|mux|fpga|asic|rtl|synthesis|testbench|'
            r'simulation|waveform|port|bit|bus|latch|combinational|sequential|'
            r'truth.?table|logic|circuit|decoder|encoder|memory|ram|rom|'
            r'schematic|timing|correct|incorrect)\b',
            re.I,
        )
        if len(reply) > 50 and not hw_terms.search(reply):
            reply = OFF_TOPIC_REFUSAL

    # Hard-truncate to 2 sentences when short mode is requested
    if wants_short:
        reply = _truncate_short(reply)

    return ChatResponse(response=reply)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
