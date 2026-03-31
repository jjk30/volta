"""
Volta — Backend API
FastAPI server with POST /simulate and POST /generate endpoints.
/simulate — compile + simulate Verilog with Icarus Verilog, return VCD as JSON.
/generate — take a natural-language prompt, generate Verilog + testbench via Ollama.
             Runs the correction engine (Yosys) to auto-fix errors before returning.
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
from rtl_generator import call_ollama, extract_verilog
from correction_engine import correct as correct_verilog, run_yosys

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


def _generate_verilog(prompt: str) -> str:
    """Ask Ollama to generate Verilog from a natural language prompt."""

    system_prompt = f"""You are an expert Verilog designer. Given the following request,
generate synthesizable Verilog code.

Rules:
1. Use `always @(*)` for combinational logic, `always @(posedge clk)` for sequential.
2. Outputs driven inside always blocks must be declared as `reg`.
3. Include a default case in any case statement.
4. Module name should be a short, descriptive identifier derived from the request.
5. Return ONLY Verilog. Start with `module` and end with `endmodule`. No explanation.

Request: {prompt}"""

    raw = call_ollama(system_prompt)
    # Try to extract a clean module
    code = raw.strip()
    if "```" in code:
        parts = code.split("```")
        for part in parts[1::2]:
            lines = part.strip().split("\n")
            if lines and lines[0].strip().lower() in ("verilog", "v", "sv", ""):
                part = "\n".join(lines[1:])
            if "module" in part:
                code = part.strip()
                break

    start = code.find("module ")
    if start != -1:
        code = code[start:]
    end = code.rfind("endmodule")
    if end != -1:
        code = code[:end + len("endmodule")]
    return code.strip()


def _extract_module_info(verilog: str) -> dict:
    """Parse module name, ports from Verilog code for testbench generation."""

    # Module name
    m = re.match(r"module\s+(\w+)", verilog)
    module_name = m.group(1) if m else "top"

    # Ports — find all input/output declarations
    ports = []
    for line in verilog.split("\n"):
        line = line.strip().rstrip(",").rstrip(");")
        pm = re.match(
            r"(input|output)\s+(?:reg\s+)?(?:wire\s+)?(\[[\d:]+\]\s+)?(\w+)",
            line,
        )
        if pm:
            direction = pm.group(1)
            width_str = pm.group(2)
            name = pm.group(3)
            if width_str:
                wm = re.match(r"\[(\d+):(\d+)\]", width_str.strip())
                width = int(wm.group(1)) - int(wm.group(2)) + 1 if wm else 1
            else:
                width = 1
            ports.append({"name": name, "direction": direction, "width": width})

    return {"name": module_name, "ports": ports}


def _generate_testbench(verilog: str, prompt: str) -> str:
    """Ask Ollama to generate a Verilog testbench with VCD dump."""

    info = _extract_module_info(verilog)
    module_name = info["name"]
    port_lines = []
    for p in info["ports"]:
        w = f"[{p['width']-1}:0] " if p["width"] > 1 else ""
        port_lines.append(f"  {p['direction']} {w}{p['name']}")

    tb_prompt = f"""Write a Verilog testbench for the following module.

Module name: {module_name}
Ports:
{chr(10).join(port_lines)}

Original design intent: {prompt}

