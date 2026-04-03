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


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