Rules:
1. Module name must be `tb_{module_name}` (no ports).
2. Declare all inputs as `reg`, all outputs as `wire`.
3. Instantiate the DUT as `uut`.
4. Include `$dumpfile("dump.vcd");` and `$dumpvars(0, tb_{module_name});` in an initial block.
5. Write at least 4 meaningful test cases with $display statements showing input → output.
6. End with `$finish;`.
7. Use `#10;` delays between test vectors.
8. Return ONLY Verilog. Start with `module` and end with `endmodule`. No explanation."""

    raw = call_ollama(tb_prompt)
    code = raw.strip()

    # Extract clean Verilog
    if "```" in code:
        parts = code.split("```")
        for part in parts[1::2]:
            lines = part.strip().split("\n")
            if lines and lines[0].strip().lower() in ("verilog", "v", "sv", ""):
                part = "\n".join(lines[1:])
            if "module" in part:
                code = part.strip()
                break

    start = code.find("module ")
    if start != -1:
        code = code[start:]
    end = code.rfind("endmodule")
    if end != -1:
        code = code[:end + len("endmodule")]

    # Ensure VCD dump is present — inject if missing
    if "$dumpfile" not in code:
        inject = (
            f'\n  initial begin\n'
            f'    $dumpfile("dump.vcd");\n'
            f'    $dumpvars(0, tb_{module_name});\n'
            f'  end\n'
        )
        idx = code.find("\n", code.find(module_name))
        if idx != -1:
            code = code[:idx+1] + inject + code[idx+1:]

    return code.strip()


def _verify_compile(design: str, testbench: str) -> tuple[bool, str]:
    """Quick iverilog compile check for design + testbench together.

    Returns (ok, stderr).
    """

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
            # iverilog not installed — skip check
            return True, ""
        except subprocess.TimeoutExpired:
            return False, "iverilog timed out"


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Generate Verilog design + testbench from a natural language prompt.

    Pipeline:
        1. Generate Verilog from the prompt via Ollama.
        2. Run the correction engine (Yosys) to detect and auto-fix errors.
        3. Generate a testbench that matches the *corrected* design.
        4. Verify the pair compiles with iverilog; regenerate testbench if not.
    """

    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is empty")

    # ------------------------------------------------------------------
    # Step 1: Generate raw Verilog
    # ------------------------------------------------------------------
    try:
        design = _generate_verilog(req.prompt)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate design: {e}. Is Ollama running?",
        )

    if not design or "module" not in design:
        raise HTTPException(
            status_code=502,
            detail="Ollama returned invalid Verilog. Try rephrasing the prompt.",
        )

    logger.info("Raw Verilog generated (%d chars)", len(design))

    # ------------------------------------------------------------------
    # Step 2: Run correction engine — auto-fix until Yosys passes
    # ------------------------------------------------------------------
    correction = CorrectionInfo(ran=False)

    try:
        synth = run_yosys(design)

        if not synth.success:
            logger.info(
                "Yosys found %d error(s) — running correction engine",
                len(synth.errors),
            )
            initial_errors = list(synth.errors)
            result = correct_verilog(design)

            correction = CorrectionInfo(
                ran=True,
                passed=result["passed"],
                attempts=result["attempts"],
                errors_fixed=initial_errors,
            )

            if result["passed"]:
                design = result["final_code"]
                logger.info(
                    "Correction engine fixed the code in %d attempt(s)",
                    result["attempts"],
                )
            else:
                # Use whatever the engine produced — best effort
                design = result["final_code"]
                logger.warning(
                    "Correction engine could not fully fix the code after %d attempts",
                    result["attempts"],
                )
        else:
            logger.info("Yosys passed on first try — no correction needed")
            correction = CorrectionInfo(ran=True, passed=True, attempts=1)
    except Exception as e:
        # Yosys/correction failure is non-fatal — still return the raw code
        logger.warning("Correction engine error (non-fatal): %s", e)

    # ------------------------------------------------------------------
    # Step 3: Generate testbench from the *corrected* design
    # ------------------------------------------------------------------
    try:
        testbench = _generate_testbench(design, req.prompt)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate testbench: {e}",
        )

    # ------------------------------------------------------------------
    # Step 4: Verify the pair compiles with iverilog — retry testbench once
    # ------------------------------------------------------------------
    ok, stderr = _verify_compile(design, testbench)
    if not ok:
        logger.info("iverilog compile failed — regenerating testbench")
        logger.info("iverilog stderr: %s", stderr[:500])
        try:
            testbench = _generate_testbench(design, req.prompt)
            ok2, _ = _verify_compile(design, testbench)
            if not ok2:
                logger.warning("Testbench still fails iverilog after retry")
        except Exception:
            pass  # keep the best testbench we have

    return GenerateResponse(
        design=design,
        testbench=testbench,
        correction=correction,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
